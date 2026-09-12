/* Render a local HTML file to PDF, or dump its rendered text.
   Used by tools/make_handout.py. */
const { chromium } = require('./browser');
const path = require('path');
const [, , src, out] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(require('url').pathToFileURL(path.resolve(src)).href, { waitUntil: 'networkidle' });
  if (out === '--text') {
    process.stdout.write(await p.evaluate(() => document.body.innerText));
  } else {
    await p.pdf({ path: out, format: 'A4', printBackground: true });
  }
  await b.close();
})();
