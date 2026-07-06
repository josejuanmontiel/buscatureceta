import { db, DEFAULT_GOALS, FOOD_GROUPS } from '../../db/schema.js';
import * as DiaryStore from '../diary/DiaryStore.js';

/**
 * Obtener los objetivos del usuario (o los por defecto si no ha configurado nada)
 * @returns {Promise<Object>}
 */
export async function getGoals() {
  const customGoals = await db.goals.toArray();
  if (customGoals.length === 0) return DEFAULT_GOALS;

  const goals = { ...DEFAULT_GOALS };
  customGoals.forEach(g => {
    if (g.target !== undefined) goals[g.nutrient] = g.target;
  });
  return goals;
}

/**
 * Analiza la ingesta de un día concreto frente a los objetivos
 * @param {string} date
 * @returns {Promise<Object>}
 */
export async function getDailyProgress(date) {
  const nutrition = await DiaryStore.getDayNutritionTotals(date);
  const goals = await getGoals();

  return {
    nutrition,
    goals,
    percentages: {
      kcal: Math.round((nutrition.kcal / goals.kcal) * 100) || 0,
      proteins: Math.round((nutrition.proteins_g / goals.proteins_g) * 100) || 0,
      carbs: Math.round((nutrition.carbs_g / goals.carbohydrates_g) * 100) || 0,
      fat: Math.round((nutrition.fat_g / goals.fat_g) * 100) || 0,
      fiber: Math.round((nutrition.fiber_g / goals.fiber_g) * 100) || 0,
    }
  };
}

/**
 * Analiza la variedad de grupos de alimentos consumidos en una semana
 * @param {Date} referenceDate
 * @returns {Promise<Object>}
 */
export async function getWeeklyVariety(referenceDate = new Date()) {
  const { entries } = await DiaryStore.getCurrentWeekEntries(referenceDate);
  
  // Extraer todos los códigos de productos consumidos (directamente o vía receta)
  const consumedProductCodes = new Set();
  
  for (const entry of entries) {
    for (const item of entry.items) {
      if (item.type === 'product' && item.productCode) {
        consumedProductCodes.add(item.productCode);
      } else if (item.type === 'recipe' && item.recipeId) {
        const recipe = await db.recipes.get(item.recipeId);
        if (recipe) {
          recipe.ingredients.forEach(i => consumedProductCodes.add(i.productCode));
        }
      }
    }
  }

  // Buscar a qué grupo pertenece cada producto (según sus tags en OFF)
  const groupCounts = {};
  for (const groupKey of Object.keys(FOOD_GROUPS)) {
    groupCounts[groupKey] = 0;
  }

  const products = await db.products.where('code').anyOf([...consumedProductCodes]).toArray();
  
  products.forEach(p => {
    const tagsStr = (p.categories_tags || '').toLowerCase();
    for (const [groupKey, groupDef] of Object.entries(FOOD_GROUPS)) {
      if (groupDef.tags.some(t => tagsStr.includes(t))) {
        groupCounts[groupKey]++;
      }
    }
  });

  const totalGroups = Object.keys(FOOD_GROUPS).length;
  const consumedGroups = Object.values(groupCounts).filter(c => c > 0).length;

  return {
    groupCounts,
    score: Math.round((consumedGroups / totalGroups) * 100),
    groupsData: FOOD_GROUPS
  };
}
