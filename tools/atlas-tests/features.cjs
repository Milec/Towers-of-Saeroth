const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../../site/atlas');
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
const files=['data.js','settlement-additions-data.js','settlement-additions.js','subprovinces-data.js','lore-features.js','icons.js','painted-manifest.js','painted-icons.js','app.js','routing-data.js','routing.js','journey-inputs.js','features.js','polish-data.js','polish.js','geography.js','settlement-hierarchy.js','route-alignment.js','background-detail.js'];
w.eval(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n'));
(async()=>{
 await new Promise(r=>setTimeout(r,60));
 const hs=w.settlementHierarchy([{id:1,x:0,y:0,population:100,width:20},{id:2,x:2,y:0,population:10,width:30},{id:3,x:100,y:0,population:1,width:20}]);
 assert.equal(hs[0],1);assert(hs[1]*30<20);assert.equal(hs[2],1);
 const ns=w.settlementHierarchy([{id:1,state:1,x:0,y:0,population:100,width:20},{id:2,state:1,capital:1,x:100,y:0,population:1,width:30},{id:3,state:2,x:200,y:0,population:1,width:20}]);
 assert.equal(ns[0],1);assert(Math.abs(ns[1]-Math.pow(.01,.25))<1e-12);assert.equal(ns[2],1);
 const displayed=[...d.querySelectorAll('#settlements .burg')].map(e=>({e,b:w.ATLAS.burgs.find(b=>b.i===+e.dataset.id),scale:+e.dataset.populationScale,width:+e.dataset.displayWidth}));
 assert(displayed.some(x=>x.scale<1));assert(displayed.some(x=>x.scale===1));
 const maxima=new Map();for(const {b} of displayed)if(b.state>0)maxima.set(b.state,Math.max(maxima.get(b.state)||0,b.population));
 let isolatedShrunk=0;
 for(const a of displayed){assert(a.scale>0&&a.scale<=1);let neighbors=0;for(const b of displayed){if(a===b||Math.hypot(a.b.x-b.b.x,a.b.y-b.b.y)>15)continue;neighbors++;if(a.b.population<b.b.population)assert(a.width<b.width);}const baseline=a.b.state>0?Math.pow(a.b.population/maxima.get(a.b.state),.25):1;assert(a.scale<=baseline+1e-12);if(!neighbors){assert(Math.abs(a.scale-baseline)<1e-12);if(a.scale<1)isolatedShrunk++;}assert(a.e.querySelector('circle'));}
 assert(isolatedShrunk>0);
 assert.equal(d.querySelectorAll('.settlement-summary').length,0);
 for(const e of d.querySelectorAll('#pois .landmark,#crossings > g')){
  if(e.dataset.landmarkImportance==='major')assert.equal(+e.dataset.poiScale,1);
  else assert(+e.dataset.poiScale>0&&+e.dataset.poiScale<=.85);
  assert(+e.dataset.displayWidth<=+e.dataset.sizeLimit+1e-9);
  assert(e.querySelector('circle'));assert(e.querySelector('.poi-art'));
 }
 assert(fs.existsSync(path.join(root,'assets/terrain-texture.png')));
 assert.equal(d.querySelectorAll('#pois [data-landmark-importance="major"]').length,10);
 for(const id of [0,1,2,3,4,5,6,7,10000,10001])assert.equal(+d.querySelector('#pois [data-id="'+id+'"]').dataset.poiScale,1);
 // Progressive detail preserves filters, search reveal and the master label order.
 assert.equal(d.querySelector('#detailMode').value,'auto');
 assert.equal(d.querySelectorAll('#trails [data-type]:not([hidden])').length,0);
 assert.equal(d.querySelectorAll('#settlements .tier-village:not(.capital):not([hidden])').length,0);
 for(const k of ['bridge','pass','harbor'])assert(fs.existsSync(path.join(root,'assets','detail-'+k+'.png')));
 assert(d.querySelector('#poi-bridge image'));assert(d.querySelector('#icon-harbor-entrance image'));
 assert(w.ATLAS_POLISH.labels.some(g=>g.kind==='river'));assert(w.ATLAS_POLISH.labels.some(g=>g.name==='Nordheim icefields'));
 w.zoom(.125);await new Promise(r=>setTimeout(r,40));
 assert(d.querySelectorAll('#settlements .tier-village:not([hidden])').length>0);
 assert(d.querySelectorAll('#trails [data-type]:not([hidden])').length>0);
 d.querySelector('#fit').click();await new Promise(r=>setTimeout(r,40));
 assert.equal(d.querySelectorAll('#trails [data-type]:not([hidden])').length,0);
 const tiny=w.ATLAS.burgs.find(b=>b.population*250<1000&&!b.capital);
 w.show('burg',tiny.i,false);await new Promise(r=>setTimeout(r,40));
 assert(!d.querySelector('#settlements [data-id="'+tiny.i+'"]').hasAttribute('hidden'));
 assert.equal(d.querySelectorAll('#settlements [data-type=burg]').length,1293);
 assert(w.ATLAS_ICONS.relief.filter(r=>r.canopy).length>5000);assert.equal(d.querySelector('#map').lastElementChild.id,'labels');assert.equal(d.querySelector('#nationlabels').parentElement.id,'labels');assert.equal(d.querySelector('#townlabels').parentElement.id,'labels');assert(d.querySelector('#nationlabels text'));assert(!d.querySelector('#nationlabels').textContent.includes('Highforge'));
 assert.equal(d.querySelectorAll('#pois [data-type=poi]').length,468);
 assert(d.querySelector('#poi-volcano'));assert(d.querySelector('#icon-highforge image'));assert(d.querySelector('#icon-mountain image'));assert(d.querySelector('#poi-volcano image'));for(const e of d.querySelectorAll('[clip-path]'))assert(d.getElementById(e.getAttribute('clip-path').slice(5,-1)));assert.equal(d.querySelectorAll('.lore-landmark').length,2);
 for(const use of d.querySelectorAll('use'))assert(d.getElementById(use.getAttribute('href').slice(1)),'Missing symbol '+use.getAttribute('href'));
 d.querySelector('[data-preset=none]').click();await new Promise(r=>setTimeout(r,30));
 assert.equal(d.querySelectorAll('#settlements .burg:not([hidden])').length,0);assert.equal(d.querySelectorAll('#townlabels text').length,0);
 d.querySelector('[data-preset=metropolis]').click();await new Promise(r=>setTimeout(r,30));
 for(const el of d.querySelectorAll('#settlements .burg:not([hidden])'))assert(el.classList.contains('tier-metropolis'));
 assert(d.querySelectorAll('#townlabels text').length>0);
 const names=d.querySelector('[data-tier=metropolis][data-part=names]');names.checked=false;names.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,30));assert.equal(d.querySelectorAll('#townlabels text').length,0);assert(d.querySelectorAll('#settlements .burg:not([hidden])').length>0);
 d.querySelector('[data-preset=all]').click();
 const network=w.ATLAS_NETWORK,router=new w.AtlasRouter(network);
 assert.equal(w.ATLAS_ADDITIONS.burgs.length,14);
 assert.equal(w.ATLAS.burgs.filter(b=>!b.modeledDistrictSeat).length,1279);
 for(const b of w.ATLAS_ADDITIONS.burgs){
  const p=w.ATLAS.provinces.find(p=>p?.i===b.province);
  const capital=w.ATLAS.burgs.find(b=>b.i===p.burg);
  assert.equal(b.population*250,200);assert.equal(b.culture,capital.culture);
  assert(router.find(b.cell,capital.cell,{sail:false,offroad:false}),b.name+' needs a continuous road/trail connection');
 }

 const melisor=w.ATLAS.burgs.filter(b=>b.state===19),mh=melisor.find(b=>b.capital),mt=melisor.find(b=>!b.capital);
 const magic=router.find(mh.cell,mt.cell,{sail:false,offroad:false,teleport:true});assert(magic&&magic.teleportLegs>0);assert(d.querySelector('#journeyTeleport'));assert(!d.querySelector('#journeyTeleport').checked);
 assert(w.ATLAS.crossings.length>400);assert(d.querySelector('#crossings'));assert.equal(d.querySelector('#map').lastElementChild.id,'labels');
 const alias=d.querySelector('#search');alias.value='Almenara';alias.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('#results button').click();assert.match(d.querySelector('#info h2').textContent,/Harrowgate/);

 const hf=w.ATLAS.burgs.find(b=>b.name==='Highforge');assert.equal(hf.port,0);assert(hf.mountainRelocation.elevation>1800);assert(hf.mountainRelocation.coastDistance>65);assert.equal(network.nodes[hf.cell][2],16);assert(router.find(hf.cell,hf.mountainRelocation.oldCell,{sail:false,offroad:false}));
 const frontier=w.ATLAS.routes.find(r=>r.atlasFrontierRoad);assert(frontier);assert(d.querySelector('#roads .frontier-road'));
 assert(router.find(frontier.points[0][2],frontier.points.at(-1)[2],{sail:false,offroad:false}),'Frontier road must connect without sailing or off-road travel');
 for(const p of frontier.points){assert(network.nodes[p[2]][4]);assert.notEqual(network.nodes[p[2]][2],12);}
 assert(w.ATLAS_ICONS.relief.filter(r=>r.gapFill).length>=85);assert(w.ATLAS_ICONS.relief.some(r=>r.illustratedRidgeOverride));
 // Pure graph cases: weighted roads win; sailing and off-road flags are enforced.
 const small=new w.AtlasRouter({kmPerUnit:1,nodes:[[0,0],[1,0],[2,0],[3,0],[4,0]],edges:[[0,1,'roads',0],[1,2,'overland',-1],[2,3,'searoutes',1]]});
 assert(small.find(0,3));assert.equal(small.find(0,3,{sail:false}),null);assert.equal(small.find(0,2,{offroad:false}),null);assert.equal(small.find(0,4),null);assert.equal(small.find(0,0).km,0);
 for(const [a,b,k] of network.edges)if(k==='overland')assert(network.nodes[a][4]&&network.nodes[b][4]);
 const capitals=w.ATLAS.burgs.filter(b=>b.capital),a=capitals.find(b=>b.state===3),b=capitals.find(b=>b.state===18);
 const land=router.find(a.cell,b.cell,{sail:false});assert(land);assert.equal(land.seaKm,0);
 const island=capitals.find(b=>b.state===11);const sea=router.find(a.cell,island.cell);assert(sea);assert(sea.seaKm>0);assert.equal(router.find(a.cell,island.cell,{sail:false}),null);
 d.querySelector('#journeyFrom').value=a.name;d.querySelector('#journeyTo').value=b.name;
 await d.querySelector('#journeyForm').onsubmit({preventDefault(){}});assert(d.querySelectorAll('#journeyOverlay path').length);assert.match(d.querySelector('#journeyResult').textContent,/moving time/);assert.equal(d.querySelector('#map').lastElementChild.id,'labels');
 d.querySelector('#journeyVia').value=capitals.find(b=>b.state===8).name;await d.querySelector('#journeyForm').onsubmit({preventDefault(){}});assert.equal(d.querySelectorAll('#journeyOverlay circle').length,3);
 d.querySelector('#journeyClear').click();assert.equal(d.querySelector('#journeyOverlay').children.length,0);
 const input=d.querySelector('#search');input.value='Emberthrone volcano';input.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('#results button').click();assert.match(d.querySelector('#info').textContent,/Approximate placement/);d.querySelector('#routeEnd').click();assert.match(d.querySelector('#journeyTo').value,/Emberthrone volcano/);

 // Layer dependencies: labels never outlive their symbols, including search.
 const tick=()=>new Promise(r=>setTimeout(r,40));
 const setLayer=async(id,on)=>{const input=d.querySelector('[data-layer="'+id+'"]');input.checked=on;input.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();};
 d.querySelector('#fit').click();d.querySelector('[data-preset=all]').click();await tick();
 await setLayer('pois',true);
 assert(d.querySelectorAll('#poilabels text').length>0);
 assert(![...d.querySelectorAll('#nationlabels text')].some(e=>e.textContent.startsWith('⌁')));
 await setLayer('pois',false);assert.equal(d.querySelectorAll('#poilabels text').length,0);assert.equal(d.querySelectorAll('.geo-forest').length,0);
 w.show('poi',10000,false);await tick();assert.equal(d.querySelectorAll('#poilabels text').length,0);
 assert(d.querySelector('#selection').hasAttribute('hidden'));assert(d.querySelector('#status').hasAttribute('hidden'));
 await setLayer('pois',true);
 await setLayer('townlabels',false);assert.equal(d.querySelectorAll('#townlabels text').length,0);assert(d.querySelectorAll('#poilabels text').length>0);
 await setLayer('townlabels',true);
 await setLayer('settlements',false);assert.equal(d.querySelectorAll('#townlabels text').length,0);
 w.show('burg',hf.i,false);await tick();assert.equal(d.querySelectorAll('#townlabels text').length,0);
 await setLayer('settlements',true);
 for(const tier of ['metropolis','city','town','village']){
  const input=d.querySelector('[data-tier="'+tier+'"][data-part="icons"]');input.checked=false;input.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();
  for(const label of d.querySelectorAll('#townlabels [data-place]'))assert(!d.querySelector('#settlements [data-id="'+label.dataset.place.slice(5)+'"]').classList.contains('tier-'+tier));
 }
 d.querySelector('[data-preset=all]').click();await tick();
 await setLayer('countries',false);
 assert([...d.querySelectorAll('#nationlabels text')].filter(e=>e.textContent==='Vaelic'||e.textContent==='Principality').every(e=>e.hasAttribute('hidden')));
 await setLayer('countries',true);
 await setLayer('relief',false);assert.equal(d.querySelectorAll('.geo-mountain,.geo-forest').length,0);
 await setLayer('relief',true);
 await setLayer('geographiclabels',false);assert.equal(d.querySelectorAll('#geographiclabels text').length,0);
 await setLayer('geographiclabels',true);
 assert.equal(d.querySelector('#map').lastElementChild.id,'labels');

 // Whole-map polish preserves detail while making scale and overview readable.
 assert.match(d.querySelector('#scaleDistance').textContent,/km$/);
 assert(d.querySelector('#mapHome').getAttribute('aria-label'));
 const relief=[...d.querySelector('#relief').children],firstNonCanopy=relief.findIndex(e=>!e.classList.contains('canopy'));
 assert(firstNonCanopy>5000);assert(relief.slice(firstNonCanopy).every(e=>!e.classList.contains('canopy')));
 w.zoom(.001);await tick();assert(+d.querySelector('#roads').style.getPropertyValue('--route-weight')<1.65);
 d.querySelector('#mapHome').click();await tick();assert.equal(d.querySelector('#zoom').textContent,'1.0×');
 w.ATLAS_PRINT=true;w.zoom(1);await tick();
 for(const e of d.querySelectorAll('#townlabels [data-place]')){const b=w.ATLAS.burgs.find(b=>b.i===+e.dataset.place.slice(5));assert(b.capital||b.population*250>=50000);}
 for(const e of d.querySelectorAll('#poilabels [data-place]'))assert.equal(d.querySelector('#pois [data-id="'+e.dataset.place.slice(4)+'"]').dataset.landmarkImportance,'major');

 // Artwork axes and displayed anchors agree with the associated road segment.
 const oriented=[...d.querySelectorAll('[data-aligned-route]')];assert(oriented.length>=282);
 for(const e of oriented){
  const error=(((+e.dataset.artRotation + +e.dataset.artAxis - +e.dataset.roadAngle)%180)+180)%180;
  assert(Math.min(error,180-error)<1e-8);
  const point=w.closestRoadPoint([+e.dataset.anchorX,+e.dataset.anchorY],[+e.dataset.alignedRoute]);
  assert(point.distance<1e-7);
  assert(e.querySelector('.road-oriented-art'));assert(e.querySelector('circle'));
 }
 for(const id of [0,1,2,3,28,29,30,31,32,33])assert(d.querySelector('#pois [data-id="'+id+'"] .road-oriented-art'));
 for(const m of w.ATLAS.markers.filter(m=>m.symbolPoint))assert(Math.hypot(m.symbolPoint[0]-m.x,m.symbolPoint[1]-m.y)<20);

 // Progressive background tiles: bounded, mode-correct, and safe on failure.
 w.ATLAS_PRINT=false;
 Object.defineProperty(d.querySelector('#map'),'clientWidth',{value:900,configurable:true});
 Object.defineProperty(d.querySelector('#map'),'clientHeight',{value:600,configurable:true});
 d.querySelector('#mapHome').click();await tick();w.updateBackgroundDetail();
 assert.equal(d.querySelector('#backgroundDetail').children.length,0);
 w.zoom(.01);await tick();w.updateBackgroundDetail();
 let tiles=[...d.querySelectorAll('#backgroundDetail image')];assert(tiles.length>0&&tiles.length<=12);
 for(const tile of tiles){assert(fs.existsSync(path.join(root,tile.getAttribute('href'))));assert.match(tile.dataset.tile,/^terrain-/);}
 const first=tiles[0];assert.equal(first.getAttribute('visibility'),'hidden');first.dispatchEvent(new w.Event('load'));assert(!first.hasAttribute('visibility'));
 first.dispatchEvent(new w.Event('error'));assert(!first.isConnected);assert(d.querySelector('#background').isConnected);
 d.querySelector('[data-style="political"]').click();w.updateBackgroundDetail();
 assert([...d.querySelectorAll('#backgroundDetail image')].every(e=>e.dataset.tile.startsWith('political-')));
 d.querySelector('[data-style="terrain"]').click();w.updateBackgroundDetail();
 assert([...d.querySelectorAll('#backgroundDetail image')].every(e=>e.dataset.tile.startsWith('terrain-')));
 const tileCount=d.querySelector('#backgroundDetail').children.length;first.dispatchEvent(new w.Event('error'));w.updateBackgroundDetail();assert.equal(d.querySelector('#backgroundDetail').children.length,tileCount);
 assert(w.backgroundTileKeys([-100,-100,4500,2600]).length<=12);
 assert.equal(w.backgroundTileKeys([-1000,-1000,20,20]).length,0);
 d.querySelector('#mapHome').click();await tick();w.updateBackgroundDetail();assert.equal(d.querySelector('#backgroundDetail').children.length,0);
 assert.equal(d.querySelector('#background').nextElementSibling.id,'backgroundDetail');
 assert.equal(d.querySelector('#map').lastElementChild.id,'labels');
 console.log(JSON.stringify({settlements:1293,landmarks:468,nodes:network.nodes.length,edges:network.edges.length,landRouteKm:Math.round(land.km),islandRouteKm:Math.round(sea.km),passed:'tier filters, labels, symbols, search, route graph, sailing restrictions, waypoints, controls'}));dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
