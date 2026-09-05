import { test, expect } from '@playwright/test';

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  await page.evaluate(() => window.__resetUserData());
}

test.describe('Package Units and Recipe Stock Conversions', () => {

  test('should display package units in pantry and deduct stock in grams when recipe asks for units', async ({ page }) => {
    await clearDB(page);

    // 1. Ir a la despensa y añadir un producto con unidades de paquete
    await page.goto('/#pantry');
    await page.waitForFunction(() => typeof window.db !== 'undefined');

    await page.click('button[data-bs-target="#addStockModal"]');
    await expect(page.locator('#addStockModal')).toBeVisible();

    // Buscar código no existente para crear producto personalizado rápido
    await page.fill('#stock-product-search', '8400000001001');
    await page.click('#btn-search-stock-product');
    await page.waitForSelector('#input-new-custom-name', { state: 'visible' });

    await page.fill('#input-new-custom-name', 'Salchichas Pack');
    await page.click('#btn-create-custom-product');
    await expect(page.locator('#stock-product-selected-card')).toBeVisible();
    await expect(page.locator('#stock-selected-name')).toHaveText('Salchichas Pack');
    await expect(page.locator('#stock-product-selected')).toHaveValue('8400000001001');

    // Rellenar 400g y 4 unidades por paquete (100g/ud)
    await page.fill('#stock-amount', '400');
    await page.selectOption('#stock-unit', 'g');
    await page.fill('#stock-package-units', '4');

    await page.click('#btn-save-stock');
    await expect(page.locator('#addStockModal')).not.toBeVisible();

    // 2. Verificar que la tarjeta en despensa muestra 400g y el badge de unidades de paquete
    const pantryCard = page.locator('.pantry-card').first();
    await expect(pantryCard).toBeVisible();
    await expect(pantryCard).toContainText('400');
    await expect(pantryCard).toContainText('4 uds/pack');
    await expect(pantryCard).toContainText('~100g/ud');

    // 3. Abrir detalle del producto para verificar el modal
    await pantryCard.click();
    await expect(page.locator('#productDetailModal')).toBeVisible();
    await expect(page.locator('#detail-package-units-badge')).toContainText('4 uds/pack');
    await page.click('#productDetailModal button[data-bs-dismiss="modal"]');
    await expect(page.locator('#productDetailModal')).not.toBeVisible();

    // 4. Crear receta que use 2 unidades del producto
    await page.goto('/#recipe-editor');
    await page.fill('#recipe-name', 'Cena Salchichas');
    await page.fill('#recipe-servings', '1');
    await page.fill('#recipe-instructions', 'Cocinar.');

    await page.fill('#ingredient-search', 'Salchichas Pack');
    await page.click('#btn-search-ingredient');
    await page.waitForSelector('#ingredient-search-results button', { state: 'visible' });
    await page.locator('#ingredient-search-results button').first().click();

    // Cambiar la unidad del ingrediente a 'ud' y cantidad 2
    const ingRow = page.locator('.ingredient-row').first();
    await ingRow.locator('input[type="number"]').fill('2');
    await ingRow.locator('select').selectOption('unidad');

    await page.click('#btn-save-recipe');
    await page.waitForURL('**/#recipe-editor?id=*');

    // 5. Añadir y programar la receta en la agenda
    await page.click('#recipeOptionsDropdown');
    await page.click('#btn-plan-in-diary');
    await expect(page.locator('#planRecipeModal')).toBeVisible();
    await page.click('#btn-do-plan-recipe');
    await expect(page.locator('#planRecipeModal')).not.toBeVisible();

    // Marcar como consumida en la agenda
    await page.goto('/#diary');
    await page.waitForTimeout(500);

    // Abrir modal de comida para el día y guardarla consumida
    const addBtn = page.locator('.diary-day button').first();
    await addBtn.click();
    await expect(page.locator('#mealModal')).toBeVisible();
    await page.fill('#meal-recipe-search', 'Cena Salchichas');
    await page.waitForTimeout(200);
    await page.click('#btn-save-meal');
    await expect(page.locator('#mealModal')).not.toBeVisible();

    // 6. Comprobar que en la despensa se han descontado 200g (2 uds * 100g/ud) quedando 200g
    await page.goto('/#pantry');
    await page.waitForTimeout(500);
    const updatedCard = page.locator('.pantry-card').first();
    await expect(updatedCard).toContainText('200');
    await expect(updatedCard).toContainText('g');
  });

  test('should handle bidirectional deduction when stock is in units and recipe asks for grams', async ({ page }) => {
    await clearDB(page);
    await page.goto('/#pantry');
    await page.waitForFunction(() => typeof window.db !== 'undefined' && typeof window.PantryStore !== 'undefined');

    // Evaluar directamente con window.PantryStore para validar cálculo bidireccional exhaustivo
    const result = await page.evaluate(async () => {
      // Crear producto con 6 unidades y peso unitario de 50g
      await window.ProductStore.addCustomProduct({
        code: 'TEST_HUEVOS_6',
        product_name: 'Huevos Pack 6',
        product_quantity: '300',
        package_units: 6,
        unit_weight: 50,
        nutriscore_grade: 'a'
      });

      // Añadir 6 unidades a la despensa
      await window.PantryStore.addStock('TEST_HUEVOS_6', 6, 'unidad', 'food', 6);

      // Consumir 100 gramos (equivalente a 2 huevos de 50g)
      await window.PantryStore.consumeStock('TEST_HUEVOS_6', 100, 'consumed_me', 'g');

      const itemAfterGrams = await window.db.pantry.where('productCode').equals('TEST_HUEVOS_6').first();

      // Consumir 1 unidad directamente
      await window.PantryStore.consumeStock('TEST_HUEVOS_6', 1, 'consumed_me', 'unidad');

      const itemAfterUnit = await window.db.pantry.where('productCode').equals('TEST_HUEVOS_6').first();

      return {
        amountAfter100g: itemAfterGrams.amount,
        amountAfter1Ud: itemAfterUnit.amount,
        unit: itemAfterGrams.unit
      };
    });

    expect(result.amountAfter100g).toBe(4); // 6 - (100 / 50) = 4 unidades
    expect(result.amountAfter1Ud).toBe(3);   // 4 - 1 = 3 unidades
    expect(result.unit).toBe('unidad');
  });

  test('should allow editing package units from product detail modal in pantry', async ({ page }) => {
    await clearDB(page);

    await page.goto('/#pantry');
    await page.waitForFunction(() => typeof window.db !== 'undefined');

    await page.click('button[data-bs-target="#addStockModal"]');
    await expect(page.locator('#addStockModal')).toBeVisible();

    await page.fill('#stock-product-search', '8400000002002');
    await page.click('#btn-search-stock-product');
    await page.waitForSelector('#input-new-custom-name', { state: 'visible' });

    await page.fill('#input-new-custom-name', 'Yogures Fresa');
    await page.click('#btn-create-custom-product');
    await expect(page.locator('#stock-product-selected-card')).toBeVisible();
    await expect(page.locator('#stock-selected-name')).toHaveText('Yogures Fresa');
    await expect(page.locator('#stock-product-selected')).toHaveValue('8400000002002');

    // Añadir 500g sin especificar unidades al principio
    await page.fill('#stock-amount', '500');
    await page.selectOption('#stock-unit', 'g');
    await page.click('#btn-save-stock');
    await expect(page.locator('#addStockModal')).not.toBeVisible();

    // Abrir modal de detalles
    const card = page.locator('.pantry-card:has-text("Yogures Fresa")');
    await card.click();
    await expect(page.locator('#productDetailModal')).toBeVisible();

    // Badge debe decir "Sin definir"
    await expect(page.locator('#detail-package-units-badge')).toHaveText('Sin definir');

    // Establecer 4 unidades en el modal de detalle y guardar
    await page.fill('#detail-input-package-units', '4');
    await page.click('#btn-save-detail-package-units');

    // El badge debe actualizarse inmediatamente a 4 uds/pack (~125g/ud)
    await expect(page.locator('#detail-package-units-badge')).toContainText('4 uds/pack');
    await expect(page.locator('#detail-package-units-badge')).toContainText('~125g/ud');

    await page.click('#productDetailModal button[data-bs-dismiss="modal"]');
    await expect(page.locator('#productDetailModal')).not.toBeVisible();

    // En la tarjeta de la despensa también debe reflejarse
    await expect(card).toContainText('4 uds/pack');
    await expect(card).toContainText('~125g/ud');
  });

});
