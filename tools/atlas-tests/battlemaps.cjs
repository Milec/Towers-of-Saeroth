const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
const output=process.env.ATLAS_SCREENSHOT_DIR||path.join(__dirname,'../../_site/battlemap-review');
const fixture={id:987654322,name:'Northern Refuge',kind:'inn',notes:'A mountain refuge overlooking a tower and cave. Test fixture only.',x:735,y:890};

async function ready(page){
 await page.locator('#battlemapDialog[open]').waitFor();
 await page.waitForFunction(()=>document.getElementById('battlemapDialog')?.dataset.ready==='true');
}
async function digest(page){
 return page.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({atlas:D,custom:window.ATLAS_CUSTOM_POIS.all()}))))).map(n=>n.toString(16).padStart(2,'0')).join(''));
}
async function getDownload(page,button){
 const event=page.waitForEvent('download');await page.locator(button).click();const file=await event;
 assert.equal(await file.failure(),null);return {name:file.suggestedFilename(),bytes:await fs.readFile(await file.path())};
}
async function imageInfo(page){
 return page.locator('#battlemapCanvas').evaluate(canvas=>{
  const c=canvas.getContext('2d'),rgba=c.getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
  for(let y=0;y<canvas.height;y+=Math.max(1,Math.floor(canvas.height/50)))for(let x=0;x<canvas.width;x+=Math.max(1,Math.floor(canvas.width/50))){const i=(y*canvas.width+x)*4;colors.add(`${rgba[i]},${rgba[i+1]},${rgba[i+2]},${rgba[i+3]}`);}
  return {width:canvas.width,height:canvas.height,colors:colors.size};
 });
}
async function assertCaveEntrance(page){
 const entrance=await page.evaluate(()=>{
  const map=SaerothBattlemapEngine.generate({seed:'iron-lantern-42',kind:'cave',terrain:'mountain',size:32,name:'Cave entrance regression',source:{type:'poi',id:0}});
  const canvas=document.createElement('canvas');SaerothBattlemapEngine.render(canvas,map,{pixelsPerCell:26,grid:false});
  const pixels=canvas.getContext('2d').getImageData(canvas.width/2-12,canvas.height-2,24,1).data;
  let brightness=0;for(let i=0;i<pixels.length;i+=4)brightness+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
  const scene=SaerothBattlemapFoundry.scene(map,{backgroundPath:'worlds/test/cave.webp',gridSize:100,time:'night'});
  const wallAcrossEntry=scene.walls.some(({c})=>Math.abs(c[1]-3200)<.01&&Math.abs(c[3]-3200)<.01&&Math.min(c[0],c[2])<=1600&&Math.max(c[0],c[2])>=1600);
  return {brightness:brightness/24,wallAcrossEntry};
 });
 assert(entrance.brightness>120,'Cave entrance art must remain open rather than painting a dark wall cap across its bottom edge');
 assert.equal(entrance.wallAcrossEntry,false,'The matching Foundry cave entrance must remain traversable');
}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block',reducedMotion:'reduce',acceptDownloads:true});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/campaign-pois.json',route=>route.fulfill({json:{version:1,pois:[fixture]}}));
   await page.goto(base+'atlas/?integrated#poi-0');
   await page.waitForFunction(()=>window.SaerothBattlemaps&&window.ATLAS_CUSTOM_POIS.has(987654322));
   assert.equal(await page.locator('#atlasGenerateBattlemap').count(),1,'Landmark zero must get one action');
   assert.equal(await page.evaluate(()=>!!window.SaerothBattlemapEngine),false,'Generator loads only when requested');
   const source=await digest(page);
   await page.locator('#atlasGenerateBattlemap').click();await ready(page);
   assert.equal(await page.locator('#battlemapTerrain').inputValue(),'mountain');
   const initial=await page.locator('#battlemapSeed').inputValue();assert(initial);
   const pixels=await imageInfo(page);assert(pixels.width>=500&&pixels.height>=500&&pixels.colors>60,'Preview should contain detailed generated artwork');
   await page.locator('#battlemapReroll').click();await ready(page);
   const rerolled=await page.locator('#battlemapSeed').inputValue();assert.notEqual(rerolled,initial);
   await page.locator('#battlemapPrevious').click();await ready(page);assert.equal(await page.locator('#battlemapSeed').inputValue(),initial);
   for(const theme of ['light','dark']){
    await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    await page.screenshot({path:path.join(output,`battlemap-${width}-${theme}.png`)});
    const bounds=await page.locator('#battlemapDialog').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
   await page.keyboard.press('Escape');await page.locator('#battlemapDialog').waitFor({state:'hidden'});
   assert(await page.locator('#atlasGenerateBattlemap').evaluate(el=>el===document.activeElement));
   await page.reload();await page.locator('#atlasGenerateBattlemap').waitFor();await page.locator('#atlasGenerateBattlemap').click();await ready(page);
   assert.equal(await page.locator('#battlemapSeed').inputValue(),initial,'Saved recipe reopens after reload');
   await page.locator('#battlemapClose').click();
   await page.evaluate(()=>show('custompoi',987654322,false));await page.locator('#atlasGenerateBattlemap').click();await ready(page);
   assert.equal(await page.locator('#battlemapKind').inputValue(),'inn');assert.equal(await page.locator('#battlemapTerrain').inputValue(),'mountain');
   await page.locator('#battlemapSize').selectOption('24');await ready(page);
   await page.locator('#battlemapTime').selectOption('night');await ready(page);
   if(width===1440){
    const foundry=await getDownload(page,'#battlemapFoundry'),macro=JSON.parse(foundry.bytes.toString('utf8'));
    assert(foundry.name.endsWith('.json'));assert.equal(macro.type,'script');assert.equal(macro.scope,'global');
    assert(macro.command.includes('Northern Refuge')&&macro.command.includes('"mime":"image/webp"')&&macro.command.includes('"image":"UklGR'));assert.equal(macro.ownership.default,0);
    const payload=JSON.parse(macro.command.match(/\)\((\{"scene":[\s\S]*\})\);$/)[1]);
    assert.equal(payload.scene.width,2400);assert.equal(payload.scene.padding,0);assert.equal(payload.scene.grid.distance,5);assert.equal(payload.scene.environment.darknessLevel,.8);
    assert.equal(payload.scene.active,false);assert.equal(payload.scene.navigation,false);assert(payload.scene.walls.some(w=>w.door===1));
    assert(payload.scene.walls.every(w=>w.c.every(n=>n>=0&&n<=2400)));
    await assertCaveEntrance(page);
    const image=await getDownload(page,'#battlemapImage');assert(image.name.endsWith('.png'));
    assert.equal(image.bytes.subarray(1,4).toString('ascii'),'PNG');assert.equal(image.bytes.readUInt32BE(16),2400);assert.equal(image.bytes.readUInt32BE(20),2400);
    await page.locator('#battlemapGrid').uncheck();await page.locator('#battlemapWalls').check();
    const overlayImage=await getDownload(page,'#battlemapImage');assert(image.bytes.equals(overlayImage.bytes),'Preview grid/wall/light overlays must not leak into exported art');
    assert(await page.locator('#battlemapDownloads a[download$=".png"]').isVisible(),'A persistent save link must remain for mobile browsers');
    await page.locator('#battlemapMore > summary').click();
    const backup=await getDownload(page,'#battlemapRecipeExport'),saved=JSON.parse(backup.bytes.toString('utf8'));
    assert.equal(saved.version,1);assert.equal(saved.generatorVersion,1);assert.deepEqual(saved.source,{type:'custompoi',id:fixture.id});
    const originalSeed=await page.locator('#battlemapSeed').inputValue();
    const setRecipe=object=>page.locator('#battlemapRecipeFile').setInputFiles({name:'recipe.json',mimeType:'application/json',buffer:Buffer.from(typeof object==='string'?object:JSON.stringify(object))});
    await setRecipe({...saved,source:{type:'poi',id:0}});await page.locator('#battlemapStatus').filter({hasText:'different POI'}).waitFor();assert.equal(await page.locator('#battlemapSeed').inputValue(),originalSeed);
    await setRecipe({...saved,size:-1});await page.locator('#battlemapStatus').filter({hasText:'valid Saeroth'}).waitFor();assert.equal(await page.locator('#battlemapSeed').inputValue(),originalSeed);
    await setRecipe('{broken');await page.locator('#battlemapStatus').filter({hasText:'not a valid map recipe'}).waitFor();assert.equal(await page.locator('#battlemapSeed').inputValue(),originalSeed);
    await setRecipe({...saved,seed:'portable-copy'});await page.waitForFunction(()=>document.getElementById('battlemapSeed').value==='portable-copy');await ready(page);
    await setRecipe(saved);await page.waitForFunction(seed=>document.getElementById('battlemapSeed').value===seed,originalSeed);await ready(page);
   }
   await page.locator('#battlemapClose').click();await page.evaluate(()=>show('burg',1,false));assert.equal(await page.locator('#atlasGenerateBattlemap').count(),1);
   await page.evaluate(()=>show('nation',3,false));assert.equal(await page.locator('#atlasGenerateBattlemap').count(),0,'Territories should not imply a tactical encounter site');
   assert.equal(await digest(page),source,'Generating and exporting must not alter atlas or custom-location records');
   assert.deepEqual(errors,[]);await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(/battlemap/i.test(key))throw new DOMException('Full','QuotaExceededError');return set.call(this,key,value);};});
  await page.goto(base+'atlas/?integrated#poi-0');await page.locator('#atlasGenerateBattlemap').click();await ready(page);
  assert(/could not|unable|unavailable|cannot|not saved/i.test(await page.locator('#battlemapStorage').innerText()),'Storage failure must not claim a recipe was saved');
  assert((await imageInfo(page)).colors>60,'Storage errors must not stop generation');assert.deepEqual(errors,[]);await context.close();
  const retryContext=await browser.newContext({serviceWorkers:'block'}),retryPage=await retryContext.newPage();let attempts=0;
  await retryPage.route('**/battlemap-engine.js',route=>++attempts===1?route.abort('failed'):route.continue());
  await retryPage.goto(base+'atlas/?integrated#poi-0');await retryPage.locator('#atlasGenerateBattlemap').click();
  await retryPage.locator('#battlemapRetry').waitFor({state:'visible'});assert(/unavailable/i.test(await retryPage.locator('#battlemapStatus').innerText()));
  await retryPage.locator('#battlemapRetry').click();await ready(retryPage);assert.equal(attempts,2);
  const storageKey=await retryPage.evaluate(()=>Object.keys(localStorage).find(key=>key.startsWith('saeroth-battlemaps-v1:')));
  await retryPage.evaluate(key=>localStorage.setItem(key,'{corrupted original'),storageKey);await retryPage.reload();
  await retryPage.locator('#atlasGenerateBattlemap').click();await ready(retryPage);
  assert((await retryPage.locator('#battlemapStorage').innerText()).includes('original data is preserved'));
  assert.equal(await retryPage.evaluate(key=>localStorage.getItem(key),storageKey),'{corrupted original');
  await retryPage.locator('#battlemapMore > summary').click();const recovery=await getDownload(retryPage,'#battlemapRecover');assert.equal(recovery.bytes.toString('utf8'),'{corrupted original');
  await retryContext.close();
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'#/atlas#poi-0');const inner=await(await page.locator('.atlas-frame').elementHandle()).contentFrame();
   await inner.locator('#atlasGenerateBattlemap').click();await ready(inner);
   await inner.locator('.bm-body').evaluate(el=>el.scrollTop=el.scrollHeight);
   const close=await inner.locator('#battlemapClose').boundingBox();assert(close.y>=0&&close.y+close.height<960,'Close remains visible after scrolling inside hosted phone/desktop generator');
   await inner.locator('#battlemapClose').click();await inner.evaluate(()=>show('burg',1,false));
   await inner.locator('#atlasGenerateBattlemap').click();await ready(inner);assert.equal(await inner.locator('.bm-body').evaluate(el=>el.scrollTop),0,'A new POI opens at its title and preview');
   await page.screenshot({path:path.join(output,`battlemap-hosted-${width}.png`)});
   await inner.locator('#battlemapClose').click();
   await inner.evaluate(()=>{AtlasPanels.open('saved');SaerothBattlemaps.open(SaerothBattlemaps.contextFor('poi',0));});await ready(inner);
   await inner.locator('#battlemapClose').focus();await page.keyboard.press('/');assert.equal(await inner.evaluate(()=>AtlasPanels.active),'saved','Atlas hotkeys must not change background controls while dialog is open');
   await page.keyboard.press('Escape');assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: contextual POI/custom/settlement generation, lazy load/retry, reroll/undo/persistence, detailed canvas and open cave entrance, clean PNG/native Foundry downloads, recipes/recovery, source preservation, responsive themes/hosted iframe, focus and storage failure.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
