const fs = require('fs');
const pako = require('pako');
const buf = fs.readFileSync('./spain_products.csv.gz');
try {
  console.log('Unzipping...');
  const str = pako.ungzip(buf, { to: 'string' });
  console.log('Unzipped length:', str.length);
} catch (e) {
  console.error('Error:', e);
}
