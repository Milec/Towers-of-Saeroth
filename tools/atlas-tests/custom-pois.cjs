const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#/atlas');let frame=page.frameLocator('.atlas-frame');
  await frame.locator('#customPOIPanel summary').click();await frame.locator('#customPOIAdd').click();
  await frame.locator('#customPOIName').fill('Future Ash Tower');await frame.locator('#customPOIKind').selectOption('tower');
  await frame.locator('#customPOINotes').fill('Encounter: <img src=x onerror=alert(1)>');
  await frame.locator('#customPOIPlace').click();await frame.locator('#map').press('Enter');
  await frame.locator('#customPOIForm button[type=submit]').click();await frame.locator('#info h2').filter({hasText:'Future Ash Tower'}).waitFor();
  await page.waitForFunction(()=>location.hash.includes('custompoi-'));
  let inner=page.frames().find(f=>f.url().includes('/atlas/'));
  const read=()=>inner.evaluate(()=>JSON.parse(localStorage.getItem('saeroth-custom-pois-v1')).pois);
  let saved=await read();assert.equal(saved.length,1);assert.equal(saved[0].kind,'tower');
  assert.equal(await frame.locator('#info img').count(),0);assert.equal(await inner.evaluate(()=>D.markers.length),468);
  await frame.locator('#customPOIEdit').click();await frame.locator('#customPOIName').fill('Raven Bandit Camp');await frame.locator('#customPOIKind').selectOption('camp');
  await frame.locator('#customPOIPlace').click();const svg=frame.locator('#map');const size=await svg.boundingBox();await svg.click({position:{x:size.width*.7,y:size.height*.65}});
  await frame.locator('#customPOIForm button[type=submit]').click();saved=await read();assert.equal(saved[0].kind,'camp');
  await page.reload();frame=page.frameLocator('.atlas-frame');await frame.locator('#info h2').filter({hasText:'Raven Bandit Camp'}).waitFor();inner=page.frames().find(f=>f.url().includes('/atlas/'));
  assert.deepEqual(await read(),saved);
  await frame.locator('#search').fill('Raven Bandit');await frame.locator('#results [data-type=custompoi]').click();
  await frame.locator('.layers > summary').click();await frame.locator('[data-layer=custompois]').uncheck();
  await inner.waitForFunction(()=>document.querySelector('#custompoilabels').hasAttribute('hidden')&&!document.querySelector('#custompoilabels').children.length);
  await frame.locator('[data-layer=custompois]').check();
  await frame.locator('#customPOIPanel summary').click();
  const downloadPromise=page.waitForEvent('download');await frame.locator('#customPOIExport').click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'Saeroth-custom-POIs.json');
  const filePath=await download.path();
  await frame.locator('#customPOIFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,pois:[{...saved[0],x:9000}]}))});
  await frame.locator('#customPOIStatus').getByText(/invalid/).waitFor();assert.deepEqual(await read(),saved);
  await frame.locator('#customPOIFile').setInputFiles(filePath);await frame.locator('#customPOIStatus').getByText(/existing IDs skipped/).waitFor();assert.equal((await read()).length,1);
  await frame.locator('#customPOIDelete').click();await frame.locator('#customPOIDeleteYes').click();assert.equal((await read()).length,0);
  await frame.locator('#customPOIFile').setInputFiles(filePath);await frame.locator('#customPOIStatus').getByText(/Imported 1/).waitFor();assert.deepEqual(await read(),saved);
  // A refused browser write must not appear to succeed or replace the in-memory list.
  await inner.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};});
  await frame.locator('#customPOIAdd').click();await frame.locator('#customPOIName').fill('Unsaved');await frame.locator('#customPOIPlace').click();await frame.locator('#map').press('Enter');await frame.locator('#customPOIForm button[type=submit]').click();
  await frame.locator('#customPOIStatus').getByText(/storage is full/).waitFor();assert.deepEqual(await read(),saved);
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: custom POI placement, edit/move, safe notes, search, reload, layer labels, export/import, validation, delete, and storage failure.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
