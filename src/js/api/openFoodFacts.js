/**
 * openFoodFacts.js
 * Módulo para interactuar con la API de OpenFoodFacts (v3).
 */
import { db } from '../db/schema.js';

// Usamos el entorno de producción (org) en lugar del de test (net)
const API_BASE_URL = 'https://world.openfoodfacts.org';

// Credenciales OFF: carga desde localStorage.
export function getCredentials() {
  return {
    userId: localStorage.getItem('off_user') || 'off',
    password: localStorage.getItem('off_password') || 'off',
  };
}

/**
 * Sube una imagen de un producto a OpenFoodFacts usando product_image_upload.pl
 *
 * @param {string} barcode - Código de barras del producto
 * @param {Blob} imageBlob - El blob/archivo de la imagen
 * @param {'front'|'ingredients'|'nutrition'} type - Tipo de imagen
 * @param {string} userId - Usuario de OFF
 * @param {string} password - Contraseña de OFF
 * @returns {Promise<Object>} Respuesta de la API
 */
export async function uploadImage(barcode, imageBlob, type, userId, password) {
  if (!['front', 'ingredients', 'nutrition'].includes(type)) {
    throw new Error('Tipo de imagen inválido. Debe ser: front, ingredients o nutrition.');
  }

  const formData = new FormData();
  formData.append('code', barcode);
  formData.append('user_id', userId);
  formData.append('password', password);
  formData.append('imagefield', type);
  formData.append(`imgupload_${type}`, imageBlob, `${barcode}_${type}.jpg`);

  const response = await fetch(`${API_BASE_URL}/cgi/product_image_upload.pl`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en la subida: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Guarda una imagen en la cola local pendingUploads y crea el producto
 * localmente (con nombre provisional) para que sea utilizable de inmediato.
 *
 * @param {string} barcode
 * @param {Blob} imageBlob
 * @param {'front'|'ingredients'|'nutrition'} type
 * @param {string} [productName] - Nombre provisional del producto
 */
export async function saveImageToPendingUploads(barcode, imageBlob, type = 'front', productName = '') {
  // Persistir la imagen como ArrayBuffer en Dexie
  const arrayBuffer = await imageBlob.arrayBuffer();

  await db.pendingUploads.add({
    barcode,
    type,
    imageData: arrayBuffer,
    mimeType: imageBlob.type || 'image/jpeg',
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  // Crear producto local mínimo si no existe ya
  const existing = await db.products.get(barcode);
  if (!existing) {
    await db.products.add({
      code: barcode,
      product_name: productName || `Producto ${barcode}`,
      _localOnly: true,
    });
  }

  console.log(`[OFF] Imagen guardada en cola local para ${barcode} (${type})`);
}

/**
 * Procesa la cola de pendingUploads y sube cada imagen a la API OFF.
 * Actualiza el campo `status` de cada registro según el resultado.
 *
 * @param {Function} [onProgress] - Callback (processed, total)
 * @returns {Promise<{ok: number, failed: number}>}
 */
export async function syncPendingUploads(onProgress) {
  const { userId, password } = getCredentials();
  const pending = await db.pendingUploads.where('status').anyOf(['pending', 'failed']).toArray();

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    try {
      await db.pendingUploads.update(item.id, { status: 'uploading' });

      const blob = new Blob([item.imageData], { type: item.mimeType });
      await uploadImage(item.barcode, blob, item.type, userId, password);

      await db.pendingUploads.update(item.id, { status: 'done', uploadedAt: new Date().toISOString() });
      ok++;
    } catch (err) {
      console.error(`[OFF Sync] Fallo al subir ${item.barcode}:`, err);
      await db.pendingUploads.update(item.id, { status: 'failed', lastError: err.message });
      failed++;
    }

    if (typeof onProgress === 'function') {
      onProgress(i + 1, pending.length, ok, failed);
    }
  }

  return { ok, failed };
}

/**
 * Devuelve el número de subidas pendientes.
 * @returns {Promise<number>}
 */
export async function countPendingUploads() {
  return db.pendingUploads.where('status').anyOf(['pending', 'failed']).count();
}

/**
 * Obtiene la lista de fotos pendientes de subir.
 * @returns {Promise<Array>}
 */
export async function getPendingUploads() {
  return db.pendingUploads.where('status').anyOf(['pending', 'failed']).toArray();
}

/**
 * Borra una foto pendiente de la cola por su ID.
 * @param {number} id
 */
export async function deletePendingUpload(id) {
  return db.pendingUploads.delete(id);
}
