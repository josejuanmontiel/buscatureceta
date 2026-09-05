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
 * @param {number|null} [packageUnits] - Unidades contenidas en el paquete (opcional)
 */
export async function addStock(productCode, amount, unit = 'g', zone = 'food', packageUnits = null) {
  if (!productCode || amount <= 0) return;

  const now = new Date().toISOString();
  const numPackUnits = packageUnits ? parseInt(packageUnits) : null;
  const product = await ProductStore.getProductByCode(productCode);

  let unitWeight = null;
  if (numPackUnits && numPackUnits > 0) {
    if (unit === 'g' || unit === 'ml') {
      unitWeight = Math.round((amount / numPackUnits) * 10) / 10;
    } else if (product) {
      const pq = parseFloat(product.product_quantity || product.quantity);
      if (!isNaN(pq) && pq > 0) {
        unitWeight = Math.round((pq / numPackUnits) * 10) / 10;
      }
    }
  }

  // 1. Buscar si ya existe el producto en la despensa (por código)
  let item = await db.pantry.where({ productCode }).first();

  if (item) {
    const updateData = {
      amount: Math.round((item.amount + amount) * 100) / 100,
      pantryZone: item.pantryZone || zone
    };
    if (numPackUnits && numPackUnits > 0) {
      updateData.packageUnits = numPackUnits;
      if (unitWeight > 0) updateData.unitWeight = unitWeight;
    }
    await db.pantry.update(item.id, updateData);
  } else {
    const newItem = {
      productCode,
      amount: Math.round(amount * 100) / 100,
      unit,
      pantryZone: zone,
      packageUnits: (numPackUnits && numPackUnits > 0) ? numPackUnits : null,
      unitWeight: unitWeight > 0 ? unitWeight : null
    };
    const newItemId = await db.pantry.add(newItem);
    item = { id: newItemId };
  }

  // Si se indicaron unidades de paquete, sincronizar en la ficha de producto
  if (numPackUnits && numPackUnits > 0) {
    try {
      await db.products.where({ code: productCode }).modify(p => {
        p.package_units = numPackUnits;
        if (unitWeight > 0) p.unit_weight = unitWeight;
      });
    } catch {}
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
 * @param {string} unitConsumed - 'g' | 'ml' | 'unidad'
 */
export async function consumeStock(productCode, amount, reason, unitConsumed = 'g') {
  if (!productCode || amount <= 0) return;

  const item = await db.pantry.where({ productCode }).first();
  if (!item) return; // No hay stock

  const product = await ProductStore.getProductByCode(productCode);

  const packageUnits = item.packageUnits || product?.package_units || null;
  let unitWeight = item.unitWeight || product?.unit_weight || null;

  if (!unitWeight && packageUnits && packageUnits > 0) {
    const pq = parseFloat(product?.product_quantity || product?.quantity);
    if (!isNaN(pq) && pq > 0) {
      unitWeight = Math.round((pq / packageUnits) * 10) / 10;
    } else if (item.unit === 'g' && item.amount > 0) {
      unitWeight = Math.round((item.amount / packageUnits) * 10) / 10;
    }
  }

  const normItem = (item.unit || '').toLowerCase();
  const normConsumed = (unitConsumed || '').toLowerCase();

  const isItemCount = normItem === 'unidad' || normItem === 'ud' || normItem === 'uds' || normItem === 'pack';
  const isConsumedCount = normConsumed === 'unidad' || normConsumed === 'ud' || normConsumed === 'uds' || normConsumed === 'pack';

  let deduction = amount;

  if (isItemCount && !isConsumedCount) {
    // Stock está en unidades, receta pide peso/volumen (g, ml, kg, l)
    let amountInGrams = amount;
    if (normConsumed === 'kg' || normConsumed === 'l') {
      amountInGrams = amount * 1000;
    }
    if (unitWeight && unitWeight > 0) {
      deduction = amountInGrams / unitWeight;
    } else {
      deduction = amountInGrams / 1000;
    }
  } else if (!isItemCount && isConsumedCount) {
    // Stock está en peso/volumen, receta pide unidades
    const weightPerUd = (unitWeight && unitWeight > 0) ? unitWeight : 1000;
    const deductionGrams = amount * weightPerUd;
    if (normItem === 'kg' || normItem === 'l') {
      deduction = deductionGrams / 1000;
    } else {
      deduction = deductionGrams;
    }
  } else if (!isItemCount && !isConsumedCount) {
    // Ambos son peso o volumen, manejar kg <-> g o l <-> ml
    if ((normItem === 'kg' || normItem === 'l') && (normConsumed === 'g' || normConsumed === 'ml')) {
      deduction = amount / 1000;
    } else if ((normItem === 'g' || normItem === 'ml') && (normConsumed === 'kg' || normConsumed === 'l')) {
      deduction = amount * 1000;
    }
  }

  deduction = Math.round(deduction * 100) / 100;
  const now = new Date().toISOString();
  const newAmount = Math.max(0, Math.round((item.amount - deduction) * 100) / 100);

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
 * Actualizar las unidades por paquete de un producto en la despensa
 * @param {string} productCode
 * @param {number} packageUnits
 */
export async function updatePackageUnits(productCode, packageUnits) {
  const num = parseInt(packageUnits);
  if (!productCode || isNaN(num) || num <= 0) return;

  const item = await db.pantry.where({ productCode }).first();
  const product = await ProductStore.getProductByCode(productCode);

  let unitWeight = null;
  if (item && (item.unit === 'g' || item.unit === 'ml')) {
    unitWeight = Math.round((item.amount / num) * 10) / 10;
  } else if (product) {
    const pq = parseFloat(product.product_quantity || product.quantity);
    if (!isNaN(pq) && pq > 0) {
      unitWeight = Math.round((pq / num) * 10) / 10;
    }
  }

  if (item) {
    await db.pantry.update(item.id, {
      packageUnits: num,
      unitWeight: unitWeight || null
    });
  }

  try {
    await db.products.where({ code: productCode }).modify(p => {
      p.package_units = num;
      if (unitWeight) p.unit_weight = unitWeight;
    });
  } catch {}
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
  const packageUnitsMap = {};
  const unitWeightMap = {};

  products.forEach(p => { 
    productMap[p.code] = p.product_name; 
    quantityMap[p.code] = p.quantity || (p.product_quantity ? p.product_quantity + 'g' : '');
    if (p.package_units) packageUnitsMap[p.code] = p.package_units;
    if (p.unit_weight) unitWeightMap[p.code] = p.unit_weight;
  });

  return filteredItems.map(item => ({
    ...item,
    pantryZone: item.pantryZone || 'food',
    productName: productMap[item.productCode] || 'Producto Desconocido',
    productQuantity: quantityMap[item.productCode] || '',
    packageUnits: item.packageUnits || packageUnitsMap[item.productCode] || null,
    unitWeight: item.unitWeight || unitWeightMap[item.productCode] || null
  }));
}

if (typeof window !== 'undefined') {
  window.PantryStore = { addStock, consumeStock, consumeRecipeIngredients, updatePackageUnits, getPantryInventory, moveToZone };
}


