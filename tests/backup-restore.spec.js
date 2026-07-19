import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

test.describe('Backup and Restore Flow', () => {
  let downloadPath;

  test.beforeAll(() => {
    downloadPath = path.join(os.tmpdir(), `nutriagenda-backup-test-${Date.now()}.json`);
  });

  test.afterAll(() => {
    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath);
    }
  });

  test('should export data, clear it, and restore it successfully', async ({ page }) => {
    // 1. Create some initial data (A new recipe)
    await test.step('Create test data (Recipe)', async () => {
      await page.goto('/#recipes');
      
      // Click New Recipe
      await page.click('#btn-new-recipe');
      await page.waitForURL('**/#recipe-editor*');
      
      // Fill recipe details
      await page.fill('#recipe-name', 'Receta de Respaldo');
      await page.fill('#recipe-servings', '2');
      
      // Save recipe
      await page.click('#btn-save-recipe');
      await page.waitForURL('**/#recipe-editor?id=*');
      
      await page.goto('/#recipes');
      // Verify it's in the list
      await expect(page.locator('#recipes-list')).toContainText('Receta de Respaldo');
    });

    // 2. Export the data
    await test.step('Export database to JSON', async () => {
      await page.goto('/#settings');
      
      const downloadPromise = page.waitForEvent('download');
      await page.click('#btn-export');
      const download = await downloadPromise;
      
      await download.saveAs(downloadPath);
      expect(fs.existsSync(downloadPath)).toBeTruthy();
    });

    // 3. Clear the data
    await test.step('Clear personal data', async () => {
      // Auto-accept the confirmation dialogs
      page.on('dialog', async dialog => {
        if (dialog.message().includes('restaurada')) {
           await dialog.accept();
        } else {
           await dialog.accept();
        }
      });

      await page.click('#btn-clear-data');
      await page.waitForSelector('#btn-global-confirm', { state: 'visible' });

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load' }),
        page.click('#btn-global-confirm')
      ]);
      
      await page.goto('/#recipes');
      await expect(page.locator('#recipes-list')).toContainText('No tienes recetas guardadas');
    });

    // 4. Import the data back
    await test.step('Restore database from JSON', async () => {
      await page.goto('/#settings');
      
      // Set the file in the input
      await page.setInputFiles('#import-file', downloadPath);
      
      await page.click('#btn-import');
      await page.waitForSelector('#btn-global-confirm', { state: 'visible' });

      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load' }),
        page.click('#btn-global-confirm')
      ]);
    });

    // 5. Verify the data is back
    await test.step('Verify data is restored', async () => {
      await page.goto('/#recipes');
      // The recipe should be back
      await expect(page.locator('#recipes-list')).toContainText('Receta de Respaldo');
    });
  });
});
