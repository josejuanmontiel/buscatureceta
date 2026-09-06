import { test, expect } from '@playwright/test';

async function clearDB(page) {
  await page.goto('/#index');
  await page.waitForFunction(() => typeof window.__resetUserData === 'function', { timeout: 10000 });
  await page.evaluate(() => window.__resetUserData());
}

test.describe('Filtrado Inteligente de Metadatos OFF en Historial y Asistente Desempacar', () => {

  test('Diferencia productos con foto en OFF, productos nuevos y artículos a granel/sin código', async ({ page }) => {
    await clearDB(page);
    page.on('dialog', dialog => dialog.accept());

    // 1. Inyectar en IndexedDB los 4 tipos de productos y una compra
    await page.evaluate(async () => {
      const dbReq = indexedDB.open('nutriagenda');
      return new Promise((resolve) => {
        dbReq.onsuccess = async (e) => {
          const db = e.target.result;
          
          // 1.1 Producto oficial OFF con foto existente
          const tx1 = db.transaction(['products', 'customProducts', 'cartHistory'], 'readwrite');
          tx1.objectStore('products').put({
            code: '8402001026270',
            product_name: 'Couscous Hacendado',
            image_url: 'https://images.openfoodfacts.org/images/products/840/200/102/6270/front.jpg',
            brands: 'Hacendado'
          });

          // 1.2 Producto genérico a granel (balanza 28...)
          tx1.objectStore('customProducts').put({
            code: '280123456789',
            product_name: 'Plátanos de Canarias',
            is_custom: true
          });

          // 1.3 Producto genérico sin código comercial
          tx1.objectStore('customProducts').put({
            code: 'GENERIC_1725624123456',
            product_name: 'Pechuga de Pollo Fileteada',
            is_custom: true
          });

          // 1.4 Compra con los 4 productos (1: Couscous con foto, 2: nuevo código 8419999999999, 3: granel 28..., 4: genérico)
          tx1.objectStore('cartHistory').put({
            id: 1001,
            date: Date.now(),
            supermarket: 'Mercadona',
            total: 15.50,
            items: [
              { productCode: '8402001026270', productName: 'Couscous Hacendado', amount: 1, unit: 'ud', price: 1.50 },
              { productCode: '8419999999999', productName: 'Galletas de Avena Nuevas', amount: 2, unit: 'ud', price: 2.00 },
              { productCode: '280123456789', productName: 'Plátanos de Canarias', amount: 1.2, unit: 'kg', price: 2.50 },
              { productCode: 'GENERIC_1725624123456', productName: 'Pechuga de Pollo Fileteada', amount: 1, unit: 'ud', price: 5.50 }
            ]
          });

          tx1.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    });

    // 2. Navegar al Historial de Compras
    await page.goto('/#cart-history');
    await page.waitForSelector('#cart-history-list .accordion-item', { state: 'visible' });

    const historyList = page.locator('#cart-history-list');

    // 3. Verificar los botones/badges en el listado desglosado:
    // 3.1 Couscous (con foto en OFF) NO debe tener botón "📷 OFF (Nuevo)" ni alerta de subir, sino enlace/badge OFF
    const couscousRow = historyList.locator('li', { hasText: 'Couscous Hacendado' });
    await expect(couscousRow).toBeVisible();
    await expect(couscousRow).not.toContainText('📷 OFF');
    await expect(couscousRow.locator('a[title*="OpenFoodFacts"]')).toBeVisible();

    // 3.2 Galletas nuevas (código comercial real 8419999999999 no en OFF) SÍ debe tener botón de aportar
    const cookiesRow = historyList.locator('li', { hasText: 'Galletas de Avena Nuevas' });
    await expect(cookiesRow).toBeVisible();
    await expect(cookiesRow).toContainText('📷 OFF');

    // 3.3 Plátanos (código de balanza 28...) NO debe tener botón OFF
    const bananasRow = historyList.locator('li', { hasText: 'Plátanos de Canarias' });
    await expect(bananasRow).toBeVisible();
    await expect(bananasRow).not.toContainText('OFF');

    // 3.4 Pechuga (genérico sin código comercial) NO debe tener botón OFF
    const chickenRow = historyList.locator('li', { hasText: 'Pechuga de Pollo Fileteada' });
    await expect(chickenRow).toBeVisible();
    await expect(chickenRow).not.toContainText('OFF');

    // 4. Probar el Asistente "📦 Desempacar OFF"
    await page.click('button:has-text("📦 Desempacar OFF")');
    const modal = page.locator('#modal-history-unpacking-assistant');
    await expect(modal).toBeVisible();

    const itemsContainer = modal.locator('#unpacking-items-list');

    // 4.1 La sección de "Requieren fotos o datos en OFF" debe contener las Galletas nuevas
    await expect(itemsContainer).toContainText('Requieren fotos o datos en OFF');
    await expect(itemsContainer).toContainText('Galletas de Avena Nuevas');
    await expect(itemsContainer).toContainText('Nuevo en OFF');

    // 4.2 La sección de "Ya documentados en OpenFoodFacts" debe contener el Couscous
    await expect(itemsContainer).toContainText('Ya documentados en OpenFoodFacts');
    await expect(itemsContainer).toContainText('Couscous Hacendado');

    // 4.3 La sección de "Granel / Local" debe agrupar los artículos no aplicables
    await expect(itemsContainer).toContainText('Granel / Local');
    await expect(itemsContainer).toContainText('Plátanos de Canarias');
  });

});
