/* A personal atlas workspace. Geography and campaign notes remain authoritative. */
(() => {
  'use strict';
  const KEY = 'saeroth-atlas-workbench-v1';
  const limits = {saved:100, recent:20, views:30};
  const keyPattern = /^(nation|burg|poi|province|subprovince|custompoi|route)-(0|[1-9]\d*)$/;
  const el = id => document.getElementById(id);
  const aside = document.querySelector('aside'), info = el('info');
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
  const recordKey = r => `${r.type}-${r.id}`;
  const layerKeys = new Set([...document.querySelectorAll('[data-layer]')].map(input => input.dataset.layer));
  let positions=new Map();
  function refreshPositions(){
    positions=new Map([
      ...D.burgs.map(p=>['burg-'+p.i,[p.x,p.y]]),
      ...D.markers.map(p=>['poi-'+p.i,[p.x,p.y]]),
      ...(window.ATLAS_CUSTOM_POIS?.all()||[]).map(p=>['custompoi-'+p.id,[p.x,p.y]])
    ]);
  }
  refreshPositions();
  const empty = () => ({version:1,saved:[],recent:[],views:[]});
  const validKey = key => typeof key === 'string' && keyPattern.test(key) && Number.isSafeInteger(Number(key.match(keyPattern)[2]));
  const byKey = key => records.find(r => recordKey(r) === key);
  function decode(value) {
    if (!value || value.version !== 1) throw Error('Choose a Saeroth atlas workspace backup (version 1).');
    for (const field of ['saved','recent','views']) {
      if (!Array.isArray(value[field]) || value[field].length > limits[field]) throw Error(`The backup has too many or invalid ${field}. Nothing was imported.`);
    }
    if (![...value.saved,...value.recent].every(validKey)) throw Error('The backup contains an invalid place reference. Nothing was imported.');
    const ids = new Set();
    const views = value.views.map(view => {
      if (!view || typeof view.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(view.id) || ids.has(view.id)
        || typeof view.name !== 'string' || !view.name.trim() || view.name.length > 80
        || !Array.isArray(view.box) || view.box.length !== 4 || !view.box.every(Number.isFinite)
        || view.box[0] < -700 || view.box[0] > 4540 || view.box[1] < -400 || view.box[1] > 2560
        || view.box[2] < 110 || view.box[2] > 6000 || Math.abs(view.box[3] - view.box[2]*9/16) > .01
        || !['terrain','political'].includes(view.style) || typeof view.sepia !== 'boolean'
        || view.selection !== null && !validKey(view.selection)
        || !view.layers || typeof view.layers !== 'object' || Array.isArray(view.layers)
        || Object.entries(view.layers).some(([key,on]) => !layerKeys.has(key) || typeof on !== 'boolean')) {
        throw Error('The backup contains an invalid saved view. Nothing was imported.');
      }
      ids.add(view.id);
      return {id:view.id,name:view.name.trim(),box:[...view.box],style:view.style,sepia:view.sepia,selection:view.selection,layers:{...view.layers}};
    });
    return {version:1,saved:[...new Set(value.saved)],recent:[...new Set(value.recent)],views};
  }
  let prefs=empty(), unreadable=null;
  try {const raw=localStorage.getItem(KEY);if(raw){try{prefs=decode(JSON.parse(raw));}catch{unreadable=raw;}}}catch{}

  const icon = name => {
    const paths={pin:'M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z M9 9a3 3 0 1 0 6 0a3 3 0 1 0-6 0',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',target:'M12 2v4m0 12v4M2 12h4m12 0h4M5 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',link:'m10 13 4-4m-5 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16'};
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.map}"/></svg>`;
  };
  const heading=document.createElement('div');heading.className='atlas-workbench-heading';
  heading.innerHTML=`${icon('map')}<div><span class="eyebrow">THE WORLD OF SAEROTH</span><h2>Living Atlas</h2></div><span class="atlas-gm-label">GM</span>`;
  aside.prepend(heading);
  document.querySelector('.search label').textContent='Find your next destination';
  const search=el('search'), results=el('results');
  search.placeholder='Search places, nations, and routes…';
  search.setAttribute('role','combobox');search.setAttribute('aria-autocomplete','list');search.setAttribute('aria-controls','results');search.setAttribute('aria-expanded','false');search.setAttribute('spellcheck','false');
  results.setAttribute('role','listbox');results.setAttribute('aria-label','Atlas search results');results.removeAttribute('aria-live');
  const filters=document.createElement('div');filters.className='atlas-search-filters';
  filters.innerHTML='<label for="atlasSearchType" class="atlas-visually-hidden">Search category</label><select id="atlasSearchType"><option value="all">All places</option><option value="custompoi">Campaign POIs</option><option value="nation">Nations</option><option value="burg">Settlements</option><option value="poi">Landmarks</option><option value="territory">Provinces & districts</option><option value="route">Roads & sea lanes</option></select><button type="button" id="atlasSearchClear" aria-label="Clear place search">Clear</button>';
  search.after(filters);
  const searchCount=document.createElement('p');searchCount.id='atlasSearchCount';searchCount.className='atlas-search-count';searchCount.setAttribute('role','status');searchCount.setAttribute('aria-live','polite');results.after(searchCount);
  let matches=[],active=-1;
  const categoryMatches=(r,type)=>type==='all'||r.type===type||type==='territory'&&['province','subprovince'].includes(r.type);
  function renderSearch(){
    const query=normalize(search.value.trim()),category=el('atlasSearchType').value,words=query.split(/\s+/).filter(Boolean);
    let found=[];
    if(query||category!=='all') found=records.filter(r=>categoryMatches(r,category)).map(r=>{
      const name=normalize(r.name),context=normalize(r.sub),haystack=name+' '+context;
      if(!words.every(word=>haystack.includes(word)))return null;
      const score=(name===query?100:name.startsWith(query)?70:name.includes(query)?50:20)+(r.type==='custompoi'?5:0);
      return {r,score};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||a.r.name.localeCompare(b.r.name));
    matches=found.slice(0,40).map(entry=>entry.r);active=-1;search.removeAttribute('aria-activedescendant');
    results.innerHTML=matches.map((r,i)=>`<button type="button" class="result" id="atlasResult-${i}" role="option" aria-selected="false" tabindex="-1" data-type="${r.type}" data-id="${r.id}"><span>${esc(r.name)}</span><small>${esc(r.sub||r.type)}</small></button>`).join('');
    results.hidden=!matches.length;search.setAttribute('aria-expanded',String(!!matches.length));
    searchCount.textContent=query||category!=='all'?(found.length?`${found.length.toLocaleString()} matches${found.length>40?' · first 40 shown':''}`:'No matching places. Try another name or category.'):'Search the atlas, or open Saved for your places and views.';
  }
  function closeSearch(){results.hidden=true;search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');active=-1;}
  search.addEventListener('input',renderSearch);search.addEventListener('focus',renderSearch);
  search.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeSearch();return;}
    if(event.key==='Enter'){
      event.preventDefault();event.stopImmediatePropagation();const option=matches[active>=0?active:0];
      if(option){show(option.type,option.id);closeSearch();focusMap();el('atlasSelectionDetails').focus({preventScroll:true});}return;
    }
    if(!['ArrowDown','ArrowUp'].includes(event.key))return;
    event.preventDefault();event.stopImmediatePropagation();if(results.hidden)renderSearch();if(!matches.length)return;
    active=(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length;
    [...results.children].forEach((button,i)=>button.setAttribute('aria-selected',String(i===active)));
    const option=results.children[active];search.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});
  },true);
  results.addEventListener('pointerdown',event=>event.preventDefault());
  results.addEventListener('click',()=>{closeSearch();queueMicrotask(focusMap);});
  el('atlasSearchType').addEventListener('change',renderSearch);
  el('atlasSearchClear').onclick=()=>{search.value='';el('atlasSearchType').value='all';renderSearch();search.focus();};
  document.addEventListener('keydown',event=>{
    if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.closest('input,textarea,select,[contenteditable]')){event.preventDefault();search.focus();search.select();}
  });

  const library=document.createElement('details');library.id='atlasLibrary';library.className='atlas-controls atlas-library';library.open=true;
  library.innerHTML='<summary>Your atlas <span id="atlasSavedCount"></span></summary><div class="atlas-library-tabs" role="tablist" aria-label="Your atlas"><button type="button" id="atlasSavedTab" role="tab" aria-selected="true" aria-controls="atlasLibraryContent" data-library="saved">Saved places</button><button type="button" id="atlasRecentTab" role="tab" aria-selected="false" aria-controls="atlasLibraryContent" tabindex="-1" data-library="recent">Recent</button><button type="button" id="atlasViewsTab" role="tab" aria-selected="false" aria-controls="atlasLibraryContent" tabindex="-1" data-library="views">Views</button></div><div id="atlasLibraryContent" role="tabpanel" aria-labelledby="atlasSavedTab"></div><form id="atlasViewForm" hidden><label for="atlasViewName">Name this map view</label><div class="atlas-view-field"><input id="atlasViewName" maxlength="80" required placeholder="Northern expedition"><button type="submit">Save view</button></div></form><details class="atlas-backups"><summary>Back up your atlas workspace</summary><p class="muted">Saved places and views stay in this browser. Export them to move to another device. Custom POI notes have their own backup under My points of interest.</p><div class="journey-actions"><button type="button" id="atlasWorkspaceExport">Export workspace</button><button type="button" id="atlasWorkspaceImport">Import workspace</button></div><input id="atlasWorkspaceFile" type="file" accept="application/json,.json" hidden><button type="button" id="atlasRecover" hidden>Download unreadable data</button></details><p id="atlasWorkspaceStatus" role="status" aria-live="polite"></p>';
  info.after(library);
  let libraryTab='saved';
  const report=message=>{el('atlasWorkspaceStatus').textContent=message;};
  function save(next){
    if(unreadable!==null){report('Your previous workspace could not be read. Download the unreadable data below, then import a valid backup to recover it. Existing data has been kept.');return false;}
    try{const checked=decode(next);localStorage.setItem(KEY,JSON.stringify(checked));prefs=checked;renderLibrary();return true;}
    catch(error){report('Changes could not be saved in this browser. Export a backup or free browser storage and try again.');return false;}
  }
  const placeRow=(key,removable=false)=>{
    const r=byKey(key);
    return `<div class="atlas-library-row">${r?`<button type="button" class="result" data-type="${r.type}" data-id="${r.id}"><span>${esc(r.name)}</span><small>${esc(r.sub||r.type)}</small></button>`:`<span class="atlas-missing-place">Location unavailable<small>${esc(key)}</small></span>`}${removable?`<button type="button" class="atlas-remove" data-remove-saved="${key}" aria-label="Remove ${esc(r?.name||key)} from saved places">×</button>`:''}</div>`;
  };
  function renderLibrary(){
    el('atlasSavedCount').textContent=prefs.saved.length?String(prefs.saved.length):'';
    const content=el('atlasLibraryContent');
    if(libraryTab==='views')content.innerHTML=prefs.views.map(view=>`<div class="atlas-library-row"><button type="button" class="result" data-restore-view="${view.id}"><span>${esc(view.name)}</span><small>${view.style==='terrain'?'Terrain':'Political'} · ${(3840/view.box[2]).toFixed(1)}× zoom</small></button><button type="button" class="atlas-remove" data-remove-view="${view.id}" aria-label="Delete saved view ${esc(view.name)}">×</button></div>`).join('')||'<p class="atlas-library-empty">Keep a view of a region, its zoom, and map layers ready for your next session.</p>';
    else content.innerHTML=prefs[libraryTab].map(key=>placeRow(key,libraryTab==='saved')).join('')||`<p class="atlas-library-empty">${libraryTab==='saved'?'Select a location and choose Save place to keep your campaign destinations close.':'Places you explore will appear here.'}</p>`;
    el('atlasViewForm').hidden=libraryTab!=='views';
    content.setAttribute('aria-labelledby',`atlas${libraryTab==='saved'?'Saved':libraryTab==='recent'?'Recent':'Views'}Tab`);
    document.querySelectorAll('[data-library]').forEach(button=>{const on=button.dataset.library===libraryTab;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});
    updateSaveButton();
  }
  document.querySelector('.atlas-library-tabs').addEventListener('click',event=>{const tab=event.target.closest('[data-library]');if(tab){libraryTab=tab.dataset.library;renderLibrary();}});
  document.querySelector('.atlas-library-tabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const tabs=[...document.querySelectorAll('[data-library]')],index=tabs.findIndex(tab=>tab.dataset.library===libraryTab);
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tabs[next].click();tabs[next].focus();
  });
  library.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.type)queueMicrotask(focusMap);
    if(button.dataset.removeSaved){if(save({...prefs,saved:prefs.saved.filter(key=>key!==button.dataset.removeSaved)})){report('Place removed from saved places.');el('atlasSavedTab').focus();}}
    if(button.dataset.removeView){if(save({...prefs,views:prefs.views.filter(view=>view.id!==button.dataset.removeView)})){report('Saved view removed.');el('atlasViewsTab').focus();}}
    if(button.dataset.restoreView){const view=prefs.views.find(v=>v.id===button.dataset.restoreView);if(view)restoreView(view);}
  });
  el('atlasViewForm').onsubmit=event=>{
    event.preventDefault();if(prefs.views.length>=limits.views){report('You have 30 saved views. Remove an old view before saving another.');return;}
    const name=el('atlasViewName').value.trim();if(!name)return;
    const view={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name,box:[...box],style:map.dataset.style==='political'?'political':'terrain',sepia:!!el('sepiaMap')?.checked,selection:selected?recordKey(selected):null,layers:Object.fromEntries([...document.querySelectorAll('[data-layer]')].map(input=>[input.dataset.layer,input.checked]))};
    if(save({...prefs,views:[...prefs.views,view]})){el('atlasViewName').value='';report(`Saved “${name}” with its zoom and layers.`);}
  };
  function restoreView(view){
    const r=view.selection&&byKey(view.selection);if(r)show(r.type,r.id,false);
    else{
      selected=null;el('selection').replaceChildren();map.classList.remove('route-selected-mode');
      document.querySelectorAll('.route-selected').forEach(node=>node.classList.remove('route-selected'));
      el('handoutCover')?.setAttribute('hidden','');
      info.innerHTML=`<span class="eyebrow">SAVED VIEW</span><h2>${esc(view.name)}</h2><p>This view restores its map position and layers. Select a place for details.</p>`;
      history.replaceState(null,'',location.pathname+location.search);
      if(parent!==window)parent.postMessage({type:'atlas-custom-selection-cleared'},location.origin);
    }
    document.querySelector(`button[data-style="${view.style}"]`).click();
    for(const input of document.querySelectorAll('[data-layer]'))if(Object.hasOwn(view.layers,input.dataset.layer)){input.checked=view.layers[input.dataset.layer];input.dispatchEvent(new Event('change',{bubbles:true}));}
    if(el('sepiaMap')){el('sepiaMap').checked=view.sepia;el('sepiaMap').dispatchEvent(new Event('change',{bubbles:true}));}
    box=[...view.box];renderView();focusMap();
    report(`Opened “${view.name}”.${view.selection&&!r?' Its selected place is not available on this device.':''}`);
  }
  function download(value,name,type='application/json'){
    const url=URL.createObjectURL(new Blob([value],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  el('atlasWorkspaceExport').onclick=()=>{download(JSON.stringify(prefs,null,2),'Saeroth-atlas-workspace.json');report('Workspace exported. No credentials or campaign note text is included.');};
  el('atlasWorkspaceImport').onclick=()=>el('atlasWorkspaceFile').click();
  el('atlasWorkspaceFile').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
      if(file.size>1024*1024)throw Error('Choose a workspace backup smaller than 1 MB.');
      const incoming=decode(JSON.parse(await file.text()));
      const next=decode({version:1,saved:[...new Set([...prefs.saved,...incoming.saved])],recent:[...new Set([...prefs.recent,...incoming.recent])].slice(0,limits.recent),views:[...prefs.views,...incoming.views.filter(view=>!prefs.views.some(old=>old.id===view.id))]});
      // Keep an unreadable original under a recovery key before replacing it.
      if(unreadable!==null)localStorage.setItem(KEY+'-recovery',unreadable);
      localStorage.setItem(KEY,JSON.stringify(next));prefs=next;unreadable=null;el('atlasRecover').hidden=true;renderLibrary();
      report('Workspace imported. Existing saved places and views were kept.');
    }catch(error){report(error instanceof SyntaxError?'This file is not valid JSON. Nothing was imported.':error.message||'Import failed. Your workspace has been kept.');}
    event.target.value='';
  };
  if(unreadable!==null){el('atlasRecover').hidden=false;report('Your previous workspace could not be read. Its data is preserved. Download it before importing a valid backup.');}
  el('atlasRecover').onclick=()=>download(unreadable||'','Saeroth-atlas-workspace-recovery.txt','text/plain');

  const selectionCard=document.createElement('div');selectionCard.id='atlasSelectionCard';selectionCard.className='atlas-selection-card';selectionCard.hidden=true;
  selectionCard.innerHTML=`${icon('pin')}<div><span id="atlasSelectionKind"></span><strong id="atlasSelectionName"></strong></div><button type="button" id="atlasSelectionDetails">Details</button>`;
  document.querySelector('.mapframe').append(selectionCard);
  const findParty=document.createElement('button');findParty.id='atlasFindParty';findParty.type='button';findParty.title='Find party';findParty.setAttribute('aria-label','Find party');findParty.innerHTML=icon('target');
  el('mapHome').after(findParty);
  findParty.onclick=()=>{
    if(el('hexEnabled')?.checked&&!el('hexLocate')?.disabled){el('hexLocate').click();focusMap();return;}
    if(partyPlace&&Number.isFinite(partyPlace.x)&&Number.isFinite(partyPlace.y)){focusPoints([[partyPlace.x,partyPlace.y]],160);focusMap();return;}
    el('travelView').open=true;el('travelView').scrollIntoView({block:'start'});el('clearPartyLocation').hidden?el('travelView').querySelector('summary').focus():el('clearPartyLocation').focus();
    report('Select a settlement or landmark and choose Mark party here, or place the party in Hexcrawl.');
  };
  function focusMap(){document.querySelector('.mapframe').scrollIntoView({block:'start',behavior:'auto'});map.focus({preventScroll:true});}
  el('atlasSelectionDetails').onclick=()=>{info.scrollIntoView({block:'start',behavior:'auto'});info.querySelector('h2').tabIndex=-1;info.querySelector('h2').focus({preventScroll:true});};
  function updateSaveButton(){
    const button=el('atlasSavePlace');if(!button||!selected)return;
    const saved=prefs.saved.includes(recordKey(selected));button.setAttribute('aria-pressed',String(saved));button.innerHTML=icon('star')+(saved?'Place saved':'Save place');
  }
  function position(r){
    const p=positions.get(recordKey(r));
    return p&&p.every(Number.isFinite)?p:null;
  }
  function enhanceSelection(){
    if(!selected)return;const current=byKey(recordKey(selected));if(!current)return;
    selectionCard.hidden=false;el('atlasSelectionName').textContent=current.name;el('atlasSelectionKind').textContent={burg:'Settlement',custompoi:'Campaign location',poi:'Landmark',nation:'Nation',province:'Province',subprovince:'District',route:'Route'}[current.type]||'Place';
    const toolbar=document.createElement('div');toolbar.className='atlas-place-toolbar';
    toolbar.innerHTML=`<button type="button" id="atlasSavePlace">${icon('star')}Save place</button><button type="button" id="atlasCopyPlace">${icon('link')}Copy link</button><button type="button" id="atlasFocusPlace">${icon('target')}On map</button><span id="atlasPlaceFeedback" class="atlas-place-feedback" role="status" aria-live="polite"></span>`;
    info.querySelector('h2').after(toolbar);
    const actions=info.querySelector('.atlas-place-actions');if(actions){toolbar.after(actions);actions.querySelectorAll('button').forEach(button=>{button.addEventListener('click',()=>{if(button.id==='partyHere')el('atlasPlaceFeedback').textContent='Party location updated.';else document.getElementById(button.id==='routeStart'?'journeyFrom':'journeyTo').focus({preventScroll:true});});});}
    updateSaveButton();
    el('atlasSavePlace').onclick=()=>{
      const key=recordKey(current),saved=prefs.saved.includes(key);if(!saved&&prefs.saved.length>=limits.saved){el('atlasPlaceFeedback').textContent='You have 100 saved places. Remove one before saving another.';return;}
      if(save({...prefs,saved:saved?prefs.saved.filter(item=>item!==key):[...prefs.saved,key]}))el('atlasPlaceFeedback').textContent=saved?'Removed from saved places.':'Saved to Your atlas.';
    };
    el('atlasCopyPlace').onclick=async()=>{
      const url=new URL('../',location.href);url.hash='/atlas#'+recordKey(current);
      try{await navigator.clipboard.writeText(url.href);el('atlasPlaceFeedback').textContent='Place link copied.';}
      catch{const field=document.createElement('input');field.readOnly=true;field.value=url.href;field.setAttribute('aria-label','Place link to copy');el('atlasPlaceFeedback').replaceChildren(field);field.focus();field.select();}
    };
    el('atlasFocusPlace').onclick=()=>{show(current.type,current.id,true);focusMap();};
    const origin=position(current);if(origin){
      const nearby=records.filter(r=>recordKey(r)!==recordKey(current)).map(r=>{const p=position(r);return p?{r,km:Math.hypot(p[0]-origin[0],p[1]-origin[1])*(window.ATLAS_NETWORK?.kmPerUnit||2)}:null;}).filter(Boolean).sort((a,b)=>a.km-b.km||a.r.name.localeCompare(b.r.name)).slice(0,6);
      const section=document.createElement('details');section.className='atlas-nearby';
      section.innerHTML='<summary>Nearby places</summary><p class="muted">Straight-line distance, not a travel route. Use Plan route for roads and travel time.</p>'+nearby.map(({r,km})=>`<button type="button" class="result" data-type="${r.type}" data-id="${r.id}"><span>${esc(r.name)}<em>${km<1?'&lt;1':Math.round(km)} km</em></span><small>${esc(r.sub||r.type)}</small></button>`).join('');info.append(section);
    }
  }
  const previousShow=show;
  show=function(...args){
    previousShow(...args);
    if(!selected||selected.type!==args[0]||selected.id!==Number(args[1]))return;
    const key=recordKey(selected);
    if(prefs.recent[0]!==key)save({...prefs,recent:[key,...prefs.recent.filter(item=>item!==key)].slice(0,limits.recent)});
    // Some wrappers update an existing card without replacing its contents.
    info.querySelectorAll('.atlas-place-toolbar,.atlas-nearby').forEach(node=>node.remove());enhanceSelection();
  };
  function renderLanding(){
    const target=el('atlasLanding');if(!target)return;
    const campaign=(window.ATLAS_CUSTOM_POIS?.all()||[]).filter(p=>p.published||p.notePath).slice(0,5);
    target.innerHTML=campaign.length?'<h3>Campaign locations</h3>'+campaign.map(p=>`<button type="button" class="result" data-type="custompoi" data-id="${p.id}"><span>${esc(p.name)}</span><small>Open on the atlas</small></button>`).join(''):'';
  }
  if(!selected){
    const countMarkup=el('counts')?.innerHTML||'';
    info.innerHTML=`<span class="eyebrow">EXPLORE SAEROTH</span><h2>A world to return to</h2><p>Follow a road, find your next destination, or pick up where the party left off.</p><div id="counts" class="stats">${countMarkup}</div><div id="atlasLanding"></div><p class="muted">Select a place to read its lore, plan a journey, or mark the party. Press <kbd>/</kbd> to search.</p>`;
    renderLanding();
  }
  window.addEventListener('atlas-custom-pois-change',()=>{refreshPositions();renderSearch();renderLibrary();renderLanding();});
  new MutationObserver(()=>{selectionCard.hidden=!selected||!info.querySelector('.atlas-place-toolbar');}).observe(info,{childList:true});
  renderSearch();renderLibrary();if(selected)enhanceSelection();
  // Deliberately expose validation only, so backup tools can validate without mutating the atlas.
  window.AtlasWorkspace={validate:decode};
})();
