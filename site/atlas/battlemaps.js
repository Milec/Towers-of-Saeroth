/* On-demand tactical maps. Atlas records are read-only inputs, never edited. */
(() => {
  'use strict';
  const KINDS = {road:'Road encounter',camp:'Camp clearing',ruin:'Ruined courtyard',cave:'Cavern',shrine:'Wayside shrine',inn:'Inn interior',fort:'Fortified outpost',bridge:'River crossing',tower:'Tower interior'};
  const TERRAINS = {forest:'Forest',mountain:'Mountain',grassland:'Grassland',desert:'Desert',snow:'Snow',swamp:'Wetland',coast:'Coast'};
  const KEY = 'saeroth-battlemaps-v1:' + new URL('./', location.href).pathname;
  const LIMIT = 1000, $id = id => document.getElementById(id);
  const sourceKey = source => source.type + '-' + source.id;
  const plain = value => String(value || '').replace(/<[^>]*>/g,' ').slice(0,6000);
  let saved = [], unreadable = null, storageWarning = '', assetPromise;
  let dialog, context, recipe, model, opener, history = [], revision = 0, busy = false;
  const downloadURLs = new Set();

  function contextFor(type, id) {
    id = Number(id);
    if (!['poi','custompoi','burg'].includes(type) || !Number.isSafeInteger(id) || id < 0) return null;
    let record, name, cue, explicitKind = false, kind = 'road', terrain = 'grassland', reason = 'A suggested encounter layout; choose the terrain that fits your game.';
    if (type === 'custompoi') {
      record = window.ATLAS_CUSTOM_POIS?.get(id); if (!record) return null;
      name = record.name; cue = plain(name + ' ' + record.notes).toLowerCase();
      if (Object.hasOwn(KINDS,record.kind)) {kind = record.kind;explicitKind = true;}
      reason = 'Suggested from this POI’s kind and notes. This is a generated encounter map, not established geography.';
    } else if (type === 'poi') {
      record = D.markers.find(m => m.i === id); if (!record) return null;
      const lore = D.notes.find(n => n.id === 'marker' + id);
      name = lore?.name || record.type || 'Landmark';
      cue = plain(record.type + ' ' + name + ' ' + (lore?.legend || '')).toLowerCase();
      reason = 'Suggested from the landmark’s type and description. Terrain can be changed below.';
    } else {
      record = D.burgs.find(b => b.i === id); if (!record || record.removed) return null;
      name = record.name; cue = plain(name + ' ' + (record.habitat || '')).toLowerCase();
      kind = 'inn'; if (record.port) terrain = 'coast';
      reason = 'A small encounter site within this settlement, not a map of the entire town.';
    }
    if (!explicitKind) {
    if (/\b(cave|caves|cavern|dungeon|dungeons|mine|mines|underground)\b/.test(cue)) kind = 'cave';
    else if (/\b(bridge|bridges|ford|crossing)\b/.test(cue)) kind = 'bridge';
    else if (/\b(inn|inns|tavern|taverns)\b/.test(cue)) kind = 'inn';
    else if (/\b(lighthouse|lighthouses|tower|towers)\b/.test(cue)) kind = 'tower';
    else if (/\b(fort|fortress|fortified|castle)\b/.test(cue)) kind = 'fort';
    else if (/\b(ruin|ruins|necropolises|burials|graveyard)\b/.test(cue)) kind = 'ruin';
    else if (/\b(shrine|temple|monastery|sacred)\b/.test(cue) && !/forests/.test(cue)) kind = 'shrine';
    else if (/\b(camp|camps|camping|brigands|expedition)\b/.test(cue)) kind = 'camp';
    }
    if (/\b(snow|snowy|ice|icy|glacier|frozen|tundra)\b/.test(cue)) terrain = 'snow';
    else if (/\b(desert|dune|dunes|arid|oasis)\b/.test(cue)) terrain = 'desert';
    else if (/\b(swamp|marsh|marshes|bog|fen|wetland|mangrove)\b/.test(cue)) terrain = 'swamp';
    else if (/\b(coast|coastal|beach|harbor|harbour|lighthouse|lighthouses|cove)\b/.test(cue)) terrain = 'coast';
    else if (/\b(mountain|mountains|mountain-pass|upland|volcano|volcanoes|hot-springs|summit|cliff)\b/.test(cue)) terrain = 'mountain';
    else if (/\b(forest|forests|woodland|woods|grove|groves|pineries|jungle)\b/.test(cue)) terrain = 'forest';
    return {source:{type,id},name:String(name).slice(0,160),kind,terrain,reason};
  }

  function validateRecipe(value) {
    if (!value || value.version !== 1 || value.generatorVersion !== 1 || !value.source ||
        !['poi','custompoi','burg'].includes(value.source.type) || !Number.isSafeInteger(value.source.id) || value.source.id < 0 ||
        !Object.hasOwn(KINDS,value.kind) || !Object.hasOwn(TERRAINS,value.terrain) || ![24,32,40].includes(value.size) ||
        !['day','night'].includes(value.time) || typeof value.seed !== 'string' || !value.seed.trim() ||
        value.seed.length > 80 || /[\x00-\x1f\x7f]/.test(value.seed)) throw Error('Choose a valid Saeroth battle map recipe (version 1).');
    return {version:1,generatorVersion:1,source:{type:value.source.type,id:value.source.id},kind:value.kind,terrain:value.terrain,size:value.size,time:value.time,seed:value.seed.trim()};
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        const value = JSON.parse(raw);
        if (value.version !== 1 || !Array.isArray(value.recipes) || value.recipes.length > LIMIT) throw Error();
        saved = value.recipes.map(validateRecipe);
        if (new Set(saved.map(r => sourceKey(r.source))).size !== saved.length) throw Error();
      } catch (_) { unreadable = raw; storageWarning = 'Saved layouts could not be read. Download the recovery copy under More options; the original data is preserved.'; }
    }
  } catch (_) { storageWarning = 'This browser cannot save layouts. Download a recipe to keep this map.'; }

  function persist() {
    const previous=saved.filter(r => sourceKey(r.source) !== sourceKey(recipe.source));
    if(previous.length>=LIMIT){storageWarning='This browser has 1,000 saved layouts. Download this recipe to keep it; existing layouts have been kept.';return;}
    saved = [...previous, structuredClone(recipe)];
    if (unreadable !== null) return;
    try { localStorage.setItem(KEY,JSON.stringify({version:1,recipes:saved})); storageWarning = ''; }
    catch (_) { storageWarning = 'This layout could not be saved on this device. Download its recipe to keep it.'; }
  }
  function loadAssets() {
    if (!assetPromise) assetPromise = Promise.all([
      ['battlemap-engine.js','SaerothBattlemapEngine'],
      ['battlemap-foundry.js','SaerothBattlemapFoundry']
    ].map(([file,key]) => new Promise((resolve,reject) => {
      if (window[key]) return resolve();
      const script = document.createElement('script'); script.src = file;
      script.onload = () => window[key] ? resolve() : reject(Error('The map generator did not load completely. Try again.'));
      script.onerror = () => {script.remove();reject(Error('The map generator is unavailable. Check your connection and try again.'));};
      document.head.append(script);
    }))).catch(error => {assetPromise = null;throw error;});
    return assetPromise;
  }
  function buildDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.id = 'battlemapDialog'; dialog.className = 'battlemap-dialog';
    dialog.setAttribute('aria-labelledby','battlemapTitle'); dialog.setAttribute('aria-describedby','battlemapSource');
    dialog.innerHTML =
      '<div class="bm-heading"><div><span class="bm-eyebrow">ATLAS · ENCOUNTER GENERATOR</span><h2 id="battlemapTitle">Battle map</h2><p id="battlemapSource"></p></div><button type="button" id="battlemapClose" aria-label="Close battle map generator">Close <span aria-hidden="true">×</span></button></div>' +
      '<div class="bm-body"><section class="bm-preview" aria-label="Generated map preview"><div class="bm-canvas-wrap"><canvas id="battlemapCanvas" width="800" height="800" role="img" aria-label="Battle map preview"></canvas><p id="battlemapLoading" role="status">Generating the map…</p></div>' +
      '<div class="bm-preview-tools"><label><input id="battlemapGrid" type="checkbox" checked> Preview grid</label><label><input id="battlemapWalls" type="checkbox"> Walls & lights</label><span id="battlemapDimensions"></span></div><p class="bm-legend" id="battlemapLegend" hidden>Rose: walls · Gold: doors · Blue: windows · Dotted: terrain edges · Circles: lights</p></section>' +
      '<section class="bm-controls" aria-label="Map settings"><p id="battlemapSuggestion" class="bm-hint"></p><fieldset id="battlemapSettings"><legend class="atlas-visually-hidden">Customize the map</legend><div class="bm-fields">' +
      '<label for="battlemapKind">Layout<select id="battlemapKind">' + Object.entries(KINDS).map(([k,v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select></label>' +
      '<label for="battlemapTerrain">Terrain<select id="battlemapTerrain">' + Object.entries(TERRAINS).map(([k,v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select></label>' +
      '<label for="battlemapSize">Map size<select id="battlemapSize"><option value="24">24 × 24 · 120 ft</option><option value="32">32 × 32 · 160 ft</option><option value="40">40 × 40 · 200 ft</option></select></label>' +
      '<label for="battlemapTime">Foundry lighting<select id="battlemapTime"><option value="day">Daylight</option><option value="night">Night · local lights</option></select></label></div></fieldset>' +
      '<div class="bm-reroll"><button type="button" id="battlemapReroll" class="bm-primary">Reroll layout</button><button type="button" id="battlemapPrevious" disabled>Previous</button></div>' +
      '<p id="battlemapStatus" role="status" aria-live="polite"></p><p id="battlemapStorage" class="bm-hint"></p><button id="battlemapRetry" type="button" hidden>Try again</button>' +
      '<div class="bm-export"><h3>Take it to the table</h3><button type="button" id="battlemapSession" class="bm-primary" disabled>Add to session</button><p class="bm-hint">Combine this map with notes and NPCs in your Campaign desk.</p><a id="battlemapSessionLink" class="bm-session-link" href="../#/workspace" target="_top" hidden>Open Campaign desk</a><button type="button" id="battlemapFoundry" disabled>Export to Foundry</button><button type="button" id="battlemapImage" disabled>Download map image</button><p class="bm-hint">Gridless artwork. Foundry adds a 5-foot grid, walls, doors, and dynamic lights.</p><div id="battlemapDownloads" class="bm-downloads"></div>' +
      '<details id="battlemapImportHelp"><summary>How to import into Foundry</summary><ol><li>Download the Foundry import JSON.</li><li>In Foundry’s Macro Directory, create a new <strong>Script</strong> macro. Right-click it and choose <strong>Import Data</strong>, then select the JSON.</li><li>Run the macro as GM. It uploads the artwork and creates a scene in the Scenes directory.</li></ol><p>The import needs Foundry v14 and permission to upload files. It does not activate the scene or place actors. Running the same import again finds its existing scene.</p></details></div>' +
      '<details id="battlemapMore" class="bm-more"><summary>Seed & portable recipe</summary><label for="battlemapSeed">Seed<input id="battlemapSeed" type="text" maxlength="80" autocomplete="off" spellcheck="false"></label><button type="button" id="battlemapApplySeed">Use seed</button><p class="bm-hint">The same seed, layout, terrain, and size reproduce the same map. Your latest layout is remembered for this POI on this device.</p><div class="bm-recipe-actions"><button type="button" id="battlemapRecipeExport">Download recipe</button><button type="button" id="battlemapRecipeImport">Load recipe</button></div><input id="battlemapRecipeFile" type="file" accept="application/json,.json" hidden><button id="battlemapRecover" type="button" hidden>Download recovery data</button></details>' +
      '</section></div>';
    document.body.append(dialog);
    $id('battlemapClose').onclick = () => dialog.close();
    dialog.addEventListener('close',() => {revision++;busy=false;if(opener?.isConnected)opener.focus({preventScroll:true});});
    dialog.addEventListener('keydown',event => event.stopPropagation());
    dialog.addEventListener('click',event => {if(event.target === dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    for (const id of ['battlemapKind','battlemapTerrain','battlemapSize','battlemapTime']) $id(id).onchange = () => regenerate(fromControls(),true);
    $id('battlemapReroll').onclick = () => regenerate({...recipe,seed:crypto.randomUUID?.().slice(0,12) || Date.now().toString(36)},true);
    $id('battlemapPrevious').onclick = () => {const prior=history.pop();if(prior)regenerate(prior,false);};
    $id('battlemapApplySeed').onclick = () => regenerate({...recipe,seed:$id('battlemapSeed').value},true);
    $id('battlemapSeed').onkeydown = event => {if(event.key==='Enter'){event.preventDefault();$id('battlemapApplySeed').click();}};
    $id('battlemapGrid').onchange = redraw;
    $id('battlemapWalls').onchange = redraw;
    $id('battlemapRetry').onclick = () => regenerate(recipe,false);
    $id('battlemapImage').onclick = () => exportMap('image');
    $id('battlemapFoundry').onclick = () => exportMap('foundry');
    $id('battlemapSession').onclick = addToSession;
    $id('battlemapRecipeExport').onclick = () => download(new Blob([JSON.stringify(recipe,null,2)],{type:'application/json'}),filename()+'-recipe.json','Save recipe');
    $id('battlemapRecipeImport').onclick = () => $id('battlemapRecipeFile').click();
    $id('battlemapRecipeFile').onchange = async event => {
      const file=event.target.files[0],ticket=revision;event.target.value='';if(!file)return;
      try{
        if(file.size>8192)throw Error('A map recipe must be smaller than 8 KiB.');
        const imported=validateRecipe(JSON.parse(await file.text()));
        if(!dialog.open||ticket!==revision)return;
        if(sourceKey(imported.source)!==sourceKey(context.source))throw Error('This recipe belongs to a different POI. Open that POI before loading it.');
        await regenerate(imported,true);
      }catch(error){if(ticket===revision&&dialog.open)$id('battlemapStatus').textContent=error instanceof SyntaxError?'This file is not a valid map recipe. Your map is unchanged.':error.message;}
    };
    $id('battlemapRecover').onclick = () => download(new Blob([unreadable],{type:'application/json'}),'Saeroth-battlemap-recovery.json','Save recovery copy');
  }

  function fromControls() {return {...recipe,kind:$id('battlemapKind').value,terrain:$id('battlemapTerrain').value,size:Number($id('battlemapSize').value),time:$id('battlemapTime').value};}
  function updateControls() {
    for(const [id,key] of [['battlemapKind','kind'],['battlemapTerrain','terrain'],['battlemapSize','size'],['battlemapTime','time'],['battlemapSeed','seed']])$id(id).value=recipe[key];
  }
  function setBusy(value) {
    busy=value;dialog.setAttribute('aria-busy',String(value));
    $id('battlemapSettings').disabled=value;
    for(const id of ['battlemapReroll','battlemapApplySeed','battlemapRecipeImport','battlemapRecipeExport'])$id(id).disabled=value;
    $id('battlemapSeed').disabled=value;$id('battlemapPrevious').disabled=value||!history.length;
    $id('battlemapFoundry').disabled=value||!model;$id('battlemapImage').disabled=value||!model;
    $id('battlemapSession').disabled=value||!model;
  }
  function clearDownloads() {downloadURLs.forEach(url=>URL.revokeObjectURL(url));downloadURLs.clear();$id('battlemapDownloads').replaceChildren();}
  async function regenerate(next,track) {
    if(busy)return;
    let checked;try{checked=validateRecipe(next);}catch(error){$id('battlemapStatus').textContent=error.message;return;}
    if(track && recipe)history=[...history,structuredClone(recipe)].slice(-10);
    recipe=checked;const ticket=++revision;model=null;dialog.dataset.ready='false';setBusy(true);updateControls();clearDownloads();
    $id('battlemapLoading').hidden=false;$id('battlemapLoading').textContent='Generating the map…';$id('battlemapRetry').hidden=true;
    try{
      await loadAssets();await new Promise(resolve=>requestAnimationFrame(resolve));
      if(ticket!==revision||!dialog.open)return;
      model=window.SaerothBattlemapEngine.generate({...recipe,name:context.name});
      redraw();persist();$id('battlemapStorage').textContent=storageWarning||'Layout saved on this device.';
      $id('battlemapRecover').hidden=unreadable===null;
      $id('battlemapStatus').textContent='Ready · '+model.walls.length+' wall segments · '+model.lights.length+' '+(model.lights.length===1?'light':'lights');
      $id('battlemapDimensions').textContent=recipe.size+' × '+recipe.size+' · 5 ft squares';
      dialog.dataset.ready='true';$id('battlemapLoading').hidden=true;
    }catch(error){
      if(ticket!==revision)return;
      $id('battlemapLoading').textContent='Map preview unavailable';$id('battlemapStatus').textContent=error.message;$id('battlemapRetry').hidden=false;
    }finally{if(ticket===revision)setBusy(false);}
  }
  function redraw() {
    if(!model)return;
    const canvas=$id('battlemapCanvas'),pixels=Math.min(32,Math.floor(960/model.cols));
    window.SaerothBattlemapEngine.render(canvas,model,{pixelsPerCell:pixels,grid:$id('battlemapGrid').checked});
    canvas.setAttribute('aria-label',context.name+' — '+KINDS[recipe.kind]+', '+TERRAINS[recipe.terrain]+', '+model.cols+' by '+model.rows+' squares');
    const ctx=canvas.getContext('2d');
    if(recipe.time==='night'){
      ctx.fillStyle='rgba(10,18,36,.36)';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(const light of model.lights){const radius=light.dim*pixels,glow=ctx.createRadialGradient(light.x*pixels,light.y*pixels,0,light.x*pixels,light.y*pixels,radius);glow.addColorStop(0,'rgba(255,207,112,.28)');glow.addColorStop(1,'rgba(255,207,112,0)');ctx.fillStyle=glow;ctx.fillRect(light.x*pixels-radius,light.y*pixels-radius,radius*2,radius*2);}
    }
    const overlay=$id('battlemapWalls').checked;$id('battlemapLegend').hidden=!overlay;
    if(overlay){
      ctx.save();ctx.lineWidth=2.5;
      for(const wall of model.walls){ctx.strokeStyle=wall.kind==='door'?'#ffe18e':wall.kind==='window'?'#91dafa':'#ff9baa';ctx.setLineDash(wall.kind==='terrain'?[4,4]:[]);ctx.beginPath();ctx.moveTo(wall.a[0]*pixels,wall.a[1]*pixels);ctx.lineTo(wall.b[0]*pixels,wall.b[1]*pixels);ctx.stroke();}
      ctx.setLineDash([4,4]);ctx.strokeStyle='#ffe18e';ctx.lineWidth=1;
      for(const light of model.lights){ctx.beginPath();ctx.arc(light.x*pixels,light.y*pixels,light.dim*pixels,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
    }
  }
  function filename(){return 'Saeroth-'+context.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)+'-'+recipe.seed.replace(/[^a-zA-Z0-9-]/g,'').slice(0,16);}
  function addToSession() {
    if(busy||!model)return;
    const selection={version:1,name:context.name,recipe:validateRecipe(recipe)};
    try {
      let result;
      const parentAPI=window.parent!==window&&window.parent.location.origin===location.origin?window.parent.SaerothSessionExport:null;
      if(parentAPI?.selectMap)result=parentAPI.selectMap(selection);
      else {
        const key='saeroth-session-map-v1:'+new URL('../',location.href).pathname,old=localStorage.getItem(key);
        if(old){
          try{const prior=JSON.parse(old);if(prior.version!==1||typeof prior.name!=='string')throw Error();validateRecipe(prior.recipe);}
          catch(_){throw Error('The earlier session-map selection could not be read. Open the Campaign desk and download its recovery copy before replacing it.');}
        }
        localStorage.setItem(key,JSON.stringify(selection));
        result={saved:true,message:'Added to your session package. Open the Campaign desk to include notes and NPCs.'};
      }
      $id('battlemapStatus').textContent=result.message;$id('battlemapSessionLink').hidden=false;
    }catch(error){$id('battlemapStatus').textContent='Could not save the session map. '+error.message+' You can still download this map or its recipe.';}
  }
  function download(blob,name,label) {
    const url=URL.createObjectURL(blob);downloadURLs.add(url);
    const link=document.createElement('a');link.href=url;link.download=name;link.textContent=label;
    const previous=[...$id('battlemapDownloads').querySelectorAll('a')].find(a=>a.download===name);
    if(previous){URL.revokeObjectURL(previous.href);downloadURLs.delete(previous.href);previous.remove();}
    $id('battlemapDownloads').append(link);link.click();return link;
  }
  async function exportMap(kind) {
    if(busy||!model)return;const ticket=revision;setBusy(true);
    $id('battlemapStatus').textContent='Preparing '+(kind==='foundry'?'the Foundry import…':'a full-size image…');
    let canvas;
    try{
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if(ticket!==revision||!dialog.open)return;
      canvas=document.createElement('canvas');window.SaerothBattlemapEngine.render(canvas,model,{pixelsPerCell:100,grid:false});
      if(kind==='image'){
        const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('The image could not be encoded. Try a smaller map.')),'image/png'));
        if(ticket!==revision||!dialog.open)return;
        download(blob,filename()+'.png','Save map image');
      }else{
        const data=canvas.toDataURL('image/webp',.92);
        const macro=window.SaerothBattlemapFoundry.macro(model,{imageDataUrl:data,time:recipe.time});
        if(ticket!==revision||!dialog.open)return;
        download(new Blob([JSON.stringify(macro)],{type:'application/json'}),filename()+'-foundry.json','Save Foundry import');
        $id('battlemapImportHelp').open=true;
      }
      $id('battlemapStatus').textContent='Download ready. If it did not start, use the save link below.';
    }catch(error){if(ticket===revision)$id('battlemapStatus').textContent='Export failed: '+error.message;}
    finally{if(canvas){canvas.width=1;canvas.height=1;}if(ticket===revision)setBusy(false);}
  }
  async function open(ctx,from) {
    if(!ctx||!contextFor(ctx.source?.type,ctx.source?.id))return;
    buildDialog();revision++;busy=false;context=contextFor(ctx.source.type,ctx.source.id);opener=from;history=[];model=null;clearDownloads();
    const stored=saved.find(r=>sourceKey(r.source)===sourceKey(context.source));
    recipe=stored?structuredClone(stored):{version:1,generatorVersion:1,source:context.source,kind:context.kind,terrain:context.terrain,size:32,seed:sourceKey(context.source)+'-1',time:context.kind==='cave'?'night':'day'};
    $id('battlemapTitle').textContent=context.name;$id('battlemapSource').textContent='Generated battle map · '+(stored?'Your saved layout':'Suggested starting layout');
    $id('battlemapSuggestion').textContent=context.reason;
    $id('battlemapSessionLink').hidden=true;
    if(!dialog.open)dialog.showModal();dialog.scrollTop=0;dialog.querySelector('.bm-body').scrollTop=0;$id('battlemapClose').focus({preventScroll:true});
    await regenerate(recipe,false);
  }
  function attach() {
    $id('atlasBattlemapAction')?.remove();
    if(!selected)return;const ctx=contextFor(selected.type,selected.id);if(!ctx)return;
    const container=document.createElement('div');container.id='atlasBattlemapAction';container.className='atlas-battlemap-action';
    const button=document.createElement('button');button.id='atlasGenerateBattlemap';button.type='button';
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16M6 8v4M18 10v4"/></svg>Generate battle map';
    button.onclick=()=>open(ctx,button);container.append(button);
    const toolbar=$id('info').querySelector('.atlas-place-toolbar');if(toolbar)toolbar.after(container);else $id('info').querySelector('h2')?.after(container);
  }
  const priorShow=show;
  show=function(...args){const result=priorShow(...args);if(selected?.type===args[0]&&selected.id===Number(args[1]))attach();return result;};
  attach();
  window.SaerothBattlemaps={contextFor,open,validateRecipe};
})();
