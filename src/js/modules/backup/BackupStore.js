import { db } from '../../db/schema.js';
import * as PantryStore from '../pantry/PantryStore.js';

/**
 * Tablas que se van a exportar.
 * Excluimos 'products' deliberadamente.
 */
const TABLES_TO_BACKUP = [
  'recipes',
  'recipeVersions',
  'diary',
  'diaryVersions',
  'mealTemplates',
  'goals',
  'pantry',
  'pantryLog',
  'cart',
  'cartHistory',
  'shoppingLists',
  'preShoppingList',
  'priceHistory',
  'pendingUploads',
  'mealPhotos',
  'customProducts',
  'recentProducts'
];

const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const base64ToBlob = (base64, type) => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], {type: type});
};

const arrayBufferToBase64 = (buffer) => {
  if (!buffer) return null;
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64) => {
  if (!base64) return null;
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Genera un objeto JSON con todos los datos de las tablas seleccionadas.
 */
export async function exportData() {
  const exportObject = {
    version: 1,
    timestamp: new Date().toISOString(),
    data: {}
  };

  for (const tableName of TABLES_TO_BACKUP) {
    if (db[tableName]) {
      const records = await db[tableName].toArray();
      
      for (const record of records) {
        if (tableName === 'recipes') {
          if (record.photoBlob instanceof Blob) {
            record.photoBlobBase64 = await blobToBase64(record.photoBlob);
            record.photoBlobType = record.photoBlob.type;
            delete record.photoBlob;
          }
        }
        if (tableName === 'recipeVersions') {
          if (record.snapshot && record.snapshot.photoBlob instanceof Blob) {
            record.snapshot.photoBlobBase64 = await blobToBase64(record.snapshot.photoBlob);
            record.snapshot.photoBlobType = record.snapshot.photoBlob.type;
            delete record.snapshot.photoBlob;
          }
        }
        if (tableName === 'mealPhotos') {
          if (record.blob instanceof Blob) {
            record.blobBase64 = await blobToBase64(record.blob);
            record.blobType = record.blob.type;
            delete record.blob;
          }
          if (record.thumbnailBlob instanceof Blob) {
            record.thumbnailBlobBase64 = await blobToBase64(record.thumbnailBlob);
            record.thumbnailBlobType = record.thumbnailBlob.type;
            delete record.thumbnailBlob;
          }
        }
        if (tableName === 'cartHistory') {
          if (record.ticketBlob instanceof Blob) {
            record.ticketBlobBase64 = await blobToBase64(record.ticketBlob);
            record.ticketBlobType = record.ticketBlob.type;
            delete record.ticketBlob;
          }
          if (record.ticketThumbBlob instanceof Blob) {
            record.ticketThumbBlobBase64 = await blobToBase64(record.ticketThumbBlob);
            record.ticketThumbBlobType = record.ticketThumbBlob.type;
            delete record.ticketThumbBlob;
          }
        }
        if (tableName === 'pendingUploads') {
          if (record.imageData instanceof ArrayBuffer) {
            record.imageDataBase64 = arrayBufferToBase64(record.imageData);
            delete record.imageData;
          }
          if (record.originalImageData instanceof ArrayBuffer) {
            record.originalImageDataBase64 = arrayBufferToBase64(record.originalImageData);
            delete record.originalImageData;
          }
        }
      }
      
      exportObject.data[tableName] = records;
    }
  }

  return JSON.stringify(exportObject, null, 2);
}

/**
 * Limpia las tablas e inserta los registros desde el objeto JSON.
 * Se realiza dentro de una transacción para garantizar consistencia.
 * @param {string} jsonString 
 */
export async function importData(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed.data) {
    throw new Error('Formato de backup inválido');
  }

  const tablesToImport = Object.keys(parsed.data).filter(t => TABLES_TO_BACKUP.includes(t) && db[t]);

  // Iniciamos transacción de lectura-escritura sobre todas las tablas involucradas
  await db.transaction('rw', tablesToImport.map(t => db[t]), async () => {
    for (const tableName of tablesToImport) {
      const records = parsed.data[tableName];
      if (Array.isArray(records)) {
        await db[tableName].clear();
        
        // Restore blobs
        for (const record of records) {
          if (record.photoBlobBase64) {
            record.photoBlob = base64ToBlob(record.photoBlobBase64, record.photoBlobType || 'image/jpeg');
            delete record.photoBlobBase64;
            delete record.photoBlobType;
          } else if (record.photoBlob && typeof record.photoBlob === 'object' && Object.keys(record.photoBlob).length === 0) {
            delete record.photoBlob;
          }
          
          if (record.snapshot) {
            if (record.snapshot.photoBlobBase64) {
              record.snapshot.photoBlob = base64ToBlob(record.snapshot.photoBlobBase64, record.snapshot.photoBlobType || 'image/jpeg');
              delete record.snapshot.photoBlobBase64;
              delete record.snapshot.photoBlobType;
            } else if (record.snapshot.photoBlob && typeof record.snapshot.photoBlob === 'object' && Object.keys(record.snapshot.photoBlob).length === 0) {
              delete record.snapshot.photoBlob;
            }
          }
          
          if (record.blobBase64) {
            record.blob = base64ToBlob(record.blobBase64, record.blobType || 'image/jpeg');
            delete record.blobBase64;
            delete record.blobType;
          } else if (record.blob && typeof record.blob === 'object' && Object.keys(record.blob).length === 0) {
            delete record.blob;
          }
          
          if (record.thumbnailBlobBase64) {
            record.thumbnailBlob = base64ToBlob(record.thumbnailBlobBase64, record.thumbnailBlobType || 'image/jpeg');
            delete record.thumbnailBlobBase64;
            delete record.thumbnailBlobType;
          } else if (record.thumbnailBlob && typeof record.thumbnailBlob === 'object' && Object.keys(record.thumbnailBlob).length === 0) {
            delete record.thumbnailBlob;
          }

          if (record.ticketBlobBase64) {
            record.ticketBlob = base64ToBlob(record.ticketBlobBase64, record.ticketBlobType || 'image/jpeg');
            delete record.ticketBlobBase64;
            delete record.ticketBlobType;
          } else if (record.ticketBlob && typeof record.ticketBlob === 'object' && Object.keys(record.ticketBlob).length === 0) {
            delete record.ticketBlob;
          }

          if (record.ticketThumbBlobBase64) {
            record.ticketThumbBlob = base64ToBlob(record.ticketThumbBlobBase64, record.ticketThumbBlobType || 'image/jpeg');
            delete record.ticketThumbBlobBase64;
            delete record.ticketThumbBlobType;
          } else if (record.ticketThumbBlob && typeof record.ticketThumbBlob === 'object' && Object.keys(record.ticketThumbBlob).length === 0) {
            delete record.ticketThumbBlob;
          }

          if (record.imageDataBase64) {
            record.imageData = base64ToArrayBuffer(record.imageDataBase64);
            delete record.imageDataBase64;
          } else if (record.imageData && typeof record.imageData === 'object' && Object.keys(record.imageData).length === 0) {
            delete record.imageData;
          }

          if (record.originalImageDataBase64) {
            record.originalImageData = base64ToArrayBuffer(record.originalImageDataBase64);
            delete record.originalImageDataBase64;
          } else if (record.originalImageData && typeof record.originalImageData === 'object' && Object.keys(record.originalImageData).length === 0) {
            delete record.originalImageData;
          }
        }
        
        if (records.length > 0) {
          await db[tableName].bulkPut(records);
        }
      }
    }
  });
}

/**
 * Fusiona los registros entrantes con la base de datos actual.
 * Por defecto o según opciones, permite sincronización selectiva de 'diary'.
 * Se utiliza bulkPut para realizar un Upsert (inserta o actualiza según ID).
 * @param {string|Object} jsonInput
 * @param {Object} [options]
 * @param {boolean} [options.mergeDiary=false] Si es true, fusiona las entradas del diario
 * @param {'keep_existing'|'overwrite'} [options.diaryConflictStrategy='keep_existing']
 */
export async function mergeData(jsonInput, options = {}) {
  const parsed = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
  if (!parsed.data) {
    throw new Error('Formato de backup inválido para fusión');
  }

  const { mergeDiary = false, diaryConflictStrategy = 'keep_existing' } = options;
  const tablesToMerge = Object.keys(parsed.data).filter(t => TABLES_TO_BACKUP.includes(t) && db[t]);

  await db.transaction('rw', tablesToMerge.map(t => db[t]), async () => {
    for (const tableName of tablesToMerge) {
      if (tableName === 'diary' && !mergeDiary) {
        console.log("Omitiendo 'diary' en la fusión para no sobrescribir datos personales.");
        continue;
      }

      const records = parsed.data[tableName];
      if (Array.isArray(records) && records.length > 0) {
        if (tableName === 'diary' && mergeDiary) {
          for (const diaryRec of records) {
            const existing = await db.diary.where({ date: diaryRec.date, mealType: diaryRec.mealType }).first();
            if (!existing) {
              const recCopy = { ...diaryRec };
              delete recCopy.id; // Dejar que autoincremente o respete integridad
              await db.diary.add(recCopy);
            } else if (diaryConflictStrategy === 'overwrite') {
              await db.diary.put({ ...diaryRec, id: existing.id });
            }
          }
          continue;
        }

        // Restore blobs
        for (const record of records) {
          if (record.photoBlobBase64) {
            record.photoBlob = base64ToBlob(record.photoBlobBase64, record.photoBlobType || 'image/jpeg');
            delete record.photoBlobBase64;
            delete record.photoBlobType;
          } else if (record.photoBlob && typeof record.photoBlob === 'object' && Object.keys(record.photoBlob).length === 0) {
            delete record.photoBlob;
          }
          if (record.snapshot) {
            if (record.snapshot.photoBlobBase64) {
              record.snapshot.photoBlob = base64ToBlob(record.snapshot.photoBlobBase64, record.snapshot.photoBlobType || 'image/jpeg');
              delete record.snapshot.photoBlobBase64;
              delete record.snapshot.photoBlobType;
            } else if (record.snapshot.photoBlob && typeof record.snapshot.photoBlob === 'object' && Object.keys(record.snapshot.photoBlob).length === 0) {
              delete record.snapshot.photoBlob;
            }
          }
          if (record.blobBase64) {
            record.blob = base64ToBlob(record.blobBase64, record.blobType || 'image/jpeg');
            delete record.blobBase64;
            delete record.blobType;
          } else if (record.blob && typeof record.blob === 'object' && Object.keys(record.blob).length === 0) {
            delete record.blob;
          }
          if (record.thumbnailBlobBase64) {
            record.thumbnailBlob = base64ToBlob(record.thumbnailBlobBase64, record.thumbnailBlobType || 'image/jpeg');
            delete record.thumbnailBlobBase64;
            delete record.thumbnailBlobType;
          } else if (record.thumbnailBlob && typeof record.thumbnailBlob === 'object' && Object.keys(record.thumbnailBlob).length === 0) {
            delete record.thumbnailBlob;
          }
          if (record.ticketBlobBase64) {
            record.ticketBlob = base64ToBlob(record.ticketBlobBase64, record.ticketBlobType || 'image/jpeg');
            delete record.ticketBlobBase64;
            delete record.ticketBlobType;
          } else if (record.ticketBlob && typeof record.ticketBlob === 'object' && Object.keys(record.ticketBlob).length === 0) {
            delete record.ticketBlob;
          }
          if (record.ticketThumbBlobBase64) {
            record.ticketThumbBlob = base64ToBlob(record.ticketThumbBlobBase64, record.ticketThumbBlobType || 'image/jpeg');
            delete record.ticketThumbBlobBase64;
            delete record.ticketThumbBlobType;
          } else if (record.ticketThumbBlob && typeof record.ticketThumbBlob === 'object' && Object.keys(record.ticketThumbBlob).length === 0) {
            delete record.ticketThumbBlob;
          }
          if (record.imageDataBase64) {
            record.imageData = base64ToArrayBuffer(record.imageDataBase64);
            delete record.imageDataBase64;
          } else if (record.imageData && typeof record.imageData === 'object' && Object.keys(record.imageData).length === 0) {
            delete record.imageData;
          }
          if (record.originalImageDataBase64) {
            record.originalImageData = base64ToArrayBuffer(record.originalImageDataBase64);
            delete record.originalImageDataBase64;
          } else if (record.originalImageData && typeof record.originalImageData === 'object' && Object.keys(record.originalImageData).length === 0) {
            delete record.originalImageData;
          }
        }
        await db[tableName].bulkPut(records);
      }
    }
  });
}

/**
 * Limpia todos los datos del usuario, excepto la base de datos de productos (ingredientes).
 */
export async function clearUserData() {
  // Limpiamos las mismas tablas que se incluyen en el backup
  const tablesToClear = [...TABLES_TO_BACKUP];
  
  // Si también queremos borrar el historial de productos recientes:
  if (db.recentProducts) {
    tablesToClear.push('recentProducts');
  }

  await db.transaction('rw', tablesToClear.map(t => db[t]), async () => {
    for (const tableName of tablesToClear) {
      await db[tableName].clear();
    }
  });
}

/**
 * Descarga cualquier objeto JS como archivo JSON en el navegador
 * @param {Object} dataObject
 * @param {string} filename
 */
export function downloadJsonFile(dataObject, filename) {
  const jsonStr = JSON.stringify(dataObject, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exportar snapshot limpio del inventario de despensa
 * @returns {Promise<Object>}
 */
export async function exportPantrySnapshot() {
  const items = await PantryStore.getPantryInventory();
  return {
    schemaVersion: '1.0',
    type: 'pantry_snapshot',
    exportedAt: new Date().toISOString(),
    totalItems: items.length,
    items: items.map(i => ({
      id: i.id,
      productCode: i.productCode,
      productName: i.productName || i.product_name,
      amount: i.amount,
      unit: i.unit,
      pantryZone: i.pantryZone || 'food'
    }))
  };
}

/**
 * Exportar historial completo de ingestas y sus versiones de cambio
 * @returns {Promise<Object>}
 */
export async function exportDiaryHistory() {
  const diaryEntries = await db.diary.toArray();
  const diaryVersions = db.diaryVersions ? await db.diaryVersions.toArray() : [];

  return {
    schemaVersion: '1.0',
    type: 'diary_history',
    exportedAt: new Date().toISOString(),
    entriesCount: diaryEntries.length,
    versionsCount: diaryVersions.length,
    diary: diaryEntries,
    diaryVersions: diaryVersions
  };
}

/**
 * Importa de manera aditiva un paquete de menús / plan generado por PrimaryFoods o un export modular.
 * - Inyecta recetas en db.recipes sin sobrescribir existentes si no es necesario (usando externalId / slug).
 * - Inyecta comidas planificadas en db.diary con status='planned'.
 * - Añade los ingredientes faltantes al carrito (db.cart) o a la pre-lista (db.preShoppingList).
 *
 * @param {string|Object} packageInput
 * @param {Object} [options]
 * @param {'cart'|'preShoppingList'} [options.targetShoppingList='cart']
 * @returns {Promise<{ recipesImported: number, diaryEntriesImported: number, shoppingItemsAdded: number }>}
 */
export async function importMenuPlanPackage(packageInput, options = {}) {
  const pkg = typeof packageInput === 'string' ? JSON.parse(packageInput) : packageInput;
  if (!pkg || typeof pkg !== 'object') {
    throw new Error('Formato de paquete de menú inválido');
  }

  const { targetShoppingList = 'cart' } = options;
  let recipesImported = 0;
  let diaryEntriesImported = 0;
  let shoppingItemsAdded = 0;

  // 1. Importar recetas
  const recipesList = Array.isArray(pkg.recipes) ? pkg.recipes : (Array.isArray(pkg.Recipes) ? pkg.Recipes : []);
  for (const rec of recipesList) {
    const slug = rec.slug || rec.name.toLowerCase().trim().replace(/\s+/g, '-');
    const existing = await db.recipes.where({ source: 'primaryfoods', externalId: slug }).first()
      || await db.recipes.where('name').equalsIgnoreCase(rec.name).first();

    const recipeData = {
      name: rec.name,
      description: rec.description || '',
      servings: rec.servings || 2,
      category: rec.category || 'principal',
      instructions: rec.instructions || '',
      tags: rec.tags || [],
      source: 'primaryfoods',
      externalId: slug,
      ingredients: (rec.ingredients || []).map(ing => ({
        productCode: ing.commercialCode || (ing.primaryFoodId ? `primary:${ing.primaryFoodId}` : `generic_${slug}`),
        productName: ing.commercialName || ing.primaryName || ing.name,
        amount: ing.amount || 1,
        unit: ing.unit || 'g',
        alternatives: ing.alternatives || []
      })),
      updated_at: Date.now()
    };

    if (existing) {
      await db.recipes.update(existing.id, recipeData);
    } else {
      recipeData.created_at = Date.now();
      await db.recipes.add(recipeData);
      recipesImported++;
    }
  }

  // 2. Importar planificación de diario (diary)
  const diaryList = Array.isArray(pkg.diary) ? pkg.diary : (Array.isArray(pkg.diaryPlan) ? pkg.diaryPlan : []);
  for (const entry of diaryList) {
    if (!entry.date || !entry.mealType) continue;
    const existing = await db.diary.where({ date: entry.date, mealType: entry.mealType }).first();
    const entryData = {
      date: entry.date,
      mealType: entry.mealType,
      status: entry.status || 'planned',
      ate_at_home: entry.ate_at_home ?? true,
      version: 1,
      items: (entry.items || []).map(item => ({
        course: item.course || 'main',
        type: item.type || 'recipe',
        name: item.name,
        servings: item.servings || 1,
        status: item.status || 'planned',
        nutrition: item.nutrition || null
      }))
    };

    if (!existing) {
      await db.diary.add(entryData);
      diaryEntriesImported++;
    } else {
      // Si ya existe, combinar items si no están ya
      const currentNames = new Set((existing.items || []).map(i => i.name));
      const newItems = (entryData.items || []).filter(i => !currentNames.has(i.name));
      if (newItems.length > 0) {
        await db.diary.update(existing.id, {
          items: [...(existing.items || []), ...newItems]
        });
        diaryEntriesImported++;
      }
    }
  }

  // 3. Añadir faltantes a la lista de compra o carrito
  const shoppingList = Array.isArray(pkg.shoppingList) ? pkg.shoppingList : [];
  for (const item of shoppingList) {
    const itemName = item.name || item.productName;
    if (!itemName) continue;
    const itemAmount = item.amount || item.neededAmount || 1;
    const itemUnit = item.unit || '';
    const itemCode = item.code || item.commercialCode || null;

    if (targetShoppingList === 'preShoppingList' && db.preShoppingList) {
      await db.preShoppingList.add({
        name: itemName,
        code: itemCode,
        amount: itemAmount,
        unit: itemUnit,
        notes: item.recipeName ? `Para: ${item.recipeName}` : 'Importado de menú PrimaryFoods',
        source: 'menu_pack',
        checked: true,
        status: 'pending',
        dateAdded: new Date().toISOString()
      });
      shoppingItemsAdded++;
    } else if (db.cart) {
      const code = itemCode || `GENERIC_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      if (db.customProducts) {
        try {
          await db.customProducts.put({
            code,
            product_name: itemName,
            ingredients_text: '',
            nutriscore_grade: 'unknown'
          });
        } catch (_) {}
      }
      await db.cart.add({
        productCode: code,
        name: itemName,
        amount: itemAmount,
        unit: itemUnit,
        source: 'primaryfoods_menu',
        timestamp: Date.now()
      });
      shoppingItemsAdded++;
    }
  }

  return { recipesImported, diaryEntriesImported, shoppingItemsAdded };
}

/**
 * Exportar paquete unificado para PrimaryFoods (Despensa + Diario + Versiones + Productos Propios)
 * @returns {Promise<Object>}
 */
export async function exportPrimaryFoodsPackage() {
  const pantrySnapshot = await exportPantrySnapshot();
  const diaryHistory = await exportDiaryHistory();
  const mealTemplates = db.mealTemplates ? await db.mealTemplates.toArray() : [];
  const customProducts = db.customProducts ? await db.customProducts.toArray() : [];

  return {
    schemaVersion: '1.0',
    app: 'buscatureceta',
    exportedAt: new Date().toISOString(),
    pantry: pantrySnapshot.items,
    diary: diaryHistory.diary,
    diaryVersions: diaryHistory.diaryVersions,
    mealTemplates,
    customProducts
  };
}

