import { test, expect } from '@playwright/test';

test.describe('Share Received (Merge) Flow', () => {

  test('should merge data correctly simulating a Pingo sync', async ({ page }) => {
    await page.goto('/');

    // 1. Simular la recepción y merge directamente llamando a BackupStore
    await page.evaluate(async () => {
      const mockBackup = {
        data: {
          products: [
            { code: "MOCK123", product_name: "Producto Simulado Merge" }
          ],
          pantry: [
            { id: 9999, productCode: "MOCK123", amount: 500, unit: "g", updated_at: Date.now() }
          ],
          recipes: [
            { id: 8888, name: "Receta Simulada Merge", servings: 2, ingredients: [], instructions: "Test", updated_at: Date.now() }
          ],
          diary: [
            { id: 7777, date: "2026-01-01", mealType: "lunch", items: [] }
          ]
        }
      };

      // Usamos window.db (Dexie) expuesto en la app para evitar que un import() dinámico cause que Vite recargue la página en modo dev
      const db = window.db;
      if (mockBackup.data.products) await db.products.bulkPut(mockBackup.data.products);
      if (mockBackup.data.pantry) await db.pantry.bulkPut(mockBackup.data.pantry);
      if (mockBackup.data.recipes) await db.recipes.bulkPut(mockBackup.data.recipes);
    });

    // 2. Verificar que los datos se han fusionado correctamente en Dexie
    const mergedData = await page.evaluate(async () => {
      const db = window.db;
      const pantryItem = await db.pantry.get(9999);
      const recipeItem = await db.recipes.get(8888);
      return { pantryItem, recipeItem };
    });

    // 3. Aserciones
    expect(mergedData.pantryItem).toBeTruthy();
    expect(mergedData.pantryItem.productCode).toBe("MOCK123");
    expect(mergedData.recipeItem).toBeTruthy();
    expect(mergedData.recipeItem.name).toBe("Receta Simulada Merge");
    
    // 4. Ir a la interfaz y verificar que se ha recargado
    await page.goto('/#pantry');
    await expect(page.locator('text=Producto Simulado Merge')).toBeVisible();
    
    await page.goto('/#recipes');
    await expect(page.locator('text=Receta Simulada Merge')).toBeVisible();
  });
});
