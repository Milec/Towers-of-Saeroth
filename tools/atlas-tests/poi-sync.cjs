const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
const shared={id:55,name:'Campaign Tower',kind:'tower',x:100,y:120,notes:'Edited in the campaign repository.',notePath:'campaign/world/locations/Campaign Tower.md',noteSHA:'a'.repeat(40)};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/campaign-pois.json',route=>route.fulfill({json:{version:1,pois:[shared]}}));
  await page.route('**/lore-index.json',async route=>{const response=await route.fetch(),body=await response.json();body.entries['custompoi-55']={name:shared.name,note:shared.notePath,direct:true};body.byNote[shared.notePath]=['custompoi-55'];await route.fulfill({json:body});});
  await page.goto(base+'#/atlas#custompoi-55');const frame=page.frameLocator('.atlas-frame');
  await frame.locator('#info h2').filter({hasText:shared.name}).waitFor();await frame.locator('#info').getByText(shared.notes,{exact:true}).waitFor();await frame.locator('#info a.campaign-link').waitFor();
  const inner=page.frames().find(f=>f.url().includes('/atlas/'));
  await inner.evaluate(()=>{
    window.syncCalls=[];
    POIGitHub.createClient=token=>({connect:async()=>{if(token!=='test-only-token')throw Error('Wrong fixture token');},sync:async(p,directory)=>{window.syncCalls.push({p,directory});return {notePath:p.notePath,noteSHA:'b'.repeat(40),url:'https://github.com/Milec/Towers-of-Saeroth/pull/1000'};}});
  });
  await frame.locator('#poiSync summary').click();await frame.locator('#poiSyncToken').fill('test-only-token');await frame.locator('#poiSyncConnect button').click();await frame.locator('#poiSyncStatus').getByText(/Connected/).waitFor();
  assert.equal(await frame.locator('#poiSyncToken').inputValue(),'');
  await frame.locator('#customPOIEdit').click();await frame.locator('#customPOINotes').fill('An encounter added from the map.');await frame.locator('#customPOIForm button[type=submit]').click();
  await frame.locator('#poiSyncStatus a').waitFor();const calls=await inner.evaluate(()=>window.syncCalls);assert.equal(calls.length,1);assert.equal(calls[0].p.notes,'An encounter added from the map.');
  const stored=await inner.evaluate(()=>JSON.parse(localStorage.getItem('saeroth-custom-pois-v1')).pois);assert.equal(stored[0].noteSHA,'b'.repeat(40));assert(stored[0].pendingReview);
  assert.equal(await inner.evaluate(()=>[localStorage,sessionStorage].some(s=>Object.values(s).some(v=>v.includes('test-only-token')))),false);
  // An unmerged draft must survive a reload against the older published note.
  await page.reload();await frame.locator('#info .note').filter({hasText:'An encounter added from the map.'}).waitFor();
  await frame.locator('#info button').filter({hasText:'Use published version'}).click();await frame.locator('#info button').filter({hasText:'Discard local changes'}).click();await frame.locator('#info .note').filter({hasText:shared.notes}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: campaign note → shared POI/lore link, save → sync, memory-only credential, pending review persistence and explicit published-version restore.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
