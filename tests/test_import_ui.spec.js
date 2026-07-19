import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('Test UI after import', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER_ERROR:', err.message));

  await page.goto('/#index');
  await page.waitForTimeout(1000);

  const backupData = fs.readFileSync(path.resolve(import.meta.dirname, 'nutriagenda_backup_2026-07-14.json'), 'utf8');

  // Eval importData in browser context
  await page.evaluate(async (jsonStr) => {
    const BackupStore = await import('/js/modules/backup/BackupStore.js');
    await BackupStore.importData(jsonStr);
  }, backupData);

  console.log('Imported data successfully. Now checking UI...');

  // Check recipes
  await page.goto('/#recipes');
  await page.waitForTimeout(1000);
  const recipesContent = await page.locator('#recipes-list').innerText();
  console.log('RECIPES LIST:', recipesContent);

  // Check pantry
  await page.goto('/#pantry');
  await page.waitForTimeout(1000);
  const pantryContent = await page.locator('#pantry-list').innerText();
  console.log('PANTRY LIST:', pantryContent);
  
  // Check diary
  await page.goto('/#diary');
  await page.waitForTimeout(1000);
  const diaryContent = await page.locator('.diary-grid').innerText();
  console.log('DIARY LIST (partial):', diaryContent.substring(0, 100));
});
