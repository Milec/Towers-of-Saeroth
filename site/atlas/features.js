/* Atlas exploration controls; source data and the native Azgaar map stay intact. */
const tiers=['metropolis','city','town','village'];
const defaults=()=>Object.fromEntries(tiers.map(t=>[t,{icons:true,names:['metropolis','city'].includes(t)}]));
let tierPrefs=defaults();try{const p=JSON.parse(localStorage.getItem('saeroth-tiers'));if(p)for(const t of tiers)for(const k of ['icons','names'])if(typeof p[t]?.[k]==='boolean')tierPrefs[t][k]=p[t][k];}catch{}
const filterPanel=document.createElement('details');filterPanel.className='atlas-controls';filterPanel.open=false;
filterPanel.innerHTML=`<summary>Settlement detail</summary><div class="filter-presets"><button data-preset="all">All</button><button data-preset="metropolis">Metropolises only</button><button data-preset="city">Cities & larger</button><button data-preset="none">None</button></div><table class="tier-table"><thead><tr><th>Population tier</th><th>Icons</th><th>Names</th></tr></thead><tbody>${tiers.map(t=>`<tr><th>${t[0].toUpperCase()+t.slice(1)}<small>${{metropolis:'50,000+',city:'10,000–49,999',town:'1,000–9,999',village:'Under 1,000'}[t]}</small></th>${['icons','names'].map(k=>`<td><input type="checkbox" data-tier="${t}" data-part="${k}" aria-label="${t} ${k}" ${tierPrefs[t][k]?'checked':''}></td>`).join('')}</tr>`).join('')}</tbody></table><p class="muted">Crowns follow their settlement’s tier. Names avoid overlaps; zoom in for more.</p>`;
$('.layers').after(filterPanel);
function renderSettlementNames(z,unit){
 document.querySelectorAll('#pois .landmark').forEach(e=>{const m=D.markers.find(m=>m.i===+e.dataset.id);e.toggleAttribute('hidden',z<2.2&&!m.loreSource&&!/volcano|mountain-pass/.test(m.type));});
 const occupied=[];$('#townlabels').innerHTML=D.burgs.filter(b=>tierPrefs[tier(b)].names&&b.x>box[0]&&b.x<box[0]+box[2]&&b.y>box[1]&&b.y<box[1]+box[3]).sort((a,b)=>(b.capital||0)-(a.capital||0)||b.population-a.population).map(b=>{
  const x=b.x+8*unit,y=b.y-7*unit,w=(b.name.length*6.5+6)*unit,h=15*unit;
  if(occupied.some(r=>x<r[0]+r[2]&&x+w>r[0]&&y-h<r[1]&&y>r[1]-h))return '';
  occupied.push([x,y,w,h]);return `<text x="${x}" y="${y}" font-size="${12*unit}" stroke-width="${2.5*unit}">${esc(b.name)}</text>`;
 }).join('');
}
function applyTiers(){for(const t of tiers){document.querySelectorAll('#settlements .tier-'+t).forEach(e=>e.toggleAttribute('hidden',!tierPrefs[t].icons));}document.querySelectorAll('#ports [data-id]').forEach(e=>e.toggleAttribute('hidden',!tierPrefs[tier(burg(e.dataset.id))].icons));try{localStorage.setItem('saeroth-tiers',JSON.stringify(tierPrefs));}catch{}renderView();}
filterPanel.addEventListener('change',e=>{if(e.target.dataset.tier){tierPrefs[e.target.dataset.tier][e.target.dataset.part]=e.target.checked;applyTiers();}});
filterPanel.addEventListener('click',e=>{const preset=e.target.dataset.preset;if(!preset)return;for(const t of tiers){const on=preset==='all'||preset==='metropolis'&&t==='metropolis'||preset==='city'&&['city','metropolis'].includes(t);tierPrefs[t]={icons:on,names:on};}filterPanel.querySelectorAll('input').forEach(e=>e.checked=tierPrefs[e.dataset.tier][e.dataset.part]);applyTiers();});

// Original pen-and-wash landmark glyphs, with distinct silhouettes at atlas scale.
const glyphs={
 volcano:'<path fill="#766252" d="M-18 10L-7-6-4-9 1-7 6-9 10-1 19 10Z"/><path fill="#e09450" d="M-7-6Q0 1 6-9L2-3 7 9 2 6-1 0-5 5-3-3Z"/><path fill="none" d="M-11 7l5-8m17 9L7 1M-2-12q-7-6 0-9m6 8q8-8 2-12"/><ellipse cy="-8" rx="6" ry="2" fill="#572e29"/>',
 fortress:'<path fill="#e2d2ae" d="M-15 10V-9h4v4h4v-4h4v6h6v-6h4v4h4v-4h4v19Z"/><path fill="#5e655e" d="M-3 10V3q3-7 6 0v7"/><path d="M-12-1v5m24-5v5M-7 8V0m14 8V0"/>',
 pass:'<path fill="#c5bca5" d="M-18 10L-9-11-2 3 7-12 18 10Z"/><path fill="none" stroke="#f8ecd0" stroke-width="3" d="M0 11Q-7 6 0 1T3-5"/><path fill="#f1eada" d="M-12-4l3-7 3 7-3-2ZM4-5l3-7 3 7-3-2Z"/>',
 ruin:'<path fill="#c9b795" d="M-14 10V-8l6 2v5l4-2v13m6 0V-4l5-4 5 2v16Z"/><path fill="none" d="M-17 11h34M-11-4l3 2M5 3h5M-4 9l3-3 4 5"/>',
 mine:'<path fill="#b6ad92" d="M-17 10Q-15-12 0-12T17 10Z"/><path fill="#3e4540" d="M-8 10V1Q0-11 8 1v9Z"/><path stroke="#e7c392" stroke-width="2" d="M-9 9V-1h18V9M-5 14L-3 6m8 8L3 6M-4 10h8"/>',
 shrine:'<path fill="#e8d9b5" d="M-12 11V-2h24v13Z"/><path fill="#6e8171" d="M-16-2L0-13 16-2Z"/><path fill="#59645c" d="M-3 11V3h6v8"/><path d="M-8 3v5m16-5v5"/>',
 water:'<path fill="#b2cfca" d="M-12 5Q-14-7 0-15 14-7 12 5T-12 5Z"/><path fill="none" stroke="#f2edcf" stroke-width="2" d="M-7 1Q-8 8 0 8M-17 13q8-5 17 0t17 0"/>',
 tower:'<path fill="#e3d2ac" d="M-7 11L-5-9 0-16 5-9 7 11Z"/><path fill="#557a84" d="M-2-7h4v5h-4Zm0 9h4v5h-4Z"/><path d="M-12 11h24"/>',
 inn:'<path fill="#e1c89f" d="M-12 11V-2h24v13Z"/><path fill="#845c43" d="M-16-2L0-13 16-2Z"/><path fill="#5a5b48" d="M-3 11V3h6v8"/><path d="M10-8h9v10h-7M14-5v4m3-4v4"/>',
 forest:'<path fill="#687e5d" d="M-16 5l8-17 8 17Zm11 4L5-15 15 9Z"/><path stroke="#584d3c" d="M-8 3v10M5 6v9"/>',
 cave:'<path fill="#9c9a84" d="M-18 11L-13-5 0-13 13-4 18 11Z"/><path fill="#39443f" d="M-9 11Q-10-8 0-4 10-8 9 11Z"/>',
 danger:'<path fill="#d6bb97" d="M-10 3Q-17-15 0-15 17-15 10 3L5 5v7H-5V5Z"/><path fill="#4a4b43" d="M-8-6h5v5h-5Zm11 0h5v5H3ZM0-1l-3 5h6Z"/><path d="M-2 7v5m4-5v5"/>',
 monument:'<path fill="#d7c8a9" d="M-11 12v-4h22v4ZM-6 8V3H6v5ZM-4 3l1-14h6L4 3Z"/><circle cy="-15" r="3" fill="#d7c8a9"/>'
};
for(const [k,v] of Object.entries(glyphs))$('#icondefs').insertAdjacentHTML('beforeend',`<g id="poi-${k}" stroke="#42463d" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">${v}</g>`);
function poiKind(t){return /volcano/.test(t)?'volcano':/fortress/.test(t)?'fortress':/pass/.test(t)?'pass':/mine/.test(t)?'mine':/ruin|battlefield/.test(t)?'ruin':/water|spring/.test(t)?'water':/forest|piner|palm/.test(t)?'forest':/inn|fair/.test(t)?'inn':/lighthouse|tower/.test(t)?'tower':/cave|dungeon/.test(t)?'cave':/monster|brigand|pirate|burial|necropol/.test(t)?'danger':/sacred|shrine/.test(t)?'shrine':'monument';}
$('#pois').innerHTML=D.markers.map(m=>`<g class="landmark ${m.loreSource?'lore-landmark':''}" data-type="poi" data-id="${m.i}" transform="translate(${m.x} ${m.y})"><circle r="14" fill="#fff" fill-opacity="0"/><use href="#poi-${poiKind(m.type)}" transform="scale(${m.loreSource?1.2:.65})"/><title>${esc(note('marker'+m.i)?.name||m.type)}</title></g>`).join('');
const poiToggle=$('[data-layer="pois"]');poiToggle.checked=true;poiToggle.dispatchEvent(new Event('change',{bubbles:true}));
$('#symbolLegend').insertAdjacentHTML('beforeend',`<h3>Landmarks</h3><p class="muted">Volcanoes, passes and lore landmarks appear at world scale. Zoom to 2.2× for other POIs; search finds them at any scale.</p><div class="poi-key">${Object.keys(glyphs).map(k=>`<span><svg viewBox="-23 -27 46 44" aria-hidden="true"><use href="#poi-${k}"/></svg>${k}</span>`).join('')}</div>`);

const journey=document.createElement('details');journey.id='journey';journey.className='atlas-controls';journey.open=true;
journey.innerHTML=`<summary>Plan a journey</summary><p class="muted">Follow roads, trails and charted sea lanes between settlements or landmarks.</p><form id="journeyForm"><label for="journeyFrom">From</label><input id="journeyFrom" required placeholder="Choose a location"><label for="journeyTo">To</label><input id="journeyTo" required placeholder="Choose a destination"><label for="journeyVia">Via (optional)</label><input id="journeyVia" placeholder="Add a stop"><label for="journeyMode">Travel party</label><select id="journeyMode"><option value="walk">On foot · 24 km/day</option><option value="ride">Mounted · 40 km/day</option><option value="caravan">Caravan · 20 km/day</option></select><label><input id="journeySail" type="checkbox" checked> Allow sailing · 100 km/day</label><label><input id="journeyOffroad" type="checkbox" checked> Allow overland travel away from roads</label><div class="journey-actions"><button type="submit">Find route</button><button type="button" id="journeySwap">Swap</button><button type="button" id="journeyClear">Clear</button></div></form><div id="journeyResult" role="status" aria-live="polite"></div><p class="muted">Atlas estimates: 2 km per map unit. Trails take 30% longer; off-road travel takes 2.5× as long. No live weather, vessel schedules or guaranteed safe passage.</p>`;
filterPanel.after(journey);
const places=[...D.burgs.map(b=>({key:'burg:'+b.i,label:b.name+' — '+(state(b.state)?.name||'Wilderness')+' [#'+b.i+']',name:b.name,cell:b.cell})),...D.markers.map(m=>({key:'poi:'+m.i,label:(note('marker'+m.i)?.name||m.type)+' [landmark '+m.i+']',name:note('marker'+m.i)?.name||m.type,cell:m.cell}))];
installJourneyInputs(places);
const routeGroup=document.createElementNS(NS,'g');routeGroup.id='journeyOverlay';map.insertBefore(routeGroup,$('#labels'));
let router=null,planned=null,planning=false;
const resolvePlace=value=>places.find(p=>p.label===value)||(()=>{const found=places.filter(p=>p.name.toLowerCase()===value.trim().toLowerCase());return found.length===1?found[0]:null;})();
function routeMessage(s){$('#journeyResult').innerHTML=`<p>${esc(s)}</p>`;}
$('#journeySwap').onclick=()=>{const a=$('#journeyFrom').value;$('#journeyFrom').value=$('#journeyTo').value;$('#journeyTo').value=a;};
$('#journeyClear').onclick=()=>{routeGroup.innerHTML='';planned=null;$('#journeyResult').innerHTML='';};
$('#journeyForm').onsubmit=async e=>{
 e.preventDefault();if(planning)return;const a=resolvePlace($('#journeyFrom').value),b=resolvePlace($('#journeyTo').value),via=$('#journeyVia').value.trim()?resolvePlace($('#journeyVia').value):null;
 routeGroup.innerHTML='';planned=null;
 if(!a||!b||$('#journeyVia').value.trim()&&!via){routeMessage('Choose an unambiguous location from the suggestions for each stop.');return;}
 const options={mode:$('#journeyMode').value,sail:$('#journeySail').checked,offroad:$('#journeyOffroad').checked,teleport:$('#journeyTeleport')?.checked||false};planning=true;routeMessage('Finding a route…');await new Promise(r=>setTimeout(r,25));
 try{router??=new AtlasRouter(window.ATLAS_NETWORK);const stops=via?[a,via,b]:[a,b],legs=[];
  for(let i=1;i<stops.length;i++){const leg=router.find(stops[i-1].cell,stops[i].cell,options);if(!leg){routeMessage('No connected route under these settings. Try allowing sailing or overland travel. Isolated landmarks may have no mapped approach.');return;}legs.push(leg);}
  planned={stops,legs};const totals=legs.reduce((t,l)=>({km:t.km+l.km,days:t.days+l.days,seaKm:t.seaKm+l.seaKm,offroadKm:t.offroadKm+l.offroadKm}),{km:0,days:0,seaKm:0,offroadKm:0});
  const segments=[];for(const leg of legs)for(let i=0;i<leg.edges.length;i++){const e=leg.edges[i],last=segments.at(-1);if(last&&last.kind===e[2]&&last.rid===e[3])last.points.push(leg.points[i+1]);else segments.push({kind:e[2],rid:e[3],points:[leg.points[i],leg.points[i+1]]});}
  routeGroup.innerHTML=segments.map(s=>`<path class="journey-path ${s.kind}" d="${path(s.points)}"/>`).join('')+stops.map((s,i)=>{const p=window.ATLAS_NETWORK.nodes[s.cell];return `<g transform="translate(${p[0]} ${p[1]})"><circle r="10" fill="#f6e4aa" stroke="#294f59" stroke-width="2"/><text text-anchor="middle" y="4" font-size="12" fill="#15343f">${i+1}</text></g>`;}).join('');
  const nations=[...new Set(legs.flatMap(l=>l.cells.map(c=>window.ATLAS_NETWORK.nodes[c][2])).filter(Boolean))];
  const crossings=new Map();for(const leg of legs){let previous=0;for(const c of leg.cells){const n=window.ATLAS_NETWORK.nodes[c][2];if(!n)continue;if(previous&&n!==previous){const relation=state(previous)?.diplomacy?.[n]||'Unknown';if(/Enemy|Rival|Suspicion/.test(relation))crossings.set([previous,n].sort().join('-'),`${state(previous)?.name} / ${state(n)?.name}: ${relation.toLowerCase()}`);}previous=n;}}
  const steps=segments.map(s=>{const r=D.routes.find(r=>r.i===s.rid);return (s.kind==='teleport'?'Melisor teleportation · access required':s.kind==='port'?'Embark / disembark':s.kind==='overland'?'Overland approach (no mapped road)':r?.name||s.kind.replace('searoutes','Sea lane'));}).filter((x,i,a)=>!i||x!==a[i-1]);
  $('#journeyResult').innerHTML=`<h3>${esc(a.name)} → ${esc(b.name)}</h3>${stats([[num(totals.km)+' km','physical distance'],[(Math.ceil(totals.days*10)/10)+' days','moving time']])}<p>${num(totals.seaKm)} km sailing · ${num(totals.offroadKm)} km off-road</p><p><strong>Stops:</strong> ${stops.map(s=>esc(s.name)).join(' → ')}</p><details><summary>Directions · ${steps.length} legs</summary><ol>${steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></details><p><strong>Jurisdictions:</strong> ${nations.map(n=>esc(state(n)?.name)).join(', ')||'Unclaimed waters / wilderness'}. Consult national relations and passage permissions before crossing.</p><p class="muted">Peach: roads · lilac: trails · teal dashes: sailing · rust dots: overland. Estimates exclude rest days, waits and border delays.</p><button type="button" id="journeyFit">Show entire journey</button><button type="button" id="journeyDownload">Save itinerary</button>`;
  const teleports=legs.reduce((n,l)=>n+(l.teleportLegs||0),0);if(teleports)$('#journeyResult').insertAdjacentHTML('beforeend',`<p><strong>Teleportation:</strong> ${teleports} transfers via Thelemar; one hour planning allowance per transfer. Physical distance excludes magical displacement. Permission and actual waiting time are not guaranteed.</p>`);
  if(crossings.size)$('#journeyResult').insertAdjacentHTML('beforeend',`<p class="border-warning"><strong>Border friction:</strong> ${[...crossings.values()].map(esc).join('; ')}. Recorded relations indicate possible difficulty; this is not a travel prohibition.</p>`);
  const fit=()=>focusPoints(legs.flatMap(l=>l.points),300);$('#journeyFit').onclick=fit;fit();
  $('#journeyDownload').onclick=()=>{const text=$('#journeyResult').innerText||$('#journeyResult').textContent,blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Saeroth-journey.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 }catch(err){routeMessage('This route could not be calculated. Reload the atlas and try again.');console.error(err);}finally{planning=false;}
};
const originalShow=show;
show=function(type,id,fly=true){originalShow(type,id,fly);const p=places.find(p=>p.key===type+':'+id);if(p){$('#info').insertAdjacentHTML('beforeend','<div class="journey-actions"><button id="routeStart">Start here</button><button id="routeEnd">Travel here</button></div>');for(const [button,field] of [['routeStart','journeyFrom'],['routeEnd','journeyTo']])$('#'+button).onclick=()=>{$('#'+field).value=p.label;journey.open=true;journey.scrollIntoView?.({behavior:'smooth',block:'nearest'});};}if(type==='poi'){const m=D.markers.find(m=>m.i===+id);if(m?.loreSource)$('#info').insertAdjacentHTML('beforeend',`<p><a href="${esc(m.loreSource)}" target="_blank" rel="noopener">Campaign lore ↗</a> · Approximate placement</p>`);}};
const jump=document.createElement('nav');jump.className='atlas-jumps';jump.setAttribute('aria-label','Atlas tools');jump.innerHTML='<button data-jump="map">Map</button><button data-jump="journey">Journey</button><button data-jump="info">Place details</button>';document.querySelector('header').after(jump);jump.onclick=e=>{const id=e.target.dataset.jump;if(id){const el=$('#'+id);if(el.tagName==='DETAILS')el.open=true;el.scrollIntoView?.({behavior:'smooth',block:'start'});el.focus?.();}};
applyTiers();

window.installPaintedLandmarks?.();
