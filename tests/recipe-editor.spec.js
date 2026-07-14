import { test, expect } from '@playwright/test';

async function loadTestDB(page) {
  await page.goto('/index.html');
  page.on('dialog', dialog => dialog.accept());
  await page.fill('#filters', 'E250');
  await page.fill('#database', '/test_products.tsv.zz');
  await page.click('#download-btn');
  await page.waitForURL('**/grid.html');
}

test.describe('Recipe Editor Flow', () => {

  test('should create a recipe, edit it to create a new version, and restore previous version', async ({ page }) => {
    // 1. Navegar a nueva receta
    await page.goto('/recipe-editor.html');
    await expect(page.locator('#editor-page-title')).toContainText('Nueva Receta');

    // 2. Rellenar datos básicos
    await page.fill('#recipe-name', 'Tortilla de Patatas');
    await page.fill('#recipe-servings', '4');
    await page.fill('#recipe-instructions', 'Paso 1: Pelar patatas.');
    await page.click('#btn-save-recipe');

    // Esperar a que se asigne ID y cambie la URL
    await page.waitForURL('**/recipe-editor.html?id=*');
    
    // Verificar que aparece el badge de versión 1
    const versionBadge = page.locator('#version-badge');
    await expect(versionBadge).toBeVisible();
    await expect(versionBadge).toContainText('v1');

    // 3. Editar receta (nueva versión)
    await page.fill('#recipe-instructions', 'Paso 1: Pelar patatas. Paso 2: Freir patatas.');
    await page.click('#btn-save-recipe');

    // Esperar a que se actualice la versión a v2
    await expect(versionBadge).toContainText('v2');

    // Comprobar que en el historial aparece la versión 1
    await expect(page.locator('#versions-card')).toBeVisible();
    await expect(page.locator('#versions-count')).toContainText('1');
    const versionItem = page.locator('.version-item').first();
    await expect(versionItem).toContainText('v1');

    // 4. Restaurar la versión 1
    await versionItem.click();
    await expect(page.locator('#restoreModal')).toBeVisible();
    
    // Confirmar restauración
    await page.click('#btn-confirm-restore');
    
    // Esperar a que la versión cambie a v3 (la nueva versión restaurada)
    await expect(versionBadge).toContainText('v3');
    
    // Verificar que las instrucciones vuelven a ser las de la v1
    const instructions = await page.inputValue('#recipe-instructions');
    expect(instructions).toBe('Paso 1: Pelar patatas.');
  });

  test('should only find products in pantry when filter is checked', async ({ page }) => {
    await loadTestDB(page);

    // 1. Add product to pantry
    await page.goto('/pantry.html');
    await page.click('#tab-add');
    await page.fill('#pantry-add-search', 'Salchichas de Pollo');
    await page.click('#btn-search-pantry-add');
    await page.waitForSelector('#pantry-add-results button', { state: 'visible' });
    await page.locator('#pantry-add-results button').first().click();
    await page.fill('#pantry-add-amount', '500');
    await page.click('#btn-save-pantry');
    await page.waitForTimeout(500);

    // 2. Go to recipe editor
    await page.goto('/recipe-editor.html');
    
    // 3. Search without filter
    await page.fill('#ing-search', 'Lentejas'); // Assume 'Lentejas' is in global DB but not in pantry
    await page.click('#btn-search-ing');
    await page.waitForSelector('#ing-search-results button', { state: 'visible' });
    let results = await page.locator('#ing-search-results button').count();
    expect(results).toBeGreaterThan(0);

    // 4. Search WITH filter
    await page.check('#filter-pantry-only');
    await page.fill('#ing-search', 'Lentejas');
    await page.click('#btn-search-ing');
    await page.waitForTimeout(500);
    // Should have no results
    results = await page.locator('#ing-search-results button').count();
    expect(results).toBe(0);

    // 5. Search for the product that IS in pantry
    await page.fill('#ing-search', 'Salchichas');
    await page.click('#btn-search-ing');
    await page.waitForSelector('#ing-search-results button', { state: 'visible' });
    results = await page.locator('#ing-search-results button').count();
    expect(results).toBeGreaterThan(0);
  });

});
