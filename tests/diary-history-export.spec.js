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

test.describe('Diary History & Modular Export for PrimaryFoods', () => {

  test('should record lifecycle versions (plan -> adjust -> consume) and export for PrimaryFoods', async ({ page }) => {
    await loadTestDB(page);
    await page.goto('/#diary');
    await page.waitForTimeout(500);

    // 1. Crear un plan inicial en el primer día
    const firstAddBtn = page.locator('.diary-day button').first();
    await firstAddBtn.click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // Plato 1: Principal (Salchichas)
    await page.selectOption('#meal-course-select', 'main');
    await page.click('#tab-product');
    await page.fill('#meal-product-search', 'Salchichas de Pollo');
    await page.click('#btn-search-meal-product');
    await page.waitForSelector('#meal-product-results button', { state: 'visible' });
    await page.locator('#meal-product-results button').first().click();
    await page.fill('#meal-product-grams', '100');
    await page.click('#btn-add-to-tray');

    // Guardar como PLANIFICADO
    await page.click('#btn-save-planned');
    await expect(page.locator('#mealModal')).not.toBeVisible();

    // 2. Comprobar que en IndexedDB se ha creado la primera snapshot de historial: plan_created (v1)
    const initialHistory = await page.evaluate(async () => {
      const dbInstance = window.db || (await import('/src/js/db/schema.js')).db;
      return await dbInstance.diaryVersions.toArray();
    });
    expect(initialHistory.length).toBeGreaterThanOrEqual(1);
    const v1 = initialHistory[initialHistory.length - 1];
    expect(v1.action).toBe('plan_created');
    expect(v1.versionNumber).toBe(1);

    // 3. Replanificar / Ajustar: Añadir un segundo plato a la misma comida
    await page.locator('.diary-day').first().locator('button:has-text("+ Añadir")').click();
    await expect(page.locator('#mealModal')).toBeVisible();

    // Plato 2: Postre (Manzana inventada)
    await page.selectOption('#meal-course-select', 'dessert');
    await page.fill('#meal-product-search', 'Manzana Verde');
    await page.click('#btn-search-meal-product');
    await page.locator('button:has-text("+ Genérico rápido")').first().click();
    await page.waitForSelector('#btn-global-confirm', { state: 'visible' });
    await page.click('#btn-global-confirm');
    await page.fill('#meal-product-grams', '150');
    await page.click('#btn-add-to-tray');

    // Guardar nuevamente como PLANIFICADO (Ajuste de plan)
    await page.click('#btn-save-planned');
    await expect(page.locator('#mealModal')).not.toBeVisible();

    // Verificar en DB: segunda snapshot plan_adjusted (v2)
    const adjustedHistory = await page.evaluate(async () => {
      const dbInstance = window.db || (await import('/src/js/db/schema.js')).db;
      return await dbInstance.diaryVersions.toArray();
    });
    expect(adjustedHistory.length).toBeGreaterThanOrEqual(2);
    const v2 = adjustedHistory[adjustedHistory.length - 1];
    expect(v2.action).toBe('plan_adjusted');
    expect(v2.versionNumber).toBe(2);

    // 4. Confirmar consumo con Quick Check-In (omitiendo el postre)
    const checkInBtn = page.locator('.btn-quick-checkin').first();
    await checkInBtn.click();
    await expect(page.locator('#mealCheckInModal')).toBeVisible();

    const checkboxes = page.locator('.checkin-item-cb');
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.nth(1).uncheck(); // omitir postre

    await page.click('#btn-confirm-checkin');
    await expect(page.locator('#mealCheckInModal')).not.toBeVisible();
    await page.waitForTimeout(400);

    // Verificar en DB: tercera snapshot consumed (v3)
    const consumedHistory = await page.evaluate(async () => {
      const dbInstance = window.db || (await import('/src/js/db/schema.js')).db;
      return await dbInstance.diaryVersions.toArray();
    });
    expect(consumedHistory.length).toBeGreaterThanOrEqual(3);
    const v3 = consumedHistory[consumedHistory.length - 1];
    expect(v3.action).toBe('consumed');
    expect(v3.versionNumber).toBe(3);

    // 5. Abrir detalle de la comida y ver la Línea Temporal en la UI
    const mealSlot = page.locator('.meal-slot').first();
    await mealSlot.click();
    await expect(page.locator('#itemDetailModal')).toBeVisible();

    const btnHistory = page.locator('#btn-view-meal-history');
    await expect(btnHistory).toBeVisible();
    await btnHistory.click();

    // Modal de historial debe mostrar las 3 revisiones (v1, v2, v3)
    await expect(page.locator('#mealHistoryModal')).toBeVisible();
    const timelineItems = page.locator('#mealHistoryTimeline .timeline-item');
    await expect(timelineItems).toHaveCount(3);
    await expect(page.locator('#mealHistoryTimeline')).toContainText('Plan creado');
    await expect(page.locator('#mealHistoryTimeline')).toContainText('Plan ajustado');
    await expect(page.locator('#mealHistoryTimeline')).toContainText('Consumido');

    // Capturar screenshot del modal de historial
    await page.screenshot({ path: 'test-results/screenshot-meal-history-timeline.png' });
    await page.locator('#mealHistoryModal .btn-close').click();

    // 6. Probar Exportación Modular para PrimaryFoods en Ajustes
    await page.goto('/#settings');
    await page.waitForTimeout(400);

    // Verificar botones de exportación modular
    const btnPF = page.locator('#btn-export-primaryfoods');
    const btnPantry = page.locator('#btn-export-pantry');
    const btnDiaryHistory = page.locator('#btn-export-diary-history');

    await expect(btnPF).toBeVisible();
    await expect(btnPantry).toBeVisible();
    await expect(btnDiaryHistory).toBeVisible();

    // Capturar screenshot de la sección de exportación en Ajustes
    await btnPF.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/screenshot-settings-primaryfoods-export.png' });

    // Disparar descarga real y validar contenido del archivo JSON descargado
    const downloadPromise = page.waitForEvent('download');
    await btnPF.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('primaryfoods_package_');

    const downloadPath = await download.path();
    const fileContent = fs.readFileSync(downloadPath, 'utf-8');
    const exportPackage = JSON.parse(fileContent);

    expect(exportPackage.schemaVersion).toBe('1.0');
    expect(exportPackage.app).toBe('buscatureceta');
    expect(Array.isArray(exportPackage.pantry)).toBe(true);
    expect(Array.isArray(exportPackage.diary)).toBe(true);
    expect(Array.isArray(exportPackage.diaryVersions)).toBe(true);
    expect(exportPackage.diaryVersions.length).toBeGreaterThanOrEqual(3);
  });

});
