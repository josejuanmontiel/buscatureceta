import { db } from '../../db/schema.js';
import { syncNutrition } from './ProductSync.js';
import * as RecentStore from './RecentStore.js';

/**
 * Obtener un producto por código.
 * Busca primero en customProducts y, si no lo encuentra, en products.
 */
export async function getProductByCode(code) {
  if (!code) return undefined;
  const custom = await db.customProducts.get(code);
  if (custom) return custom;
  return db.products.get(code);
}

/**
 * Obtener múltiples productos por un array de códigos.
 */
export async function getProductsByCodes(codes) {
  if (!codes || codes.length === 0) return [];
  const customProducts = await db.customProducts.where('code').anyOf(codes).toArray();
  const foundCustomCodes = customProducts.map(p => p.code);
  const remainingCodes = codes.filter(c => !foundCustomCodes.includes(c));
  
  let officialProducts = [];
  if (remainingCodes.length > 0) {
    officialProducts = await db.products.where('code').anyOf(remainingCodes).toArray();
  }
  
  return [...customProducts, ...officialProducts];
}

/**
 * Búsqueda de productos en ambas bases de datos.
 * Busca por partes del nombre, marca o código.
 */
export async function searchProducts(query, limit = 500) {
  const qLower = query.toLowerCase().trim();
  if (!qLower) {
    const recentCodes = await RecentStore.getRecentProductCodes();
    if (recentCodes.length === 0) return [];
    return getProductsByCodes(recentCodes);
  }
  
  const terms = qLower.split(' ').filter(t => t.length > 0);
  
  const filterFunc = p => {
    const name = (p.product_name || '').toLowerCase();
    const brand = (p.brands || '').toLowerCase();
    const code = (p.code || '').toLowerCase();
    return terms.every(t => name.includes(t) || brand.includes(t) || code.includes(t));
  };
  
  const customResults = await db.customProducts.filter(filterFunc).toArray();
  const customCodes = customResults.map(p => p.code);
  
  // Excluimos de officialResults aquellos que ya hayamos encontrado en customProducts
  // por si tuvieran el mismo código, para dar preferencia al custom
  // Limitamos el escaneo a 10000 registros para evitar que la app se congele si no hay resultados
  let scanned = 0;
  const officialResults = await db.products.toCollection()
    .until(() => {
      scanned++;
      return scanned > 10000;
    })
    .filter(p => {
      return !customCodes.includes(p.code) && filterFunc(p);
    })
    .toArray();
  
  const allResults = [...customResults, ...officialResults];
  
  // Boost recientes
  const recentCodes = await RecentStore.getRecentProductCodes();
  
  // Ordenar: primero los que estén en recentCodes (ordenados por fecha desc), luego el resto
  allResults.sort((a, b) => {
    const idxA = recentCodes.indexOf(a.code);
    const idxB = recentCodes.indexOf(b.code);
    
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0; // mantener orden original si ninguno es reciente
  });
  
  return allResults.slice(0, limit);
}

/**
 * Añadir un producto genérico o personalizado a la BD especial.
 */
export async function addCustomProduct(productData) {
  const data = {
    ...productData,
    is_custom: true
  };
  await db.customProducts.put(data);
  return data.code;
}

/**
 * Actualizar un producto personalizado existente.
 * Esto lanzará la sincronización retroactiva en agenda y recetas.
 */
export async function updateCustomProduct(code, changes) {
  const current = await db.customProducts.get(code);
  if (!current) throw new Error('Producto personalizado no encontrado');
  
  await db.customProducts.update(code, changes);
  
  // Lanzar la actualización retroactiva en background sin bloquear
  syncNutrition(code).catch(console.error);
}
