import { test, expect } from '@playwright/test';

test.describe('Photo to Diary Flow', () => {
  test('should upload a photo, annotate it with AI JSON and move it to the diary', async ({ page }) => {
    // 1. Navigate to meal photos gallery
    await page.goto('/meal-photos.html');
    
    // Auto-accept the dialog when it asks to go to the diary
    page.on('dialog', dialog => dialog.accept());

    // 2. Upload the photo
    const fileInput = page.locator('#quick-file-input');
    await fileInput.setInputFiles('tests/arroz-a-la-cubana-foto-cerca.webp');
    
    // Wait for the photo card to be added
    await expect(page.locator('.photo-card').first()).toBeVisible();
    
    // 3. Click Anotar
    await page.locator('.photo-card').first().locator('button', { hasText: '✏️ Anotar' }).click();
    
    // 4. Fill annotation fields
    await expect(page.locator('#annotateModal')).toBeVisible();
    
    // Select meal type
    await page.selectOption('#annotate-meal-type', 'lunch');
    
    // Paste AI JSON
    const aiJson = `{
"name": "Arroz a la cubana",
"kcal": 550,
"protein_g": 13,
"carbs_g": 92,
"fat_g": 16
}`;
    await page.fill('#ai-json-input', aiJson);
    
    // 5. Process AI JSON
    await page.click('#btn-process-ai');
    
    // 6. Verify we are redirected to diary.html
    await page.waitForURL('**/diary.html');
    
    // 7. Verify the new entry is in the diary
    await expect(page.locator('.diary-grid')).toContainText('Arroz a la cubana');
  });
});
