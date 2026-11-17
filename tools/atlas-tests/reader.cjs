const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8899/';
async function publishedLocationChecks(browser) {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const location = {p:'campaign/locations/Published Location Fixture.md', title:'Published Location Fixture', t:'location', body:'A newly published mountain location.', l:[]};
      const indexPath = 'campaign/world/Atlas Locations.md';
      const response = await page.request.get(base + 'index-campaign.json');
      const original = await response.json();
      const rulesPath = 'vault/Rules Index Fixture.md';
      await page.route('**/index-vault.json', route => route.fulfill({json:[{p:rulesPath}]}));
      let published = false, failRefresh = false;
      await page.route('**/index-campaign.json', route => route.fulfill(failRefresh ? {status:503,body:'Offline fixture'} :
        {json:{...original,notes:[...original.notes,...(published ? [location] : [])]}}));
      await page.route('**/content/campaign/world/Atlas%20Locations.md', route => route.fulfill({body:'---\ntitle: Atlas Locations\ntype: index\n---\n\n[[Published Location Fixture]]'}));
      await page.route('**/content/campaign/locations/Published%20Location%20Fixture.md', route => route.fulfill({body:'---\ntitle: Published Location Fixture\ntype: location\n---\n\nA newly published mountain location.'}));
      await page.goto(base + '#/workspace');
      await page.locator('#wsNotes').fill('Keep my session draft while new locations publish.');
      await page.evaluate(() => ensureVault());
      assert.equal(await page.evaluate(() => resolveTarget('Published Location Fixture')), null);
      published = true;
      await page.evaluate(path => { location.hash = '#/' + encodeURI(path); }, indexPath);
      await page.getByRole('heading',{name:'Atlas Locations',exact:true}).waitFor();
      assert.equal(await page.locator('#content .wl').getByText(location.title,{exact:true}).evaluate(el => el.tagName), 'A',
        'A location published after boot must become a usable link, not unresolved text.');
      await page.locator('#content .wl').getByText(location.title,{exact:true}).click();
      await page.getByRole('heading',{name:location.title,exact:true}).waitFor();
      assert.equal(await page.evaluate(() => resolveTarget('Rules Index Fixture')), rulesPath,
        'Refreshing campaign locations must retain already loaded rules links.');
      await page.locator('.primary-nav a[href="#/library"]').click();
      await page.locator('#wsLibrarySearch').fill(location.title);
      await page.locator('.ws-library-card h2 a').getByText(location.title,{exact:true}).click();
      await page.getByRole('heading',{name:location.title,exact:true}).waitFor();
      await page.locator('.primary-nav a[href="#/workspace"]').click();
      assert.equal(await page.locator('#wsNotes').inputValue(), 'Keep my session draft while new locations publish.');
      // Publication may also happen while the desk is open, without first reading an index note.
      const second = { ...location, p:'campaign/locations/Second Published Fixture.md', title:'Second Published Fixture' };
      original.notes.push(second);
      await page.route('**/content/campaign/locations/Second%20Published%20Fixture.md', route => route.fulfill({body:'---\ntitle: Second Published Fixture\ntype: location\n---\n\nAnother mountain location.'}));
      await page.locator('.primary-nav a[href="#/library"]').click();
      await page.locator('#wsLibrarySearch').fill(second.title);
      await page.locator('.ws-library-card h2 a').getByText(second.title,{exact:true}).click();
      await page.getByRole('heading',{name:second.title,exact:true}).waitFor();
      failRefresh = true;
      await page.locator('.primary-nav a[href="#/library"]').click();
      await page.locator('#wsLibrarySearch').fill(location.title);
      await page.locator('.ws-library-card h2 a').getByText(location.title,{exact:true}).click();
      await page.getByRole('heading',{name:location.title,exact:true}).waitFor();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
}
(async () => {
  const browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}) });
  try {
    await publishedLocationChecks(browser);
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
      await page.goto(base + '#/campaign/sessions/Session%204%20Prep%20-%20The%20Mountain%20Road.md');
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
