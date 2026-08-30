/**
 * PrimaryFoodStore — Catálogo de Alimentos Primarios y Frescos (BEDCA / USDA)
 *
 * Proporciona acceso offline a ~1.000 alimentos genéricos con sus macros estándar,
 * micronutrientes, compuestos bioactivos y bondades para la salud.
 */

let primaryFoodsCache = null;

/**
 * Normaliza texto eliminando acentos y caracteres especiales
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Carga el catálogo completo de alimentos primarios desde /data/primary_foods.json
 * @returns {Promise<Array>}
 */
export async function getAllPrimaryFoods() {
  if (primaryFoodsCache && primaryFoodsCache.length > 0) return primaryFoodsCache;

  try {
    const res = await fetch('/data/primary_foods.json');
    if (!res.ok) throw new Error(`HTTP ${res.status} al cargar primary_foods.json`);
    primaryFoodsCache = await res.json();
    return primaryFoodsCache;
  } catch (e) {
    try {
      const res2 = await fetch('./data/primary_foods.json');
      if (res2.ok) {
        primaryFoodsCache = await res2.json();
        return primaryFoodsCache;
      }
    } catch (_) {}
    console.warn('[PrimaryFoodStore] No se pudo cargar primary_foods.json:', e.message);
    return [];
  }
}

/**
 * Convierte un PrimaryFood al formato compatible con OpenFoodFacts (Product)
 * para que NutritionCalculator, RecipeStore, Pantry y Diary funcionen de forma nativa.
 */
export function primaryFoodToProduct(f) {
  if (!f) return null;
  const canonicalCode = f.id.startsWith('primary:') ? f.id : `primary:${f.id}`;

  const cal = f.nutritionPer100g?.calories ?? 0;
  const prot = f.nutritionPer100g?.protein ?? 0;
  const fat = f.nutritionPer100g?.fat ?? 0;
  const carbs = f.nutritionPer100g?.carbs ?? 0;
  const fiber = f.nutritionPer100g?.fiber ?? 0;
  const sugars = f.nutritionPer100g?.sugars ?? 0;
  const sodium = f.nutritionPer100g?.sodium ?? 0;

  return {
    code: canonicalCode,
    product_name: f.name,
    brands: f.dataSource ? `Alimento Primario (${f.dataSource})` : 'Alimento Primario',
    categories_tags: f.category ? [f.category] : [],
    'energy-kcal_100g': cal,
    'proteins_100g': prot,
    'fat_100g': fat,
    'carbohydrates_100g': carbs,
    'fiber_100g': fiber,
    'sugars_100g': sugars,
    'salt_100g': Math.round(sodium * 2.5) / 1000,
    nutriments: {
      'energy-kcal_100g': cal,
      'proteins_100g': prot,
      'fat_100g': fat,
      'carbohydrates_100g': carbs,
      'fiber_100g': fiber,
      'sugars_100g': sugars,
      'salt_100g': Math.round(sodium * 2.5) / 1000,
      'sodium_100g': sodium / 1000,
      ...(f.micronutrients || {})
    },
    nutriscore_grade: 'a', // Alimento fresco / natural
    nova_group: 1,         // Grupo NOVA 1 (sin procesar)
    additives_tags: [],
    benefits: f.benefits || [],
    synergies: f.synergies || [],
    bioactiveCompounds: f.bioactiveCompounds || [],
    tags: f.tags || [],
    isPrimaryFood: true
  };
}

/**
 * Busca alimentos primarios por nombre, sinónimos (aliases) o tags.
 * Prioriza coincidencias exactas, de prefijo y por palabras completas.
 *
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array>} lista de productos formateados
 */
export async function searchPrimaryFoods(query, limit = 5) {
  const all = await getAllPrimaryFoods();
  if (!all || all.length === 0) return [];

  const q = normalizeText(query);
  if (!q) return all.slice(0, limit).map(primaryFoodToProduct);

  const qWords = q.split(' ').filter(w => w.length > 0);
  const scored = [];

  for (const f of all) {
    const normName = normalizeText(f.name);
    const normId = normalizeText(f.id);
    const aliases = (f.aliases || []).map(normalizeText);

    let maxScore = 0;

    const evalTarget = (target) => {
      if (!target) return 0;
      if (target === q) return 100;
      if (target.startsWith(q)) return 80;

      const targetWords = target.split(' ').filter(w => w.length > 0);
      const allQWordsInTarget = qWords.every(qw => targetWords.some(tw => tw.startsWith(qw) || tw === qw));
      if (allQWordsInTarget) {
        return 60 + (qWords.length / targetWords.length) * 10;
      }

      if (target.includes(q) && q.length > 2) {
        return 30;
      }
      return 0;
    };

    maxScore = Math.max(maxScore, evalTarget(normName));
    maxScore = Math.max(maxScore, evalTarget(normId));
    for (const a of aliases) {
      maxScore = Math.max(maxScore, evalTarget(a));
    }

    if (maxScore > 0) {
      scored.push({ food: f, score: maxScore });
    }
  }

  // Ordenar por score descendente y longitud de nombre
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.food.name.length - b.food.name.length;
  });

  return scored.slice(0, limit).map(item => primaryFoodToProduct(item.food));
}

/**
 * Obtener un alimento primario por su código
 * @param {string} code
 * @returns {Promise<Object|undefined>}
 */
export async function getPrimaryFoodByCode(code) {
  if (!code) return undefined;
  const cleanCode = code.startsWith('primary:') ? code.replace('primary:', '') : code;

  const all = await getAllPrimaryFoods();
  const found = all.find(f => f.id === cleanCode || `primary:${f.id}` === code);
  return found ? primaryFoodToProduct(found) : undefined;
}

/**
 * Resuelve de forma inteligente un nombre textual de ingrediente
 * consultando en cascada:
 * 1. Mis Productos (customProducts)
 * 2. Alimentos Primarios offline (BEDCA / USDA)
 * 3. Base de datos oficial Open Food Facts (con límite de escaneo)
 *
 * @param {string} rawName
 * @returns {Promise<Object|null>}
 */
export async function resolveIngredientSmart(rawName) {
  if (!rawName) return null;
  const q = normalizeText(rawName);
  if (!q) return null;

  // 1. Buscar en customProducts si Dexie db está disponible
  try {
    const { db } = await import('../../db/schema.js');
    if (db && db.customProducts) {
      const terms = q.split(' ').filter(t => t.length > 0);
      const allCustom = await db.customProducts.toArray();
      const customMatch = allCustom.find(p => {
        const name = normalizeText(p.product_name || '');
        return terms.every(t => name.includes(t));
      });
      if (customMatch) return customMatch;
    }
  } catch (e) {
    // Si falla o no está en navegador, continuar
  }

  // 2. Buscar en Alimentos Primarios (BEDCA)
  const primaryRes = await searchPrimaryFoods(q, 5);
  if (primaryRes && primaryRes.length > 0) {
    return primaryRes[0];
  }

  // 3. Buscar en BD oficial OFF
  try {
    const { db } = await import('../../db/schema.js');
    if (db && db.products) {
      const terms = q.split(' ').filter(t => t.length > 0);
      let scanned = 0;
      const MAX_SCAN = 4000;
      const offMatch = await db.products.toCollection()
        .until(() => { scanned++; return scanned > MAX_SCAN; })
        .filter(p => {
          const name = normalizeText(p.product_name || '');
          const brand = normalizeText(p.brands || '');
          return terms.every(t => name.includes(t) || brand.includes(t));
        })
        .first();
      if (offMatch) return offMatch;
    }
  } catch (e) {
    // continuar
  }

  return null;
}

