import { test, expect } from '@playwright/test';
import path from 'path';

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  await page.evaluate(() => window.__resetUserData());
  await page.goto('/#grid');
}

test.describe('Ticket Purchase & Price History Tracking', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER_ERROR:', err.message));
    await clearDB(page);
  });

  test('should attach ticket in cart, checkout and view in history', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());

    // 1. Añadir un producto manual a granel al carrito
    await page.goto('/#grid');
    await page.click('#btn-manual-bulk');
    await page.waitForSelector('#modal-manual-bulk', { state: 'visible' });

    await page.fill('#bulk-product-name', 'Tomates Ensalada');
    await page.fill('#bulk-amount', '1.5');
    await page.fill('#bulk-unit-price', '2.00');
    await page.click('#btn-submit-bulk-item');

    // Comprobar que está en el carrito
    await expect(page.locator('#cart-list')).toContainText('Tomates Ensalada');
    await expect(page.locator('#cart-total')).toContainText('3.00 €');

    // 2. Adjuntar foto de ticket al carrito
    const testImage = path.join(process.cwd(), 'tests/test_barcode_2087569003329.png');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#btn-attach-cart-ticket');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testImage);

    // Verificar que aparece la previsualización del ticket en el carro
    await expect(page.locator('#cart-ticket-thumb-img')).toBeVisible();

    // 3. Pasar por caja
    await page.click('#btn-checkout');
    await page.waitForURL('**/#pantry', { timeout: 10000 });

    // 4. Ir al Historial de Compras y verificar que aparece el ticket
    await page.goto('/#cart-history');
    await page.waitForSelector('#cart-history-list');

    await expect(page.locator('#cart-history-list')).toContainText('Tomates Ensalada');
    await expect(page.locator('#cart-history-list')).toContainText('3.00 €');
    await expect(page.locator('#cart-history-list')).toContainText('Ticket');

    // 5. Abrir visor del ticket
    const viewTicketBtn = page.locator('button:has-text("Ver Ticket")').first();
    await expect(viewTicketBtn).toBeVisible();
    await viewTicketBtn.click();

    await expect(page.locator('#modal-ticket-viewer')).toBeVisible();
    await expect(page.locator('#ticket-viewer-img')).toBeVisible();

    // Cerrar visor
    await page.click('#modal-ticket-viewer .btn-close');
    await expect(page.locator('#modal-ticket-viewer')).not.toBeVisible();
  });

  test('should allow checking out with only ticket (no items) and breakdown products later', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());

    await page.goto('/#grid');

    // 1. Adjuntar foto de ticket sin escanear productos
    const testImage = path.join(process.cwd(), 'tests/test_barcode_2087569003329.png');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#btn-attach-cart-ticket');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testImage);

    await expect(page.locator('#cart-ticket-thumb-img')).toBeVisible();

    // 2. Comprobar persistencia navegando y volviendo
    await page.goto('/#settings');
    await page.goto('/#grid');
    await expect(page.locator('#cart-ticket-thumb-img')).toBeVisible();

    // 3. Pasar por caja (guarda la compra solo con ticket)
    await page.click('#btn-checkout');
    await page.waitForURL('**/#cart-history', { timeout: 10000 });

    // 4. Verificar en el historial
    await expect(page.locator('#cart-history-list')).toContainText('Ticket');
    await expect(page.locator('#cart-history-list')).toContainText('Compra registrada por ticket');

    // 5. Añadir producto al desglose de esta compra
    await page.click('button:has-text("➕ Añadir Producto")');
    await page.waitForSelector('#modal-history-add-product', { state: 'visible' });

    await page.fill('#history-add-product-name', 'Aceite de Oliva');
    await page.fill('#history-add-amount', '2');
    await page.fill('#history-add-price', '6.50');
    await page.click('#btn-save-history-add-product');

    await expect(page.locator('#modal-history-add-product')).not.toBeVisible();
    await expect(page.locator('#cart-history-list')).toContainText('Aceite de Oliva');
    await expect(page.locator('#cart-history-list')).toContainText('13.00 €');

    // 6. Modificar el precio unitario del item inline en el historial
    const priceInput = page.locator('.history-item-price').first();
    await priceInput.fill('7.00');
    await priceInput.dispatchEvent('change');

    // Total ahora debe ser 2 * 7.00 = 14.00 €
    await expect(page.locator('#cart-history-list')).toContainText('14.00 €');

    // 7. Verificar que el precio se guardó en priceHistory
    const priceInDb = await page.evaluate(async () => {
      const dbReq = indexedDB.open('nutriagenda');
      return new Promise((resolve) => {
        dbReq.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction('priceHistory', 'readonly');
          const store = tx.objectStore('priceHistory');
          store.getAll().onsuccess = (ev) => {
            const all = ev.target.result;
            db.close();
            resolve(all.length > 0 ? all[all.length - 1].price : null);
          };
        };
      });
    });

    expect(priceInDb).toBe(7);
  });
});
