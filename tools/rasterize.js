/* Render an SVG to a PNG at a given size, using the Chromium that is already
   here for the browser tests. Used by tools/make_icons.py. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [, , src, out, size] = process.argv;
(async () => {
  const px = parseInt(size, 10);
  const svg = fs.readFileSync(src, 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  await p.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block;width:${px}px;height:${px}px}</style>` + svg);
  await p.screenshot({ path: out, omitBackground: false });
  await b.close();
})();
