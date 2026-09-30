/**
 * ShelfLifeEstimator — Motor heurístico y de reglas para estimación de vida útil
 * y fechas de caducidad en la despensa.
 *
 * Jerarquía de estimación:
 *  1. OpenFoodFacts categories_tags (alta fiabilidad)
 *  2. Categoría de Alimento Primario BEDCA (alta fiabilidad)
 *  3. Palabras clave semánticas en el nombre del producto (fiabilidad media)
 *  4. Fallback conservador por defecto
 */

// Reglas basadas en categorías OFF
const OFF_CATEGORY_RULES = [
  // Conservas y no perecederos (3 años)
  { match: ['canned', 'tinned', 'conserva'], days: 1095, shelfClass: 'long', label: 'Conserva / Enlatado' },
  { match: ['spices', 'salts', 'vinegars', 'sugars', 'honey'], days: 1095, shelfClass: 'long', label: 'Condimentos y Especias' },
  // Alimentos secos base (2 años)
  { match: ['pastas', 'dry-pasta', 'durum-wheat-pasta'], days: 730, shelfClass: 'long', label: 'Pasta seca' },
  { match: ['rices', 'cereal-grains', 'cereal-flakes', 'flours'], days: 730, shelfClass: 'long', label: 'Arroz / Cereales secos' },
  { match: ['legumes', 'pulses', 'dried-legumes'], days: 730, shelfClass: 'long', label: 'Legumbres secas' },
  // Aceites y grasas estables (1.5 años)
  { match: ['plant-oils', 'olive-oils', 'vegetable-oils'], days: 540, shelfClass: 'long', label: 'Aceite' },
  // Ultracongelados (1 año)
  { match: ['frozen-foods', 'ice-creams'], days: 365, shelfClass: 'medium', label: 'Congelado' },
  // Bricks, caldos y bebidas envasadas UHT (6-9 meses)
  { match: ['plant-based-beverages', 'uht-milks', 'broths', 'dehydrated-soups', 'tomato-sauces'], days: 270, shelfClass: 'medium', label: 'Brick / UHT / Salsa' },
  // Snacks, galletas, chocolate (6-8 meses)
  { match: ['biscuits', 'cakes', 'cereal-bars', 'chocolate', 'cocoa', 'snacks'], days: 210, shelfClass: 'medium', label: 'Snacks / Galletas' },
  // Quesos y embutidos curados (2-3 meses)
  { match: ['cheeses', 'cured-cheeses', 'charcuterie'], days: 75, shelfClass: 'medium', label: 'Queso / Curado' },
  // Lácteos refrigerados y huevos (1 mes)
  { match: ['fermented-milk-products', 'yogurts', 'desserts'], days: 28, shelfClass: 'short', label: 'Yogur / Postre lácteo' },
  { match: ['eggs'], days: 28, shelfClass: 'short', label: 'Huevos' },
  // Frescos y perecederos (3-10 días)
  { match: ['fresh-vegetables', 'vegetables', 'fruits', 'salads'], days: 7, shelfClass: 'short', label: 'Fruta / Verdura fresca' },
  { match: ['prepared-meats', 'meats', 'poultry'], days: 5, shelfClass: 'short', label: 'Carne fresca' },
  { match: ['seafood', 'fishes'], days: 3, shelfClass: 'short', label: 'Pescado fresco' },
];

// Reglas por categoría canónica BEDCA
const BEDCA_CATEGORY_RULES = {
  legume: { days: 730, shelfClass: 'long', label: 'Legumbre seca' },
  cereal: { days: 365, shelfClass: 'long', label: 'Cereal / Grano' },
  spice: { days: 730, shelfClass: 'long', label: 'Especia' },
  oil: { days: 540, shelfClass: 'long', label: 'Aceite' },
  nut: { days: 180, shelfClass: 'medium', label: 'Fruto seco' },
  dairy: { days: 21, shelfClass: 'short', label: 'Lácteo' },
  vegetable: { days: 7, shelfClass: 'short', label: 'Verdura fresca' },
  fruit: { days: 7, shelfClass: 'short', label: 'Fruta fresca' },
  meat: { days: 4, shelfClass: 'short', label: 'Carne fresca' },
  fish: { days: 3, shelfClass: 'short', label: 'Pescado fresco' },
  other: { days: 60, shelfClass: 'medium', label: 'Varios' },
};

// Heurísticas de texto por palabras clave en el nombre del producto
const NAME_KEYWORD_RULES = [
  { keywords: ['lata', 'bote', 'conserva', 'enlatad'], days: 1095, shelfClass: 'long', label: 'Conserva detectada' },
  { keywords: ['congelad', 'ultracongelad'], days: 365, shelfClass: 'medium', label: 'Congelado detectado' },
  { keywords: ['arroz', 'pasta', 'macarron', 'espagueti', 'fideo', 'garbanzo', 'lenteja', 'alubia', 'harina', 'avena'], days: 730, shelfClass: 'long', label: 'Cereal / Legumbre detectada' },
  { keywords: ['aceite', 'vinagre', 'sal', 'azucar', 'miel'], days: 730, shelfClass: 'long', label: 'Básico despensa' },
  { keywords: ['leche', 'caldo', 'brick', 'soja', 'avena drink'], days: 180, shelfClass: 'medium', label: 'Brick / Bebida' },
  { keywords: ['galleta', 'barrita', 'torta'], days: 180, shelfClass: 'medium', label: 'Snack seco' },
  { keywords: ['queso'], days: 60, shelfClass: 'medium', label: 'Queso' },
  { keywords: ['yogur', 'kefir', 'flan', 'natilla'], days: 28, shelfClass: 'short', label: 'Lácteo refrigerado' },
  { keywords: ['huevo', 'huevos'], days: 28, shelfClass: 'short', label: 'Huevos' },
  { keywords: ['lechuga', 'tomate', 'espinaca', 'ensalada', 'fresc'], days: 7, shelfClass: 'short', label: 'Fresco perecedero' },
  { keywords: ['carne', 'pollo', 'ternera', 'cerdo', 'burger'], days: 5, shelfClass: 'short', label: 'Carne fresca' },
  { keywords: ['pescado', 'salmon', 'merluza', 'atun fresc'], days: 3, shelfClass: 'short', label: 'Pescado fresco' },
];

/**
 * Estima la vida útil (días recomendados) y la fecha de caducidad sugerida para un producto.
 * @param {Object} options
 * @param {string} [options.productCode]
 * @param {string} [options.productName]
 * @param {string} [options.categoriesTags] - Cadena separada por comas de OFF
 * @param {string} [options.primaryCategory] - Categoría BEDCA si aplica
 * @param {Date}   [options.baseDate] - Fecha de partida (default: hoy)
 * @returns {Object} { days, shelfClass, reliability, ruleApplied, suggestedExpiryDate }
 */
export function estimateShelfLife({ productCode = '', productName = '', categoriesTags = '', primaryCategory = '', baseDate = new Date() } = {}) {
  const normBaseDate = baseDate instanceof Date ? baseDate : new Date(baseDate || Date.now());

  // 1. Coincidencia por tags jerárquicos de OpenFoodFacts
  if (categoriesTags && typeof categoriesTags === 'string') {
    const lowerTags = categoriesTags.toLowerCase();
    for (const rule of OFF_CATEGORY_RULES) {
      for (const pattern of rule.match) {
        if (lowerTags.includes(pattern)) {
          return buildEstimateResult(rule.days, rule.shelfClass, 'high', `OFF tag: ${pattern}`, normBaseDate);
        }
      }
    }
  }

  // 2. Coincidencia por categoría canónica Alimento Primario BEDCA
  if (primaryCategory && BEDCA_CATEGORY_RULES[primaryCategory.toLowerCase()]) {
    const bedcaRule = BEDCA_CATEGORY_RULES[primaryCategory.toLowerCase()];
    return buildEstimateResult(bedcaRule.days, bedcaRule.shelfClass, 'high', `BEDCA: ${primaryCategory}`, normBaseDate);
  }

  // Si el código es 'primary:...' inferir por prefijo/nombre
  if (productCode && productCode.startsWith('primary:')) {
    const rawKey = productCode.replace('primary:', '').toLowerCase();
    for (const [catKey, rule] of Object.entries(BEDCA_CATEGORY_RULES)) {
      if (rawKey.includes(catKey)) {
        return buildEstimateResult(rule.days, rule.shelfClass, 'high', `BEDCA Primary Food: ${catKey}`, normBaseDate);
      }
    }
  }

  // 3. Coincidencia heurística por nombre de producto
  if (productName && typeof productName === 'string') {
    const lowerName = productName.toLowerCase();
    for (const rule of NAME_KEYWORD_RULES) {
      for (const kw of rule.keywords) {
        if (lowerName.includes(kw)) {
          return buildEstimateResult(rule.days, rule.shelfClass, 'medium', `Palabra clave: ${kw}`, normBaseDate);
        }
      }
    }
  }

  // 4. Fallback conservador (60 días para despensa general)
  return buildEstimateResult(60, 'medium', 'fallback', 'Regla general por defecto', normBaseDate);
}

function buildEstimateResult(days, shelfClass, reliability, ruleApplied, baseDate) {
  const targetDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  const suggestedExpiryDate = targetDate.toISOString().slice(0, 10);

  return {
    days,
    shelfClass, // 'long' (>180d) | 'medium' (30-180d) | 'short' (<30d)
    reliability, // 'high' | 'medium' | 'fallback'
    ruleApplied,
    suggestedExpiryDate,
  };
}

/**
 * Calcula el estado de caducidad respecto al día de hoy para un elemento de despensa.
 * @param {string|null} expiryDate - 'YYYY-MM-DD'
 * @param {Date} [referenceDate] - Default: hoy
 * @returns {Object} { status, label, diffDays, badgeClass, isExpired }
 */
export function getExpiryStatus(expiryDate, referenceDate = new Date()) {
  if (!expiryDate) {
    return {
      status: 'none',
      label: 'Sin fecha',
      diffDays: null,
      badgeClass: 'bg-secondary',
      isExpired: false,
    };
  }

  const exp = new Date(expiryDate);
  const today = new Date(referenceDate);
  // Normalizar a medianoche para cálculo de días netos
  exp.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffMs = exp.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      status: 'expired',
      label: `Caducado hace ${absDays}d`,
      diffDays,
      badgeClass: 'bg-danger',
      isExpired: true,
    };
  }

  if (diffDays === 0) {
    return {
      status: 'critical',
      label: 'Caduca hoy',
      diffDays: 0,
      badgeClass: 'bg-danger text-white fw-bold',
      isExpired: false,
    };
  }

  if (diffDays <= 7) {
    return {
      status: 'critical',
      label: `Caduca en ${diffDays}d`,
      diffDays,
      badgeClass: 'bg-danger text-white',
      isExpired: false,
    };
  }

  if (diffDays <= 30) {
    return {
      status: 'warning',
      label: `Caduca en ${diffDays}d`,
      diffDays,
      badgeClass: 'bg-warning text-dark',
      isExpired: false,
    };
  }

  if (diffDays <= 180) {
    const months = Math.max(1, Math.round(diffDays / 30));
    return {
      status: 'medium',
      label: `Caduca en ~${months}m`,
      diffDays,
      badgeClass: 'bg-info text-dark',
      isExpired: false,
    };
  }

  const months = Math.round(diffDays / 30);
  return {
    status: 'long',
    label: `Larga duración (~${months}m)`,
    diffDays,
    badgeClass: 'bg-success text-white',
    isExpired: false,
  };
}
