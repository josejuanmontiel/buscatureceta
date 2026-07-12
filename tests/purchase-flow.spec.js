import { test, expect } from '@playwright/test';

test.describe('Purchase Flow E2E', () => {
  test('should load DB, detect bad product, switch to alternative and add to cart', async ({ page }) => {
    // 1. Ir a inicio y configurar filtros y BD
    await page.goto('/index.html');
    
    // Configurar el filtro a "E250"
    await page.fill('#filters', 'E250');
    
    // Poner el dataset de prueba
    await page.fill('#database', '/test_products.tsv.zz');
    
    // Iniciar carga de BD
    // Escuchamos dialogs por si salta un alert() (como 'Base de datos borrada con éxito')
    page.on('dialog', dialog => dialog.accept());
    
    await page.click('#download-btn');
    
    // Esperamos que nos lleve a /grid.html al terminar de cargar
    await page.waitForURL('**/grid.html');
    // Remove the title expectation or update to NutriAgenda
    await expect(page).toHaveTitle(/NutriAgenda/i);

    // 2. Simular escaneo de producto "malo" (con E250)
    // El EAN real es 2087569003329
    await page.goto('/grid.html?code=2087569003329');

    // Comprobar que carga la Costilla Adobada El Pradal y sale la alerta
    await expect(page.locator('#scanned-product-name')).toContainText('Costilla Adobada El Pradal');
    
    const alertDiv = page.locator('#assistant-alert');
    await expect(alertDiv).toBeVisible();
    await expect(page.locator('#assistant-warning-text')).toContainText('E250');

    // 3. Seleccionar alternativa sana (sin E250)
    const alternativeBtn = page.locator('#assistant-alternatives button').first();
    await expect(alternativeBtn).toContainText('Salchichas de Pollo'); // NutriScore B
    
    // Hacemos clic en la alternativa
    await alternativeBtn.click();
    
    // Esperar a que cambie el producto actual a Salchichas de Pollo
    await expect(page.locator('#scanned-product-name')).toContainText('Salchichas de Pollo');
    
    // Verificar que la alerta ya no está visible
    await expect(alertDiv).toHaveClass(/d-none/);

    // 4. Añadir al carrito ajustando precio
    await page.fill('#scanned-price', '2.50');
    await page.fill('#scanned-amount', '2');
    await page.click('#btn-add-cart');

    // Verificar que se actualizó el total en la UI (2.50 * 2 = 5.00)
    await expect(page.locator('#cart-total')).toContainText('5.00 €');

    // 5. Finalizar compra (Checkout)
    await page.click('#btn-checkout');

    // Esperar a que nos lleve a la despensa
    await page.waitForURL('**/pantry.html');
    
    // Validar que la tabla de la despensa tiene la compra
    // Asumiendo que Tabulator o la tabla de despensa dibuja las filas
    // Esperamos un poco a que cargue Tabulator
    await page.waitForTimeout(1000);
    // Verificamos que aparece en alguna parte del body
    await expect(page.locator('body')).toContainText('Salchichas de Pollo');
  });
});
