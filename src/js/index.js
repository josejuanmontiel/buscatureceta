// Función para parsear el CSV
function parseCSV(data) {
    // Si la primera línea tiene tabuladores, es TSV (como viene de OpenFoodFacts)
    const delimiter = data.indexOf('\t') !== -1 ? '\t' : ',';
    
    if (typeof Papa !== 'undefined') {
        const parsed = Papa.parse(data, {
            header: true,
            delimiter: delimiter,
            skipEmptyLines: true
        });
        return parsed.data;
    }

    throw new Error("Librería PapaParse no encontrada");
}

import { db, migrateFromLegacyDB } from './db/schema.js';

// Llamar a migración al inicio
migrateFromLegacyDB().catch(console.error);

// E2E test helper: clear all user-generated data (keeps products intact)
window.__resetUserData = async function() {
  const stores = ['cart', 'pantry', 'pantryLog', 'diary', 'recipes',
    'recipeVersions', 'recentProducts', 'customProducts', 'priceHistory', 'mealPhotos'];
  for (const store of stores) {
    if (db[store]) await db[store].clear();
  }
};


// Función para guardar los datos en Dexie
async function saveToDatabase(data) {
    try {
        const adapted = data.map(item => ({
            ...item,
            code: item.code || item.id
        }));
        await db.products.bulkPut(adapted);
        console.log("Datos guardados exitosamente en IndexedDB (Dexie)");
    } catch (error) {
        console.error("Error al guardar los datos: ", error);
    }
}

export async function initView() {
    // La vista index ahora solo tiene botones que navegan por hash (href o onclick con location.hash)
    // No requiere inicialización de eventos compleja.
}
