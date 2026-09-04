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
  await page.fill('#database', '/test_products.tsv.zz');
  await page.click('#download-btn');
  await page.waitForURL('**/#grid', { timeout: 60000 });
}

test.describe('Multi-Course Meal & Tracking Flow', () => {

  test('should compose a multi-course meal, save template, plan it, and quick check-in', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/#diary');
    await page.waitForTimeout(500);

    // 1. Abrir modal para añadir comida en el primer día
    const firstAddBtn = page.locator('.diary-day button').first();
    await firstAddBtn.click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // 2. Configurar plato 1: Aperitivo (🍸 Aceitunas / Salchichas como producto rápido)
    await page.selectOption('#meal-course-select', 'appetizer');
    await page.click('#tab-product');
    await page.fill('#meal-product-search', 'Salchichas de Pollo');
    await page.click('#btn-search-meal-product');
    await page.waitForSelector('#meal-product-results button', { state: 'visible' });
    await page.locator('#meal-product-results button').first().click();
    await page.fill('#meal-product-grams', '50');

    // Añadir a la bandeja
    await page.click('#btn-add-to-tray');
    await page.waitForTimeout(300);

    // Verificar que la bandeja tiene 1 plato y muestra badge de aperitivo
    await expect(page.locator('#tray-count')).toHaveText('1');
    await expect(page.locator('#meal-tray-items')).toContainText('Aperitivo');

    // 3. Configurar plato 2: Postre (🍰 Genérico rápido: Manzana fresca)
    await page.selectOption('#meal-course-select', 'dessert');
    await page.fill('#meal-product-search', 'Manzana Fresca');
    await page.click('#btn-search-meal-product');
    // Click en genérico rápido
    await page.locator('button:has-text("+ Genérico rápido")').first().click();
    await page.waitForSelector('#btn-global-confirm', { state: 'visible' });
    await page.click('#btn-global-confirm');
    await page.fill('#meal-product-grams', '150');
    await page.click('#btn-add-to-tray');
    await page.waitForTimeout(300);

    // Verificar que la bandeja tiene 2 platos
    await expect(page.locator('#tray-count')).toHaveText('2');
    await expect(page.locator('#meal-tray-items')).toContainText('Postre');

    // Screenshot del modal de composición multi-plato
    await page.screenshot({ path: 'test-results/screenshot-multi-course-modal.png' });

    // 4. Guardar combinación como Plantilla reutilizable
    await page.click('#btn-save-as-template');
    await expect(page.locator('#saveTemplateModal')).toBeVisible();
    await page.fill('#template-name-input', 'Menú Ligero con Postre');
    await page.click('#btn-do-save-template');
    await expect(page.locator('#saveTemplateModal')).not.toBeVisible();

    // 5. Guardar como PLANIFICADO (⏳)
    await page.click('#btn-save-planned');
    await expect(page.locator('#mealModal')).not.toBeVisible();

    // 6. Verificar visualmente en la cuadrícula de la agenda
    const plannedSlot = page.locator('.meal-slot.status-planned');
    await expect(plannedSlot.first()).toBeVisible();
    await expect(page.locator('.diary-grid')).toContainText('⏳ Plan');
    await expect(page.locator('.diary-grid')).toContainText('🍸');
    await expect(page.locator('.diary-grid')).toContainText('🍰');

    // Debe aparecer el botón [✓ Comer] para confirmación en 1-tap
    const checkInBtn = page.locator('.btn-quick-checkin').first();
    await expect(checkInBtn).toBeVisible();

    // Screenshot de la agenda con la comida planificada y badges
    await page.screenshot({ path: 'test-results/screenshot-agenda-planned.png' });

    // 7. Flujo de Tracking: Ejecutar Quick Check-In
    await checkInBtn.click();
    await expect(page.locator('#mealCheckInModal')).toBeVisible();

    // Desmarcar el postre (simular que omitimos el postre)
    const checkboxes = page.locator('.checkin-item-cb');
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.nth(1).uncheck(); // desmarcar postre

    // Screenshot del modal de check-in con checkboxes
    await page.screenshot({ path: 'test-results/screenshot-checkin-modal.png' });

    // Confirmar consumo
    await page.click('#btn-confirm-checkin');
    await expect(page.locator('#mealCheckInModal')).not.toBeVisible();

    // 8. Verificar que la comida ahora está confirmada
    await page.waitForTimeout(500);
    // El postre omitido debe tener tachado (text-decoration-line-through)
    const skippedItem = page.locator('.text-decoration-line-through');
    await expect(skippedItem).toBeVisible();
    await expect(skippedItem).toContainText('Manzana Fresca');

    // Screenshot final de la agenda tras confirmación
    await page.screenshot({ path: 'test-results/screenshot-agenda-consumed.png' });

    // 9. Verificar que la plantilla guardada se puede recargar en otro día
    const secondAddBtn = page.locator('.diary-day button').nth(2);
    await secondAddBtn.click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // Debe estar en el selector de plantillas
    const templateOption = page.locator('#meal-template-select option', { hasText: 'Menú Ligero con Postre' });
    await expect(templateOption).toBeAttached();
    await page.selectOption('#meal-template-select', { label: 'Menú Ligero con Postre (2 platos)' });
    await page.click('#btn-load-template');
    await page.waitForTimeout(300);

    // La bandeja se ha poblado automáticamente con los 2 platos
    await expect(page.locator('#tray-count')).toHaveText('2');
    await page.locator('#mealModal .btn-close').click();
  });

});
