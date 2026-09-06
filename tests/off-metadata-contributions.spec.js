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

  test('Modal de edición de metadatos en Zona OFF muestra previsualización en vivo y guarda nombre y peso', async ({ page }) => {
    await clearDB(page);
    page.on('dialog', dialog => dialog.accept());

    // 1. Simular registro de metadata inicial (solo peso, sin nombre) directamente en IndexedDB
    await page.goto('/#off-contributions');
    await page.evaluate(async () => {
      const dbReq = indexedDB.open('nutriagenda');
      return new Promise(res => {
        dbReq.onsuccess = e => {
          const db = e.target.result;
          const tx = db.transaction('pendingUploads', 'readwrite');
          tx.objectStore('pendingUploads').add({
            barcode: '8402001026270',
            productName: 'Producto 8402001026270',
            type: 'metadata',
            fields: { quantity: '500 g', product_quantity: '500', lang: 'es' },
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          tx.oncomplete = () => {
            db.close();
            res();
          };
        };
      });
    });

    // Recargar vista para ver la tarjeta
    await page.goto('/#off-contributions');
    await page.waitForSelector('#off-uploads-container', { state: 'visible' });

    // 2. Filtrar por datos
    await page.click('button[data-type-filter="metadata"]');
    const card = page.locator('.off-item-card').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('Falta nombre');
    await expect(card).toContainText('Peso: 500 g');

    // 3. Abrir modal "Editar datos"
    const editBtn = card.locator('button:has-text("Editar datos")');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // 4. Comprobar que el modal se abre y muestra el código y valores iniciales
    const modal = page.locator('#modal-off-edit-metadata');
    await expect(modal).toBeVisible();
    await expect(page.locator('#edit-meta-barcode')).toHaveValue('8402001026270');
    await expect(page.locator('#edit-meta-quantity')).toHaveValue('500 g');
    await expect(page.locator('#preview-meta-name')).toContainText('[Sin nombre]');
    await expect(page.locator('#preview-meta-quantity')).toContainText('500 g');

    // 5. Rellenar nombre y cambiar peso
    await page.fill('#edit-meta-product-name', 'Couscous Hacendado Especial');
    await expect(page.locator('#preview-meta-name')).toHaveText('"Couscous Hacendado Especial"');

    await page.fill('#edit-meta-quantity', '750 g');
    await expect(page.locator('#preview-meta-quantity')).toHaveText('"750 g"');
    await expect(page.locator('#preview-meta-product-quantity')).toHaveText('750');

    // 6. Guardar cambios
    await page.click('#btn-save-meta-changes');
    await expect(modal).not.toBeVisible();

    // 7. Verificar que la tarjeta refleja los datos actualizados sin la alerta de falta nombre
    await expect(card).toContainText('Couscous Hacendado Especial');
    await expect(card).toContainText('Nombre: Couscous Hacendado Especial');
    await expect(card).toContainText('Peso: 750 g');
    await expect(card).not.toContainText('Falta nombre');
  });

  test('Completar nombre y peso faltante en modal de checkout guarda ambos datos y encola a OFF', async ({ page }) => {
    await clearDB(page);
    page.on('dialog', dialog => dialog.accept());

    const testCode = '8419999000011';

    // 1. Sembrar en db.products un producto que no tiene nombre ni peso en OFF
    await page.goto('/#grid');
    await page.evaluate(async (code) => {
      const dbReq = indexedDB.open('nutriagenda');
      return new Promise(res => {
        dbReq.onsuccess = e => {
          const db = e.target.result;
          const tx = db.transaction('products', 'readwrite');
          tx.objectStore('products').put({
            code: code,
            product_name: '',
            product_quantity: '',
            brands: 'Hacendado'
          });
          tx.oncomplete = () => {
            db.close();
            res();
          };
        };
      });
    }, testCode);

    // 2. Añadir al carrito
    await page.waitForSelector('#code-input', { state: 'visible' });
    await page.fill('#code-input', testCode);
    await page.click('#query-btn');
    await expect(page.locator('.btn-rename-cart-item').first()).toBeVisible({ timeout: 10000 });

    // Checkout abre el modal de datos pendientes
    await page.click('#btn-checkout');
    await page.waitForSelector('#modal-missing-weights', { state: 'visible', timeout: 5000 });

    // Rellenar nombre (que debe estar visible al faltar el nombre oficial) y peso
    const nameInput = page.locator('.missing-name-input').first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Couscous Grano Medio');
    const weightInput = page.locator('.missing-weight-input').first();
    await weightInput.fill('600');
    await page.click('#btn-save-missing-weights');

    await page.waitForURL(/.*#pantry.*/, { timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(1200);

    // Comprobar en #off-contributions que la tarjeta tiene nombre y peso
    await page.goto('/#off-contributions');
    await page.waitForSelector('#off-uploads-container', { state: 'visible' });
    await page.click('button[data-type-filter="metadata"]');

    const card = page.locator('.off-item-card', { hasText: 'Couscous Grano Medio' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Peso: 600 g');
    await expect(card).toContainText('Nombre: Couscous Grano Medio');
  });

});


