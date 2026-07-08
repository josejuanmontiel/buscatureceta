import { test, expect } from '@playwright/test';

test.describe('Dashboard Flow', () => {

  test('should render the dashboard with all key sections', async ({ page }) => {
    await page.goto('/dashboard.html');

    // Verificar título
    await expect(page).toHaveTitle(/Dashboard - NutriAgenda/i);

    // Verificar que los elementos clave existen
    await expect(page.locator('#kcal-text')).toBeVisible();
    await expect(page.locator('#kcalChart')).toBeVisible();
    await expect(page.locator('#weekChart')).toBeVisible();

    // Verificar que los macros están presentes
    await expect(page.locator('#macro-prot-text')).toBeVisible();
    await expect(page.locator('#macro-carb-text')).toBeVisible();
    await expect(page.locator('#macro-fat-text')).toBeVisible();
    await expect(page.locator('#macro-fiber-text')).toBeVisible();

    // Verificar que la variedad semanal se renderiza
    await expect(page.locator('#variety-score')).toBeVisible();
    await expect(page.locator('#variety-list')).toBeVisible();
  });

  test('should show kcal text on dashboard after page loads', async ({ page }) => {
    await page.goto('/dashboard.html');
    
    // Esperar a que Chart.js y los módulos hayan cargado
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // El texto de kcal debe haberse actualizado desde el placeholder "--/--"
    const kcalText = await page.locator('#kcal-text').innerText();
    expect(kcalText).toMatch(/\d+ \/ \d+ kcal/); // e.g. "0 / 2000 kcal"
  });

  test('should show updated kcal text format after page loads', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // El formato debe ser "número / número kcal"
    const kcalText = await page.locator('#kcal-text').innerText();
    console.log('Kcal text:', kcalText);
    expect(kcalText).toMatch(/\d+ \/ \d+ kcal/);
  });


  test('should show variety list with food groups', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // La lista de variedad debe tener elementos
    const varietyItems = page.locator('.variety-item');
    const count = await varietyItems.count();
    expect(count).toBeGreaterThan(0);

    // El score de variedad debe ser un porcentaje
    const scoreText = await page.locator('#variety-score').innerText();
    expect(scoreText).toMatch(/\d+%/);
  });

  test('should render macro progress bars', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Las barras de macros deben estar en el DOM con formato "Número/Númerog"
    const protText = await page.locator('#macro-prot-text').innerText();
    expect(protText).toMatch(/\d+\/\d+g/);

    const carbText = await page.locator('#macro-carb-text').innerText();
    expect(carbText).toMatch(/\d+\/\d+g/);
  });
});
