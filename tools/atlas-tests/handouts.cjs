const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');
const base=process.env.ATLAS_TEST_URL||'http://127.0.0.1:8899/';
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const original=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type.startsWith('image/svg+xml'))window.lastHandoutSVG=blob;return original.call(this,blob);};});
 await page.goto(base+'atlas/#nation-3');await page.locator('#handoutExport').waitFor();
 await page.locator('#sepiaMap').check();await page.reload();await page.locator('#handoutExport').waitFor();assert(await page.locator('#sepiaMap').isChecked());assert.equal(await page.locator('#map').evaluate(e=>getComputedStyle(e).filter),'sepia(1)');
 const cases=await page.evaluate(()=>[['province',43],['nation',3],['province',D.provinces.find(p=>p?.i&&!p.removed&&p.state===3)?.i],['nation',D.states.find(s=>/Thurion/.test(s.fullName||''))?.i]]);
 for(const [type,id] of cases){assert(id);await page.locator('#sepiaMap').setChecked(type==='nation');await page.evaluate(([t,i])=>show(t,i),[type,id]);await page.locator('#handoutHide').check();await page.locator('#handoutFit').click();if(type==='province')await page.locator('#handoutHide').uncheck();
 const download=page.waitForEvent('download',{timeout:120000});await page.locator('#handoutExport').click();
 const file=await download;await file.saveAs(path.join(__dirname,'../../..','output',`handout-${type}-${id}.png`));
 const result=await page.evaluate(async()=>{
  if(selected.type==='province'&&selected.id===43){
    const svg=new DOMParser().parseFromString(await window.lastHandoutSVG.text(),'image/svg+xml');
    for(const name of ['Valmont','Tisonville']){const b=D.burgs.find(b=>b.name===name),caption=svg.querySelector('[data-place="burg-'+b.i+'"]');if(caption?.querySelector('text')?.textContent!==name||!caption.querySelector('path').getAttribute('d').startsWith('M'+b.x+','+b.y+'L'))throw Error('Incorrect settlement label anchor: '+name);}
   }
  const img=new Image();img.src=document.querySelector('#handoutStatus a').href;await img.decode();
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
  const region=selected.type==='nation'?D.countries.find(c=>c.properties.state===selected.id):D.provinces.find(p=>p?.i===selected.id);
  const shape=document.createElementNS(NS,'path');shape.setAttribute('d',region.path);map.append(shape);const b=shape.getBBox();shape.remove();const pad=Math.max(12,Math.max(b.width,b.height)*.04);const crop=[b.x-pad,b.y-pad,b.width+2*pad,b.height+2*pad];
  const checker=document.createElement('canvas').getContext('2d'),territory=new Path2D(region.path),h=img.height-96;let outside=0,leaks=0,inside=0,painted=0,nonSepia=0;
  for(let y=3;y<h;y+=11)for(let x=3;x<img.width;x+=11){const v=ctx.getImageData(x,y,1,1).data,isPaper=v[0]===247&&v[1]===240&&v[2]===223&&v[3]===255;const px=crop[0]+x/img.width*crop[2],py=crop[1]+y/h*crop[3];if(checker.isPointInPath(territory,px,py,'evenodd')){inside++;if(!isPaper){painted++;if(v[0]<v[1]||v[1]<v[2])nonSepia++;}}else{const dx=3*crop[2]/img.width,dy=3*crop[3]/h;const near=[[-dx,-dy],[dx,-dy],[-dx,dy],[dx,dy]].some(([a,b])=>checker.isPointInPath(territory,px+a,py+b,'evenodd'));if(!near){outside++;if(!isPaper)leaks++;}}}
  return {width:img.width,height:img.height,outside,leaks,inside,painted,nonSepia};
 });console.log(type,id,result);if(type==='nation')assert.equal(result.nonSepia,0,'Sepia export contains colored map pixels');else assert(result.nonSepia>0,'Color export was not restored');assert(result.outside>10);assert(result.leaks===0,'Outside pixels exposed');assert(result.painted>result.inside*.2,'Territory missing');
 }
 await page.evaluate(()=>show('burg',1));assert(await page.locator('#handoutCover').evaluate(e=>getComputedStyle(e).display==='none'));assert.equal(await page.locator('#handoutExport').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: nation, province, archipelago PNG exports, exterior redaction and selection reset.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
