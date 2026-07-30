import * as ProductStore from "../products/ProductStore.js";
/**
 * PantryStore — Control de Despensa (Stock e Historial de Movimientos)
 *
 * Zonas (pantryZone):
 *   'food'    — Alimentos. Afecta al diario nutricional.
 *   'nonfood' — Artículos no alimentarios (limpieza, higiene, etc.)
 */
import { db } from '../../db/schema.js';

/**
 * Añadir stock a la despensa (ej. compra)
 * @param {string} productCode
 * @param {number} amount
 * @param {string} unit
 * @param {string} zone - 'food' | 'nonfood' (default: 'food')
 */
export async function addStock(productCode, amount, unit = 'g', zone = 'food') {
  if (!productCode || amount <= 0) return;

  const now = new Date().toISOString();
  
  // 1. Buscar si ya existe el producto en la despensa (por código)
  let item = await db.pantry.where({ productCode }).first();

  if (item) {
    // Sumar si la unidad coincide, si no, habría que hacer conversión.
    // Simplificación: asume misma unidad o fuerza actualización
    await db.pantry.update(item.id, { amount: item.amount + amount });
  } else {
    const newItemId = await db.pantry.add({ productCode, amount, unit, pantryZone: zone });
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
export async function consumeStock(productCode, amount, reason, unitConsumed = 'g') {
  if (!productCode || amount <= 0) return;

  const item = await db.pantry.where({ productCode }).first();
  if (!item) return; // No hay stock

  let deduction = amount;
  if (item.unit !== unitConsumed) {
    if (item.unit === 'unidad' && (unitConsumed === 'g' || unitConsumed === 'ml')) {
      // Convert consumed grams to a fraction of a "unidad" (assume 1 unit = 1000g/ml)
      deduction = amount / 1000;
    } else if ((item.unit === 'g' || item.unit === 'ml') && unitConsumed === 'unidad') {
      // Convert consumed units to grams
      deduction = amount * 1000;
    }
  }

  const now = new Date().toISOString();
  const newAmount = Math.max(0, item.amount - deduction); // No permitir negativos

  await db.pantry.update(item.id, { amount: newAmount });

  await db.pantryLog.add({
    pantryId: item.id,
    productCode,
    delta: -deduction,
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
    await consumeStock(ing.productCode, proportionalAmount, reason, ing.unit || 'g');
  }
}

/**
 * Mover un producto a otra zona de despensa.
 * @param {string} productCode
 * @param {'food'|'nonfood'} newZone
 */
export async function moveToZone(productCode, newZone) {
  const item = await db.pantry.where({ productCode }).first();
  if (!item) return;
  await db.pantry.update(item.id, { pantryZone: newZone });
}

/**
 * Obtener todo el inventario actual, opcionalmente filtrado por zona.
 * Los registros sin pantryZone (legacy) se tratan como 'food'.
 * @param {string|null} zone - 'food' | 'nonfood' | null (todos)
 */
export async function getPantryInventory(zone = null) {
  const allItems = await db.pantry.filter(i => i.amount > 0).toArray();

  const filteredItems = zone === null
    ? allItems
    : allItems.filter(i => {
        const itemZone = i.pantryZone || 'food';
        return itemZone === zone;
      });

  const codes = filteredItems.map(i => i.productCode);
  
  // Buscar nombres y cantidades
  const products = await ProductStore.getProductsByCodes(codes);
  const productMap = {};
  const quantityMap = {};
  products.forEach(p => { 
    productMap[p.code] = p.product_name; 
    quantityMap[p.code] = p.quantity || (p.product_quantity ? p.product_quantity + 'g' : '');
  });

  return filteredItems.map(item => ({
    ...item,
    pantryZone: item.pantryZone || 'food',
    productName: productMap[item.productCode] || 'Producto Desconocido',
    productQuantity: quantityMap[item.productCode] || ''
  }));
}


