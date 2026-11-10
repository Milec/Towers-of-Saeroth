const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
const output=process.env.ATLAS_SCREENSHOT_DIR||path.join(__dirname,'../../_site/session-package-review');
const karoline='campaign/npcs/Karoline.md';
const john='campaign/npcs/John Guard.md';
const milo='campaign/nations/Thurion Merchant Alliance/npcs/Milo Calvetti.md';
const played='campaign/sessions/Session 4 Play - Waystation WLW.md';
const route=p=>'#/'+p.split('/').map(encodeURIComponent).join('/');
// Karoline supplies an illustrated lore note; John supplies a published actor.
const catalog={schema:1,actors:[{key:john,name:'John Guard',level:3},{key:milo,name:'Milo Calvetti',level:2}]};
const recipe={version:1,generatorVersion:1,source:{type:'poi',id:0},kind:'ruin',terrain:'mountain',size:24,time:'day',seed:'session-package-regression'};
const preset={schema:1,presets:[{id:'fixture-expedition',name:'Fixture expedition prep',description:'Test fixture only.',notes:[milo,played],actors:[milo],map:{version:1,name:'Fixture quarry',recipe}}]};
async function download(page,selector){
 const pending=page.waitForEvent('download');await page.locator(selector).click();const file=await pending;
 assert.equal(await file.failure(),null);return {data:JSON.parse(await fs.readFile(await file.path(),'utf8')),name:file.suggestedFilename()};
}
async function ready(page){await page.locator('#spExport').waitFor();await page.waitForFunction(()=>document.querySelectorAll('#spActorChoices input').length>0);}
async function fixtures(page){
 await page.route('**/session-actors.json',r=>r.fulfill({json:catalog}));
 await page.route('**/session-presets.json',r=>r.fulfill({json:preset}));
}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const format=await import(pathToFileURL(path.join(__dirname,'../../foundry-module/scripts/session-package.mjs')).href);
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  // An empty desk and unfinished personal checklist are valid journal-only packages.
  const optionalContext=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),optionalPage=await optionalContext.newPage();await fixtures(optionalPage);
  await optionalPage.goto(base+'#/workspace');await ready(optionalPage);
  assert.equal(await optionalPage.locator('#wsPrepOverview').evaluate(node=>node.open),false);
  assert.equal(await optionalPage.locator('#spNextAction').isVisible(),false);
  const empty=await download(optionalPage,'#spExport');assert.equal(empty.data.version,1);assert.equal(empty.data.journal.pages.length,1);assert.equal(empty.data.scene,null);assert.deepEqual(empty.data.actors,[]);
  await optionalPage.locator('#wsTaskInput').fill('Find a voice for the innkeeper');await optionalPage.locator('#wsTaskForm button').click();
  assert.equal(await optionalPage.locator('#spOverviewTasks').textContent(),'0 of 1 complete');
  assert.equal(await optionalPage.locator('#spNextAction').isVisible(),false,'An optional unchecked task must not look like an export blocker');
  const checklist=await download(optionalPage,'#spExport');assert(checklist.data.journal.pages[0].text.content.includes('Find a voice for the innkeeper'));assert.equal(checklist.data.scene,null);await optionalContext.close();
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await fixtures(page);
   await page.goto(base+route(karoline));await page.locator('.ws-note-actions [data-ws-action="board"]').click();
   await page.goto(base+'#/workspace');await ready(page);
   await page.locator('#wsTitle').fill('Session packet test');await page.locator('#wsNotes').fill('Keep this scratchpad.\n<script>noScript()</script>');
   await page.locator('#wsTaskInput').fill('Check expedition supplies');await page.locator('#wsTaskForm button').click();
   await page.locator('#spActorPicker > summary').click();await page.locator('#spActorSearch').fill('John Guard');await page.locator('#spActorChoices input').check();
   assert.match(await page.locator('#spSelectedActors').innerText(),/John Guard/);
   await page.goto(base+'#/atlas#poi-0');
   const atlas=await(await page.locator('.atlas-frame').elementHandle()).contentFrame();
   await atlas.locator('#atlasGenerateBattlemap').click();await atlas.waitForFunction(()=>document.getElementById('battlemapDialog').dataset.ready==='true');
   await atlas.locator('#battlemapSize').selectOption('24');await atlas.waitForFunction(()=>document.getElementById('battlemapDialog').dataset.ready==='true');
   await atlas.locator('#battlemapSession').click();
   assert.match(await atlas.locator('#battlemapStatus').innerText(),/Added to your session package/);
   await atlas.locator('#battlemapSessionLink').click();await ready(page);
   assert.match(await page.locator('#spMap').innerText(),/Pilgrim/);
   assert.match(await page.locator('#spSummary').innerText(),/2 journal pages · 1 scene · 1 NPC sheet/);
   assert.equal(await page.locator('#wsPrepOverview').evaluate(node=>node.open),false,'The preparation overview stays compact until requested');
   assert.equal(await page.locator('#spOverviewNotes').textContent(),'1 included + scratchpad');assert.equal(await page.locator('#spOverviewTasks').textContent(),'0 of 1 complete');
   assert.equal(await page.locator('#spOverviewActors').textContent(),'1 selected');assert.match(await page.locator('#spOverviewMap').textContent(),/Pilgrim/);
   await page.locator('#wsPrepOverview>summary').click();
   for(const theme of ['light','dark']){
    await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    await page.locator('#wsPrepOverview').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'prep-overview-'+width+'-'+theme+'.png')});
    assert(await page.locator('#wsPrepOverview [data-ws-action]').evaluateAll(buttons=>buttons.every(button=>{const r=button.getBoundingClientRect();return r.height>=44&&r.width>=44&&r.left>=0&&r.right<=innerWidth;})),'Overview shortcuts stay touch-sized and inside the viewport');
    await page.locator('#wsFoundryPackage').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'session-package-'+width+'-'+theme+'.png')});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
   const first=await download(page,'#spExport'),bundle=await format.validatePackage(first.data);
   assert.match(first.name,/-session\.json$/);assert.equal(bundle.name,'Session packet test');
   assert.equal(bundle.journal.pages.length,2);assert.equal(bundle.journal.ownership.default,0);
   assert(bundle.journal.pages[0].text.content.includes('&lt;script&gt;noScript()&lt;/script&gt;'));
   assert.deepEqual(bundle.actors,[{key:john,name:'John Guard'}]);
   assert(bundle.assets.length>=2);assert(bundle.assets.every(a=>['image/png','image/webp','image/jpeg'].includes(a.mime)));
   assert.match(bundle.scene.levels[0].background.src,/^asset:/);assert.equal(bundle.scene.width,2400);
   assert.equal(bundle.scene.active,false);assert.equal(bundle.scene.navigation,false);assert.equal(bundle.scene.tokens.length,0);
   assert(bundle.scene.walls.length>0);assert(bundle.journal.pages[1].text.content.includes('src="asset:'));
   assert(!/<img[^>]*src=["']https?:/i.test(bundle.journal.pages[1].text.content));
   assert(await page.locator('#spDownloads a').isVisible());
   if(width===1440){
    await fs.writeFile(path.join(output,'browser-session-package.json'),JSON.stringify(bundle));
    const second=await download(page,'#spExport');assert.equal(second.data.id,bundle.id,'Identical contents keep one identity across export times');
   }
   await page.reload();await ready(page);
   assert.match(await page.locator('#spMap').innerText(),/Pilgrim/);assert.match(await page.locator('#spSelectedActors').innerText(),/John Guard/);
   assert.equal(await page.locator('#spOverviewNotes').textContent(),'1 included + scratchpad');assert.equal(await page.locator('#spOverviewTasks').textContent(),'0 of 1 complete');assert.equal(await page.locator('#spOverviewActors').textContent(),'1 selected');
   await page.locator('#spPresets summary').click();assert.equal(await page.locator('[data-preset-map]').isChecked(),false,'Existing map must not be replaced by default');
   await page.locator('[data-add-preset]').click();
   await page.waitForFunction(()=>document.querySelector('#spSelectedActors')?.textContent.includes('Milo'));
   assert.equal(await page.locator('#wsTitle').inputValue(),'Session packet test');assert((await page.locator('#wsNotes').inputValue()).includes('Keep this scratchpad'));
   assert.equal(await page.locator('#wsTasks li').count(),1);assert.equal(await page.locator('#wsBoardList li').count(),3);
   assert.match(await page.locator('#spMap').innerText(),/Pilgrim/);
   await page.locator('[data-preset-map]').check();await page.locator('[data-add-preset]').click();
   await page.waitForFunction(()=>document.querySelector('#spMap')?.textContent.includes('Fixture quarry'));
   assert.equal(await page.locator('#wsBoardList li').count(),3,'Repeated preset adds no duplicate notes');
   await page.locator('#spRemoveMap').click();assert.match(await page.locator('#spSummary').innerText(),/No scene/);
   const notesOnly=await download(page,'#spExport');assert.equal(notesOnly.data.scene,null);assert.equal(notesOnly.data.actors.length,2);
   await page.locator('.ws-journal-only > summary').click();
   const legacy=await download(page,'[data-ws-action="foundry"]');assert.equal(legacy.data.pages.length,4,'Original journal export remains available');
   assert.deepEqual(errors,[]);await context.close();
  }
  // Failed or disallowed images produce an error, not a partial session download.
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();
  await fixtures(page);let unsafeRequests=0;
  await page.route('https://untrusted.example/**',r=>{unsafeRequests++;return r.abort();});
  await page.route('**/content/campaign/npcs/Karoline.md',r=>r.fulfill({contentType:'text/markdown',body:'---\ntitle: Karoline\ntype: npc\n---\n# Karoline\n<img src="https://untrusted.example/portrait.png">'}));
  // Open only the desk so the normal note reader never requests the deliberately unsafe image.
  await page.addInitScript(({pathname,key})=>localStorage.setItem('saeroth-workspace-v1:'+pathname,JSON.stringify({version:1,pins:[],recent:[],board:[key],tasks:[],title:'Unsafe art fixture',notes:'',libraryView:'cards',updatedAt:''})),{pathname:new URL(base).pathname,key:karoline});
  await page.goto(base+'#/workspace');await ready(page);let downloads=0;page.on('download',()=>downloads++);
  await page.locator('#spExport').click();await page.locator('#spStatus').filter({hasText:'outside the campaign artwork library'}).waitFor();
  assert.equal(downloads,0);assert.equal(unsafeRequests,0,'Exporter must not fetch untrusted artwork');
  await context.close();
  const timing=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),timingPage=await timing.newPage();await fixtures(timingPage);
  await timingPage.addInitScript(({pathname,key})=>localStorage.setItem('saeroth-workspace-v1:'+pathname,JSON.stringify({version:1,pins:[],recent:[],board:[key],tasks:[],title:'Captured session',notes:'Before export',libraryView:'cards',updatedAt:''})),{pathname:new URL(base).pathname,key:karoline});
  let mode='fail',release,entered;let held=new Promise(resolve=>{release=resolve;}),arrival=new Promise(resolve=>{entered=resolve;});
  await timingPage.route('**/content/campaign/npcs/*portrait.jpg',async r=>{
   if(mode==='fail'){await r.abort('failed');return;}
   if(mode==='hold'){entered();await held;}
   await r.continue().catch(()=>{});
  });
  await timingPage.goto(base+'#/workspace');await ready(timingPage);let timingDownloads=0;timingPage.on('download',()=>timingDownloads++);
  await timingPage.locator('#spExport').click();await timingPage.locator('#spStatus').filter({hasText:'Could not load artwork'}).waitFor();
  assert.equal(timingDownloads,0,'Failed artwork cannot yield a partial download');
  mode='hold';const pending=timingPage.waitForEvent('download');await timingPage.locator('#spExport').click();await arrival;
  await timingPage.locator('#wsTitle').fill('Edited while exporting');await timingPage.locator('#wsNotes').fill('Changed while artwork loads');
  await timingPage.locator('#wsTaskInput').fill('Added after export started');await timingPage.locator('#wsTaskForm button').click();
  assert.equal(await timingPage.locator('#spOverviewTasks').textContent(),'0 of 1 complete','Overview follows live edits while export keeps its captured draft');release();
  const captured=JSON.parse(await fs.readFile(await(await pending).path(),'utf8'));
  assert.equal(captured.name,'Captured session');assert(captured.journal.pages[0].text.content.includes('Before export'));assert(!captured.journal.pages[0].text.content.includes('Changed while'));
  assert(!captured.journal.pages[0].text.content.includes('Added after export started'));
  held=new Promise(resolve=>{release=resolve;});arrival=new Promise(resolve=>{entered=resolve;});
  await timingPage.locator('#spExport').click();await arrival;await timingPage.locator('#spCancel').click();release();
  await timingPage.locator('#spStatus').filter({hasText:'Export cancelled'}).waitFor();assert.equal(timingDownloads,1,'Cancelled export creates no download');assert.equal(await timingPage.locator('#spExport').isEnabled(),true);
  held=new Promise(resolve=>{release=resolve;});arrival=new Promise(resolve=>{entered=resolve;});
  await timingPage.locator('#spExport').click();await arrival;await timingPage.goto(base+'#/library');release();
  await timingPage.locator('#wsLibrarySearch').waitFor();assert.equal(timingDownloads,1,'Navigation cancels the pending export');
  await timing.close();
  // Catalog errors are actionable; a successful retry must expose a missing selected sheet.
  const missingContext=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),missingPage=await missingContext.newPage();let catalogFailed=true,retryRequests=0,releaseRetry,retryEntered;
  const retryGate=new Promise(resolve=>{releaseRetry=resolve;}),retryArrival=new Promise(resolve=>{retryEntered=resolve;});
  await missingPage.route('**/session-actors.json',async r=>{if(catalogFailed)return r.fulfill({status:503,body:'Unavailable'});retryRequests++;retryEntered();await retryGate;return r.fulfill({json:catalog});});
  await missingPage.addInitScript(pathname=>localStorage.setItem('saeroth-session-actors-v1:'+pathname,JSON.stringify({version:1,actors:[{key:'campaign/npcs/Retired fixture.md',name:'Retired fixture'}]})),new URL(base).pathname);
  await missingPage.goto(base+'#/workspace');await missingPage.locator('#spNextAction').filter({hasText:'Review the NPC list'}).waitFor();
  await missingPage.locator('#spNextAction').click();assert.equal(await missingPage.locator('#spActorPicker').evaluate(node=>node.open),true);assert(await missingPage.locator('#spCatalogRetry').evaluate(node=>node===document.activeElement));
  catalogFailed=false;await missingPage.locator('#spCatalogRetry').click();await retryArrival;assert(await missingPage.locator('#spCatalogRetry').isDisabled());await missingPage.locator('#spCatalogRetry').evaluate(node=>node.click());releaseRetry();await missingPage.locator('#spNextAction').filter({hasText:'Review selected NPCs'}).waitFor();assert.equal(retryRequests,1,'Repeated clicks during a pending catalog retry reuse the request');
  assert.match(await missingPage.locator('#spOverviewSummary').textContent(),/selected NPC is no longer listed/);assert.equal(await missingPage.locator('#spOverviewActors').textContent(),'Review Retired fixture');
  await missingPage.locator('#spNextAction').click();assert(await missingPage.locator('#spSelectedActors').evaluate(node=>node===document.activeElement));
  let missingDownloads=0;missingPage.on('download',()=>missingDownloads++);await missingPage.locator('#spExport').click();await missingPage.locator('#spStatus').filter({hasText:'no longer in the campaign NPC list'}).waitFor();assert.equal(missingDownloads,0);
  await missingPage.getByRole('button',{name:'Remove Retired fixture',exact:true}).click();assert.equal(await missingPage.locator('#spNextAction').isVisible(),false);assert.equal(await missingPage.locator('#spOverviewActors').textContent(),'0 selected');
  assert.equal((await download(missingPage,'#spExport')).data.scene,null);await missingContext.close();
  // Storage failure still permits a complete in-memory package.
  const limited=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),limitedPage=await limited.newPage();await fixtures(limitedPage);
  await limitedPage.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('saeroth-session-'))throw new DOMException('Quota','QuotaExceededError');return set.call(this,key,value);};});
  await limitedPage.goto(base+'#/workspace');await ready(limitedPage);
  await limitedPage.locator('#spActorPicker > summary').click();await limitedPage.locator('#spActorChoices input').first().check();
  assert.match(await limitedPage.locator('#spStorage').innerText(),/could not be saved/);
  await limitedPage.evaluate(value=>window.SaerothSessionExport.selectMap(value),{version:1,name:'Unsaved map',recipe});
  assert.match(await limitedPage.locator('#spStorage').innerText(),/available in this tab/);
  const ephemeral=await download(limitedPage,'#spExport');assert.equal(ephemeral.data.actors.length,1);assert(ephemeral.data.scene);await limited.close();
  // Invalid saved data is recoverable and cannot replace working selections.
  const corrupt=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),corruptPage=await corrupt.newPage();await fixtures(corruptPage);
  await corruptPage.addInitScript(pathname=>localStorage.setItem('saeroth-session-actors-v1:'+pathname,'{original broken selection'),new URL(base).pathname);
  await corruptPage.goto(base+'#/workspace');await ready(corruptPage);
  const recovered=await download(corruptPage,'#spRecovery');assert(recovered.data.selections.some(r=>r.data==='{original broken selection'));
  await corrupt.close();
  console.log('Session packages: overview and shortcuts, optional checklist-only export, NPC-list retry/recovery, notes + embedded artwork + map + NPC refs, stable identity, phone/desktop themes, preset merge, persistence/recovery, quota failure, untrusted assets, failed artwork/retry, live edits with captured export, cancellation, and legacy journal export pass.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
