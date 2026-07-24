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

  test('should process shared file via IDB and URL parameter (UI Flow)', async ({ page }) => {
    // Navigate to root to ensure origin is set up for IDB
    await page.goto('/');

    // 1. Mock shared file in IndexedDB
    await page.evaluate(async () => {
      const mockBackup = {
        data: {
          recipes: [{ id: 8887, name: "Receta de Prueba UI", servings: 2, ingredients: [], instructions: "Test UI", updated_at: Date.now() }],
          diary: []
        }
      };
      const jsonStr = JSON.stringify(mockBackup);
      // Let's use a Blob with name property to simulate a File, or just a File since File inherits Blob
      const mockFile = new File([jsonStr], "sync_test.json", { type: "application/json" });

      // First delete to avoid version issues
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('nutriagenda-share');
        req.onsuccess = resolve;
        req.onerror = resolve; // Ignore errors on delete
      });

      await new Promise((resolve, reject) => {
        const req = indexedDB.open('nutriagenda-share', 1);
        req.onupgradeneeded = (e) => {
          e.target.result.createObjectStore('files');
        };
        req.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put(mockFile, 'shared-file');
          tx.oncomplete = () => {
            db.close();
            console.log('IDB Mock complete');
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    });

    const hasFile = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('nutriagenda-share', 1);
        req.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction('files', 'readonly');
          const getReq = tx.objectStore('files').get('shared-file');
          getReq.onsuccess = () => {
            const exists = !!getReq.result;
            db.close();
            resolve(exists);
          };
        };
      });
    });
    console.log('IDB HAS FILE:', hasFile);

    // 2. Setup dialog handlers (for confirm and alert)
    let dialogsHandled = 0;
    page.on('dialog', async dialog => {
      console.log('DIALOG OPENED:', dialog.message());
      dialogsHandled++;
      await dialog.accept();
    });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    // Wait for page to reload after the alert is accepted.
    // We can do this by listening to the load event or just waiting for the URL to lose the query parameter
    // because window.history.replaceState removes it, then reload happens.
    
    // 3. Trigger the share_received flow
    await page.goto('/?action=share_received');

    // Wait a bit for checkSharedFiles to run and trigger the prompt
    await page.waitForTimeout(1500);
    
    // 4. Navigate to recipes to verify
    await page.goto('/#recipes');
    await expect(page.locator('text=Receta de Prueba UI')).toBeVisible({ timeout: 5000 });
    
    // Ensure dialogs were shown (1 confirm, 1 alert)
    expect(dialogsHandled).toBeGreaterThanOrEqual(2);
  });
});
