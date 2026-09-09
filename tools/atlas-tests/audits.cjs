const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
async function cacheChecks(){
 for(const failure of ['open','put']){
  const events={},deleted=[];
  const cache={match:async()=>undefined,put:async()=>{if(failure==='put')throw Error('quota');}};
  const scope='https://example.test/Towers/';
  const context={URL,Response,location:new URL(scope),fetch:async()=>new Response('network works'),caches:{open:async()=>{if(failure==='open')throw Error('disabled');return cache;},keys:async()=>['unrelated-v1','shell-v120','saeroth-/Towers/-shell-v120','saeroth-/Towers/-notes'],delete:async k=>deleted.push(k)},self:{registration:{scope},clients:{claim:async()=>{}},addEventListener:(k,v)=>events[k]=v}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../site/sw.js'),'utf8'),context);
  for(const resource of ['atlas/app.js','content/campaign/test.md','app.js']){let result;events.fetch({request:{url:scope+resource,method:'GET'},respondWith:p=>result=p});assert.equal(await(await result).text(),'network works',failure+' '+resource);}
  let activated;events.activate({waitUntil:p=>activated=p});await activated;assert.deepEqual(deleted,['saeroth-/Towers/-shell-v120']);
 }
 console.log('PASS: cache open/write failures preserve network responses; cleanup is scope-owned.');
}
(async()=>{
 await cacheChecks();
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const errors=[];
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('heading',{name:'Explore Saeroth',exact:true}).waitFor();
 await page.locator('#graphBtn').click();await page.waitForFunction(()=>window.__g?.nodes?.length>0);await page.locator('#gLeave').click();
 for(const a of await page.locator('.home-actions a').all()){const href=await a.getAttribute('href');if(!href.includes('atlas'))assert(fs.existsSync(path.join(__dirname,'../..',decodeURI(href.slice(2)))));}
 console.log('Checking search');await page.locator('#searchBtn').click();await page.locator('#searchInput').fill('Vaelic');
 await page.locator('#searchModal select').selectOption('Places');await page.locator('#searchResults a[href*="atlas#nation-"]').first().waitFor();
 for(let i=0;i<20;i++){await page.keyboard.press('Shift+Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('#searchModal')));}
 await page.keyboard.press('Escape');assert(await page.locator('#searchModal').isHidden());assert.equal(await page.locator('#searchBtn').evaluate(e=>e===document.activeElement),true);
 console.log('Checking route race');
 // Releasing an old successful response must not remove a newer atlas route.
 let pending,signal;const received=new Promise(r=>signal=r);
 await page.route('**/content/campaign/nations/Dalstan/Dalstan.md',r=>{pending=r;signal();});
 await page.evaluate(()=>location.hash='#/campaign/nations/Dalstan/Dalstan.md');await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(Error('Delayed note request was not observed')),10000))]);
 await page.evaluate(()=>location.hash='#/atlas#nation-3');
 const frame=page.frameLocator('.atlas-frame');await frame.locator('a.campaign-link').waitFor();await pending.fulfill({status:200,body:'# Stale Dalstan'});
 const inner=page.frames().find(f=>f.url().includes('/atlas/'));
 await inner.evaluate(()=>show('nation',8));await page.waitForFunction(()=>location.hash==='#/atlas#nation-8');assert.equal(await page.locator('.atlas-frame').count(),1);
 await page.evaluate(()=>location.hash='#/atlas#nation-3');await frame.locator('#info h2').filter({hasText:'Vaelic'}).waitFor();
 await frame.locator('[data-jump="info"]').click();
 await inner.waitForFunction(()=>{const r=document.querySelector('.atlas-jumps').getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;});
 await frame.locator('[data-jump="journey"]').click();await frame.locator('#journeyFrom').waitFor({state:'visible'});
 await frame.locator('[data-jump="map"]').click();
 await page.goto(base+'#/campaign/nations/Political%20Relations.md');await page.locator('.nation-picker button').first().waitFor();
 assert(await page.locator('.rel-canvas').isHidden());await page.locator('.diagram-tools input').fill('Vaelic');await page.locator('.nation-picker button:visible').click();assert((await page.locator('.rel-ledger').innerText()).includes('Vaelic'));
 await page.getByRole('button',{name:'Show relationship diagram',exact:true}).click();assert(await page.locator('.rel-canvas').isVisible());
 await page.goto(base+'#/campaign/world/Trade%20Routes.md');await page.locator('.route-svg').waitFor();assert(await page.locator('.route-svg').evaluate(e=>e.getBoundingClientRect().width<=innerWidth));
 await page.goto(base+'players/#The%20Nations');await page.getByRole('combobox',{name:'Find a nation on the map'}).selectOption({label:'Vaelic Principality'});await page.locator('.pcard h3').filter({hasText:'Vaelic'}).waitFor();
 for(const b of await page.locator('.pzoom').all())assert((await b.boundingBox()).height>=44);
 assert.deepEqual(errors,[]);console.log('PASS: route race, atlas URL selection, mobile persistent navigation, scoped search/focus, nation picker, fit trade map, player map controls.');
 await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
