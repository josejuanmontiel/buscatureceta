import { test, expect } from '@playwright/test';

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

});
