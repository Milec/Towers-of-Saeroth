// Run after build_site.py; ATLAS_TEST_URL may include a GitHub Pages subpath.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8899/';
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  const errors = [];
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({viewport: mobile ? {width:390,height:844} : {width:1440,height:1000}});
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '#/campaign/nations/Vaelic%20Principality/Vaelic%20Principality.md');
      await page.getByRole('link', {name:'Show on map: Vaelic Principality', exact:true}).click();
      const frame = page.frameLocator('.atlas-frame');
      await frame.locator('#info h2').filter({hasText:'Vaelic Principality'}).waitFor();
      await frame.locator('a.campaign-link').waitFor();
      const inner = page.frames().find(f => /\/atlas\//.test(f.url()));
      assert.equal(await inner.evaluate(() => window.ATLAS.burgs.length), 1279);
      assert.equal(await inner.evaluate(() => window.ATLAS.routes.length), 1331);
      await inner.evaluate(() => show('poi', 10001));
      await frame.getByRole('link', {name:'Read campaign lore →', exact:true}).click();
      await page.waitForURL(/Drakenstein/);
      await page.getByRole('link', {name:'Show on map: Drakenstein', exact:true}).click();
      await frame.locator('#info h2').filter({hasText:'Drakenstein'}).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#themeBtn').click();
      await page.locator('#themeBtn').click();
      const screenshot = process.env.ATLAS_SCREENSHOT_DIR;
      if (screenshot) await page.screenshot({path:path.join(screenshot, mobile?'atlas-mobile.png':'atlas-desktop.png')});
      await context.close();
    }
    assert.deepEqual(errors, []);
    const index = JSON.parse(fs.readFileSync(path.join(__dirname,'../../_site/atlas/lore-index.json')));
    assert.equal(Object.keys(index.entries).filter(k=>k.startsWith('nation-')).length, 28);
    for (const record of Object.values(index.entries)) if (record.note) assert(fs.existsSync(path.join(__dirname,'../..',record.note)));
    console.log('PASS: desktop/mobile, both themes, wiki → nation, landmark → wiki → landmark, retained settlement/route counts, all lore targets.');
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exit(1);});
