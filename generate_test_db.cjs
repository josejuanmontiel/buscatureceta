const fs = require('fs');
const zlib = require('zlib');

const headers = [
  'code', 'product_name', 'brands', 'nutriscore_grade', 'additives_tags', 'ingredients_text',
  'energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'quantity', 'product_quantity'
];

const products = [
  {
    code: '2087569003329',
    product_name: 'Costilla Adobada El Pradal',
    nutriscore_grade: 'e',
    additives_tags: 'en:e250,en:e252',
    ingredients_text: 'carne de cerdo, sal, especias, conservante E250',
    'energy-kcal_100g': '250',
    proteins_100g: '15',
    carbohydrates_100g: '2',
    fat_100g: '20',
    quantity: '500 g',
    product_quantity: '500'
  },
  {
    code: '01084922',
    product_name: 'Salchichas de Pollo Campofrío',
    nutriscore_grade: 'b',
    additives_tags: 'en:e160c',
    'energy-kcal_100g': '150',
    proteins_100g: '12',
    carbohydrates_100g: '3',
    fat_100g: '10',
    quantity: '300 g',
    product_quantity: '300'
  },
  {
    code: '01472165',
    product_name: 'Pan de Molde Blanco Bimbo',
    nutriscore_grade: 'b',
    additives_tags: '',
    'energy-kcal_100g': '250',
    proteins_100g: '8',
    carbohydrates_100g: '45',
    fat_100g: '3',
    quantity: '400 g',
    product_quantity: '400'
  },
  {
    code: '04295181',
    product_name: 'Leche entera',
    nutriscore_grade: 'b',
    additives_tags: '',
    'energy-kcal_100g': '65',
    proteins_100g: '3.1',
    carbohydrates_100g: '4.7',
    fat_100g: '3.6',
    quantity: '1 L',
    product_quantity: '1000'
  },
  {
    code: '8410014413611',
    product_name: 'Tosta Rica',
    brands: 'Cuétara',
    nutriscore_grade: 'unknown',
    additives_tags: '',
    'energy-kcal_100g': '460',
    proteins_100g: '6',
    carbohydrates_100g: '72',
    fat_100g: '16',
    quantity: '570g',
    product_quantity: '570'
  }
];

let tsv = headers.join('\t') + '\n';
for (const p of products) {
  tsv += headers.map(h => p[h] || '').join('\t') + '\n';
}

const compressed = zlib.deflateSync(Buffer.from(tsv, 'utf8'));
fs.writeFileSync('/home/jose/workspace/josejuanmontiel/buscatureceta/src/public/test_products.tsv.zz', compressed);
console.log('Created test_products.tsv.zz successfully.');
