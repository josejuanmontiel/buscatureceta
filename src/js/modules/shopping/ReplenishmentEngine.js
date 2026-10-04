import { db } from '../../db/schema.js';
import * as ProductStore from '../products/ProductStore.js';
import * as PreShoppingStore from './PreShoppingStore.js';
import * as ShoppingStore from './ShoppingStore.js';

const STAPLES_STORAGE_KEY = 'nutriagenda_prelist_staples';

/**
 * Obtiene la lista de códigos o nombres guardados como básicos fijos (favoritos ⭐)
 * @returns {string[]}
 */
export function getStaples() {
  try {
    const raw = localStorage.getItem(STAPLES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Añade o quita un producto de la lista de básicos fijos
 * @param {string} codeOrName
 * @returns {boolean} true si ahora es básico, false si se quitó
 */
export function toggleStaple(codeOrName) {
  if (!codeOrName) return false;
  const staples = getStaples();
  const index = staples.indexOf(codeOrName);
  let isNowStaple = false;

  if (index >= 0) {
    staples.splice(index, 1);
  } else {
    staples.push(codeOrName);
    isNowStaple = true;
  }

  localStorage.setItem(STAPLES_STORAGE_KEY, JSON.stringify(staples));
  return isNowStaple;
}

/**
 * Comprueba si un producto está marcado como básico fijo
 * @param {string} codeOrName
 * @returns {boolean}
 */
export function isStaple(codeOrName) {
  if (!codeOrName) return false;
  const staples = getStaples();
  return staples.includes(codeOrName);
}

/**
 * Analiza el historial de compras y la despensa para generar recomendaciones
 * de reposición inteligentes.
 *
 * @returns {Promise<{
 *   dueSuggestions: Array<any>,
 *   depletedPantry: Array<any>,
 *   frequentItems: Array<any>,
 *   totalSuggestionsCount: number
 * }>}
 */
export async function getReplenishmentSuggestions() {
  const now = Date.now();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  // 1. Obtener productos que ya están en la pre-lista pendiente o en la lista de compra activa
  const pendingPrelist = await PreShoppingStore.getPendingItems();
  const activeShoppingList = await ShoppingStore.getActiveList();

  const alreadyAddedKeys = new Set();
  pendingPrelist.forEach(i => {
    if (i.code) alreadyAddedKeys.add(String(i.code).toLowerCase());
    if (i.name) alreadyAddedKeys.add(i.name.trim().toLowerCase());
  });
  if (activeShoppingList && Array.isArray(activeShoppingList.items)) {
    activeShoppingList.items.forEach(i => {
      if (i.code) alreadyAddedKeys.add(String(i.code).toLowerCase());
      if (i.name) alreadyAddedKeys.add(i.name.trim().toLowerCase());
    });
  }

  const isAlreadyAdded = (code, name) => {
    if (code && alreadyAddedKeys.has(String(code).toLowerCase())) return true;
    if (name && alreadyAddedKeys.has(name.trim().toLowerCase())) return true;
    return false;
  };

  // 2. Analizar compras históricas (cartHistory)
  const carts = db.cartHistory ? await db.cartHistory.toArray() : [];
  const productStats = new Map(); // key -> stats

  for (const cart of carts) {
    if (!cart.items || !Array.isArray(cart.items) || cart.items.length === 0) continue;
    const cartDate = typeof cart.date === 'number' ? cart.date : new Date(cart.date).getTime();
    if (isNaN(cartDate)) continue;

    for (const item of cart.items) {
      const code = item.productCode || null;
      const name = item.productName || item.product_name || item.name || '';
      if (!name && !code) continue;

      const key = code || name.trim().toLowerCase();
      if (!productStats.has(key)) {
        productStats.set(key, {
          code,
          name: name || 'Producto sin nombre',
          dates: [],
          amounts: [],
          units: new Set(),
          lastSupermarket: cart.supermarket || null
        });
      }

      const st = productStats.get(key);
      st.dates.push(cartDate);
      st.amounts.push(parseFloat(item.amount) || 1);
      if (item.unit) st.units.add(item.unit);
      if (name && st.name === 'Producto sin nombre') st.name = name;
    }
  }

  const userStaples = new Set(getStaples());
  const dueSuggestions = [];
  const frequentItems = [];

  for (const [key, st] of productStats.entries()) {
    st.dates.sort((a, b) => a - b);
    const count = st.dates.length;
    const firstDate = st.dates[0];
    const lastDate = st.dates[count - 1];
    const daysSinceLast = Math.max(0, Math.floor((now - lastDate) / MS_PER_DAY));

    const avgAmount = Math.round((st.amounts.reduce((a, b) => a + b, 0) / count) * 10) / 10 || 1;
    const unit = st.units.values().next().value || '';

    // Si se compró al menos 2 veces, podemos calcular la cadencia media en días
    let cadenceDays = null;
    let isOverdue = false;
    let isDueSoon = false;

    if (count >= 2) {
      const spanDays = Math.max(1, (lastDate - firstDate) / MS_PER_DAY);
      cadenceDays = Math.round(spanDays / (count - 1));

      if (cadenceDays > 0) {
        // Toca reponer si han pasado al menos el 85% de los días de cadencia
        isOverdue = daysSinceLast >= cadenceDays;
        isDueSoon = daysSinceLast >= Math.round(cadenceDays * 0.85);
      }
    }

    const stapleMarked = userStaples.has(st.code) || userStaples.has(st.name.trim().toLowerCase());
    const alreadyPresent = isAlreadyAdded(st.code, st.name);

    const suggestionObj = {
      key,
      code: st.code,
      name: st.name,
      amount: avgAmount,
      unit,
      count,
      cadenceDays,
      daysSinceLast,
      isOverdue,
      isDueSoon,
      isStaple: stapleMarked,
      alreadyPresent,
      type: 'recurring'
    };

    // Si toca por cadencia o es básico vencido
    if ((isOverdue || isDueSoon || (stapleMarked && daysSinceLast >= 5)) && !alreadyPresent) {
      dueSuggestions.push(suggestionObj);
    }

    // Clasificar como frecuente habitual si se compró al menos 2 veces o es básico
    if ((count >= 2 || stapleMarked) && !alreadyPresent) {
      frequentItems.push(suggestionObj);
    }
  }

  // Ordenar sugerencias por urgencia (mayor retraso respecto a su cadencia)
  dueSuggestions.sort((a, b) => {
    const ratioA = a.cadenceDays ? a.daysSinceLast / a.cadenceDays : 1;
    const ratioB = b.cadenceDays ? b.daysSinceLast / b.cadenceDays : 1;
    return ratioB - ratioA;
  });

  // 3. Detectar productos con stock = 0 en despensa (pantry)
  const depletedPantry = [];
  try {
    if (db.pantry) {
      const allPantry = await db.pantry.toArray();
      for (const item of allPantry) {
        const amt = parseFloat(item.amount) || 0;
        if (amt <= 0) {
          let pName = item.productName || null;
          if (!pName && item.productCode) {
            const prod = await ProductStore.getProductByCode(item.productCode);
            pName = prod?.product_name || `Producto ${item.productCode}`;
          }
          pName = pName || 'Producto agotado';

          if (!isAlreadyAdded(item.productCode, pName)) {
            depletedPantry.push({
              key: item.productCode || pName,
              code: item.productCode || null,
              name: pName,
              amount: 1,
              unit: item.unit || '',
              type: 'pantry',
              reason: 'Stock agotado en despensa',
              alreadyPresent: false
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error leyendo despensa agotada:', err);
  }

  const totalSuggestionsCount = dueSuggestions.length + depletedPantry.length;

  return {
    dueSuggestions,
    depletedPantry,
    frequentItems,
    totalSuggestionsCount
  };
}
