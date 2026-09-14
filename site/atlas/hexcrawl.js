/* Browser-local travel overlay. Axial, pointy-top hexes; no geography edits. */
(() => {
  const key = 'saeroth-hexcrawl-v1', sqrt3 = Math.sqrt(3);
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
  let state = {km:24, trail:[]}, selected = null, picking = false, enabled = false, storageError = '';
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && [12,24,48].includes(saved.km) && Array.isArray(saved.trail) && saved.trail.length<=2000 && saved.trail.every((h,i)=>validHex(h)&&Number.isFinite(h.days)&&h.days>=0&&(!i||distance(h,saved.trail[i-1])===1))) state=saved;
  } catch { storageError='Saved travel could not be read. This session starts empty.'; }
  const panel = document.createElement('details'); panel.id='hexcrawl'; panel.className='atlas-controls';
  panel.innerHTML=`<summary>Hexcrawl travel</summary>
    <label><input id="hexEnabled" type="checkbox"> Show hexcrawl mode</label>
    <div id="hexControls" hidden>
      <label for="hexSize">Hex width (between neighboring centers)</label><select id="hexSize"><option value="12">12 km</option><option value="24">24 km</option><option value="48">48 km</option></select>
      <p class="muted">Tap Choose hex, then tap the map. You can still drag or pinch. Keyboard: pan the map and press Enter to select its center; Escape cancels.</p>
      <button type="button" id="hexChoose">Choose hex on map</button>
      <label for="hexQ">Hex Q</label><input id="hexQ" type="number" step="1" value="0">
      <label for="hexR">Hex R</label><input id="hexR" type="number" step="1" value="0">
      <button type="button" id="hexSelect">Select coordinates</button>
      <p id="hexSelection" role="status">No hex selected.</p>
      <label for="hexTerrain">Next move terrain</label><select id="hexTerrain"><option value="1">Road / open ground</option><option value="1.3">Trail · 1.3× time</option><option value="2.5">Rough / off-road · 2.5× time</option><option value="sea">Sailing · 100 km/day</option></select>
      <p class="muted">On land, uses Travel party in Plan a journey. Terrain is GM-selected; water, barriers and encounters are not detected.</p>
      <div class="hex-actions"><button type="button" id="hexMove" disabled>Place party here</button><button type="button" id="hexUndo" disabled>Undo last step</button><button type="button" id="hexLocate" disabled>Find party</button><button type="button" id="hexReset">Reset trek</button></div>
      <p id="hexProgress" role="status" aria-live="polite"></p><p id="hexMessage" role="status" aria-live="polite"></p>
      <p class="muted">Saved on this browser only, not synced to your phone. Grid scale is locked after placing the party. Estimates exclude rest and delays; not automatic PF2e exploration rules.</p>
    </div>`;
  document.getElementById('travelView')?.after(panel);
  if (!panel.isConnected) document.getElementById('journey').after(panel);
  const el = id => document.getElementById(id);
  const layer = document.createElementNS(NS,'g'); layer.id='hexOverlay'; layer.setAttribute('pointer-events','none'); map.insertBefore(layer,el('labels'));
  el('hexSize').value=state.km;
  const save = () => { try { localStorage.setItem(key,JSON.stringify(state)); storageError=''; } catch { storageError='Travel is visible but could not be saved. Keep this tab open.'; } };
  const choose = h => {
    if (!validHex(h)) { el('hexMessage').textContent='Enter whole-number coordinates between -1999 and 1999.'; return; }
    const [x,y]=center(h,state.km);
    if (x<0||x>3840||y<0||y>2160) { el('hexMessage').textContent='Choose a hex whose center is inside the atlas.'; return; }
    selected=h; picking=false; el('hexQ').value=h.q; el('hexR').value=h.r; render();
  };
  const polygon = h => { const [x,y]=center(h,state.km), radius=state.km/window.ATLAS_NETWORK.kmPerUnit/sqrt3; return Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return `${x+radius*Math.cos(a)},${y+radius*Math.sin(a)}`;}).join(' '); };
  function render() {
    layer.replaceChildren(); layer.style.display=enabled?'':'none';
    el('hexControls').hidden=!enabled;
    el('partyLocationOverlay').style.display=enabled&&state.trail.length?'none':'';
    if (!enabled) return;
    const current=state.trail.at(-1), unit=box[2]/Math.max(map.clientWidth,300);
    const d=state.km/window.ATLAS_NETWORK.kmPerUnit;
    const r0=Math.max(0,Math.floor(box[1]/(d*sqrt3/2))-1), r1=Math.min(Math.ceil(2160/(d*sqrt3/2)),Math.ceil((box[1]+box[3])/(d*sqrt3/2))+1);
    const count=(r1-r0+1)*(Math.min(3840,box[2])/d+4);
    let markup='';
    if(count<5000 && d/unit>=12) {
      for(let r=r0;r<=r1;r++) {
        const q0=Math.ceil(Math.max(0,box[0]-d)/d-r/2), q1=Math.floor(Math.min(3840,box[0]+box[2]+d)/d-r/2);
        for(let q=q0;q<=q1;q++) markup+=`<polygon class="hex-cell" points="${polygon({q,r})}"/>`;
      }
    }
    for(const h of state.trail) markup+=`<polygon class="hex-visited" points="${polygon(h)}"/>`;
    if(state.trail.length>1) markup+=`<polyline class="hex-trail" points="${state.trail.map(h=>center(h,state.km).join(',')).join(' ')}"/>`;
    if(selected) markup+=`<polygon class="hex-selected" points="${polygon(selected)}"/>`;
    if(current) { const [x,y]=center(current,state.km); markup+=`<g transform="translate(${x} ${y}) scale(${unit})"><circle class="hex-party" r="10"/><text class="hex-party-label" text-anchor="middle" y="-18">Party · ${current.q}, ${current.r}</text></g>`; }
    layer.innerHTML=markup;
    el('hexChoose').textContent=picking?'Cancel choosing':'Choose hex on map';
    el('hexSelection').textContent=selected?`Selected hex: ${selected.q}, ${selected.r}${current?` · ${distance(current,selected)} hexes from party`:''}.`:'No hex selected.';
    el('hexMove').textContent=current?'Move one hex':'Place party here';
    el('hexMove').disabled=!selected || !!current && distance(current,selected)!==1 || state.trail.length>=2000;
    el('hexUndo').disabled=!state.trail.length; el('hexLocate').disabled=!current; el('hexSize').disabled=!!current;
    el('hexProgress').textContent=current?`Party: ${current.q}, ${current.r} · ${state.trail.length-1} steps · ${(state.trail.length-1)*state.km} km · ${state.trail.reduce((sum,h)=>sum+h.days,0).toFixed(1)} travel days.`:'Place the party to start a trek.';
    el('hexMessage').textContent=storageError || (picking?'Choose a map hex, or press Enter on the map.':count>=5000||d/unit<12?'Zoom in to see the hex grid.':current&&selected&&distance(current,selected)>1?'Choose a neighboring hex to move.':'');
  }
  el('hexEnabled').onchange=e=>{enabled=e.target.checked;picking=false;render();};
  el('hexSize').onchange=e=>{state.km=Number(e.target.value);selected=null;save();render();};
  el('hexChoose').onclick=()=>{picking=!picking;render();if(picking)map.focus();};
  el('hexSelect').onclick=()=>choose({q:Number(el('hexQ').value),r:Number(el('hexR').value)});
  el('hexMove').onclick=()=>{
    if(!selected||state.trail.length>=2000||state.trail.length&&distance(state.trail.at(-1),selected)!==1)return;
    const terrain=el('hexTerrain').value, speed={walk:24,ride:40,caravan:20}[el('journeyMode').value]||24;
    state.trail.push({...selected,days:state.trail.length?state.km/(terrain==='sea'?100:speed)*(terrain==='sea'?1:Number(terrain)):0});save();render();
  };
  el('hexUndo').onclick=()=>{state.trail.pop();save();render();};
  el('hexLocate').onclick=()=>{if(state.trail.length)focusPoints([center(state.trail.at(-1),state.km)],240);};
  el('hexReset').onclick=()=>{if(state.trail.length&&!confirm('Clear this hexcrawl trek and party position?'))return;state.trail=[];selected=null;save();render();};
  // Let the pan handler clean up its pointers, but do not open a place while choosing.
  map.addEventListener('pointerup',()=>{if(picking&&start)start.target=null;},true);
  map.addEventListener('click',e=>{if(!picking)return;e.stopImmediatePropagation();if(!lastDrag)choose(hexAt(...point(e),state.km));},true);
  map.addEventListener('keydown',e=>{if(!picking)return;if(e.key==='Escape'){picking=false;render();}if(e.key==='Enter'){e.preventDefault();choose(hexAt(box[0]+box[2]/2,box[1]+box[3]/2,state.km));}},true);
  let pending=false;
  new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;render();});}).observe(map,{attributes:true,attributeFilter:['viewBox']});
  window.AtlasHexcrawl={center,hexAt,distance};
  render();
})();
