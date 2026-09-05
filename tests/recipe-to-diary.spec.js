import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

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
  await page.fill('#database', '/test_products.tsv.zz');
  await page.click('#download-btn');
  await page.waitForURL('**/#grid', { timeout: 60000 });
}

test.describe('Add Recipe to Diary - Complete Workflows', () => {

  test('should schedule recipe directly from Mis Recetas (recipes.html)', async ({ page }) => {
    await loadTestDB(page);

    // Importar pack mediterraneo
    await page.goto('/#recipes');
    await page.click('#btn-import-mediterranean-pack');
    await page.waitForSelector('#btn-global-confirm', { state: 'visible' });
    await page.click('#btn-global-confirm');
    await page.waitForTimeout(1000);

    // En la primera receta, pulsar el botón "📅 Agenda"
    const agendaBtn = page.locator('.recipe-card button:has-text("📅 Agenda")').first();
    await expect(agendaBtn).toBeVisible();
    await agendaBtn.click();

    // El modal de planificar debe estar visible
    await expect(page.locator('#planRecipeModal')).toBeVisible();
    await expect(page.locator('#plan-recipe-name')).not.toBeEmpty();

    // Cambiar a momento Cena y 2 raciones
    await page.selectOption('#plan-meal-type', 'dinner');
    await page.fill('#plan-servings', '2');

    // Confirmar añadir
    await page.click('#btn-do-plan-recipe');
    await expect(page.locator('#planRecipeModal')).not.toBeVisible();

    // Ir a la agenda y comprobar que aparece en la cena
    await page.goto('/#diary');
    await page.waitForTimeout(500);

    const gridText = await page.locator('.diary-grid').innerText();
    expect(gridText).toContain('CENA');
    expect(gridText).toContain('Crema Suave de Calabacín');
  });

  test('should filter recipes and save in 1 click from diary modal', async ({ page }) => {
    await loadTestDB(page);

    // Importar pack mediterraneo
    await page.goto('/#recipes');
    await page.click('#btn-import-mediterranean-pack');
    await page.waitForSelector('#btn-global-confirm', { state: 'visible' });
    await page.click('#btn-global-confirm');
    await page.waitForTimeout(1000);

    // Ir a la agenda
    await page.goto('/#diary');
    await page.waitForTimeout(500);

    // Abrir modal de añadir en el primer día
    const addBtn = page.locator('.diary-day button').first();
    await addBtn.click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // Comprobar buscador de recetas
    const searchInput = page.locator('#meal-recipe-search');
    await expect(searchInput).toBeVisible();

    // Filtrar por "Gazpacho"
    await searchInput.fill('Gazpacho');
    await page.waitForTimeout(200);

    // El select debe tener seleccionado Gazpacho automáticamente al ser única coincidencia
    const selectedOption = await page.locator('#meal-recipe-select option:checked').innerText();
    expect(selectedOption).toContain('Gazpacho');

    // Guardar consumido directamente (1 solo clic, sin pasar por bandeja)
    await page.click('#btn-save-meal');
    await expect(page.locator('#mealModal')).not.toBeVisible();

    // Debe mostrarse en el grid
    const gridText = await page.locator('.diary-grid').innerText();
    expect(gridText).toContain('Gazpacho Andaluz Tradicional');
  });

  test('should combine tray items with currently configured recipe when saving', async ({ page }) => {
    await loadTestDB(page);

    // Crear receta
    await page.goto('/#recipe-editor');
    await page.fill('#recipe-name', 'Arroz Simple');
    await page.fill('#recipe-servings', '1');
    await page.fill('#recipe-instructions', 'Hervir.');
    await page.fill('#ingredient-search', 'Salchichas');
    await page.click('#btn-search-ingredient');
    await page.waitForSelector('#ingredient-search-results button', { state: 'visible' });
    await page.locator('#ingredient-search-results button').first().click();
    await page.click('#btn-save-recipe');
    await page.waitForURL('**/#recipe-editor?id=*');

    // Programar también desde el editor de recetas
    await page.click('#recipeOptionsDropdown');
    await page.click('#btn-plan-in-diary');
    await expect(page.locator('#planRecipeModal')).toBeVisible();
    await page.click('#btn-do-plan-recipe');
    await expect(page.locator('#planRecipeModal')).not.toBeVisible();

    // Ir a la agenda
    await page.goto('/#diary');
    await page.waitForTimeout(500);
    expect(await page.locator('.diary-grid').innerText()).toContain('Arroz Simple');
  });

});
