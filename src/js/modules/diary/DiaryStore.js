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
/**
 * Registrar una snapshot histórica en diaryVersions
 * @param {number} diaryEntryId
 * @param {Object} entryData
 * @param {'plan_created'|'plan_adjusted'|'consumed'|'deleted'} action
 * @param {string} [reason]
 */
export async function recordDiarySnapshot(diaryEntryId, entryData, action, reason = '') {
  if (!db.diaryVersions) return;
  try {
    await db.diaryVersions.add({
      diaryEntryId,
      date: entryData.date,
      mealType: entryData.mealType,
      action,
      versionNumber: entryData.version || 1,
      status: entryData.status || 'consumed',
      ate_at_home: entryData.ate_at_home ?? true,
      items: (entryData.items || []).map(i => ({
        course: i.course || 'main',
        type: i.type,
        name: i.name,
        recipeId: i.recipeId || null,
        productCode: i.productCode || null,
        servings: i.servings || 1,
        status: i.status || 'consumed',
        nutrition: i.nutrition || null,
      })),
      reason,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.warn('[DiaryStore] Error registrando snapshot de diario:', err);
  }
}

/**
 * Registrar una comida en el diario
 *
 * @param {Object} params
 * @param {string}  params.date      — "YYYY-MM-DD" (default: hoy)
 * @param {string}  params.mealType
 * @param {DiaryItem[]} params.items
 * @param {DiaryContext} [params.context]
 * @param {'planned'|'consumed'} [params.status]
 * @param {boolean} [params.ate_at_home]
 * @returns {Promise<number>} id del nuevo registro
 */
export async function addDiaryEntry({ date, mealType, items, context = null, status = 'consumed', ate_at_home = true }) {
  // Normalizar items para asegurar que tienen course y status
  const normalizedItems = items.map(item => ({
    ...item,
    course: item.course || 'main',
    status: item.status || status || 'consumed'
  }));

  // Verificar que no existe ya una entrada para este día+tipo
  const existing = await db.diary
    .where({ date, mealType })
    .first();

  if (existing) {
    // Añadir items a la entrada existente en lugar de crear una nueva
    const nextVersion = (existing.version || 1) + 1;
    const updatedItems = [...existing.items, ...normalizedItems];
    const newStatus = status || existing.status || 'consumed';
    const newAteAtHome = ate_at_home !== undefined ? ate_at_home : (existing.ate_at_home ?? true);

    await db.diary.update(existing.id, {
      items: updatedItems,
      status: newStatus,
      ate_at_home: newAteAtHome,
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    });

    await recordDiarySnapshot(existing.id, {
      date,
      mealType,
      items: updatedItems,
      status: newStatus,
      ate_at_home: newAteAtHome,
      version: nextVersion
    }, 'plan_adjusted');

    return existing.id;
  }

  const finalDate = date ?? toDateKey();
  const newId = await db.diary.add({
    date: finalDate,
    mealType,
    status: status || 'consumed',
    ate_at_home: ate_at_home !== undefined ? ate_at_home : true,
    version: 1,
    items: normalizedItems,
    context,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const action = (status === 'planned') ? 'plan_created' : 'consumed';
  await recordDiarySnapshot(newId, {
    date: finalDate,
    mealType,
    status: status || 'consumed',
    ate_at_home: ate_at_home !== undefined ? ate_at_home : true,
    version: 1,
    items: normalizedItems
  }, action);

  return newId;
}

/**
 * Actualizar una entrada existente del diario
 * @param {number} id
 * @param {Object} updates
 */
export async function updateDiaryEntry(id, updates) {
  const current = await db.diary.get(id);
  const nextVersion = ((current?.version) || 1) + 1;

  await db.diary.update(id, {
    ...updates,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  });

  const updated = await db.diary.get(id);
  if (updated) {
    await recordDiarySnapshot(id, updated, 'plan_adjusted');
  }
}

/**
 * Actualizar el estado general de una entrada ('planned' | 'consumed')
 * y sincronizar el estado de sus items si no están omitidos.
 * @param {number} id
 * @param {'planned'|'consumed'} status
 */
export async function updateEntryStatus(id, status) {
  const entry = await db.diary.get(id);
  if (!entry) return;

  const nextVersion = (entry.version || 1) + 1;
  const updatedItems = (entry.items || []).map(item => ({
    ...item,
    status: item.status === 'skipped' ? 'skipped' : status
  }));

  await db.diary.update(id, {
    status,
    items: updatedItems,
    version: nextVersion,
    updatedAt: new Date().toISOString()
  });

  const updated = await db.diary.get(id);
  if (updated) {
    const action = status === 'consumed' ? 'consumed' : 'plan_adjusted';
    await recordDiarySnapshot(id, updated, action);
  }
}

/**
 * Confirmar el consumo de una entrada especificando qué índices se consumieron
 * @param {number} entryId
 * @param {Object} options
 * @param {number[]} [options.consumedIndices] Índices de items que se consumieron (el resto se marcan como skipped)
 * @param {boolean} [options.ateAtHome]
 */
export async function confirmMealConsumption(entryId, { consumedIndices = null, ateAtHome = true } = {}) {
  const entry = await db.diary.get(entryId);
  if (!entry) return;

  const nextVersion = (entry.version || 1) + 1;
  const updatedItems = (entry.items || []).map((item, idx) => {
    const isConsumed = consumedIndices ? consumedIndices.includes(idx) : true;
    return {
      ...item,
      status: isConsumed ? 'consumed' : 'skipped'
    };
  });

  await db.diary.update(entryId, {
    status: 'consumed',
    ate_at_home: ateAtHome,
    items: updatedItems,
    version: nextVersion,
    updatedAt: new Date().toISOString()
  });

  const updated = await db.diary.get(entryId);
  if (updated) {
    await recordDiarySnapshot(entryId, updated, 'consumed');
  }
}

/**
 * Eliminar una entrada completa del diario
 * @param {number} id
 */
export async function deleteDiaryEntry(id) {
  const entry = await db.diary.get(id);
  if (entry) {
    await recordDiarySnapshot(id, entry, 'deleted');
  }
  return db.diary.delete(id);
}

/**
 * Obtener el historial cronológico de revisiones de una comida
 * @param {number} diaryEntryId
 * @returns {Promise<Array>}
 */
export async function getEntryVersions(diaryEntryId) {
  if (!db.diaryVersions) return [];
  const versions = await db.diaryVersions
    .where('diaryEntryId')
    .equals(diaryEntryId)
    .toArray();
  return versions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Obtener todas las entradas con su historial para sincronización/exportación
 * @returns {Promise<{entries: Array, versions: Array}>}
 */
export async function getAllDiaryHistory() {
  const entries = await db.diary.toArray();
  const versions = db.diaryVersions ? await db.diaryVersions.toArray() : [];
  return { entries, versions };
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
      if (item.status === 'skipped') continue;
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

// ── Gestión de Borradores de Menú Semanal (Drafts) ──────────────────────────

/**
 * Obtiene el borrador de menú de una semana concreta
 * @param {string} weekStartStr — "YYYY-MM-DD" del lunes de la semana
 * @returns {Object}
 */
export function getWeeklyDraft(weekStartStr) {
  if (!weekStartStr) return { weekStart: '', days: {}, freeText: '' };
  try {
    const raw = localStorage.getItem(`weekly_draft_${weekStartStr}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('[DiaryStore] Error leyendo borrador semanal:', e);
  }
  return { weekStart: weekStartStr, days: {}, freeText: '' };
}

/**
 * Guarda el borrador de menú de la semana
 * @param {string} weekStartStr — "YYYY-MM-DD" del lunes
 * @param {Object} draftData
 */
export function saveWeeklyDraft(weekStartStr, draftData) {
  if (!weekStartStr) return;
  const payload = {
    weekStart: weekStartStr,
    days: draftData.days || {},
    freeText: draftData.freeText || '',
    updatedAt: Date.now()
  };
  localStorage.setItem(`weekly_draft_${weekStartStr}`, JSON.stringify(payload));
}

/**
 * Elimina el borrador de menú de la semana
 * @param {string} weekStartStr
 */
export function clearWeeklyDraft(weekStartStr) {
  if (!weekStartStr) return;
  localStorage.removeItem(`weekly_draft_${weekStartStr}`);
}

/**
 * Vuelca los platos del borrador a la agenda como comidas planificadas (status: 'planned')
 * @param {string[]} weekDays — array de 7 días "YYYY-MM-DD"
 * @param {Object} draftData — { days: { [day]: { lunch, dinner, notes } } }
 * @returns {Promise<{ created: number, skipped: number }>}
 */
export async function applyDraftToWeek(weekDays, draftData) {
  let created = 0;
  let skipped = 0;

  if (!draftData || !draftData.days) return { created, skipped };

  for (const day of weekDays) {
    const dayData = draftData.days[day];
    if (!dayData) continue;

    // 1. Comida (lunch)
    if (dayData.lunch && dayData.lunch.trim()) {
      const existing = await db.diary.where({ date: day, mealType: 'lunch' }).first();
      if (!existing) {
        await addDiaryEntry({
          date: day,
          mealType: 'lunch',
          status: 'planned',
          items: [{
            type: 'free',
            name: dayData.lunch.trim(),
            course: 'main',
            status: 'planned',
            servings: 1,
            nutrition: { kcal: 0, proteins: 0, carbs: 0, fat: 0 }
          }]
        });
        created++;
      } else {
        skipped++;
      }
    }

    // 2. Cena (dinner)
    if (dayData.dinner && dayData.dinner.trim()) {
      const existing = await db.diary.where({ date: day, mealType: 'dinner' }).first();
      if (!existing) {
        await addDiaryEntry({
          date: day,
          mealType: 'dinner',
          status: 'planned',
          items: [{
            type: 'free',
            name: dayData.dinner.trim(),
            course: 'main',
            status: 'planned',
            servings: 1,
            nutrition: { kcal: 0, proteins: 0, carbs: 0, fat: 0 }
          }]
        });
        created++;
      } else {
        skipped++;
      }
    }
  }

  return { created, skipped };
}

export { MEAL_TYPES };
