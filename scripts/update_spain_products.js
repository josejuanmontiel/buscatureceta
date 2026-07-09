import fs from 'fs';
import zlib from 'zlib';
import https from 'https';
import readline from 'readline';

// We use the direct S3 link as the static openfoodfacts link redirects here.
// In Node 18+ we could use fetch, but https + readline is very robust for streaming large files.
const URL = 'https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/en.openfoodfacts.org.products.csv.gz';
const OUTPUT_FILE = './spain_products.tsv.zz';

console.log('Starting OpenFoodFacts data update for Spain...');

https.get(URL, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Failed to download file. Status Code: ${res.statusCode}`);
    process.exit(1);
  }

  const gunzip = zlib.createGunzip();
  const deflater = zlib.createDeflate();
  const outputStream = fs.createWriteStream(OUTPUT_FILE);

  let processedCount = 0;
  let savedCount = 0;
  let countriesTagsIndex = -1;

  // Pipe the download to gunzip
  res.pipe(gunzip);

  // Pipe our deflate stream to the output file
  deflater.pipe(outputStream);

  const rl = readline.createInterface({
    input: gunzip,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    processedCount++;
    
    // We expect a TSV file (tab separated)
    if (processedCount === 1) {
      // Header line
      const headers = line.split('\t');
      countriesTagsIndex = headers.indexOf('countries_tags');
      
      if (countriesTagsIndex === -1) {
        console.error('Error: "countries_tags" column not found in header.');
        process.exit(1);
      }
      
      deflater.write(line + '\n');
      savedCount++;
      return;
    }

    if (countriesTagsIndex !== -1) {
      const columns = line.split('\t');
      const tags = columns[countriesTagsIndex];
      
      if (tags && tags.includes('en:spain')) {
        deflater.write(line + '\n');
        savedCount++;
      }
    }

    if (processedCount % 100000 === 0) {
      console.log(`Processed ${processedCount} products... Saved ${savedCount} from Spain.`);
    }
  });

  rl.on('close', () => {
    deflater.end();
    console.log(`\nFinished processing!`);
    console.log(`Total products parsed: ${processedCount}`);
    console.log(`Total Spain products saved: ${savedCount}`);
  });

  gunzip.on('error', (err) => {
    console.error('Error decompressing stream:', err);
  });

  outputStream.on('finish', () => {
    console.log(`File successfully saved to ${OUTPUT_FILE}`);
  });

}).on('error', (err) => {
  console.error('Error during download:', err);
});
