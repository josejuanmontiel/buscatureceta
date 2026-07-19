import { test, expect } from '@playwright/test';

test('Test DB download completely', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));

  await page.route('**/spain_products.tsv.zz', route => {
    route.fulfill({
      status: 200,
      contentType: 'text/tab-separated-values',
      body: 'code\tproduct_name\tquantity\tbrands\tcategories\tnutriscore_grade\tnova_group\tenergy-kcal_100g\tproteins_100g\tcarbohydrates_100g\tfat_100g\n123\tMock Product\t100g\tMock Brand\tMock Cat\ta\t1\t100\t10\t10\t10\n'
    });
  });

  await page.goto('/');
  await page.click('#download-btn');
  
  // Wait for either success or error state on the button
  // Success redirects to #grid
  await page.waitForURL('**/#grid', { timeout: 180000 });
  
  console.log('Download completed and redirected to grid');
});
