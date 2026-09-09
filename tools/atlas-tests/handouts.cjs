const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'atlas/#nation-3');await page.locator('#handoutExport').waitFor();
 const cases=await page.evaluate(()=>[['nation',3],['province',D.provinces.find(p=>p?.i&&!p.removed&&p.state===3)?.i],['nation',D.states.find(s=>/Thurion/.test(s.fullName||''))?.i]]);
 for(const [type,id] of cases){assert(id);await page.evaluate(([t,i])=>show(t,i),[type,id]);await page.locator('#handoutHide').check();await page.locator('#handoutFit').click();if(type==='province')await page.locator('#handoutHide').uncheck();
 const download=page.waitForEvent('download',{timeout:120000});await page.locator('#handoutExport').click();
 const file=await download;await file.saveAs(path.join(__dirname,'../../..','output',`handout-${type}-${id}.png`));
 const result=await page.evaluate(async()=>{
  const img=new Image();img.src=document.querySelector('#handoutStatus a').href;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
  const region=selected.type==='nation'?D.countries.find(c=>c.properties.state===selected.id):D.provinces.find(p=>p?.i===selected.id);
  const shape=document.createElementNS(NS,'path');shape.setAttribute('d',region.path);map.append(shape);const b=shape.getBBox();shape.remove();const pad=Math.max(12,Math.max(b.width,b.height)*.04);const crop=[b.x-pad,b.y-pad,b.width+2*pad,b.height+2*pad];
  const checker=document.createElement('canvas').getContext('2d'),territory=new Path2D(region.path),h=img.height-96;let outside=0,leaks=0,inside=0,painted=0;
  for(let y=3;y<h;y+=11)for(let x=3;x<img.width;x+=11){const v=ctx.getImageData(x,y,1,1).data,isPaper=v[0]===247&&v[1]===240&&v[2]===223&&v[3]===255;const px=crop[0]+x/img.width*crop[2],py=crop[1]+y/h*crop[3];if(checker.isPointInPath(territory,px,py,'evenodd')){inside++;if(!isPaper)painted++;}else{const dx=3*crop[2]/img.width,dy=3*crop[3]/h;const near=[[-dx,-dy],[dx,-dy],[-dx,dy],[dx,dy]].some(([a,b])=>checker.isPointInPath(territory,px+a,py+b,'evenodd'));if(!near){outside++;if(!isPaper)leaks++;}}}
  return {width:img.width,height:img.height,outside,leaks,inside,painted};
 });console.log(type,id,result);assert(result.outside>10);assert(result.leaks===0,'Outside pixels exposed');assert(result.painted>result.inside*.2,'Territory missing');
 }
 await page.evaluate(()=>show('burg',1));assert(await page.locator('#handoutCover').evaluate(e=>getComputedStyle(e).display==='none'));assert.equal(await page.locator('#handoutExport').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: nation, province, archipelago PNG exports, exterior redaction and selection reset.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
