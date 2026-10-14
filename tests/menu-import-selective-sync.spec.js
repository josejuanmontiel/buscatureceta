import { test, expect } from '@playwright/test';

test.describe('Menu Package Import & Selective Diary Sync Flow', () => {

  test('should import PrimaryFoods menu plan package aditively into recipes, diary and cart', async ({ page }) => {
    await page.goto('/#settings');

    const menuPackage = {
      app: 'PrimaryFoods',
      version: '1.0.0',
      recipes: [
        {
          name: 'Lentejas Estofadas con Verduras',
          description: 'Plato mediterráneo rico en fibra y hierro',
          servings: 4,
          category: 'legumbres',
          instructions: 'Cocer a fuego lento 40 min',
          tags: ['legumbres', 'mediterraneo'],
          slug: 'lentejas-estofadas',
          ingredients: [
            {
              primaryFoodId: 'bedca_123_lenteja',
              primaryName: 'Lentejas secas',
              amount: 300,
              unit: 'g'
            },
            {
              commercialCode: '8480000171313',
              commercialName: 'Zanahorias',
              amount: 150,
              unit: 'g'
            }
          ]
        }
      ],
      diary: [
        {
          date: '2026-10-20',
          mealType: 'lunch',
          status: 'planned',
          items: [
            {
              name: 'Lentejas Estofadas con Verduras',
              type: 'recipe',
              course: 'main',
              servings: 1
            }
          ]
        }
      ],
      shoppingList: [
        {
          name: 'Lentejas secas',
          amount: 300,
          unit: 'g',
          recipeName: 'Lentejas Estofadas con Verduras'
        }
      ]
    };

    const result = await page.evaluate(async (pkg) => {
      const BackupStore = await import('/js/modules/backup/BackupStore.js');
      return await BackupStore.importMenuPlanPackage(pkg, { targetShoppingList: 'cart' });
    }, menuPackage);

    expect(result.recipesImported).toBe(1);
    expect(result.diaryEntriesImported).toBe(1);
    expect(result.shoppingItemsAdded).toBe(1);

    await page.goto('/#recipes');
    await expect(page.locator('#recipes-list')).toContainText('Lentejas Estofadas con Verduras');

    await page.goto('/#grid');
    await expect(page.locator('#cart-list')).toContainText('Lentejas secas');

    const diaryEntry = await page.evaluate(async () => {
      const db = window.db;
      return await db.diary.where({ date: '2026-10-20', mealType: 'lunch' }).first();
    });
    expect(diaryEntry).toBeTruthy();
    expect(diaryEntry.status).toBe('planned');
    expect(diaryEntry.items[0].name).toBe('Lentejas Estofadas con Verduras');
  });

  test('should selectively merge diary entries when option is enabled', async ({ page }) => {
    await page.goto('/#settings');

    const backupData = {
      version: 1,
      timestamp: new Date().toISOString(),
      data: {
        recipes: [
          { id: 9991, name: 'Sopa Castellana Test Merge', servings: 2, ingredients: [], instructions: 'Cocer' }
        ],
        diary: [
          { id: 8881, date: '2026-10-22', mealType: 'dinner', status: 'planned', items: [{ name: 'Sopa Castellana Test Merge', course: 'main' }] }
        ]
      }
    };

    // 1. Merge sin diary (por defecto)
    await page.evaluate(async (data) => {
      const BackupStore = await import('/js/modules/backup/BackupStore.js');
      await BackupStore.mergeData(data, { mergeDiary: false });
    }, backupData);

    let diaryExists = await page.evaluate(async () => {
      const db = window.db;
      return await db.diary.where({ date: '2026-10-22', mealType: 'dinner' }).first();
    });
    expect(diaryExists).toBeFalsy();

    // 2. Merge con diary activado
    await page.evaluate(async (data) => {
      const BackupStore = await import('/js/modules/backup/BackupStore.js');
      await BackupStore.mergeData(data, { mergeDiary: true });
    }, backupData);

    diaryExists = await page.evaluate(async () => {
      const db = window.db;
      return await db.diary.where({ date: '2026-10-22', mealType: 'dinner' }).first();
    });
    expect(diaryExists).toBeTruthy();
    expect(diaryExists.mealType).toBe('dinner');
  });

});
