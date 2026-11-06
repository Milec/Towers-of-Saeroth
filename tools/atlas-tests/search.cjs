const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8899/';

(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  const errors = [];
  try {
    for (const width of [375, 780, 1440]) {
      const context = await browser.newContext({viewport:{width,height:width === 780 ? 390 : 900}, serviceWorkers:'block'});
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const campaignPath = 'campaign/npcs/Search Fixture.md';
      await page.route('**/index-campaign.json', async route => {
        const response = await route.fetch();
        const data = await response.json();
        data.notes.push({p:campaignPath,title:'Auréle Search Probe',summary:'An observant scout who watches the northern pass.',t:'npc',body:'An observant scout who watches the northern pass.',l:[]});
        await route.fulfill({json:data});
      });
      await page.route('**/content/campaign/npcs/Search%20Fixture.md', route => route.fulfill({body:'# Auréle Search Probe\n\nAn observant scout.'}));
      let vaultRequests = 0, pendingVault, signalVault;
      const vaultSeen = new Promise(resolve => { signalVault = resolve; });
      await page.route('**/index-vault.json', route => { vaultRequests++; pendingVault = route; signalVault(); });
      await page.goto(base);
      await page.waitForFunction(() => typeof window.SaerothSearch === 'object' && state.campaign.length > 0);
      await page.locator('#searchBtn').click();
      await page.getByRole('heading', {name:'Find your next thread'}).waitFor();
      assert.equal(vaultRequests, 0, 'Opening an empty search must not load the 41k rules index');
      await page.getByRole('combobox', {name:'Search scope'}).selectOption('Lore');
      await page.locator('#searchInput').fill('probe aurele');
      const hit = page.locator('#searchResults a').filter({hasText:'Auréle Search Probe'});
      await hit.waitFor();
      assert.equal(vaultRequests, 0, 'Lore searches must remain independent of rules loading');
      assert.equal(await page.locator('#searchResults .search-group').count(), 1);
      await page.locator('#searchInput').press('ArrowDown');
      assert(await hit.evaluate(element => element === document.activeElement), 'Arrow key moves focus to the selected result');
      await page.keyboard.press('Enter');
      await page.getByRole('heading', {name:'Auréle Search Probe',exact:true}).waitFor();
      assert(await page.locator('#searchModal').isHidden());
      assert.equal(await page.locator('.layout').evaluate(element => element.inert), false);

      await page.locator('#searchBtn').click();
      await page.getByRole('combobox', {name:'Search scope'}).selectOption('All');
      await page.locator('#searchInput').fill('guard');
      let timeout;
      try { await Promise.race([vaultSeen, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Rules request was never issued')), 10000); })]); }
      finally { clearTimeout(timeout); }
      await page.keyboard.press('Escape');
      assert(await page.locator('#searchBtn').evaluate(element => element === document.activeElement));
      await page.locator('#searchBtn').click();
      await page.getByRole('combobox', {name:'Search scope'}).selectOption('Rules');
      assert.equal(vaultRequests, 1, 'Reopening and changing scope must share the pending rules request');
      await page.getByRole('combobox', {name:'Search scope'}).selectOption('Lore');
      await pendingVault.fulfill({json:[{p:'vault/Rules/Guard Probe.md'}]});
      await page.waitForFunction(() => state.vaultLoaded);
      assert.equal(await page.locator('#searchResults .search-group').filter({hasText:'PF2e rules'}).count(), 0, 'A late rules response must not replace the active Lore scope');
      await page.getByRole('combobox', {name:'Search scope'}).selectOption('Rules');
      await page.locator('#searchResults a').filter({hasText:'Guard Probe'}).waitFor();
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Shift+Tab');
        assert(await page.evaluate(() => !!document.activeElement.closest('#searchModal')), 'Focus stays in the dialog');
      }
      for (const theme of ['light','dark']) {
        await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const box = await page.locator('.search-dialog').boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width + 1, `${width}px ${theme}: search stays on screen`);
        assert(await page.locator('.search-dialog').evaluate(element => element.scrollHeight <= element.clientHeight + 1), 'Dialog must not clip controls in landscape');
        assert((await page.locator('.search-close').boundingBox()).height >= 44);
        if (process.env.ATLAS_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR, `search-${width}-${theme}.png`)});
      }
      await page.locator('#searchInput').fill('zzzznotintheindex');
      await page.locator('.search-empty strong').filter({hasText:'No matches'}).waitFor();
      await page.getByRole('button', {name:'Clear',exact:true}).click();
      await page.locator('.search-suggestions').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#graphBtn').click();
      await page.waitForFunction(() => window.__g?.nodes?.length > 0);
      await page.locator('#gLeave').click();
      await context.close();
    }

    const context = await browser.newContext({serviceWorkers:'block'});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    let attempts = 0;
    await page.route('**/index-vault.json', route => ++attempts === 1 ?
      route.fulfill({status:503, body:'Temporarily unavailable'}) : route.fulfill({json:[{p:'vault/Rules/Recovery Probe.md'}]}));
    await page.goto(base);
    await page.waitForFunction(() => typeof window.SaerothSearch === 'object' && state.campaign.length > 0);
    await page.locator('#searchBtn').click();
    await page.getByRole('combobox', {name:'Search scope'}).selectOption('Rules');
    await page.locator('#searchInput').fill('recovery');
    await page.getByRole('button', {name:'Retry rules'}).click();
    await page.locator('#searchResults a').filter({hasText:'Recovery Probe'}).waitFor();
    assert.equal(attempts, 2, 'Failed rules requests are retryable');
    assert(await page.locator('.search-errors').isHidden());
    await context.close();
    assert.deepEqual(errors, []);
    console.log('PASS: accent/token search, keyboard navigation, mobile/themes, focus, lazy rules, shared requests, stale scope protection and retry.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
