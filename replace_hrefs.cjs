const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/js');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

for (const f of files) {
  const p = path.join(dir, f);
  let code = fs.readFileSync(p, 'utf8');
  let changed = false;

  // Reemplazar window.location.href = '/diary.html' -> window.location.hash = '#diary'
  // Reemplazar window.location.href = 'pantry.html' -> window.location.hash = '#pantry'
  // Reemplazar window.location.href = `recipe-editor.html?id=${id}` -> window.location.hash = `#recipe-editor?id=${id}`
  
  code = code.replace(/window\.location\.href\s*=\s*['"]\/?([a-zA-Z0-9-]+)\.html['"]/g, "window.location.hash = '#$1'");
  code = code.replace(/window\.location\.href\s*=\s*`\/?([a-zA-Z0-9-]+)\.html(.*?)`/g, "window.location.hash = `#$1$2`");
  code = code.replace(/window\.location\.href\s*=\s*['"]\/?([a-zA-Z0-9-]+)\.html\?(.*?)['"]/g, "window.location.hash = '#$1?$2'");

  // Except scan.html, because it is NOT an SPA view.
  // We need to revert scan.html changes.
  code = code.replace(/window\.location\.hash = ['"]#scan(.*?)['"]/g, "window.location.href = '/scan.html$1'");
  code = code.replace(/window\.location\.hash = `#scan(.*?)`/g, "window.location.href = `/scan.html$1`");

  // Fix return params to use hash:
  // e.g. /scan.html?return=pantry.html -> /scan.html?return=%23pantry
  code = code.replace(/return=([a-zA-Z0-9-]+)\.html/g, "return=%23$1");

  if (code !== fs.readFileSync(p, 'utf8')) {
    fs.writeFileSync(p, code, 'utf8');
    console.log(`Updated hrefs in ${f}`);
  }
}
