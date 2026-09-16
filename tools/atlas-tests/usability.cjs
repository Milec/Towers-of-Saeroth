const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [375,780,1440])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width,height:width===780?390:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/')+'atlas/?integrated');
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await page.locator('.atlas-shortcuts').waitFor();
  await page.screenshot({path:path.join(__dirname,`../../_site/usability-home-${width}-${theme}.png`)});
  assert.equal(await page.locator('#journey').getAttribute('open'),null);
  assert(await page.evaluate(()=>!!(document.querySelector('#info').compareDocumentPosition(document.querySelector('#journey'))&Node.DOCUMENT_POSITION_FOLLOWING)));
  await page.locator('[data-open=journey]').click();assert(await page.locator('#journeyFrom').isVisible());
  await page.locator('#journeyFrom').fill('not-a-location');await page.locator('#journeyTo').fill('also-invalid');await page.locator('#journeyForm button[type=submit]').click();
  assert.equal(await page.locator('#journeyFrom').getAttribute('aria-invalid'),'true');
  assert(await page.locator('#journeyFrom').evaluate(e=>e===document.activeElement));
  await page.locator('[data-open=hexcrawl]').click();await page.locator('#hexEnabled').check();
  assert.equal(await page.locator('#hexQ').isVisible(),false);
  await page.locator('#hexTravelMode').selectOption('ride');assert.equal(await page.locator('#journeyMode').inputValue(),'ride');
  await page.locator('.hex-coordinates summary').click();await page.locator('#hexQ').fill('40');await page.locator('#hexR').fill('40');await page.locator('#hexSelect').click();await page.locator('#hexMove').click();
  await page.locator('#hexLocate').click();await page.waitForTimeout(200);
  const perf=await page.evaluate(async()=>{
   const trace=document.querySelector('#hexTrace').firstChild,grid=document.querySelector('#hexGrid').firstChild;
   const begin=performance.now();for(let i=0;i<30;i++)renderView();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   return {traceStable:trace===document.querySelector('#hexTrace').firstChild,gridStable:grid===document.querySelector('#hexGrid').firstChild,elapsed:performance.now()-begin};
  });assert(perf.traceStable&&perf.gridStable);console.log(width,theme,'30 no-op view updates (ms):',Math.round(perf.elapsed));
  await page.locator('#hexChoose').click();assert(await page.locator('.hex-map-prompt').isVisible());
  await page.locator('.hex-map-prompt button').click();assert.equal(await page.locator('.hex-map-prompt').isVisible(),false);
  await page.locator('[data-open=hexcrawl]').click();
  await page.screenshot({path:path.join(__dirname,`../../_site/usability-${width}-${theme}.png`)});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.close();
 }}finally{await browser.close();}
 console.log('Usability: shortcuts, disclosure, errors, travel modes, cancel, cached redraws and responsive layouts passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
