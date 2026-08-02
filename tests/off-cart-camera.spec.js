import { test, expect } from '@playwright/test';

test.describe('Flujo de producto desconocido en carro y botón OFF al loguearse', () => {

  test('escanea producto desconocido -> aparece en el carro -> al configurar credenciales OFF aparece el botón cámara', async ({ page }) => {
    // 1. Ir a la vista del carrito
    await page.goto('/#grid');

    // Limpiar localStorage previo
    await page.evaluate(() => {
      localStorage.removeItem('off_user');
      localStorage.removeItem('off_password');
    });

    const unknownCode = '8402001052859';

    // 2. Buscar/Escanear producto no existente
    await page.fill('#code-input', unknownCode);
    await page.click('#query-btn');

    // 3. Verificar que se ha añadido al carrito como "Producto 8402001052859"
    await expect(page.locator('#cart-list')).toContainText(`Producto ${unknownCode}`);

    // 4. Verificar que de entrada NO aparece el botón OFF de la cámara (al no estar logueado)
    await expect(page.locator('#cart-list button:has-text("OFF")')).toHaveCount(0);

    // 5. Ir a Ajustes y guardar usuario OFF (accreativos)
    await page.goto('/#settings');
    await page.fill('#cred-username', 'accreativos');
    await page.fill('#cred-password', 'Cr0nauer.');
    await page.click('#btn-save-credentials');
    await expect(page.locator('#cred-status')).toContainText('accreativos');

    // 6. Volver al Carrito
    await page.goto('/#grid');

    // 7. Verificar que el producto sigue en el carro y AHÍ SÍ APARECE el botón OFF de la cámara
    await expect(page.locator('#cart-list')).toContainText(`Producto ${unknownCode}`);
    const offButton = page.locator('#cart-list button:has-text("OFF")');
    await expect(offButton).toBeVisible();

    // 8. Hacer click en el botón OFF y comprobar que abre el panel con el código de barras real escaneado
    await offButton.click();
    await expect(page.locator('#unknown-product-panel')).toBeVisible();
    await expect(page.locator('#unknown-barcode-label')).toHaveText(unknownCode);
  });

});
