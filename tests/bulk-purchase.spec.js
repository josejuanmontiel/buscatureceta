import { test, expect } from '@playwright/test';

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  await page.evaluate(() => window.__resetUserData());
}

test.describe('Bulk & Manual Purchase Flow E2E', () => {
  test('should add bulk products via modal with chips, calculate prices, and stock correctly in pantry', async ({ page }) => {
    await clearDB(page);
    page.on('dialog', dialog => dialog.accept());

    // 1. Ir al Carrito
    await page.goto('/#grid');
    await page.waitForSelector('#btn-manual-bulk', { state: 'visible' });

    // 2. Abrir modal de alta a granel / manual
    await page.click('#btn-manual-bulk');
    const modal = page.locator('#modal-manual-bulk');
    await expect(modal).toBeVisible();

    // 3. Probar atajo rápido: Plátanos
    const platanoChip = page.locator('.bulk-chip[data-name="Plátanos"]');
    await expect(platanoChip).toBeVisible();
    await platanoChip.click();

    // Verificar que rellenó el nombre y la unidad
    await expect(page.locator('#bulk-product-name')).toHaveValue('Plátanos');
    await expect(page.locator('#bulk-unit')).toHaveValue('kg');

    // Introducir peso y precio unitario
    await page.fill('#bulk-amount', '1.5');
    await page.fill('#bulk-unit-price', '1.80');

    // Verificar que calculó el precio total a 2.70 €
    await expect(page.locator('#bulk-total-price')).toHaveValue('2.70');
    await expect(page.locator('#bulk-price-calc-hint')).toContainText('2.70 €');

    // Añadir al carro
    await page.click('#btn-submit-bulk-item');
    await expect(modal).not.toBeVisible();

    // 4. Verificar que aparece en la lista del carrito con datos correctos
    await expect(page.locator('#cart-list')).toContainText('Plátanos');
    await expect(page.locator('#cart-total')).toContainText('2.70 €');

    // 5. Añadir un segundo producto personalizado escribiendo manualmente
    await page.click('#btn-manual-bulk');
    await expect(modal).toBeVisible();

    await page.fill('#bulk-product-name', 'Tomates de Huerta');
    await page.selectOption('#bulk-unit', 'kg');
    await page.fill('#bulk-amount', '0.8');
    await page.fill('#bulk-total-price', '2.00'); // Introducir precio total directamente

    // Verificar que calculó el precio unitario (2.00 / 0.8 = 2.50 €/kg)
    await expect(page.locator('#bulk-unit-price')).toHaveValue('2.50');

    await page.click('#btn-submit-bulk-item');
    await expect(modal).not.toBeVisible();

    // Total carro: 2.70 + 2.00 = 4.70 €
    await expect(page.locator('#cart-list')).toContainText('Tomates de Huerta');
    await expect(page.locator('#cart-total')).toContainText('4.70 €');

    // 6. Pasar por caja (Checkout)
    await page.click('#btn-checkout');

    // Esperar redirección a Despensa
    await page.waitForURL('**/#pantry');

    // 7. Validar que la despensa tiene ambos productos convertidos a gramos y en Alimentos
    await expect(page.locator('#pantry-list')).toContainText('Plátanos');
    await expect(page.locator('#pantry-list')).toContainText('1500 g');
    await expect(page.locator('#pantry-list')).toContainText('Tomates de Huerta');
    await expect(page.locator('#pantry-list')).toContainText('800 g');
  });
});
