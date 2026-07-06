/**
 * RecipeAdapter — Interfaz base para adaptadores de sistemas de recetas externos
 *
 * Cualquier sistema externo (Mealie, Tandoor, custom) debe implementar
 * esta interfaz para integrarse con NutriAgenda.
 *
 * Uso:
 *   const adapter = new MealieAdapter({ baseUrl: '...', token: '...' });
 *   const recipes = await adapter.search('lentejas');
 *   await adapter.syncToLocal(recipes[0]);
 */

import { importRecipeFromExternal } from './RecipeStore.js';
import { calculateRecipeNutritionPerServing } from '../nutrition/NutritionCalculator.js';

export class RecipeAdapter {
  /** @type {string} nombre del sistema ("mealie" | "tandoor" | ...) */
  get sourceName() {
    throw new Error('RecipeAdapter.sourceName must be implemented');
  }

  /**
   * Buscar recetas en el sistema externo
   * @param {string} query
   * @returns {Promise<Array>} lista de resultados normalizados
   */
  async search(query) {
    throw new Error('RecipeAdapter.search() must be implemented');
  }

  /**
   * Obtener una receta completa por su id/slug en el sistema externo
   * @param {string} externalId
   * @returns {Promise<Object>} receta normalizada
   */
  async getById(externalId) {
    throw new Error('RecipeAdapter.getById() must be implemented');
  }

  /**
   * Verificar si la conexión con el sistema externo está disponible
   * @returns {Promise<boolean>}
   */
  async ping() {
    throw new Error('RecipeAdapter.ping() must be implemented');
  }

  /**
   * Normalizar el formato del sistema externo al formato local de NutriAgenda.
   * Debe ser sobrescrito por cada adaptador.
   * @param {Object} externalRecipe — receta en el formato del sistema externo
   * @returns {Object} receta en formato NutriAgenda
   */
  normalize(externalRecipe) {
    throw new Error('RecipeAdapter.normalize() must be implemented');
  }

  /**
   * Importar una receta externa a la store local.
   * Calcula la nutrición cruzando ingredientes con IndexedDB OFF.
   * Si la receta ya existe (mismo source+externalId), la actualiza.
   *
   * @param {string} externalId
   * @returns {Promise<number>} id local de la receta
   */
  async syncToLocal(externalId) {
    const externalRecipe = await this.getById(externalId);
    const normalized = this.normalize(externalRecipe);

    // Calcular nutrición si hay ingredientes con código de barras
    let nutritionPerServing = null;
    const ingredientsWithCode = normalized.ingredients.filter(i => i.productCode);
    if (ingredientsWithCode.length > 0) {
      nutritionPerServing = await calculateRecipeNutritionPerServing(
        ingredientsWithCode,
        normalized.servings
      );
    }

    return importRecipeFromExternal(
      this.sourceName,
      externalId,
      { ...normalized, nutritionPerServing }
    );
  }
}

// ── Registro de adaptadores disponibles ──────────────────────────────────────

const adapterRegistry = new Map();

/**
 * Registrar un adaptador para que esté disponible en la app
 * @param {string} sourceName
 * @param {RecipeAdapter} adapter
 */
export function registerAdapter(sourceName, adapter) {
  adapterRegistry.set(sourceName, adapter);
}

/**
 * Obtener todos los adaptadores registrados
 * @returns {Map<string, RecipeAdapter>}
 */
export function getAdapters() {
  return adapterRegistry;
}

/**
 * Obtener un adaptador por nombre
 * @param {string} sourceName
 * @returns {RecipeAdapter|undefined}
 */
export function getAdapter(sourceName) {
  return adapterRegistry.get(sourceName);
}
