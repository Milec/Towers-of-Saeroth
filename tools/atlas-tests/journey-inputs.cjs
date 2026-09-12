const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  for(const mobile of [true,false]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
   // Reproduce a returning visitor receiving a controller update during input.
   await context.addInitScript(()=>{
    if('serviceWorker' in navigator)Object.defineProperty(navigator.serviceWorker,'controller',{get:()=>({postMessage(){}})});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'#/atlas');const frame=page.frameLocator('.atlas-frame');
   await frame.locator('#journeyFrom').waitFor();
   const inner=page.frames().find(f=>f.url().includes('/atlas/'));
   await inner.evaluate(()=>{window.inputTestIdentity='retained';});
   for(const id of ['journeyFrom','journeyTo','journeyVia']){
    const input=frame.locator('#'+id);await input.fill('a');
    const options=frame.locator('#'+id+'-suggestions [role=option]');
    assert.equal(await options.count(),8);
    assert.equal(await input.getAttribute('list'),null);
    assert(Number.parseFloat(await input.evaluate(e=>getComputedStyle(e).fontSize))>=16);
    await input.press('ArrowDown');await input.press('Enter');
    assert.match(await input.inputValue(),/\[#|\[landmark/);
    assert.equal(await input.getAttribute('aria-expanded'),'false');
   }
   await frame.locator('#journeyFrom').fill('Valmont');
   await frame.locator('#journeyFrom-suggestions [role=option]').first().click();
   const from=await frame.locator('#journeyFrom').inputValue();assert.match(from,/Valmont/);
   await frame.locator('#journeyTo').fill('Highforge');
   await frame.locator('#journeyTo-suggestions [role=option]').first().click();
   const to=await frame.locator('#journeyTo').inputValue();
   await frame.locator('#journeyVia').fill('');
   if(mobile)await page.setViewportSize({width:390,height:510});
   await frame.locator('#journeyFrom').focus();
   await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
   await page.getByRole('button',{name:'Refresh when ready'}).waitFor();
   assert.equal(await inner.evaluate(()=>window.inputTestIdentity),'retained');
   assert.equal(await frame.locator('#journeyFrom').inputValue(),from);
   await frame.locator('#journeyFrom').press('Escape');
   await frame.locator('#journeyForm button[type=submit]').click();
   await frame.locator('#journeyResult').getByText('moving time',{exact:false}).first().waitFor();
   await page.getByRole('button',{name:'Refresh when ready'}).click();
   await frame.locator('#journeyFrom').waitFor();
   assert.equal(await frame.locator('#journeyFrom').inputValue(),from);
   assert.equal(await frame.locator('#journeyTo').inputValue(),to);
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: mobile/desktop bounded pickers, keyboard/touch selection, viewport change, update without reload, route calculation, and draft restoration.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
