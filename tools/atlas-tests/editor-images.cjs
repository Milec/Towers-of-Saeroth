const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const contract=require('../../site/editor-asset.js');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
const output=process.env.ATLAS_SCREENSHOT_DIR||path.join(__dirname,'../../_site/artwork-upload-review');
async function artFile(page,{width=2600,height=1600,color='#704c36',mime='image/png'}={}){
 const data=await page.evaluate(({width,height,color,mime})=>{const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,width,height);x.fillStyle='#eddfc3';x.fillRect(width/4,height/4,width/2,height/2);return c.toDataURL(mime).split(',')[1];},{width,height,color,mime});
 return {name:'art.'+({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime]),mimeType:mime,buffer:Buffer.from(data,'base64')};
}
async function openImage(page){if(!await page.locator('#edImagePanel').isVisible())await page.locator('[data-ed="image"]').click();}
async function choose(page,file,alt='A scout beside a mountain pass'){
 await openImage(page);await page.locator('#edImageFile').setInputFiles(file);
 await page.waitForFunction(()=>document.querySelector('#edUploadStatus').textContent.startsWith('Ready.'));
 await page.locator('#edUploadAlt').fill(alt);await page.locator('#edUseUpload').click();
 await page.waitForFunction(()=>document.querySelector('#edUploadStatus').textContent.startsWith('Image added'));
}
async function backup(page,selector='[data-ed="backup"]'){
 const pending=page.waitForEvent('download');await page.locator(selector).click();const file=await pending;
 assert.equal(await file.failure(),null);return {raw:await fs.readFile(await file.path(),'utf8'),name:file.suggestedFilename()};
}
async function start(page,name='Artwork Test Scout'){
 await page.goto(base+'#/new');await page.locator('#edName').fill(name);
 await page.locator('#edSource').fill((await page.locator('#edSource').inputValue())+'\nA scout waiting for the expedition.\n');
}
async function mockPublisher(page,remote={text:null,sha:null,asset:null,pending:null}){
 await page.evaluate(remote=>{
  window.__artCalls=[];window.__artRemote=remote;
  const real=window.SaerothPublisher;
  window.SaerothPublisher={...real,createClient:()=>({
   connect:async()=>({connected:true}),load:async()=>structuredClone(window.__artRemote),
   publish:async input=>{window.__artCalls.push(structuredClone(input));const asset=input.asset||null;
    const pending={number:991,url:'https://github.com/Milec/Towers-of-Saeroth/pull/991',status:'pending'};
    window.__artRemote={text:input.content,sha:String(window.__artCalls.length%10).repeat(40),asset,pending};
    return {...pending,noteSHA:window.__artRemote.sha,asset};},
   status:async()=>({...window.__artRemote.pending,asset:window.__artRemote.asset})
  })};
 },remote);
}
async function connect(page){await page.locator('#edToken').fill('fake-artwork-token-never-persist');await page.locator('#edConnectForm button').click();await page.waitForFunction(()=>document.querySelector('#edConnectionStatus').textContent.includes('Connected'));}
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 let portable;
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:960},serviceWorkers:'block',acceptDownloads:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await start(page);
   const first=await artFile(page);await openImage(page);await page.locator('#edImageFile').setInputFiles(first);
   await page.waitForFunction(()=>document.querySelector('#edUploadStatus').textContent.startsWith('Ready.'));
   await page.locator('#edUseUpload').click();assert.match(await page.locator('#edUploadStatus').innerText(),/Describe the image/);
   await page.locator('#edUploadAlt').fill('Scout ] \\ "near" <mountains>');await page.locator('#edUseUpload').click();
   await page.waitForFunction(()=>document.querySelector('#edUploadStatus').textContent.startsWith('Image added'));
   const source=await page.locator('#edSource').inputValue();assert.match(source,/!\[Scout "near" <mountains>\]\(saeroth-art-[a-f0-9]{64}\.webp\)/);
   const downloaded=await backup(page);portable=JSON.parse(downloaded.raw);assert.match(downloaded.name,/-draft\.json$/);
   await contract.validate(portable.asset);assert.equal(portable.draft.artwork.sha256,portable.asset.sha256);
   const dimensions=contract.dimensions(contract.decode(portable.asset.data));assert.equal(dimensions.width,2048);assert(dimensions.height<2048);
   assert(!downloaded.raw.includes('fake-artwork-token'));
   await page.reload();await page.waitForFunction(()=>document.querySelector('#edArtworkSummary').textContent.includes('Artwork will publish'));
   await page.locator('[data-ed="preview"]').click();await page.waitForFunction(()=>document.querySelector('#edPreview img')?.naturalWidth===2048);
   assert.match(await page.locator('#edPreview img').getAttribute('src'),/^blob:/);
   await page.locator('[data-ed="source"]').click();await page.locator('#edName').fill('Renamed Artwork Scout');await page.locator('#edNation').selectOption('Vaelic Principality');
   assert.match(await page.locator('#edSource').inputValue(),new RegExp(contract.filename(portable.asset.sha256).replace('.','\\.')));
   for(const theme of ['light','dark']){
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.locator('#edArtworkSummary').scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,'editor-artwork-'+width+'-'+theme+'.png')});
   }
   await mockPublisher(page);await connect(page);await page.locator('#edPublish').click();await page.waitForFunction(()=>window.__artCalls.length===1);
   assert.equal(await page.evaluate(()=>window.__artCalls[0].path),'campaign/nations/Vaelic Principality/npcs/Renamed Artwork Scout.md');
   assert.equal(await page.evaluate(()=>window.__artCalls[0].asset.sha256),portable.asset.sha256);
   const second=await artFile(page,{color:'#324f6a',mime:'image/jpeg'});await choose(page,second,'Replacement portrait');
   await page.locator('#edPublish').click();await page.waitForFunction(()=>window.__artCalls.length===2);
   const replacement=await page.evaluate(()=>window.__artCalls[1]);assert.notEqual(replacement.asset.sha256,portable.asset.sha256);assert(!replacement.content.includes(contract.filename(portable.asset.sha256)));
   await page.locator('[data-ed="remove-upload"]').click();assert(!await page.locator('#edArtworkSummary').isVisible());
   await page.locator('#edPublish').click();await page.waitForFunction(()=>window.__artCalls.length===3);
   const removed=await page.evaluate(()=>window.__artCalls[2]);assert(!removed.asset);assert(!removed.content.includes('saeroth-art-'));
   assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('fake-artwork-token-never-persist'))),false);
   assert.deepEqual(errors,[]);await context.close();
  }
  // Complete backups restore without the originating browser's IndexedDB.
  const restored=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),page=await restored.newPage();await start(page,'Backup destination');
  const malformed=structuredClone(portable);malformed.asset.sha256='0'.repeat(64);
  await page.locator('#edRestoreFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))});
  await page.waitForFunction(()=>document.querySelector('#edBackupStatus').textContent.startsWith('Draft was not restored'));
  assert.equal(await page.locator('#edName').inputValue(),'Backup destination');
  await page.locator('#edRestoreFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(portable))});
  await page.waitForFunction(()=>document.querySelector('#edBackupStatus').textContent.startsWith('Draft restored'));
  assert.equal(await page.locator('#edName').inputValue(),portable.draft.name);assert(await page.locator('#edArtworkSummary img').isVisible());
  const roundtrip=JSON.parse((await backup(page)).raw);assert.equal(roundtrip.asset.sha256,portable.asset.sha256);
  // Corrupt/missing local image blocks publication without losing writing.
  await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const request=indexedDB.open('saeroth-entry-artwork-v1',1);request.onsuccess=()=>{const tx=request.result.transaction('images','readwrite');tx.objectStore('images').clear();tx.oncomplete=resolve;tx.onerror=reject;};});});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#edArtworkSummary').textContent.includes('missing from this browser'));
  await page.locator('#edPublish').click();assert.match(await page.locator('#edValidation').innerText(),/image is missing/);
  assert((await page.locator('#edSource').inputValue()).includes('A scout waiting'));
  // The pending PR can supply missing art, including on another device.
  await mockPublisher(page,{text:portable.draft.content+'\nA remotely revised note.\n',sha:'a'.repeat(40),asset:portable.asset,pending:{number:991,url:'https://github.com/Milec/Towers-of-Saeroth/pull/991',status:'pending'}});
  await connect(page);await page.locator('[data-ed="use-latest"]').click();await page.waitForFunction(()=>document.querySelector('#edArtworkSummary').textContent.includes('Artwork will publish'));
  await page.locator('[data-ed="preview"]').click();await page.waitForFunction(()=>document.querySelector('#edPreview img')?.naturalWidth>0);
  await restored.close();
  // IDB failure is recoverable, including reset of a memory-only image.
  const limited=await browser.newContext({serviceWorkers:'block',acceptDownloads:true}),limitedPage=await limited.newPage();
  await limitedPage.addInitScript(()=>{IDBFactory.prototype.open=function(){throw new DOMException('Blocked','SecurityError');};});
  await start(limitedPage,'Unsaved art');await choose(limitedPage,await artFile(limitedPage,{width:400,height:300}));
  assert.match(await limitedPage.locator('#edDraftStatus').innerText(),/image is only in this tab/);assert(await limitedPage.evaluate(()=>window.SaerothEditor.hasUnsavedChanges()));
  const unsaved=JSON.parse((await backup(limitedPage)).raw);await contract.validate(unsaved.asset);
  await limitedPage.locator('[data-ed="reset"]').click();await limitedPage.locator('[data-ed="confirm-reset"]').click();await limitedPage.waitForFunction(()=>!document.querySelector('#edArtworkSummary')||document.querySelector('#edArtworkSummary').hidden);
  const recovery=JSON.parse((await backup(limitedPage,'.ed-recovery-link')).raw);assert.equal(recovery.asset.sha256,unsaved.asset.sha256);
  await limited.close();
  // Last selection wins; cancelling or navigating away invalidates pending conversion.
  const racing=await browser.newContext({serviceWorkers:'block'}),race=await racing.newPage();await start(race,'Racing art');await openImage(race);
  const a=await artFile(race,{width:300,height:200,color:'#733'}),b=await artFile(race,{width:400,height:300,color:'#337'});
  const largeWebP=await artFile(race,{width:4096,height:2048,mime:'image/webp'});
  const preparedWebP=await race.evaluate(async data=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return window.SaerothEditorImages.prepare(new File([bytes],'large.webp',{type:'image/webp'}));},largeWebP.buffer.toString('base64'));
  assert.equal(preparedWebP.width,2048);assert.equal(preparedWebP.height,1024);await contract.validate(preparedWebP.payload);
  const rejection=await race.evaluate(async()=>{
   const result=[];
   for(const file of [new File(['<svg/>'],'unsafe.svg',{type:'image/svg+xml'}),new File([new Uint8Array(20*1024*1024+1)],'large.png',{type:'image/png'})]){
    try{await window.SaerothEditorImages.prepare(file);result.push(false);}catch(_){result.push(true);}
   }
   return result;
  });assert.deepEqual(rejection,[true,true]);
  await race.evaluate(()=>{const real=window.SaerothEditorImages.prepare;window.__held=[];window.SaerothEditorImages.prepare=file=>new Promise(resolve=>window.__held.push(async()=>resolve(await real(file))));});
  await race.locator('#edImageFile').setInputFiles(a);await race.locator('#edImageFile').setInputFiles(b);
  await race.evaluate(()=>window.__held[1]());await race.waitForFunction(()=>document.querySelector('#edUploadStatus').textContent.startsWith('Ready.'));
  const selected=await race.locator('#edUploadPreview img').getAttribute('src');await race.evaluate(()=>window.__held[0]());assert.equal(await race.locator('#edUploadPreview img').getAttribute('src'),selected);
  await race.locator('#edImageFile').setInputFiles([]);assert.equal(await race.locator('#edUploadPreview img').getAttribute('src'),selected,'Cancelling the picker preserves the previous selection');
  await race.locator('#edImageFile').setInputFiles(a);await race.locator('[data-ed="cancel-upload"]').click();await race.evaluate(()=>window.__held[2]());assert(!await race.locator('#edUploadPreview').isVisible());
  await race.locator('#edImageFile').setInputFiles(a);await race.goto(base+'#/library');await race.evaluate(()=>window.__held[3]());assert.equal(await race.locator('#edUploadPreview').count(),0);
  await racing.close();
  console.log('Editor artwork: PNG/JPEG resize, safe preview, alt text, reload, phone/desktop themes, atomic publisher payload, pending replacement/removal, rename/refile, complete backup restore, missing image recovery, IDB failure/reset recovery, token secrecy, selection races/cancellation/navigation pass.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
