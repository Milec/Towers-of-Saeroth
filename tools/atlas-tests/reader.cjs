const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8899/';
(async () => {
  const browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}) });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
      const page = await context.newPage(), errors=[];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '#/campaign/nations/Vaelic%20Principality/locations/Expedition%20Site.md');
      await page.locator('#readerContext').waitFor();
      assert.equal(await page.locator('.primary-nav a[aria-current]').innerText(), 'Library');
      const connections = page.locator('.reader-connections');
      await connections.evaluate(e => e.open = true);
      const preview = page.locator('[data-preview]').first();
      const previousHash = await page.evaluate(() => location.hash);
      await preview.click();
      await page.locator('dialog[open] .preview-excerpt p').first().waitFor();
      await page.waitForFunction(() => !document.querySelector('.preview-excerpt').textContent.includes('Loading entry'));
      assert.equal(await page.evaluate(() => location.hash), previousHash);
      await page.keyboard.press('Control+k');
      assert(await page.locator('#searchModal').isHidden());
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog[open]').count(),0);
      assert.equal(await preview.evaluate(e => e === document.activeElement), true);
      await page.goto(base + '#/campaign/sessions/Session%204%20-%20The%20Mountain%20Road.md');
      await page.locator('#readerContext').waitFor();
      await page.locator(width < 1101 ? '.reader-mobile-guide' : '.reader-guide').evaluate(e => e.open=true);
      const section = page.locator('[data-heading]:visible').first();
      if (await section.count()) {
        let requests=0;
        page.on('request',req=>{if(req.url().includes('content/campaign')) requests++;});
        await section.click();
        assert.equal(requests,0,'Outline navigation should not reload the note');
        assert(await page.evaluate(()=>document.activeElement.matches('h2,h3')));
      }
      for (const theme of ['light','dark']) {
        await page.evaluate(t=>document.documentElement.dataset.theme=t, theme);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${theme} horizontal overflow`);
      }
      await page.evaluate(()=>location.hash='#/%E0%A4%A');
      await page.getByRole('heading',{name:'Campaign desk',exact:true}).waitFor();
      if(width > 860) {
        await page.locator('#menuBtn').click();
        assert(await page.locator('#sidebar').isHidden());
        await page.locator('#graphBtn').click();
        await page.locator('#menuBtn').click();
        assert(await page.locator('#sidebar').isVisible(),'Collapsed navigation must reopen above the graph');
        await page.keyboard.press('Escape');
        assert(await page.locator('#scrim').isHidden());
      }
      assert.deepEqual(errors,[]);
      await context.close();
    }
    await browser.close();
    console.log('PASS: reader previews, focus restoration, outline without reload, mobile themes, malformed URL recovery, collapsed graph navigation.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
