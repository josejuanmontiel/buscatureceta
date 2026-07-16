/**
 * CartStore — Control del Carrito de la Compra e Historial de Precios
 */
import { db } from '../../db/schema.js';
import * as PantryStore from '../pantry/PantryStore.js';

/**
 * Añade o actualiza un producto en el carrito
 */
export async function addToCart(productCode, amount, price, unit = 'g') {
  if (!productCode || amount <= 0) return;

  const numericPrice = parseFloat(price) || 0;

  let item = await db.cart.where({ productCode }).first();
  if (item) {
    // Sumamos cantidad, actualizamos precio unitario
    await db.cart.update(item.id, { 
      amount: item.amount + amount,
      price: numericPrice 
    });
  } else {
    await db.cart.add({ productCode, amount, price: numericPrice, unit });
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
 * Obtener estado actual del carrito (productos con nombres y total)
 */
export async function getCart() {
  const items = await db.cart.toArray();
  let total = 0;
  
  const codes = items.map(i => i.productCode);
  const products = await db.products.where('code').anyOf(codes).toArray();
  const productMap = {};
  products.forEach(p => { productMap[p.code] = p.product_name; });

  const enrichedItems = items.map(item => {
    // Calculamos el coste total de este item si el precio es unitario
    total += (item.price * item.amount);
    return {
      ...item,
      productName: productMap[item.productCode] || 'Producto Desconocido'
    };
  });

  return { items: enrichedItems, total };
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
 * Pasar por caja (Checkout)
 * Mueve todo lo del carrito a la despensa y lo borra
 */
export async function checkout() {
  const { items } = await getCart();
  
  for (const item of items) {
    let stockAmount = item.amount;
    let stockUnit = item.unit;

    const product = await db.products.get(item.productCode);
    if (product && product.product_quantity && item.unit === 'unidad') {
      const pq = parseFloat(product.product_quantity);
      if (!isNaN(pq) && pq > 0) {
        stockAmount = item.amount * pq;
        // Asumimos 'g' como unidad por defecto para cantidades numéricas extraídas de OFF
        // A menos que contenga 'ml' o 'l' en el string quantity
        if (product.quantity && product.quantity.toLowerCase().includes('l')) {
          stockUnit = 'ml';
          if (product.quantity.toLowerCase().includes(' l')) {
             // A veces product_quantity viene en Litros (e.g. 1.5). Si pq < 10 y dice L, multiplicamos por 1000
             if (pq < 10) stockAmount *= 1000;
          }
        } else {
          stockUnit = 'g';
        }
      }
    }

    await PantryStore.addStock(item.productCode, stockAmount, stockUnit);
  }
  
  await emptyCart();
}
