import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Helper: carga la BD de prueba en el contexto del navegador
async function loadTestDB(page) {
  await page.route('**/test_products.tsv.zz', route => {
    const filePath = path.join(process.cwd(), 'src/public/test_products.tsv.zz');
    const buffer = fs.readFileSync(filePath);
    route.fulfill({ status: 200, contentType: 'application/octet-stream', body: buffer });
  });

  await page.goto('/#index');
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/#settings');
  await page.fill('#additive-filters', 'E250');
  await page.click('#btn-save-filters');
  await page.goto('/#index');
  await page.fill('#database', '/test_products.tsv.zz');
  await page.click('#download-btn');
  await page.waitForURL('**/#grid');
}

test.describe('Flujos de IA para Recetas', () => {

  test('Test 1: Guardar foto como Receta (Borrador)', async ({ page }) => {
    await loadTestDB(page);
    
    // Create a mock photo entry by visiting meal-photos and snapping
    await page.goto('/#meal-photos');
    
    // Add a mock photo to the store via console evaluation to skip camera API issues in headless
    await page.evaluate(async () => {
      const module = await import('./js/modules/mealPhotos/MealPhotoStore.js');
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      await module.addMealPhoto('2026-07-19', 'breakfast', blob);
    });
    
    // Reload to see the photo
    await page.reload();
    
    // Open annotate modal
    await page.click('.photo-card .btn-outline-primary'); // "✏️ Anotar"
    await expect(page.locator('#annotateModal')).toBeVisible();
    
    // Fill manual notes
    await page.fill('#annotate-notes', 'Desayuno rico');
    
    // Click Guardar como Receta
    await page.click('#btn-save-as-recipe');
    
    // Should redirect to recipe-editor
    await page.waitForURL('**/#recipe-editor?id=*');
    
    // Check if title is there
    await expect(page.locator('#recipe-name')).toHaveValue('Desayuno rico');
    
    // Go to recipes list and check for Draft badge
    await page.goto('/#recipes');
    await expect(page.locator('.recipe-card .card-title')).toContainText('Borrador');
  });

  test('Test 2: Flujo de Importación con IA y Smart Match', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/#recipe-editor');
    
    // Abrir modal de IA
    await page.click('#btn-import-ai');
    await expect(page.locator('#aiImportModal')).toBeVisible();
    
    // Pegar JSON simulado
    const aiJson = {
      name: "Tortilla",
      servings: 2,
      ingredients: [{ name: "Salchichas", amount: 100, unit: "g" }]
    };
    await page.fill('#recipe-ai-json', JSON.stringify(aiJson));
    
    // Procesar JSON
    await page.click('#btn-process-recipe-ai');
    
    // Debería abrir el modal Smart Match
    await expect(page.locator('#smartMatchModal')).toBeVisible();
    
    // Verificar que encontró Salchichas (tiene tick verde ✅)
    await expect(page.locator('#smart-match-list')).toContainText('✅');
    
    // Confirmar e Importar
    await page.click('#btn-confirm-smart-match');
    
    // El nombre de la receta debería ser Tortilla
    await expect(page.locator('#recipe-name')).toHaveValue('Tortilla');
    await expect(page.locator('#recipe-servings')).toHaveValue('2');
    
    // El ingrediente debería estar listado
    await expect(page.locator('#ingredient-list')).toContainText('Salchichas');
  });

  test('Test 3: Resolución de conflictos (Merge)', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/#recipe-editor');
    
    // Crear receta inicial
    await page.fill('#recipe-name', 'Mi Receta');
    
    // Buscar Leche y añadirlo
    await page.fill('#ingredient-search', 'Leche');
    await page.click('#btn-search-ingredient');
    await page.waitForSelector('#ingredient-search-results button', { state: 'visible' });
    await page.locator('#ingredient-search-results button').first().click();
    
    // Verificar que Leche está
    await expect(page.locator('#ingredient-list')).toContainText('Leche');
    
    // Importar con IA encima
    await page.click('#btn-import-ai');
    const aiJson = {
      ingredients: [{ name: "Salchichas", amount: 100, unit: "g" }]
    };
    await page.fill('#recipe-ai-json', JSON.stringify(aiJson));
    await page.click('#btn-process-recipe-ai');
    
    // Smart match
    await expect(page.locator('#smartMatchModal')).toBeVisible();
    await page.click('#btn-confirm-smart-match');
    
    // Como hay ingredientes previos, salta el modal de conflicto
    await expect(page.locator('#mergeConflictModal')).toBeVisible();
    
    // Elegir Reemplazar
    await page.click('#btn-merge-replace');
    
    // Verificar que la Leche desaparece y se queda Salchichas
    await expect(page.locator('#ingredient-list')).not.toContainText('Leche');
    await expect(page.locator('#ingredient-list')).toContainText('Salchichas');
  });
});
