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
});
