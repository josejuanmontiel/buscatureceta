import { test, expect } from '@playwright/test';

test.describe('Usability & Ergonomics Improvements E2E Flow', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/#index');
    await page.waitForFunction(() => typeof window.db !== 'undefined');
    await page.evaluate(async () => {
      if (typeof window.__resetUserData === 'function') {
        await window.__resetUserData();
      }
    });
  });

  test('1. Bottom Navigation Bar is visible on mobile and navigates seamlessly', async ({ page }) => {
    // Configurar viewport móvil
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/#index');

    const bottomNav = page.locator('.app-bottom-nav');
    await expect(bottomNav).toBeVisible();

    // Navegar a Carrito
    await page.click('.app-bottom-nav a[data-target="grid"]');
    await expect(page).toHaveURL(/#grid/);

    // Navegar a Despensa
    await page.click('.app-bottom-nav a[data-target="pantry"]');
    await expect(page).toHaveURL(/#pantry/);

    // Navegar a Recetas
    await page.click('.app-bottom-nav a[data-target="recipes"]');
    await expect(page).toHaveURL(/#recipes/);

    // Navegar a Agenda
    await page.click('.app-bottom-nav a[data-target="diary"]');
    await expect(page).toHaveURL(/#diary/);

    // Abrir menú Más (offcanvas)
    await page.click('.app-bottom-nav button.btn-more-menu');
    await expect(page.locator('#appNavOffcanvas')).toBeVisible();
  });

  test('2. Seed Demo Data populates pantry, recipes and diary with 1-click', async ({ page }) => {
    await page.goto('/#index');

    // Botón de carga de datos de demo
    const demoBtn = page.locator('#btn-load-demo-home');
    await expect(demoBtn).toBeVisible();
    await demoBtn.click();

    // Confirmar en el modal
    const confirmBtn = page.locator('#btn-global-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Debe redirigir a #diary y tener entradas
    await expect(page).toHaveURL(/#diary/, { timeout: 10000 });
    await expect(page.locator('.diary-day', { hasText: 'Desayuno' })).toBeVisible({ timeout: 10000 });

    // Verificar que la Despensa tiene los productos de demostración
    await page.goto('/#pantry');
    await expect(page.locator('body')).toContainText('Aceite de Oliva');
    await expect(page.locator('body')).toContainText('Huevos Camperos');

    // Verificar que existen recetas
    await page.goto('/#recipes');
    await expect(page.locator('.card-title', { hasText: 'Arroz con Pollo Saludable' })).toBeVisible();
    await expect(page.locator('.card-title', { hasText: 'Tortilla Rápida de Huevos Camperos' })).toBeVisible();
  });

  test('3. Generate Shopping List from recipe calculates missing pantry stock', async ({ page }) => {
    // Cargar datos demo
    await page.evaluate(async () => {
      await window.__seedDemoData();
    });

    await page.goto('/#recipes');
    await expect(page.locator('.card-title', { hasText: 'Arroz con Pollo Saludable' })).toBeVisible();

    // Clic en botón "🛒 Lista" de la primera receta
    const listBtn = page.locator('button[title="Generar Lista de Compra"]').first();
    await expect(listBtn).toBeVisible();
    await listBtn.click();

    // Modal de confirmación
    const confirmBtn = page.locator('#btn-global-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Redirige al Carrito (#grid) y la lista de la compra activa se muestra
    await expect(page).toHaveURL(/#grid/, { timeout: 10000 });
    await expect(page.locator('#active-shopping-list-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#shopping-list-title')).toContainText('Arroz con Pollo Saludable');
  });

});
