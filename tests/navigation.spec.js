import { test, expect } from '@playwright/test';

test.describe('Navigation Tests', () => {
  test('should load index.html', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page).toHaveTitle(/OpenFoodFacts by accreativos/i);
  });

  test('should load dashboard.html', async ({ page }) => {
    await page.goto('/dashboard.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load diary.html', async ({ page }) => {
    await page.goto('/diary.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load grid.html', async ({ page }) => {
    await page.goto('/grid.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load pantry.html', async ({ page }) => {
    await page.goto('/pantry.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load recipes.html', async ({ page }) => {
    await page.goto('/recipes.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load recipe-editor.html', async ({ page }) => {
    await page.goto('/recipe-editor.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load meal-photos.html', async ({ page }) => {
    await page.goto('/meal-photos.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load scan.html', async ({ page }) => {
    await page.goto('/scan.html');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load settings.html', async ({ page }) => {
    await page.goto('/settings.html');
    await expect(page.locator('body')).toBeVisible();
  });
});
