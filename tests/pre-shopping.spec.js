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
});
