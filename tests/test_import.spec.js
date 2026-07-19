import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Test import data', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER_ERROR:', err.message));

  await page.goto('/#index');
  // wait for app to be ready
  await page.waitForTimeout(1000);

  const backupData = fs.readFileSync(path.resolve(import.meta.dirname, 'nutriagenda_backup_2026-07-14.json'), 'utf8');

  // Eval importData in browser context
  const result = await page.evaluate(async (jsonStr) => {
    try {
      // Import the module dynamically to get BackupStore
      const BackupStore = await import('/js/modules/backup/BackupStore.js');
      await BackupStore.importData(jsonStr);
      
      const db = (await import('/js/db/schema.js')).db;
      
      const recipes = await db.recipes.toArray();
      const diary = await db.diary.toArray();
      const pantry = await db.pantry.toArray();
      
      return { recipes: recipes.length, diary: diary.length, pantry: pantry.length };
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  }, backupData);

  console.log('Import result:', result);
});
