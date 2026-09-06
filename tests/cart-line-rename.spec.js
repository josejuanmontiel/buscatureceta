import { test, expect } from '@playwright/test';

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  await page.evaluate(() => window.__resetUserData());
}

test.describe('Cart Line Edit / Rename Generic Product Flow', () => {
  test('should allow renaming a generic/weighed fruit product directly in the cart line', async ({ page }) => {
    await clearDB(page);
    page.on('dialog', dialog => dialog.accept());

    // 1. Ir al Carrito
    await page.goto('/#grid');
    await page.waitForSelector('#code-input', { state: 'visible' });

    // 2. Simular escaneo de un código de barras de fruta pesada (p. ej. 280123456789)
    const weighedFruitBarcode = '280123456789';
    await page.fill('#code-input', weighedFruitBarcode);
    await page.click('#query-btn');
    await page.waitForSelector('#btn-unknown-add-generic', { state: 'visible' });
    await page.click('#btn-unknown-add-generic');

    // 3. El producto no existe en BD y se añade como genérico "Producto 280123456789"
    const cartList = page.locator('#cart-list');
    await expect(cartList).toContainText(`Producto ${weighedFruitBarcode}`);

    // 4. Hacer clic en el botón de renombrar (lápiz)
    const renameBtn = page.locator('.btn-rename-cart-item');
    await expect(renameBtn).toBeVisible();
    await renameBtn.click();

    // 5. Debe aparecer el input inline con el valor actual
    const renameInput = page.locator('.cart-rename-input');
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveValue(`Producto ${weighedFruitBarcode}`);

    // 6. Escribir el nuevo nombre real (ej: "Manzanas Golden") y presionar Enter
    await renameInput.fill('Manzanas Golden');
    await renameInput.press('Enter');

    // 7. El carrito debe mostrar ahora "Manzanas Golden"
    await expect(cartList).toContainText('Manzanas Golden');
    await expect(cartList).not.toContainText(`Producto ${weighedFruitBarcode}`);

    // 8. Ajustar cantidad a 1.5 kg y precio a 2.00 €/kg
    const amountInput = page.locator('.cart-amount-input');
    await amountInput.fill('1.5');
    await amountInput.dispatchEvent('change');

    const unitSelect = page.locator('.cart-unit-select');
    await unitSelect.selectOption('kg');

    const priceInput = page.locator('.cart-price-input');
    await priceInput.fill('2.00');
    await priceInput.dispatchEvent('change');

    // Total de línea / carro: 1.5 * 2.00 = 3.00 €
    await expect(page.locator('#cart-total')).toContainText('3.00 €');

    // 9. Pasar por caja
    await page.click('#btn-checkout');
    await page.waitForURL('**/#pantry');

    // 10. Validar que en la despensa aparece con el nombre "Manzanas Golden" y 1500 g
    await expect(page.locator('#pantry-list')).toContainText('Manzanas Golden');
    await expect(page.locator('#pantry-list')).toContainText('1500 g');
  });
});
