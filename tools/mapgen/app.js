// Booting Azgaar in a headless browser, in one place.
//
// Four scripts here drive the app (build, touchup, verify, map_backdrop) and
// each carried its own copy of the boot sequence. When the app moved to Vite
// and its renderers stopped being bare globals, every copy broke separately
// and one of them — the backdrop render — broke *silently*, because a missing
// layer toggle only shows up as a picture with the wrong things in it.
//
// So the parts that depend on how the app is put together live here:
//   - the URL and the wait for a generated map,
//   - suppressing the "the Generator is updated" dialog, which otherwise sits
//     in the top-left corner of every screenshot,
//   - choosing layers through the layer registry rather than by clicking
//     toggle buttons whose ids change between versions,
//   - loading a saved .map through the app's own uploader.
//
// Needs the app served on 5199:
//   cd /path/to/Fantasy-Map-Generator && setsid nohup npx vite --port 5199 --strictPort &
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const BASE = process.env.FMG_URL || 'http://127.0.0.1:5199/Fantasy-Map-Generator/';

function launch() {
  return chromium.launch({ args: ['--no-sandbox', '--js-flags=--max-old-space-size=6144'] });
}

// Open the app and wait until it has generated something. `width`/`height` are
// the map canvas, `viewport` the window — they differ for a scoring run, where
// the canvas is large and nothing is ever screenshotted.
async function openApp(browser, { width, height, cells, viewport } = {}) {
  const w = width || 1200, h = height || 700, c = cells || 1000;
  const page = await browser.newPage({ viewport: viewport || { width: 1500, height: 850 } });
  // The update dialog is scheduled six seconds after boot and lands on top of
  // the canvas — inside a screenshot of #map, since the shot is taken by
  // region. It only fires when the stored version is older than the app's, so
  // claim to have seen a newer one.
  await page.addInitScript(() => {
    try { localStorage.setItem('version', '9.999.999'); } catch (e) { /* private mode */ }
  });
  await page.goto(`${BASE}?seed=1&width=${w}&height=${h}&cells=${c}`,
                  { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => window.pack && window.pack.states && window.pack.states.length > 1,
                             { timeout: 300000 });
  return page;
}

// Feed a saved .map through the app's own uploader and wait for it to land.
// The uploader is asynchronous with no promise to await, so watch the state
// list change rather than sleeping for a fixed time.
async function loadMap(page, file, { timeout = 240000 } = {}) {
  const abs = path.resolve(file);
  const before = await page.evaluate(() => window.mapId);
  await page.setInputFiles('#mapToLoad', abs);
  await page.waitForFunction(id => window.mapId !== id && window.pack
                                   && window.pack.states && window.pack.states.length > 1,
                             before, { timeout });
  await page.waitForTimeout(3000);   // emblems and relief finish after the load
  return abs;
}

// Turn on exactly these layers and turn every other one off. Layer ids are the
// registry's own (`states`, `borders`, `relief`, `journeys`, …), not the ids of
// the buttons that used to toggle them.
async function setLayers(page, ids) {
  await page.evaluate(ids => { Layers.set(ids); }, ids);
}

// Everything the app draws that is not the map: dialogs, the options panel,
// the two handles that sit in the corners of the canvas.
async function hideChrome(page) {
  await page.evaluate(() => {
    for (const el of Array.from(document.body.children)) {
      if (el.id !== 'map') el.style.display = 'none';
    }
    document.querySelectorAll('.dialog, .ui-dialog, #alert, #tooltip').forEach(d => {
      d.style.display = 'none';
    });
  });
}

// Screenshot the canvas itself rather than the window, so the image is the map
// at its own pixel size.
async function shoot(page, file) {
  const el = await page.$('#map');
  await (el ? el.screenshot({ path: file }) : page.screenshot({ path: file }));
  return file;
}

module.exports = { BASE, launch, openApp, loadMap, setLayers, hideChrome, shoot };
