import { test, expect } from '@playwright/test';

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  await page.evaluate(() => window.__resetUserData());
}

test.describe('Borrador de Menú Semanal (Weekly Draft) en la Agenda', () => {

  test('Permite redactar borrador rápido de la semana, guardarlo y volcarlo a la agenda', async ({ page }) => {
    await clearDB(page);
    page.on('dialog', dialog => dialog.accept());

    // 1. Ir a la Agenda (#diary)
    await page.goto('/#diary');
    await page.waitForSelector('#diary-grid', { state: 'visible' });

    // 2. Comprobar que el botón de borrador semanal existe y abrir el modal
    const btnOpenDraft = page.locator('#btn-open-weekly-draft');
    await expect(btnOpenDraft).toBeVisible();
    await btnOpenDraft.click();

    // 3. El modal de borrador debe abrirse con los 7 días de la semana
    const modal = page.locator('#modal-weekly-draft');
    await expect(modal).toBeVisible();

    const dayRows = page.locator('.draft-day-row');
    await expect(dayRows).toHaveCount(7);

    // 4. Rellenar platos rápidos para el primer día (Lunes) y segundo día (Martes)
    const firstRow = dayRows.nth(0);
    await firstRow.locator('.draft-lunch-input').fill('Lentejas con verduras');
    await firstRow.locator('.draft-dinner-input').fill('Tortilla francesa con ensalada');

    const secondRow = dayRows.nth(1);
    await secondRow.locator('.draft-lunch-input').fill('Salmón a la plancha');
    await secondRow.locator('.draft-dinner-input').fill('Sopa de fideos');

    // 5. Guardar el borrador
    await page.click('#btn-save-weekly-draft');
    await page.waitForTimeout(300);

    // Cerrar modal
    await modal.locator('.btn-close').click();
    await expect(modal).not.toBeVisible();

    // 6. El badge de borrador activo debe ser visible en el botón
    const draftBadge = page.locator('#badge-weekly-draft-active');
    await expect(draftBadge).toBeVisible();

    // 7. Recargar la página para verificar persistencia del borrador
    await page.reload();
    await page.waitForSelector('#diary-grid', { state: 'visible' });
    await expect(page.locator('#badge-weekly-draft-active')).toBeVisible();

    // Reabrir modal y verificar que los datos siguen ahí
    await page.click('#btn-open-weekly-draft');
    await expect(modal).toBeVisible();
    await expect(firstRow.locator('.draft-lunch-input')).toHaveValue('Lentejas con verduras');
    await expect(firstRow.locator('.draft-dinner-input')).toHaveValue('Tortilla francesa con ensalada');

    // 8. Volcar a la Agenda (⚡ Volcar a la Agenda)
    await page.click('#btn-apply-weekly-draft');
    await expect(modal).not.toBeVisible();

    // 9. Comprobar que en el grid semanal aparecen los platos creados con estado planificado
    const grid = page.locator('#diary-grid');
    await expect(grid).toContainText('Lentejas con verduras');
    await expect(grid).toContainText('Tortilla francesa con ensalada');
    await expect(grid).toContainText('Salmón a la plancha');
    await expect(grid).toContainText('Sopa de fideos');

    // Comprobar que tienen el botón de check-in / planificado
    const checkinBtns = page.locator('.btn-quick-checkin');
    await expect(checkinBtns.first()).toBeVisible();
  });

});
