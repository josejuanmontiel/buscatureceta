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

  test('should load db-viewer.html', async ({ page }) => {
    await page.goto('/#db-viewer');
    await expect(page.locator('#db-table')).toBeVisible();
  });
});
