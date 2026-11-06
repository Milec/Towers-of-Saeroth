const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/campaign-pois.json',route=>route.fulfill({json:{version:1,pois:[]}}));
   await page.goto(base+'atlas/?integrated');await page.waitForFunction(()=>window.AtlasPanels);
   const active=async name=>{
    assert.equal(await page.locator('.atlas-task-panel:visible').count(),1);
    assert.equal(await page.locator('[data-atlas-panel][aria-selected=true]').getAttribute('data-atlas-panel'),name);
    assert.equal(await page.locator('#atlasPanel-'+name).isVisible(),true);
   };
   await active('places');assert(await page.locator('.atlas-shortcuts').isHidden());assert(await page.locator('.atlas-jumps').isHidden());
   await page.locator('[data-atlas-panel=places]').focus();await page.keyboard.press('ArrowRight');await active('travel');
   assert(await page.locator('#journeyFrom').isVisible());
   await page.locator('#journeyFrom').fill('Thelemar');await page.locator('#journeyFrom').press('ArrowDown');await page.locator('#journeyFrom').press('Enter');
   const from=await page.locator('#journeyFrom').inputValue();
   await page.locator('[data-atlas-panel=map]').click();await active('map');assert(await page.locator('#search').isHidden());
   await page.locator('[data-layer=roads]').uncheck();
   await page.locator('[data-atlas-panel=saved]').click();await active('saved');assert(await page.locator('#atlasSavedTab').isVisible());
   await page.locator('[data-atlas-panel=travel]').click();await active('travel');assert.equal(await page.locator('#journeyFrom').inputValue(),from);
   await page.locator('[data-atlas-panel=map]').click();assert.equal(await page.locator('[data-layer=roads]').isChecked(),false);
   await page.locator('[data-atlas-panel=map]').focus();await page.keyboard.press('/');await active('places');assert(await page.locator('#search').evaluate(el=>el===document.activeElement));
   await page.locator('#search').fill('Valmont');await page.locator('#search').press('ArrowDown');await page.locator('#search').press('Enter');
   await page.locator('#atlasSelectionDetails').click();assert.equal(await page.locator('#info h2').innerText(),'Valmont');
   await page.locator('#routeEnd').click();await active('travel');assert((await page.locator('#journeyTo').inputValue()).includes('Valmont'));assert.equal(await page.locator('#journeyFrom').inputValue(),from);
   await page.locator('[data-atlas-panel=places]').click();await page.locator('#partyHere').click();
   await page.locator('[data-atlas-panel=travel]').click();await page.locator('#travelView > summary').click();assert((await page.locator('#partyLocation').innerText()).includes('Valmont'));
   await page.locator('[data-atlas-panel=places]').click();await page.locator('#atlasNewPin').click();
   assert(await page.locator('#customPOIForm').isVisible());await page.locator('#customPOIName').fill('Tab test camp');
   await page.locator('#customPOIPlace').click();await page.locator('#map').press('Enter');await page.locator('#customPOIForm button[type=submit]').click();
   await page.locator('#info h2').getByText('Tab test camp',{exact:true}).waitFor();await active('places');
   await page.locator('.atlas-publish-settings').click();await active('saved');assert(await page.locator('#poiSyncToken').isVisible());
   await page.locator('[data-atlas-panel=saved]').focus();await page.keyboard.press('Home');await active('places');await page.keyboard.press('End');await active('saved');
   if(width<801){
    await page.locator('#atlasReturnMap').click();
    const box=await page.locator('.mapframe').boundingBox();assert(box.y>=61&&box.y<70);assert(await page.locator('#map').evaluate(el=>el===document.activeElement));
   }
   for(const theme of ['light','dark']){
    await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert((await page.locator('.atlas-panel-tabs button').evaluateAll(buttons=>buttons.map(button=>button.getBoundingClientRect().height))).every(h=>h>=44));
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: one atlas task panel, keyboard tabs, hotkey search, route/party/layer persistence, add-pin flow, publication settings, and mobile return to map.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
