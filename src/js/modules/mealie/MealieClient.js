/**
 * MealieClient.js — Cliente e integración con la API de Mealie
 */

const DEFAULT_MEALIE_URL = 'http://localhost:9925';

export function getMealieConfig() {
  const url = localStorage.getItem('mealie_url') || DEFAULT_MEALIE_URL;
  const token = localStorage.getItem('mealie_token') || '';
  return { url: url.replace(/\/+$/, ''), token: token.trim() };
}

export function saveMealieConfig(url, token) {
  if (url) localStorage.setItem('mealie_url', url.trim().replace(/\/+$/, ''));
  else localStorage.removeItem('mealie_url');

  if (token) localStorage.setItem('mealie_token', token.trim());
  else localStorage.removeItem('mealie_token');
}

/**
 * Realiza una petición a la API de Mealie con soporte para proxy en caso de Mixed Content / CORS
 */
async function fetchMealieApi(path, options = {}, customUrl, customToken) {
  const config = getMealieConfig();
  const baseUrl = (customUrl !== undefined ? customUrl : config.url).replace(/\/+$/, '');
  const token = (customToken !== undefined ? customToken : config.token).trim();

  const headers = {
    'Accept': 'application/json',
    ...(options.headers || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  // Si estamos en HTTPS y la URL es HTTP localhost, intentamos primero por el proxy de Vite
  if (isHttps && isLocal) {
    try {
      const res = await fetch(`/mealie-proxy${path}`, { ...options, headers });
      if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
        return res;
      }
    } catch (proxyErr) {
      console.warn('[MealieClient] Proxy falló, intentando llamada directa:', proxyErr.message);
    }
  }

  try {
    return await fetch(`${baseUrl}${path}`, { ...options, headers });
  } catch (directErr) {
    // Si la llamada directa falló por CORS / Mixed Content, reintentar por proxy
    if (isLocal) {
      return await fetch(`/mealie-proxy${path}`, { ...options, headers });
    }
    throw directErr;
  }
}

/**
 * Prueba la conexión con el servidor Mealie
 * @param {string} [customUrl]
 * @param {string} [customToken]
 * @returns {Promise<{ ok: boolean, message: string, totalRecipes?: number }>}
 */
export async function testConnection(customUrl, customToken) {
  const config = getMealieConfig();
  const url = (customUrl !== undefined ? customUrl : config.url).replace(/\/+$/, '');

  if (!url) {
    return { ok: false, message: 'Falta especificar la URL de Mealie.' };
  }

  try {
    const res = await fetchMealieApi('/api/recipes?perPage=1', { method: 'GET' }, customUrl, customToken);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Error de autenticación. Token inválido o sin permisos.' };
    }
    if (!res.ok) {
      return { ok: false, message: `Error HTTP ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();
    return {
      ok: true,
      message: `Conexión exitosa. (${data.total || 0} recetas disponibles)`,
      totalRecipes: data.total || 0
    };
  } catch (err) {
    return { ok: false, message: `No se pudo conectar con Mealie: ${err.message}` };
  }
}

/**
 * Obtiene la lista de recetas de Mealie
 * @param {string} [query]
 * @param {number} [page=1]
 * @param {number} [perPage=50]
 * @returns {Promise<Array>}
 */
export async function getRecipes(query = '', page = 1, perPage = 50) {
  const { url } = getMealieConfig();
  if (!url) throw new Error('Mealie URL no configurada');

  let endpoint = `/api/recipes?page=${page}&perPage=${perPage}`;
  if (query) endpoint += `&search=${encodeURIComponent(query)}`;

  const res = await fetchMealieApi(endpoint, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const data = await res.json();
  return data.items || [];
}

/**
 * Obtiene el detalle completo de una receta por su slug
 * @param {string} slug
 * @returns {Promise<Object>}
 */
export async function getRecipeDetail(slug) {
  const { url } = getMealieConfig();
  if (!url) throw new Error('Mealie URL no configurada');

  const res = await fetchMealieApi(`/api/recipes/${slug}`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  return await res.json();
}

/**
 * Parsea una línea de texto de ingrediente a { name, amount, unit }
 */
export function parseIngredientText(text) {
  if (!text) return { name: 'Ingrediente', amount: 100, unit: 'g' };

  let raw = text.trim();
  // Sustituir fracciones unicode comunes
  const fractions = {
    '½': '0.5', '⅓': '0.33', '⅔': '0.67', '¼': '0.25', '¾': '0.75',
    '⅕': '0.2', '⅖': '0.4', '⅗': '0.6', '⅘': '0.8', '⅙': '0.17', '⅚': '0.83', '⅛': '0.125'
  };
  for (const [f, num] of Object.entries(fractions)) {
    raw = raw.replace(new RegExp(f, 'g'), num);
  }

  // Detectar cantidad al inicio: e.g. "200g", "2.5 cucharadas", "1/2 taza", "2 1/2"
  const m = raw.match(/^([\d\.\,\/\s]+)\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)?\s*(.*)$/);
  if (m) {
    let amtStr = m[1].trim();
    let unitStr = (m[2] || '').toLowerCase().trim();
    let rest = (m[3] || '').trim();

    let amount = 1.0;
    try {
      if (amtStr.includes('/')) {
        const parts = amtStr.split(/\s+/);
        if (parts.length > 1 && parts[1].includes('/')) {
          const whole = parseFloat(parts[0]) || 0;
          const [num, den] = parts[1].split('/');
          amount = whole + (parseFloat(num) / parseFloat(den));
        } else {
          const [num, den] = amtStr.split('/');
          amount = parseFloat(num) / parseFloat(den);
        }
      } else {
        amount = parseFloat(amtStr.replace(',', '.')) || 1.0;
      }
    } catch {
      amount = 1.0;
    }

    let unit = 'g';
    if (['g', 'gr', 'gramos', 'gram', 'grams'].includes(unitStr)) {
      unit = 'g';
    } else if (['ml', 'mililitros', 'cc', 'cl', 'l', 'litros', 'litro'].includes(unitStr)) {
      unit = 'ml';
      if (unitStr.startsWith('l') && !unitStr.startsWith('li')) amount = amount * 1000;
      else if (unitStr === 'cl') amount = amount * 10;
    } else if (['unidad', 'unidades', 'ud', 'uds', 'pieza', 'piezas'].includes(unitStr)) {
      unit = 'unidad';
    } else {
      // Si la unidad es descriptiva (cucharada, taza, diente, pizca, etc.), se agrega al nombre
      if (unitStr) rest = `${unitStr} ${rest}`.trim();
      unit = (amount === Math.floor(amount) && amount <= 10) ? 'unidad' : 'g';
    }

    // Limpiar notas entre paréntesis o conectores
    let name = rest || raw;
    name = name.replace(/^de\s+/i, '').replace(/^d'\s+/i, '').trim();

    return {
      name: name || raw,
      amount: Math.round(amount * 100) / 100,
      unit
    };
  }

  return { name: raw, amount: 100, unit: 'g' };
}

/**
 * Convierte un objeto de receta de Mealie al formato Buscatureceta
 * @param {Object} m
 * @returns {Object}
 */
export function convertMealieToBuscaReceta(m) {
  if (!m) return null;

  // 1. Ingredientes
  const ingredients = [];
  const rawIngs = m.recipeIngredient || [];

  for (const ing of rawIngs) {
    const rawText = ing.display || ing.note || ing.originalText || '';
    const qty = ing.quantity;
    const unitObj = ing.unit;
    const foodObj = ing.food;
    const foodName = (foodObj && typeof foodObj === 'object') ? foodObj.name : null;

    if (foodName) {
      let unit = 'g';
      if (unitObj && typeof unitObj === 'object' && unitObj.name) {
        const u = unitObj.name.toLowerCase();
        if (u.includes('ml') || u.includes('l')) unit = 'ml';
        else if (u.includes('ud') || u.includes('unit') || u.includes('piez')) unit = 'unidad';
      }
      ingredients.push({
        name: foodName,
        amount: qty ? Math.round(parseFloat(qty) * 100) / 100 : 100,
        unit
      });
    } else if (rawText) {
      ingredients.push(parseIngredientText(rawText));
    }
  }

  // 2. Instrucciones
  const instList = [];
  for (const step of (m.recipeInstructions || [])) {
    const t = (step && typeof step === 'object') ? (step.text || '') : String(step || '');
    if (t.trim()) instList.push(t.trim());
  }
  const instructions = instList.join('\n\n');

  // 3. Tags
  const tags = [];
  for (const tag of (m.tags || [])) {
    const tName = (tag && typeof tag === 'object') ? tag.name : String(tag || '');
    if (tName) tags.push(tName);
  }

  // 4. Raciones
  const servings = parseInt(m.recipeServings || m.recipeYieldQuantity || 2, 10) || 2;

  return {
    name: m.name || 'Receta sin título',
    servings,
    description: m.description || '',
    instructions,
    tags,
    ingredients,
    mealieSlug: m.slug || null
  };
}
