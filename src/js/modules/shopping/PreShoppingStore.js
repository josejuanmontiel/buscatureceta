import { db } from '../../db/schema.js';
import * as ShoppingStore from './ShoppingStore.js';
import * as CartStore from '../cart/CartStore.js';
import * as ProductStore from '../products/ProductStore.js';

/**
 * Añadir un producto a la Pre-lista
 * @param {{ name: string, code?: string, amount?: number, unit?: string, notes?: string, source?: string }} item
 */
export async function addItem({ name, code = null, amount = 1, unit = '', notes = '', source = 'manual', checked = true }) {
  if (!name || !name.trim()) throw new Error('El nombre del producto es obligatorio');

  const cleanName = name.trim();
  const numAmount = parseFloat(amount) > 0 ? parseFloat(amount) : 1;

  // Si no se proporcionó código, intentar buscar si existe en la base de productos
  let finalCode = code;
  if (!finalCode) {
    try {
      const match = await db.products.where('product_name').equalsIgnoreCase(cleanName).first();
      if (match) {
        finalCode = match.code;
      }
    } catch (_) {}
  }

  const id = await db.preShoppingList.add({
    name: cleanName,
    code: finalCode,
    amount: numAmount,
    unit: unit || '',
    notes: notes || '',
    source: source || 'manual', // 'manual' | 'voice' | 'paste' | 'recurring' | 'pantry' | 'recipe'
    checked: checked ?? true,
    status: 'pending',
    dateAdded: new Date().toISOString()
  });

  return id;
}

/**
 * Añade múltiples ítems en lote (ej. tras parsear voz o pegado)
 * @param {Array<{ name: string, code?: string, amount?: number, unit?: string, source?: string }>} items
 * @returns {Promise<number[]>} IDs creados
 */
export async function addBulkItems(items, defaultSource = 'paste') {
  if (!Array.isArray(items) || items.length === 0) return [];

  const createdIds = [];
  for (const item of items) {
    if (!item.name || !item.name.trim()) continue;
    const id = await addItem({
      name: item.name,
      code: item.code || null,
      amount: item.amount || 1,
      unit: item.unit || '',
      source: item.source || defaultSource,
      checked: true
    });
    createdIds.push(id);
  }
  return createdIds;
}

/**
 * Devuelve todos los ítems pendientes de la pre-lista
 */
export async function getPendingItems() {
  if (!db.preShoppingList) return [];
  const list = await db.preShoppingList
    .where({ status: 'pending' })
    .reverse()
    .sortBy('id');
  return list;
}

/**
 * Actualiza los campos de un ítem existente
 */
export async function updateItem(id, updates) {
  if (!db.preShoppingList || !id) return;
  await db.preShoppingList.update(id, updates);
}

/**
 * Alterna el estado checked de un ítem
 */
export async function toggleCheck(id) {
  const item = await db.preShoppingList.get(id);
  if (!item) return;
  await db.preShoppingList.update(id, { checked: !item.checked });
  return !item.checked;
}

/**
 * Elimina un ítem de la pre-lista
 */
export async function deleteItem(id) {
  if (!db.preShoppingList || !id) return;
  await db.preShoppingList.delete(id);
}

/**
 * Elimina todos los ítems marcados como checked
 */
export async function clearChecked() {
  if (!db.preShoppingList) return 0;
  const items = await db.preShoppingList.where({ status: 'pending' }).toArray();
  const checked = items.filter(i => i.checked);
  for (const item of checked) {
    await db.preShoppingList.delete(item.id);
  }
  return checked.length;
}

/**
 * Elimina todos los ítems pendientes
 */
export async function clearAllPending() {
  if (!db.preShoppingList) return;
  const items = await db.preShoppingList.where({ status: 'pending' }).toArray();
  for (const item of items) {
    await db.preShoppingList.delete(item.id);
  }
}

/**
 * Convierte los ítems seleccionados de la Pre-lista en la Lista de Compra Activa.
 * Crea una lista en ShoppingStore y marca los ítems como 'promoted'.
 * @param {string} listName Nombre para la nueva lista de compra
 * @param {number[]} [specificIds] IDs específicos a promover (si no se pasan, promueve todos los checked)
 * @returns {Promise<{ listId: number, count: number }>}
 */
export async function promoteToShoppingList(listName, specificIds = null) {
  const allPending = await getPendingItems();
  let toPromote = [];

  if (specificIds && specificIds.length > 0) {
    const idSet = new Set(specificIds);
    toPromote = allPending.filter(i => idSet.has(i.id));
  } else {
    toPromote = allPending.filter(i => i.checked);
  }

  if (toPromote.length === 0) {
    throw new Error('No hay productos seleccionados para convertir en lista de compra');
  }

  const dateStr = new Date().toLocaleDateString();
  const finalName = listName || `Compra ${dateStr}`;

  // Formato para ShoppingStore
  const shoppingItems = toPromote.map(i => ({
    name: i.name,
    code: i.code || null,
    amount: i.amount || 1,
    unit: i.unit || ''
  }));

  const listId = await ShoppingStore.createList(finalName, shoppingItems);

  // Marcar los ítems en la Pre-lista como promovidos
  const now = new Date().toISOString();
  for (const item of toPromote) {
    await db.preShoppingList.update(item.id, {
      status: 'promoted',
      promotedAt: now,
      targetListId: listId
    });
  }

  return { listId, count: toPromote.length };
}

/**
 * Vuelca los ítems seleccionados directamente al Carrito de la compra (db.cart)
 * @param {number[]} [specificIds]
 * @returns {Promise<{ count: number }>}
 */
export async function promoteToCart(specificIds = null) {
  const allPending = await getPendingItems();
  let toPromote = [];

  if (specificIds && specificIds.length > 0) {
    const idSet = new Set(specificIds);
    toPromote = allPending.filter(i => idSet.has(i.id));
  } else {
    toPromote = allPending.filter(i => i.checked);
  }

  if (toPromote.length === 0) {
    throw new Error('No hay productos seleccionados para volcar al carrito');
  }

  const now = new Date().toISOString();
  let count = 0;

  for (const item of toPromote) {
    let code = item.code;
    if (!code) {
      // Crear producto genérico/personalizado para que tenga código en el carrito
      code = `GENERIC_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      try {
        await ProductStore.addCustomProduct({
          code,
          product_name: item.name
        });
      } catch (_) {}
    }

    await CartStore.addToCart(code, item.amount || 1, 0, item.unit || 'unidad');
    await db.preShoppingList.update(item.id, {
      status: 'promoted',
      promotedAt: now
    });
    count++;
  }

  return { count };
}
