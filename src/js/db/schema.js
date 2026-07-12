/**
 * NutriAgenda — Dexie Schema centralizado
 *
 * Todas las stores de IndexedDB se definen aquí. Importar `db` desde
 * este módulo en cualquier parte de la app para acceder a los datos.
 *
 * Versiones:
 *  v1 — Store original de productos OFF (migrada desde IndexedDB raw)
 *  v2 — Añade recetas, ingredientes de recetas, agenda, objetivos
 */

import Dexie from 'dexie';

export const db = new Dexie('nutriagenda');

// ── v1: Migración de "miBaseDeDatos" → "nutriagenda" ─────────────────────────
// La store original usaba keyPath "id" con el code de barras como valor.
// Mantenemos la misma estructura para no perder los datos ya cargados.
db.version(1).stores({
  products: 'code, product_name',
});

// ── v2: Nuevas stores para recetas, agenda y objetivos ────────────────────────
db.version(2).stores({
  products: 'code, product_name',

  /**
   * recipes — Recetas (propias o importadas de sistemas externos)
   *
   * Campos indexados:
   *   ++id        autoincrement primary key
   *   name        para búsqueda por nombre
   *   source      "local" | "mealie" | "tandoor"
   *   externalId  id/slug en el sistema externo (null si es local)
   *   *tags       array multivalor para filtrar por etiqueta/grupo
   */
  recipes: '++id, name, source, externalId, *tags',

  /**
   * diary — Registros de ingesta agrupados por día y tipo de comida
   *
   * Campos indexados:
   *   ++id       autoincrement primary key
   *   date       "YYYY-MM-DD" — permite consultar por día o rango
   *   mealType   "breakfast" | "lunch" | "dinner" | "snack"
   *
   * Nota: los entries se guardan embebidos como array JSON en el objeto,
   * no en una store separada, para simplificar la lectura por día.
   */
  diary: '++id, date, mealType',

  /**
   * goals — Objetivos nutricionales del usuario
   *
   * Permite personalizar los targets de calorías, macros, etc.
   * Si no hay entrada para un nutriente, se usarán valores OMS por defecto.
   */
  goals: '++id, nutrient',
});

// ── v3: Despensa y Consumo Familiar ───────────────────────────────────────────
db.version(3).stores({
  products: 'code, product_name',
  recipes: '++id, name, source, externalId, *tags',
  diary: '++id, date, mealType',
  goals: '++id, nutrient',
  
  /**
   * pantry — Inventario físico
   * 
   * Campos indexados:
   *   ++id
   *   productCode    código OFF del producto
   *   amount         cantidad restante
   *   unit           g, ml, unidad
   */
  pantry: '++id, productCode',

  /**
   * pantryLog — Historial de movimientos de la despensa
   * 
   * Campos indexados:
   *   ++id
   *   productCode
   *   date           fecha ISO
   *   reason         'purchase', 'consumed_me', 'consumed_family', 'expired', 'trashed'
   */
  pantryLog: '++id, productCode, date, reason'
});

// ── v4: Carrito Inteligente ───────────────────────────────────────────────────
db.version(4).stores({
  products: 'code, product_name',
  recipes: '++id, name, source, externalId, *tags',
  diary: '++id, date, mealType',
  goals: '++id, nutrient',
  pantry: '++id, productCode',
  pantryLog: '++id, productCode, date, reason',
  
  /**
   * cart — Carrito de la compra actual
   */
  cart: '++id, productCode',

  /**
   * priceHistory — Historial de precios de productos
   */
  priceHistory: '++id, productCode, date'
});

// ── v5: Subida de imágenes a OFF ──────────────────────────────────────────────
db.version(5).stores({
  products: 'code, product_name',
  recipes: '++id, name, source, externalId, *tags',
  diary: '++id, date, mealType',
  goals: '++id, nutrient',
  pantry: '++id, productCode',
  pantryLog: '++id, productCode, date, reason',
  cart: '++id, productCode',
  priceHistory: '++id, productCode, date',
  
  /**
   * pendingUploads — Cola de imágenes a subir a la API oficial
   * 
   * Campos indexados:
   *   ++id
   *   barcode    Código de barras del producto
   *   type       'front', 'ingredients', 'nutrition'
   *   status     'pending', 'uploading', 'failed', 'done'
   */
  pendingUploads: '++id, barcode, status'
});

// ── v6: Historial de versiones de recetas + Pool de fotos de comidas ──────────
db.version(6).stores({
  products: 'code, product_name',
  recipes: '++id, name, source, externalId, *tags',
  diary: '++id, date, mealType',
  goals: '++id, nutrient',
  pantry: '++id, productCode',
  pantryLog: '++id, productCode, date, reason',
  cart: '++id, productCode',
  priceHistory: '++id, productCode, date',
  pendingUploads: '++id, barcode, status',

  /**
   * recipeVersions — Snapshots históricas de recetas
   *
   * Cada vez que el usuario guarda cambios en una receta, el estado
   * anterior se archiva aquí. Permite ver el historial y revertir.
   *
   * Campos indexados:
   *   ++id
   *   recipeId   id de la receta padre
   *   savedAt    timestamp ISO (para ordenar cronológicamente)
   */
  recipeVersions: '++id, recipeId, savedAt',

  /**
   * mealPhotos — Pool fotográfico de lo que se come
   *
   * Fotos tomadas en el diario para revisar/anotar manualmente o
   * enviar a una IA para identificar el plato.
   *
   * Campos indexados:
   *   ++id
   *   date       "YYYY-MM-DD" del día de la ingesta
   *   mealType   "breakfast" | "lunch" | "snack" | "dinner" | null
   *   status     "pending_review" | "logged" | "discarded"
   */
  mealPhotos: '++id, date, mealType, status',
});

// ── Helpers de migración ──────────────────────────────────────────────────────

/**
 * Migra los datos de la IndexedDB antigua ("miBaseDeDatos" / store "datosCSV")
 * a la nueva base Dexie ("nutriagenda" / store "products").
 *
 * Solo es necesario ejecutar esto una vez. Guarda un flag en localStorage
 * para no repetir la migración.
 *
 * @returns {Promise<number>} número de registros migrados
 */
export async function migrateFromLegacyDB() {
  const alreadyMigrated = localStorage.getItem('nutriagenda_migrated_v1');
  if (alreadyMigrated) return 0;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open('miBaseDeDatos', 1);

    request.onerror = () => {
      // La DB antigua no existe — no hay nada que migrar
      localStorage.setItem('nutriagenda_migrated_v1', 'true');
      resolve(0);
    };

    request.onsuccess = async (event) => {
      const oldDb = event.target.result;

      // Verificar que la store existe
      if (!oldDb.objectStoreNames.contains('datosCSV')) {
        oldDb.close();
        localStorage.setItem('nutriagenda_migrated_v1', 'true');
        resolve(0);
        return;
      }

      const tx = oldDb.transaction('datosCSV', 'readonly');
      const store = tx.objectStore('datosCSV');
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = async () => {
        const records = getAllRequest.result;
        oldDb.close();

        if (records.length === 0) {
          localStorage.setItem('nutriagenda_migrated_v1', 'true');
          resolve(0);
          return;
        }

        // Adaptar el campo "id" → "code" para el nuevo schema
        const adapted = records.map(r => ({
          ...r,
          code: r.id ?? r.code,
        }));

        try {
          await db.products.bulkPut(adapted);
          localStorage.setItem('nutriagenda_migrated_v1', 'true');
          console.log(`[NutriAgenda] Migración completada: ${adapted.length} productos`);
          resolve(adapted.length);
        } catch (err) {
          reject(err);
        }
      };

      getAllRequest.onerror = () => {
        oldDb.close();
        reject(getAllRequest.error);
      };
    };
  });
}

/**
 * Objetivos nutricionales por defecto (basados en recomendaciones OMS adulto medio)
 * Se usan cuando el usuario no ha configurado sus propios objetivos.
 */
export const DEFAULT_GOALS = {
  kcal: 2000,
  proteins_g: 50,
  carbohydrates_g: 260,
  fat_g: 70,
  fiber_g: 25,
  sugars_g: 50,   // límite recomendado
  salt_g: 5,      // límite recomendado OMS
};

/**
 * Tipos de comida disponibles con sus etiquetas en español
 */
export const MEAL_TYPES = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snack: 'Merienda / Snack',
};

/**
 * Grupos de alimentos (basados en categorías de OpenFoodFacts)
 * Usados para calcular el índice de variedad semanal.
 */
export const FOOD_GROUPS = {
  legumes:      { label: 'Legumbres',       icon: '🫘', tags: ['en:legumes', 'en:pulses'] },
  leafy_greens: { label: 'Verdura de hoja', icon: '🥬', tags: ['en:leafy-vegetables'] },
  cruciferous:  { label: 'Crucíferas',      icon: '🥦', tags: ['en:brassicas'] },
  fruits:       { label: 'Frutas',          icon: '🍎', tags: ['en:fruits'] },
  whole_cereals:{ label: 'Cereales integ.', icon: '🌾', tags: ['en:whole-grain-foods'] },
  fish:         { label: 'Pescado',         icon: '🐟', tags: ['en:fish-and-seafood'] },
  meat:         { label: 'Carne',           icon: '🥩', tags: ['en:meats'] },
  dairy:        { label: 'Lácteos',         icon: '🥛', tags: ['en:dairy-products'] },
  nuts_seeds:   { label: 'Frutos secos',    icon: '🥜', tags: ['en:nuts', 'en:seeds'] },
  eggs:         { label: 'Huevos',          icon: '🥚', tags: ['en:eggs'] },
  oils:         { label: 'Aceites',         icon: '🫒', tags: ['en:plant-oils'] },
};
