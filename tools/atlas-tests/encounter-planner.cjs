const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
const output=process.env.ATLAS_SCREENSHOT_DIR||path.join(__dirname,'../../_site/encounter-planner-review');
const john='campaign/npcs/John Guard.md';
const source=id=>({type:'compendium',uuid:'Compendium.pf2e.pathfinder-monster-core.Actor.'+id.repeat(16)});
const commander={id:'commander',name:'Orc Commander',level:2,width:1,height:1,source:source('a'),traits:[]};
const veteran={id:'veteran',name:'Orc Veteran',level:1,width:1,height:1,source:source('b'),traits:[]};
const big={id:'large',name:'Ancient Test Creature',level:12,width:3,height:3,source:source('c'),traits:[]};
const campaign={schema:1,actors:[{key:john,name:'John Guard',level:3,width:1,height:1,source:{type:'campaign',key:john}}]};
const creatures={schema:1,system:{id:'pf2e',version:'8.5.0'},creatures:[commander,veteran,big]};
const presetEncounter={name:'Prepared orcs',partyLevel:2,partySize:5,target:'moderate',roster:[{...commander,count:1},{...veteran,count:2}],placements:[]};
async function fixtures(page){
 await page.route('**/session-actors.json',r=>r.fulfill({json:campaign}));await page.route('**/encounter-creatures.json',r=>r.fulfill({json:creatures}));
 await page.route('**/session-presets.json',r=>r.fulfill({json:{schema:1,presets:[{id:'test-preparation',name:'Prepared encounter',description:'Test data.',notes:[],actors:[],encounter:presetEncounter}]}}));
}
async function open(page){await page.goto(base+'#/workspace');await page.waitForFunction(()=>document.querySelector('#epControls')&&!document.querySelector('#epControls').disabled);await page.locator('#epPanel>summary').click();await page.waitForFunction(()=>document.querySelector('#epResults')?.textContent.includes('Orc Commander'));}
async function add(page,name){await page.locator('#epSearch').fill(name);await page.getByRole('button',{name:'Add '+name,exact:true}).click();}
async function download(page,selector){const pending=page.waitForEvent('download');await page.locator(selector).click();const file=await pending;assert.equal(await file.failure(),null);return JSON.parse(await fs.readFile(await file.path(),'utf8'));}
(async()=>{
 await fs.mkdir(output,{recursive:true});const format=await import(pathToFileURL(path.join(__dirname,'../../foundry-module/scripts/session-package.mjs')));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));await fixtures(page);await open(page);
   assert.equal(await page.locator('#epSize').inputValue(),'5');assert.equal(await page.locator('#epLevel').inputValue(),'2');assert.match(await page.locator('#epBudget').innerText(),/100 target/);
   await add(page,'Orc Commander');await add(page,'Orc Veteran');await add(page,'Orc Veteran');
   assert.match(await page.locator('#epBudget').innerText(),/80 XP per character/);assert.match(await page.locator('#epBudget').innerText(),/Moderate/);
   assert.match(await page.locator('#spSummary').innerText(),/2 journal pages.*2 NPC sheets.*3 opponents/);
   await page.locator('#spPresets summary').click();assert.equal(await page.locator('[data-preset-encounter]').isChecked(),false,'Adding opponents must turn off default preset replacement');
   const rosterOnly=await download(page,'#spExport'),sealed=await format.validatePackage(rosterOnly);assert.equal(sealed.version,2);assert.equal(sealed.encounter.partySize,5);assert.equal(sealed.encounter.roster.length,2);assert.equal(sealed.encounter.placements.length,0);assert(!sealed.scene);
   // Apply the same transaction used by saved sessions, then inspect its live overview.
   await page.evaluate(async key=>{const before=await window.SaerothSessionPrep.capture(),next=structuredClone(before);next.desk.board=[key];next.desk.tasks=[{id:'supplies',text:'Check expedition supplies',done:false}];await window.SaerothSessionPrep.apply(next,{expectedCurrent:before});},john);
   assert.equal(await page.locator('#spOverviewNotes').textContent(),'1 included');assert.equal(await page.locator('#spOverviewTasks').textContent(),'0 of 1 complete');assert.equal(await page.locator('#spOverviewEncounter').textContent(),'3 opponents');
   assert.equal(await page.locator('#spNextAction').isVisible(),false,'A roster and unfinished personal task are exportable');
   await page.locator('#epPanel>summary').click();assert.equal(await page.locator('#epPanel').evaluate(node=>node.open),false);
   await page.locator('#wsPrepOverview>summary').click();await page.locator('#wsPrepOverview [data-target="epPanel"]').click();
   assert.equal(await page.locator('#epPanel').evaluate(node=>node.open),true);assert(await page.locator('#epPanel>summary').evaluate(node=>document.activeElement===node),'The overview opens and focuses the encounter tools');
   if(width===1440)await fs.writeFile(path.join(output,'browser-encounter-package.json'),JSON.stringify(rosterOnly));
   for(const theme of ['light','dark']){await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);await page.locator('#epBudget').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'encounter-'+width+'-'+theme+'.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await page.locator('.ep-portability>summary').click();const backup=await download(page,'#epBackup');assert.equal(backup.encounter.placements.length,0);assert.equal(backup.map,null);assert.equal(backup.staging,false);assert.equal(backup.encounter.roster.length,2);
   // The overview survives a reload with the same roster.
   await page.reload();await page.waitForFunction(()=>document.querySelector('#epControls')&&!document.querySelector('#epControls').disabled);
   assert.equal(await page.locator('#spOverviewNotes').textContent(),'1 included');assert.equal(await page.locator('#spOverviewTasks').textContent(),'0 of 1 complete');assert.equal(await page.locator('#spOverviewEncounter').textContent(),'3 opponents');
   await page.locator('#epPanel>summary').click();await page.waitForFunction(()=>document.querySelector('#epResults')?.textContent.includes('Orc Commander'));
   await page.locator('#epNear').uncheck();await add(page,'Ancient Test Creature');assert.match(await page.locator('#epBudget').innerText(),/unknown|Unknown/);assert.match(await page.locator('#epBudget').innerText(),/not counted as zero/);
   await page.getByRole('button',{name:'Remove Ancient Test Creature',exact:true}).click();await page.locator('#epSize').fill('6');await page.locator('#epSize').press('Tab');assert.match(await page.locator('#epBudget').innerText(),/120 target/);assert.match(await page.locator('#epBudget').innerText(),/66 XP per character/);
   await page.locator('#epSize').fill('5');await page.locator('#epSize').press('Tab');
   await page.locator('#epClear').click();assert.equal((await download(page,'#spExport')).version,1,'Ordinary sessions remain v1');
   // Backup restoration is explicit. Backups made while battle maps existed keep their roster and drop positions.
   await page.locator('.ep-portability>summary').click();await page.locator('#epRestore').setInputFiles({name:'encounter.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.locator('#epApplyRestore').waitFor();assert.equal(await page.locator('#epRestoreMap').count(),0,'Retired map choices are not offered');
   await page.locator('#epApplyRestore').click();assert.equal((await page.evaluate(()=>window.SaerothEncounterPlanner.snapshot())).encounter.roster.length,2);
   // A legacy backup with a generated map and token positions restores its roster only.
   const legacyBackup={...backup,staging:true,map:{version:1,name:'Retired map',recipe:{}},encounter:{...backup.encounter,name:'Legacy encounter',placements:[{entryId:'commander',instance:0,x:100,y:100}]}};
   await page.locator('#epRestore').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyBackup))});await page.locator('#epApplyRestore').waitFor();await page.locator('#epApplyRestore').click();
   const legacyState=await page.evaluate(()=>window.SaerothEncounterPlanner.snapshot());assert.equal(legacyState.encounter.name,'Legacy encounter');assert.equal(legacyState.encounter.roster.length,2);assert.equal(legacyState.encounter.placements.length,0);assert.equal(legacyState.staging,false);
   // Slow earlier file selection cannot replace a later preview.
   await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){if(this.name==='slow.json')return new Promise(resolve=>{window.releaseEncounterFile=()=>original.call(this).then(resolve);});return original.call(this);};});
   await page.locator('#epRestore').setInputFiles({name:'slow.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,encounter:{...backup.encounter,name:'Stale encounter'}}))});
   await page.locator('#epRestore').setInputFiles({name:'fast.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,encounter:{...backup.encounter,name:'Latest encounter'}}))});await page.locator('#epRestorePreview').filter({hasText:'Latest encounter'}).waitFor();await page.evaluate(()=>window.releaseEncounterFile());await page.waitForTimeout(100);assert.match(await page.locator('#epRestorePreview').innerText(),/Latest encounter/);assert(!/Stale encounter/.test(await page.locator('#epRestorePreview').innerText()));
   assert.deepEqual(errors,[]);await context.close();
  }
  // Prepared encounters replace a roster only after an explicit choice; exports capture a stable plan and cancel cleanly.
  const preparedContext=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),preparedPage=await preparedContext.newPage();await fixtures(preparedPage);await open(preparedPage);
  await preparedPage.locator('#spPresets summary').click();assert.equal(await preparedPage.locator('[data-preset-encounter]').isChecked(),true);await preparedPage.locator('[data-add-preset]').click();await preparedPage.waitForFunction(()=>window.SaerothEncounterPlanner.summary().opponents===3);
  assert.equal(await preparedPage.locator('[data-preset-encounter]').isChecked(),false);await preparedPage.locator('[data-ep-count=veteran]').fill('3');await preparedPage.locator('[data-ep-count=veteran]').press('Tab');await preparedPage.locator('[data-add-preset]').click();assert.equal(await preparedPage.evaluate(()=>window.SaerothEncounterPlanner.summary().opponents),4);
  await preparedPage.locator('[data-preset-encounter]').check();await preparedPage.locator('[data-add-preset]').click();await preparedPage.waitForFunction(()=>window.SaerothEncounterPlanner.summary().opponents===3);
  // A draft edited while preflight is pending cannot replace the captured package plan.
  await preparedPage.evaluate(()=>{const original=window.SaerothEncounterPlanner.preflight;window.SaerothEncounterPlanner.preflight=(...args)=>new Promise((resolve,reject)=>{window.releaseEncounterPreflight=()=>{window.SaerothEncounterPlanner.preflight=original;original(...args).then(resolve,reject);};});});
  const capturedDownload=preparedPage.waitForEvent('download');await preparedPage.locator('#spExport').click();await preparedPage.waitForFunction(()=>typeof window.releaseEncounterPreflight==='function');
  await preparedPage.evaluate(async value=>{await window.SaerothEncounterPlanner.addPrepared({...value,name:'Changed after capture',roster:[{...value.roster[0],count:1}],placements:[]});window.releaseEncounterPreflight();},presetEncounter);
  const captured=JSON.parse(await fs.readFile(await(await capturedDownload).path(),'utf8'));assert.equal(captured.encounter.name,presetEncounter.name);assert.equal(captured.encounter.roster.reduce((sum,entry)=>sum+entry.count,0),3);assert.equal(await preparedPage.evaluate(()=>window.SaerothEncounterPlanner.summary().opponents),1);assert.equal(await preparedPage.locator('#spOverviewEncounter').textContent(),'1 opponent');
  await preparedPage.evaluate(value=>window.SaerothEncounterPlanner.addPrepared(value),presetEncounter);
  await preparedPage.evaluate(()=>{const original=window.SaerothEncounterPlanner.exportEncounter;window.SaerothEncounterPlanner.exportEncounter=(...args)=>new Promise(resolve=>{window.releaseEncounterExport=()=>original(...args).then(resolve);});});
  let cancelledDownloads=0;preparedPage.on('download',()=>cancelledDownloads++);await preparedPage.locator('#spExport').click();await preparedPage.waitForFunction(()=>typeof window.releaseEncounterExport==='function');assert(await preparedPage.locator('#epControls').evaluate(node=>node.disabled));assert(await preparedPage.locator('#epName').isDisabled());await preparedPage.locator('#spCancel').click();await preparedPage.evaluate(()=>window.releaseEncounterExport());await preparedPage.waitForFunction(()=>document.querySelector('#spStatus').textContent.startsWith('Export cancelled'));assert.equal(cancelledDownloads,0);assert.equal(await preparedPage.evaluate(()=>window.SaerothEncounterPlanner.summary().opponents),3);await preparedContext.close();
  // Generic or missing static-host MIME is accepted only after binary sniffing.
  const mimeContext=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),mimePage=await mimeContext.newPage();await fixtures(mimePage);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGf8AAAAASUVORK5CYII=','base64');
  const webp=Buffer.from(await mimePage.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);return canvas.toDataURL('image/webp').split(',')[1];}),'base64');let mimeMode='generic';
  await mimePage.route('**/content/campaign/npcs/John%20Guard.md',r=>r.fulfill({contentType:'text/markdown',body:'---\ntitle: John Guard\ntype: npc\n---\n# John Guard\n![PNG](fixture.png)\n![WebP](fixture.webp)'}));
  await mimePage.route('**/content/campaign/npcs/fixture.png',r=>r.fulfill({headers:{'content-type':mimeMode==='missing'?'':'application/octet-stream'},body:png}));
  await mimePage.route('**/content/campaign/npcs/fixture.webp',r=>r.fulfill({headers:{'content-type':mimeMode==='missing'?'':'application/octet-stream'},body:mimeMode==='html'?Buffer.from('<html>not an image</html>'):webp}));
  // Seed before application startup: a hash-only goto does not reread localStorage.
  await mimePage.addInitScript(({pathname,john})=>localStorage.setItem('saeroth-workspace-v1:'+pathname,JSON.stringify({version:1,pins:[],recent:[],board:[john],tasks:[],title:'MIME verification',notes:'',libraryView:'cards',updatedAt:''})),{pathname:new URL(base).pathname,john});await open(mimePage);
  assert.equal(await mimePage.locator('#wsBoardList li').count(),1);assert.match(await mimePage.locator('#wsBoardList').innerText(),/John Guard/);
  for(const mode of ['generic','missing']){mimeMode=mode;const data=await download(mimePage,'#spExport');assert(data.journal.pages.some(page=>page.name==='John Guard'));assert.deepEqual(data.assets.map(a=>a.mime).sort(),['image/png','image/webp']);await format.validatePackage(data);}
  mimeMode='html';let badDownloads=0;mimePage.on('download',()=>badDownloads++);await mimePage.locator('#spExport').click();await mimePage.waitForFunction(()=>document.querySelector('#spStatus').textContent.includes('must contain a PNG'));assert.equal(badDownloads,0);await mimeContext.close();
  // Storage failures do not claim that an encounter was saved, and corrupt drafts remain recoverable.
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();await fixtures(page);
  await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('saeroth-encounter'))throw Error('Quota exceeded');return original.call(this,key,value);};});await open(page);await add(page,'Orc Commander');assert.match(await page.locator('#epStorage').innerText(),/tab only/);await page.locator('.ep-portability>summary').click();assert.equal((await download(page,'#epBackup')).encounter.roster.length,1);await context.close();
  const broken=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),brokenPage=await broken.newPage();await fixtures(brokenPage);await brokenPage.addInitScript(pathname=>localStorage.setItem('saeroth-encounter-v1:'+pathname,'{"not a usable draft":'),new URL(base).pathname);await open(brokenPage);assert(await brokenPage.locator('#epRecovery').isVisible());assert.match(await brokenPage.locator('#epStorage').innerText(),/could not be read/);assert.equal(await brokenPage.evaluate(()=>localStorage.getItem('saeroth-encounter-v1:'+location.pathname+':recovery')),'{"not a usable draft":');await broken.close();
  console.log('Encounter planner browser checks passed: five-player math, v1/v2 export, captured-plan isolation, live overview after apply/reload, keyboard shortcuts, presets, legacy backup restore, portable recovery, asynchronous selection, and phone/desktop themes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
