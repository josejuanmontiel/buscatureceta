import { db } from '../../db/schema.js';
import { calculateTotalNutrition } from '../nutrition/NutritionCalculator.js';

/**
 * Propaga de forma retroactiva los cambios nutricionales de un producto
 * personalizado a todas las recetas y registros de la agenda que lo utilicen.
 */
export async function syncNutrition(productCode) {
  let updatedRecipes = 0;
  let updatedDiaryEntries = 0;

  // 1. Actualizar recetas
  const recipes = await db.recipes.toArray();
  for (const recipe of recipes) {
    if (!recipe.ingredients) continue;
    
    // Comprobar si la receta usa este producto
    const usesProduct = recipe.ingredients.some(ing => ing.productCode === productCode);
    if (usesProduct) {
      // Recalcular nutrición
      const newNutrition = await calculateTotalNutrition(recipe.ingredients);
      
      // Guardar usando db.recipes.update directamente para no crear una snapshot
      // por cada pequeña corrección en el visor de BD. (Si quisiéramos versionado,
      // llamaríamos a RecipeStore.updateRecipe).
      await db.recipes.update(recipe.id, {
        nutritionPerServing: newNutrition,
        updatedAt: new Date().toISOString()
      });
      updatedRecipes++;
    }
  }

  // 2. Actualizar agenda (diary)
  const entries = await db.diary.toArray();
  for (const entry of entries) {
    let entryModified = false;
    
    for (let i = 0; i < entry.items.length; i++) {
      const item = entry.items[i];
      
      if (item.type === 'product' && item.productCode === productCode) {
        // Recalcular el ítem suelto
        const newNutrition = await calculateTotalNutrition([
          { productCode: item.productCode, amount: item.servings * 100, unit: 'g' }
        ]);
        item.nutrition = newNutrition;
        entryModified = true;
      } 
      else if (item.type === 'recipe' && item.customIngredients && item.customIngredients.some(ing => ing.productCode === productCode)) {
        // Recalcular receta consumida con ingredientes personalizados
        const newNutrition = await calculateTotalNutrition(item.customIngredients);
        item.nutrition = newNutrition;
        entryModified = true;
      }
    }
    
    if (entryModified) {
      await db.diary.update(entry.id, {
        items: entry.items,
        updatedAt: new Date().toISOString()
      });
      updatedDiaryEntries++;
    }
  }

  console.log(`[ProductSync] Sincronización completa para ${productCode}. Recetas actualizadas: ${updatedRecipes}, Comidas actualizadas: ${updatedDiaryEntries}`);
  
  return { updatedRecipes, updatedDiaryEntries };
}
