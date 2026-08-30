import { test, expect } from '@playwright/test';

test.describe('Alimentos Primarios y Smart Match en Recetas', () => {

  test('Debe hacer Smart Match automático con alimentos primarios offline (Brócoli, Avena, AOVE)', async ({ page }) => {
    await page.goto('/#recipe-editor');

    // 1. Abrir modal de importación con IA
    await page.click('#btn-import-ai');
    await expect(page.locator('#aiImportModal')).toBeVisible();

    // 2. Pegar JSON de una receta con alimentos primarios típicos
    const recipeJSON = JSON.stringify({
      name: "Salteado Saludable de Brócoli y Avena",
      servings: 2,
      description: "Plato rico en fibra y sulforafano.",
      instructions: "1. Saltear el brócoli en aceite de oliva con ajo picado.\n2. Añadir la avena y cocinar 3 minutos.",
      ingredients: [
        { name: "Brócoli", amount: 200, unit: "g" },
        { name: "Avena", amount: 50, unit: "g" },
        { name: "Aceite de oliva", amount: 15, unit: "ml" },
        { name: "Ajo", amount: 1, unit: "unidad" }
      ]
    });

    await page.fill('#recipe-ai-json', recipeJSON);
    await page.click('#btn-process-recipe-ai');

    // 3. El modal Smart Match debe abrirse y mostrar las filas
    await expect(page.locator('#smartMatchModal')).toBeVisible({ timeout: 5000 });

    // 4. Verificar que se detectan los alimentos primarios con badge 🌱 Primario
    await expect(page.locator('#smart-match-list')).toContainText('Brócoli');
    await expect(page.locator('#smart-match-list')).toContainText('Avena');
    await expect(page.locator('#smart-match-list')).toContainText('🌱 Primario');

    // 5. Confirmar e importar
    await page.click('#btn-confirm-smart-match');
    await expect(page.locator('#smartMatchModal')).toBeHidden();

    // 6. Verificar que los ingredientes aparecen en la receta
    await expect(page.locator('#ingredient-list')).toContainText('Brócoli');
    await expect(page.locator('#recipe-name')).toHaveValue('Salteado Saludable de Brócoli y Avena');
  });

});
