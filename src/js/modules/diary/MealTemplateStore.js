/**
 * MealTemplateStore — Gestión de plantillas de menús reutilizables
 * 
 * Permite guardar y cargar combinaciones completas de platos
 * (aperitivo, primero, principal, postre, bebida) para asignarlas en 1 clic.
 */

import { db } from '../../db/schema.js';

/**
 * @typedef {Object} MealTemplate
 * @property {number} [id]
 * @property {string} name
 * @property {string} [mealType] 'breakfast' | 'midmorning' | 'lunch' | 'dinner' | 'snack'
 * @property {Array} items Lista de ítems (con course, name, type, servings, etc.)
 * @property {string[]} [tags]
 * @property {string} createdAt
 */

/**
 * Obtener todas las plantillas
 * @returns {Promise<MealTemplate[]>}
 */
export async function getAllTemplates() {
  return db.mealTemplates.toArray();
}

/**
 * Obtener plantillas filtradas por tipo de comida
 * @param {string} mealType
 * @returns {Promise<MealTemplate[]>}
 */
export async function getTemplatesByMealType(mealType) {
  if (!mealType) return getAllTemplates();
  const all = await db.mealTemplates.toArray();
  return all.filter(t => !t.mealType || t.mealType === mealType);
}

/**
 * Obtener una plantilla por ID
 * @param {number} id
 * @returns {Promise<MealTemplate|null>}
 */
export async function getTemplateById(id) {
  return db.mealTemplates.get(id);
}

/**
 * Guardar o actualizar una plantilla
 * @param {Object} template
 * @returns {Promise<number>} ID de la plantilla
 */
export async function saveMealTemplate({ id, name, mealType, items = [], tags = [] }) {
  if (!name || !name.trim()) throw new Error('El nombre de la plantilla es obligatorio');
  const record = {
    name: name.trim(),
    mealType: mealType || null,
    items: items.map(item => ({
      course: item.course || 'main',
      type: item.type || 'product',
      recipeId: item.recipeId || null,
      productCode: item.productCode || null,
      name: item.name,
      servings: item.servings || 1,
      customIngredients: item.customIngredients || null,
      nutrition: item.nutrition || null
    })),
    tags: Array.isArray(tags) ? tags : [],
    updatedAt: new Date().toISOString()
  };

  if (id) {
    record.id = id;
    await db.mealTemplates.put(record);
    return id;
  } else {
    record.createdAt = new Date().toISOString();
    return await db.mealTemplates.add(record);
  }
}

/**
 * Eliminar una plantilla por ID
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteMealTemplate(id) {
  return db.mealTemplates.delete(id);
}
