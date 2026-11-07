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
const map={version:1,name:'Encounter test quarry',recipe:{version:1,generatorVersion:1,source:{type:'poi',id:0},kind:'ruin',terrain:'mountain',size:24,time:'day',seed:'encounter-planner-browser'}};
const presetEncounter={name:'Prepared orcs',partyLevel:2,partySize:5,target:'moderate',roster:[{...commander,count:1},{...veteran,count:2}],placements:[]};
async function fixtures(page){
 await page.route('**/session-actors.json',r=>r.fulfill({json:campaign}));await page.route('**/encounter-creatures.json',r=>r.fulfill({json:creatures}));
 await page.route('**/session-presets.json',r=>r.fulfill({json:{schema:1,presets:[{id:'test-preparation',name:'Prepared encounter',description:'Test data.',notes:[],actors:[],map,encounter:presetEncounter}]}}));
}
async function open(page){await page.goto(base+'#/workspace');await page.waitForFunction(()=>document.querySelector('#epControls')&&!document.querySelector('#epControls').disabled);await page.locator('#epPanel>summary').click();await page.waitForFunction(()=>document.querySelector('#epResults')?.textContent.includes('Orc Commander'));}
async function add(page,name){await page.locator('#epSearch').fill(name);await page.getByRole('button',{name:'Add '+name,exact:true}).click();}
async function download(page,selector){const pending=page.waitForEvent('download');await page.locator(selector).click();const file=await pending;assert.equal(await file.failure(),null);return JSON.parse(await fs.readFile(await file.path(),'utf8'));}
async function place(page,column,row){await page.locator('#epColumn').fill(String(column+1));await page.locator('#epRow').fill(String(row+1));await page.locator('#epPlace').click();}
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
   const rosterOnly=await download(page,'#spExport'),sealed=await format.validatePackage(rosterOnly);assert.equal(sealed.version,2);assert.equal(sealed.encounter.partySize,5);assert.equal(sealed.encounter.roster.length,2);assert.equal(sealed.encounter.placements.length,0);assert.equal(sealed.scene,null);
   await page.evaluate(value=>window.SaerothSessionExport.selectMap(value),map);await page.locator('#epStage').check();await page.waitForFunction(()=>document.querySelector('#epMapCanvas').width>300);
   let downloads=0;page.on('download',()=>downloads++);await page.locator('#spExport').click();await page.waitForFunction(()=>document.querySelector('#spStatus')?.textContent.includes('Place every opponent'));assert.equal(downloads,0);
   const valid=await page.evaluate(async value=>{
    const math=await import('./encounter-plan.mjs'),state=window.SaerothEncounterPlanner.snapshot().encounter;
    const model=window.SaerothBattlemapEngine.generate({...value.recipe,name:value.name}),scene=window.SaerothBattlemapFoundry.scene(model,{backgroundPath:'asset:test'}),positions=[];
    for(const entry of state.roster)for(let instance=0;instance<entry.count;instance++){
     let found=false;for(let row=0;row<24&&!found;row++)for(let column=0;column<24&&!found;column++)try{math.normalizeEncounter({...state,placements:[...positions,{entryId:entry.id,instance,x:column*100,y:row*100}]},scene,{allowPartialPlacements:true});positions.push({entryId:entry.id,instance,x:column*100,y:row*100});found=true;}catch(_){}
     if(!found)throw Error('No valid test position');
    }return positions;
   },map);
   await place(page,valid[0].x/100,valid[0].y/100);await place(page,valid[0].x/100,valid[0].y/100);assert.match(await page.locator('#epStatus').innerText(),/overlap/);assert.equal((await page.evaluate(()=>window.SaerothEncounterPlanner.snapshot())).encounter.placements.length,1);
   for(const position of valid.slice(1))await place(page,position.x/100,position.y/100);
   assert.match(await page.locator('#epPlacementCount').innerText(),/3 of 3/);
   const staged=await download(page,'#spExport');await format.validatePackage(staged);assert.equal(staged.encounter.placements.length,3);assert.equal(staged.scene.tokens.length,0,'Importer constructs tokens from trusted actor documents');
   if(width===1440)await fs.writeFile(path.join(output,'browser-encounter-package.json'),JSON.stringify(staged));
   for(const theme of ['light','dark']){await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);await page.locator('#epBudget').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'encounter-'+width+'-'+theme+'.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#epMapTools').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'placements-'+width+'-'+theme+'.png')});}
   await page.locator('.ep-portability>summary').click();const backup=await download(page,'#epBackup');assert.equal(backup.encounter.placements.length,3);assert.deepEqual(backup.map,map);
   const different={...backup,map:{...map,name:'Different map preview'}};
   await page.locator('#epRestore').setInputFiles({name:'different.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(different))});await page.locator('#epApplyRestore').waitFor();
   await page.locator('#epUnit').selectOption(valid[0].entryId+':0');await page.locator('#epUnplace').click();await place(page,valid[0].x/100,valid[0].y/100);assert.match(await page.locator('#epPlacementCount').innerText(),/3 of 3/,'Previewing a different backup must not break the current placement map');
   await page.reload();await page.waitForFunction(()=>document.querySelector('#epControls')&&!document.querySelector('#epControls').disabled);await page.locator('#epPanel>summary').click();await page.waitForFunction(()=>document.querySelector('#epMapCanvas').width>300);assert.match(await page.locator('#epPlacementCount').innerText(),/3 of 3/);assert.equal(await page.locator('#epStage').isChecked(),true);
   await page.locator('#epNear').uncheck();await add(page,'Ancient Test Creature');assert.match(await page.locator('#epBudget').innerText(),/unknown|Unknown/);assert.match(await page.locator('#epBudget').innerText(),/not counted as zero/);
   await page.getByRole('button',{name:'Remove Ancient Test Creature',exact:true}).click();await page.locator('#epSize').fill('6');await page.locator('#epSize').press('Tab');assert.match(await page.locator('#epBudget').innerText(),/120 target/);assert.match(await page.locator('#epBudget').innerText(),/66 XP per character/);
   await page.locator('#epSize').fill('5');await page.locator('#epSize').press('Tab');
   await page.evaluate(value=>window.SaerothSessionExport.selectMap({...value,name:'Replacement map',recipe:{...value.recipe,seed:'different'}}),map);assert.equal(await page.locator('#epStage').isChecked(),false);assert.equal((await page.evaluate(()=>window.SaerothEncounterPlanner.snapshot())).encounter.placements.length,0);
   await page.locator('#epClear').click();assert.equal((await download(page,'#spExport')).version,1,'Ordinary sessions remain v1');
   // Backup restoration is explicit and can preserve the currently selected map.
   await page.locator('.ep-portability>summary').click();await page.locator('#epRestore').setInputFiles({name:'encounter.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.locator('#epApplyRestore').waitFor();assert.equal(await page.locator('#epRestoreMap').isChecked(),false);
   await page.locator('#epApplyRestore').click();assert.equal((await page.evaluate(()=>window.SaerothEncounterPlanner.snapshot())).encounter.roster.length,2);assert.equal(await page.locator('#epStage').isChecked(),false);
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
  // An overlapping backup preview cannot steal the selected map's pending preparation.
  const raceContext=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),racePage=await raceContext.newPage();await fixtures(racePage);await open(racePage);
  await racePage.addScriptTag({url:base+'atlas/battlemap-engine.js'});await racePage.addScriptTag({url:base+'atlas/battlemap-foundry.js'});
  const raceBackup=await racePage.evaluate(async({map,presetEncounter})=>{
   const math=await import('./encounter-plan.mjs'),scene=window.SaerothBattlemapFoundry.scene(window.SaerothBattlemapEngine.generate({...map.recipe,name:map.name}),{backgroundPath:'asset:test'});
   let position;for(let row=0;row<24&&!position;row++)for(let column=0;column<24&&!position;column++)try{const p={entryId:presetEncounter.roster[0].id,instance:0,x:column*100,y:row*100};math.normalizeEncounter({...presetEncounter,placements:[p]},scene,{allowPartialPlacements:true});position=p;}catch(_){}
   window.encounterMapWaiters=[];let chosen=map;window.SaerothEncounterPlanner.configure({base:location.href,getMap:()=>chosen,selectMap:value=>{chosen=value;window.SaerothEncounterPlanner.mapChanged();},validateMap:window.SaerothSessionExport.validateMap,onChange:()=>{},loadMapAssets:()=>new Promise(resolve=>window.encounterMapWaiters.push(resolve))});
   await window.SaerothEncounterPlanner.addPrepared(presetEncounter);let container=document.querySelector('#spEncounter');if(!container){container=document.createElement('section');container.className='workspace';document.body.append(container);}window.SaerothEncounterPlanner.mount(container);
   return {format:'saeroth-encounter-plan',version:1,encounter:{...presetEncounter,placements:[position]},staging:true,map:{...map,name:'Different backup preview'}};
  },{map,presetEncounter});
  await racePage.waitForFunction(()=>document.querySelector('#epControls')&&!document.querySelector('#epControls').disabled);await racePage.locator('#epPanel>summary').click();await racePage.locator('#epStage').check();await racePage.waitForFunction(()=>window.encounterMapWaiters.length===1);
  await racePage.locator('.ep-portability>summary').click();await racePage.locator('#epRestore').setInputFiles({name:'overlapping-preview.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raceBackup))});await racePage.waitForFunction(()=>window.encounterMapWaiters.length===2);
  await racePage.evaluate(()=>window.encounterMapWaiters[0]());await racePage.waitForFunction(()=>document.querySelector('#epMapCanvas').width>300);await racePage.evaluate(()=>window.encounterMapWaiters[1]());await racePage.locator('#epApplyRestore').waitFor();
  await place(racePage,raceBackup.encounter.placements[0].x/100,raceBackup.encounter.placements[0].y/100);assert.equal((await racePage.evaluate(()=>window.SaerothEncounterPlanner.snapshot())).encounter.placements.length,1,'Selected map remains usable after a different backup races its preparation');await raceContext.close();
  // Storage failures do not claim that an encounter was saved, and corrupt drafts remain recoverable.
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();await fixtures(page);
  await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('saeroth-encounter'))throw Error('Quota exceeded');return original.call(this,key,value);};});await open(page);await add(page,'Orc Commander');assert.match(await page.locator('#epStorage').innerText(),/tab only/);await page.locator('.ep-portability>summary').click();assert.equal((await download(page,'#epBackup')).encounter.roster.length,1);await context.close();
  const broken=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),brokenPage=await broken.newPage();await fixtures(brokenPage);await brokenPage.addInitScript(pathname=>localStorage.setItem('saeroth-encounter-v1:'+pathname,'{"not a usable draft":'),new URL(base).pathname);await open(brokenPage);assert(await brokenPage.locator('#epRecovery').isVisible());assert.match(await brokenPage.locator('#epStorage').innerText(),/could not be read/);assert.equal(await brokenPage.evaluate(()=>localStorage.getItem('saeroth-encounter-v1:'+location.pathname+':recovery')),'{"not a usable draft":');await broken.close();
  console.log('Encounter planner browser checks passed: five-player math, v1/v2 export, placements, presets, portable recovery, asynchronous selection, and phone/desktop themes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
