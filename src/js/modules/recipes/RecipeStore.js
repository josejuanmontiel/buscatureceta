/**
 * RecipeStore — CRUD de recetas en IndexedDB (via Dexie)
 *
 * Una receta tiene:
 *  - Metadatos: nombre, descripción, instrucciones, notas, raciones, etiquetas, foto
 *  - Ingredientes: lista de productos OFF (por código de barras) con cantidad y unidad
 *  - Nutrición: calculada automáticamente por NutritionCalculator al guardar
 *  - Historial: cada guardado genera una snapshot en recipeVersions
 */

import { db } from '../../db/schema.js';

/**
 * Estructura de una receta guardada
 * @typedef {Object} Recipe
 * @property {number}      id          — autoincrement
 * @property {string}      name        — nombre de la receta
 * @property {string}      description — descripción breve
 * @property {string}      instructions — pasos/método de preparación (texto libre)
 * @property {string}      notes       — apuntes libres del cocinero
 * @property {number}      servings    — número de raciones que produce
 * @property {string}      source      — "local" | "mealie" | "tandoor"
 * @property {string|null} externalId  — id/slug en sistema externo
 * @property {string[]}    tags        — etiquetas (grupo alimentario, etc.)
 * @property {Blob|null}   photoBlob   — foto de la receta
 * @property {number}      version     — número de versión (autoincremental)
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
 * @param {Omit<Recipe, 'id'|'createdAt'|'updatedAt'|'version'>} data
 * @returns {Promise<number>} id de la nueva receta
 */
export async function createRecipe(data) {
  const now = new Date().toISOString();
  return db.recipes.add({
    description: '',
    instructions: '',
    notes: '',
    source: 'local',
    externalId: null,
    tags: [],
    ingredients: [],
    nutritionPerServing: null,
    photoBlob: null,
    version: 1,
    ...data,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Actualizar una receta existente.
 * Antes de actualizar, guarda una snapshot del estado actual en recipeVersions.
 * @param {number} id
 * @param {Partial<Recipe>} changes
 * @returns {Promise<number>} número de registros actualizados
 */
export async function updateRecipe(id, changes) {
  const current = await db.recipes.get(id);
  if (!current) return 0;

  // Guardar snapshot antes de modificar
  await db.recipeVersions.add({
    recipeId: id,
    savedAt: new Date().toISOString(),
    versionNumber: current.version || 1,
    snapshot: { ...current },
  });

  const nextVersion = (current.version || 1) + 1;

  return db.recipes.update(id, {
    ...changes,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Obtener el historial de versiones de una receta, ordenado del más reciente al más antiguo
 * @param {number} recipeId
 * @returns {Promise<Array>}
 */
export async function getRecipeVersions(recipeId) {
  const versions = await db.recipeVersions
    .where('recipeId').equals(recipeId)
    .toArray();
  // Ordenar desc por savedAt
  return versions.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Obtener una versión concreta por su id
 * @param {number} versionId
 * @returns {Promise<Object|undefined>}
 */
export async function getVersionById(versionId) {
  return db.recipeVersions.get(versionId);
}

/**
 * Restaurar una receta a una versión anterior.
 * La versión actual se guarda como snapshot antes de reemplazarla.
 * @param {number} recipeId
 * @param {number} versionId — id en recipeVersions
 * @returns {Promise<void>}
 */
export async function restoreVersion(recipeId, versionId) {
  const versionEntry = await db.recipeVersions.get(versionId);
  if (!versionEntry || versionEntry.recipeId !== recipeId) {
    throw new Error('Versión no encontrada o no pertenece a esta receta');
  }

  const { snapshot } = versionEntry;
  const { id: _id, version: _version, createdAt: _createdAt, ...restoreData } = snapshot;

  await updateRecipe(recipeId, restoreData);
}

/**
 * Eliminar una receta y todas sus versiones
 * @param {number} id
 */
export async function deleteRecipe(id) {
  await db.recipeVersions.where('recipeId').equals(id).delete();
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
