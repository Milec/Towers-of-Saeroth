/* Assemble a portable GM session without changing the campaign or a Foundry world. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanKey = value => typeof value === 'string' && value.length < 500 && /^campaign\/[^?#\x00-\x1f]+\.md$/i.test(value) && !value.includes('\\') && !value.split('/').some(p => p === '.' || p === '..');
  let config, base, host, generation = 0, selectedActors = [], catalog = [], catalogPromise, catalogReady = false, catalogError = '', presets = [];
  let actorKey, storageWarning = '', recovery = [], busy = false, downloadURL = '', exportController, catalogLoading = false;

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
    // Battle maps were retired; clear any selection saved by an earlier version.
    try { localStorage.removeItem('saeroth-session-map-v1:' + base.pathname); } catch (_) { /* Storage may be unavailable. */ }
    recovery = []; storageWarning = '';
    selectedActors = readSaved(actorKey,validateActors,[]);
    let initialRaw;try{initialRaw=window.SaerothSessionPrep?.initialValue('saeroth-encounter-v1:'+base.pathname);}catch(_){/* The planner reports its own storage warning. */}
    window.SaerothEncounterPlanner?.configure({base:base.href,onChange:refreshSummary,initialRaw});
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
      '<div class="sp-heading"><div><p class="ws-eyebrow">Take to Foundry</p><h3>Session package</h3></div><span class="ws-label">GM only</span></div>' +
      '<p class="ws-small ws-muted">Bring your reference packet, selected campaign NPCs, and an optional encounter into Foundry together.</p>' +
      '<div id="spPresets" class="sp-presets" hidden></div>' +
      '<details id="spActorPicker" class="sp-actor-picker"><summary>Choose NPCs <span id="spActorCount"></span></summary>' +
      '<p class="ws-small ws-muted">The importer finds their sheets in your Saeroth compendiums and keeps existing world actors unchanged.</p>' +
      '<label class="ws-field" for="spActorSearch">Search campaign NPCs and creatures<input type="search" id="spActorSearch" placeholder="Name or creature…" autocomplete="off"></label>' +
      '<div id="spActorChoices" class="sp-actor-choices"></div><button type="button" class="ws-button" id="spCatalogRetry" hidden>Reload NPC list</button></details>' +
      '<div id="spSelectedActors" class="sp-selected-actors" tabindex="-1"></div>' +
      '<div id="spEncounter"></div>' +
      '<div class="sp-preview"><h4>Package contents</h4><p id="spSummary"></p><p class="ws-small ws-muted">The journal starts unshared. Encounter opponents are listed in the roster; combat is never started.</p></div>' +
      '<button class="ws-button sp-next-action" id="spNextAction" type="button" data-ws-action="jump-section" hidden></button>' +
      '<button class="ws-button ws-primary sp-export" type="button" id="spExport">Download session package</button><button class="ws-button sp-cancel" type="button" id="spCancel" hidden>Cancel export</button>' +
      '<p id="spStatus" role="status" aria-live="polite"></p><p id="spStorage" class="ws-small ws-muted"></p>' +
      '<div id="spDownloads" class="sp-downloads"></div><button class="ws-button" type="button" id="spRecovery" hidden>Download selection recovery</button>' +
      '<details class="ws-help"><summary>Import this package into Foundry</summary><ol><li>Enable <strong>Towers of Saeroth PF2e Content 0.4.0 or newer</strong> for encounter packages in your Foundry v14 world. Packages without encounters still work with 0.3.0.</li><li>Open <strong>Import Saeroth Session</strong> from Scenes or Journals and choose this JSON file.</li><li>Review the notes, NPCs, and encounter, then import. Artwork travels inside the package.</li></ol><p>Selected campaign NPCs must be available in your Saeroth compendiums; standard creatures use your installed PF2e packs. Update the module or use <strong>Sync Saeroth Content</strong> if the preview reports a missing campaign sheet.</p></details>';
    host.querySelector('#spActorSearch').oninput = renderActors;
    host.querySelector('#spExport').onclick = exportPackage;
    host.querySelector('#spCancel').onclick = () => {exportController?.abort();status('Cancelling export…');};
    host.querySelector('#spRecovery').onclick = () => saveDownload(new Blob([JSON.stringify({version:1,selections:recovery.map(({key,data})=>({key,data}))},null,2)],{type:'application/json'}),'saeroth-session-selection-recovery.json','Save recovery data');
    host.querySelector('#spCatalogRetry').onclick = () => { if(busy||catalogLoading)return;catalogPromise = null; loadCatalog(ticket); };
    window.SaerothEncounterPlanner?.mount(host.querySelector('#spEncounter'));
    renderActors(); refreshSummary(); loadCatalog(ticket); loadPresets(ticket);
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
    host.querySelector('#spSummary').textContent = (draft.board.length + 1 + (encounter?.opponents?1:0)) + ' journal pages · ' + sheets + ' NPC ' + (sheets===1?'sheet':'sheets') + (encounter?.opponents?' · '+encounter.opponents+' opponents':'');
    host.querySelector('#spActorCount').textContent = '(' + selectedActors.length + ')';
    host.querySelector('#spStorage').textContent = storageWarning;
    host.querySelector('#spRecovery').hidden = !recovery.length;
    host.querySelector('#spExport').disabled = busy;
    host.querySelector('#spCancel').hidden = !busy;
    refreshOverview(draft,encounter,sheets);
    renderSelected();
  }
  function refreshOverview(draft,encounter,sheets) {
    const overview=document.getElementById('wsPrepOverview');
    const missing=catalogReady?selectedActors.find(a=>!catalog.some(row=>row.key===a.key)):null;
    let issue='',action='',target='';
    if(encounter?.error){issue='Encounter tools unavailable';action='Review encounter tools';target='epPanel';}
    else if(missing){issue='A selected NPC is no longer listed';action='Review selected NPCs';target='spSelectedActors';}
    else if(selectedActors.length&&catalogError&&!catalogLoading){issue='NPC list needs reloading';action='Review the NPC list';target='spCatalogRetry';}
    const next=host.querySelector('#spNextAction');
    next.hidden=!issue;next.textContent=action;next.dataset.target=target;next.disabled=busy;
    if(!overview)return;
    overview.classList.toggle('sp-needs-attention',!!issue);
    const write=(id,text)=>{overview.querySelector('#'+id).textContent=text;};
    write('spOverviewSummary',issue||(!encounter?.ready?'Loading encounter…':
      [draft.board.length+' reference note'+(draft.board.length===1?'':'s'),sheets?sheets+' NPC sheet'+(sheets===1?'':'s'):null].filter(Boolean).join(' · ')));
    write('spOverviewNotes',draft.board.length+' included'+(draft.notes.trim()?' + scratchpad':''));
    const done=draft.tasks.filter(task=>task.done).length;
    write('spOverviewTasks',draft.tasks.length?done+' of '+draft.tasks.length+' complete':'No tasks added');
    write('spOverviewActors',missing?'Review '+missing.name:sheets+' selected'+(selectedActors.length&&catalogLoading?' · checking list…':selectedActors.length&&catalogError?' · list unavailable':''));
    write('spOverviewEncounter',encounter?.error?'Tools unavailable':!encounter?.ready?'Loading…':
      !encounter.opponents?'No opponents selected':
      encounter.opponents+' opponent'+(encounter.opponents===1?'':'s'));
    overview.querySelector('[data-target="epPanel"]').classList.toggle('sp-needs-attention',!!encounter?.error);
    overview.querySelector('[data-target="spActorPicker"]').classList.toggle('sp-needs-attention',!!missing||!!(selectedActors.length&&catalogError&&!catalogLoading));
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
  async function loadCatalog(ticket) {
    // Coalesce in-flight retries, including retries while an export is checking sheets.
    catalogLoading = true;
    if(ticket === generation && host){renderActors();refreshSummary();}
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
    catalogLoading = false;
    if (ticket === generation && host) {renderActors();refreshSummary();}
  }
  function renderActors() {
    const node = host?.querySelector('#spActorChoices'); if (!node) return;
    host.querySelector('#spCatalogRetry').hidden = !catalogError;
    host.querySelector('#spCatalogRetry').disabled = busy || catalogLoading;
    host.querySelector('#spCatalogRetry').textContent = catalogLoading ? 'Loading NPC list…' : 'Reload NPC list';
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
        return {...p,encounter:p.encounter?await window.SaerothEncounterPlanner.validatePreset(p.encounter):null};
      }));
      if (ticket !== generation || !host || !presets.length) return;
      const node = host.querySelector('#spPresets'); node.hidden = false;
      node.innerHTML = '<details><summary>Start with prepared expedition content</summary>' + presets.map(p => '<article><h4>' + esc(p.name) + '</h4><p class="ws-small ws-muted">' + esc(p.description) + '</p><p class="ws-small">' + p.notes.length + ' notes · ' + p.actors.length + ' NPCs' + (p.encounter?' · 1 encounter':'') + '</p>' + (p.encounter?'<label class="sp-preset-map"><input type="checkbox" data-preset-encounter="'+p.id+'" '+(!window.SaerothEncounterPlanner.summary().opponents?'checked':'')+'> Use its encounter (replaces the current roster)</label>':'') + '<button class="ws-button" type="button" data-add-preset="' + p.id + '">Add preparation</button></article>').join('') + '</details>';
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
    if(assets.length>=limits.maxAssets||assets.reduce((n,a)=>n+a.bytes,0)+bytes.length>limits.maxTotalAssetBytes)throw Error('This package has too much artwork. Use fewer illustrated notes.');
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
    const ticket=generation,draft=config.snapshot(),actors=structuredClone(selectedActors);
    busy=true;exportController=new AbortController();const signal=exportController.signal;
    if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL='';host.querySelector('#spDownloads').replaceChildren();}
    host.setAttribute('aria-busy','true');window.SaerothEncounterPlanner?.setBusy(true);refreshSummary();renderActors();status('Preparing your session package…');
    try {
      const chosenEncounter=await window.SaerothEncounterPlanner?.capture();
      if(signal.aborted||ticket!==generation)return;
      status('Checking encounter preparation…');
      await window.SaerothEncounterPlanner?.preflight(chosenEncounter);
      if(signal.aborted||ticket!==generation)return;
      const format=await import(new URL('session-package.mjs',base).href);
      if(actors.length){
        await loadCatalog(ticket);
        if(!catalogReady)throw Error('The NPC list is unavailable. Reload it before exporting selected sheets.');
        const missing=actors.find(a=>!catalog.some(row=>row.key===a.key));
        if(missing)throw Error('“'+missing.name+'” is no longer in the campaign NPC list. Remove it or choose its current sheet.');
      }
      if(signal.aborted||ticket!==generation)return;
      status('Gathering session notes and artwork…');
      const journal=await config.buildJournal(draft),assets=[],byDigest=new Map();
      if(signal.aborted||ticket!==generation)return;
      await embedJournal(journal,assets,byDigest,format.LIMITS,signal);
      if(signal.aborted||ticket!==generation)return;
      status('Checking the package…');
      const encounter=await window.SaerothEncounterPlanner?.exportEncounter(chosenEncounter);
      const data={format:'saeroth-session',version:encounter?2:1,name:draft.title.trim()||'Saeroth session',createdAt:new Date().toISOString(),assets:assets.map(({bytes,...asset})=>asset),journal,actors,...(encounter?{encounter}:{})};
      const sealed=await format.sealPackage(data),blob=new Blob([JSON.stringify(sealed)],{type:'application/json'});
      if(blob.size>format.LIMITS.maxFileBytes)throw Error('The package is too large. Remove an illustrated note.');
      if(signal.aborted||ticket!==generation)return;
      const slug=data.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'session';
      saveDownload(blob,'Saeroth-'+slug+'-session.json','Save session package ('+(blob.size/1048576).toFixed(1)+' MiB)');
      const opponentCount=encounter?.roster.reduce((n,r)=>n+r.count,0)||0,extraSheets=encounter?.roster.filter(r=>r.source.type!=='campaign'||!actors.some(a=>a.key===r.source.key)).length||0;
      status('Package ready: '+(journal.pages.length+(encounter?1:0))+' journal pages, '+'and '+(actors.length+extraSheets)+' NPC sheets'+(encounter?' with '+opponentCount+' opponents in the roster':'')+'. Open it in Foundry’s Saeroth Session Inbox.');
    }catch(error){if(ticket===generation)status(error.message.replace('No partial journal was downloaded.','No partial package was downloaded.'),true);}
    finally{if(ticket===generation&&host){busy=false;exportController=null;window.SaerothEncounterPlanner?.setBusy(false);host.setAttribute('aria-busy','false');if(signal.aborted)status('Export cancelled. Your preparation is unchanged.');refreshSummary();renderActors();}}
  }
  document.addEventListener('saeroth-workspace-change',refreshSummary);
  window.addEventListener('storage',event=>{
    if(window.SaerothSessionPrep?.externalChange(event))return;
    if(!config||busy)return;
    try{
      if(event.key===actorKey){selectedActors=event.newValue?validateActors(JSON.parse(event.newValue)):[];renderActors();refreshSummary();}
    }catch(_){status('A selection changed in another tab but could not be read. Your current package was kept.',true);}
  });
  function sessionSnapshot(){return structuredClone({actors:selectedActors});}
  function sessionEntries(value){
    if(recovery.some(r=>!r.protected))throw Error('Preserve unreadable NPC selections before opening another session.');
    const actors=validateActors({version:1,actors:value.actors});
    return [[actorKey,JSON.stringify({version:1,actors})]];
  }
  function commitSession(value){
    selectedActors=validateActors({version:1,actors:value.actors});
    storageWarning='';renderSelected();renderActors();refreshSummary();
  }
  window.SaerothSessionExport={configure,mount,unmount,sessionSnapshot,sessionEntries,commitSession,isBusy:()=>busy};
})();
