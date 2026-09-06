import { test, expect } from '@playwright/test';

// 10x10 valid PNG buffer
const sampleImageBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64'
);

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.db !== 'undefined');
  await page.evaluate(async () => {
    if (typeof window.__resetUserData === 'function') {
      await window.__resetUserData();
    }
    if (window.db?.pendingUploads) {
      await window.db.pendingUploads.clear();
    }
  });
}

test.describe('OpenFoodFacts Image Capture, Cropping, Re-editing and Queue Zone', () => {

  test('should capture/upload image, crop it, save to OFF queue, allow re-editing, and manage in dedicated OFF zone', async ({ page }) => {
    await clearDB(page);

    // 1. Ir al Carrito / Escáner
    await page.goto('/#grid');
    await page.waitForFunction(() => typeof window.db !== 'undefined');
    await page.evaluate(() => {
      localStorage.setItem('off_user', 'test_contributor');
      localStorage.setItem('off_password', 'secret123');
    });

    // Buscar código no existente en el catálogo local -> se añade al carro como no catalogado
    const testBarcode = '8480000999888';
    await page.fill('#code-input', testBarcode);
    await page.click('#query-btn');
    await page.waitForSelector('#btn-unknown-add-generic', { state: 'visible' });
    await page.click('#btn-unknown-add-generic');

    // El item aparece en el carrito con el botón "OFF"
    const offBtn = page.locator('button[title="Subir foto a OpenFoodFacts"]').first();
    await expect(offBtn).toBeVisible();
    await offBtn.click();

    // El panel de producto desconocido debe mostrarse
    const unknownPanel = page.locator('#unknown-product-panel');
    await expect(unknownPanel).toBeVisible();
    await expect(page.locator('#unknown-barcode-label')).toContainText(testBarcode);

    // 2. Probar subida de imagen y recorte interactivo (Paso 1: Captura + Cropping)
    await page.setInputFiles('#unknown-file-input', {
      name: 'yogur_etiqueta.png',
      mimeType: 'image/png',
      buffer: sampleImageBuffer
    });

    // El cropper canvas debe hacerse visible
    const cropperContainer = page.locator('#unknown-cropper-container');
    await expect(cropperContainer).toBeVisible();
    const cropperCanvas = page.locator('#unknown-crop-canvas');
    await expect(cropperCanvas).toBeVisible();

    // Probar controles de aspecto y rotación
    await cropperContainer.locator('button[data-aspect="1:1"]').click();
    await page.click('#btn-crop-rotate'); // rotar 90°

    // Aplicar recorte
    await page.click('#btn-apply-crop');

    // El cropper se oculta y aparece el preview recortado con badge
    await expect(cropperContainer).not.toBeVisible();
    const previewContainer = page.locator('#photo-preview-container');
    await expect(previewContainer).toBeVisible();
    await expect(page.locator('#photo-preview-badge')).toContainText('Recortada');

    // Rellenar nombre y tipo
    await page.fill('#unknown-product-name', 'Yogur Proteína Fresa');
    await page.selectOption('#unknown-image-type', 'front');

    // Guardar en cola OFF
    await page.click('#btn-save-photo');

    // 3. Re-edición (Paso 2): El panel ahora muestra la foto registrada en la lista de fotos del producto
    const existingSection = page.locator('#unknown-existing-section');
    await expect(existingSection).toBeVisible();
    await expect(page.locator('#unknown-existing-list')).toContainText('Etiqueta');

    // Verificar en Dexie que el registro se guardó correctamente
    const savedUpload = await page.evaluate(async (barcode) => {
      return await window.db.pendingUploads.where('barcode').equals(barcode).first();
    }, testBarcode);

    expect(savedUpload).toBeTruthy();
    expect(savedUpload.barcode).toBe(testBarcode);
    expect(savedUpload.productName).toBe('Yogur Proteína Fresa');
    expect(savedUpload.type).toBe('front');
    expect(savedUpload.status).toBe('pending');
    expect(savedUpload.imageData).toBeTruthy();

    // Clic en Editar en la foto existente
    await page.click('#unknown-existing-list button[title="Editar / Re-recortar"]');

    // Debe abrir el modo edición en el panel
    await expect(page.locator('#unknown-edit-mode-badge')).toBeVisible();
    await expect(page.locator('#btn-save-photo-text')).toContainText('Actualizar foto');

    // El cropper vuelve a estar activo
    await expect(cropperContainer).toBeVisible();

    // Cambiar tipo a "nutrition" y modificar recorte
    await page.selectOption('#unknown-image-type', 'nutrition');
    await page.click('#btn-crop-rotate');
    await page.click('#btn-apply-crop');

    // Actualizar foto en la cola
    await page.click('#btn-save-photo');

    // Esperar a que se complete la actualización en Dexie
    await page.waitForFunction(async (barcode) => {
      const item = await window.db.pendingUploads.where('barcode').equals(barcode).first();
      return item && item.type === 'nutrition';
    }, testBarcode);

    const updatedUpload = await page.evaluate(async (barcode) => {
      return await window.db.pendingUploads.where('barcode').equals(barcode).first();
    }, testBarcode);

    expect(updatedUpload.type).toBe('nutrition');
    expect(updatedUpload.status).toBe('pending');

    // 4. Zona Dedicada OFF (Paso 3): Navegar a /#off-contributions
    await page.goto('/#off-contributions');
    await page.waitForFunction(() => typeof window.db !== 'undefined');

    // Verificar KPIs
    await expect(page.locator('#kpi-pending-count')).toHaveText('1');
    await expect(page.locator('#kpi-total-count')).toHaveText('1');

    // Verificar que aparece en la lista de contribuciones
    const offCard = page.locator(`#off-item-${updatedUpload.id}`);
    await expect(offCard).toBeVisible();
    await expect(offCard).toContainText('Yogur Proteína Fresa');
    await expect(offCard).toContainText(testBarcode);
    await expect(offCard).toContainText('Información nutricional');

    // Probar modal de credenciales OFF
    await page.click('#btn-open-credentials');
    await expect(page.locator('#modal-off-credentials')).toBeVisible();
    await page.fill('#off-user-input', 'test_contributor');
    await page.fill('#off-password-input', 'secret123');
    await page.click('#btn-save-credentials');
    await expect(page.locator('#modal-off-credentials')).not.toBeVisible();

    const creds = await page.evaluate(() => {
      return {
        user: localStorage.getItem('off_user'),
        pass: localStorage.getItem('off_password')
      };
    });
    expect(creds.user).toBe('test_contributor');
    expect(creds.pass).toBe('secret123');

    // Probar editar desde la zona OFF
    await offCard.locator('button[title="Editar recorte o datos"]').click();
    await expect(page.locator('#modal-off-edit')).toBeVisible();
    await page.fill('#edit-product-name', 'Yogur Proteína Fresa 500g');
    await page.click('#btn-save-edited-upload');
    await expect(page.locator('#modal-off-edit')).not.toBeVisible();

    // Comprobar que se actualizó el nombre en la lista
    await expect(offCard).toContainText('Yogur Proteína Fresa 500g');

    // 5. Probar añadir OTRA foto al mismo producto (+ Foto en la tarjeta)
    await offCard.locator('button[title="Añadir otra foto a este producto"]').click();
    await expect(page.locator('#modal-off-edit')).toBeVisible();
    await expect(page.locator('#modal-off-edit-heading')).toContainText('Yogur Proteína Fresa 500g');
    await expect(page.locator('#edit-barcode')).toHaveValue(testBarcode);

    // Cambiar tipo o dejar el sugerido (e.g. ingredients)
    await page.selectOption('#edit-image-type', 'ingredients');

    // Cargar nueva imagen desde archivo
    await page.setInputFiles('#modal-file-input', {
      name: 'yogur_ingredientes.png',
      mimeType: 'image/png',
      buffer: sampleImageBuffer
    });

    // El canvas del cropper se inicializa en el modal
    const modalCropperCanvas = page.locator('#modal-off-edit #edit-cropper-canvas');
    await expect(modalCropperCanvas).toBeVisible();

    // Guardar la foto adicional en la cola
    await page.click('#btn-save-edited-upload');
    await expect(page.locator('#modal-off-edit')).not.toBeVisible();

    // Comprobar que ahora hay 2 fotos para este código en Dexie y en KPIs
    await expect(page.locator('#kpi-total-count')).toHaveText('2');
    const uploadsCount = await page.evaluate(async (barcode) => {
      return await window.db.pendingUploads.where('barcode').equals(barcode).count();
    }, testBarcode);
    expect(uploadsCount).toBe(2);

    // 6. Probar "Guardar como foto nueva (+)" desde el modal de edición
    const secondCard = page.locator('.off-item-card').last();
    await secondCard.locator('button[title="Editar recorte o datos"]').click();
    await expect(page.locator('#modal-off-edit')).toBeVisible();
    await expect(page.locator('#btn-save-as-new-upload')).toBeVisible();

    // Cambiar tipo a "front" y pulsar "Guardar como foto nueva (+)"
    await page.selectOption('#edit-image-type', 'front');
    await page.click('#btn-save-as-new-upload');
    await expect(page.locator('#modal-off-edit')).not.toBeVisible();

    // Ahora deben existir 3 fotos en total
    await expect(page.locator('#kpi-total-count')).toHaveText('3');
    const uploadsCount3 = await page.evaluate(async (barcode) => {
      return await window.db.pendingUploads.where('barcode').equals(barcode).count();
    }, testBarcode);
    expect(uploadsCount3).toBe(3);

    // Limpiar: Eliminar los 3 elementos
    page.on('dialog', dialog => dialog.accept());
    while (await page.locator('.off-item-card button[title="Eliminar de la cola"]').count() > 0) {
      await page.locator('.off-item-card button[title="Eliminar de la cola"]').first().click();
      await page.waitForTimeout(100);
    }

    // Verificar que la lista queda vacía y KPIs en 0
    await expect(page.locator('#kpi-total-count')).toHaveText('0');
    await expect(page.locator('#off-empty-state')).toBeVisible();
  });

});
