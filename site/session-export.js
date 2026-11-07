/* Assemble a portable GM session without changing the campaign or a Foundry world. */
(() => {
  'use strict';
  const KINDS = ['road','camp','ruin','cave','shrine','inn','fort','bridge','tower'];
  const TERRAINS = ['forest','mountain','grassland','desert','snow','swamp','coast'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanKey = value => typeof value === 'string' && value.length < 500 && /^campaign\/[^?#\x00-\x1f]+\.md$/i.test(value) && !value.includes('\\') && !value.split('/').some(p => p === '.' || p === '..');
  let config, base, host, generation = 0, selectedActors = [], map = null, catalog = [], catalogPromise, catalogReady = false, catalogError = '', presets = [];
  let actorKey, mapKey, storageWarning = '', mapWarning = '', recovery = [], busy = false, downloadURL = '', exportController, assetPromise;

  function validateMap(value) {
    const r = value?.recipe;
    if (!value || value.version !== 1 || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 160 || /[\x00-\x1f\x7f]/.test(value.name) ||
        !r || r.version !== 1 || r.generatorVersion !== 1 || !r.source || !['poi','custompoi','burg'].includes(r.source.type) ||
        !Number.isSafeInteger(r.source.id) || r.source.id < 0 || !KINDS.includes(r.kind) || !TERRAINS.includes(r.terrain) ||
        ![24,32,40].includes(r.size) || !['day','night'].includes(r.time) || typeof r.seed !== 'string' || !r.seed.trim() ||
        r.seed.length > 80 || /[\x00-\x1f\x7f]/.test(r.seed)) throw Error('The selected battle map recipe is invalid. Choose a map in the atlas again.');
    return {version:1,name:value.name.trim(),recipe:{version:1,generatorVersion:1,source:{type:r.source.type,id:r.source.id},kind:r.kind,terrain:r.terrain,size:r.size,time:r.time,seed:r.seed.trim()}};
  }
  function validateActors(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.actors) || value.actors.length > 50 ||
        value.actors.some(a => !a || !cleanKey(a.key) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 160 || /[\x00-\x1f\x7f]/.test(a.name))) throw Error('Saved NPC selections are invalid.');
    if (new Set(value.actors.map(a => a.key)).size !== value.actors.length) throw Error('Saved NPC selections contain duplicates.');
    return value.actors.map(a => ({key:a.key,name:a.name}));
  }
  function readSaved(key, validate, fallback) {
    let raw;
    try {
      const preserved=localStorage.getItem(key+':recovery');
      if(preserved)recovery.push({key,data:preserved,protected:true});
      raw = window.SaerothSessionPrep?window.SaerothSessionPrep.initialValue(key):localStorage.getItem(key); return raw ? validate(JSON.parse(raw)) : fallback;
    }
    catch (_) {
      if (raw) {
        let protectedCopy=false;
        try {
          const prior=localStorage.getItem(key+':recovery');
          if(!prior)localStorage.setItem(key+':recovery',raw);
          protectedCopy=localStorage.getItem(key+':recovery')===raw;
        } catch(_) { /* Keep the original at its existing key if recovery cannot be saved. */ }
        if(!recovery.some(r=>r.key===key&&r.data===raw))recovery.push({key,data:raw,protected:protectedCopy});
      }
      storageWarning = raw ? 'A saved selection could not be read. Its original data is preserved; download the recovery copy below.' : 'Browser storage is unavailable. Download your session package before leaving.';
      return fallback;
    }
  }
  function save(key, value) {
    try { window.SaerothSessionPrep?.assertWritable(); } catch (_) { return false; }
    if (recovery.some(r => r.key === key && !r.protected)) return false;
    try { const data=value===null?null:JSON.stringify(value);if(data===null)localStorage.removeItem(key);else localStorage.setItem(key,data);window.SaerothSessionPrep?.recordWrite(key,data);return true; }
    catch (_) { return false; }
  }
  function configure(options) {
    config = options; base = new URL(options.base || './',location.href);
    actorKey = 'saeroth-session-actors-v1:' + base.pathname;
    mapKey = 'saeroth-session-map-v1:' + base.pathname;
    recovery = []; storageWarning = ''; mapWarning = '';
    selectedActors = readSaved(actorKey,validateActors,[]);
    map = readSaved(mapKey,validateMap,null);
    let initialRaw;try{initialRaw=window.SaerothSessionPrep?.initialValue('saeroth-encounter-v1:'+base.pathname);}catch(_){/* The planner reports its own storage warning. */}
    window.SaerothEncounterPlanner?.configure({base:base.href,getMap:()=>map,selectMap,validateMap,loadMapAssets,onChange:refreshSummary,initialRaw});
  }
  function selectMap(value) {
    if (!base) throw Error('The campaign desk is still loading.');
    map = validateMap(value);
    const saved = save(mapKey,map);
    mapWarning = saved ? '' : 'This map is available in this tab, but could not be saved on the device. Download the session package before leaving.';
    renderMap(); window.SaerothEncounterPlanner?.mapChanged(); refreshSummary();
    document.dispatchEvent(new CustomEvent('saeroth-session-change'));
    return {saved,message:saved?'Added to your session package. Open the Campaign desk to include notes and NPCs.':mapWarning};
  }
  function persistActors() {
    if (!save(actorKey,{version:1,actors:selectedActors})) storageWarning = 'NPC selections could not be saved on this device. Download the session package before leaving.';
    else if (!recovery.length) storageWarning = '';
    refreshSummary();
    document.dispatchEvent(new CustomEvent('saeroth-session-change'));
  }
  function unmount() {
    window.SaerothEncounterPlanner?.unmount();
    generation++; host = null; busy = false; exportController?.abort(); exportController = null;
    if (downloadURL) { URL.revokeObjectURL(downloadURL); downloadURL = ''; }
  }
  function mount(element) {
    unmount(); if (!element || !config) return; host = element;
    const ticket = generation;
    host.className = 'session-package';
    host.innerHTML =
      '<div class="sp-heading"><div><p class="ws-eyebrow">Ready for Foundry</p><h3>Session package</h3></div><span class="ws-label">GM only</span></div>' +
      '<p class="ws-small ws-muted">Bring your reference packet, one battle map, and selected campaign NPCs into Foundry together.</p>' +
      '<div id="spPresets" class="sp-presets" hidden></div>' +
      '<div class="sp-map-head"><h4>Battle map</h4><a class="ws-button" href="#/atlas">Choose in atlas</a></div><div id="spMap"></div>' +
      '<details id="spActorPicker" class="sp-actor-picker"><summary>Choose NPCs <span id="spActorCount"></span></summary>' +
      '<p class="ws-small ws-muted">The importer finds their sheets in your Saeroth compendiums and keeps existing world actors unchanged.</p>' +
      '<label class="ws-field" for="spActorSearch">Search campaign NPCs and creatures<input type="search" id="spActorSearch" placeholder="Name or creature…" autocomplete="off"></label>' +
      '<div id="spActorChoices" class="sp-actor-choices"></div><button type="button" class="ws-button" id="spCatalogRetry" hidden>Reload NPC list</button></details>' +
      '<div id="spSelectedActors" class="sp-selected-actors"></div>' +
      '<div id="spEncounter"></div>' +
      '<div class="sp-preview"><h4>Package contents</h4><p id="spSummary"></p><p class="ws-small ws-muted">The journal and scene start unshared. The scene is inactive. Encounter opponents are placed hidden only when you choose their starting positions; combat is never started.</p></div>' +
      '<button class="ws-button ws-primary sp-export" type="button" id="spExport">Download session package</button><button class="ws-button sp-cancel" type="button" id="spCancel" hidden>Cancel export</button>' +
      '<p id="spStatus" role="status" aria-live="polite"></p><p id="spStorage" class="ws-small ws-muted"></p>' +
      '<div id="spDownloads" class="sp-downloads"></div><button class="ws-button" type="button" id="spRecovery" hidden>Download selection recovery</button>' +
      '<details class="ws-help"><summary>Import this package into Foundry</summary><ol><li>Enable <strong>Towers of Saeroth PF2e Content 0.4.0 or newer</strong> for encounter packages in your Foundry v14 world. Packages without encounters still work with 0.3.0.</li><li>Open <strong>Import Saeroth Session</strong> from Scenes or Journals and choose this JSON file.</li><li>Review the map, notes, NPCs, and encounter, then import. Artwork travels inside the package.</li></ol><p>Selected campaign NPCs must be available in your Saeroth compendiums; standard creatures use your installed PF2e packs. Update the module or use <strong>Sync Saeroth Content</strong> if the preview reports a missing campaign sheet.</p></details>';
    host.querySelector('#spActorSearch').oninput = renderActors;
    host.querySelector('#spExport').onclick = exportPackage;
    host.querySelector('#spCancel').onclick = () => {exportController?.abort();status('Cancelling export…');};
    host.querySelector('#spRecovery').onclick = () => saveDownload(new Blob([JSON.stringify({version:1,selections:recovery.map(({key,data})=>({key,data}))},null,2)],{type:'application/json'}),'saeroth-session-selection-recovery.json','Save recovery data');
    host.querySelector('#spCatalogRetry').onclick = () => { catalogPromise = null; loadCatalog(ticket); };
    window.SaerothEncounterPlanner?.mount(host.querySelector('#spEncounter'));
    renderMap(); renderActors(); refreshSummary(); loadCatalog(ticket); loadPresets(ticket);
  }
  function status(message,error=false) {
    const node = host?.querySelector('#spStatus'); if (!node) return;
    node.textContent = message; node.classList.toggle('sp-error',error);
  }
  function refreshSummary() {
    if (!host) return;
    const draft = config.snapshot();
    const encounter=window.SaerothEncounterPlanner?.summary(),extra=encounter?.sources.filter(key=>!selectedActors.some(a=>a.key===key)).length||0,sheets=selectedActors.length+extra;
    if(encounter?.opponents)for(const input of host.querySelectorAll('[data-preset-encounter]'))if(!input.dataset.userChoice)input.checked=false;
    host.querySelector('#spSummary').textContent = (draft.board.length + 1 + (encounter?.opponents?1:0)) + ' journal pages · ' + (map ? '1 scene' : 'No scene') + ' · ' + sheets + ' NPC ' + (sheets===1?'sheet':'sheets') + (encounter?.opponents?' · '+encounter.opponents+' opponents'+(encounter.staging?' ('+encounter.placements+' positioned)':' (roster only)'):'');
    host.querySelector('#spActorCount').textContent = '(' + selectedActors.length + ')';
    host.querySelector('#spStorage').textContent = [storageWarning,mapWarning].filter(Boolean).join(' ');
    host.querySelector('#spRecovery').hidden = !recovery.length;
    host.querySelector('#spExport').disabled = busy;
    host.querySelector('#spCancel').hidden = !busy;
    renderSelected();
  }
  function renderSelected() {
    const node = host?.querySelector('#spSelectedActors'); if (!node) return;
    node.innerHTML = selectedActors.length ? '<ul>' + selectedActors.map(a => '<li><span>' + esc(a.name) + '</span><button type="button" aria-label="Remove ' + esc(a.name) + '" data-remove-actor="' + esc(a.key) + '">Remove</button></li>').join('') + '</ul>' : '<p class="ws-small ws-muted">No NPC sheets selected. Your reference notes are included regardless.</p>';
    node.onclick = event => {
      const button = event.target.closest('[data-remove-actor]'); if (!button || busy) return;
      selectedActors = selectedActors.filter(a => a.key !== button.dataset.removeActor); persistActors(); renderActors();
      host?.querySelector('#spActorPicker > summary')?.focus();
    };
  }
  function renderMap() {
    const node = host?.querySelector('#spMap'); if (!node) return;
    if (!map) { node.innerHTML = '<p class="sp-map-empty">Optional: select a POI, generate a battle map, then choose <strong>Add to session</strong>.</p>'; return; }
    const r = map.recipe;
    node.innerHTML = '<div class="sp-map-card"><svg class="sp-map-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/></svg><div><strong>' + esc(map.name) + '</strong><small>' + r.size + ' × ' + r.size + ' squares · ' + esc(r.terrain) + ' · ' + esc(r.time) + '</small><a href="#/atlas#' + r.source.type + '-' + r.source.id + '">Open this place in the atlas</a></div><button class="ws-button" type="button" id="spRemoveMap">Remove</button></div>';
    node.querySelector('#spRemoveMap').onclick = () => {
      if (busy) return;
      map = null; mapWarning = save(mapKey,null) ? '' : 'The selected map was removed from this tab only. Browser storage could not be updated.';
      renderMap(); window.SaerothEncounterPlanner?.mapChanged(); refreshSummary(); status('Battle map removed from this package.');
      document.dispatchEvent(new CustomEvent('saeroth-session-change'));
    };
  }
  async function loadCatalog(ticket) {
    if (!catalogPromise) catalogPromise = fetch(new URL('session-actors.json',base),{credentials:'omit'}).then(async response => {
      if (!response.ok) throw Error('The campaign NPC list could not be loaded.');
      const data = await response.json();
      if (data.schema !== 1 || !Array.isArray(data.actors) || data.actors.length > 2000) throw Error('The campaign NPC list has an unsupported format.');
      const keys = new Set();
      return data.actors.map(a => {
        if (!cleanKey(a.key) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 160 || keys.has(a.key)) throw Error('The campaign NPC list contains an invalid entry.');
        keys.add(a.key); return {key:a.key,name:a.name,level:Number.isInteger(a.level)?a.level:null};
      });
    }).catch(error => {catalogPromise = null;throw error;});
    try { catalog = await catalogPromise; catalogReady = true; catalogError = ''; }
    catch (error) { catalogReady = false; catalogError = error.message; }
    if (ticket === generation && host) renderActors();
  }
  function renderActors() {
    const node = host?.querySelector('#spActorChoices'); if (!node) return;
    host.querySelector('#spCatalogRetry').hidden = !catalogError;
    if (!catalogReady) { node.innerHTML = '<p class="ws-small ws-muted">' + esc(catalogError || 'Loading campaign NPCs…') + '</p>'; return; }
    const query = host.querySelector('#spActorSearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const rows = catalog.filter(a => a.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)).slice(0,40);
    node.innerHTML = rows.length ? rows.map(a => '<label class="sp-actor-choice"><input type="checkbox" value="' + esc(a.key) + '" ' + (selectedActors.some(s=>s.key===a.key)?'checked ':'') + (busy?'disabled':'') + '><span><strong>' + esc(a.name) + '</strong><small>' + (a.level===null?'Campaign actor':'Level ' + a.level) + '</small></span></label>').join('') : '<p class="ws-small ws-muted">No matching NPCs. Try a shorter name.</p>';
    node.onchange = event => {
      const input = event.target.closest('input[type=checkbox]'); if (!input || busy) return;
      const actor = catalog.find(a => a.key === input.value); if (!actor) return;
      if (input.checked) {
        if (selectedActors.length >= 50) { input.checked = false; status('A package can include up to 50 NPCs.',true); return; }
        if (!selectedActors.some(a => a.key === actor.key)) selectedActors.push({key:actor.key,name:actor.name});
      } else selectedActors = selectedActors.filter(a => a.key !== actor.key);
      persistActors();
    };
  }
  async function loadPresets(ticket) {
    try {
      const response = await fetch(new URL('session-presets.json',base),{credentials:'omit'});
      if (!response.ok) return;
      const data = await response.json();
      if (data.schema !== 1 || !Array.isArray(data.presets) || data.presets.length > 20) return;
      await window.SaerothEncounterPlanner?.capture();
      presets = await Promise.all(data.presets.map(async p => {
        if (!p || typeof p.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length>100 ||
            typeof p.description !== 'string' || p.description.length>1000 || !Array.isArray(p.notes) || p.notes.length>60 || p.notes.some(n=>!cleanKey(n)) ||
            !Array.isArray(p.actors) || p.actors.length>50 || p.actors.some(a=>!cleanKey(a))) throw Error();
        return {...p,map:p.map?validateMap(p.map):null,encounter:p.encounter?await window.SaerothEncounterPlanner.validatePreset(p.encounter):null};
      }));
      if (ticket !== generation || !host || !presets.length) return;
      const node = host.querySelector('#spPresets'); node.hidden = false;
      node.innerHTML = '<details><summary>Start with prepared expedition content</summary>' + presets.map(p => '<article><h4>' + esc(p.name) + '</h4><p class="ws-small ws-muted">' + esc(p.description) + '</p><p class="ws-small">' + p.notes.length + ' notes · ' + p.actors.length + ' NPCs' + (p.map?' · 1 battle map':'') + (p.encounter?' · 1 encounter':'') + '</p>' + (p.map?'<label class="sp-preset-map"><input type="checkbox" data-preset-map="' + p.id + '" ' + (!map?'checked':'') + '> Include its map' + (map?' (replaces the selected map)':'') + '</label>':'') + (p.encounter?'<label class="sp-preset-map"><input type="checkbox" data-preset-encounter="'+p.id+'" '+(!window.SaerothEncounterPlanner.summary().opponents?'checked':'')+'> Use its encounter (replaces the current roster)</label>':'') + '<button class="ws-button" type="button" data-add-preset="' + p.id + '">Add preparation</button></article>').join('') + '</details>';
      node.onchange=event=>{if(event.target.matches('[data-preset-encounter]'))event.target.dataset.userChoice='1';};
      node.onclick = async event => {
        const button = event.target.closest('[data-add-preset]'); if (!button || busy) return;
        const preparationTicket=generation;
        const preset = presets.find(p=>p.id===button.dataset.addPreset); if (!preset) return;
        try {
          await loadCatalog(generation);
          if(preparationTicket!==generation||!host)return;
          if (!catalogReady) throw Error('Load the NPC list before adding preparation.');
          const actors = preset.actors.map(key => {const a=catalog.find(row=>row.key===key);if(!a)throw Error('The prepared NPC list is still being published. Reload after deployment.');return {key:a.key,name:a.name};});
          const combined = [...selectedActors,...actors.filter(a=>!selectedActors.some(s=>s.key===a.key))];
          if (combined.length>50) throw Error('Remove an NPC before adding this preparation; a package can hold 50.');
          const count = config.addPrepared({notes:preset.notes,name:preset.name});
          selectedActors=combined;persistActors();
          if (preset.map && node.querySelector('[data-preset-map="' + preset.id + '"]')?.checked) selectMap(preset.map);
          if (preset.encounter && node.querySelector('[data-preset-encounter="'+preset.id+'"]')?.checked) {
            await window.SaerothEncounterPlanner.addPrepared(preset.encounter);
            node.querySelector('[data-preset-encounter="'+preset.id+'"]').checked=false;
            delete node.querySelector('[data-preset-encounter="'+preset.id+'"]').dataset.userChoice;
          }
          renderActors(); status('Added ' + count + ' reference notes and selected the prepared NPCs. Your scratchpad and checklist were kept.');
        } catch(error) {status(error.message,true);}
      };
    } catch (_) { /* Optional ready-made preparation cannot block custom session export. */ }
  }

  function loadMapAssets() {
    if (!assetPromise) assetPromise = Promise.all([['atlas/battlemap-engine.js','SaerothBattlemapEngine'],['atlas/battlemap-foundry.js','SaerothBattlemapFoundry']].map(([path,key]) => new Promise((resolve,reject) => {
      if (window[key]) return resolve();
      const script = document.createElement('script');script.src=new URL(path,base);
      script.onload=()=>window[key]?resolve():reject(Error('The map generator did not load completely.'));
      script.onerror=()=>{script.remove();reject(Error('The map generator is unavailable. Reconnect and try again.'));};
      document.head.append(script);
    }))).catch(error=>{assetPromise=null;throw error;});
    return assetPromise;
  }
  function trustedImage(value) {
    const url = new URL(value,base);
    if (url.username || url.password || !['http:','https:'].includes(url.protocol)) throw Error('The packet contains an unsupported image address.');
    const local = url.origin===base.origin && url.pathname.startsWith(new URL('content/campaign/',base).pathname);
    const raw = url.protocol==='https:' && url.hostname==='raw.githubusercontent.com' && url.pathname.startsWith('/Milec/Towers-of-Saeroth/main/campaign/');
    if (!local && !raw) throw Error('An image is outside the campaign artwork library: ' + url.pathname.split('/').at(-1) + '. Use a campaign PNG, JPEG, or WebP image.');
    url.hash=''; return url;
  }
  async function readImage(url,limits,signal) {
    const controller=new AbortController(),abort=()=>controller.abort();
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)controller.abort();
    const timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch(url,{credentials:'omit',redirect:'error',signal:controller.signal});
      if(!response.ok)throw Error('Could not load artwork: '+decodeURIComponent(url.pathname.split('/').at(-1))+'. No partial package was downloaded.');
      let mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      const generic=!mime||mime==='application/octet-stream';
      if(!generic&&!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('Package artwork must be PNG, JPEG, or WebP: '+decodeURIComponent(url.pathname.split('/').at(-1)));
      if(Number(response.headers.get('content-length')||0)>limits.maxAssetBytes)throw Error('An image exceeds the 20 MiB package limit.');
      const reader=response.body?.getReader();let size=0,parts=[];
      if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limits.maxAssetBytes)throw Error('An image exceeds the 20 MiB package limit.');parts.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}}
      else{const bytes=new Uint8Array(await response.arrayBuffer());size=bytes.length;parts=[bytes];}
      if(size>limits.maxAssetBytes)throw Error('An image exceeds the 20 MiB package limit.');
      if(generic){
        // Some static hosts omit WebP MIME mappings. Infer only from bounded
        // bytes, never a filename, so an HTML fallback cannot become artwork.
        const header=new Uint8Array(await new Blob(parts).slice(0,16).arrayBuffer()),starts=bytes=>bytes.every((value,index)=>header[index]===value);
        mime=starts([137,80,78,71,13,10,26,10])?'image/png':starts([255,216,255])?'image/jpeg':starts([82,73,70,70])&&header[8]===87&&header[9]===69&&header[10]===66&&header[11]===80?'image/webp':'';
        if(!mime)throw Error('Package artwork must contain a PNG, JPEG, or WebP image: '+decodeURIComponent(url.pathname.split('/').at(-1)));
      }
      return new Blob(parts,{type:mime});
    } catch(error) {
      if(error.name==='AbortError')throw Error(signal.aborted?'Package export cancelled.':'Artwork took too long to load. Reconnect and try again.');
      if(error instanceof TypeError)throw Error('Could not load artwork: '+decodeURIComponent(url.pathname.split('/').at(-1))+'. Reconnect and try again. No partial package was downloaded.');
      throw error;
    } finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  async function encodeAsset(blob,name,assets,byDigest,limits) {
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
    if(byDigest.has(digest))return byDigest.get(digest);
    if(!bytes.length||bytes.length>limits.maxAssetBytes)throw Error('An image exceeds the supported package size.');
    if(assets.length>=limits.maxAssets||assets.reduce((n,a)=>n+a.bytes,0)+bytes.length>limits.maxTotalAssetBytes)throw Error('This package has too much artwork. Use fewer illustrated notes or a smaller map.');
    let binary='';for(let offset=0;offset<bytes.length;offset+=16384)binary+=String.fromCharCode(...bytes.subarray(offset,offset+16384));
    const id='img-'+digest.slice(0,40),extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'})[blob.type];
    if(!extension)throw Error('Unsupported image type.');
    assets.push({id,name:String(name).replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,80)+'.'+extension,mime:blob.type,data:btoa(binary),bytes:bytes.length});
    byDigest.set(digest,id);return id;
  }
  async function embedJournal(journal,assets,byDigest,limits,signal) {
    const byURL=new Map();
    for(const page of journal.pages){
      const template=document.createElement('template');template.innerHTML=page.text.content;const element=template.content;
      for(const image of element.querySelectorAll('img')){
        if(signal.aborted)throw Error('Package export cancelled.');
        const value=image.getAttribute('src');if(!value){image.remove();continue;}
        const url=trustedImage(value),key=url.href;
        let id=byURL.get(key);
        if(!id){status('Packing artwork for '+page.name+'…');const blob=await readImage(url,limits,signal);id=await encodeAsset(blob,'journal-'+assets.length,assets,byDigest,limits);byURL.set(key,id);}
        image.setAttribute('src','asset:'+id);
      }
      page.text.content=template.innerHTML;
    }
  }
  function saveDownload(blob,name,label) {
    if(!host)return;
    if(downloadURL)URL.revokeObjectURL(downloadURL);
    downloadURL=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=downloadURL;a.download=name;a.textContent=label;
    host.querySelector('#spDownloads').replaceChildren(a);a.click();
  }
  async function exportPackage() {
    if(busy||!host)return;
    const ticket=generation,draft=config.snapshot(),chosenMap=map?structuredClone(map):null,actors=structuredClone(selectedActors);
    busy=true;exportController=new AbortController();const signal=exportController.signal;
    if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL='';host.querySelector('#spDownloads').replaceChildren();}
    host.setAttribute('aria-busy','true');window.SaerothEncounterPlanner?.setBusy(true);refreshSummary();renderActors();status('Preparing your session package…');
    try {
      const format=await import(new URL('session-package.mjs',base).href);
      const chosenEncounter=await window.SaerothEncounterPlanner?.capture();
      if(actors.length){
        await loadCatalog(ticket);
        if(!catalogReady)throw Error('The NPC list is unavailable. Reload it before exporting selected sheets.');
        const missing=actors.find(a=>!catalog.some(row=>row.key===a.key));
        if(missing)throw Error('“'+missing.name+'” is no longer in the campaign NPC list. Remove it or choose its current sheet.');
      }
      const journal=await config.buildJournal(draft),assets=[],byDigest=new Map();
      if(signal.aborted||ticket!==generation)return;
      await embedJournal(journal,assets,byDigest,format.LIMITS,signal);
      let scene;
      if(chosenMap){
        status('Rendering the full-size battle map…');await loadMapAssets();await new Promise(resolve=>requestAnimationFrame(resolve));
        if(signal.aborted||ticket!==generation)return;
        const model=window.SaerothBattlemapEngine.generate({...chosenMap.recipe,name:chosenMap.name}),canvas=document.createElement('canvas');
        try{
          window.SaerothBattlemapEngine.render(canvas,model,{pixelsPerCell:100,grid:false});
          const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Could not render the map. Try a smaller layout.')),'image/webp',.92));
          const id=await encodeAsset(blob,chosenMap.name,assets,byDigest,format.LIMITS);
          scene=window.SaerothBattlemapFoundry.scene(model,{backgroundPath:'asset:'+id,time:chosenMap.recipe.time});
        }finally{canvas.width=canvas.height=1;}
      }
      if(signal.aborted||ticket!==generation)return;
      status('Checking the package…');
      const encounter=await window.SaerothEncounterPlanner?.exportEncounter(chosenEncounter,scene,chosenMap);
      const data={format:'saeroth-session',version:encounter?2:1,name:draft.title.trim()||'Saeroth session',createdAt:new Date().toISOString(),assets:assets.map(({bytes,...asset})=>asset),journal,actors,...(scene?{scene}:{}),...(encounter?{encounter}:{})};
      const sealed=await format.sealPackage(data),blob=new Blob([JSON.stringify(sealed)],{type:'application/json'});
      if(blob.size>format.LIMITS.maxFileBytes)throw Error('The package is too large. Remove an illustrated note or choose a smaller map.');
      if(signal.aborted||ticket!==generation)return;
      const slug=data.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'session';
      saveDownload(blob,'Saeroth-'+slug+'-session.json','Save session package ('+(blob.size/1048576).toFixed(1)+' MiB)');
      const opponentCount=encounter?.roster.reduce((n,r)=>n+r.count,0)||0,extraSheets=encounter?.roster.filter(r=>r.source.type!=='campaign'||!actors.some(a=>a.key===r.source.key)).length||0;
      status('Package ready: '+(journal.pages.length+(encounter?1:0))+' journal pages, '+(scene?'1 scene':'no scene')+', and '+(actors.length+extraSheets)+' NPC sheets'+(encounter?' with '+opponentCount+' opponents'+(encounter.placements.length?' positioned':' in the roster'):'')+'. Open it in Foundry’s Saeroth Session Inbox.');
    }catch(error){if(ticket===generation)status(error.message.replace('No partial journal was downloaded.','No partial package was downloaded.'),true);}
    finally{if(ticket===generation&&host){busy=false;exportController=null;window.SaerothEncounterPlanner?.setBusy(false);host.setAttribute('aria-busy','false');if(signal.aborted)status('Export cancelled. Your preparation is unchanged.');refreshSummary();renderActors();}}
  }
  document.addEventListener('saeroth-workspace-change',refreshSummary);
  window.addEventListener('storage',event=>{
    if(window.SaerothSessionPrep?.externalChange(event))return;
    if(!config||busy)return;
    try{
      if(event.key===mapKey){map=event.newValue?validateMap(JSON.parse(event.newValue)):null;mapWarning='';renderMap();window.SaerothEncounterPlanner?.mapChanged();refreshSummary();}
      if(event.key===actorKey){selectedActors=event.newValue?validateActors(JSON.parse(event.newValue)):[];renderActors();refreshSummary();}
    }catch(_){status('A selection changed in another tab but could not be read. Your current package was kept.',true);}
  });
  function sessionSnapshot(){return structuredClone({actors:selectedActors,map});}
  function sessionEntries(value){
    if(recovery.some(r=>!r.protected))throw Error('Preserve unreadable NPC or map selections before opening another session.');
    const actors=validateActors({version:1,actors:value.actors}),chosen=value.map?validateMap(value.map):null;
    return [[actorKey,JSON.stringify({version:1,actors})],[mapKey,chosen?JSON.stringify(chosen):null]];
  }
  function commitSession(value){
    selectedActors=validateActors({version:1,actors:value.actors});map=value.map?validateMap(value.map):null;
    storageWarning='';mapWarning='';renderSelected();renderMap();renderActors();refreshSummary();
  }
  window.SaerothSessionExport={configure,mount,unmount,selectMap,validateMap,loadMapAssets,sessionSnapshot,sessionEntries,commitSession,isBusy:()=>busy};
})();
