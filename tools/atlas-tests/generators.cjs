const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
async function download(page,button){const pending=page.waitForEvent('download');await button.click();const file=await pending;assert.equal(await file.failure(),null);return JSON.parse(await fs.readFile(await file.path(),'utf8'));}
async function set(page,id,value){const input=page.locator(id);await input.fill(String(value));await input.dispatchEvent('change');}
(async()=>{
 const format=await import(pathToFileURL(path.join(__dirname,'../../foundry-module/scripts/session-package.mjs')).href);
 const math=await import(pathToFileURL(path.join(__dirname,'../../foundry-module/scripts/encounter-plan.mjs')).href);
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'#/workspace');await page.locator('#epPanel > summary').click();
   await page.waitForFunction(()=>!document.querySelector('#epControls').disabled);
   await set(page,'#epLevel',3);await set(page,'#epSize',4);await page.locator('#epMixed').check();
   const memberLevels=page.locator('[data-ep-member-level]');assert.equal(await memberLevels.count(),4);
   await memberLevels.first().fill('2');await memberLevels.first().dispatchEvent('change');
   await page.locator('[data-ep-member-name]').first().fill('Lower PC');await page.locator('[data-ep-member-name]').first().dispatchEvent('change');
   await page.locator('#epSource').selectOption('compendium');await page.locator('#epSearch').fill('Wolf');
   await page.getByRole('button',{name:'Add Wolf',exact:true}).first().click();
   await page.locator('#epVariant').selectOption('elite');await page.getByRole('button',{name:'Add Elite Wolf',exact:true}).first().click();
   await page.locator('#epVariant').selectOption('weak');await page.getByRole('button',{name:'Add Weak Wolf',exact:true}).first().click();
   assert.equal(await page.locator('#epRoster li').count(),3);
   const encounterPackage=await download(page,page.locator('#spExport'));await format.validatePackage(encounterPackage);
   assert.equal(encounterPackage.version,3);assert.equal(encounterPackage.encounter.partyMembers[0].level,2);
   assert.deepEqual(encounterPackage.encounter.roster.map(r=>r.adjustment||'standard'),['standard','elite','weak']);
   const calculation=math.calculateEncounter(encounterPackage.encounter);assert.equal(calculation.totalXP,60);assert.equal(calculation.memberAwards[0].awardXP,calculation.awardXP*2);
   await page.locator('.ws-session-nav [data-target="gmGeneratorsPanel"]').click();
   await page.locator('#ggForm').waitFor();
   await set(page,'#gg-name','Fixture treasure');await set(page,'#gg-seed','browser-loot');
   await page.getByRole('button',{name:'Generate loot',exact:true}).click();
   const loot=await download(page,page.locator('#ggExport'));await format.validatePackage(loot);
   assert.equal(loot.preparations[0].kind,'loot');assert(loot.preparations[0].items.length>0);assert.equal(loot.journal.ownership.default,0);
   await page.getByRole('tab',{name:'Shop',exact:true}).click();await set(page,'#gg-name','Fixture merchant');
   await page.locator('#gg-kind').selectOption('alchemical');await set(page,'#gg-seed','browser-shop');
   await page.getByRole('button',{name:'Generate shop',exact:true}).click();
   const quantity=page.locator('[data-gg-quantity]').first();await quantity.fill('4');await quantity.dispatchEvent('change');
   const shop=await download(page,page.locator('#ggExport'));await format.validatePackage(shop);assert.equal(shop.preparations[0].kind,'shop');assert.equal(shop.preparations[0].items[0].quantity,4);
   await page.getByRole('tab',{name:'NPC',exact:false}).click();await set(page,'#gg-name','Fixture NPC');await set(page,'#gg-level',20);
   await page.getByRole('button',{name:'Generate NPC',exact:true}).click();
   const npc=await download(page,page.locator('#ggExport'));await format.validatePackage(npc);assert.equal(npc.preparations[0].name,'Fixture NPC');assert.equal(npc.preparations[0].level,20);assert(npc.preparations[0].source.uuid.startsWith('Compendium.pf2e.'));
   const all=await download(page,page.locator('#ggExportAll'));await format.validatePackage(all);assert.equal(all.preparations.length,3);assert.equal(all.journal.pages.length,3);
   for(const theme of ['light','dark']){
    await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    await page.locator('#gmGeneratorsPanel').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(__dirname,`../../_site/generators-${width}-${theme}.png`)});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert(await page.locator('.gg-tabs button,.gg-actions button').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)));
   }
   await page.reload();await page.locator('#gmGeneratorsPanel > summary').click();await page.locator('#ggForm').waitFor();
   assert.equal(await page.locator('#ggResult h3').textContent(),'Fixture NPC');
   assert.equal((await download(page,page.locator('#ggExportAll'))).preparations.length,3);
   await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('saeroth-generators-v1:'))throw new DOMException('Full','QuotaExceededError');return original.call(this,key,value);};});
   await set(page,'#gg-name','Unsaved NPC');await page.getByRole('button',{name:'Generate NPC',exact:true}).click();
   await page.locator('.primary-nav a[href="#/library"]').click();await page.locator('#wsLibrarySearch').waitFor();
   await page.locator('.primary-nav a[href="#/workspace"]').click();await page.locator('#gmGeneratorsPanel > summary').click();await page.locator('#ggForm').waitFor();
   assert.equal(await page.locator('#ggResult h3').textContent(),'Unsaved NPC','Navigation must retain in-memory results when storage fails.');
   assert.equal((await download(page,page.locator('#ggExport'))).preparations[0].name,'Unsaved NPC');
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Generators passed: mixed-level and variant encounter export; native loot, shop, NPC and combined packages; edited quantities; persistence; phone/desktop themes; no browser errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
