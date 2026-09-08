/* Progressive cartographic detail. Geometry and lore records remain unchanged. */
let detailMode='auto';try{detailMode=localStorage.getItem('saeroth-detail')||'auto';}catch{}
if(!['auto','all'].includes(detailMode))detailMode='auto';
const detailTools=document.createElement('div');detailTools.className='detail-tools';
detailTools.innerHTML=`<label for="detailMode">Detail as you explore</label><select id="detailMode"><option value="auto">Automatic · reveal detail as I zoom</option><option value="all">All detail · use my tier filters</option></select><p id="detailReadout" class="muted" aria-live="polite"></p>`;
filterPanel.querySelector('summary').after(detailTools);$('#detailMode').value=detailMode;
$('#detailMode').onchange=e=>{detailMode=e.target.value;try{localStorage.setItem('saeroth-detail',detailMode);}catch{}renderView();};
// Migrate the old untouched defaults so small-place names can now emerge naturally.
try{if(!localStorage.getItem('saeroth-detail')&&tiers.every(t=>tierPrefs[t].icons&&tierPrefs[t].names===['city','metropolis'].includes(t))){for(const t of tiers)tierPrefs[t].names=true;localStorage.setItem('saeroth-tiers',JSON.stringify(tierPrefs));}}catch{}
filterPanel.querySelectorAll('[data-tier]').forEach(e=>e.checked=tierPrefs[e.dataset.tier][e.dataset.part]);
filterPanel.querySelector('.muted:not(#detailReadout)').textContent='Names follow visible symbols. Layer and tier switches apply at every zoom.';
filterPanel.addEventListener('click',e=>{if(e.target.dataset.preset==='all'){detailMode='all';$('#detailMode').value='all';try{localStorage.setItem('saeroth-detail','all');}catch{}renderView();}});
const geo=document.createElementNS(NS,'g');geo.id='geographiclabels';geo.setAttribute('pointer-events','none');$('#labels').insertBefore(geo,$('#townlabels'));
$('#layerlist').insertAdjacentHTML('beforeend','<label><input type="checkbox" data-layer="geographiclabels" checked>Geographic names</label>');
const polishedImage=(name,w,h)=>`<image href="assets/detail-${name}.png" x="${-w/2}" y="${-h*.72}" width="${w}" height="${h}"/>`;
$('#icondefs').insertAdjacentHTML('beforeend',`<g id="poi-bridge">${polishedImage('bridge',40,27)}</g><g id="icon-harbor-entrance">${polishedImage('harbor',32,25)}</g>`);
$('#poi-pass').innerHTML=polishedImage('pass-aligned',54,45);
for(const m of D.markers.filter(m=>/bridge/.test(m.type)))$('#pois [data-id="'+m.i+'"] use').setAttribute('href','#poi-bridge');
// Harbor artwork belongs to recorded ports only; Highforge stays inland.
for(const e of document.querySelectorAll('#ports [data-id]')){const b=burg(e.dataset.id);e.innerHTML=`<title>${esc(b.name)} · harbor entrance</title>${icon('harbor-entrance',b.x+17,b.y+12,.8)}`;}
$('[data-layer="ports"]').parentElement.lastChild.textContent='Harbor entrances';
$('#symbolLegend').insertAdjacentHTML('beforeend',`<h3>New cartographic details</h3><span><svg viewBox="-24 -25 48 42"><use href="#poi-bridge"/></svg>Stone bridge</span><span><svg viewBox="-30 -35 60 55"><use href="#poi-pass"/></svg>Mountain saddle</span><span><svg viewBox="-20 -23 40 36"><use href="#icon-harbor-entrance"/></svg>Harbor entrance</span>`);
const legendNote=$('#symbolLegend h3 + p');if(legendNote)legendNote.textContent='Major landmarks remain visible. Other landmarks, bridges and inns emerge as you zoom. Search finds every recorded place at any scale.';
const landmarkKind=m=>/mountain-pass/.test(m.type)?'Pass':/volcano/.test(m.type)?'Volcano':/bridge/.test(m.type)?'Bridge':/mine/.test(m.type)?'Mine':/inn/.test(m.type)?'Inn':/ruin/.test(m.type)?'Ruins':/fort/.test(m.type)?'Fort':/cave|dungeon/.test(m.type)?'Cave':/shrine|temple/.test(m.type)?'Shrine':/tower/.test(m.type)?'Tower':'';
const settlementEls=[...document.querySelectorAll('#settlements .burg')].map(e=>[e,burg(e.dataset.id)]);
const settlementElById=new Map(settlementEls.map(([e,b])=>[b.i,e]));
const portEls=[...document.querySelectorAll('#ports [data-id]')].map(e=>[e,burg(e.dataset.id)]);
const markerMap=new Map(D.markers.map(m=>[m.i,m]));
const markerEls=[...document.querySelectorAll('#pois .landmark')].map(e=>[e,markerMap.get(+e.dataset.id)]);
const routeEls=[...document.querySelectorAll('#roads [data-type],#trails [data-type],#searoutes [data-type]')];
// Remove legacy pass captions; the POI label renderer owns these names.
for(const e of document.querySelectorAll('#nationlabels text'))if(e.textContent.startsWith('⌁'))e.remove();
const poiLabels=document.createElementNS(NS,'g');poiLabels.id='poilabels';poiLabels.setAttribute('pointer-events','none');$('#labels').insertBefore(poiLabels,$('#townlabels'));
const labelLayerNodes=new Map(),labelLayerControls=new Map();
const layerEnabled=id=>{
 if(!labelLayerNodes.has(id))labelLayerNodes.set(id,document.getElementById(id));
 if(!labelLayerControls.has(id))labelLayerControls.set(id,$('[data-layer="'+id+'"]'));
 return !labelLayerNodes.get(id)?.hasAttribute('hidden')&&(labelLayerControls.get(id)?.checked??true);
};
const nationText=[...document.querySelectorAll('#nationlabels text')].map(e=>({e,size:+e.getAttribute('font-size')||14,x:+e.getAttribute('x'),y:+e.getAttribute('y')}));
const iconZoom={metropolis:0,city:1.5,town:3,village:6},nameZoom={metropolis:0,city:2,town:4,village:8};
const inView=(x,y,pad=0)=>x>=box[0]-pad&&x<=box[0]+box[2]+pad&&y>=box[1]-pad&&y<=box[1]+box[3]+pad;
const chosen=(type,id)=>selected?.type===type&&selected.id===id;
function occupiedRect(x,y,w,h){return [x,y,w,h];}
function intersects(a,b){return a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];}
renderSettlementNames=function(z,unit){
 const all=detailMode==='all',print=!!window.ATLAS_PRINT,occupied=[],labels=[],poiNames=[];
 for(const t of tiers){
  const control=filterPanel.querySelector('[data-tier="'+t+'"][data-part="names"]');
  control.disabled=!layerEnabled('settlements')||!layerEnabled('townlabels')||!tierPrefs[t].icons;
  control.title=control.disabled?'Enable this settlement tier and settlement names to show labels.':'Show names for this tier';
 }
 for(const [e,b] of settlementEls)e.toggleAttribute('hidden',!layerEnabled('settlements')||!tierPrefs[tier(b)].icons||(!all&&!b.capital&&!chosen('burg',b.i)&&z<iconZoom[tier(b)]));
 for(const [e,b] of portEls)e.toggleAttribute('hidden',!layerEnabled('settlements')||!tierPrefs[tier(b)].icons||(!all&&!chosen('burg',b.i)&&z<3));
 for(const [e,m] of markerEls){const major=m.loreSource||/volcano|mountain-pass/.test(m.type);const min=/inn|bridge|fair|ruin|cave|dungeon/.test(m.type)?4:2.5;e.toggleAttribute('hidden',!all&&!major&&!chosen('poi',m.i)&&z<min);}
 for(const e of routeEls){const min=e.parentElement.id==='trails'?3:e.parentElement.id==='searoutes'?1.3:0;e.toggleAttribute('hidden',!all&&!chosen('route',+e.dataset.id)&&z<min);}
 // Keep transport ink from becoming broad ribbons at close zoom.
 for(const [id,width,cap] of [['roads',1.65,1.8],['trails',1.05,1.1],['searoutes',1.7,1.7]]){
  const layer=document.getElementById(id);
  layer.style.setProperty('--route-weight',Math.min(width,cap*unit));
 }
 // Production badges are regional detail unless a specific good was requested.
 for(const e of $('#goodsmap').children)e.toggleAttribute('hidden',!all&&z<3&&!+$('#resource').value);
 // Country text scales down at close range, and never survives as baked background text.
 for(const n of nationText){const title=n.size>=40||/ALTERNATE GEOLOGICAL|EDITION/.test(n.e.textContent);const geographic=/MIDDLE|SOUTHERN/.test(n.e.textContent),enabled=title||n.e.textContent.includes('EDITION')?true:layerEnabled(geographic?'geographiclabels':'countries');n.e.toggleAttribute('hidden',!enabled||(title?z>1.8:n.size>=20&&z>7));n.e.setAttribute('font-size',Math.min(n.size,(n.size>=20?22:12)*unit));
  if(!n.e.hasAttribute('hidden')&&inView(n.x,n.y)){const w=n.e.textContent.length*Math.min(n.size,22*unit)*.59;occupied.push(occupiedRect(n.x-w/2,n.y-20*unit,w,24*unit));}}
 const visible=D.burgs.filter(b=>layerEnabled('settlements')&&layerEnabled('townlabels')&&tierPrefs[tier(b)].icons&&tierPrefs[tier(b)].names&&!settlementElById.get(b.i).hasAttribute('hidden')&&inView(b.x,b.y)&&(!print||b.capital||tier(b)==='metropolis')&&(all||b.capital||chosen('burg',b.i)||z>=nameZoom[tier(b)])).sort((a,b)=>Number(chosen('burg',b.i))-Number(chosen('burg',a.i))||(b.capital||0)-(a.capital||0)||b.population-a.population);
 for(const b of visible){const font=chosen('burg',b.i)?14:12,gap=Math.max(8,(+settlementElById.get(b.i).dataset.displayWidth||16)/unit*.55+3),w=(b.name.length*font*.58+10)*unit,h=(font+5)*unit;
  for(const [dx,dy] of [[gap,-8],[gap,17],[-w/unit-gap,-8],[-w/unit-gap,17]]){const x=b.x+dx*unit,y=b.y+dy*unit,r=occupiedRect(x-2*unit,y-h,w,h+3*unit);if(occupied.some(a=>intersects(a,r)))continue;occupied.push(r);labels.push(`<text data-place="burg-${b.i}" x="${x}" y="${y}" font-size="${font*unit}" stroke-width="${2.8*unit}">${esc(b.name)}</text>`);break;}}
 // Give named landmarks alternate positions and keep their labels with POIs.
 if(layerEnabled('pois'))for(const [e,m] of markerEls){
  const major=!!m.loreSource||/volcano|mountain-pass/.test(m.type),[mx,my]=m.symbolPoint||[m.x,m.y];
  if((print&&!major)||/sacred-forest|sacred-piner|sacred-palm/.test(m.type)||e.hasAttribute('hidden')||!inView(mx,my)||(!all&&z<(major?2:4)&&!chosen('poi',m.i)))continue;
  const rawName=note('marker'+m.i)?.name;if(!rawName)continue;
  const kind=landmarkKind(m),name=kind&&!rawName.toLowerCase().includes(kind.toLowerCase())?rawName+' · '+kind:rawName;
  const gap=Math.max(8,(+e.dataset.displayWidth||20)/unit*.55+3),w=(name.length*6.3+8)*unit;
  for(const [dx,dy] of [[gap,15],[gap,-10],[-w/unit-gap,15],[-w/unit-gap,-10]]){
   const x=mx+dx*unit,y=my+dy*unit,r=occupiedRect(x,y-14*unit,w,18*unit);
   if(occupied.some(a=>intersects(a,r)))continue;
   occupied.push(r);poiNames.push(`<text data-place="poi-${m.i}" class="landmark-label" x="${x}" y="${y}" font-size="${11*unit}" stroke-width="${2.2*unit}">${esc(name)}</text>`);break;
  }
 }
 poiLabels.innerHTML=poiNames.join('');
 $('#townlabels').innerHTML=labels.join('');
 geo.innerHTML=window.ATLAS_POLISH.labels.filter(g=>layerEnabled('geographiclabels')&&(g.kind==='river'||layerEnabled('relief'))&&(g.kind!=='forest'||layerEnabled('pois'))&&inView(g.x,g.y)&& (all||z>=g.minZoom)).map((g,i)=>{const font=(g.kind==='mountain'?13:11)*unit,w=g.name.length*font*.6;if(w>g.span*1.5)return '';const rad=g.angle*Math.PI/180,bw=Math.abs(Math.cos(rad))*w+Math.abs(Math.sin(rad))*font*2,bh=Math.abs(Math.sin(rad))*w+Math.abs(Math.cos(rad))*font*2,r=occupiedRect(g.x-bw/2,g.y-bh/2,bw,bh);if(occupied.some(a=>intersects(a,r)))return '';occupied.push(r);const arc=Math.min(8*unit,g.span*.05);return `<g class="geo-name geo-${g.kind}" transform="translate(${g.x} ${g.y}) rotate(${g.angle})"><title>${esc(g.source)}</title><path id="geo-curve-${i}" d="M${-w*.58},0 Q0,${-arc} ${w*.58},0" fill="none" stroke="none"/><text font-size="${font}" stroke-width="${2.8*unit}" text-anchor="middle"><textPath href="#geo-curve-${i}" startOffset="50%">${esc(g.name)}</textPath></text></g>`;}).join('');
 // A disabled component must not leave a selection outline or status caption.
 const selectionLayer=selected?.type==='burg'?'settlements':selected?.type==='poi'?'pois':selected?.type==='crossing'?'crossings':selected?.type==='nation'?'countries':selected?.type==='province'?'provinces':selected?.type==='route'?D.routes.find(r=>r.i===selected.id)?.group:null;
 const selectedBurg=selected?.type==='burg'?burg(selected.id):null;
 const selectionVisible=!selectionLayer||layerEnabled(selectionLayer)&&(!selectedBurg||tierPrefs[tier(selectedBurg)].icons);
 $('#selection').toggleAttribute('hidden',!selectionVisible);
 $('#status').toggleAttribute('hidden',!selectionVisible);
 const stage=all?'All detail':z<1.5?'World · capitals and major landmarks':z<3?'Regional · cities and sea lanes':z<6?'Local · towns, minor roads and harbors':z<8?'Close · villages and local landmarks':'Close · village names and local landmarks';
 if($('#detailReadout').textContent!==stage)$('#detailReadout').textContent=stage;
};
const polishedShow=show;show=function(type,id,fly=true){polishedShow(type,id,fly);renderView();};
renderView();

// A distance reference follows the same 2 km per map unit as journey planning.
$('#mapHome').onclick=()=>$('#fit').click();
const atlasScaleRender=renderSettlementNames;
renderSettlementNames=function(z,unit){
 atlasScaleRender(z,unit);
 const ideal=unit*2*95,power=10**Math.floor(Math.log10(ideal));
 const km=[5,2,1].map(n=>n*power).find(n=>n<=ideal)||power/2;
 $('#scaleDistance').textContent=km.toLocaleString()+' km';
 $('#scaleLine').style.width=(km/(unit*2))+'px';
};
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>renderView()).observe(map);
renderView();
