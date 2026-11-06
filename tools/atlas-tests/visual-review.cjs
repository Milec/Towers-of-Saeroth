// Optional local visual review. No screenshots are committed to the repository.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
const out=process.env.ATLAS_SCREENSHOT_DIR||path.join(__dirname,'../../_site/ui-review');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const errors=[];
 try{
  for(const width of [375,768,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   for(const [route,name,ready] of [['workspace','desk','.ws-hero'],['library','library','.ws-library-card'],['campaign/npcs/Karoline.md','entry','#readerContext']]){
    await page.goto(base+'#/'+encodeURI(route));await page.locator(ready).first().waitFor();
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('#content img')].filter(img=>img.getBoundingClientRect().top<innerHeight).map(img=>img.decode().catch(()=>{})));});
    for(const theme of ['light','dark']){
     await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
     await page.screenshot({path:path.join(out,`${name}-${width}-${theme}.png`)});
     const overflow=await page.evaluate(()=>({root:document.documentElement.scrollWidth>innerWidth,main:document.getElementById('main').scrollWidth>document.getElementById('main').clientWidth+1}));
     assert(!overflow.root&&!overflow.main,`${name} ${width} ${theme} overflow ${JSON.stringify(overflow)}`);
    }
   }
   await page.goto(base+'#/atlas');
   const frame=page.frameLocator('.atlas-frame');
   await frame.locator('.atlas-panel-layout').waitFor();
   for(const theme of ['light','dark']){
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    for(const tab of ['places','travel']){
     await frame.locator(`[data-atlas-panel="${tab}"]`).click();
     await page.screenshot({path:path.join(out,`atlas-${tab}-${width}-${theme}.png`)});
     assert.equal(await frame.locator('.atlas-task-panel:visible').count(),1);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: visual review rendered 30 screenshots, including the hosted atlas, across phone/tablet/desktop and both themes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
