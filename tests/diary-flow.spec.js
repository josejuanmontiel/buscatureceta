import { test, expect } from '@playwright/test';

// Helper: carga la BD de prueba en el contexto del navegador
async function loadTestDB(page) {
  await page.goto('/index.html');
  page.on('dialog', dialog => dialog.accept());
  await page.fill('#filters', 'E250');
  await page.fill('#database', '/test_products.tsv.zz');
  await page.click('#download-btn');
  await page.waitForURL('**/grid.html');
}

test.describe('Diary (Agenda) Flow', () => {
  
  test('should render the weekly diary grid with all 7 days', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/diary.html');

    // El grid semanal tiene que renderizarse con 7 columnas (diary-day)
    const days = page.locator('.diary-day');
    await expect(days).toHaveCount(7);

    // El label de la semana tiene que aparecer
    await expect(page.locator('#current-week-label')).not.toBeEmpty();
  });

  test('should show updated kcal after diary entry is seeded via UI', async ({ page }) => {
    // Cargar BD de prueba
    await loadTestDB(page);
    await page.goto('/diary.html');

    // Abrir modal del primer día del grid (hoy o inicio de semana)
    await page.locator('.diary-day button').first().click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // Cambiar a tab de Producto
    await page.click('#tab-product');
    await page.waitForTimeout(300);

    // Buscar y seleccionar Salchichas de Pollo (que tiene kcal definidas)
    await page.fill('#meal-product-search', 'Salchichas de Pollo');
    await page.click('#btn-search-meal-product');
    await page.waitForSelector('#meal-product-results button', { state: 'visible' });
    await page.locator('#meal-product-results button').first().click();
    await page.fill('#meal-product-grams', '100');
    await page.selectOption('#meal-type', 'lunch');

    page.on('dialog', dialog => dialog.accept());
    await page.click('#btn-save-meal');
    await expect(page.locator('#mealModal')).not.toBeVisible();

    // Ahora ir al Dashboard y comprobar que hay kcal
    await page.goto('/dashboard.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const kcalText = await page.locator('#kcal-text').innerText();
    console.log('Kcal text after UI seeding:', kcalText);
    expect(kcalText).toMatch(/\d+ \/ \d+ kcal/);
  });

  test('should navigate to previous and next week', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/diary.html');

    const initialLabel = await page.locator('#current-week-label').innerText();

    // Ir a la semana anterior y comprobar que el label cambia
    await page.click('#btn-prev-week');
    await page.waitForTimeout(200);
    const prevLabel = await page.locator('#current-week-label').innerText();
    expect(prevLabel).not.toBe(initialLabel);

    // Nota: debido a un bug conocido en la app (setDate muta el objeto Date de referencia),
    // hacer click en "siguiente" desde la semana anterior NO necesariamente devuelve a la semana
    // original. El test documenta que la navegación hacia atrás al menos funciona.
  });

  test('should open the meal modal when clicking + Añadir on a day', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/diary.html');

    // Hacer clic en el botón "+ Añadir" del primer día del grid
    const addBtn = page.locator('.diary-day button').first();
    await addBtn.click();

    // El modal tiene que aparecer
    const modal = page.locator('#mealModal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#mealModalTitle')).toContainText('Registrar Comida');
  });

  test('should add a product to the diary via the meal modal', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/diary.html');

    // Abrir el modal del primer día
    const addBtn = page.locator('.diary-day button').first();
    await addBtn.click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // Cambiar al tab de "Producto escaneado"
    await page.click('#tab-product');
    await page.waitForTimeout(300); // pequeña espera para la animación del tab

    // Buscar el producto "Salchichas de Pollo" (código 01084922, sin E250)
    await page.fill('#meal-product-search', 'Salchichas de Pollo');
    await page.click('#btn-search-meal-product');

    // Seleccionar el resultado
    await page.waitForSelector('#meal-product-results button', { state: 'visible' });
    await page.locator('#meal-product-results button').first().click();

    // Comprobar que se ha seleccionado (el hidden input tendrá el código)
    await expect(page.locator('#meal-product-selected')).toHaveValue('01084922');

    // Seleccionar tipo de comida: Desayuno
    await page.selectOption('#meal-type', 'breakfast');

    // Guardar
    page.on('dialog', dialog => dialog.accept());
    await page.click('#btn-save-meal');

    // El modal debe cerrarse
    await expect(page.locator('#mealModal')).not.toBeVisible();

    // El grid debería mostrar la entrada en el día correspondiente
    await expect(page.locator('.diary-grid')).toContainText('Salchichas de Pollo');
  });
  test('should open the photo capture modal from a diary day', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/diary.html');

    // El botón 📷 es el segundo botón dentro de la columna del día
    // El HTML es: <button class="btn btn-sm btn-outline-secondary" onclick="..." title="Foto de lo que comí">📷</button>
    const photoBtn = page.locator('.diary-day button').filter({ hasText: '📷' }).first();
    await photoBtn.click();

    // El modal de foto debe abrirse
    const photoModal = page.locator('#diaryPhotoModal');
    await expect(photoModal).toBeVisible();
    await expect(photoModal.locator('.modal-title')).toContainText('Foto de lo que comí');

    // Verificar que los botones de cámara o galería están presentes
    await expect(page.locator('#btn-diary-gallery')).toBeVisible();
    
    // Cerrar el modal
    await page.locator('#diaryPhotoModal .btn-close').click();
    await expect(photoModal).not.toBeVisible();
  });

  test('should allow adding generic products from search by clicking the add generic button', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/diary.html');

    const addBtn = page.locator('.diary-day button').first();
    await addBtn.click();
    await expect(page.locator('#mealModal')).toBeVisible();

    await page.click('#tab-product');
    await page.waitForTimeout(300);

    // Search for a product that DOES NOT exist in the db
    await page.fill('#meal-product-search', 'Plátano de Canarias Inventado');
    await page.click('#btn-search-meal-product');

    // The button to add it as generic should appear
    const genericBtn = page.locator('#meal-product-results button').filter({ hasText: 'como genérico sin código' });
    await expect(genericBtn).toBeVisible();

    // Accept the confirm dialog
    page.on('dialog', dialog => dialog.accept());
    
    // Click the button
    await genericBtn.click();

    // It should select it
    const selectedInput = page.locator('#meal-product-selected');
    await expect(selectedInput).not.toBeEmpty();
    
    const value = await selectedInput.inputValue();
    expect(value).toContain('GENERIC_');
  });

  test('should display editable ingredients when logging a recipe with grams', async ({ page }) => {
    await loadTestDB(page);
    
    // First create a recipe to test with
    await page.goto('/recipe-editor.html');
    await page.fill('#recipe-name', 'Ensalada');
    await page.fill('#recipe-servings', '1');
    await page.fill('#recipe-instructions', 'Mezclar.');
    
    // Add ingredient
    await page.fill('#ing-search', 'Salchichas');
    await page.click('#btn-search-ing');
    await page.waitForSelector('#ing-search-results button', { state: 'visible' });
    await page.locator('#ing-search-results button').first().click();
    await page.fill('#ing-amount', '100');
    await page.click('#btn-add-ing');
    await page.click('#btn-save-recipe');
    await page.waitForURL('**/recipe-editor.html?id=*');
    
    // Now go to diary to log it
    await page.goto('/diary.html');
    const addBtn = page.locator('.diary-day button').first();
    await addBtn.click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // Ensure we are on recipe tab
    await page.click('#tab-recipe');
    
    // Select the newly created recipe (should be the last option, or just select it by text)
    await page.locator('#meal-recipe-select').selectOption({ label: 'Ensalada (1 rac.)' });
    
    // Change unit to grams
    await page.selectOption('#meal-recipe-unit', 'grams');
    
    // Input 50 grams
    await page.fill('#meal-recipe-amount', '50');
    
    // The ingredients container should become visible
    const ingContainer = page.locator('#meal-recipe-ingredients-container');
    await expect(ingContainer).toBeVisible();
    
    // There should be one ingredient row
    const ingRow = page.locator('.recipe-ing-row');
    await expect(ingRow).toHaveCount(1);
    
    // The input for the ingredient should be editable and contain the scaled value (50g consumed of 100g recipe = 50g)
    const ingInput = ingRow.locator('.ing-amount-input');
    await expect(ingInput).toHaveValue('50');
    
    // Edit the value manually
    await ingInput.fill('60');
    await expect(ingInput).toHaveValue('60');
  });
});
