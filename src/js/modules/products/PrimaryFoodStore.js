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
  if (primaryFoodsCache) return primaryFoodsCache;

  try {
    const res = await fetch('/data/primary_foods.json');
    if (!res.ok) throw new Error(`HTTP ${res.status} al cargar primary_foods.json`);
    primaryFoodsCache = await res.json();
    return primaryFoodsCache;
  } catch (e) {
    console.warn('[PrimaryFoodStore] No se pudo cargar /data/primary_foods.json:', e.message);
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

  return {
    code: canonicalCode,
    product_name: f.name,
    brands: f.dataSource ? `Alimento Primario (${f.dataSource})` : 'Alimento Primario',
    categories_tags: f.category ? [f.category] : [],
    nutriments: {
      'energy-kcal_100g': f.nutritionPer100g?.calories || 0,
      'proteins_100g': f.nutritionPer100g?.protein || 0,
      'fat_100g': f.nutritionPer100g?.fat || 0,
      'carbohydrates_100g': f.nutritionPer100g?.carbs || 0,
      'fiber_100g': f.nutritionPer100g?.fiber || 0,
      'sugars_100g': f.nutritionPer100g?.sugars || 0,
      'salt_100g': (f.nutritionPer100g?.sodium || 0) * 2.5 / 1000,
      'sodium_100g': (f.nutritionPer100g?.sodium || 0) / 1000,
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
 * Prioriza coincidencias exactas y de prefijo para el Smart Match.
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

  const scored = [];

  for (const f of all) {
    const normName = normalizeText(f.name);
    const normId = normalizeText(f.id);

    let bestScore = 0; // 0 = no match, 3 = exact, 2 = startsWith, 1 = includes

    if (normName === q || normId === q) {
      bestScore = 3;
    } else if (normName.startsWith(q) || normId.startsWith(q)) {
      bestScore = 2;
    } else if (normName.includes(q) || normId.includes(q)) {
      bestScore = 1;
    }

    // Comprobar aliases/sinónimos
    if (f.aliases && Array.isArray(f.aliases)) {
      for (const alias of f.aliases) {
        const normAlias = normalizeText(alias);
        if (normAlias === q) {
          bestScore = Math.max(bestScore, 3);
        } else if (normAlias.startsWith(q)) {
          bestScore = Math.max(bestScore, 2);
        } else if (normAlias.includes(q)) {
          bestScore = Math.max(bestScore, 1);
        }
      }
    }

    if (bestScore > 0) {
      scored.push({ food: f, score: bestScore });
    }
  }

  // Ordenar por score descendente, luego alfabéticamente
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.food.name.localeCompare(b.food.name);
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
