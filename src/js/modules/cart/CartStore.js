import * as ProductStore from "../products/ProductStore.js";
/**
 * CartStore — Control del Carrito de la Compra e Historial de Precios
 */
import { db } from '../../db/schema.js';
import * as PantryStore from '../pantry/PantryStore.js';

/**
 * Añade o actualiza un producto en el carrito
 */
/**
 * Añade o actualiza un producto en el carrito
 */
export async function addToCart(productCode, amount, price, unit = 'unidad', packageUnits = null) {
  if (!productCode || amount <= 0) return;

  const numericPrice = parseFloat(price) || 0;
  const parsedUnits = packageUnits ? parseInt(packageUnits, 10) : null;

  let item = await db.cart.where({ productCode }).first();
  if (item) {
    // Sumamos cantidad, actualizamos precio unitario y unidad si se especifica
    const updates = { 
      amount: item.amount + amount,
      price: numericPrice,
      unit: unit || item.unit || 'unidad'
    };
    if (parsedUnits) updates.packageUnits = parsedUnits;
    await db.cart.update(item.id, updates);
  } else {
    await db.cart.add({
      productCode,
      amount,
      price: numericPrice,
      unit: unit || 'unidad',
      packageUnits: parsedUnits
    });
  }

  // Si hay precio, actualizamos historial
  if (numericPrice > 0) {
    await db.priceHistory.add({
      productCode,
      price: numericPrice,
      date: new Date().toISOString()
    });
  }
}

/**
 * Actualiza cantidad, precio y unidad de un producto en el carrito
 */
export async function updateCartItem(id, amount, price, unit, packageUnits = undefined) {
  const numericPrice = parseFloat(price) || 0;
  const numericAmount = parseFloat(amount) || 1;
  const updates = {
    amount: numericAmount,
    price: numericPrice
  };
  if (unit) {
    updates.unit = unit;
  }
  if (packageUnits !== undefined) {
    updates.packageUnits = packageUnits ? parseInt(packageUnits, 10) : null;
  }
  await db.cart.update(id, updates);
}

/**
 * Borrar del carrito
 */
export async function removeFromCart(id) {
  await db.cart.delete(id);
}

/**
 * Vaciar el carrito completamente (sin pasar por caja)
 */
export async function emptyCart() {
  await db.cart.clear();
}

/**
 * Obtener estado actual del carrito (productos con nombres y total, excluyendo el ticket pendiente)
 */
export async function getCart() {
  const allItems = await db.cart.toArray();
  const items = allItems.filter(i => i.productCode !== '__CART_TICKET__');
  let total = 0;
  
  const codes = items.map(i => i.productCode);
  const products = await ProductStore.getProductsByCodes(codes);
  const productMap = {};
  products.forEach(p => {
    productMap[p.code] = p.product_name || (p.brands ? `${p.brands} (${p.code})` : `Producto ${p.code}`);
  });

  const enrichedItems = items.map(item => {
    // Calculamos el coste total de este item si el precio es unitario
    const lineTotal = (item.price || 0) * (item.amount || 1);
    total += lineTotal;
    return {
      ...item,
      lineTotal,
      productName: productMap[item.productCode] || 'Producto Desconocido'
    };
  });

  return { items: enrichedItems, total };
}

/**
 * Guarda o actualiza el ticket pendiente del carrito en IndexedDB
 */
export async function savePendingCartTicket(blob, thumbBlob) {
  const existing = await db.cart.where('productCode').equals('__CART_TICKET__').first();
  if (existing) {
    await db.cart.update(existing.id, { ticketBlob: blob, ticketThumbBlob: thumbBlob });
  } else {
    await db.cart.add({ productCode: '__CART_TICKET__', amount: 0, price: 0, ticketBlob: blob, ticketThumbBlob: thumbBlob });
  }
}

/**
 * Obtiene el ticket pendiente del carrito desde IndexedDB
 */
export async function getPendingCartTicket() {
  const item = await db.cart.where('productCode').equals('__CART_TICKET__').first();
  if (item && (item.ticketBlob || item.ticketThumbBlob)) {
    return { blob: item.ticketBlob || null, thumbBlob: item.ticketThumbBlob || item.ticketBlob || null };
  }
  return null;
}

/**
 * Elimina el ticket pendiente del carrito
 */
export async function clearPendingCartTicket() {
  await db.cart.where('productCode').equals('__CART_TICKET__').delete();
}

/**
 * Buscar el último precio conocido de un producto
 */
export async function getLastKnownPrice(productCode) {
  const history = await db.priceHistory
    .where({ productCode })
    .reverse()
    .sortBy('date');
  
  if (history && history.length > 0) {
    return history[0].price;
  }
  return 0;
}

/**
 * Procesa y optimiza una imagen de ticket (Full HD y Thumbnail legible)
 * @param {Blob|File} fileOrBlob 
 * @returns {Promise<{ blob: Blob, thumbBlob: Blob }>}
 */
export async function processTicketImage(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);
    
    img.onload = () => {
      try {
        // 1. Imagen optimizada principal (max 1600px para nitidez de texto en tickets largos)
        const maxDim = 1600;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 2. Thumbnail rápido (max 256px)
        const thumbMaxDim = 256;
        let thumbW = img.naturalWidth || img.width;
        let thumbH = img.naturalHeight || img.height;
        if (thumbW > thumbMaxDim || thumbH > thumbMaxDim) {
          if (thumbW > thumbH) {
            thumbH = Math.round((thumbH * thumbMaxDim) / thumbW);
            thumbW = thumbMaxDim;
          } else {
            thumbW = Math.round((thumbW * thumbMaxDim) / thumbH);
            thumbH = thumbMaxDim;
          }
        }
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = thumbW;
        thumbCanvas.height = thumbH;
        const thumbCtx = thumbCanvas.getContext('2d');
        thumbCtx.drawImage(img, 0, 0, thumbW, thumbH);

        // Revocar después de pintar en el canvas para máxima compatibilidad móvil
        URL.revokeObjectURL(url);

        canvas.toBlob((mainBlob) => {
          if (!mainBlob) return resolve({ blob: fileOrBlob, thumbBlob: fileOrBlob });
          thumbCanvas.toBlob((thumbBlob) => {
            resolve({ blob: mainBlob, thumbBlob: thumbBlob || mainBlob });
          }, 'image/jpeg', 0.75);
        }, 'image/jpeg', 0.85);
      } catch (err) {
        URL.revokeObjectURL(url);
        resolve({ blob: fileOrBlob, thumbBlob: fileOrBlob });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error al cargar la imagen'));
    };

    img.src = url;
  });
}

/**
 * Pasar por caja (Checkout)
 * Mueve todo lo del carrito a la despensa, lo guarda en el historial con ticket (si existe) y lo borra.
 */
export async function checkout(supermarket = '', notes = '', ticketBlob = null, ticketThumbBlob = null) {
  const { items, total } = await getCart();
  const pendingTicket = await getPendingCartTicket();
  const finalTicketBlob = ticketBlob || pendingTicket?.blob || null;
  const finalTicketThumbBlob = ticketThumbBlob || pendingTicket?.thumbBlob || null;
  const warnings = [];
  
  if (items.length === 0 && !finalTicketBlob && !finalTicketThumbBlob) {
    return warnings;
  }

  // Guardar en el historial
  await db.cartHistory.add({
    date: new Date().toISOString(),
    total: total,
    items: items,
    supermarket: supermarket,
    notes: notes,
    ticketBlob: finalTicketBlob,
    ticketThumbBlob: finalTicketThumbBlob
  });
  
  for (const item of items) {
    let stockAmount = item.amount;
    let stockUnit = item.unit || 'unidad';

    const product = await ProductStore.getProductByCode(item.productCode);

    if (item.unit === 'kg') {
      stockAmount = item.amount * 1000;
      stockUnit = 'g';
    } else if (item.unit === 'l') {
      stockAmount = item.amount * 1000;
      stockUnit = 'ml';
    } else if (item.unit === 'g' || item.unit === 'ml') {
      stockAmount = item.amount;
      stockUnit = item.unit;
    } else if (item.unit === 'unidad' || item.unit === 'pack') {
      if (product && product.product_quantity) {
        const pq = parseFloat(product.product_quantity);
        if (!isNaN(pq) && pq > 0) {
          stockAmount = item.amount * pq;
          if (product.quantity && product.quantity.toLowerCase().includes('l')) {
            stockUnit = 'ml';
            if (product.quantity.toLowerCase().includes(' l')) {
               if (pq < 10) stockAmount *= 1000;
            }
          } else {
            stockUnit = 'g';
          }
        } else {
          stockAmount = item.amount * 1000;
          stockUnit = 'g';
          warnings.push(`- ${item.productName || item.productCode}: cantidad inválida, asumiendo 1kg/unidad.`);
        }
      } else {
        // Si no tiene product_quantity definido
        stockAmount = item.amount * 1000;
        stockUnit = 'g';
        warnings.push(`- ${item.productName || item.productCode}: sin peso registrado, asumiendo 1kg/unidad.`);
      }
    }

    const zone = product?.pantryZone || (product && product._localOnly ? 'nonfood' : 'food');

    await PantryStore.addStock(item.productCode, stockAmount, stockUnit, zone, item.packageUnits);
  }
  
  await emptyCart();
  return warnings;
}

/**
 * Registra una compra rápida únicamente con la foto del ticket (sin escanear productos)
 */
export async function addTicketOnlyPurchase({
  supermarket = '',
  notes = '',
  total = 0,
  ticketBlob = null,
  ticketThumbBlob = null,
  date = null
}) {
  const numericTotal = parseFloat(total) || 0;
  const purchaseDate = date ? new Date(date).toISOString() : new Date().toISOString();

  const id = await db.cartHistory.add({
    date: purchaseDate,
    total: numericTotal,
    items: [],
    supermarket: supermarket.trim(),
    notes: notes.trim(),
    ticketBlob: ticketBlob || null,
    ticketThumbBlob: ticketThumbBlob || null
  });

  return id;
}

/**
 * Adjunta o actualiza la foto del ticket en una compra existente del historial
 */
export async function updateCartHistoryTicket(cartHistoryId, ticketBlob, ticketThumbBlob) {
  await db.cartHistory.update(cartHistoryId, {
    ticketBlob: ticketBlob || null,
    ticketThumbBlob: ticketThumbBlob || null
  });
}

/**
 * Elimina la foto del ticket de una compra del historial
 */
export async function removeCartHistoryTicket(cartHistoryId) {
  await db.cartHistory.update(cartHistoryId, {
    ticketBlob: null,
    ticketThumbBlob: null
  });
}

/**
 * Actualiza el precio o detalles de un item en el historial de carritos y recalcula el total
 */
export async function updateCartHistoryItem(cartHistoryId, itemIndex, updates = {}) {
  const cart = await db.cartHistory.get(cartHistoryId);
  if (!cart || !cart.items || !cart.items[itemIndex]) return;

  const item = cart.items[itemIndex];
  
  if (updates.price !== undefined) {
    item.price = parseFloat(updates.price) || 0;
  }
  if (updates.amount !== undefined) {
    item.amount = parseFloat(updates.amount) || 1;
  }
  if (updates.unit !== undefined) {
    item.unit = updates.unit;
  }
  
  item.lineTotal = (item.amount || 1) * (item.price || 0);

  // Recalcular total de la compra sumando todas las líneas
  cart.total = cart.items.reduce((sum, it) => sum + ((it.price || 0) * (it.amount || 1)), 0);

  await db.cartHistory.update(cartHistoryId, {
    items: cart.items,
    total: cart.total
  });

  // Si el precio es válido > 0, actualizar historial de precios
  if (item.price > 0 && item.productCode) {
    await db.priceHistory.add({
      productCode: item.productCode,
      price: item.price,
      date: cart.date || new Date().toISOString()
    });
  }
}

/**
 * Añade un producto a posteriori a una compra en el historial
 */
export async function addCartHistoryItem(cartHistoryId, item) {
  const cart = await db.cartHistory.get(cartHistoryId);
  if (!cart) return;

  if (!cart.items) cart.items = [];

  const numericPrice = parseFloat(item.price) || 0;
  const numericAmount = parseFloat(item.amount) || 1;
  const lineTotal = numericAmount * numericPrice;

  const newItem = {
    productCode: item.productCode || 'GENERIC_' + Date.now(),
    productName: item.productName || 'Producto',
    amount: numericAmount,
    unit: item.unit || 'unidad',
    price: numericPrice,
    lineTotal: lineTotal
  };

  cart.items.push(newItem);
  cart.total = cart.items.reduce((sum, it) => sum + ((it.price || 0) * (it.amount || 1)), 0);

  await db.cartHistory.update(cartHistoryId, {
    items: cart.items,
    total: cart.total
  });

  if (numericPrice > 0 && newItem.productCode) {
    await db.priceHistory.add({
      productCode: newItem.productCode,
      price: numericPrice,
      date: cart.date || new Date().toISOString()
    });
  }
}

/**
 * Elimina un producto de una compra en el historial y recalcula el total
 */
export async function removeCartHistoryItem(cartHistoryId, itemIndex) {
  const cart = await db.cartHistory.get(cartHistoryId);
  if (!cart || !cart.items || !cart.items[itemIndex]) return;

  cart.items.splice(itemIndex, 1);
  cart.total = cart.items.reduce((sum, it) => sum + ((it.price || 0) * (it.amount || 1)), 0);

  await db.cartHistory.update(cartHistoryId, {
    items: cart.items,
    total: cart.total
  });
}

