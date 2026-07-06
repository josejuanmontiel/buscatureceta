/**
 * RecipeStore — CRUD de recetas en IndexedDB (via Dexie)
 *
 * Una receta tiene:
 *  - Metadatos: nombre, descripción, raciones, etiquetas, fuente
 *  - Ingredientes: lista de productos OFF (por código de barras) con cantidad y unidad
 *  - Nutrición: calculada automáticamente por NutritionCalculator al guardar
 */

import { db } from '../../db/schema.js';

/**
 * Estructura de una receta guardada
 * @typedef {Object} Recipe
 * @property {number}      id          — autoincrement
 * @property {string}      name        — nombre de la receta
 * @property {string}      description — descripción / instrucciones
 * @property {number}      servings    — número de raciones que produce
 * @property {string}      source      — "local" | "mealie" | "tandoor"
 * @property {string|null} externalId  — id/slug en sistema externo
 * @property {string[]}    tags        — etiquetas (grupo alimentario, etc.)
 * @property {string}      createdAt   — ISO timestamp
 * @property {string}      updatedAt   — ISO timestamp
 * @property {Ingredient[]} ingredients
 * @property {NutritionPer100|null} nutritionPerServing — cacheado al guardar
 */

/**
 * @typedef {Object} Ingredient
 * @property {string} productCode   — código de barras en store products
 * @property {string} productName   — desnormalizado para rapidez de UI
 * @property {number} amount        — cantidad en la unidad indicada
 * @property {string} unit          — "g" | "ml" | "unidad"
 */

/**
 * Obtener todas las recetas, ordenadas por nombre
 * @returns {Promise<Recipe[]>}
 */
export async function getAllRecipes() {
  return db.recipes.orderBy('name').toArray();
}

/**
 * Obtener una receta por id
 * @param {number} id
 * @returns {Promise<Recipe|undefined>}
 */
export async function getRecipeById(id) {
  return db.recipes.get(id);
}

/**
 * Buscar recetas por nombre (búsqueda parcial, case-insensitive)
 * @param {string} query
 * @returns {Promise<Recipe[]>}
 */
export async function searchRecipes(query) {
  const q = query.toLowerCase().trim();
  if (!q) return getAllRecipes();
  return db.recipes
    .filter(r => r.name.toLowerCase().includes(q))
    .toArray();
}

/**
 * Crear una receta nueva
 * @param {Omit<Recipe, 'id'|'createdAt'|'updatedAt'>} data
 * @returns {Promise<number>} id de la nueva receta
 */
export async function createRecipe(data) {
  const now = new Date().toISOString();
  return db.recipes.add({
    description: '',
    source: 'local',
    externalId: null,
    tags: [],
    ingredients: [],
    nutritionPerServing: null,
    ...data,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Actualizar una receta existente
 * @param {number} id
 * @param {Partial<Recipe>} changes
 * @returns {Promise<number>} número de registros actualizados
 */
export async function updateRecipe(id, changes) {
  return db.recipes.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Eliminar una receta
 * @param {number} id
 */
export async function deleteRecipe(id) {
  return db.recipes.delete(id);
}

/**
 * Importar una receta desde un sistema externo (Mealie, Tandoor...)
 * Si ya existe una receta con el mismo externalId+source, la actualiza.
 * @param {string} source   — "mealie" | "tandoor"
 * @param {string} externalId
 * @param {Omit<Recipe, 'id'|'source'|'externalId'|'createdAt'|'updatedAt'>} data
 * @returns {Promise<number>} id de la receta
 */
export async function importRecipeFromExternal(source, externalId, data) {
  const existing = await db.recipes
    .where({ source, externalId })
    .first();

  if (existing) {
    await updateRecipe(existing.id, data);
    return existing.id;
  }

  return createRecipe({ ...data, source, externalId });
}
