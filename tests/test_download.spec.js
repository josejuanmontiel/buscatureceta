import { test, expect } from '@playwright/test';

test('Test DB download completely', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));

  await page.goto('/');
  await page.click('#download-btn');
  
  // Wait for either success or error state on the button
  await expect(page.locator('#download-btn')).toHaveText(/(¡Carga Completada!|Error al cargar)/, { timeout: 180000 });
  
  const btnText = await page.locator('#download-btn').textContent();
  console.log('Final button text:', btnText);
  if (btnText === 'Error al cargar') {
    throw new Error('Download failed!');
  }
});
