import { test, expect } from '@playwright/test';

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  await page.evaluate(() => window.__resetUserData());
  await page.goto('/#settings');
}

test.describe('Flujo de producto desconocido en carro y botón OFF al loguearse', () => {

  test('PASO 1 - Sin login: escanear producto desconocido -> entra en carro como GENERIC_', async ({ page }) => {
    await clearDB(page);

    await page.goto('/#grid');
    // Limpiar localStorage
    await page.evaluate(() => {
      localStorage.removeItem('off_user');
      localStorage.removeItem('off_password');
    });

    const unknownCode = '9990000000001';
    await page.fill('#code-input', unknownCode);
    await page.click('#query-btn');
    await page.waitForSelector('#btn-unknown-add-generic', { state: 'visible' });
    await page.click('#btn-unknown-add-generic');
    await page.waitForTimeout(500);

    // El item debe aparecer en el carro
    await expect(page.locator('#cart-list')).toContainText(`Producto ${unknownCode}`, { timeout: 10000 });

    // Verificar que internamente su productCode empieza por GENERIC_
    const cartCodes = await page.evaluate(async () => {
      const dbReq = indexedDB.open('nutriagenda');
      return new Promise(res => {
        dbReq.onsuccess = e => {
          const db = e.target.result;
          const tx = db.transaction('cart', 'readonly');
          tx.objectStore('cart').getAll().onsuccess = ev => {
            db.close();
            res(ev.target.result.map(i => i.productCode));
          };
        };
        dbReq.onerror = () => res(['error']);
      });
    });
    console.log('CART CODES (should be GENERIC_...):', cartCodes);
    expect(cartCodes.some(c => c.startsWith('GENERIC_'))).toBe(true);

    // Sin login NO debe aparecer botón OFF
    const offBtnCount = await page.locator('#cart-list button:has-text("OFF")').count();
    console.log('OFF button count (should be 0):', offBtnCount);
    expect(offBtnCount).toBe(0);
  });

  test('PASO 2 - Con login: el botón OFF aparece para productos GENERIC_', async ({ page }) => {
    await clearDB(page);
    await page.goto('/#grid');

    // Configurar login OFF ANTES de escanear
    await page.evaluate(() => {
      localStorage.setItem('off_user', 'accreativos');
      localStorage.setItem('off_password', 'Cr0nauer.');
    });

    const unknownCode = '9990000000001';
    await page.fill('#code-input', unknownCode);
    await page.click('#query-btn');
    await page.waitForSelector('#btn-unknown-add-generic', { state: 'visible' });
    await page.click('#btn-unknown-add-generic');
    await page.waitForTimeout(500);

    // El item debe aparecer en el carro
    await expect(page.locator('#cart-list')).toContainText(`Producto ${unknownCode}`, { timeout: 10000 });

    // CON login SÍ debe aparecer el botón OFF azul
    const offButton = page.locator('#cart-list button:has-text("OFF")');
    const offBtnCount = await offButton.count();
    console.log('OFF button count (should be 1):', offBtnCount);
    await expect(offButton).toBeVisible({ timeout: 3000 });
  });

  test('PASO 3 - Login después de añadir: navegar settings -> grid muestra botón OFF', async ({ page }) => {
    await clearDB(page);
    await page.goto('/#grid');

    // Sin login, añadir producto desconocido
    await page.evaluate(() => {
      localStorage.removeItem('off_user');
      localStorage.removeItem('off_password');
    });

    const unknownCode = '9990000000001';
    await page.fill('#code-input', unknownCode);
    await page.click('#query-btn');
    await page.waitForSelector('#btn-unknown-add-generic', { state: 'visible' });
    await page.click('#btn-unknown-add-generic');
    await page.waitForTimeout(500);
    await expect(page.locator('#cart-list')).toContainText(`Producto ${unknownCode}`, { timeout: 10000 });

    // Sin login: sin botón OFF
    expect(await page.locator('#cart-list button:has-text("OFF")').count()).toBe(0);

    // Ir a Settings y logearse (guardar credenciales)
    await page.goto('/#settings');
    await page.waitForFunction(() => {
      const el = document.getElementById('cred-status');
      return el && !el.textContent.includes('Cargando');
    }, { timeout: 10000 });
    await page.waitForSelector('#cred-username', { state: 'visible', timeout: 5000 });
    await page.fill('#cred-username', 'accreativos');
    await page.fill('#cred-password', 'Cr0nauer.');
    await page.click('#btn-save-credentials');
    await expect(page.locator('#cred-status')).toContainText('accreativos', { timeout: 3000 });

    // Volver al carrito
    await page.goto('/#grid');
    await page.waitForTimeout(1000);

    // El producto sigue en el carro
    await expect(page.locator('#cart-list')).toContainText(`Producto ${unknownCode}`, { timeout: 10000 });

    // Ahora SÍ debe aparecer el botón OFF
    const offButton = page.locator('#cart-list button:has-text("OFF")');
    const offCount = await offButton.count();
    console.log('OFF button count after login (should be 1):', offCount);
    await expect(offButton).toBeVisible({ timeout: 3000 });
  });

  test('PASO 4 - Click en botón OFF muestra el panel con el código de barras real (no GENERIC_)', async ({ page }) => {
    await clearDB(page);
    await page.goto('/#grid');

    // Con login desde el principio
    await page.evaluate(() => {
      localStorage.setItem('off_user', 'accreativos');
      localStorage.setItem('off_password', 'Cr0nauer.');
    });

    const unknownCode = '9990000000001';
    await page.fill('#code-input', unknownCode);
    await page.click('#query-btn');
    await page.waitForSelector('#btn-unknown-add-generic', { state: 'visible' });
    await page.click('#btn-unknown-add-generic');
    await page.waitForTimeout(500);
    await expect(page.locator('#cart-list')).toContainText(`Producto ${unknownCode}`, { timeout: 10000 });

    // Click en el botón OFF de la cámara
    const offButton = page.locator('#cart-list button:has-text("OFF")');
    await expect(offButton).toBeVisible({ timeout: 3000 });
    await offButton.click();

    // El panel de foto se abre
    await expect(page.locator('#unknown-product-panel')).toBeVisible({ timeout: 3000 });

    // El label debe mostrar el código de barras REAL (sin prefijo GENERIC_)
    const barcodeLabel = await page.locator('#unknown-barcode-label').textContent();
    console.log('Barcode label in panel (should be real code):', barcodeLabel);
    await expect(page.locator('#unknown-barcode-label')).toHaveText(unknownCode);
  });

});
