const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/js');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'main.js' && f !== 'app.js' && f !== 'index.js' && f !== 'papaparse.min.js' && f !== 'pako_inflate.min.js');

files.push('index.js'); // explicitly add index.js

for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) continue;
  let code = fs.readFileSync(p, 'utf8');
  
  // Find the start
  const startRegex = /document\.addEventListener\('DOMContentLoaded',\s*(async\s*)?\(\)\s*=>\s*\{/;
  const match = code.match(startRegex);
  if (!match) continue;

  const startIndex = match.index;
  const contentStartIndex = startIndex + match[0].length;
  
  // Find matching closing bracket
  let openBrackets = 1;
  let endIndex = -1;
  for (let i = contentStartIndex; i < code.length; i++) {
    if (code[i] === '{') openBrackets++;
    if (code[i] === '}') {
      openBrackets--;
      if (openBrackets === 0) {
        // we found the closing bracket of the function
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex !== -1) {
    // Check if there is `);` after `}`
    let afterClosing = code.substring(endIndex + 1, endIndex + 4);
    let closingLen = 1;
    if (afterClosing.startsWith(');')) {
      closingLen = 3;
    } else if (afterClosing.trim().startsWith(')')) {
      // it might be `} );`
      const parenIndex = code.indexOf(')', endIndex);
      const semiIndex = code.indexOf(';', parenIndex);
      if (semiIndex !== -1 && semiIndex - parenIndex < 5) {
        closingLen = (semiIndex + 1) - endIndex;
      }
    }

    const before = code.substring(0, startIndex);
    const inside = code.substring(contentStartIndex, endIndex);
    const after = code.substring(endIndex + closingLen);

    code = before + 'export async function initView() {' + inside + '}' + after;
    fs.writeFileSync(p, code, 'utf8');
    console.log(`Refactored ${f}`);
  }
}
