import { db } from '../../db/schema.js';
import { syncNutrition } from './ProductSync.js';

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
  if (!qLower) return [];
  
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
  const officialResults = await db.products.filter(p => {
    if (customCodes.includes(p.code)) return false;
    return filterFunc(p);
  }).limit(limit).toArray();
  
  return [...customResults, ...officialResults].slice(0, limit);
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
