import * as ProductStore from "../products/ProductStore.js";
import { db } from '../../db/schema.js';
import * as CartStore from '../cart/CartStore.js';
import { getAllAdditives } from '../additives/AdditivesStore.js';

// Caché en memoria del listado de E-xxx peligrosos para no recargarlo cada vez
let _dangerousAdditivesCache = null;

/**
 * Devuelve la lista de aditivos con riesgo 'alto' y el regex combinado para detectarlos.
 * Se cachea en memoria la primera vez.
 */
async function getDangerousAdditivesRegex() {
  if (_dangerousAdditivesCache) return _dangerousAdditivesCache;

  const all = await getAllAdditives();
  const dangerous = all.filter(a => a.risk === 'alto');

  // Ordenar de mayor a menor longitud para que "E150c" case antes que "E150"
  const codes = dangerous
    .map(a => a.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);

  const regex = new RegExp('\\b(' + codes.join('|') + ')\\b', 'gi');

  _dangerousAdditivesCache = { dangerous, regex };
  return _dangerousAdditivesCache;
}

/**
 * Comprueba si el texto de ingredientes contiene E-xxx peligrosos.
 * Devuelve un array de objetos aditivo encontrados (puede estar vacío).
 */
async function checkDangerousAdditives(ingredientsText) {
  if (!ingredientsText) return [];

  const { dangerous, regex } = await getDangerousAdditivesRegex();
  const found = new Set();
  const re = new RegExp(regex.source, 'gi');
  let m;
  while ((m = re.exec(ingredientsText)) !== null) {
    found.add(m[1].toUpperCase());
  }

  return dangerous.filter(a => found.has(a.code.toUpperCase()));
}

/**
 * Filtra y analiza si un producto es apto según las reglas de exclusión (localStorage "filters"),
 * los aditivos peligrosos (E-xxx riesgo alto — siempre activo, independiente del toggle) y,
 * opcionalmente, el NutriScore (controlado por setting_health_warnings).
 */
export async function analyzeProductForCart(productCode) {
  const product = await ProductStore.getProductByCode(productCode);
  if (!product) return { status: 'not_found' };

  const lastPrice = await CartStore.getLastKnownPrice(productCode);

  let warnings = [];

  // ── 1. Check de aditivos peligrosos (SIEMPRE activo, no depende del toggle) ──
  const foundDangerous = await checkDangerousAdditives(product.ingredients_text);
  if (foundDangerous.length > 0) {
    foundDangerous.forEach(a => {
      warnings.push(`⚠️ Aditivo peligroso: ${a.code} – ${a.name} (riesgo ${a.risk})`);
    });
  }

  // ── 2. Checks opcionales (controlados por el toggle setting_health_warnings) ──
  const checkHealth = localStorage.getItem('setting_health_warnings') !== 'false';

  if (checkHealth) {
    const rawFilters = localStorage.getItem("filters");
    if (rawFilters && product.ingredients_text) {
      const regex = new RegExp(`(${rawFilters})`, 'gi');
      const matches = product.ingredients_text.match(regex);
      if (matches) {
        warnings.push(`Contiene ingredientes excluidos: ${matches.join(', ')}`);
      }
    }

    // Comprobar si el producto es NutriScore E o D
    if (['d', 'e'].includes((product.nutriscore_grade || '').toLowerCase())) {
      warnings.push(`NutriScore muy bajo (${product.nutriscore_grade.toUpperCase()})`);
    }
  }

  let alternatives = [];
  if (warnings.length > 0) {
    const rawFilters = localStorage.getItem("filters");
    alternatives = await findAlternatives(product, rawFilters);
  }

  return {
    status: warnings.length === 0 ? 'ok' : 'warning',
    product,
    warnings,
    lastPrice,
    alternatives
  };
}

/**
 * Busca alternativas de la misma categoría que no tengan alertas
 */
async function findAlternatives(badProduct, rawFilters) {
  // Las categorías vienen separadas por comas, cogemos la primera o segunda para no ser tan específicos
  const categories = (badProduct.categories_tags || '').split(',');
  if (categories.length === 0) return [];

  const mainCategory = categories[categories.length - 1] || categories[0]; // Suele ser la más específica

  // Buscar todos los de la categoría en DB
  const candidates = await db.products
    .filter(p => (p.categories_tags || '').includes(mainCategory))
    .limit(50)
    .toArray();

  let regex = null;
  if (rawFilters) {
    regex = new RegExp(`(${rawFilters})`, 'gi');
  }

  const validAlternatives = candidates.filter(p => {
    if (p.code === badProduct.code) return false;
    if (regex && p.ingredients_text && p.ingredients_text.match(regex)) return false;
    
    // Mejor NutriScore
    const grade = (p.nutriscore_grade || 'z').toLowerCase();
    if (['d', 'e', 'z'].includes(grade)) return false; 
    
    return true;
  });

  return validAlternatives.slice(0, 3); // Devolver las 3 mejores
}
