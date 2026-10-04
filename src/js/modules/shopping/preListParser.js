/**
 * Parser de texto para la Pre-lista de la compra.
 * Capaz de procesar entradas de voz, pegado de WhatsApp/notas o texto libre,
 * extrayendo cantidades, unidades y nombres limpios de productos.
 */

const NUMBER_WORDS = {
  'un': 1,
  'uno': 1,
  'una': 1,
  'dos': 2,
  'tres': 3,
  'cuatro': 4,
  'cinco': 5,
  'seis': 6,
  'siete': 7,
  'ocho': 8,
  'nueve': 9,
  'diez': 10,
  'media': 0.5,
  'medio': 0.5,
};

const UNIT_PATTERNS = [
  { regex: /^(?:kg|kilos?|kilogramos?)\b/i, unit: 'kg' },
  { regex: /^(?:g|gr|gramos?)\b/i, unit: 'g' },
  { regex: /^(?:l|litros?)\b/i, unit: 'l' },
  { regex: /^(?:ml|mililitros?)\b/i, unit: 'ml' },
  { regex: /^(?:paquetes?|paqs?)\b/i, unit: 'paquetes' },
  { regex: /^(?:latas?)\b/i, unit: 'latas' },
  { regex: /^(?:botellas?)\b/i, unit: 'botellas' },
  { regex: /^(?:bricks?|briks?)\b/i, unit: 'bricks' },
  { regex: /^(?:bolsas?)\b/i, unit: 'bolsas' },
  { regex: /^(?:botes?)\b/i, unit: 'botes' },
  { regex: /^(?:cajas?)\b/i, unit: 'cajas' },
  { regex: /^(?:uds?|unidades?)\b/i, unit: 'uds' },
  { regex: /^(?:docenas?)\b/i, unit: 'docenas' },
  { regex: /^(?:manojos?)\b/i, unit: 'manojos' },
  { regex: /^(?:piezas?)\b/i, unit: 'piezas' }
];

/**
 * Parsea una sola línea o ítem de texto.
 * @param {string} rawLine 
 * @returns {{ name: string, amount: number, unit: string } | null}
 */
export function parseSingleItem(rawLine) {
  if (!rawLine) return null;
  let text = rawLine.trim();

  // 1. Quitar viñetas, guiones y numeración inicial (ej: "- ", "* ", "1. ", "• ")
  text = text.replace(/^[\s\-*•·—–]+\s*/, '');
  text = text.replace(/^\d+[.)\]]\s+/, '');

  // 2. Quitar verbos iniciales de orden/petición si vienen de dictado
  text = text.replace(/^(?:comprar|apuntar|añadir|pon|traer|falta|necesitamos|hace falta)\s+(?:de\s+)?/i, '');

  text = text.trim();
  if (!text) return null;

  let amount = 1;
  let unit = '';

  // 3. Caso especial: "media docena" o "una docena"
  if (/^media docena\s+(?:de\s+)?/i.test(text)) {
    amount = 6;
    unit = 'uds';
    text = text.replace(/^media docena\s+(?:de\s+)?/i, '');
  } else if (/^(?:una|1)\s+docena\s+(?:de\s+)?/i.test(text)) {
    amount = 12;
    unit = 'uds';
    text = text.replace(/^(?:una|1)\s+docena\s+(?:de\s+)?/i, '');
  } else {
    // 4. Buscar cantidad inicial numérica (ej. 2, 2.5, 2,5, 1/2) o en palabra ("dos", "tres")
    let numMatched = false;

    // Fracción tipo 1/2
    const fracMatch = text.match(/^(\d+)\/(\d+)\s+/);
    if (fracMatch) {
      amount = parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]);
      text = text.slice(fracMatch[0].length).trim();
      numMatched = true;
    } else {
      // Número estándar o decimal
      const numMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*/);
      if (numMatch) {
        amount = parseFloat(numMatch[1].replace(',', '.'));
        text = text.slice(numMatch[0].length).trim();
        numMatched = true;
      } else {
        // Palabra numérica inicial
        const firstWord = text.split(/\s+/)[0]?.toLowerCase();
        if (firstWord && NUMBER_WORDS[firstWord] !== undefined) {
          amount = NUMBER_WORDS[firstWord];
          text = text.slice(firstWord.length).trim();
          numMatched = true;
        }
      }
    }

    // 5. Buscar unidad inmediatamente después de la cantidad
    if (numMatched && text) {
      for (const u of UNIT_PATTERNS) {
        const uMatch = text.match(u.regex);
        if (uMatch) {
          unit = u.unit;
          text = text.slice(uMatch[0].length).trim();
          // Convertir "docenas" a unidades numéricas si procede
          if (unit === 'docenas') {
            amount = amount * 12;
            unit = 'uds';
          }
          break;
        }
      }
    }

    // Si había un "medio" o "media" pero no se detectó número previo
    if (!numMatched) {
      const halfMatch = text.match(/^(?:medio|media)\s+(kilo|litro|docena)\s+/i);
      if (halfMatch) {
        const halfUnit = halfMatch[1].toLowerCase();
        if (halfUnit === 'kilo') { amount = 0.5; unit = 'kg'; }
        else if (halfUnit === 'litro') { amount = 0.5; unit = 'l'; }
        else if (halfUnit === 'docena') { amount = 6; unit = 'uds'; }
        text = text.slice(halfMatch[0].length).trim();
      }
    }
  }

  // 6. Quitar conector "de" o "del" si quedó al inicio del nombre (ej. "de leche", "de huevos")
  text = text.replace(/^(?:de\s+|del\s+)/i, '').trim();

  // Limpiar caracteres residuales
  text = text.replace(/[.,;:]+$/, '').trim();

  if (!text) return null;

  // Capitalizar la primera letra
  const formattedName = text.charAt(0).toUpperCase() + text.slice(1);

  return {
    name: formattedName,
    amount: amount || 1,
    unit: unit || ''
  };
}

/**
 * Parsea un bloque de texto que puede contener múltiples líneas o frases dictadas.
 * Si contiene saltos de línea, procesa línea a línea.
 * Si es una sola frase continua con comas o 'y' (dictado), la divide inteligentemente.
 * @param {string} fullText 
 * @returns {Array<{ name: string, amount: number, unit: string }>}
 */
export function parseShoppingText(fullText) {
  if (!fullText || typeof fullText !== 'string') return [];

  const rawLines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];

  for (const line of rawLines) {
    // Si la línea tiene comas o " y " / " e " y parece una lista continua en una línea
    const isSingleListSentence = /[,;]|\s+y\s+|\s+e\s+/i.test(line);

    if (isSingleListSentence) {
      // Separar por comas, puntos y comas, o ' y ' / ' e '
      // Cuidado con expresiones compuestas como "pan y chocolate" o "sal y pimienta"
      const chunks = line
        .split(/[,;]|\s+y\s+|\s+e\s+/i)
        .map(c => c.trim())
        .filter(Boolean);

      for (const chunk of chunks) {
        const parsed = parseSingleItem(chunk);
        if (parsed && parsed.name) {
          results.push(parsed);
        }
      }
    } else {
      const parsed = parseSingleItem(line);
      if (parsed && parsed.name) {
        results.push(parsed);
      }
    }
  }

  return results;
}
