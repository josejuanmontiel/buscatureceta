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
  formData.append('lang', 'es');
  formData.append(`imgupload_${type}`, imageBlob, `${barcode}_${type}.jpg`);

  const response = await fetch(`${API_BASE_URL}/cgi/product_image_upload.pl`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error HTTP en la subida (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data.status && data.status !== 'status ok') {
    throw new Error(data.error || data.status || 'La API de OpenFoodFacts rechazó la imagen');
  }

  return data;
}

/**
 * Actualiza los datos textuales de un producto (nombre, idioma) en OpenFoodFacts.
 * @param {string} barcode 
 * @param {Object} fields - Ej: { product_name: 'Nombre', lang: 'es' }
 * @param {string} userId 
 * @param {string} password 
 */
export async function updateProductDetails(barcode, fields, userId, password) {
  try {
    const formData = new FormData();
    formData.append('code', barcode);
    formData.append('user_id', userId);
    formData.append('password', password);

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, value);
      }
    }

    const response = await fetch(`${API_BASE_URL}/cgi/product_jqm2.pl`, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const data = await response.json();
      return data.status === 1 || data.status === 'status ok';
    }
  } catch (err) {
    console.warn('[OFF] No se pudieron sincronizar los metadatos de texto:', err);
  }
  return false;
}

/**
 * Guarda credenciales OFF en localStorage.
 * @param {string} userId 
 * @param {string} password 
 */
export function saveCredentials(userId, password) {
  if (userId) localStorage.setItem('off_user', userId.trim());
  if (password) localStorage.setItem('off_password', password.trim());
}

/**
 * Guarda una imagen en la cola local pendingUploads y crea el producto
 * localmente (con nombre provisional) para que sea utilizable de inmediato.
 *
 * @param {string} barcode
 * @param {Blob} imageBlob
 * @param {'front'|'ingredients'|'nutrition'} type
 * @param {string} [productName] - Nombre provisional del producto
 * @param {Blob} [originalBlob] - Imagen original sin recortar opcional
 * @param {Object} [cropConfig] - Configuración del recorte { aspect, rotation, cropRect }
 */
export async function saveImageToPendingUploads(barcode, imageBlob, type = 'front', productName = '', originalBlob = null, cropConfig = null) {
  // Persistir la imagen como ArrayBuffer en Dexie
  const arrayBuffer = await imageBlob.arrayBuffer();
  let originalBuffer = null;
  if (originalBlob) {
    originalBuffer = await originalBlob.arrayBuffer();
  }

  // Buscar si ya existe el producto para obtener su nombre si no viene
  const existingProduct = await db.products.get(barcode);
  const finalName = productName || (existingProduct ? existingProduct.product_name : '') || `Producto ${barcode}`;

  const recordId = await db.pendingUploads.add({
    barcode,
    productName: finalName,
    type,
    imageData: arrayBuffer,
    originalImageData: originalBuffer || arrayBuffer,
    cropConfig: cropConfig || null,
    mimeType: imageBlob.type || 'image/jpeg',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Crear producto local mínimo si no existe ya
  if (!existingProduct) {
    await db.products.add({
      code: barcode,
      product_name: finalName,
      _localOnly: true,
    });
  } else if (productName && existingProduct.product_name !== productName) {
    await db.products.update(barcode, { product_name: productName });
  }

  console.log(`[OFF] Imagen guardada en cola local para ${barcode} (${type}) id: ${recordId}`);
  return recordId;
}

/**
 * Actualiza un registro existente en la cola de subidas.
 * @param {number} id
 * @param {Object} data
 */
export async function updateUpload(id, data) {
  const updates = { ...data, updatedAt: new Date().toISOString() };
  if (updates.imageBlob) {
    updates.imageData = await updates.imageBlob.arrayBuffer();
    updates.mimeType = updates.imageBlob.type || 'image/jpeg';
    delete updates.imageBlob;
  }
  if (updates.originalBlob) {
    updates.originalImageData = await updates.originalBlob.arrayBuffer();
    delete updates.originalBlob;
  }
  await db.pendingUploads.update(id, updates);
  
  // Si cambia el nombre de producto, sincronizar en db.products
  if (data.productName && data.barcode) {
    const existing = await db.products.get(data.barcode);
    if (existing) {
      await db.products.update(data.barcode, { product_name: data.productName });
    }
  }
}

/**
 * Obtiene un registro de la cola por su ID.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export async function getUploadById(id) {
  return db.pendingUploads.get(Number(id));
}

/**
 * Obtiene todas las fotos asociadas a un código de barras.
 * @param {string} barcode
 * @returns {Promise<Array>}
 */
export async function getUploadsByBarcode(barcode) {
  return db.pendingUploads.where('barcode').equals(barcode).toArray();
}

/**
 * Obtiene todas las subidas de la cola (ordenadas de más reciente a más antigua).
 * @returns {Promise<Array>}
 */
export async function getAllUploads() {
  const items = await db.pendingUploads.toArray();
  return items.sort((a, b) => (b.id || 0) - (a.id || 0));
}

/**
 * Obtiene estadísticas de la cola de subidas OFF.
 * @returns {Promise<{pending: number, failed: number, done: number, total: number}>}
 */
export async function getOffStats() {
  const all = await db.pendingUploads.toArray();
  let pending = 0;
  let failed = 0;
  let done = 0;

  for (const item of all) {
    if (item.status === 'pending' || item.status === 'uploading') pending++;
    else if (item.status === 'failed') failed++;
    else if (item.status === 'done') done++;
  }

  return {
    pending,
    failed,
    done,
    total: all.length,
  };
}

/**
 * Guarda una contribución de metadatos (peso, cantidad, nombre) en la cola local pendingUploads
 * @param {string} barcode - Código de barras numérico o con prefijo GENERIC_
 * @param {Object} fields - Campos para OFF: ej. { quantity: '500 g', product_quantity: '500', product_name: 'Couscous', lang: 'es' }
 * @param {string} [productName] - Nombre descriptivo para la UI
 */
export async function saveMetadataToPendingUploads(barcode, fields, productName = '') {
  if (!barcode) return null;
  const cleanBarcode = barcode.replace(/^GENERIC_/, '').trim();
  if (!/^\d{8,14}$/.test(cleanBarcode)) return null;

  // Si ya existe un registro de metadata pendiente o fallido para este barcode, lo fusionamos
  const existing = await db.pendingUploads
    .where('barcode').equals(cleanBarcode)
    .filter(u => u.type === 'metadata' && (u.status === 'pending' || u.status === 'failed'))
    .first();

  if (existing) {
    const mergedFields = { ...(existing.fields || {}), ...fields };
    await db.pendingUploads.update(existing.id, {
      fields: mergedFields,
      productName: productName || existing.productName,
      status: 'pending',
      updatedAt: new Date().toISOString()
    });
    console.log(`[OFF] Metadatos actualizados en cola local para ${cleanBarcode}:`, mergedFields);
    return existing.id;
  }

  const finalName = productName || (fields.product_name || `Producto ${cleanBarcode}`);
  const recordId = await db.pendingUploads.add({
    barcode: cleanBarcode,
    productName: finalName,
    type: 'metadata',
    fields: { lang: 'es', ...fields },
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  console.log(`[OFF] Metadatos guardados en cola local para ${cleanBarcode} id: ${recordId}`);
  return recordId;
}

/**
 * Reintenta la subida de un elemento fallido por su ID.
 * @param {number} id
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function retryUpload(id) {
  const item = await db.pendingUploads.get(Number(id));
  if (!item) {
    throw new Error(`Subida con ID ${id} no encontrada.`);
  }

  const { userId, password } = getCredentials();
  try {
    await db.pendingUploads.update(item.id, { status: 'uploading' });

    if (item.type === 'metadata') {
      const fieldsToSend = { lang: 'es', ...(item.fields || {}) };
      if (item.productName && !item.productName.startsWith('Producto ') && !fieldsToSend.product_name) {
        fieldsToSend.product_name = item.productName;
      }
      await updateProductDetails(item.barcode, fieldsToSend, userId, password);
    } else {
      const blob = new Blob([item.imageData], { type: item.mimeType || 'image/jpeg' });
      await uploadImage(item.barcode, blob, item.type || 'front', userId, password);

      // Enviar nombre e idioma del producto a OpenFoodFacts si están definidos
      if (item.productName && !item.productName.startsWith('Producto ')) {
        await updateProductDetails(item.barcode, {
          product_name: item.productName,
          lang: 'es'
        }, userId, password);
      }
    }

    await db.pendingUploads.update(item.id, {
      status: 'done',
      uploadedAt: new Date().toISOString(),
      lastError: null,
    });
    return { success: true };
  } catch (err) {
    console.error(`[OFF Retry] Error al reintentar ID ${id}:`, err);
    await db.pendingUploads.update(item.id, {
      status: 'failed',
      lastError: err.message || 'Error desconocido al subir a OpenFoodFacts',
    });
    return { success: false, error: err.message };
  }
}

/**
 * Procesa la cola de pendingUploads y sube cada imagen o metadato a la API OFF.
 * Actualiza el campo `status` de cada registro según el resultado.
 *
 * @param {Function} [onProgress] - Callback (processed, total, ok, failed)
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

      if (item.type === 'metadata') {
        const fieldsToSend = { lang: 'es', ...(item.fields || {}) };
        if (item.productName && !item.productName.startsWith('Producto ') && !fieldsToSend.product_name) {
          fieldsToSend.product_name = item.productName;
        }
        await updateProductDetails(item.barcode, fieldsToSend, userId, password);
      } else {
        const blob = new Blob([item.imageData], { type: item.mimeType || 'image/jpeg' });
        await uploadImage(item.barcode, blob, item.type || 'front', userId, password);

        // Enviar nombre e idioma del producto a OpenFoodFacts si están definidos
        if (item.productName && !item.productName.startsWith('Producto ')) {
          await updateProductDetails(item.barcode, {
            product_name: item.productName,
            lang: 'es'
          }, userId, password);
        }
      }

      await db.pendingUploads.update(item.id, {
        status: 'done',
        uploadedAt: new Date().toISOString(),
        lastError: null,
      });
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
 * Devuelve el número de subidas pendientes o fallidas.
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
  return db.pendingUploads.delete(Number(id));
}
