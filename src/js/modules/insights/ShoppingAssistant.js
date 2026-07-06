import { db } from '../../db/schema.js';
import * as CartStore from '../cart/CartStore.js';

/**
 * Filtra y analiza si un producto es apto según las reglas de exclusión (localStorage "filters")
 * y, si no lo es, devuelve una advertencia y posibles alternativas.
 */
export async function analyzeProductForCart(productCode) {
  const product = await db.products.get(productCode);
  if (!product) return { status: 'not_found' };

  const rawFilters = localStorage.getItem("filters");
  let warnings = [];

  if (rawFilters && product.ingredients_text) {
    const regex = new RegExp(`(${rawFilters})`, 'gi');
    const matches = product.ingredients_text.match(regex);
    if (matches) {
      warnings.push(`Contiene ingredientes excluidos: ${matches.join(', ')}`);
    }
  }

  // Comprobar si el producto es NutriScore E o D (opcional, por hacerlo más inteligente)
  if (['d', 'e'].includes((product.nutriscore_grade || '').toLowerCase())) {
    warnings.push(`NutriScore muy bajo (${product.nutriscore_grade.toUpperCase()})`);
  }

  const lastPrice = await CartStore.getLastKnownPrice(productCode);

  let alternatives = [];
  if (warnings.length > 0) {
    alternatives = await findAlternatives(product, rawFilters);
  }

  return {
    status: warnings.length === 0 ? 'ok' : 'warning',
    product,
    warnings,
    lastPrice,
    alternatives
  };
}

/**
 * Busca alternativas de la misma categoría que no tengan alertas
 */
async function findAlternatives(badProduct, rawFilters) {
  // Las categorías vienen separadas por comas, cogemos la primera o segunda para no ser tan específicos
  const categories = (badProduct.categories_tags || '').split(',');
  if (categories.length === 0) return [];

  const mainCategory = categories[categories.length - 1] || categories[0]; // Suele ser la más específica

  // Buscar todos los de la categoría en DB
  const candidates = await db.products
    .filter(p => (p.categories_tags || '').includes(mainCategory))
    .limit(50)
    .toArray();

  let regex = null;
  if (rawFilters) {
    regex = new RegExp(`(${rawFilters})`, 'gi');
  }

  const validAlternatives = candidates.filter(p => {
    if (p.code === badProduct.code) return false;
    if (regex && p.ingredients_text && p.ingredients_text.match(regex)) return false;
    
    // Mejor NutriScore
    const grade = (p.nutriscore_grade || 'z').toLowerCase();
    if (['d', 'e', 'z'].includes(grade)) return false; 
    
    return true;
  });

  return validAlternatives.slice(0, 3); // Devolver las 3 mejores
}
