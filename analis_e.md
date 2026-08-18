Déjame explorar primero la estructura del proyecto para entender qué tenemos sobre los E-xxx y la base de datos de España.

Listed directory buscatureceta
Listed directory src
Listed directory scripts
Listed directory data
Searched for "additives"
Viewed additives.json:1-71
Viewed AdditivesStore.js:1-28

Bien, ya tengo el listado de aditivos con su nivel de riesgo. Ahora busquemos la base de datos de España:

Searched for "spain"
Viewed update_spain_products.sh:1-112
Listed directory public

Tenemos el archivo `spain_products.tsv.zz` (~23MB comprimido). Ahora voy a ver cómo se parsea esa BD para entender la estructura, y luego creo el script para generar el CSV:

Viewed update_spain_products.js:1-90
Searched for "ingredients_text\|additives_tags\|additives"
Searched for "ingredients_text\|additives"
Listed directory products
Viewed ProductStore.js:1-124

Ahora busco cómo se parsea el TSV para saber qué columnas tiene (especialmente si hay una columna `additives_tags`):

Searched for "additives_tags\|ingredients_text\|tsv\.zz"
Listed directory js
Listed directory db
Searched for "spain_products"
Viewed settings.js:380-480

Ahora tengo suficiente información. Voy a descomprimir las primeras líneas del TSV para ver qué columnas incluye (especialmente `additives_tags` o `ingredients_text`):

Ran command: `node -e "
const zlib = require('zlib');
const fs = require('fs');
const data = fs.readFileSync('src/public/spain_products.tsv.zz');
const inflated = zlib.inflateSync(data).toString('utf8');
const lines = inflated.split('\n');
console.log('Primera línea (cabeceras):');
console.log(lines[0]);
console.log('\nSegunda línea (muestra):');
console.log(lines[1].substring(0,500));
"
`

El TSV tiene la columna `ingredients_text` pero **no** tiene `additives_tags`. Los E-xxx están en el texto de ingredientes. Ahora voy a crear el script Node.js que analiza toda la BD y genera el CSV con los productos que contienen E-xxx peligrosos:

Ran command: `cat > /home/jose/workspace/josejuanmontiel/buscatureceta/scripts/analyze_dangerous_additives.cjs << 'SCRIPT_EOF'
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
SCRIPT_EOF
echo "Script creado OK"`

Script creado. Ahora lo ejecutamos:

Ran command: `node scripts/analyze_dangerous_additives.cjs 2>&1`

¡Perfecto! El análisis ha terminado. Verifiquemos el CSV generado:

Ran command: `wc -l scripts/dangerous_products.csv && echo "---primeras 5 lineas---" && head -5 scripts/dangerous_products.csv | cut -c1-200`

El CSV está perfecto. Aquí tienes el resumen de los resultados:

---

## ✅ Análisis completado

### 📊 Resultados del análisis de la BD de España

**Base de datos**: `spain_products.tsv.zz` — **354.697 productos** escaneados  
**CSV generado**: [`scripts/dangerous_products.csv`](file:///home/jose/workspace/josejuanmontiel/buscatureceta/scripts/dangerous_products.csv) — **620 productos** con aditivos de riesgo alto (0.2% del total)

### 🔴 Aditivos peligrosos encontrados (riesgo = alto)

| Aditivo | Nombre | Productos |
|---------|--------|-----------|
| **E250** | Nitrito sódico | 300 |
| **E252** | Nitrato potásico | 96 |
| **E171** | Dióxido de titanio | 80 |
| **E102** | Tartrazina | 73 |
| **E129** | Rojo Allura AC | 60 |
| **E952** | Ciclamato | 41 |
| **E110** | Amarillo Ocaso FCF | 36 |
| **E321** | BHT | 35 |
| **E320** | BHA | 31 |
| **E122** | Azorrubina | 19 |
| **E251** | Nitrato sódico | 15 |
| **E127** | Eritrosina | 12 |
| E124, E104, E123, E214, E249 | Resto | < 10 c/u |

### 📁 Formato del CSV
Separador `;`, con BOM UTF-8 (compatible con Excel directo), columnas:  
`code · product_name · brands · nutriscore_grade · nova_group · additives_found · additives_names · additives_risk_levels · ingredients_text`

### 🛠️ Uso del script
```bash
# Solo riesgo alto (por defecto)
node scripts/analyze_dangerous_additives.cjs

# Riesgo alto Y medio
node scripts/analyze_dangerous_additives.cjs --risk=alto,medio

# Con fichero de salida personalizado
node scripts/analyze_dangerous_additives.cjs --out=mi_analisis.csv
```

El script está en [`scripts/analyze_dangerous_additives.cjs`](file:///home/jose/workspace/josejuanmontiel/buscatureceta/scripts/analyze_dangerous_additives.cjs) y es reutilizable cada vez que actualices la BD. ¿Quieres que también lo ejecute con `--risk=alto,medio` para tener un CSV más amplio?