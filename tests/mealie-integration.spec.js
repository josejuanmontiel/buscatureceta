import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Integración con Mealie y Pack de Recetas Mediterráneas', () => {
  const recipesData = JSON.parse(fs.readFileSync(new URL('../src/data/mediterranean_recipes.json', import.meta.url), 'utf8')).map(r => ({
    ...r,
    slug: r.slug || r.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }));

  test.beforeEach(async ({ page }) => {
    // Interceptar llamadas al API de Mealie (/api/recipes) para tests herméticos y deterministas
    await page.route('**/api/recipes**', async (route) => {
      const url = route.request().url();
      if (url.includes('/api/recipes?perPage=1')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ total: recipesData.length, items: recipesData.slice(0, 1) })
        });
      }
      if (url.includes('/api/recipes/')) {
        const slug = decodeURIComponent(url.split('/api/recipes/')[1]?.split('?')[0]);
        const match = recipesData.find(r => r.slug === slug || slug.includes(r.slug) || r.name.toLowerCase().includes(slug.toLowerCase()));
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(match || recipesData[0])
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: recipesData, total: recipesData.length })
      });
    });
  });

  test('Debe configurar Mealie y verificar conexión en Ajustes', async ({ page }) => {
    await page.goto('/#settings');

    // Configurar credenciales de Mealie
    await page.fill('#mealie-url', 'http://localhost:9925');
    await page.fill('#mealie-token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb25nX3Rva2VuIjp0cnVlLCJpZCI6IjY0NTVhZGM5LWIzYzktNGQ4Yy1hOTMwLWIxM2JmNDY2MTkzOCIsIm5hbWUiOiJzb2NpYWwtdG8tbWVhbGllIiwiaW50ZWdyYXRpb25faWQiOiJnZW5lcmljIiwiZXhwIjoxOTQ1NzcxNTg5fQ.C7N3ZF-INvDcU70BiPxOxx4pFDPYL8yTLqDUJORGksY');
    await page.click('#btn-save-mealie');

    // Probar conexión
    await page.click('#btn-verify-mealie');
    await expect(page.locator('#mealie-verify-result')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#mealie-verify-result')).toContainText('Conexión exitosa');
  });

  test('Debe abrir el modal de Mealie en Recetas y listar las recetas mediterráneas', async ({ page }) => {
    // Configurar token en localStorage antes de navegar
    await page.addInitScript(() => {
      localStorage.setItem('mealie_url', 'http://localhost:9925');
      localStorage.setItem('mealie_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb25nX3Rva2VuIjp0cnVlLCJpZCI6IjY0NTVhZGM5LWIzYzktNGQ4Yy1hOTMwLWIxM2JmNDY2MTkzOCIsIm5hbWUiOiJzb2NpYWwtdG8tbWVhbGllIiwiaW50ZWdyYXRpb25faWQiOiJnZW5lcmljIiwiZXhwIjoxOTQ1NzcxNTg5fQ.C7N3ZF-INvDcU70BiPxOxx4pFDPYL8yTLqDUJORGksY');
    });

    await page.goto('/#recipes');

    // Abrir modal de Mealie
    await page.click('#btn-open-mealie-import');
    await expect(page.locator('#mealieImportModal')).toBeVisible();

    // Comprobar que carga recetas de Mealie
    await expect(page.locator('#mealie-recipes-container')).toContainText('Gazpacho Andaluz Tradicional', { timeout: 8000 });
    await expect(page.locator('#mealie-recipes-container')).toContainText('Lentejas Estofadas con Verduras de la Huerta');

    // Filtrar recetas
    await page.fill('#mealie-recipe-search', 'Salmón');
    await expect(page.locator('#mealie-recipes-container')).toContainText('Salmón al Horno con Verduras Mediterráneas y Romero');
    await expect(page.locator('#mealie-recipes-container')).not.toContainText('Gazpacho Andaluz Tradicional');
  });

  test('Debe importar directamente una receta de Mealie con Smart Match de Alimentos Primarios', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('mealie_url', 'http://localhost:9925');
      localStorage.setItem('mealie_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb25nX3Rva2VuIjp0cnVlLCJpZCI6IjY0NTVhZGM5LWIzYzktNGQ4Yy1hOTMwLWIxM2JmNDY2MTkzOCIsIm5hbWUiOiJzb2NpYWwtdG8tbWVhbGllIiwiaW50ZWdyYXRpb25faWQiOiJnZW5lcmljIiwiZXhwIjoxOTQ1NzcxNTg5fQ.C7N3ZF-INvDcU70BiPxOxx4pFDPYL8yTLqDUJORGksY');
    });

    await page.goto('/#recipes');
    await page.click('#btn-open-mealie-import');
    await expect(page.locator('#mealieImportModal')).toBeVisible();

    // Importar Gazpacho Andaluz Tradicional
    await page.fill('#mealie-recipe-search', 'Gazpacho Andaluz');
    await expect(page.locator('#mealie-recipes-container')).toContainText('Gazpacho Andaluz Tradicional');
    
    // Click en botón de importar
    const importBtn = page.locator('#mealie-recipes-container button:has-text("⚡ Importar")').first();
    await importBtn.click();

    // El modal debe cerrarse y la receta aparecer en la lista de Busca Tu Receta
    await expect(page.locator('#mealieImportModal')).toBeHidden({ timeout: 8000 });
    await expect(page.locator('#recipes-list')).toContainText('Gazpacho Andaluz Tradicional');
  });

  test('Debe importar el Pack de Recetas Mediterráneas en 1 clic', async ({ page }) => {
    await page.goto('/#recipes');

    // Click en botón Pack Mediterráneo
    await page.click('#btn-import-mediterranean-pack');

    // Confirmar en el modal de confirmación global
    const confirmBtn = page.locator('#btn-global-confirm');
    await expect(confirmBtn).toBeVisible({ timeout: 4000 });
    await confirmBtn.click();

    // Verificar que las recetas mediterráneas están en el listado
    await expect(page.locator('#recipes-list')).toContainText('Lentejas Estofadas con Verduras de la Huerta', { timeout: 10000 });
    await expect(page.locator('#recipes-list')).toContainText('Salmón al Horno con Verduras Mediterráneas y Romero');
    await expect(page.locator('#recipes-list')).toContainText('Hummus Casero con Bastones de Zanahoria y Pepino');
  });

});
