/**
 * MealPhotoStore — Gestión del pool fotográfico de lo que se come
 *
 * Las fotos se capturan desde la Agenda y se guardan aquí para revisión
 * posterior: anotar manualmente, copiar al portapapeles para IA, o descartar.
 *
 * Ciclo de vida de una foto:
 *   "pending_review" → (anotar) → "logged"
 *   "pending_review" → (descartar) → "discarded"
 */

import { db } from '../../db/schema.js';

/**
 * @typedef {Object} MealPhoto
 * @property {number}      id
 * @property {string}      date          — "YYYY-MM-DD"
 * @property {string|null} mealType      — "breakfast"|"lunch"|"snack"|"dinner"|null
 * @property {Blob}        blob          — imagen original
 * @property {Blob}        thumbnailBlob — miniatura (256px)
 * @property {string}      status        — "pending_review"|"logged"|"discarded"
 * @property {string}      notes         — lo que se anotó manualmente
 * @property {number|null} diaryEntryId  — link a diary entry si se registró
 * @property {string}      capturedAt    — ISO timestamp de captura
 */

/** Generar thumbnail de un Blob de imagen (max 256px) */
async function generateThumbnail(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const maxSize = 256;
      let { width, height } = img;
      if (width > height) {
        if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
      } else {
        if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(thumbBlob => {
        if (thumbBlob) resolve(thumbBlob);
        else reject(new Error('Error al generar thumbnail'));
      }, 'image/jpeg', 0.75);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Error al cargar imagen')); };
    img.src = url;
  });
}

/**
 * Añadir una foto de comida al pool
 * @param {string}      date       — "YYYY-MM-DD"
 * @param {string|null} mealType
 * @param {Blob}        blob       — imagen capturada
 * @returns {Promise<number>} id de la nueva entrada
 */
export async function addMealPhoto(date, mealType, blob) {
  const thumbnailBlob = await generateThumbnail(blob);
  return db.mealPhotos.add({
    date,
    mealType: mealType || null,
    blob,
    thumbnailBlob,
    status: 'pending_review',
    notes: '',
    diaryEntryId: null,
    capturedAt: new Date().toISOString(),
  });
}

/**
 * Obtener todas las fotos pendientes de revisar, ordenadas por fecha desc
 * @returns {Promise<MealPhoto[]>}
 */
export async function getPendingPhotos() {
  return db.mealPhotos
    .where('status').equals('pending_review')
    .reverse()
    .sortBy('capturedAt');
}

/**
 * Obtener todas las fotos (cualquier estado) de un día
 * @param {string} date — "YYYY-MM-DD"
 * @returns {Promise<MealPhoto[]>}
 */
export async function getPhotosByDate(date) {
  return db.mealPhotos.where('date').equals(date).toArray();
}

/**
 * Contar fotos pendientes de revisar
 * @returns {Promise<number>}
 */
export async function countPendingPhotos() {
  return db.mealPhotos.where('status').equals('pending_review').count();
}

/**
 * Obtener todas las fotos no descartadas, paginadas, para la galería
 * @param {object} opts
 * @param {string|null} opts.statusFilter — null = todas excepto discarded
 * @param {string|null} opts.dateFilter   — "YYYY-MM-DD" o null
 * @returns {Promise<MealPhoto[]>}
 */
export async function getPhotosForGallery({ statusFilter = null, dateFilter = null } = {}) {
  let col;
  if (dateFilter) {
    col = db.mealPhotos.where('date').equals(dateFilter);
  } else {
    col = db.mealPhotos.toCollection();
  }

  const all = await col.toArray();

  return all
    .filter(p => {
      if (p.status === 'discarded') return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

/**
 * Obtener una foto por id
 * @param {number} id
 * @returns {Promise<MealPhoto|undefined>}
 */
export async function getMealPhotoById(id) {
  return db.mealPhotos.get(id);
}

/**
 * Anotar manualmente una foto → cambia status a "logged"
 * Opcionalmente, crea una entrada en diary.
 * @param {number} id
 * @param {string} notes          — descripción de lo que se comió
 * @param {number|null} diaryEntryId — id en diary si se registró ahí también
 * @returns {Promise<void>}
 */
export async function logPhoto(id, notes, diaryEntryId = null) {
  await db.mealPhotos.update(id, {
    status: 'logged',
    notes,
    diaryEntryId,
  });
}

/**
 * Descartar una foto
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function discardPhoto(id) {
  await db.mealPhotos.update(id, { status: 'discarded' });
}

/**
 * Eliminar definitivamente una foto
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteMealPhoto(id) {
  await db.mealPhotos.delete(id);
}
