import { db } from '../../db/schema.js';

const MAX_RECENTS = 50;

/**
 * Marca un producto como usado recientemente (actualiza la fecha).
 */
export async function markAsUsed(productCode) {
  if (!productCode) return;
  
  await db.recentProducts.put({
    productCode,
    timestamp: Date.now()
  });

  // Mantener solo los últimos MAX_RECENTS
  const count = await db.recentProducts.count();
  if (count > MAX_RECENTS) {
    const oldest = await db.recentProducts.orderBy('timestamp').limit(count - MAX_RECENTS).toArray();
    const oldestKeys = oldest.map(r => r.productCode);
    await db.recentProducts.bulkDelete(oldestKeys);
  }
}

/**
 * Devuelve un array con los productCode ordenados del más reciente al más antiguo.
 */
export async function getRecentProductCodes() {
  const recents = await db.recentProducts.orderBy('timestamp').reverse().toArray();
  return recents.map(r => r.productCode);
}
