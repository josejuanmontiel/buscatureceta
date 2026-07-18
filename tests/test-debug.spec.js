import { test, expect } from '@playwright/test';
test('debug purchase flow generic', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER_ERR:', err));
  
  await page.goto('/index.html');
  page.on('dialog', async dialog => {
    console.log('DIALOG:', dialog.message());
    await dialog.accept();
  });
  
  await page.fill('#filters', 'E250');
  await page.fill('#database', '/test_products.tsv.zz');
  await page.click('#download-btn');
  await page.waitForURL('**/grid.html');

  await page.fill('#code-input', 'Producto Raro');
  await page.click('#query-btn');
  
  await page.waitForSelector('#add-to-cart-panel:not(.d-none)', { timeout: 3000 });
  await page.fill('#scanned-amount', '2');
});
