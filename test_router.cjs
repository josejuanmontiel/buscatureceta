const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));
  await page.goto('https://localhost:8081/#recipe-editor');
  await new Promise(r => setTimeout(r, 2000));
  const html = await page.innerHTML('#app-view');
  console.log(html);
  await browser.close();
})();
