const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  for(const mobile of [false,true])for(const dark of [false,true]){
   const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},colorScheme:dark?'dark':'light'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto((process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/')+'atlas/');
   await page.evaluate(dark=>{document.documentElement.classList.add('integrated');document.documentElement.dataset.theme=dark?'dark':'light';},dark);
   await page.locator('#hexcrawl > summary').click();await page.locator('#hexEnabled').check();
   await page.locator('.hex-coordinates summary').click();
   await page.locator('#hexQ').fill('40');await page.locator('#hexR').fill('40');await page.locator('#hexSelect').click();
   await page.locator('#hexMove').click();assert.match(await page.locator('#hexProgress').innerText(),/0 steps/);
   assert(await page.locator('#hexSize').isDisabled());
   await page.locator('#hexQ').fill('42');await page.locator('#hexSelect').click();assert(await page.locator('#hexMove').isDisabled());
   await page.locator('#hexQ').fill('41');await page.locator('#hexSelect').click();await page.locator('#hexMove').click();
   assert.match(await page.locator('#hexProgress').innerText(),/1 steps · 24 km · 1.0 travel days/);
   await page.locator('#hexLocate').click();await page.waitForTimeout(200);
   assert(await page.locator('.hex-cell').count()>0);
   assert(await page.locator('.hex-cell').count()<5000);
   await page.screenshot({path:path.join(__dirname,`../../_site/hexcrawl-${mobile?'phone':'desktop'}-${dark?'dark':'light'}.png`)});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.reload();await page.locator('#hexcrawl > summary').click();await page.locator('#hexEnabled').check();
   assert.match(await page.locator('#hexProgress').innerText(),/1 steps/);
   await page.locator('#hexUndo').click();assert.match(await page.locator('#hexProgress').innerText(),/0 steps/);
   await page.locator('#hexChoose').click();await page.locator('#map').press('Escape');assert.equal(await page.locator('#hexChoose').innerText(),'Choose hex on map');
   await page.locator('#hexChoose').click();await page.locator('#map').press('Enter');assert.match(await page.locator('#hexSelection').innerText(),/Selected hex/);
   await page.locator('#hexChoose').click();await page.locator('#map').click({position:{x:100,y:100}});assert.equal(await page.locator('#hexChoose').innerText(),'Choose hex on map');
   const math=await page.evaluate(()=>{const h={q:40,r:40},a=AtlasHexcrawl;return [a.hexAt(...a.center(h,24),24),a.distance(h,{q:41,r:39})];});
   assert.deepEqual(math,[{q:40,r:40},1]);
   await page.locator('#hexEnabled').uncheck();assert.equal(await page.locator('#hexOverlay').isVisible(),false);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Hexcrawl desktop/phone light/dark: moves, bounds, grid, persistence, undo and keyboard passed.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
