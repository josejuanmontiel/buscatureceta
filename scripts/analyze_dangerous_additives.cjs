#!/usr/bin/env node
/**
 * analyze_dangerous_additives.cjs
 *
 * Analiza spain_products.tsv.zz y genera un CSV con todos los productos
 * que contengan alguno de los aditivos clasificados como "alto" riesgo
 * en src/data/additives.json
 *
 * Uso:
 *   node scripts/analyze_dangerous_additives.cjs
 *   node scripts/analyze_dangerous_additives.cjs --risk=alto,medio
 *   node scripts/analyze_dangerous_additives.cjs --out=mi_salida.csv
 */

'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'src/public/spain_products.tsv.zz');
const ADDITIVES_FILE = path.join(ROOT, 'src/data/additives.json');

// Parsear argumentos --key=value
const args = {};
process.argv.slice(2).forEach(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  args[k] = v;
});

const RISK_LEVELS = (args.risk || 'alto').split(',').map(r => r.trim().toLowerCase());
const OUTPUT_FILE = args.out
  ? path.resolve(args.out)
  : path.join(ROOT, 'scripts/dangerous_products.csv');

// Cargar aditivos peligrosos
const allAdditives = JSON.parse(fs.readFileSync(ADDITIVES_FILE, 'utf8'));
const dangerousAdditives = allAdditives.filter(a => RISK_LEVELS.includes(a.risk.toLowerCase()));

if (dangerousAdditives.length === 0) {
  console.error('No se encontraron aditivos con riesgo: ' + RISK_LEVELS.join(', '));
  process.exit(1);
}

const dangerousMap = new Map();
dangerousAdditives.forEach(a => {
  dangerousMap.set(a.code.toLowerCase().replace(/\s/g, ''), a);
});

console.log('\nNiveles de riesgo: ' + RISK_LEVELS.join(', '));
console.log('Aditivos a buscar: ' + dangerousAdditives.length);
dangerousAdditives.forEach(a => console.log('  * ' + a.code + ' - ' + a.name + ' (' + a.risk + ')'));
console.log('');

// Regex combinado para todos los E-xxx peligrosos
const sortedCodes = [...dangerousMap.keys()].sort((a, b) => b.length - a.length);
const ePatternSource = '\\b(' + sortedCodes.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b';

function findDangerousCodes(ingredientsText) {
  if (!ingredientsText) return [];
  const found = new Set();
  const re = new RegExp(ePatternSource, 'gi');
  let m;
  while ((m = re.exec(ingredientsText)) !== null) {
    found.add(m[1].toLowerCase().replace(/\s/g, ''));
  }
  return [...found];
}

// Leer y descomprimir
console.log('Leyendo BD: ' + DB_FILE);
const compressed = fs.readFileSync(DB_FILE);
const raw = zlib.inflateSync(compressed).toString('utf8');
const allLines = raw.split('\n');
console.log('Total lineas en BD: ' + allLines.length.toLocaleString() + '\n');

const headers = allLines[0].replace(/\r/, '').split('\t');
const COL = {};
headers.forEach((h, i) => { COL[h.trim()] = i; });

const csvRows = [];
csvRows.push([
  'code', 'product_name', 'brands', 'nutriscore_grade', 'nova_group',
  'additives_found', 'additives_names', 'additives_risk_levels', 'ingredients_text'
].join(';'));

let scanned = 0;
let matched = 0;

for (let i = 1; i < allLines.length; i++) {
  const line = allLines[i].replace(/\r/, '').trim();
  if (!line) continue;
  scanned++;
  const cols = line.split('\t');
  const ingredientsText = (cols[COL['ingredients_text']] || '').replace(/^"|"$/g, '');
  const foundCodes = findDangerousCodes(ingredientsText);
  if (foundCodes.length === 0) continue;
  matched++;

  const code = (cols[COL['code']] || '').replace(/^"|"$/g, '');
  const productName = (cols[COL['product_name']] || '').replace(/^"|"$/g, '').replace(/;/g, ',');
  const brands = (cols[COL['brands']] || '').replace(/^"|"$/g, '').replace(/;/g, ',');
  const nutriscore = (cols[COL['nutriscore_grade']] || '').replace(/^"|"$/g, '');
  const novaGroup = (cols[COL['nova_group']] || '').replace(/^"|"$/g, '');

  const additivesObjs = foundCodes.map(c => dangerousMap.get(c)).filter(Boolean);
  const additiveCodes = additivesObjs.map(a => a.code).join('|');
  const additiveNames = additivesObjs.map(a => a.name.replace(/;/g, ',')).join('|');
  const additiveRisks = additivesObjs.map(a => a.risk).join('|');
  const ingrClean = ingredientsText.replace(/[\r\n]+/g, ' ').replace(/;/g, ',').substring(0, 300);

  csvRows.push([code, productName, brands, nutriscore, novaGroup, additiveCodes, additiveNames, additiveRisks, ingrClean].join(';'));

  if (scanned % 10000 === 0) {
    process.stdout.write('\r  Escaneados: ' + scanned.toLocaleString() + ' | Con aditivos peligrosos: ' + matched.toLocaleString() + '  ');
  }
}

process.stdout.write('\n');

// BOM para compatibilidad con Excel
fs.writeFileSync(OUTPUT_FILE, '\uFEFF' + csvRows.join('\n'), 'utf8');

console.log('\nCompletado!');
console.log('  Productos escaneados       : ' + scanned.toLocaleString());
console.log('  Productos con E-peligrosos : ' + matched.toLocaleString() + ' (' + ((matched/scanned)*100).toFixed(1) + '%)');
console.log('  CSV generado en            : ' + OUTPUT_FILE);
console.log('\nDistribucion por aditivo:');

const statsByCode = new Map();
dangerousAdditives.forEach(a => statsByCode.set(a.code, { ...a, count: 0 }));

for (let r = 1; r < csvRows.length; r++) {
  const parts = csvRows[r].split(';');
  if (parts.length < 6) continue;
  const codes = parts[5].split('|');
  codes.forEach(c => {
    const upperC = c.trim().toUpperCase();
    if (statsByCode.has(upperC)) {
      statsByCode.get(upperC).count++;
    }
  });
}

[...statsByCode.values()]
  .sort((a, b) => b.count - a.count)
  .filter(s => s.count > 0)
  .forEach(s => {
    console.log('  ' + s.code.padEnd(8) + ' ' + s.name.substring(0,38).padEnd(40) + ' ' + String(s.count).padStart(6) + ' productos');
  });
