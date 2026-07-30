import { db } from '../../db/schema.js';

/**
 * Creates a new active shopping list.
 * Any previously active list is archived.
 * @param {string} name - The name of the list (e.g. from recipe or history date)
 * @param {Array<{name: string, code?: string, amount?: number, unit?: string}>} items 
 */
export async function createList(name, items) {
  // Archive current active list if any
  const activeLists = await db.shoppingLists.where({ status: 'active' }).toArray();
  for (const list of activeLists) {
    await db.shoppingLists.update(list.id, { status: 'archived' });
  }

  const formattedItems = items.map(i => ({
    name: i.name,
    code: i.code || null,
    amount: i.amount || 1,
    unit: i.unit || '',
    checked: false
  }));

  const listId = await db.shoppingLists.add({
    name,
    date: new Date().toISOString(),
    items: formattedItems,
    status: 'active'
  });

  return listId;
}

/**
 * Returns the currently active shopping list.
 */
export async function getActiveList() {
  const list = await db.shoppingLists.where({ status: 'active' }).first();
  return list || null;
}

/**
 * Update the whole items array of the list.
 */
export async function updateListItems(listId, items) {
  await db.shoppingLists.update(listId, { items });
}

/**
 * Marks an item as checked by exact product code, or by name if no code exists.
 */
export async function checkItem(listId, codeOrName) {
  const list = await db.shoppingLists.get(listId);
  if (!list) return false;
  
  let changed = false;
  list.items.forEach(item => {
    if (!item.checked) {
      if (item.code && item.code === codeOrName) {
        item.checked = true;
        changed = true;
      } else if (!item.code && item.name === codeOrName) {
        item.checked = true;
        changed = true;
      }
    }
  });

  if (changed) {
    await db.shoppingLists.update(listId, { items: list.items });
  }
  return changed;
}

/**
 * Archive a list.
 */
export async function archiveList(listId) {
  await db.shoppingLists.update(listId, { status: 'archived' });
}

/**
 * Delete a list.
 */
export async function deleteList(listId) {
  await db.shoppingLists.delete(listId);
}
