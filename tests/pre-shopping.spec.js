import { test, expect } from '@playwright/test';
import { parseShoppingText, parseSingleItem } from '../src/js/modules/shopping/preListParser.js';

test.describe('Pre-Lista de la Compra - Parser Unit Tests', () => {
  test('parseSingleItem debería extraer cantidades, unidades y nombres correctamente', () => {
    // Caso 1: Cantidad numérica + unidad + conector 'de'
    const item1 = parseSingleItem('2 litros de leche');
    expect(item1).toEqual({ name: 'Leche', amount: 2, unit: 'l' });

    // Caso 2: Cantidad numérica + unidad 'paquetes'
    const item2 = parseSingleItem('- 3 paquetes de arroz');
    expect(item2).toEqual({ name: 'Arroz', amount: 3, unit: 'paquetes' });

    // Caso 3: Solo nombre sin cantidad
    const item3 = parseSingleItem('aceite de oliva virgen extra');
    expect(item3).toEqual({ name: 'Aceite de oliva virgen extra', amount: 1, unit: '' });

    // Caso 4: Expresión "media docena"
    const item4 = parseSingleItem('media docena de huevos');
    expect(item4).toEqual({ name: 'Huevos', amount: 6, unit: 'uds' });

    // Caso 5: Palabra numérica "dos" + "kilos"
    const item5 = parseSingleItem('dos kilos de patatas');
    expect(item5).toEqual({ name: 'Patatas', amount: 2, unit: 'kg' });

    // Caso 6: Decimal con coma
    const item6 = parseSingleItem('1,5 kg de manzanas');
    expect(item6).toEqual({ name: 'Manzanas', amount: 1.5, unit: 'kg' });
  });

  test('parseShoppingText debería procesar listas multilínea y frases continuas', () => {
    const multiLine = `
      - 2 litros de leche
      * 6 huevos camperos
      1. Pan de molde
      café soluble
    `;
    const parsed = parseShoppingText(multiLine);
    expect(parsed.length).toBe(4);
    expect(parsed[0].name).toBe('Leche');
    expect(parsed[0].amount).toBe(2);
    expect(parsed[1].name).toBe('Huevos camperos');
    expect(parsed[1].amount).toBe(6);
    expect(parsed[2].name).toBe('Pan de molde');
    expect(parsed[3].name).toBe('Café soluble');

    const sentence = 'Comprar leche, café y dos paquetes de arroz';
    const parsedSentence = parseShoppingText(sentence);
    expect(parsedSentence.length).toBe(3);
    expect(parsedSentence[0].name).toBe('Leche');
    expect(parsedSentence[1].name).toBe('Café');
    expect(parsedSentence[2].name).toBe('Arroz');
    expect(parsedSentence[2].amount).toBe(2);
  });
});

test.describe('Pre-Lista de la Compra - Flujo E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(async () => {
      if (window.__resetUserData) await window.__resetUserData();
    });
  });

  test('Debería navegar a la Pre-lista, mostrar estado vacío y permitir añadir desde chips', async ({ page }) => {
    // 1. Navegar a la Pre-lista desde el menú o hash
    await page.goto('/index.html#pre-shopping');
    await page.waitForSelector('#prelist-empty', { state: 'visible' });

    // 2. Verificar badge en 0
    const badge = page.locator('#badge-pending-count');
    await expect(badge).toHaveText('0');

    // 3. Añadir desde un chip de inicio rápido (ej. Leche)
    const chipLeche = page.locator('.starter-chip[data-name="Leche entera"]');
    await chipLeche.click();

    // 4. Verificar que aparece en la lista
    await page.waitForSelector('#item-1', { state: 'visible' });
    await expect(page.locator('#name-1')).toHaveText('Leche entera');
    await expect(badge).toHaveText('1');
  });

  test('Debería añadir ítems manualmente con input rápido y ajustar cantidades', async ({ page }) => {
    await page.goto('/index.html#pre-shopping');

    // Añadir con input rápido
    const input = page.locator('#input-quick-name');
    await input.fill('2 paquetes de arroz');
    await page.locator('#btn-quick-add').click();

    // Comprobar que se ha parseado amount=2 y unit=paquetes
    await page.waitForSelector('.prelist-item', { state: 'visible' });
    const itemRow = page.locator('.prelist-item').first();
    await expect(itemRow).toContainText('Arroz');
    await expect(itemRow).toContainText('2');
    await expect(itemRow).toContainText('paquetes');

    // Aumentar cantidad con el botón '+'
    const btnPlus = itemRow.locator('button:has-text("+")');
    await btnPlus.click();
    await expect(itemRow).toContainText('3');
  });

  test('Debería pegar lista masiva mediante el modal y convertirla en Lista de Compra Activa en #grid', async ({ page }) => {
    await page.goto('/index.html#pre-shopping');

    // 1. Abrir modal de pegado
    await page.locator('#btn-open-paste-modal').click();
    await page.waitForSelector('#modalPastePreList', { state: 'visible' });

    // 2. Rellenar textarea
    const pasteText = `
      - 2 litros de leche
      - 6 huevos
      - café molido
    `;
    await page.locator('#paste-textarea').fill(pasteText);
    await expect(page.locator('#paste-detected-count')).toHaveText('3');

    // 3. Confirmar pegado
    await page.locator('#btn-confirm-paste').click();
    await page.waitForSelector('#modalPastePreList', { state: 'hidden' });

    // 4. Verificar que los 3 ítems están en la lista
    const items = page.locator('.prelist-item');
    await expect(items).toHaveCount(3);
    await expect(page.locator('#summary-ready-count')).toContainText('3 productos');

    // 5. Convertir a Lista Activa
    const btnConvert = page.locator('#btn-convert-to-shopping-list');
    await btnConvert.click();

    // Modal bootstrap de confirmación (confirmModal de UI.js):
    await page.waitForSelector('#btn-global-confirm', { state: 'visible' });
    await page.click('#btn-global-confirm');

    // 6. Verificar redirección automática a #grid
    await page.waitForURL(/#grid/);
    await page.waitForSelector('#active-shopping-list-container', { state: 'visible' });

    // 7. Comprobar que los productos aparecen en la lista activa del carrito
    const activeListPending = page.locator('#shopping-list-pending');
    await expect(activeListPending).toContainText('Leche');
    await expect(activeListPending).toContainText('Huevos');
    await expect(activeListPending).toContainText('Café molido');

    // 8. Volver a la Pre-lista y verificar que los productos transferidos ya no están en pendientes
    await page.goto('/index.html#pre-shopping');
    await page.waitForSelector('#prelist-empty', { state: 'visible' });
    await expect(page.locator('#badge-pending-count')).toHaveText('0');
  });

  test('Debería detectar productos por cadencia de cartHistory y despensa agotada, y añadirlos a la Pre-lista', async ({ page }) => {
    // 1. Inyectar datos en cartHistory (2 compras separadas por 7 días, hace 8 días) y despensa a 0
    await page.evaluate(async () => {
      const now = Date.now();
      const MS_PER_DAY = 1000 * 60 * 60 * 24;

      const date15DaysAgo = now - 15 * MS_PER_DAY;
      const date8DaysAgo = now - 8 * MS_PER_DAY;

      // Compra 1: hace 15 días
      await window.db.cartHistory.add({
        date: date15DaysAgo,
        supermarket: 'Mercadona',
        total: 10.0,
        items: [
          { productCode: '8400000000001', productName: 'Leche Desnatada', amount: 2, unit: 'l', price: 1.0 }
        ]
      });

      // Compra 2: hace 8 días (cadencia = 7 días, han pasado 8 días -> Overdue!)
      await window.db.cartHistory.add({
        date: date8DaysAgo,
        supermarket: 'Mercadona',
        total: 10.0,
        items: [
          { productCode: '8400000000001', productName: 'Leche Desnatada', amount: 2, unit: 'l', price: 1.0 }
        ]
      });

      // Producto agotado en despensa
      await window.db.pantry.add({
        productCode: '8400000000002',
        productName: 'Arroz Redondo',
        amount: 0,
        unit: 'kg',
        pantryZone: 'food'
      });
    });

    // 2. Navegar a la Pre-lista
    await page.goto('/index.html#pre-shopping');
    await page.waitForSelector('#panel-replenishment', { state: 'visible' });

    // 3. Comprobar que en la pestaña "Toca comprar" aparece Leche Desnatada
    const containerDue = page.locator('#container-suggestions-due');
    await expect(containerDue).toContainText('Leche Desnatada');
    await expect(containerDue).toContainText('Hace 8d');

    // 4. Comprobar pestaña Despensa a 0
    await page.locator('#tab-depleted-btn').click();
    const containerDepleted = page.locator('#container-suggestions-depleted');
    await expect(containerDepleted).toContainText('Arroz Redondo');
    await expect(containerDepleted).toContainText('Agotado en despensa');

    // 5. Añadir "Leche Desnatada" desde la sugerencia
    await page.locator('#tab-due-btn').click();
    const btnAddLeche = containerDue.locator('button:has-text("Añadir")').first();
    await btnAddLeche.click();

    // 6. Verificar que aparece en la Pre-lista activa con badge Repetición
    await page.waitForSelector('.prelist-item', { state: 'visible' });
    const prelistItem = page.locator('.prelist-item').first();
    await expect(prelistItem).toContainText('Leche Desnatada');
    await expect(prelistItem).toContainText('Repetición');

    // 7. Verificar que "Leche Desnatada" ya NO aparece en sugerencias (porque ya está en la prelista)
    await expect(containerDue).not.toContainText('Leche Desnatada');
  });

  test('Debería detectar ingredientes faltantes del menú semanal (Agenda) y permitir añadirlos a la Pre-lista', async ({ page }) => {
    // 1. Inyectar una receta y una comida planificada en la agenda para los próximos días
    await page.evaluate(async () => {
      const recipeId = await window.db.recipes.add({
        name: 'Curry de Pollo y Calabacín',
        servings: 2,
        ingredients: [
          { productCode: '8400000000010', productName: 'Pechuga de Pollo', amount: 400, unit: 'g' },
          { productCode: '8400000000011', productName: 'Calabacín fresco', amount: 1, unit: 'kg' }
        ]
      });

      // Añadir 200g de pechuga a la despensa (insuficiente para los 400g necesarios)
      await window.db.pantry.add({
        productCode: '8400000000010',
        productName: 'Pechuga de Pollo',
        amount: 200,
        unit: 'g'
      });
      // El calabacín no está en despensa (stock = 0)

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 2);
      const dateStr = targetDate.toISOString().slice(0, 10);

      await window.db.diary.add({
        date: dateStr,
        mealType: 'lunch',
        items: [
          {
            type: 'recipe',
            recipeId: recipeId,
            name: 'Curry de Pollo y Calabacín',
            servings: 2
          }
        ]
      });
    });

    // 2. Navegar a la Pre-lista
    await page.goto('/index.html#pre-shopping');
    await page.waitForSelector('#panel-replenishment', { state: 'visible' });

    // 3. Abrir la pestaña "Menú"
    const tabMenuBtn = page.locator('#tab-menu-btn');
    await tabMenuBtn.click();

    const containerMenu = page.locator('#container-suggestions-menu');
    // Debe mostrar que faltan 200 g de Pechuga de Pollo
    await expect(containerMenu).toContainText('Pechuga de Pollo');
    await expect(containerMenu).toContainText('Faltan 200 g');
    await expect(containerMenu).toContainText('Para: Curry de Pollo y Calabacín');

    // Debe mostrar que falta 1 kg de Calabacín fresco
    await expect(containerMenu).toContainText('Calabacín fresco');
    await expect(containerMenu).toContainText('Faltan 1 kg');

    // 4. Añadir el Calabacín a la Pre-lista desde el botón de la sugerencia
    const btnAddCalabacin = containerMenu.locator('button:has-text("Añadir")').nth(1);
    await btnAddCalabacin.click();

    // 5. Verificar que aparece en la Pre-lista activa con origen receta
    await page.waitForSelector('.prelist-item', { state: 'visible' });
    const prelistItem = page.locator('.prelist-item').first();
    await expect(prelistItem).toContainText('Calabacín fresco');
    await expect(prelistItem).toContainText('Receta');
  });

  test('Debería permitir renombrar inline, eliminar un ítem y volcar directamente al Carrito activo', async ({ page }) => {
    await page.goto('/index.html#pre-shopping');

    // 1. Añadir 2 productos secuencialmente esperando la adición
    await page.locator('#input-quick-name').fill('Manzanas rojas');
    await page.locator('#btn-quick-add').click();
    await expect(page.locator('.prelist-item')).toHaveCount(1);

    await page.locator('#input-quick-name').fill('Plátanos maduros');
    await page.locator('#btn-quick-add').click();
    await expect(page.locator('.prelist-item')).toHaveCount(2);

    // 2. Renombrar "Manzanas rojas" a "Manzanas Fuji" haciendo clic en el texto
    const firstName = page.locator('.prelist-item').first().locator('[id^="name-"]');
    await firstName.click();
    const renameInput = page.locator('.prelist-item input[type="text"]');
    await renameInput.fill('Manzanas Fuji');
    await renameInput.press('Enter');

    await expect(page.locator('.prelist-item').first()).toContainText('Manzanas Fuji');

    // 3. Eliminar "Plátanos maduros"
    const secondDeleteBtn = page.locator('.prelist-item').nth(1).locator('button[title*="Eliminar"]');
    await secondDeleteBtn.click();
    await expect(page.locator('.prelist-item')).toHaveCount(1);
    await expect(page.locator('.prelist-item')).not.toContainText('Plátanos maduros');

    // 4. Volcar directamente al Carrito con el botón secundario
    const btnConvertCart = page.locator('#btn-convert-to-cart');
    await btnConvertCart.click();

    // Confirmar en el modal
    await page.waitForSelector('#btn-global-confirm', { state: 'visible' });
    await page.click('#btn-global-confirm');

    // Redirección al carrito (#grid)
    await page.waitForURL(/#grid/);

    // Verificar que Manzanas Fuji fue añadido al carro de la compra (#cart-list)
    await page.waitForSelector('#cart-list', { state: 'visible' });
    await expect(page.locator('#cart-list')).toContainText('Manzanas Fuji');
  });


  test('Debería añadir en bloque todas las sugerencias debidas con "Añadir que tocan"', async ({ page }) => {
    // Inyectar un producto agotado en despensa
    await page.evaluate(async () => {
      await window.db.pantry.add({
        productCode: '8400000000099',
        productName: 'Tomate Frito Casero',
        amount: 0,
        unit: 'bote',
        pantryZone: 'food'
      });
    });

    await page.goto('/index.html#pre-shopping');
    await page.waitForSelector('#panel-replenishment', { state: 'visible' });

    // Pulsar botón "Añadir que tocan" (#btn-add-all-suggestions)
    const btnAddAll = page.locator('#btn-add-all-suggestions');
    await expect(btnAddAll).toBeVisible();
    await btnAddAll.click();

    // Verificar que se incorporó a la pre-lista
    await page.waitForSelector('.prelist-item', { state: 'visible' });
    await expect(page.locator('.prelist-item')).toContainText('Tomate Frito Casero');
  });
});


