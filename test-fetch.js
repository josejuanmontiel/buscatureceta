async function run() {
  const fs = require('fs');
  const buffer = fs.readFileSync('src/public/spain_products.csv.gz');
  console.log('Size:', buffer.length);
  // simulate
}
run();
