const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
async function choosePlace(page,name){
 await page.locator('[data-atlas-panel=places]').click();
 await page.locator('#search').fill(name);await page.locator('#search').press('ArrowDown');await page.locator('#search').press('Enter');
 await page.locator('#info h2').getByText(name,{exact:true}).waitFor();
}
async function openPlaceActions(page){
 const menu=page.locator('#atlasSelectionActions');
 await menu.locator('summary').click();
 assert.equal(await menu.evaluate(node=>node.open),true);
 return menu;
}
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
   // Route ink is in screen pixels; a phone's full-map view must not get desktop-weight roads.
   const routeWeight=await page.evaluate(()=>{box=[0,0,3840,2160];renderView();return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(parseFloat(getComputedStyle(document.querySelector('#roads .route')).strokeWidth)))));});
   if(width<500)assert(routeWeight<1,'Phone full-map roads must be thinner than desktop: '+routeWeight);else assert(routeWeight>=1.6,'Desktop full-map roads keep their weight: '+routeWeight);
   await active('places');assert(await page.locator('.atlas-shortcuts').isHidden());assert(await page.locator('.atlas-jumps').isHidden());
   assert(await page.locator('#atlasShowSelected').isDisabled(),'There is no selected place on first entry.');
   await page.locator('#atlasFindParty').click();await active('travel');
   assert(await page.locator('#atlasPartyGuidance').isVisible());assert.match(await page.locator('#atlasPartyGuidance').innerText(),/Mark party here/);
   await page.locator('#travelView > summary').click();await page.locator('[data-atlas-panel=places]').click();
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
   // Common location tasks stay available on the map; dismissal preserves a useful focus target.
   const menu=await openPlaceActions(page),summary=menu.locator('summary');
   assert.equal(await menu.locator('[data-place-action=routeEnd]').count(),1);
   assert.equal(await menu.locator('[data-place-action=partyHere]').count(),1);
   assert.equal(await menu.locator('[data-place-action=atlasGenerateBattlemap]').count(),0,'The retired battle map generator must not be offered.');
   const hitAreas=await menu.locator('button').evaluateAll(buttons=>buttons.filter(button=>!button.hidden).map(button=>button.getBoundingClientRect().toJSON()));
   assert(hitAreas.every(rect=>rect.height>=44&&rect.width>=44&&rect.left>=0&&rect.right<=width),'Place actions must fit the phone and keep touch-sized targets.');
   await page.keyboard.press('Escape');assert.equal(await menu.evaluate(node=>node.open),false);
   assert.equal(await summary.evaluate(node=>node===document.activeElement),true);
   await openPlaceActions(page);await page.locator('#zoomOut').click();assert.equal(await menu.evaluate(node=>node.open),false);
   assert.equal(await page.locator('#zoomOut').evaluate(node=>node===document.activeElement),true,'An outside click must keep focus on the action the user chose.');
   // A map selection can change independently of the menu, including to a place with no point actions.
   await openPlaceActions(page);
   await page.evaluate(()=>{const nation=records.find(record=>record.type==='nation'&&record.name==='Quivar');show(nation.type,nation.id);});
   await menu.waitFor({state:'hidden'});assert.equal(await menu.evaluate(node=>node.open),false);
   await choosePlace(page,'Valmont');
   await openPlaceActions(page);await menu.locator('[data-place-action=routeEnd]').click();
   await active('travel');assert((await page.locator('#journeyTo').inputValue()).includes('Valmont'));assert.equal(await page.locator('#journeyFrom').inputValue(),from);
   assert.equal(await menu.evaluate(node=>node.open),false);
   await openPlaceActions(page);await menu.locator('[data-place-action=partyHere]').click();
   assert.equal(await page.evaluate(()=>partyPlace.name),'Valmont');
   assert(await page.locator('#atlasSelectionFeedback').isVisible());assert.match(await page.locator('#atlasSelectionFeedback').innerText(),/party/i);
   assert.equal(await page.locator('#atlasPartyGuidance').count(),0);
   await page.locator('[data-atlas-panel=travel]').click();await page.locator('#travelView > summary').click();assert((await page.locator('#partyLocation').innerText()).includes('Valmont'));
   await page.locator('[data-atlas-panel=places]').click();await page.locator('#atlasNewPin').click();
   assert(await page.locator('#customPOIForm').isVisible());await page.locator('#customPOIName').fill('Tab test camp');
   await page.locator('#customPOIPlace').click();await page.locator('#map').press('Enter');await page.locator('#customPOIForm button[type=submit]').click();
   await page.locator('#info h2').getByText('Tab test camp',{exact:true}).waitFor();await active('places');
   await openPlaceActions(page);await menu.locator('[data-place-action=partyHere]').click();
   assert.equal(await page.evaluate(()=>partyPlace.name),'Tab test camp','The action must use the newly selected custom POI, not the previous place.');
   assert.equal(await menu.locator('[data-place-action=partyHere]').count(),1);
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
  // The embedded atlas has less vertical room than its standalone page in phone landscape.
  const landscape=await browser.newContext({viewport:{width:568,height:390},serviceWorkers:'block',reducedMotion:'reduce'});
  const landscapePage=await landscape.newPage();await landscapePage.goto(base+'#/atlas');
  await landscapePage.locator('.atlas-frame').waitFor();const atlas=landscapePage.locator('.atlas-frame').contentFrame();
  await atlas.locator('#atlasSelectionActions').waitFor({state:'attached'});
  await atlas.locator('#search').fill('Valmont');await atlas.locator('#search').press('ArrowDown');await atlas.locator('#search').press('Enter');
  await atlas.locator('#atlasSelectionActions > summary').click();await atlas.locator('[data-place-action=partyHere]').click();
  await atlas.locator('#atlasSelectionActions > summary').click();
  const compact=await atlas.locator('#atlasSelectionActions').evaluate(node=>({windowScroll:scrollY,actions:[...node.querySelectorAll('button')].filter(button=>!button.hidden).map(button=>{const r=button.getBoundingClientRect();return{id:button.dataset.placeAction,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===button,height:r.height};})}));
  assert.equal(compact.windowScroll,0,'Returning to the map must not scroll the outer iframe document and leave clipped controls.');
  assert(compact.actions.every(action=>action.hit&&action.height>=44),'Every action must remain hittable after party feedback in embedded phone landscape.');
  await landscape.close();
  console.log('PASS: atlas task panels, keyboard tabs, on-map place actions and dismissal, current-place route/party dispatch, layer persistence, add-pin flow, publication settings, and mobile return to map.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
