import { test, expect } from '@playwright/test';

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  await page.evaluate(() => window.__resetUserData());
}

test.describe('Flujo de Colaboraciones de Metadatos (Pesos y Nombres) a OpenFoodFacts', () => {

  test('Guardar peso faltante en checkout encola una colaboración de metadatos en la Zona OFF', async ({ page }) => {
    await clearDB(page);
    page.on('dialog', dialog => dialog.accept());

    // 1. Ir al Carrito
    await page.goto('/#grid');
    await page.waitForSelector('#code-input', { state: 'visible' });

    // 2. Añadir producto sin peso (Couscous Hacendado 8402001026270)
    const testCode = '8402001026270';
    await page.fill('#code-input', testCode);
    await page.click('#query-btn');

    // Esperar a que termine la búsqueda (o bien entra al carro o bien salta modal de desconocido)
    const unknownBtn = page.locator('#btn-unknown-add-generic');
    if (await unknownBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await unknownBtn.click();
    }
    await expect(page.locator('.btn-rename-cart-item').first()).toBeVisible({ timeout: 10000 });

    // 3. Hacer clic en Checkout para que salte el modal de pesos faltantes
    await page.click('#btn-checkout');
    await page.waitForSelector('#modal-missing-weights', { state: 'visible', timeout: 5000 });

    // 4. Rellenar el peso (ej. 500 g) y guardar
    const weightInput = page.locator('.missing-weight-input').first();
    await weightInput.fill('500');
    await page.click('#btn-save-missing-weights');
    // Esperar a que el checkout finalice su redirección diferida a #pantry
    await page.waitForURL(/.*#pantry.*/, { timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(1200);

    // 5. Verificar directamente en IndexedDB que se ha creado la colaboración de metadata
    const metadataUpload = await page.evaluate(async (code) => {
      const dbReq = indexedDB.open('nutriagenda');
      return new Promise(res => {
        dbReq.onsuccess = e => {
          const db = e.target.result;
          const tx = db.transaction('pendingUploads', 'readonly');
          tx.objectStore('pendingUploads').getAll().onsuccess = ev => {
            db.close();
            const items = ev.target.result;
            const found = items.find(i => i.barcode === code && i.type === 'metadata');
            res(found || null);
          };
        };
        dbReq.onerror = () => res(null);
      });
    }, testCode);

    expect(metadataUpload).not.toBeNull();
    expect(metadataUpload.type).toBe('metadata');
    expect(metadataUpload.fields.quantity).toBe('500 g');
    expect(metadataUpload.fields.product_quantity).toBe('500');

    // 6. Navegar a la Zona de Colaboraciones (#off-contributions)
    await page.goto('/#off-contributions');
    await page.waitForSelector('#off-uploads-container', { state: 'visible' });

    // Debe mostrar la tarjeta con la etiqueta de tipo y el peso
    const card = page.locator(`#off-item-${metadataUpload.id}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('Datos del producto');
    await expect(card).toContainText('Peso: 500 g');

    // 7. Probar filtro por tipo:
    // Al filtrar por "Fotos" debe desaparecer
    await page.click('button[data-type-filter="photos"]');
    await expect(card).not.toBeVisible();

    // Al filtrar por "Datos" debe volver a aparecer
    await page.click('button[data-type-filter="metadata"]');
    await expect(card).toBeVisible();

    // Al filtrar por "Todo" debe ser visible
    await page.click('button[data-type-filter="all"]');
    await expect(card).toBeVisible();
  });

  test('Renombrar un producto con código de barras encola o actualiza su nombre en la Zona OFF', async ({ page }) => {
    await clearDB(page);
    page.on('dialog', dialog => dialog.accept());

    await page.goto('/#grid');
    await page.waitForSelector('#code-input', { state: 'visible' });

    // Añadir producto
    const testCode = '8412345678901';
    await page.fill('#code-input', testCode);
    await page.click('#query-btn');
    
    // Confirmar en el modal de desconocido para añadirlo al carrito
    await page.waitForSelector('#btn-unknown-add-generic', { state: 'visible', timeout: 10000 });
    await page.click('#btn-unknown-add-generic');
    await expect(page.locator('#cart-list')).toContainText(testCode);

    // Renombrar el producto
    const renameBtn = page.locator('.btn-rename-cart-item').first();
    await expect(renameBtn).toBeVisible();
    await renameBtn.click();

    const renameInput = page.locator('.cart-rename-input').first();
    await expect(renameInput).toBeVisible();
    await renameInput.fill('Couscous Integral Especial');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Ir a la Zona de Colaboraciones
    await page.goto('/#off-contributions');
    await page.waitForSelector('#off-uploads-container', { state: 'visible' });

    // Verificar que aparece la colaboración de metadatos con el nombre actualizado
    const itemCard = page.locator('.off-item-card', { hasText: 'Couscous Integral Especial' });
    await expect(itemCard).toBeVisible();
    await expect(itemCard).toContainText('Datos del producto');
    await expect(itemCard).toContainText('Nombre: Couscous Integral Especial');
  });

});
