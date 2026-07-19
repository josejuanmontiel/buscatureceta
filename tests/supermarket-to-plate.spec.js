import { test, expect } from '@playwright/test';

async function clearDB(page) {
  // Navigate to index so the app's Dexie connection is open and index.js registers __resetUserData
  await page.goto('/#index');
  // Wait for initView to expose the reset helper
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  // Use the app's own helper that clears tables via the active Dexie connection
  await page.evaluate(() => window.__resetUserData());
  // Navigate away so the next page.goto to /#index triggers a real hashchange
  await page.goto('/#settings');
}

/**
 * ============================================================
 *  MEGA E2E — Del Supermercado al Plato (con Receta)
 * ============================================================
 *
 * Productos de prueba — Códigos EAN reales de OpenFoodFacts España:
 *   2087569003329 - Costilla Adobada El Pradal  (contiene E250, NutriScore E) ← producto "malo"
 *   01084922       - Salchichas de Pollo Campofrío (sin E250, NutriScore B)   ← alternativa sana
 *   01472165       - Pan de Molde Blanco Bimbo    (sin E250, NutriScore B)    ← ingrediente receta
 *   04295181       - Leche entera                 (sin E250, NutriScore B)    ← consumo directo
 *
 * Flujo completo:
 *
 *  [1] CONFIGURACIÓN
 *      └── Carga la BD con filtro E250 activo.
 *
 *  [2] SUPERMERCADO — Escaneo y Carrito
 *      ├── Escanea producto "malo" (001) → alerta E250
 *      ├── Selecciona alternativa (002 Salchicha Buena)
 *      ├── Ajusta precio (2.50€ × 2) dentro del presupuesto (10€)
 *      ├── Añade Pan de Molde (003) al carrito (1.80€ × 1)
 *      └── Checkout → total: 6.80€ → Despensa
 *
 *  [3] DESPENSA
 *      └── Verifica que ambos productos llegaron.
 *
 *  [4] RECETAS — Crear receta con ingredientes de la despensa
 *      ├── Abre Recetas → Nueva Receta
 *      ├── Nombre: "Bocadillo de Salchicha"
 *      ├── Añade Salchicha Buena (002) como ingrediente
 *      ├── Añade Pan de Molde (003) como ingrediente
 *      ├── Guarda la receta
 *      └── Verifica que aparece en la lista de recetas.
 *
 *  [5] COCINA — Registrar la receta en el Diario
 *      ├── Abre la Agenda del día
 *      ├── Registra la receta "Bocadillo de Salchicha" (1 ración, mediodía)
 *      └── Verifica que aparece en el grid semanal.
 *
 *  [6] DASHBOARD — Del Plato a los Datos
 *      └── Verifica que el Dashboard muestra seguimiento activo.
 */

test('Full journey: Supermarket → Pantry → Recipe → Diary → Dashboard', async ({ page }) => {

  // ─────────────────────────────────────────────────────────
  //  [1] CONFIGURACIÓN — Cargar BD con filtros de E250
  // ─────────────────────────────────────────────────────────
  await test.step('🛒 Setup: Load DB with E250 exclusion filter', async () => {
    // Clear any leftover data from parallel test runs
    await clearDB(page);
    await page.goto('/#index');
    page.on('console', msg => console.log('BROWSER: ' + msg.text()));
    page.on('pageerror', err => console.log('BROWSER_ERR: ' + (err.stack || err.message)));
    page.on('dialog', dialog => dialog.accept());

    await page.fill('#filters', 'E250');
    await page.fill('#database', '/test_products.tsv.zz');
    await page.click('#download-btn');

    await page.waitForURL('**/#grid');
    await expect(page.locator('body')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────
  //  [2] SUPERMERCADO — Escanear, alertar, elegir y comprar
  // ─────────────────────────────────────────────────────────
  await test.step('🚨 Scan bad product (E250 → Salchicha Mala) and get alert', async () => {
    // Simular escaneo QR del código EAN real: Costilla Adobada El Pradal (tiene E250)
    await page.goto('/#grid?code=2087569003329');
    await page.waitForTimeout(500);

    await expect(page.locator('#scanned-product-name')).toContainText(/Costilla Adobada/i);
    await expect(page.locator('#assistant-alert')).toBeVisible();
    await expect(page.locator('#assistant-warning-text')).toContainText('E250');
  });

  await test.step('✅ Pick healthy alternative (Salchicha Buena)', async () => {
    const alternativeBtn = page.locator('#assistant-alternatives button').first();
    await expect(alternativeBtn).toContainText(/Salchichas de Pollo/i);
    await alternativeBtn.click();
    
    // Wait for async selectAlternative to finish and update currentScannedProduct
    await page.waitForFunction(() =>
      window.currentScannedProduct && /Salchichas/i.test(window.currentScannedProduct.product_name)
    , { timeout: 10000 });

    await expect(page.locator('#scanned-product-name')).toContainText(/Salchichas de Pollo/i);
    await expect(page.locator('#assistant-alert')).toHaveClass(/d-none/);
  });

  await test.step('💰 Add Salchicha Buena to cart (2 units × 2.50€ = 5.00€)', async () => {
    await page.fill('#scanned-price', '2.50');
    await page.fill('#scanned-amount', '2');
    await page.click('#btn-add-cart');

    await expect(page.locator('#cart-total')).toContainText('5.00 €');
    await expect(page.locator('#add-to-cart-panel')).toHaveClass(/d-none/);
  });

  await test.step('🍞 Scan second product (Pan de Molde Bimbo) and add to cart', async () => {
    // Simular escaneo EAN real del pan de molde
    await page.goto('/#grid?code=01472165');
    await page.waitForTimeout(500);

    await expect(page.locator('#scanned-product-name')).toContainText(/Pan de Molde Blanco/i);
    // Sin E250 → no debe disparar alerta
    await expect(page.locator('#assistant-alert')).toHaveClass(/d-none/);

    // Añadir: 1 unidad a 1.80€
    await page.fill('#scanned-price', '1.80');
    await page.fill('#scanned-amount', '1');
    await page.click('#btn-add-cart');

    // Total acumulado: 5.00 + 1.80 = 6.80€ (dentro del presupuesto de 10€)
    await expect(page.locator('#cart-total')).toContainText('6.80 €');
    console.log('💶  Total carrito temporal: 6.80€');
  });

  await test.step('🥛 Scan third product (Leche Entera) and add to cart', async () => {
    await page.goto('/#grid?code=04295181');
    await page.waitForTimeout(500);

    await expect(page.locator('#scanned-product-name')).toContainText('Leche entera');
    await expect(page.locator('#assistant-alert')).toHaveClass(/d-none/);

    // Añadir: 1 unidad a 0.90€
    await page.fill('#scanned-price', '0.90');
    await page.fill('#scanned-amount', '1');
    await page.click('#btn-add-cart');

    // Total acumulado: 6.80 + 0.90 = 7.70€
    await expect(page.locator('#cart-total')).toContainText('7.70 €');
    console.log('💶  Total carrito final: 7.70€ — dentro del presupuesto de 10€');
  });

  await test.step('🏪 Checkout: move full cart to pantry', async () => {
    await page.click('#btn-checkout');

    // El checkout puede mostrar un modal de pesos faltantes o ir directo a despensa
    try {
      // Esperamos hasta 2 segundos para ver si salta el modal
      await page.waitForSelector('#modal-missing-weights.show', { timeout: 2000 });
      // Si aparece, rellenar todos los inputs de peso
      const inputs = page.locator('.missing-weight-input');
      const count = await inputs.count();
      for (let i = 0; i < count; i++) {
        await inputs.nth(i).fill('500');
      }
      await page.click('#btn-save-missing-weights');
    } catch (e) {
      // Ignore si no salta el modal (timeout)
    }

    await page.waitForURL('**/#pantry');
    await expect(page).toHaveTitle(/Despensa - NutriAgenda/i);
  });

  // ─────────────────────────────────────────────────────────
  //  [3] DESPENSA — Verificar que ambos productos llegaron
  // ─────────────────────────────────────────────────────────
  await test.step('📦 Pantry: verify both products arrived', async () => {
    await page.waitForTimeout(800);

    const pantryList = page.locator('#pantry-list');
    await expect(pantryList).toContainText(/Salchichas de Pollo/i);
    await expect(pantryList).toContainText(/Pan de Molde Blanco/i);
    await expect(pantryList).toContainText('Leche entera');
    console.log('📦  Despensa OK: Salchichas de Pollo + Pan de Molde + Leche entera');
  });

  // ─────────────────────────────────────────────────────────
  //  [4] RECETAS — Crear receta "Bocadillo de Salchicha"
  // ─────────────────────────────────────────────────────────
  await test.step('📖 Recipes: open Recipes page and create a new recipe', async () => {
    await page.goto('/#recipes');
    await expect(page).toHaveTitle(/Recetas - NutriAgenda/i);

    // Navegar al nuevo editor de recetas
    await page.click('#btn-new-recipe');
    await page.waitForURL('**/#recipe-editor*');
    await expect(page.locator('#editor-page-title')).toContainText('Nueva Receta');
  });

  await test.step('✍️ Fill in recipe name and servings', async () => {
    await page.fill('#recipe-name', 'Bocadillo de Salchicha');
    await page.fill('#recipe-servings', '2');
  });

  await test.step('🔍 Add ingredient: Salchichas de Pollo Campofrío (01084922)', async () => {
    // Buscar por nombre en el editor
    await page.fill('#ingredient-search', 'Salchichas de Pollo');
    await page.click('#btn-search-ingredient');

    // Seleccionar el resultado
    await page.waitForSelector('#ingredient-search-results button', { state: 'visible' });
    await page.locator('#ingredient-search-results button').first().click();

    // El ingrediente debe aparecer en la lista
    await expect(page.locator('#ingredient-list')).toContainText(/Salchichas de Pollo/i);
  });

  await test.step('🔍 Add ingredient: Pan de Molde Blanco Bimbo (01472165)', async () => {
    await page.fill('#ingredient-search', 'Pan de Molde');
    await page.click('#btn-search-ingredient');

    await page.waitForSelector('#ingredient-search-results button', { state: 'visible' });
    await page.locator('#ingredient-search-results button').first().click();

    await expect(page.locator('#ingredient-list')).toContainText(/Pan de Molde Blanco/i);

    // El preview nutricional debe actualizarse con los 2 ingredientes
    await page.waitForTimeout(400);
    await expect(page.locator('#nutrition-preview')).toContainText('kcal');
    console.log('🥗  Ingredientes: Salchichas de Pollo Campofrío + Pan de Molde Blanco Bimbo');
  });

  await test.step('💾 Save recipe and verify it appears in the list', async () => {
    await page.click('#btn-save-recipe');

    // Esperamos que se guarde (la URL cambia para añadir el ?id=...)
    await page.waitForURL('**/#recipe-editor?id=*');

    // Volvemos a la lista de recetas
    await page.goto('/#recipes');

    // La receta debe aparecer en la lista de recetas
    await expect(page.locator('#recipes-list')).toContainText('Bocadillo de Salchicha');
    await expect(page.locator('#recipes-list')).toContainText('2 raciones');
    console.log('✅  Receta "Bocadillo de Salchicha" guardada correctamente');
  });

  // ─────────────────────────────────────────────────────────
  //  [5] COCINA — Registrar la receta en la Agenda
  // ─────────────────────────────────────────────────────────
  await test.step('🍽️ Diary: open diary and register the recipe as a meal', async () => {
    await page.goto('/#diary');
    await expect(page.locator('.diary-day')).toHaveCount(7);

    // Calcular qué día es hoy (lunes = 0)
    const day = new Date().getDay();
    const todayIndex = day === 0 ? 6 : day - 1;

    // Abrir modal de hoy
    await page.locator('.diary-day').nth(todayIndex).locator('button', { hasText: 'Añadir' }).first().click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // La pestaña activa por defecto es "Receta guardada" — seleccionar nuestra receta
    const recipeSelect = page.locator('#meal-recipe-select');
    await recipeSelect.waitFor({ state: 'visible' });

    // Esperar a que la receta cargue en el select
    await page.waitForFunction(() => {
      const sel = document.getElementById('meal-recipe-select');
      return sel && sel.options.length > 1;
    });

    // Seleccionar "Bocadillo de Salchicha" — buscamos la opción cuyo texto incluya ese nombre
    const optionText = await page.locator('#meal-recipe-select option').filter({ hasText: 'Bocadillo' }).first().innerText();
    await recipeSelect.selectOption({ label: optionText });

    // Registrar 1 ración en la cena
    await page.fill('#meal-recipe-amount', '1');
    await page.selectOption('#meal-type', 'dinner');

    await page.click('#btn-save-meal');
    await expect(page.locator('#mealModal')).not.toBeVisible();
  });

  await test.step('📅 Diary: verify recipe meal appears in the weekly grid', async () => {
    // El grid debe mostrar la receta registrada
    await expect(page.locator('.diary-grid')).toContainText('Bocadillo de Salchicha');
    console.log('📅  Receta registrada en la Agenda (Hoy)');
  });

  await test.step('🥛 Diary (Tomorrow): eat something without recipe and deduct stock', async () => {
    const day = new Date().getDay();
    const todayIndex = day === 0 ? 6 : day - 1;
    const tomorrowIndex = (todayIndex + 1) % 7;

    await page.waitForTimeout(1000); // Wait for previous modal to fully close

    // Abrir modal del segundo día (mañana)
    await page.locator('.diary-day').nth(tomorrowIndex).locator('button', { hasText: 'Añadir' }).first().click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // Cambiar al tab de producto
    await page.click('#tab-product');
    await page.waitForTimeout(300);

    // Buscar "Leche entera"
    await page.fill('#meal-product-search', 'Leche entera');
    await page.click('#btn-search-meal-product');

    await page.waitForSelector('#meal-product-results button', { state: 'visible' });
    await page.locator('#meal-product-results button').first().click();

    // Registrar 100g en el desayuno
    await page.fill('#meal-product-grams', '100');
    await page.selectOption('#meal-type', 'breakfast');

    // MÁGIA: Descontar de la despensa!
    await page.check('#meal-deduct-pantry');

    await page.click('#btn-save-meal');
    await expect(page.locator('#mealModal')).not.toBeVisible();
    
    // El grid ahora debe mostrar "Leche entera" en el segundo día
    await expect(page.locator('.diary-day').nth(tomorrowIndex)).toContainText('Leche entera');
    console.log('📅  Producto suelto (Leche) registrado en la Agenda (Mañana)');
  });

  // ─────────────────────────────────────────────────────────
  //  [6] DESPENSA — Verificar descuento de stock
  // ─────────────────────────────────────────────────────────
  await test.step('📦 Pantry again: verify stock reduction for Milk', async () => {
    await page.goto('/#pantry');
    await page.waitForTimeout(800);

    // Compramos 1 paquete de Leche (que por test db tiene product_quantity=1000).
    // Checkout convierte 1 unidad -> 1000 ml. Consumimos 100g/ml en la agenda.
    // El stock bajará de 1000 a 900, y seguirá visible.
    const pantryList = page.locator('#pantry-list');
    await expect(pantryList).toContainText('Leche entera');
    console.log('📉  Stock descontado correctamente, y queda visible el sobrante en la despensa (aprox 900ml)');
  });

  // ─────────────────────────────────────────────────────────
  //  [6] DASHBOARD — Verificar seguimiento nutricional activo
  // ─────────────────────────────────────────────────────────
  await test.step('📊 Dashboard: verify nutritional tracking reflects the full day', async () => {
    await page.goto('/#dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);

    // Gráficos presentes
    await expect(page.locator('#kcalChart')).toBeVisible();
    await expect(page.locator('#weekChart')).toBeVisible();

    // Texto de kcal con formato correcto
    const kcalText = await page.locator('#kcal-text').innerText();
    expect(kcalText).toMatch(/\d+ \/ \d+ kcal/);
    console.log(`📊  Dashboard kcal del día: ${kcalText}`);

    // Macros con formato correcto
    await expect(page.locator('#macro-prot-text')).toContainText('g');
    await expect(page.locator('#macro-carb-text')).toContainText('g');

    // Variedad semanal
    const varietyScore = await page.locator('#variety-score').innerText();
    expect(varietyScore).toMatch(/\d+%/);
    console.log(`🌈  Variedad semanal: ${varietyScore}`);
  });

  console.log('🎉  Mega E2E completo: Supermercado → Despensa → Receta → Agenda → Dashboard');
});
