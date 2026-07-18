const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'tests');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.spec.js'));

for (const f of files) {
  const p = path.join(dir, f);
  let code = fs.readFileSync(p, 'utf8');

  // page.waitForURL('**/grid.html') -> page.waitForURL('**/#grid')
  code = code.replace(/waitForURL\(['"`]\*\*\/?([a-zA-Z0-9-]+)\.html(.*?)['"`]\)/g, "waitForURL('**/#$1$2')");
  // page.goto('/diary.html') -> page.goto('/#diary')
  // We already did this with sed, but let's be sure
  code = code.replace(/goto\(['"`]\/?([a-zA-Z0-9-]+)\.html(.*?)['"`]\)/g, "goto('/#$1$2')");
  
  // page.waitForURL('/recipes.html') -> page.waitForURL('/#recipes')
  code = code.replace(/waitForURL\(['"`]\/?([a-zA-Z0-9-]+)\.html(.*?)['"`]\)/g, "waitForURL('**/#$1$2')");

  // fix index.html
  code = code.replace(/#index\.html/g, '#index');

  // except scan.html
  code = code.replace(/#scan/g, 'scan.html');

  fs.writeFileSync(p, code, 'utf8');
}
console.log('Fixed test URLs');
