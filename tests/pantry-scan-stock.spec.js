import { test, expect } from '@playwright/test';

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.db !== 'undefined');
  await page.evaluate(async () => {
    if (typeof window.__resetUserData === 'function') {
      await window.__resetUserData();
    }
  });
}

test.describe('Flujo de escaneo y búsqueda para añadir stock a la despensa', () => {

  test('1. El botón de escaneo rápido en la cabecera de la despensa redirige a scan.html con action=addStock', async ({ page }) => {
    await clearDB(page);
    await page.goto('/#pantry');

    const quickScanBtn = page.locator('#btn-quick-scan-stock');
    await expect(quickScanBtn).toBeVisible();
    await quickScanBtn.click();

    await expect(page).toHaveURL(/scan\.html\?return=%23pantry&action=addStock/);
  });

  test('2. Al volver del escáner con código catalogado, busca, auto-selecciona y añade a la despensa', async ({ page }) => {
    await clearDB(page);

    // Pre-poblamos un producto en db.products para simular que está catalogado en OFF / local
    await page.goto('/#pantry');
    await page.evaluate(async () => {
      await window.db.products.put({
        code: '8410128000123',
        product_name: 'Leche Semidesnatada Pascual',
        brands: 'Pascual',
        quantity: '1 L',
        product_quantity: '1000',
        nutriments: {},
        nutriscore_grade: 'b'
      });
    });

    // Simular retorno del escáner
    await page.goto('/#pantry?action=addStock&code=8410128000123');

    // El modal de añadir stock debe abrirse automáticamente
    const modal = page.locator('#addStockModal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // La tarjeta de producto seleccionado debe mostrarse con el nombre y detalles
    const selectedCard = page.locator('#stock-product-selected-card');
    await expect(selectedCard).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#stock-selected-name')).toHaveText('Leche Semidesnatada Pascual');
    await expect(page.locator('#stock-selected-details')).toContainText('Pascual');
    await expect(page.locator('#stock-product-selected')).toHaveValue('8410128000123');

    // La unidad debe haberse sugerido a 'ml' y cantidad 1000
    await expect(page.locator('#stock-unit')).toHaveValue('ml');
    await expect(page.locator('#stock-amount')).toHaveValue('1000');

    // Pulsamos "Añadir"
    await page.click('#btn-save-stock');
    await expect(modal).not.toBeVisible();

    // Debe aparecer en la lista de la despensa con la cantidad añadida
    await expect(page.locator('#pantry-list')).toContainText('Leche Semidesnatada Pascual', { timeout: 10000 });
    await expect(page.locator('#pantry-list')).toContainText('1000 ml');
  });

  test('3. Al volver del escáner con código desconocido, permite asignar nombre y añadir a la despensa', async ({ page }) => {
    await clearDB(page);

    // Simular escaneo de un código no catalogado
    const unknownCode = '9998887776665';
    await page.goto(`/#pantry?action=addStock&code=${unknownCode}`);

    const modal = page.locator('#addStockModal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Debe mostrar la UI de producto no encontrado en catálogo
    const uncataloguedCard = page.locator('#stock-product-results .list-group-item-warning');
    await expect(uncataloguedCard).toBeVisible({ timeout: 10000 });
    await expect(uncataloguedCard).toContainText(unknownCode);

    // Asignar nombre y hacer clic en Asignar
    const nameInput = page.locator('#input-new-custom-name');
    await nameInput.fill('Mi Galleta Artesana');
    await page.click('#btn-create-custom-product');

    // Tras asignar, la tarjeta de producto seleccionado debe activarse
    const selectedCard = page.locator('#stock-product-selected-card');
    await expect(selectedCard).toBeVisible();
    await expect(page.locator('#stock-selected-name')).toHaveText('Mi Galleta Artesana');
    await expect(page.locator('#stock-product-selected')).toHaveValue(unknownCode);

    // Ajustamos cantidad a 300g y añadimos
    await page.fill('#stock-amount', '300');
    await page.click('#btn-save-stock');
    await expect(modal).not.toBeVisible();

    // Verificamos que aparece en la despensa
    await expect(page.locator('#pantry-list')).toContainText('Mi Galleta Artesana', { timeout: 10000 });
    await expect(page.locator('#pantry-list')).toContainText('300 g');
  });

  test('4. Buscar en la despensa un producto sin stock ofrece botón para añadirlo directamente', async ({ page }) => {
    await clearDB(page);
    await page.goto('/#pantry');

    const searchInput = page.locator('#pantry-search');
    await searchInput.fill('8480000999999');

    // Debe mostrar la tarjeta con el botón "Añadir a mi Despensa"
    const addPromptBtn = page.locator('button:has-text("Añadir a mi Despensa")');
    await expect(addPromptBtn).toBeVisible({ timeout: 10000 });

    // Al pulsar el botón, debe abrir el modal de añadir stock con el código ya buscado
    await addPromptBtn.click();
    await expect(page.locator('#addStockModal')).toBeVisible();
    await expect(page.locator('#stock-product-search')).toHaveValue('8480000999999');
  });

});
