const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const srcDir = path.join(__dirname, 'src');

const pages = [
  'index',
  'grid',
  'pantry',
  'recipes',
  'recipe-editor',
  'diary',
  'meal-photos',
  'dashboard',
  'db-viewer',
  'settings',
  'cart-history'
];

// Always read from the clean base template to avoid accumulating nested templates
let baseHtml = fs.readFileSync(path.join(srcDir, 'index.base.html'), 'utf8');
let $base = cheerio.load(baseHtml);


// Prepare base index.html
$base('main').attr('id', 'app-view');
$base('main').addClass('flex-grow-1');
$base('main').empty(); // Clear old index content
$base('template').remove(); // Clear any previously injected templates!
$base('app-menu').attr('current-page', ''); // Router handles active states
$base('script[src="./js/index.js"]').remove();
$base('script[src="./js/main.js"]').before('<script type="module" src="./js/app.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n');

// Loop over all pages to extract content
for (const page of pages) {
  // For index, use the clean base template to avoid reading nested templates from the output file
  const filePath = page === 'index'
    ? path.join(srcDir, 'index.base.html')
    : path.join(srcDir, `${page}.html`);
  if (!fs.existsSync(filePath)) continue;
  
  const html = fs.readFileSync(filePath, 'utf8');
  const $page = cheerio.load(html);
  
  const mainContent = $page('main').html() || '';
  // Extract all modals, templates and hidden panels typically outside main but inside body
  let modalsHtml = '';
  $page('body > .modal, body > template, body > .d-none').not('main, header, footer, script').each((i, el) => {
    modalsHtml += $page.html(el) + '\n';
  });

  // Construct template
  const templateHtml = `
  <template id="view-${page}">
    <div class="view-content d-flex flex-column h-100">
      ${mainContent}
      ${modalsHtml}
    </div>
  </template>
  `;

  // Ensure we don't duplicate templates if they already exist in index.html somehow
  if ($base(`#view-${page}`).length === 0) {
    $base('body').append(templateHtml);
  }
}

fs.writeFileSync(path.join(srcDir, 'index.html'), $base.html());
console.log('SPA HTML generated successfully!');
