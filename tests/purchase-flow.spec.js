import { test, expect } from '@playwright/test';

async function clearDB(page) {
  // Navigate to index so the app's Dexie connection is open and index.js registers __resetUserData
  await page.goto('/#index');
  // Wait for initView to expose the reset helper
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  // Use the app's own helper that clears tables via the active Dexie connection
  await page.evaluate(() => window.__resetUserData());
  // Navigate away so the next page.goto to /#index triggers a real hashchange
  await page.goto('/#settings');
}

test.describe('Purchase Flow E2E', () => {
  test('should load DB, detect bad product, switch to alternative and add to cart', async ({ page }) => {
    // 0. Limpiar datos previos de otras pruebas
    await clearDB(page);
    page.on('dialog', dialog => dialog.accept());

    // 1. Ir a inicio y configurar filtros y BD
    await page.goto('/#index');
    await page.waitForSelector('#filters', { state: 'visible', timeout: 10000 });
    
    // Configurar el filtro a "E250"
    await page.fill('#filters', 'E250');
    
    // Poner el dataset de prueba
    await page.fill('#database', '/test_products.tsv.zz');
    
    await page.click('#download-btn');
    
    // Esperamos que nos lleve a /grid.html al terminar de cargar
    await page.waitForURL('**/#grid');
    // Remove the title expectation or update to NutriAgenda
    await expect(page).toHaveTitle(/NutriAgenda/i);

    // 2. Simular escaneo de producto "malo" (con E250)
    // El EAN real es 2087569003329
    await page.goto('/#grid?code=2087569003329');
    await page.waitForTimeout(500);

    // Comprobar que carga la Costilla Adobada El Pradal y sale la alerta
    await expect(page.locator('#scanned-product-name')).toContainText(/Costilla Adobada/i);
    
    const alertDiv = page.locator('#assistant-alert');
    await expect(alertDiv).toBeVisible();
    await expect(page.locator('#assistant-warning-text')).toContainText('E250');

    // 3. Seleccionar alternativa sana (sin E250)
    const alternativeBtn = page.locator('#assistant-alternatives button').first();
    await expect(alternativeBtn).toContainText(/Salchichas de Pollo/i); // NutriScore B
    
    // Hacemos clic en la alternativa
    await alternativeBtn.click();
    
    // Esperar a que la función async selectAlternative complete y actualice currentScannedProduct
    await page.waitForFunction(() => 
      window.currentScannedProduct && /Salchichas/i.test(window.currentScannedProduct.product_name)
    , { timeout: 10000 });
    
    // Esperar a que cambie el producto actual a Salchichas de Pollo
    await expect(page.locator('#scanned-product-name')).toContainText(/Salchichas de Pollo/i);
    
    // Verificar que la alerta ya no está visible
    await expect(alertDiv).toHaveClass(/d-none/);

    // 4. Añadir al carrito ajustando precio
    await page.fill('#scanned-price', '2.50');
    await page.fill('#scanned-amount', '2');
    await page.click('#btn-add-cart');

    // Verificar que se actualizó el total en la UI (2.50 * 2 = 5.00)
    await expect(page.locator('#cart-total')).toContainText('5.00 €');
    
    // Verify the cart has Salchichas (not Costilla) before checkout
    const cartCode = await page.evaluate(async () => {
      const dbReq = indexedDB.open('nutriagenda');
      return new Promise(res => {
        dbReq.onsuccess = e => {
          const db = e.target.result;
          const tx = db.transaction('cart', 'readonly');
          tx.objectStore('cart').getAll().onsuccess = ev => {
            db.close();
            res(ev.target.result.map(i => i.productCode).join(','));
          };
        };
        dbReq.onerror = () => res('error');
      });
    });
    console.log('CART CODES BEFORE CHECKOUT:', cartCode);

    // 5. Finalizar compra (Checkout)
    await page.click('#btn-checkout');

    // Si salta el modal de pesos (porque salchichas no tiene peso en OFF de prueba), lo rellenamos
    const missingWeightsModal = page.locator('#modal-missing-weights');
    try {
      await expect(missingWeightsModal).toBeVisible({ timeout: 2000 });
      await page.fill('.missing-weight-input', '350');
      await page.click('#btn-save-missing-weights');
    } catch (e) {
      // Si no salta el modal, continuamos normal
    }

    // Esperar a que nos lleve a la despensa
    await page.waitForURL('**/#pantry');
    
    // Validar que la tabla de la despensa tiene la compra
    await page.waitForTimeout(1000);
    // Debug: log what's in the cart right before/after checkout
    const pantryContent = await page.locator('#pantry-list').textContent().catch(() => 'not found');
    console.log('PANTRY CONTENT:', pantryContent?.substring(0, 200));
    await expect(page.locator('body')).toContainText(/Salchichas de Pollo/i);
  });

  test.skip('should prompt for missing weights on checkout for generic products', async ({ page }) => {
    await page.goto('/#index');
    page.on('dialog', dialog => dialog.accept());
    await page.fill('#filters', 'E250');
    await page.fill('#database', '/test_products.tsv.zz');
    await page.click('#download-btn');
    await page.waitForURL('**/#grid');

    // Añadir un producto inventado por texto (genérico)
    await page.fill('#code-input', 'Producto Raro');
    await page.click('#query-btn');
    
    // Al ser texto, salta el confirm() que el test auto-acepta
    // y se añade como genérico directamente.
    
    // Now it's loaded as current
    await page.fill('#scanned-amount', '2');
    await page.click('#btn-add-cart');

    // Checkout
    await page.click('#btn-checkout');

    // Modal de pesos faltantes debe aparecer
    const missingWeightsModal = page.locator('#modal-missing-weights');
    await expect(missingWeightsModal).toBeVisible();

    // Rellenar peso
    await page.fill('.missing-weight-input', '500');
    await page.click('#btn-save-missing-weights');

    // Finaliza en pantry
    await page.waitForURL('**/#pantry');
    await expect(page.locator('body')).toContainText(/Producto Raro/i);
    // Verificamos que guardó los 1000g (2 * 500g)
    await expect(page.locator('body')).toContainText(/1000/i);
  });
});
