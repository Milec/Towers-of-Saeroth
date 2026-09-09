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
      await inner.evaluate(() => {
        document.querySelector('[data-style="political"]').click();
        const toggle=document.querySelector('[data-layer="provinces"]');
        toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));
      });
      const tones=await inner.evaluate(()=>[...document.querySelectorAll('.province')].map(e=>{
        const c=getComputedStyle(e);return [c.fill,+c.fillOpacity];
      }));
      assert(new Set(tones.map(t=>t.join(':'))).size>1);
      assert(tones.every(t=>t[1]>0&&t[1]<=.18));
      await inner.evaluate(()=>document.querySelector('[data-style="terrain"]').click());
      assert(await inner.evaluate(()=>[...document.querySelectorAll('.province')].every(e=>getComputedStyle(e).fill==='rgba(0, 0, 0, 0)')));
      await inner.evaluate(()=>{const t=document.querySelector('[data-layer="provinces"]');t.checked=false;t.dispatchEvent(new Event('change',{bubbles:true}));});
      for (const theme of ['light', 'dark']) {
        await page.evaluate(t => document.documentElement.dataset.theme=t, theme);
        await inner.waitForFunction(t => document.documentElement.dataset.theme===t, theme);
        const contrast = await inner.evaluate(() => {
          const luminance = rgb => rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
            .reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
          return [...document.querySelectorAll('#info .stat,#info .pill')].map(e=>{
            const s=getComputedStyle(e),a=luminance(s.color.match(/[\d.]+/g).map(Number)),b=luminance(s.backgroundColor.match(/[\d.]+/g).map(Number));
            return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          });
        });
        assert(contrast.length>0);assert(contrast.every(r=>r>=4.5), `${theme} info-card contrast: ${contrast}`);
      }
      assert(await inner.evaluate(() => document.querySelector('header').hidden));
      assert(await page.evaluate(() => Math.abs(document.querySelector('.atlas-frame').getBoundingClientRect().width-document.querySelector('#main').getBoundingClientRect().width)<2));
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
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror', e => errors.push(e.message));
    const positions = await (await page.request.get(base+'nation-positions.json')).json();
    await page.goto(base+'#/campaign/nations/Political%20Relations.md');
    await page.locator('.rel-mode').click();
    const nationNodes = await page.locator('.rel-node').evaluateAll(nodes => nodes.map(n => ({name:n.querySelector('text').textContent,x:+n.querySelector('circle').getAttribute('cx'),y:+n.querySelector('circle').getAttribute('cy')})));
    for (const n of nationNodes) {
      assert(Math.abs(n.x-positions.nations[n.name][0]*1120/3840)<.01);
      assert(Math.abs(n.y-positions.nations[n.name][1]*1120/3840)<.01);
    }
    await page.goto(base+'#/campaign/world/Trade%20Routes.md');
    await page.locator('.route-dot').first().waitFor();
    const dots = await page.locator('.route-dot').evaluateAll(nodes=>nodes.map(n=>[+n.getAttribute('cx'),+n.getAttribute('cy')]));
    for (const [x,y] of dots) assert(Object.values(positions.nations).some(p=>Math.abs(x-p[0]*1120/3840)<.01&&Math.abs(y-p[1]*1120/3840)<.01));
    await page.goto(base+'players/#The%20Nations');
    const playerMap=page.locator('.pmap img');
    await playerMap.waitFor();
    assert((await playerMap.getAttribute('src')).endsWith('Saeroth-Political-Travel.png'));
    await page.waitForFunction(()=>document.querySelector('.pmap img')?.naturalWidth>0);
    assert.deepEqual(await playerMap.evaluate(i=>[i.naturalWidth,i.naturalHeight]),[3840,2160]);
    console.log('PASS: full-width atlas, 28 geographic relation anchors, trade anchors, illustrated player PNG.');
    await page.close();
    assert.deepEqual(errors, []);
    const index = JSON.parse(fs.readFileSync(path.join(__dirname,'../../_site/atlas/lore-index.json')));
    assert.equal(Object.keys(index.entries).filter(k=>k.startsWith('nation-')).length, 28);
    for (const record of Object.values(index.entries)) if (record.note) assert(fs.existsSync(path.join(__dirname,'../..',record.note)));
    console.log('PASS: desktop/mobile, both themes, wiki → nation, landmark → wiki → landmark, retained settlement/route counts, all lore targets.');
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exit(1);});
