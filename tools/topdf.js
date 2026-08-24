/* Render a local HTML file to PDF, or dump its rendered text.
   Used by tools/make_handout.py. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const [, , src, out] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(src), { waitUntil: 'networkidle' });
  if (out === '--text') {
    process.stdout.write(await p.evaluate(() => document.body.innerText));
  } else {
    await p.pdf({ path: out, format: 'A4', printBackground: true });
  }
  await b.close();
})();
