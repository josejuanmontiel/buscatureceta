import { test, expect } from '@playwright/test';

test.describe('Navigation Tests', () => {
  test('should load index.html', async ({ page }) => {
    await page.goto('/#index');
    await expect(page).toHaveTitle(/NutriAgenda/i);
  });

  test('should load dashboard.html', async ({ page }) => {
    await page.goto('/#dashboard');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load diary.html', async ({ page }) => {
    await page.goto('/#diary');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load grid.html', async ({ page }) => {
    await page.goto('/#grid');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load pantry.html', async ({ page }) => {
    await page.goto('/#pantry');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load recipes.html', async ({ page }) => {
    await page.goto('/#recipes');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load recipe-editor.html', async ({ page }) => {
    await page.goto('/#recipe-editor');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load meal-photos.html', async ({ page }) => {
    await page.goto('/#meal-photos');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load scan.html', async ({ page }) => {
    await page.goto('/scan.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load settings.html', async ({ page }) => {
    await page.goto('/#settings');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load db-viewer.html and display data', async ({ page }) => {
    // Navigate to index to initialize DB connection
    await page.goto('/#index');
    await page.waitForFunction(() => typeof window.db !== 'undefined');

    // Insert a fake product
    await page.evaluate(async () => {
      await window.db.products.put({
        code: "123456789",
        product_name: "Test Product Grid",
        brands: "TestBrand",
        nutriscore_grade: "a"
      });
    });

    await page.goto('/#db-viewer');
    await expect(page.locator('#db-table')).toBeVisible();
    await expect(page.locator('#db-table.tabulator')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.tabulator-header')).toBeVisible();
    
    // Verify that the data row is rendered
    await expect(page.locator('.tabulator-row', { hasText: 'Test Product Grid' })).toBeVisible({ timeout: 10000 });
  });
});
