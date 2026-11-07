// Personal atlas workspace: keep data separate from published map records.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
const storageKey='saeroth-atlas-workbench-v1';
const fixture={id:987654321,name:'Café du Col',kind:'inn',notes:'A test location, never published.',x:734,y:1086};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce',acceptDownloads:true});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/campaign-pois.json',route=>route.fulfill({json:{version:1,pois:[fixture]}}));
   await page.goto(base+'atlas/?integrated#custompoi-'+fixture.id);
   await page.waitForFunction(()=>window.AtlasWorkspace&&window.ATLAS_CUSTOM_POIS?.has(987654321));
   await page.locator('#info h2').getByText(fixture.name).waitFor();
   assert(await page.evaluate(()=>box[2]<3840),'Published POI deep links should focus the place, not remain at world scale.');
   const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
   await page.locator('#search').fill('cafe du col');
   assert.equal(await page.locator('#results [data-type=custompoi]').count(),1);
   await page.locator('#search').press('ArrowDown');
   assert.equal(await page.locator('#search').getAttribute('aria-activedescendant'),'atlasResult-0');
   await page.locator('#search').press('Enter');
   assert.equal(await page.locator('#info h2').innerText(),fixture.name);
   assert.equal(await page.locator('.atlas-place-toolbar').count(),1);
   await page.locator('#atlasSavePlace').click();assert.equal(await page.locator('#atlasSavePlace').getAttribute('aria-pressed'),'true');
   assert.deepEqual((await read()).saved,['custompoi-'+fixture.id]);
   // A clipboard prompt can outlive the selected place. Its fallback belongs to the old card only.
   await page.evaluate(()=>{
    window.atlasClipboardDescriptor=Object.getOwnPropertyDescriptor(navigator.clipboard,'writeText');
    Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:()=>new Promise((resolve,reject)=>{window.rejectAtlasCopy=reject;})});
   });
   await page.locator('details.atlas-place-more > summary').click();await page.locator('#atlasCopyPlace').click();
   await page.locator('#search').fill('Valmont');await page.locator('#search').press('ArrowDown');await page.locator('#search').press('Enter');
   await page.locator('#info h2').getByText('Valmont',{exact:true}).waitFor();
   await page.evaluate(async()=>{
    window.rejectAtlasCopy(new DOMException('Permission denied','NotAllowedError'));await Promise.resolve();
    if(window.atlasClipboardDescriptor)Object.defineProperty(navigator.clipboard,'writeText',window.atlasClipboardDescriptor);else delete navigator.clipboard.writeText;
   });
   assert.equal(await page.locator('#atlasPlaceFeedback input').count(),0);
   assert.equal(await page.locator('#atlasPlaceFeedback').innerText(),'','A late clipboard result must not overwrite the newly selected place.');
   await page.locator('#search').fill(fixture.name);await page.locator('#search').press('ArrowDown');await page.locator('#search').press('Enter');
   await page.locator('#info h2').getByText(fixture.name,{exact:true}).waitFor();
   await page.locator('#partyHere').click();
   assert((await page.locator('#atlasPlaceFeedback').innerText()).includes('Party location updated'));
   await page.locator('#routeEnd').click();assert((await page.locator('#journeyTo').inputValue()).includes(fixture.name));
   await page.locator('#atlasFindParty').click();
   assert(await page.evaluate(()=>box[0]<734&&box[0]+box[2]>734));
   await page.locator('#atlasSelectionDetails').click();
   assert(await page.locator('#routeStart').isHidden(),'Secondary utilities should stay out of the primary place actions.');
   await page.locator('details.atlas-place-more > summary').click();
   await page.locator('#routeStart').click();assert((await page.locator('#journeyFrom').inputValue()).includes(fixture.name));
   await page.locator('#atlasSelectionDetails').click();
   await page.locator('#atlasFocusPlace').click();
   assert(await page.evaluate(()=>box[0]<734&&box[0]+box[2]>734));
   await page.locator('#atlasSelectionDetails').click();
   assert.equal(await page.locator('.atlas-place-toolbar').count(),1);
   assert.equal(await page.locator('#atlasSavePlace').getAttribute('aria-pressed'),'true');
   await page.locator('.atlas-nearby > summary').click();assert.equal(await page.locator('.atlas-nearby .result').count(),6);
   assert((await page.locator('.atlas-nearby').innerText()).includes('Straight-line distance'));
   await page.locator('[data-atlas-panel=saved]').click();await page.locator('#atlasViewsTab').click();
   await page.locator('#atlasViewName').fill('Northern expedition');await page.locator('#atlasViewForm button').click();
   const savedView=(await read()).views[0];assert.equal(savedView.name,'Northern expedition');
   await page.locator('#mapHome').click();
   await page.locator('[data-restore-view]').click();
   assert.deepEqual(await page.evaluate(()=>box),savedView.box);
   await page.reload();await page.waitForFunction(()=>window.AtlasWorkspace&&window.ATLAS_CUSTOM_POIS?.has(987654321));
   assert.deepEqual(await page.evaluate(()=>box),savedView.box,'Returning to lore must retain the saved camera.');
   assert.deepEqual((await read()).saved,['custompoi-'+fixture.id]);
   await page.locator('[data-atlas-panel=saved]').click();await page.locator('#atlasSavedTab').click();await page.locator('#atlasLibraryContent [data-type=custompoi]').click();
   assert.equal(await page.locator('#info h2').innerText(),fixture.name);
   await page.locator('[data-atlas-panel=saved]').click();await page.locator('#atlasRecentTab').click();assert((await page.locator('#atlasLibraryContent').innerText()).includes(fixture.name));
   await page.locator('#atlasRecentTab').press('ArrowRight');assert.equal(await page.locator('#atlasViewsTab').getAttribute('aria-selected'),'true');
   await page.locator('.atlas-backups > summary').click();
   const downloadEvent=page.waitForEvent('download');await page.locator('#atlasWorkspaceExport').click();const download=await downloadEvent;
   assert.equal(download.suggestedFilename(),'Saeroth-atlas-workspace.json');
   const before=await read();
   await page.locator('#atlasWorkspaceFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...before,views:[{...before.views[0],box:[0,0,0,0]}]}))});
   await page.locator('#atlasWorkspaceStatus').getByText(/invalid saved view/).waitFor();assert.deepEqual(await read(),before);
   const incoming={version:1,saved:['burg-862'],recent:[],views:[]};
   await page.locator('#atlasWorkspaceFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});
   await page.locator('#atlasWorkspaceStatus').getByText(/Workspace imported/).waitFor();assert.equal((await read()).saved.length,2);assert.equal((await read()).views.length,1);
   await page.locator('[data-atlas-panel=places]').click();await page.locator('#atlasSearchType').selectOption('nation');await page.locator('#search').fill('');assert.equal(await page.locator('#results [data-type=burg]').count(),0);assert(await page.locator('#results [data-type=nation]').count()>0);
   await page.locator('#search').press('Escape');assert.equal(await page.locator('#search').getAttribute('aria-expanded'),'false');
   await page.locator('#atlasSearchClear').click();await page.locator('#search').fill('frohn');assert(await page.locator('#results [data-type=burg]').count()>=2);
   await page.locator('#search').press('ArrowDown');await page.locator('#search').press('Enter');
   for(const theme of ['light','dark']){
    await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const tooSmall=await page.locator('.atlas-place-toolbar button:visible,.atlas-panel-tabs button:visible').evaluateAll(buttons=>buttons.filter(button=>button.getBoundingClientRect().height<44).map(button=>button.id));assert.deepEqual(tooSmall,[]);
    if(process.env.ATLAS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR,`workbench-${width}-${theme}.png`)});
   }
   const persistent=await read();
   await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='saeroth-atlas-workbench-v1')throw new DOMException('full','QuotaExceededError');return set.call(this,key,value);};});
   await page.locator('#atlasSavePlace').click();assert.deepEqual(await read(),persistent);
   assert((await page.locator('#atlasPanelStatus').innerText()).includes('could not be saved'));
   assert.deepEqual(errors,[]);await context.close();
  }
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await page.addInitScript(key=>localStorage.setItem(key,'corrupt-original-data'),storageKey);
  await page.goto(base+'atlas/?integrated');await page.waitForFunction(()=>window.AtlasWorkspace);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),'corrupt-original-data');
  await page.locator('[data-atlas-panel=saved]').click();
  await page.locator('#atlasWorkspaceFile').setInputFiles({name:'recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,saved:[],recent:[],views:[]}))});
  await page.locator('#atlasWorkspaceStatus').getByText(/Workspace imported/).waitFor();
  assert.equal(await page.evaluate(key=>localStorage.getItem(key+'-recovery'),storageKey),'corrupt-original-data');await context.close();
  console.log('PASS: atlas ranked search, keyboard selection, secondary place tools, late clipboard isolation, saved/recent places, nearby distances, route/party integration, saved views, persistence, backup validation, corrupt-data recovery, storage failure and responsive themes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
