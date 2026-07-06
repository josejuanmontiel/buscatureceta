/**
 * DiaryStore — CRUD del diario de ingesta en IndexedDB (via Dexie)
 *
 * Un registro de diario (DiaryEntry) representa una comida en un día concreto.
 * Cada comida contiene uno o más items (receta o producto directo).
 *
 * La nutrición se snapshot-ea al momento de registrar para que
 * los cambios posteriores en recetas no afecten al historial.
 */

import { db, MEAL_TYPES } from '../../db/schema.js';
import { scaleNutrition } from '../nutrition/NutritionCalculator.js';

/**
 * @typedef {Object} DiaryEntry
 * @property {number}       id
 * @property {string}       date      — "YYYY-MM-DD"
 * @property {string}       mealType  — "breakfast" | "lunch" | "dinner" | "snack"
 * @property {DiaryItem[]}  items
 * @property {DiaryContext|null} context — opcional: contexto comportamental
 * @property {string}       createdAt
 */

/**
 * @typedef {Object} DiaryItem
 * @property {string}      type         — "recipe" | "product" | "free"
 * @property {number|null} recipeId     — id de Recipe (si type="recipe")
 * @property {string|null} productCode  — código OFF (si type="product")
 * @property {string}      name         — nombre para mostrar (desnormalizado)
 * @property {number}      servings     — raciones consumidas (puede ser decimal)
 * @property {import('../nutrition/NutritionCalculator.js').NutritionValues} nutrition
 *   Nutrición TOTAL de esta entrada (ya multiplicada por servings). Snapshot inmutable.
 */

/**
 * @typedef {Object} DiaryContext
 * @property {number|null} hunger_before   — hambre antes 1-10 (opcional)
 * @property {number|null} fullness_after  — saciedad después 1-10 (opcional)
 * @property {string|null} mood            — "good" | "neutral" | "bad" | null
 * @property {boolean|null} ate_at_home
 * @property {string}      notes          — texto libre
 */

/**
 * Formatear una fecha como "YYYY-MM-DD" en hora local
 * @param {Date} [date]
 * @returns {string}
 */
export function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Obtener todas las entradas de un día concreto
 * @param {string} date — "YYYY-MM-DD"
 * @returns {Promise<DiaryEntry[]>}
 */
export async function getDayEntries(date) {
  return db.diary.where('date').equals(date).toArray();
}

/**
 * Obtener entradas de un rango de fechas (ambas inclusive)
 * @param {string} from — "YYYY-MM-DD"
 * @param {string} to   — "YYYY-MM-DD"
 * @returns {Promise<DiaryEntry[]>}
 */
export async function getEntriesInRange(from, to) {
  return db.diary
    .where('date')
    .between(from, to, true, true)
    .toArray();
}

/**
 * Obtener las entradas de la semana actual (lunes a domingo)
 * @param {Date} [referenceDate]
 * @returns {Promise<{entries: DiaryEntry[], weekDays: string[]}>}
 */
export async function getCurrentWeekEntries(referenceDate = new Date()) {
  const weekDays = getWeekDays(referenceDate);
  const entries = await getEntriesInRange(weekDays[0], weekDays[6]);
  return { entries, weekDays };
}

/**
 * Obtener los 7 días de la semana que contiene la fecha dada (lun-dom)
 * @param {Date} date
 * @returns {string[]} array de 7 "YYYY-MM-DD" empezando en lunes
 */
export function getWeekDays(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  // Ajustar: getDay() devuelve 0=domingo, queremos 0=lunes
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return toDateKey(day);
  });
}

/**
 * Registrar una comida en el diario
 *
 * @param {Object} params
 * @param {string}  params.date      — "YYYY-MM-DD" (default: hoy)
 * @param {string}  params.mealType
 * @param {DiaryItem[]} params.items
 * @param {DiaryContext} [params.context]
 * @returns {Promise<number>} id del nuevo registro
 */
export async function addDiaryEntry({ date, mealType, items, context = null }) {
  // Verificar que no existe ya una entrada para este día+tipo
  const existing = await db.diary
    .where({ date, mealType })
    .first();

  if (existing) {
    // Añadir items a la entrada existente en lugar de crear una nueva
    const updatedItems = [...existing.items, ...items];
    await db.diary.update(existing.id, {
      items: updatedItems,
      updatedAt: new Date().toISOString(),
    });
    return existing.id;
  }

  return db.diary.add({
    date: date ?? toDateKey(),
    mealType,
    items,
    context,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Eliminar una entrada completa del diario
 * @param {number} id
 */
export async function deleteDiaryEntry(id) {
  return db.diary.delete(id);
}

/**
 * Eliminar un item concreto de una entrada del diario
 * @param {number} entryId
 * @param {number} itemIndex — índice del item en entry.items
 */
export async function removeDiaryItem(entryId, itemIndex) {
  const entry = await db.diary.get(entryId);
  if (!entry) return;

  const updatedItems = entry.items.filter((_, i) => i !== itemIndex);

  if (updatedItems.length === 0) {
    // Si no quedan items, borrar la entrada completa
    await db.diary.delete(entryId);
  } else {
    await db.diary.update(entryId, {
      items: updatedItems,
      updatedAt: new Date().toISOString(),
    });
  }
}

/**
 * Calcular la nutrición total de un día
 * @param {string} date
 * @returns {Promise<import('../nutrition/NutritionCalculator.js').NutritionValues>}
 */
export async function getDayNutritionTotals(date) {
  const entries = await getDayEntries(date);

  const totals = {
    kcal: 0, proteins_g: 0, carbs_g: 0, fat_g: 0,
    fiber_g: 0, sugars_g: 0, salt_g: 0, saturated_fat_g: 0,
  };

  for (const entry of entries) {
    for (const item of entry.items) {
      for (const [key] of Object.entries(totals)) {
        totals[key] += item.nutrition?.[key] ?? 0;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(totals).map(([k, v]) => [k, Math.round(v * 10) / 10])
  );
}

/**
 * Obtener un resumen de la semana: nutrición por día
 * @param {Date} [referenceDate]
 * @returns {Promise<Array<{date: string, nutrition: Object, hasMeals: boolean}>>}
 */
export async function getWeekSummary(referenceDate = new Date()) {
  const { weekDays } = await getCurrentWeekEntries(referenceDate);

  return Promise.all(
    weekDays.map(async (date) => {
      const entries = await getDayEntries(date);
      const nutrition = await getDayNutritionTotals(date);
      return {
        date,
        nutrition,
        hasMeals: entries.length > 0,
        mealTypes: entries.map(e => e.mealType),
      };
    })
  );
}

export { MEAL_TYPES };
