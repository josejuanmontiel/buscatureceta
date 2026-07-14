/**
 * NutritionCalculator — Cálculo de valores nutricionales por receta
 *
 * Cruza los ingredientes de una receta (productCode + amount) con la store
 * "products" de IndexedDB (datos de OpenFoodFacts) y calcula los totales.
 *
 * Campos nutricionales disponibles en OFF Spain CSV:
 *   energy-kcal_100g, proteins_100g, carbohydrates_100g, fat_100g,
 *   fiber_100g, sugars_100g, salt_100g, saturated-fat_100g, sodium_100g
 */

import { db } from '../../db/schema.js';

/**
 * @typedef {Object} NutritionValues
 * @property {number} kcal          — kilocalorías
 * @property {number} proteins_g    — proteínas en gramos
 * @property {number} carbs_g       — carbohidratos en gramos
 * @property {number} fat_g         — grasas en gramos
 * @property {number} fiber_g       — fibra en gramos
 * @property {number} sugars_g      — azúcares en gramos
 * @property {number} salt_g        — sal en gramos
 * @property {number} saturated_fat_g — grasas saturadas en gramos
 */

/**
 * Mapa entre campo lógico y nombre de columna en OpenFoodFacts
 */
const OFF_FIELD_MAP = {
  kcal:             'energy-kcal_100g',
  proteins_g:       'proteins_100g',
  carbs_g:          'carbohydrates_100g',
  fat_g:            'fat_100g',
  fiber_g:          'fiber_100g',
  sugars_g:         'sugars_100g',
  salt_g:           'salt_100g',
  saturated_fat_g:  'saturated-fat_100g',
};

/**
 * Convierte la cantidad de un ingrediente a gramos equivalentes
 * para hacer el cálculo proporcional a los valores per 100g de OFF.
 *
 * Por ahora solo soporta "g" y "ml" (1:1). Unidades como "unidad"
 * requieren peso por unidad, que no siempre está disponible en OFF.
 *
 * @param {number} amount
 * @param {string} unit — "g" | "ml" | "unidad"
 * @returns {number} gramos equivalentes, o null si no calculable
 */
export function toGrams(amount, unit) {
  switch (unit) {
    case 'g':
    case 'ml':
      return amount;
    case 'unidad':
      // Sin datos de peso por unidad → devuelve null (se omite del cálculo)
      return null;
    default:
      return null;
  }
}

/**
 * Calcula los valores nutricionales totales de una lista de ingredientes.
 *
 * @param {Array<{productCode: string, amount: number, unit: string}>} ingredients
 * @returns {Promise<NutritionValues>} nutrición total (no por ración)
 */
export async function calculateTotalNutrition(ingredients) {
  const totals = {
    kcal: 0,
    proteins_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugars_g: 0,
    salt_g: 0,
    saturated_fat_g: 0,
  };

  for (const ingredient of ingredients) {
    const grams = toGrams(ingredient.amount, ingredient.unit);
    if (grams === null) continue; // unidad no calculable

    const product = await db.products.get(ingredient.productCode);
    if (!product) continue; // producto no en IndexedDB

    for (const [field, offKey] of Object.entries(OFF_FIELD_MAP)) {
      const per100 = parseFloat(product[offKey]);
      if (!isNaN(per100)) {
        totals[field] += (per100 * grams) / 100;
      }
    }
  }

  // Redondear a 1 decimal
  return Object.fromEntries(
    Object.entries(totals).map(([k, v]) => [k, Math.round(v * 10) / 10])
  );
}

/**
 * Calcula la nutrición de una receta completa y la divide por raciones.
 *
 * @param {import('../recipes/RecipeStore.js').Ingredient[]} ingredients
 * @param {number} servings — número de raciones
 * @returns {Promise<NutritionValues>} nutrición por ración
 */
export async function calculateRecipeNutritionPerServing(ingredients, servings) {
  const total = await calculateTotalNutrition(ingredients);
  const perServing = {};

  for (const [key, value] of Object.entries(total)) {
    perServing[key] = Math.round((value / servings) * 10) / 10;
  }

  return perServing;
}

/**
 * Calcula la nutrición de una porción de una receta ya calculada.
 *
 * @param {NutritionValues} nutritionPerServing — nutrición por ración (pre-calculada)
 * @param {number} servingsConsumed — raciones consumidas (puede ser decimal: 1.5)
 * @returns {NutritionValues}
 */
export function scaleNutrition(nutritionPerServing, servingsConsumed) {
  return Object.fromEntries(
    Object.entries(nutritionPerServing).map(([k, v]) => [
      k,
      Math.round(v * servingsConsumed * 10) / 10,
    ])
  );
}

/**
 * Formatea los valores nutricionales para mostrar en UI
 * @param {NutritionValues} nutrition
 * @returns {Array<{label: string, value: string, unit: string}>}
 */
export function formatNutritionForDisplay(nutrition) {
  return [
    { label: 'Calorías',          value: nutrition.kcal,             unit: 'kcal', highlight: true },
    { label: 'Proteínas',         value: nutrition.proteins_g,        unit: 'g' },
    { label: 'Carbohidratos',     value: nutrition.carbs_g,           unit: 'g' },
    { label: '  del que azúcares',value: nutrition.sugars_g,          unit: 'g', sub: true },
    { label: 'Grasas',            value: nutrition.fat_g,             unit: 'g' },
    { label: '  de las cuales sat.', value: nutrition.saturated_fat_g, unit: 'g', sub: true },
    { label: 'Fibra',             value: nutrition.fiber_g,           unit: 'g' },
    { label: 'Sal',               value: nutrition.salt_g,            unit: 'g' },
  ];
}
