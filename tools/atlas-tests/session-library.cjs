const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const engine=require('../../site/atlas/battlemap-engine.js'),adapter=require('../../site/atlas/battlemap-foundry.js');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
const output=process.env.ATLAS_SCREENSHOT_DIR||path.join(__dirname,'../../../output/session-library-review');
const pathname=new URL(base).pathname;
const john='campaign/npcs/John Guard.md',karoline='campaign/npcs/Karoline.md';
const prefixes=['saeroth-workspace-v1:','saeroth-session-actors-v1:','saeroth-session-map-v1:','saeroth-encounter-v1:'];
const map={version:1,name:'Frost Pass camp',recipe:{version:1,generatorVersion:1,source:{type:'poi',id:0},kind:'camp',terrain:'snow',size:24,time:'night',seed:'session-library-browser'}};
const opponent={id:'veteran',name:'Orc Veteran',level:1,count:2,width:1,height:1,source:{type:'compendium',uuid:'Compendium.pf2e.pathfinder-monster-core.Actor.'+'b'.repeat(16)}};
const catalog={schema:1,system:{id:'pf2e',version:'8.5.0'},creatures:[{...opponent,traits:[]}]};
const initialTitle='Session 6 — Frost Pass';
async function fixtures(page){
 await page.route('**/session-actors.json',r=>r.fulfill({json:{schema:1,actors:[{key:john,name:'John Guard',level:3,width:1,height:1,source:{type:'campaign',key:john}}]}}));
 await page.route('**/encounter-creatures.json',r=>r.fulfill({json:catalog}));
 await page.route('**/session-presets.json',r=>r.fulfill({json:{schema:1,presets:[]}}));
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#slControls')&&!document.querySelector('#slControls').disabled&&!document.querySelector('#epControls').disabled);}
async function idle(page){await page.waitForFunction(()=>document.querySelector('#wsSessionLibrary')?.getAttribute('aria-busy')==='false');}
async function current(page){return page.evaluate(()=>window.SaerothSessionPrep.capture());}
async function stored(page){return page.evaluate(async pathname=>{
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('saeroth-session-library-v1:'+pathname,1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('library','readonly'),request=tx.objectStore('library').get('current');let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}
},pathname);}
function card(page,title){return page.locator('#slList article').filter({has:page.getByRole('heading',{name:title,exact:true})});}
async function status(page,pattern){await idle(page);assert.match(await page.locator('#slStatus').innerText(),pattern);}
async function downloaded(page,action,{raw=false}={}){const wait=page.waitForEvent('download');await action();const file=await wait;assert.equal(await file.failure(),null);const value=await fs.readFile(await file.path(),'utf8');return raw?value:JSON.parse(value);}
async function importFile(page,value,name='editable.json'){await page.locator('#slImportFile').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await idle(page);}
async function rawStores(page){return page.evaluate(({pathname,prefixes})=>Object.fromEntries(prefixes.map(prefix=>[prefix,localStorage.getItem(prefix+pathname)])),{pathname,prefixes});}
async function openShelf(page){await page.locator('#slShelf').evaluate(node=>node.open=true);}

(async()=>{
 await fs.mkdir(output,{recursive:true});
 const math=await import(pathToFileURL(path.join(__dirname,'../../foundry-module/scripts/encounter-plan.mjs')));
 const {createSessionModel}=await import(pathToFileURL(path.join(__dirname,'../../site/session-library-model.mjs')));
 const sceneForMap=value=>adapter.scene(engine.generate({...value.recipe,name:value.name}),{backgroundPath:'asset:test',time:value.recipe.time});
 const model=createSessionModel({normalizeEncounter:math.normalizeEncounter,sceneForMap});
 const encounter={name:'Roadside rivals',partyLevel:2,partySize:5,target:'moderate',roster:[opponent],placements:[]};
 const scene=sceneForMap(map);let placement;
 for(let row=0;row<24&&!placement;row++)for(let column=0;column<24&&!placement;column++)try{const candidate={entryId:opponent.id,instance:0,x:column*100,y:row*100};math.normalizeEncounter({...encounter,placements:[candidate]},scene,{allowPartialPlacements:true});placement=candidate;}catch(_){}
 assert(placement,'Fixture must have a geometrically valid partial token placement');
 const seed=model.normalizeSnapshot({version:1,desk:{title:initialTitle,notes:'Ask about the missing survey stores.\nNo fixed outcome.',tasks:[{id:'lighting',text:'Review night lighting',done:true}],board:[john,karoline]},actors:[{key:john,name:'John Guard'}],map,encounter:{encounter:{...encounter,placements:[placement]},staging:true,mapSignature:JSON.stringify(map)}});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await fixtures(page);
  await page.addInitScript(({seed,pathname,john,karoline})=>{
   const sentinel='session-library-test-seeded';if(localStorage.getItem(sentinel))return;localStorage.setItem(sentinel,'yes');
   localStorage.setItem('saeroth-workspace-v1:'+pathname,JSON.stringify({version:1,...seed.desk,pins:[john],recent:[karoline],libraryView:'list',updatedAt:''}));
   localStorage.setItem('saeroth-session-actors-v1:'+pathname,JSON.stringify({version:1,actors:seed.actors}));
   localStorage.setItem('saeroth-session-map-v1:'+pathname,JSON.stringify(seed.map));
   localStorage.setItem('saeroth-encounter-v1:'+pathname,JSON.stringify({format:'saeroth-encounter-draft',version:1,...seed.encounter}));
  },{seed,pathname,john,karoline});
  await page.goto(base+'#/workspace');await ready(page);await openShelf(page);
  assert.deepEqual(await current(page),seed);let library=await stored(page);assert.equal(library.records.length,1,'Existing working prep migrates without clearing it');
  assert.deepEqual(library.records[0].snapshot,seed);const originalId=library.records[0].id;
  await page.locator('#slSave').click();await status(page,/identical/i);assert.equal((await stored(page)).records.length,1);

  // New session checkpoints every old selection, including unfinished placements.
  await page.locator('#wsNotes').fill('The party changed its route; preserve this working revision.');const revised=await current(page);
  await page.locator('#slNew').click();assert.equal(await page.locator('#slName').evaluate(node=>node===document.activeElement),true);
  await page.locator('#slName').fill('Session 7 — The hidden trail');await page.locator('#slNameForm button[type=submit]').click();await status(page,/Created/);
  const blank=await current(page);assert.equal(blank.desk.title,'Session 7 — The hidden trail');assert.deepEqual(blank.actors,[]);assert.equal(blank.map,null);assert.equal(blank.encounter.encounter.roster.length,0);assert.deepEqual(blank.desk.board,[]);assert.equal(blank.desk.notes,'');
  library=await stored(page);assert(library.records.some(record=>model.sameContent(record.snapshot,revised)),'The complete previous working revision is saved before clearing');
  let global=JSON.parse((await rawStores(page))['saeroth-workspace-v1:']);assert.deepEqual(global.pins,[john]);assert.deepEqual(global.recent,[karoline]);assert.equal(global.libraryView,'list');
  await page.locator('#slSave').click();await status(page,/Saved/);
  await page.locator('[data-sl-record="'+originalId+'"] [data-sl-action=open]').click();await status(page,/Opened/);assert.deepEqual(await current(page),seed);
  global=JSON.parse((await rawStores(page))['saeroth-workspace-v1:']);assert.deepEqual(global.pins,[john]);assert.deepEqual(global.recent,[karoline]);
  await page.reload();await ready(page);await openShelf(page);assert.deepEqual(await current(page),seed);assert.equal((await stored(page)).records.length,3);

  // Duplicate and archive are library operations; they do not alter the current working session.
  await page.locator('[data-sl-record="'+originalId+'"] [data-sl-action=duplicate]').click();await page.locator('#slName').fill('Session 6 — Alternate approach');await page.locator('#slNameForm button[type=submit]').click();await status(page,/separate copy/);
  assert.deepEqual(await current(page),seed);assert.equal((await stored(page)).records.length,4);
  await page.locator('[data-sl-record="'+originalId+'"] [data-sl-action=archive]').click();await status(page,/Archived/);assert.equal(await page.locator('[data-sl-record="'+originalId+'"]').count(),0);
  await page.locator('#slArchived').check();assert.equal(await page.locator('[data-sl-record="'+originalId+'"]').count(),1);assert.equal(await page.locator('#slArchived').evaluate(node=>node===document.activeElement),true);
  await page.locator('[data-sl-record="'+originalId+'"] [data-sl-action=archive]').click();await status(page,/Restored/);await page.locator('#slArchived').uncheck();
  const backup=await downloaded(page,()=>page.locator('[data-sl-record="'+originalId+'"] [data-sl-action=download]').click());await idle(page);
  assert.equal(backup.format,'saeroth-saved-sessions');assert.deepEqual(backup.records[0].snapshot,seed);
  await fs.writeFile(path.join(output,'complete-editable-session.json'),JSON.stringify(backup,null,2));
  // Portable prep remains easy to reach without exposing all backup tools upfront.
  assert.equal(await page.locator('#slTransfer').evaluate(node=>node.open),false);
  await page.locator('#slTransfer > summary').click();
  const workingBackup=await downloaded(page,()=>page.locator('#slCurrentBackup').click());await idle(page);
  assert.deepEqual(workingBackup.records[0].snapshot,seed);
  await importFile(page,backup);await page.locator('#slConfirmImport').waitFor();
  await page.locator('#slTransfer > summary').click();await page.locator('#slCancelImport').click();
  assert.equal(await page.locator('#slTransfer > summary').evaluate(node=>node===document.activeElement),true);
  assert.deepEqual(await current(page),seed);

  // A foreign backup cannot update a matching local ID, and imported markup stays text.
  const imported=structuredClone(backup);imported.records[0].snapshot.desk.title='<img src=x onerror="window.sessionInjected=true">';imported.records[0].snapshot.desk.notes='A separate imported preparation.';
  await importFile(page,imported);await page.locator('#slConfirmImport').waitFor();assert.equal(await page.locator('#slImportPreview img').count(),0);
  await page.locator('#slConfirmImport').click();await status(page,/Added 1 saved session/);library=await stored(page);assert.equal(library.records.length,5);
  assert.deepEqual(library.records.find(record=>record.id===originalId).snapshot,seed);assert(library.records.some(record=>record.id!==originalId&&record.snapshot.desk.title===imported.records[0].snapshot.desk.title));assert.equal(await page.evaluate(()=>window.sessionInjected),undefined);assert.equal(await page.locator('#slList img').count(),0);assert.deepEqual(await current(page),seed);
  await importFile(page,imported);await page.locator('#slConfirmImport').click();await status(page,/identical/);assert.equal((await stored(page)).records.length,5);
  const libraryBeforeInvalid=await stored(page),workingBeforeInvalid=await rawStores(page);
  for(const invalid of [(()=>{const value=structuredClone(backup);value.records[0].snapshot.map.recipe.size=33;return value;})(),(()=>{const value=structuredClone(backup);value.records[0].snapshot.encounter.encounter.placements[0].x=999999;return value;})(),{format:'saeroth-session-package',version:2}]){
   await importFile(page,invalid);await status(page,/invalid|outside|map|Choose|backup/i);assert.equal(await page.locator('#slImportPreview').isVisible(),false);assert.deepEqual(await stored(page),libraryBeforeInvalid);assert.deepEqual(await rawStores(page),workingBeforeInvalid);
  }

  // Failed IndexedDB writes leave both saved versions and the working prep intact.
  await page.locator('#wsNotes').fill('This unsaved version must survive a database failure.');const unsaved=await current(page),beforeFailure=await stored(page);
  await page.evaluate(()=>{window.originalSessionPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='library')throw new DOMException('Test quota','QuotaExceededError');return window.originalSessionPut.apply(this,args);};});
  await page.locator('#slSave').click();await status(page,/could not be saved|unchanged|quota/i);assert.deepEqual(await current(page),unsaved);assert.deepEqual(await stored(page),beforeFailure);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalSessionPut;delete window.originalSessionPut;});

  // A mid-switch localStorage failure rolls every singleton store back, not just the notes.
  const originals=await rawStores(page);
  await page.evaluate(()=>{const original=Storage.prototype.setItem;let failed=false;Storage.prototype.setItem=function(key,value){if(!failed&&key.startsWith('saeroth-session-map-v1:')){failed=true;throw new DOMException('Test interrupted write','QuotaExceededError');}return original.call(this,key,value);};window.restoreSessionSetItem=()=>Storage.prototype.setItem=original;});
  await page.locator('[data-sl-record="'+originalId+'"] [data-sl-action=open]').click();await status(page,/could not switch|kept/);await page.evaluate(()=>window.restoreSessionSetItem());
  assert.deepEqual(await current(page),unsaved);assert.deepEqual(await rawStores(page),originals);assert.equal(await page.evaluate(pathname=>localStorage.getItem('saeroth-session-switch-v1:'+pathname),pathname),null);assert((await stored(page)).records.some(record=>model.sameContent(record.snapshot,unsaved)));

  // Edits arriving during an awaited apply are retained, even after the caller captured an earlier state.
  await page.evaluate(async target=>{
   const expected=await window.SaerothSessionPrep.capture(),original=window.SaerothEncounterPlanner.capture;
   window.SaerothEncounterPlanner.capture=()=>new Promise(resolve=>{window.releaseSessionApply=()=>original().then(resolve);});
   window.pendingSessionApply=window.SaerothSessionPrep.apply(target,{expectedCurrent:expected}).then(()=>({success:true}),error=>({error:error.message}));
   window.restoreSessionCapture=()=>window.SaerothEncounterPlanner.capture=original;
  },blank);
  await page.waitForFunction(()=>typeof window.releaseSessionApply==='function');await page.locator('#wsNotes').fill('An edit made while another session was opening.');await page.evaluate(()=>window.releaseSessionApply());
  const race=await page.evaluate(()=>window.pendingSessionApply);assert.match(race.error,/changed while/);await page.evaluate(()=>window.restoreSessionCapture());assert.equal((await current(page)).desk.notes,'An edit made while another session was opening.');

  // Navigating away while a switch awaits validation cancels its eventual mutation.
  const beforeNavigation=await current(page);
  await page.evaluate(()=>{const original=window.SaerothEncounterPlanner.capture;let calls=0;window.SaerothEncounterPlanner.capture=function(){calls++;if(calls===3)return new Promise(resolve=>{window.releaseNavigationSwitch=()=>original().then(resolve);});return original();};window.restoreNavigationCapture=()=>window.SaerothEncounterPlanner.capture=original;});
  await page.locator('[data-sl-record="'+originalId+'"] [data-sl-action=open]').click();
  await page.waitForFunction(()=>typeof window.releaseNavigationSwitch==='function');await page.goto(base+'#/library');await page.locator('#wsLibrarySearch').waitFor();await page.evaluate(()=>window.releaseNavigationSwitch());
  await page.evaluate(()=>window.restoreNavigationCapture());await page.goto(base+'#/workspace');await ready(page);await openShelf(page);assert.deepEqual(await current(page),beforeNavigation);

  // Startup repairs a journaled interrupted switch before any component reads its partial values.
  const beforeCrash=await current(page),beforeCrashRaw=await rawStores(page);
  await page.evaluate(({pathname,prefixes,originals})=>{
   const entries=prefixes.map(prefix=>[prefix+pathname,originals[prefix]]);localStorage.setItem('saeroth-session-switch-v1:'+pathname,JSON.stringify({format:'saeroth-session-switch',version:1,entries}));
   const damaged=JSON.parse(originals['saeroth-workspace-v1:']);damaged.title='Half-written switch';localStorage.setItem('saeroth-workspace-v1:'+pathname,JSON.stringify(damaged));localStorage.removeItem('saeroth-session-map-v1:'+pathname);
  },{pathname,prefixes,originals:beforeCrashRaw});
  await page.reload();await ready(page);await openShelf(page);assert.deepEqual(await current(page),beforeCrash);assert.deepEqual(await rawStores(page),beforeCrashRaw);

  // Responsive and keyboard review uses real controls in each color scheme.
  for(const width of [1440,390])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.locator('#wsSessionLibrary').scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(output,'saved-sessions-'+width+'-'+theme+'.png')});
   const heights=await page.locator('#wsSessionLibrary button:visible').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));assert(heights.every(height=>height>=43.9),'Session buttons must retain 44px touch height');
  }
  await page.locator('#slNew').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#slName').evaluate(node=>node===document.activeElement),true);await page.locator('#slCancelForm').click();
  assert.notEqual(await page.evaluate(()=>document.activeElement.tagName),'BODY','Closing an inline form must restore keyboard focus');
  assert.deepEqual(errors,[]);await context.close();

  // An unreadable stored library is not replaced by a new empty library on startup.
  const recoveryContext=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),recoveryPage=await recoveryContext.newPage();await fixtures(recoveryPage);await recoveryPage.goto(base+'#/workspace');await ready(recoveryPage);
  const corrupt={version:99,revision:14,records:[{privateDraft:'Recover this exact original'}]};
  await recoveryPage.evaluate(async({pathname,corrupt})=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('saeroth-session-library-v1:'+pathname,1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{await new Promise((resolve,reject)=>{const tx=db.transaction('library','readwrite');tx.objectStore('library').put(corrupt,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}},{pathname,corrupt});
  await recoveryPage.reload();await recoveryPage.locator('#slRecovery').waitFor();assert.match(await recoveryPage.locator('#slLibraryError').innerText(),/could not be read|original data/i);assert.equal(await recoveryPage.locator('#slSave').isDisabled(),true);assert.deepEqual(await stored(recoveryPage),corrupt);
  assert.deepEqual(await downloaded(recoveryPage,()=>recoveryPage.locator('#slRecovery').click()),corrupt);const portable=await downloaded(recoveryPage,()=>recoveryPage.locator('#slCurrentBackup').click());assert.equal(portable.format,'saeroth-saved-sessions');assert.deepEqual(await stored(recoveryPage),corrupt);await recoveryContext.close();

  // A background tab must never persist its older encounter over another tab's full switch.
  const tabsContext=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),tabA=await tabsContext.newPage();await fixtures(tabA);await tabA.goto(base+'#/workspace');await ready(tabA);
  await tabA.evaluate(async seed=>window.SaerothSessionPrep.apply(seed,{expectedCurrent:await window.SaerothSessionPrep.capture()}),seed);await tabA.locator('#slSave').click();await status(tabA,/Saved/);
  const tabB=await tabsContext.newPage();await fixtures(tabB);await tabB.goto(base+'#/workspace');await ready(tabB);assert.deepEqual(await current(tabB),seed);
  await tabA.locator('#slNew').click();await tabA.locator('#slName').fill('Other tab next session');await tabA.locator('#slNameForm button[type=submit]').click();await status(tabA,/Created/);const otherTabSession=await current(tabA);
  await tabB.waitForFunction(()=>document.querySelector('#slSwitchError')&&!document.querySelector('#slSwitchError').hidden);await tabB.waitForTimeout(75);
  assert.deepEqual(await current(tabB),seed,'The background tab preserves its entire in-memory preparation');
  const expectedStored=await rawStores(tabA);assert.equal(JSON.parse(expectedStored['saeroth-encounter-v1:']).encounter.roster.length,0,'Background map events cannot write their stale roster');
  await tabB.locator('#wsNotes').fill('Keep this tab separately.');assert.deepEqual(await rawStores(tabA),expectedStored,'The conflicted tab cannot overwrite newer singleton stores');assert.deepEqual(await current(tabA),otherTabSession);
  const preserved=await downloaded(tabB,()=>tabB.locator('#slCurrentBackup').click());assert.equal(preserved.records[0].snapshot.desk.notes,'Keep this tab separately.');assert.deepEqual(preserved.records[0].snapshot.map,seed.map);assert.equal(preserved.records[0].snapshot.encounter.encounter.placements.length,1);await tabsContext.close();

  // Unreadable transaction records are downloadable and block overwriting the originals.
  const interruptedContext=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),interruptedPage=await interruptedContext.newPage();await fixtures(interruptedPage);
  const invalidTransaction=JSON.stringify({format:'saeroth-session-switch',version:1,entries:[['unrelated-key','must never be written']]});
  await interruptedPage.addInitScript(({pathname,invalidTransaction})=>localStorage.setItem('saeroth-session-switch-v1:'+pathname,invalidTransaction),{pathname,invalidTransaction});
  await interruptedPage.goto(base+'#/workspace');await ready(interruptedPage);await interruptedPage.locator('#slSwitchRecovery').waitFor();
  assert.match(await interruptedPage.locator('#slSwitchError').innerText(),/could not be recovered|original recovery/i);
  assert.equal(await downloaded(interruptedPage,()=>interruptedPage.locator('#slSwitchRecovery').click(),{raw:true}),invalidTransaction);
  const untouched=await rawStores(interruptedPage);await interruptedPage.locator('#wsNotes').fill('Keep the new note in this tab for export.');assert.deepEqual(await rawStores(interruptedPage),untouched);
  const safeCopy=await downloaded(interruptedPage,()=>interruptedPage.locator('#slCurrentBackup').click());assert.equal(safeCopy.records[0].snapshot.desk.notes,'Keep the new note in this tab for export.');
  assert.equal(await interruptedPage.evaluate(pathname=>localStorage.getItem('saeroth-session-switch-v1:'+pathname),pathname),invalidTransaction);assert.equal(await interruptedPage.evaluate(()=>localStorage.getItem('unrelated-key')),null);await interruptedContext.close();

  // Startup recovery waits for a live switch's shared lock rather than rolling it back.
  const lockingContext=await browser.newContext({serviceWorkers:'block'}),lockOwner=await lockingContext.newPage();await fixtures(lockOwner);await lockOwner.goto(base+'#/workspace');await ready(lockOwner);
  await lockOwner.evaluate(async seed=>window.SaerothSessionPrep.apply(seed,{expectedCurrent:await window.SaerothSessionPrep.capture()}),seed);
  await lockOwner.evaluate(({pathname,prefixes})=>{
   const key='saeroth-session-switch-v1:'+pathname;
   window.liveSessionSwitch=navigator.locks.request(key,async()=>{
    const entries=prefixes.map(prefix=>[prefix+pathname,localStorage.getItem(prefix+pathname)]);localStorage.setItem(key,JSON.stringify({format:'saeroth-session-switch',version:1,entries}));
    const updated=JSON.parse(entries[0][1]);updated.title='A live switch is completing';localStorage.setItem(entries[0][0],JSON.stringify(updated));
    window.sessionLockHeld=true;await new Promise(resolve=>window.releaseSessionLock=resolve);localStorage.removeItem(key);
   });
  },{pathname,prefixes});await lockOwner.waitForFunction(()=>window.sessionLockHeld);
  const waitingTab=await lockingContext.newPage();await fixtures(waitingTab);await waitingTab.goto(base+'#/workspace');
  await waitingTab.waitForFunction(async key=>(await navigator.locks.query()).pending.some(lock=>lock.name===key),'saeroth-session-switch-v1:'+pathname);
  assert.equal(JSON.parse((await rawStores(lockOwner))['saeroth-workspace-v1:']).title,'A live switch is completing');assert.notEqual(await lockOwner.evaluate(pathname=>localStorage.getItem('saeroth-session-switch-v1:'+pathname),pathname),null);
  assert.equal(await waitingTab.locator('#wsTitle').count(),0,'The second tab must not mount a mixed working preparation while the switch is live');
  await lockOwner.evaluate(async()=>{window.releaseSessionLock();await window.liveSessionSwitch;});await ready(waitingTab);assert.equal((await current(waitingTab)).desk.title,'A live switch is completing','Startup must load the completed switch, not roll back a transaction that was still live');await lockingContext.close();
  console.log('Saved-session browser checks passed: complete snapshots, safe switching, portability, recovery, and responsive keyboard controls.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
