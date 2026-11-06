const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const {harness,note,REGISTRY} = require('./publisher.cjs');
const base = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8899/';
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try {
    const context=await browser.newContext({serviceWorkers:'block'}), page=await context.newPage(), h=harness(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://api.github.com/**',async route=>{
      const request=route.request();
      if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});return;}
      try {
        const response=await h.request(request.url(),{method:request.method(),headers:{Authorization:await request.headerValue('authorization')},body:request.postData()});
        await route.fulfill({status:response.status,headers:{'access-control-allow-origin':'*'},json:response.ok?await response.json():{message:'fixture failure'}});
      } catch(error) {
        if(error.message.startsWith('lost response'))await route.abort('failed');
        else {errors.push(error.message);await route.fulfill({status:500,json:{message:'Fixture mismatch'}});}
      }
    });
    await page.goto(base+'#/new');
    await page.locator('#edName').fill('Website Publisher Probe');
    const path='campaign/npcs/Website Publisher Probe.md', first=note('Website Publisher Probe','A scout created directly from the campaign website.').replace('type: location','type: npc');
    await page.locator('#edSource').fill(first);
    await page.locator('#edToken').fill('test-token');
    await page.locator('#edConnectForm button').click();
    await page.locator('#edConnectionStatus').filter({hasText:'Connected for this tab'}).waitFor({state:'attached'});
    assert.equal(await page.locator('#edToken').inputValue(),'');
    assert(!(await page.evaluate(()=>JSON.stringify({...localStorage}))).includes('test-token'),'Credentials must never enter persisted drafts');
    await page.locator('#edPublish').click();
    await page.locator('#edPublishStatus').filter({hasText:'Submitted for verification'}).waitFor();
    assert.equal(h.pulls.length,1);
    let head=h.refs.get(h.pulls[0].head.ref);
    assert.equal(h.files(head)[path],first);
    assert(h.files(head)[REGISTRY].includes('[[Website Publisher Probe]]'));
    const updated=first+'\nShe watches the northern road.\n';
    await page.locator('#edSource').fill(updated);
    h.setFailure('/git/refs/heads/'+h.pulls[0].head.ref,'PATCH','lost');
    await page.locator('#edPublish').click();
    await page.locator('#edPublishStatus').filter({hasText:'connection was interrupted'}).waitFor();
    assert.equal(await page.locator('#edSource').inputValue(),updated);
    await page.locator('#edPublish').click();
    await page.locator('#edPublishStatus').filter({hasText:'Submitted for verification'}).waitFor();
    assert.equal(h.pulls.length,1,'Actual editor retry must resume the same PR');
    head=h.refs.get(h.pulls[0].head.ref);assert.equal(h.files(head)[path],updated);
    h.refs.set('main',head);h.pulls[0].state='closed';h.pulls[0].merged=true;
    await page.locator('#edCheckStatus').click();
    await page.locator('#edPublishStatus').filter({hasText:'Merged.'}).waitFor();
    assert(!(await page.evaluate(()=>JSON.stringify({...localStorage}))).includes('test-token'));
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('Editor/publisher: real browser client against mock GitHub created, revised, recovered a lost write, checked merge status, and kept tokens out of drafts.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
