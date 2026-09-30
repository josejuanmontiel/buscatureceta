import { test, expect } from '@playwright/test';

test.describe('Pantry Shelf Life & Expiry Date', () => {
  test('should estimate shelf life and allow custom expiry dates', async ({ page }) => {
    await page.goto('/#pantry');
    await page.waitForLoadState('networkidle');

    // Test ShelfLifeEstimator directly in browser context
    const estimateResults = await page.evaluate(async () => {
      const { estimateShelfLife, getExpiryStatus } = window.PantryStore;

      // 1. Conserva (3 años)
      const estCanned = estimateShelfLife({
        productName: 'Atún en aceite de oliva en lata',
        categoriesTags: 'en:canned-foods,en:canned-fishes'
      });

      // 2. Pasta seca (2 años)
      const estPasta = estimateShelfLife({
        productName: 'Macarrones de trigo',
        categoriesTags: 'en:pastas,en:dry-pasta'
      });

      // 3. Fresco (7 días)
      const estFresh = estimateShelfLife({
        productName: 'Tomate ensalada fresco',
        categoriesTags: 'en:fruits-and-vegetables-based-foods'
      });

      // 4. Status calculation
      const today = new Date();
      const futureDate = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const statusSoon = getExpiryStatus(futureDate, today);

      return { estCanned, estPasta, estFresh, statusSoon };
    });

    expect(estimateResults.estCanned.days).toBe(1095);
    expect(estimateResults.estCanned.shelfClass).toBe('long');
    expect(estimateResults.estPasta.days).toBe(730);
    expect(estimateResults.estPasta.shelfClass).toBe('long');
    expect(estimateResults.estFresh.days).toBe(7);
    expect(estimateResults.estFresh.shelfClass).toBe('short');
    expect(estimateResults.statusSoon.status).toBe('warning');
    expect(estimateResults.statusSoon.diffDays).toBe(10);
  });
});
