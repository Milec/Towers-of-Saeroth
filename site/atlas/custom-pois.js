/* User-authored overlays, stored separately from the published atlas records. */
(() => {
  const KEY='saeroth-custom-pois-v1', LIMIT=500;
  const kinds={encounter:['Encounter','danger'],tower:['Tower','tower'],camp:['Bandit camp','camp'],ruin:['Ruins','ruin'],cave:['Cave / dungeon','cave'],shrine:['Shrine','shrine'],fort:['Fort','fortress'],inn:['Inn','inn'],other:['Other location','monument']};
  const decode=value=>{
    if(value?.version!==1||!Array.isArray(value.pois)||value.pois.length>LIMIT)throw Error('Choose a Saeroth POI backup containing at most 500 locations.');
    const ids=new Set();
    return value.pois.map(p=>{
      if(!p||!Number.isSafeInteger(p.id)||p.id<1||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||typeof p.notes!=='string'||p.notes.length>5000||!Object.hasOwn(kinds,p.kind)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>3840||p.y<0||p.y>2160)throw Error('This backup contains an invalid or duplicate POI. Nothing was imported.');
      if(p.notePath && (p.notePath.split('/').some(s=>s==='..'||s==='.') || !/^campaign\/(?:nations|world)\/(?!.*(?:^|\/)\.\.(?:\/|$))[^\\\r\n]+\.md$/.test(p.notePath) || !/^[a-f0-9]{40}$/.test(p.noteSHA||'')))throw Error('Invalid campaign note link.');
      ids.add(p.id);return {id:p.id,name:p.name.trim(),kind:p.kind,notes:p.notes,x:p.x,y:p.y,...(p.notePath?{notePath:p.notePath,noteSHA:p.noteSHA}:{}),...(p.pendingSync?{pendingSync:true}:{}),...(p.pendingReview?{pendingReview:true}:{}),...(p.published?{published:true}:{})};
    });
  };
  let items=[],loadError='';const publishedItems=new Map();
  try{const raw=localStorage.getItem(KEY);if(raw)items=decode(JSON.parse(raw));}catch(_){loadError='Saved POIs could not be read. Your existing browser data has not been changed.';}
  let editing=null,locationPoint=null,placing=false;
  const panel=document.createElement('details');panel.className='atlas-controls custom-poi-panel';panel.id='customPOIPanel';
  panel.innerHTML=`<summary>My points of interest</summary><p class="muted">Local drafts stay in this browser. Connect GitHub below to create linked campaign notes; merged notes appear on other devices. Export backups for drafts. Custom POIs are included in PNG handouts when their layer is enabled; notes are not printed.</p><div class="journey-actions"><button type="button" id="customPOIAdd">Add POI</button><button type="button" id="customPOIExport">Export backup</button><button type="button" id="customPOIImport">Import backup</button></div><input id="customPOIFile" type="file" accept="application/json,.json" hidden><p id="customPOIStatus" role="status" aria-live="polite"></p><form id="customPOIForm" hidden><h3 id="customPOIHeading">New point of interest</h3><label for="customPOIName">Name</label><input id="customPOIName" required maxlength="100" autocomplete="off"><label for="customPOIKind">Icon</label><select id="customPOIKind">${Object.entries(kinds).map(([key,[name]])=>`<option value="${key}">${name}</option>`).join('')}</select><label for="customPOINotes">Notes</label><textarea id="customPOINotes" rows="4" maxlength="5000" placeholder="Encounter ideas, tower details, or campaign notes"></textarea><p id="customPOILocation">Choose a location on the map.</p><button type="button" id="customPOIPlace">Choose on map</button><div class="journey-actions"><button type="submit">Save POI</button><button type="button" id="customPOICancel">Cancel</button></div></form><div id="customPOIList"></div>`;
  $('.search').after(panel);
  const status=text=>$('#customPOIStatus').textContent=text;
  status(loadError);
  const layer=document.createElementNS(NS,'g');layer.id='custompois';map.insertBefore(layer,$('#labels'));
  const labels=document.createElementNS(NS,'g');labels.id='custompoilabels';labels.setAttribute('pointer-events','none');$('#labels').append(labels);
  $('#layerlist').insertAdjacentHTML('beforeend','<label><input type="checkbox" data-layer="custompois" checked>My POIs</label><label><input type="checkbox" data-layer="custompoilabels" checked>My POI names</label>');
  $('#kind').insertAdjacentHTML('beforeend','<option value="custompoi">My points of interest</option>');
  $('#icondefs').insertAdjacentHTML('beforeend','<g id="poi-camp" stroke="#42463d" stroke-width="1" stroke-linejoin="round"><path fill="#cbb78c" d="M-18 12L-3-14 13 12Z"/><path fill="#8d6550" d="M-3-14L21 12H13Z"/><path fill="#39443f" d="M-6 12L-2-2 4 12Z"/><path fill="none" d="M-3-14V-20M-3-19H8L4-15H-3M-21 12H23"/></g>');
  const placement=document.createElement('div');placement.className='custom-placement';placement.hidden=true;
  placement.innerHTML='<span>Tap to place; drag to pan. Enter uses the map center.</span><button type="button">Cancel</button>';
  $('.mapframe').append(placement);
  const endPlacement=()=>{placing=false;placement.hidden=true;map.classList.remove('placing-poi');};
  placement.querySelector('button').onclick=endPlacement;
  const updateLocation=()=>$('#customPOILocation').textContent=locationPoint?`Map location: ${locationPoint[0].toFixed(1)}, ${locationPoint[1].toFixed(1)}`:'Choose a location on the map.';
  function edit(p){
    endPlacement();editing=p?.id??null;locationPoint=p?[p.x,p.y]:null;
    panel.open=true;$('#customPOIForm').hidden=false;$('#customPOIHeading').textContent=p?'Edit point of interest':'New point of interest';
    $('#customPOIName').value=p?.name||'';$('#customPOIKind').value=p?.kind||'encounter';$('#customPOINotes').value=p?.notes||'';
    updateLocation();$('#customPOIName').focus();
  }
  $('#customPOIAdd').onclick=()=>edit(null);
  $('#customPOICancel').onclick=()=>{endPlacement();$('#customPOIForm').hidden=true;};
  $('#customPOIPlace').onclick=()=>{placing=true;placement.hidden=false;map.classList.add('placing-poi');map.scrollIntoView({block:'center'});map.focus({preventScroll:true});};
  function place(x,y){
    if(x<0||x>3840||y<0||y>2160){status('Choose a point inside the map.');return;}
    locationPoint=[Math.round(x*100)/100,Math.round(y*100)/100];endPlacement();updateLocation();$('#customPOIForm').scrollIntoView({block:'nearest'});
  }
  map.addEventListener('click',e=>{if(placing){e.stopImmediatePropagation();if(!lastDrag)place(...point(e));}},true);
  map.addEventListener('keydown',e=>{if(!placing)return;if(e.key==='Escape'){e.preventDefault();endPlacement();}if(e.key==='Enter'){e.preventDefault();place(box[0]+box[2]/2,box[1]+box[3]/2);}},true);
  const nextID=()=>Math.max(Date.now(),...items.map(p=>p.id+1));
  function commit(next){
    try{
      const checked=decode({version:1,pois:next});
      localStorage.setItem(KEY,JSON.stringify({version:1,pois:checked}));items=checked;sync();return true;
    }catch(error){status(error.name==='QuotaExceededError'?'Browser storage is full. Export a backup before clearing storage.':error.message||'Could not save POIs in this browser.');return false;}
  }
  function sync(){
    for(let i=records.length-1;i>=0;i--)if(records[i].type==='custompoi')records.splice(i,1);
    records.push(...items.map(p=>({type:'custompoi',id:p.id,name:p.name,sub:'My POI · '+kinds[p.kind][0]})));
    $('#customPOIList').innerHTML=items.map(p=>resultHTML({type:'custompoi',id:p.id,name:p.name,sub:kinds[p.kind][0]})).join('')||'<p class="muted">No custom locations yet.</p>';
    catalogue();if($('#search').value)$('#search').dispatchEvent(new Event('input',{bubbles:true}));renderView();
  }
  $('#customPOIForm').onsubmit=e=>{
    e.preventDefault();if(!locationPoint){status('Choose a map location before saving.');return;}
    const p={...(items.find(p=>p.id===editing)||{}),pendingSync:true,id:editing??nextID(),name:$('#customPOIName').value.trim(),kind:$('#customPOIKind').value,notes:$('#customPOINotes').value,x:locationPoint[0],y:locationPoint[1]};
    const next=editing?items.map(old=>old.id===editing?p:old):[...items,p];
    if(commit(next)){endPlacement();$('#customPOIForm').hidden=true;status('POI saved in this browser.');show('custompoi',p.id,false);dispatchEvent(new CustomEvent('atlas-poi-saved',{detail:p.id}));}
  };
  const priorShow=show;
  show=function(type,id,fly=true){
    if(placing)return;
    if(type!=='custompoi')return priorShow(type,id,fly);
    const p=items.find(p=>p.id===+id);if(!p)return;
    selected={type:'custompoi',id:p.id};
    const toggle=$('[data-layer="custompois"]');toggle.checked=true;layer.removeAttribute('hidden');
    $('#info').innerHTML=`<span class="eyebrow">MY POI · ${esc(kinds[p.kind][0])}</span><h2>${esc(p.name)}</h2><p class="note">${esc(p.notes||'No notes yet.')}</p><p class="muted">${p.notePath?'Linked campaign location'+(p.pendingSync?' · local changes waiting to sync':p.pendingReview?' · awaiting merge':''):'Local draft'}</p><div class="journey-actions"><button type="button" id="customPOIEdit">Edit / move POI</button><button type="button" id="customPOIDelete">Delete POI</button></div><div id="customPOIDeleteConfirm"></div>`;
    $('#customPOIEdit').onclick=()=>edit(p);
    if(publishedItems.has(p.id)&&(p.pendingSync||p.pendingReview)){
      const reset=document.createElement('button');reset.type='button';reset.textContent='Use published version';
      reset.onclick=()=>{reset.textContent='Discard local changes and use published version';reset.onclick=()=>{if(commit(items.map(item=>item.id===p.id?publishedItems.get(p.id):item)))show('custompoi',p.id,false);};};
      $('#info').append(reset);
    }
    if(p.notePath){$('#customPOIDelete').disabled=true;$('#customPOIDelete').title='Remove the linked campaign note on GitHub to delete a published location.';}
    $('#customPOIDelete').onclick=()=>{
      $('#customPOIDeleteConfirm').innerHTML='<p>Delete this custom location?</p><button type="button" id="customPOIDeleteYes">Delete permanently</button><button type="button" id="customPOIDeleteNo">Keep POI</button>';
      $('#customPOIDeleteNo').onclick=()=>$('#customPOIDeleteConfirm').replaceChildren();
      $('#customPOIDeleteYes').onclick=()=>{
        if(commit(items.filter(item=>item.id!==p.id))){selected=null;$('#selection').replaceChildren();$('#info').innerHTML='<h2>Custom POI deleted</h2>';history.replaceState(null,'',location.pathname+location.search);if(parent!==window)parent.postMessage({type:'atlas-custom-selection-cleared'},location.origin);status('POI deleted.');}
      };
    };
    $('#selection').innerHTML=`<circle cx="${p.x}" cy="${p.y}" r="12"/>`;$('#status').textContent=p.name;
    history.replaceState(null,'','#custompoi-'+p.id);
    if(fly)focusPoints([[p.x,p.y]],240);else renderView();
  };
  const priorRender=renderSettlementNames;
  renderSettlementNames=function(z,unit){
    priorRender(z,unit);
    const enabled=layerEnabled('custompois');
    labels.toggleAttribute('hidden',!enabled||!layerEnabled('custompoilabels'));
    const visible=items.filter(p=>inView(p.x,p.y));
    layer.innerHTML=visible.map(p=>`<g data-type="custompoi" data-id="${p.id}" transform="translate(${p.x} ${p.y})"><title>${esc(p.name)}</title><circle r="${22*unit}" fill="transparent"/><use href="#poi-${kinds[p.kind][1]}" transform="scale(${.65*unit})"/></g>`).join('');
    const occupied=[];
    labels.innerHTML=enabled&&layerEnabled('custompoilabels')?visible.map(p=>{
      const rect=[p.x+16*unit,p.y-12*unit,p.name.length*7*unit,16*unit];if(occupied.some(r=>intersects(r,rect)))return '';occupied.push(rect);
      return `<text x="${rect[0]}" y="${p.y}" font-size="${12*unit}" stroke-width="${2.5*unit}">${esc(p.name)}</text>`;
    }).join(''):'';
  };
  $('#customPOIExport').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,pois:items},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='Saeroth-custom-POIs.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status(`Exported ${items.length} custom POIs, including notes.`);
  };
  $('#customPOIImport').onclick=()=>$('#customPOIFile').click();
  $('#customPOIFile').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>16*1024*1024)throw Error('Choose a POI backup smaller than 16 MB.');
      const imported=decode(JSON.parse(await file.text())),fresh=imported.filter(p=>!items.some(old=>old.id===p.id));
      if(commit([...items,...fresh]))status(`Imported ${fresh.length} POIs. ${imported.length-fresh.length} existing IDs skipped; existing locations were kept.`);
    }catch(error){status(error instanceof SyntaxError?'This file is not valid JSON. Nothing was imported.':error.message);}
    e.target.value='';
  };
  window.ATLAS_CUSTOM_POIS={
    has:id=>items.some(p=>p.id===+id),
    all:()=>items.map(p=>({...p})),
    get:id=>{const p=items.find(p=>p.id===+id);return p?{...p}:null;},
    synced:(snapshot,notePath,noteSHA)=>{
      const current=items.find(p=>p.id===snapshot.id);if(!current)return;
      const unchanged=['name','kind','notes','x','y'].every(k=>current[k]===snapshot[k]);
      commit(items.map(p=>p.id===snapshot.id?{...p,notePath,noteSHA,pendingSync:!unchanged,pendingReview:true}:p));
    }
  };
  sync();
  fetch('campaign-pois.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(value=>{
    const shared=decode(value).map(p=>({...p,published:true})),local=items;shared.forEach(p=>publishedItems.set(p.id,p));
    items=[...shared.map(p=>local.find(l=>l.id===p.id&&(l.pendingSync||l.pendingReview&&l.noteSHA!==p.noteSHA))||p),...local.filter(p=>!shared.some(s=>s.id===p.id)&&(!p.published||p.pendingSync||p.pendingReview))];sync();
    try{localStorage.setItem(KEY,JSON.stringify({version:1,pois:items}));}catch(_){}
    const link=location.hash.match(/^#custompoi-(\d+)$/);if(link)show('custompoi',+link[1],false);
  }).catch(()=>{});
  const initial=location.hash.match(/^#custompoi-(\d+)$/);if(initial)show('custompoi',+initial[1],false);
})();
