/**
 * PantryStore — Control de Despensa (Stock e Historial de Movimientos)
 */
import { db } from '../../db/schema.js';

/**
 * Añadir stock a la despensa (ej. compra)
 * @param {string} productCode
 * @param {number} amount
 * @param {string} unit
 */
export async function addStock(productCode, amount, unit = 'g') {
  if (!productCode || amount <= 0) return;

  const now = new Date().toISOString();
  
  // 1. Buscar si ya existe el producto en la despensa (por código)
  let item = await db.pantry.where({ productCode }).first();

  if (item) {
    // Sumar si la unidad coincide, si no, habría que hacer conversión.
    // Simplificación: asume misma unidad o fuerza actualización
    await db.pantry.update(item.id, { amount: item.amount + amount });
  } else {
    const newItemId = await db.pantry.add({ productCode, amount, unit });
    item = { id: newItemId };
  }

  // 2. Registrar el movimiento
  await db.pantryLog.add({
    pantryId: item.id,
    productCode,
    delta: amount,
    reason: 'purchase',
    date: now
  });
}

/**
 * Reducir stock (ej. consumo individual, familiar o tirado)
 * @param {string} productCode
 * @param {number} amount
 * @param {string} reason - 'consumed_me', 'consumed_family', 'expired', 'trashed'
 */
export async function consumeStock(productCode, amount, reason) {
  if (!productCode || amount <= 0) return;

  const item = await db.pantry.where({ productCode }).first();
  if (!item) return; // No hay stock

  const now = new Date().toISOString();
  const newAmount = Math.max(0, item.amount - amount); // No permitir negativos

  await db.pantry.update(item.id, { amount: newAmount });

  await db.pantryLog.add({
    pantryId: item.id,
    productCode,
    delta: -amount,
    reason,
    date: now
  });
}

/**
 * Reducir stock de todos los ingredientes de una receta
 * @param {number} recipeId
 * @param {number} servings
 * @param {string} reason
 */
export async function consumeRecipeIngredients(recipeId, servings, reason) {
  const recipe = await db.recipes.get(recipeId);
  if (!recipe || !recipe.ingredients) return;

  for (const ing of recipe.ingredients) {
    if (!ing.productCode) continue; // Ingredientes libres sin código no se trackean
    
    // Asume que la receta está definida para "recipe.servings" raciones.
    // Ej: la receta es para 4 raciones y lleva 200g. Si me como 1 ración, son 50g.
    const proportionalAmount = (ing.amount / (recipe.servings || 1)) * servings;
    await consumeStock(ing.productCode, proportionalAmount, reason);
  }
}

/**
 * Obtener todo el inventario actual
 * Se hace JOIN manual con "products" para sacar el nombre.
 */
export async function getPantryInventory() {
  const pantryItems = await db.pantry.filter(i => i.amount > 0).toArray();
  const codes = pantryItems.map(i => i.productCode);
  
  // Buscar nombres
  const products = await db.products.where('code').anyOf(codes).toArray();
  const productMap = {};
  products.forEach(p => { productMap[p.code] = p.product_name; });

  return pantryItems.map(item => ({
    ...item,
    productName: productMap[item.productCode] || 'Producto Desconocido'
  }));
}
