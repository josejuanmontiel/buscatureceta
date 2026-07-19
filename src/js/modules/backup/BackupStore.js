import { db } from '../../db/schema.js';

/**
 * Tablas que se van a exportar.
 * Excluimos 'products' deliberadamente.
 */
const TABLES_TO_BACKUP = [
  'recipes',
  'recipeVersions',
  'diary',
  'goals',
  'pantry',
  'pantryLog',
  'cart',
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
 * Se excluye 'diary' por ser datos personales.
 * Se utiliza bulkPut para realizar un Upsert (inserta o actualiza según ID).
 * @param {string} jsonString 
 */
export async function mergeData(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed.data) {
    throw new Error('Formato de backup inválido para fusión');
  }

  const tablesToMerge = Object.keys(parsed.data).filter(t => TABLES_TO_BACKUP.includes(t) && db[t]);

  await db.transaction('rw', tablesToMerge.map(t => db[t]), async () => {
    for (const tableName of tablesToMerge) {
      if (tableName === 'diary') {
        // TODO: Implementar sincronización selectiva para la Agenda (Diary)
        console.log("Omitiendo 'diary' en la fusión para no sobrescribir datos personales.");
        continue;
      }

      const records = parsed.data[tableName];
      if (Array.isArray(records) && records.length > 0) {
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
