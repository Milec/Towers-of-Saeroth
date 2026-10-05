/* Browser-local travel overlay. Axial, pointy-top hexes; no geography edits. */
(() => {
  const key = 'saeroth-hexcrawl-v1', sqrt3 = Math.sqrt(3);
  // A pointy hex's center spacing is sqrt(3)/2 of its corner-to-corner diameter.
  const pf2eKm = 12 * 1.609344 * sqrt3 / 2;
  const center = (h, km) => { const d = km / window.ATLAS_NETWORK.kmPerUnit; return [d * (h.q + h.r / 2), d * sqrt3 / 2 * h.r]; };
  const hexAt = (x, y, km) => {
    const d = km / window.ATLAS_NETWORK.kmPerUnit, r = y / (d * sqrt3 / 2), q = x / d - r / 2;
    let a = Math.round(q), b = Math.round(r), c = Math.round(-q-r);
    const da = Math.abs(a-q), db = Math.abs(b-r), dc = Math.abs(c+q+r);
    if (da > db && da > dc) a = -b-c; else if (db > dc) b = -a-c;
    return {q:a,r:b};
  };
  const distance = (a,b) => Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));
  const validHex = h => h && Number.isInteger(h.q) && Number.isInteger(h.r) && Math.abs(h.q)<2000 && Math.abs(h.r)<2000;
  let state = {km:pf2eKm, trail:[]}, selected = null, picking = false, enabled = false, storageError = '';
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && [pf2eKm,12,24,48].includes(saved.km) && Array.isArray(saved.trail) && saved.trail.length<=2000 && saved.trail.every((h,i)=>validHex(h)&&Number.isFinite(h.days)&&h.days>=0&&(!i||distance(h,saved.trail[i-1])===1))) state=saved;
  } catch { storageError='Saved travel could not be read. This session starts empty.'; }
  const panel = document.createElement('details'); panel.id='hexcrawl'; panel.className='atlas-controls';
  panel.innerHTML=`<summary>Hexcrawl travel</summary>
    <label><input id="hexEnabled" type="checkbox"> Show hexcrawl mode</label>
    <div id="hexControls" hidden>
      <label for="hexSize">Hex scale</label><select id="hexSize"><option value="${pf2eKm}">PF2e · 12 miles corner to corner</option><option value="12">Legacy · 12 km between centers</option><option value="24">Legacy · 24 km between centers</option><option value="48">Legacy · 48 km between centers</option></select>
      <p class="muted">A PF2e hex is 12 miles across its corners, about 10.4 miles between neighboring centers. Travel and exploration together take roughly one day per hex; this is a planning estimate, not an automatic rules resolution.</p>
      <label for="hexActivity">Next step</label><select id="hexActivity"><option value="explore">Travel and explore · about 1 day</option><option value="travel">Travel only · speed estimate</option></select>
      <label for="hexPrimaryTerrain">Selected hex: primary terrain</label><select id="hexPrimaryTerrain"><option>Plains</option><option>Forest</option><option>Hills</option><option>Mountains</option><option>Swamp</option><option>Desert</option><option>Water</option></select>
      <label><input id="hexPlayerPreview" type="checkbox"> Explored-only map preview</label>
      <p class="muted">Unexplored hexes are covered in this map preview. The rest of the atlas still contains GM information: this is not a secure player website. Roads and rivers remain secondary features, not the primary terrain.</p>
      <p class="muted">Tap Choose hex, then tap the map. You can still drag or pinch. Keyboard: pan the map and press Enter to select its center; Escape cancels.</p>
      <button type="button" id="hexChoose">Choose hex on map</button>
      <details class="hex-coordinates"><summary>Enter hex coordinates</summary><div class="hex-coordinate-fields">
      <label for="hexQ">Hex Q<input id="hexQ" type="number" step="1" value="0"></label>
      <label for="hexR">Hex R<input id="hexR" type="number" step="1" value="0"></label>
      <button type="button" id="hexSelect">Select coordinates</button></div></details>
      <p id="hexSelection" role="status">No hex selected.</p>
      <label for="hexTerrain">Next move terrain</label><select id="hexTerrain"><option value="1">Road / open ground</option><option value="1.3">Trail · 1.3× time</option><option value="2.5">Rough / off-road · 2.5× time</option><option value="sea">Sailing · 100 km/day</option></select>
      <label for="hexTravelMode">Travel party</label><select id="hexTravelMode"><option value="walk">On foot · 24 km/day</option><option value="ride">Mounted · 40 km/day</option><option value="caravan">Caravan · 20 km/day</option></select>
      <p class="muted">Terrain is GM-selected; water, barriers and encounters are not detected.</p>
      <div class="hex-actions"><button type="button" id="hexMove" disabled>Place party here</button><button type="button" id="hexExplore" disabled>Explore current hex · 1 day</button><button type="button" id="hexUndo" disabled>Undo last step</button><button type="button" id="hexLocate" disabled>Find party</button><button type="button" id="hexReset">Reset trek</button></div>
      <p id="hexProgress" role="status" aria-live="polite"></p><p id="hexMessage" role="status" aria-live="polite"></p>
      <p class="muted">Saved on this browser only, not synced to your phone. Grid scale is locked after placing the party. Estimates exclude rest and delays; not automatic PF2e exploration rules.</p>
    </div>`;
  document.getElementById('travelView')?.after(panel);
  if (!panel.isConnected) document.getElementById('journey').after(panel);
  const el = id => document.getElementById(id);
  const layer = document.createElementNS(NS,'g'); layer.id='hexOverlay'; layer.setAttribute('pointer-events','none'); map.insertBefore(layer,el('labels'));
  const grid=document.createElementNS(NS,'g'),trace=document.createElementNS(NS,'g'),marker=document.createElementNS(NS,'g');
  grid.id='hexGrid';trace.id='hexTrace';marker.id='hexMarker';layer.append(grid,trace,marker);
  const fog=document.createElementNS(NS,'g');fog.id='hexFog';fog.setAttribute('pointer-events','none');map.append(fog);
  let gridKey='',traceKey='',markerKey='',fogKey='';
  const prompt=document.createElement('div');prompt.className='hex-map-prompt';prompt.hidden=true;
  prompt.innerHTML='<span>Tap a hex to select it. Drag to pan.</span><button type="button">Cancel</button>';
  document.querySelector('.mapframe').append(prompt);prompt.querySelector('button').onclick=()=>{picking=false;render();el('hexChoose').focus();};
  el('hexSize').value=state.km;
  const save = () => { try { localStorage.setItem(key,JSON.stringify(state)); storageError=''; } catch { storageError='Travel is visible but could not be saved. Keep this tab open.'; } };
  const choose = h => {
    if (!validHex(h)) { el('hexMessage').textContent='Enter whole-number coordinates between -1999 and 1999.'; return; }
    const [x,y]=center(h,state.km);
    if (x<0||x>3840||y<0||y>2160) { el('hexMessage').textContent='Choose a hex whose center is inside the atlas.'; return; }
    const known=state.trail.findLast(v=>v.q===h.q&&v.r===h.r);
    if(known?.terrain&&Array.from(el('hexPrimaryTerrain').options).some(o=>o.value===known.terrain))el('hexPrimaryTerrain').value=known.terrain;
    selected=h; picking=false; el('hexQ').value=h.q; el('hexR').value=h.r; render();
    if(matchMedia('(max-width:800px)').matches){el('hexSelection').scrollIntoView({block:'center'});(el('hexMove').disabled?el('hexChoose'):el('hexMove')).focus({preventScroll:true});}
  };
  const polygon = h => { const [x,y]=center(h,state.km), radius=state.km/window.ATLAS_NETWORK.kmPerUnit/sqrt3; return Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return `${x+radius*Math.cos(a)},${y+radius*Math.sin(a)}`;}).join(' '); };
  function render(controls=true) {
    fog.style.display=enabled&&el('hexPlayerPreview').checked?'':'none';
    if(enabled&&el('hexPlayerPreview').checked){
      const cells=[...new Map(state.trail.filter(h=>h.explored).map(h=>[h.q+','+h.r,h])).values()];
      const nextFogKey=JSON.stringify([state.km,cells.map(h=>[h.q,h.r])]);
      if(fogKey!==nextFogKey){fogKey=nextFogKey;
      fog.innerHTML=`<defs><mask id="hexRevealMask" maskUnits="userSpaceOnUse" x="0" y="0" width="3840" height="2160"><rect width="3840" height="2160" fill="white"/>${cells.map(h=>`<polygon points="${polygon(h)}" fill="black"/>`).join('')}</mask></defs><rect width="3840" height="2160" fill="#d9c8a3" mask="url(#hexRevealMask)"/>`;
      }
    }
    layer.style.display=enabled?'':'none';prompt.hidden=!enabled||!picking;
    el('hexControls').hidden=!enabled;
    el('partyLocationOverlay').style.display=enabled&&state.trail.length?'none':'';
    if (!enabled) return;
    const current=state.trail.at(-1), unit=box[2]/Math.max(map.clientWidth,300);
    const d=state.km/window.ATLAS_NETWORK.kmPerUnit;
    const r0=Math.max(0,Math.floor(box[1]/(d*sqrt3/2))-1), r1=Math.min(Math.ceil(2160/(d*sqrt3/2)),Math.ceil((box[1]+box[3])/(d*sqrt3/2))+1);
    const count=(r1-r0+1)*(Math.min(3840,box[2])/d+4);
    const visible=count<5000 && d/unit>=12;
    const nextGridKey=[state.km,visible,r0,r1,Math.floor(box[0]/d),Math.ceil((box[0]+box[2])/d)].join(':');
    let markup='';
    if(gridKey!==nextGridKey){
    if(visible) {
      for(let r=r0;r<=r1;r++) {
        const q0=Math.ceil(Math.max(0,box[0]-d)/d-r/2), q1=Math.floor(Math.min(3840,box[0]+box[2]+d)/d-r/2);
        for(let q=q0;q<=q1;q++) markup+=`<polygon class="hex-cell" points="${polygon({q,r})}"/>`;
      }
    }
    grid.innerHTML=markup;gridKey=nextGridKey;
    }
    const nextTraceKey=[state.km,state.trail.length,current?.q,current?.r,selected?.q,selected?.r].join(':');
    if(traceKey!==nextTraceKey){markup='';
    for(const h of new Map(state.trail.map(h=>[h.q+','+h.r,h])).values()) markup+=`<polygon class="hex-visited" points="${polygon(h)}"/>`;
    if(state.trail.length>1) markup+=`<polyline class="hex-trail" points="${state.trail.map(h=>center(h,state.km).join(',')).join(' ')}"/>`;
    if(selected) markup+=`<polygon class="hex-selected" points="${polygon(selected)}"/>`;
    trace.innerHTML=markup;traceKey=nextTraceKey;}
    const nextMarkerKey=[current?.q,current?.r,unit].join(':');
    if(markerKey!==nextMarkerKey){marker.innerHTML=current?`<g transform="translate(${center(current,state.km).join(' ')}) scale(${unit})"><circle class="hex-party" r="10"/><text class="hex-party-label" text-anchor="middle" y="-18">Party · ${current.q}, ${current.r}</text></g>`:'';markerKey=nextMarkerKey;}
    const message=storageError || (picking?'Choose a map hex, or press Enter on the map.':!visible?'Zoom in to see the hex grid.':current&&selected&&distance(current,selected)>1?'Choose a neighboring hex to move.':'');
    if(el('hexMessage').textContent!==message)el('hexMessage').textContent=message;
    if(!controls)return;
    el('hexChoose').textContent=picking?'Cancel choosing':'Choose hex on map';
    el('hexSelection').textContent=selected?`Selected hex: ${selected.q}, ${selected.r}${current?` · ${distance(current,selected)} hexes from party`:''}.`:'No hex selected.';
    el('hexMove').textContent=current?'Move one hex':'Place party here';
    el('hexMove').disabled=!selected || !!current && distance(current,selected)!==1 || state.trail.length>=2000;
    el('hexUndo').disabled=!state.trail.length; el('hexLocate').disabled=!current; el('hexSize').disabled=!!current;
    el('hexExplore').disabled=!current||!!current.explored;
    const known=selected&&state.trail.findLast(h=>h.q===selected.q&&h.r===selected.r);
    if(known)el('hexSelection').textContent+=` ${known.terrain||'Terrain unrecorded'} · ${known.explored?'Explored':'Not explored'}.`;
    el('hexProgress').textContent=current?`Party: ${current.q}, ${current.r} · ${state.trail.length-1} steps · ${((state.trail.length-1)*state.km).toFixed(1)} km · ${state.trail.reduce((sum,h)=>sum+h.days,0).toFixed(1)} travel days.`:'Place the party to start a trek.';
  }
  el('hexEnabled').onchange=e=>{enabled=e.target.checked;picking=false;render();};
  el('hexSize').onchange=e=>{state.km=Number(e.target.value);selected=null;save();render();};
  el('hexPlayerPreview').onchange=()=>render();
  el('hexChoose').onclick=()=>{picking=!picking;render();if(picking)map.focus();};
  el('hexSelect').onclick=()=>choose({q:Number(el('hexQ').value),r:Number(el('hexR').value)});
  el('hexMove').onclick=()=>{
    if(!selected||state.trail.length>=2000||state.trail.length&&distance(state.trail.at(-1),selected)!==1)return;
    const terrain=el('hexTerrain').value, speed={walk:24,ride:40,caravan:20}[el('hexTravelMode').value]||24;
    const explore=el('hexActivity').value==='explore'&&state.trail.length>0;
    state.trail.push({...selected,terrain:el('hexPrimaryTerrain').value,explored:explore,days:state.trail.length?(explore?1:state.km/(terrain==='sea'?100:speed)*(terrain==='sea'?1:Number(terrain))):0});save();render();
  };
  el('hexExplore').onclick=()=>{const h=state.trail.at(-1);if(!h||h.explored)return;h.explored=true;h.terrain=el('hexPrimaryTerrain').value;h.days+=1;save();render();};
  el('hexUndo').onclick=()=>{state.trail.pop();save();render();};
  el('hexLocate').onclick=()=>{if(state.trail.length)focusPoints([center(state.trail.at(-1),state.km)],240);};
  el('hexReset').onclick=()=>{if(state.trail.length&&!confirm('Clear this hexcrawl trek and party position?'))return;state.trail=[];selected=null;save();render();};
  // Let the pan handler clean up its pointers, but do not open a place while choosing.
  map.addEventListener('pointerup',()=>{if(picking&&start)start.target=null;},true);
  map.addEventListener('click',e=>{if(!picking)return;e.stopImmediatePropagation();if(!lastDrag)choose(hexAt(...point(e),state.km));},true);
  map.addEventListener('keydown',e=>{if(!picking)return;if(e.key==='Escape'){picking=false;render();}if(e.key==='Enter'){e.preventDefault();choose(hexAt(box[0]+box[2]/2,box[1]+box[3]/2,state.km));}},true);
  let pending=false;
  const redraw=()=>{if(!enabled||pending)return;pending=true;requestAnimationFrame(()=>{pending=false;render(false);});};
  new MutationObserver(redraw).observe(map,{attributes:true,attributeFilter:['viewBox']});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(redraw).observe(map);
  window.AtlasHexcrawl={center,hexAt,distance};
  render();
})();
