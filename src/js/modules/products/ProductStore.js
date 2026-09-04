import { db } from '../../db/schema.js';
import { syncNutrition } from './ProductSync.js';
import * as RecentStore from './RecentStore.js';
import * as PrimaryFoodStore from './PrimaryFoodStore.js';

/**
 * Obtener un producto remoto desde la API pública de OpenFoodFacts si no está localmente.
 */
export async function fetchProductFromOFF(code) {
  if (!code || !/^\d{4,16}$/.test(code.trim())) return undefined;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const fields = 'code,product_name,product_name_es,generic_name,brands,quantity,product_quantity,categories_tags,nutriments,nutriscore_grade,nova_group,additives_tags,image_url,image_front_url';
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code.trim()}.json?fields=${fields}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return undefined;
    const data = await res.json();
    if ((data.status === 1 || data.status_verbose === 'product found') && data.product) {
      const p = data.product;
      const formatted = {
        code: p.code || code.trim(),
        product_name: p.product_name || p.product_name_es || p.generic_name || `Producto ${code}`,
        brands: p.brands || '',
        quantity: p.quantity || '',
        product_quantity: p.product_quantity || '',
        categories_tags: p.categories_tags || [],
        nutriments: p.nutriments || {},
        nutriscore_grade: p.nutriscore_grade || '',
        nova_group: p.nova_group || null,
        additives_tags: p.additives_tags || [],
        image_url: p.image_url || p.image_front_url || ''
      };
      await db.products.put(formatted);
      return formatted;
    }
  } catch (err) {
    console.debug('[ProductStore] No se pudo obtener producto de OFF online:', err.message);
  }
  return undefined;
}

/**
 * Obtener un producto por código.
 * Busca en customProducts, PrimaryFoods (BEDCA), IndexedDB products y fallback OFF online.
 */
export async function getProductByCode(code) {
  if (!code) return undefined;
  const custom = await db.customProducts.get(code);
  if (custom) return custom;

  // Si es un alimento primario / código primary:
  if (code.startsWith('primary:') || code.startsWith('bedca_')) {
    const primary = await PrimaryFoodStore.getPrimaryFoodByCode(code);
    if (primary) return primary;
  }

  const local = await db.products.get(code);
  if (local) return local;

  // Fallback a Alimento Primario si no se encuentra
  const primaryFallback = await PrimaryFoodStore.getPrimaryFoodByCode(code);
  if (primaryFallback) return primaryFallback;

  return fetchProductFromOFF(code);
}

/**
 * Obtener múltiples productos por un array de códigos.
 */
export async function getProductsByCodes(codes) {
  if (!codes || codes.length === 0) return [];
  const customProducts = await db.customProducts.where('code').anyOf(codes).toArray();
  const foundCustomCodes = customProducts.map(p => p.code);
  const remainingCodes = codes.filter(c => !foundCustomCodes.includes(c));

  // Extraer alimentos primarios
  const primaryProducts = [];
  const toFetchInOfficial = [];
  for (const c of remainingCodes) {
    if (c.startsWith('primary:') || c.startsWith('bedca_')) {
      const p = await PrimaryFoodStore.getPrimaryFoodByCode(c);
      if (p) primaryProducts.push(p);
      else toFetchInOfficial.push(c);
    } else {
      toFetchInOfficial.push(c);
    }
  }

  let officialProducts = [];
  if (toFetchInOfficial.length > 0) {
    officialProducts = await db.products.where('code').anyOf(toFetchInOfficial).toArray();
  }

  return [...customProducts, ...primaryProducts, ...officialProducts];
}

/**
 * Búsqueda de productos en todas las fuentes (customProducts, PrimaryFoods, OpenFoodFacts).
 */
export async function searchProducts(query, limit = 500) {
  const qLower = query.toLowerCase().trim();
  if (!qLower) {
    const recentCodes = await RecentStore.getRecentProductCodes();
    if (recentCodes.length === 0) return [];
    return getProductsByCodes(recentCodes);
  }

  // 1. Mis productos
  const customAll = await db.customProducts.toArray();
  const customMatches = customAll.filter(p =>
    (p.product_name && p.product_name.toLowerCase().includes(qLower)) ||
    (p.brands && p.brands.toLowerCase().includes(qLower)) ||
    p.code.includes(qLower)
  );

  // 2. Alimentos primarios (BEDCA)
  const primaryMatches = await PrimaryFoodStore.searchPrimaryFoods(qLower, 20);

  // 3. Productos oficiales OFF
  const officialMatches = await db.products
    .filter(p =>
      (p.product_name && p.product_name.toLowerCase().includes(qLower)) ||
      (p.brands && p.brands.toLowerCase().includes(qLower)) ||
      p.code.includes(qLower)
    )
    .limit(limit)
    .toArray();

  let results = [...customMatches, ...primaryMatches, ...officialMatches];

  // Si no hay resultados locales y la consulta parece un código de barras numérico, intentar buscar online en OFF
  if (results.length === 0 && /^\d{4,16}$/.test(qLower)) {
    const offProduct = await getProductByCode(qLower);
    if (offProduct) {
      results.push(offProduct);
    }
  }

  return results.slice(0, limit);
}

/**
 * Añadir producto personalizado
 */
export async function addCustomProduct(product) {
  if (!product.code) {
    product.code = `custom_${Date.now()}`;
  }
  await db.customProducts.put(product);
  return product;
}

/**
 * Actualizar producto personalizado
 */
export async function updateCustomProduct(code, updates) {
  await db.customProducts.update(code, updates);
  return await db.customProducts.get(code);
}

