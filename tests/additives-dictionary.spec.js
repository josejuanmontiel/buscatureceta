import { test, expect } from '@playwright/test';

test.describe('Additives Dictionary', () => {
  test('should render the additives view with all cards', async ({ page }) => {
    await page.goto('/#additives');

    // Heading visible
    await expect(page.locator('h1')).toContainText('Diccionario de Aditivos');

    // Search input visible
    await expect(page.locator('#additives-search-input')).toBeVisible();

    // Cards should render (waits for JS to fill the list)
    await page.waitForSelector('.card', { state: 'visible', timeout: 10000 });
    const cards = page.locator('.card');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(5);
  });

  test('should filter additives by code', async ({ page }) => {
    await page.goto('/#additives');
    await page.waitForSelector('.card', { state: 'visible', timeout: 10000 });

    // Search for E250
    await page.fill('#additives-search-input', 'E250');
    await page.click('#btn-search-additives');
    // Cards should update (at least 1, only E250 related)
    await page.waitForTimeout(500);
    const cards = page.locator('.card');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    await expect(cards.first()).toContainText('E250');
  });

  test('should filter additives by name', async ({ page }) => {
    await page.goto('/#additives');
    await page.waitForSelector('.card', { state: 'visible', timeout: 10000 });

    await page.fill('#additives-search-input', 'Aspartamo');
    await page.click('#btn-search-additives');
    await page.waitForTimeout(500);
    await expect(page.locator('.card').first()).toContainText('Aspartamo');
  });

  test('should show Wikipedia and EU links for each card', async ({ page }) => {
    await page.goto('/#additives');
    await page.waitForSelector('.card', { state: 'visible', timeout: 10000 });

    const firstCard = page.locator('.card').first();
    // Wikipedia link
    await expect(firstCard.locator('a[href*="es.wikipedia.org"]')).toBeVisible();
    // EU link (uses ec.europa.eu since 2024 portal update)
    await expect(firstCard.locator('a[href*="ec.europa.eu"]')).toBeVisible();
  });

  test('should show settings button for additives dictionary in settings view', async ({ page }) => {
    await page.goto('/#settings');
    await expect(page.locator('button:has-text("Diccionario de Aditivos")')).toBeVisible();
  });
});
