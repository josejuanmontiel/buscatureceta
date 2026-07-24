import * as ProductStore from "../products/ProductStore.js";
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
 * Actualiza cantidad y precio de un producto en el carrito
 */
export async function updateCartItem(id, amount, price) {
  const numericPrice = parseFloat(price) || 0;
  const numericAmount = parseFloat(amount) || 1;
  await db.cart.update(id, {
    amount: numericAmount,
    price: numericPrice
  });
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
  const products = await ProductStore.getProductsByCodes(codes);
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
 * Mueve todo lo del carrito a la despensa, lo guarda en el historial y lo borra.
 */
export async function checkout(supermarket = '', notes = '') {
  const { items, total } = await getCart();
  const warnings = [];
  
  if (items.length === 0) return warnings;

  // Guardar en el historial
  await db.cartHistory.add({
    date: new Date().toISOString(),
    total: total,
    items: items,
    supermarket: supermarket,
    notes: notes
  });
  
  for (const item of items) {
    let stockAmount = item.amount;
    let stockUnit = item.unit;

    const product = await ProductStore.getProductByCode(item.productCode);
    if (item.unit === 'unidad') {
      if (product && product.product_quantity) {
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
        } else {
          stockAmount = item.amount * 1000;
          stockUnit = 'g';
          warnings.push(`- ${item.productName || item.productCode}: cantidad inválida, asumiendo 1kg/unidad.`);
        }
      } else {
        stockAmount = item.amount * 1000;
        stockUnit = 'g';
        warnings.push(`- ${item.productName || item.productCode}: sin peso registrado, asumiendo 1kg/unidad.`);
      }
    }

    await PantryStore.addStock(item.productCode, stockAmount, stockUnit);
  }
  
  await emptyCart();
  return warnings;
}
