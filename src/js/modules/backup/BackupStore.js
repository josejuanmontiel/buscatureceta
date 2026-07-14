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
  'mealPhotos'
];

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
        if (records.length > 0) {
          await db[tableName].bulkPut(records);
        }
      }
    }
  });
}
