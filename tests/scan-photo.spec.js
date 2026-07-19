import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Scanner UI Flow', () => {
  test('should scan from gallery and redirect to cart correctly', async ({ page }) => {
    // 1. Ir a inicio y configurar DB para que al escanear devuelva algo
    await page.goto('/#index');
    await page.waitForSelector('#filters', { state: 'visible', timeout: 10000 });
    await page.fill('#database', '/test_products.tsv.zz');
    await page.click('#download-btn');
    await page.waitForURL('**/#grid');

    // 2. Comprobar que el botón de escanear es visible y hacer clic
    await expect(page.locator('#scan-btn')).toBeVisible();
    await page.click('#scan-btn');

    // 3. Esperar que redirija a scan.html con el parámetro de retorno a la SPA
    await page.waitForURL('**/scan.html?return=%23grid');

    // 4. Preparar la subida del archivo (la imagen generada)
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#btn-gallery');
    const fileChooser = await fileChooserPromise;
    
    // Ruta relativa al fichero test_barcode_2087569003329.png
    await fileChooser.setFiles(path.resolve(import.meta.dirname, 'test_barcode_2087569003329.png'));

    // 5. Tras escanear el archivo, debe redirigir a #grid con el código de barras
    await page.waitForURL('**/#grid?code=2087569003329', { timeout: 10000 });

    // 6. Verificar que la pantalla de la compra ha buscado y mostrado el producto (Costilla Adobada)
    await expect(page.locator('#scanned-product-name')).toContainText(/Costilla Adobada/i, { timeout: 10000 });
  });
});
