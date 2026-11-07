/* Local encounter preparation. Publication and live-world mutations happen elsewhere. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=value=>structuredClone(value);
  const defaults=()=>({name:'Planned encounter',partyLevel:2,partySize:5,target:'moderate',roster:[],placements:[]});
  const signature=value=>value?JSON.stringify(value):'';
  const label=value=>String(value).charAt(0).toUpperCase()+String(value).slice(1);
  let config,base,key,host,contract,contractPromise,initialized,configuration=0,generation=0,busy=false;
  let state={encounter:defaults(),staging:false,mapSignature:''},storageWarning='',recoveryRaw='',recoveryProtected=false;
  let catalog=[],catalogPromise,catalogWarning='',mapScene=null,mapModel=null,mapSignature='',mapPromise,selectedUnit='',pendingRestore=null,urls=[];
  let query='',sourceFilter='all',nearLevel=true,ready=false,restoreRevision=0;
  const downloadLimit=1024*1024;
  function math(){return contractPromise??=(import(new URL('encounter-plan.mjs',base).href).then(module=>contract=module).catch(error=>{contractPromise=null;throw error;}));}
  function report(message,error=false){const node=host?.querySelector('#epStatus');if(node){node.textContent=message;node.classList.toggle('ep-error',error);}}
  function protect(raw){
    recoveryRaw=raw;
    try{if(!localStorage.getItem(key+':recovery'))localStorage.setItem(key+':recovery',raw);recoveryProtected=localStorage.getItem(key+':recovery')===raw;}catch(_){recoveryProtected=false;}
    storageWarning='A saved encounter could not be read. Download its recovery copy before clearing it. New changes stay in this tab if recovery cannot be saved.';
  }
  function persist(){
    try{window.SaerothSessionPrep?.assertWritable();}catch(_){storageWarning='An interrupted session switch needs recovery before more changes can be saved.';return false;}
    if(recoveryRaw&&!recoveryProtected)return false;
    try{const data=JSON.stringify({format:'saeroth-encounter-draft',version:1,...state});localStorage.setItem(key,data);window.SaerothSessionPrep?.recordWrite(key,data);if(!recoveryRaw)storageWarning='';return true;}
    catch(_){storageWarning='Your encounter is available in this tab only. Download an encounter backup before leaving.';return false;}
  }
  function configure(options){
    config=options;base=new URL(options.base||'./',location.href);key='saeroth-encounter-v1:'+base.pathname;configuration++;ready=false;
    state={encounter:defaults(),staging:false,mapSignature:signature(config.getMap())};storageWarning='';recoveryRaw='';recoveryProtected=false;
    const ticket=configuration;
    initialized=(async()=>{
      await math();let raw;
      try{
        recoveryRaw=localStorage.getItem(key+':recovery')||'';recoveryProtected=!!recoveryRaw;
        raw=options.initialRaw===undefined?localStorage.getItem(key):options.initialRaw;if(!raw)return;if(raw.length>downloadLimit)throw Error('Saved encounter is too large.');
        const saved=JSON.parse(raw);
        if(saved.format!=='saeroth-encounter-draft'||saved.version!==1||typeof saved.staging!=='boolean'||typeof saved.mapSignature!=='string')throw Error('Unsupported saved encounter.');
        const noPositions=contract.normalizeEncounter({...saved.encounter,placements:[]});
        let encounter=noPositions,staging=saved.staging;
        if(saved.encounter?.placements?.length){
          if(saved.mapSignature===signature(config.getMap())&&config.getMap()){
            const prepared=await prepareMap(config.getMap());encounter=contract.normalizeEncounter(saved.encounter,prepared.scene,{allowPartialPlacements:true});
          }else{staging=false;storageWarning='The selected map changed. The roster was kept; choose opponent positions again.';}
        }else if(!Array.isArray(saved.encounter?.placements))throw Error('Invalid saved placement list.');
        if(ticket===configuration)state={encounter,staging,mapSignature:signature(config.getMap())};
      }catch(error){if(raw)protect(raw);else storageWarning='Browser storage is unavailable. Download an encounter backup before leaving.';}
      finally{if(ticket===configuration){ready=true;if(recoveryRaw&&!storageWarning)storageWarning='A previous unreadable encounter is preserved in the recovery download.';}}
    })().catch(error=>{if(ticket===configuration)storageWarning='Encounter tools could not load. Reconnect and reopen the campaign desk.';throw error;})
      .finally(()=>{if(ticket===configuration)config?.onChange?.();});
    // A temporarily unavailable script must not cause an unhandled rejection.
    initialized.catch(()=>{});
  }
  function unmount(){generation++;host=null;busy=false;pendingRestore=null;for(const url of urls)URL.revokeObjectURL(url);urls=[];}
  function mount(element){
    unmount();host=element;const ticket=generation;
    host.className='encounter-planner';
    host.innerHTML='<details id="epPanel"><summary>Build an encounter <span id="epCount"></span></summary><div class="ep-body">'+
      '<p class="ws-small ws-muted">Plan opponents for your party, then include their sheets and optional starting positions in the session package.</p>'+
      '<fieldset id="epControls" disabled><legend class="ep-sr">Encounter preparation</legend>'+
      '<label class="ws-field" for="epName">Encounter name<input id="epName" maxlength="160" value="Planned encounter"></label>'+
      '<div class="ep-settings"><label class="ws-field" for="epLevel">Party level<input id="epLevel" type="number" min="1" max="20" step="1" value="2"></label><label class="ws-field" for="epSize">Characters<input id="epSize" type="number" min="1" max="12" step="1" value="5"></label><label class="ws-field" for="epTarget">Target difficulty<select id="epTarget">'+['trivial','low','moderate','severe','extreme'].map(x=>'<option value="'+x+'" '+(x==='moderate'?'selected':'')+'>'+label(x)+'</option>').join('')+'</select></label></div>'+
      '<div id="epBudget" class="ep-budget" aria-live="polite"></div>'+
      '<details class="ep-rules"><summary>How the estimate works</summary><p>Budgets match Foundry PF2e 8.5. The XP award estimate adjusts for party size; it is not the encounter budget divided among the characters. Creatures more than four levels away from the party are left unbudgeted.</p><p>Terrain, tactics, hazards, and depleted resources can change the fight. This planner budgets creatures only. Foundry’s Low-threat adjustment is 15 XP per character; the current GM Core table lists 20. <a href="https://2e.aonprd.com/Rules.aspx?ID=2716" target="_blank" rel="noopener">Encounter-building rules</a>.</p></details>'+
      '<div class="ep-roster-heading"><h4>Opponents</h4><button type="button" class="ws-button" id="epClear" disabled>Clear roster</button></div><div id="epRoster"></div>'+
      '<label class="ws-field" for="epSearch">Find a creature or NPC<input id="epSearch" type="search" autocomplete="off" placeholder="Wolf, skeleton, John Guard…"></label>'+
      '<div class="ep-search-options"><label class="ws-field" for="epSource">Library<select id="epSource"><option value="all">All creatures</option><option value="campaign">Saeroth campaign</option><option value="compendium">PF2e compendiums</option></select></label><label class="ep-check"><input id="epNear" type="checkbox" checked> Within four party levels</label></div>'+
      '<p id="epCatalogStatus" class="ws-small ws-muted"></p><div id="epResults" class="ep-results"></div><button type="button" class="ws-button" id="epRetry" hidden>Reload creature lists</button>'+
      '<section id="epPlacement" class="ep-placement" tabindex="-1"><h4>Starting positions</h4><label class="ep-check"><input type="checkbox" id="epStage"> Place hidden opponents on the selected map</label><p id="epMapHelp" class="ws-small ws-muted"></p><div id="epMapTools" hidden><label class="ws-field" for="epUnit">Opponent to place<select id="epUnit"></select></label><div class="ep-map-wrap"><canvas id="epMapCanvas" role="img" aria-label="Encounter map with numbered opponent starting positions. Use the column and row controls below for keyboard placement."></canvas></div><p class="ws-small ws-muted">Tap the map, or enter the top-left grid square below. Numbered footprints are hidden enemy tokens. Check the artwork for terrain the walls do not describe.</p><div class="ep-coordinate-controls"><label class="ws-field" for="epColumn">Column<input id="epColumn" type="number" min="1" value="1" step="1"></label><label class="ws-field" for="epRow">Row<input id="epRow" type="number" min="1" value="1" step="1"></label><button type="button" class="ws-button" id="epPlace">Place opponent</button></div><div class="ep-actions"><button type="button" class="ws-button" id="epUnplace">Remove this position</button><button type="button" class="ws-button" id="epResetPositions">Clear positions</button></div><p id="epPlacementCount" class="ws-small" aria-live="polite"></p></div></section>'+
      '<details class="ep-portability"><summary>Move this encounter to another device</summary><p class="ws-small ws-muted">This encounter saves in this browser. A backup includes its roster, settings, positions, and selected map recipe. It does not contain your session notes.</p><div class="ep-actions"><button type="button" class="ws-button" id="epBackup">Download encounter backup</button><label class="ws-button ep-file-label" for="epRestore">Choose a backup<input id="epRestore" type="file" accept="application/json,.json"></label></div><div id="epRestorePreview" hidden></div><div id="epDownloads"></div></details>'+
      '</fieldset><p id="epStorage" class="ws-small ws-muted"></p><button type="button" class="ws-button" id="epRecovery" hidden>Download unreadable encounter</button><p id="epStatus" role="status" aria-live="polite">Loading encounter tools…</p></div></details>';
    host.querySelector('#epPanel').addEventListener('toggle',()=>{if(host?.querySelector('#epPanel').open)loadCatalog();});
    host.querySelector('#epName').onchange=()=>updateSettings();host.querySelector('#epLevel').onchange=()=>updateSettings();host.querySelector('#epSize').onchange=()=>updateSettings();host.querySelector('#epTarget').onchange=()=>updateSettings();
    host.querySelector('#epSearch').oninput=event=>{query=event.target.value;renderResults();};host.querySelector('#epSource').onchange=event=>{sourceFilter=event.target.value;renderResults();};host.querySelector('#epNear').onchange=event=>{nearLevel=event.target.checked;renderResults();};
    host.querySelector('#epRetry').onclick=()=>{catalogPromise=null;loadCatalog();};
    host.querySelector('#epClear').onclick=()=>{if(busy)return;state.encounter.roster=[];state.encounter.placements=[];state.staging=false;selectedUnit='';changed();report('Encounter roster cleared. Session notes and other selected NPCs were kept.');};
    host.querySelector('#epStage').onchange=async event=>{if(busy)return;state.staging=event.target.checked;if(!state.staging)state.encounter.placements=[];changed();if(state.staging)await renderMap();};
    host.querySelector('#epUnit').onchange=event=>{selectedUnit=event.target.value;renderPositions();drawMap();};
    host.querySelector('#epPlace').onclick=()=>place(Number(host.querySelector('#epColumn').value)-1,Number(host.querySelector('#epRow').value)-1);
    host.querySelector('#epMapCanvas').onclick=event=>{const rect=event.currentTarget.getBoundingClientRect();if(!mapScene||!rect.width)return;place(Math.floor((event.clientX-rect.left)/rect.width*(mapScene.width/100)),Math.floor((event.clientY-rect.top)/rect.height*(mapScene.height/100)));};
    host.querySelector('#epUnplace').onclick=()=>{if(busy)return;const unit=units().find(u=>u.key===selectedUnit);if(!unit)return;state.encounter.placements=state.encounter.placements.filter(p=>p.entryId!==unit.entry.id||p.instance!==unit.instance);changed();};
    host.querySelector('#epResetPositions').onclick=()=>{if(busy)return;state.encounter.placements=[];changed();report('Positions cleared. Choose a starting square for each opponent.');};
    host.querySelector('#epBackup').onclick=backup;host.querySelector('#epRestore').onchange=readBackup;
    host.querySelector('#epRecovery').onclick=()=>download(new Blob([recoveryRaw],{type:'application/json'}),'saeroth-unreadable-encounter.json','Save unreadable encounter');
    initialized.then(()=>{if(ticket!==generation||!host)return;render();report('Ready. Add opponents to include an encounter in this session.');if(state.staging)renderMap();}).catch(error=>{if(ticket===generation)report(error.message,true);});
  }
  function setBusy(value){busy=!!value;if(host)host.querySelector('#epControls').disabled=busy||!ready;}
  function changed(){persist();render();config?.onChange?.();document.dispatchEvent(new CustomEvent('saeroth-session-change'));}
  function updateSettings(){
    if(busy||!ready)return;const candidate={...state.encounter,name:host.querySelector('#epName').value,partyLevel:Number(host.querySelector('#epLevel').value),partySize:Number(host.querySelector('#epSize').value),target:host.querySelector('#epTarget').value};
    try{const normalized=contract.normalizeEncounter({...candidate,placements:[]});state.encounter={...normalized,placements:state.encounter.placements};changed();}
    catch(error){report(error.message,true);renderSettings();}
  }
  function renderSettings(){if(!host)return;for(const [id,key]of [['epName','name'],['epLevel','partyLevel'],['epSize','partySize'],['epTarget','target']])host.querySelector('#'+id).value=state.encounter[key];}
  function render(){
    if(!host||!ready)return;renderSettings();renderBudget();renderRoster();renderResults();renderPositions();
    host.querySelector('#epSearch').value=query;host.querySelector('#epSource').value=sourceFilter;host.querySelector('#epNear').checked=nearLevel;
    host.querySelector('#epControls').disabled=busy;host.querySelector('#epCount').textContent=state.encounter.roster.length?'('+units().length+' opponents)':'';
    host.querySelector('#epStorage').textContent=storageWarning;host.querySelector('#epRecovery').hidden=!recoveryRaw;
    host.querySelector('#epClear').disabled=busy||!state.encounter.roster.length;
    host.querySelector('#epStage').checked=state.staging;host.querySelector('#epStage').disabled=busy||!config.getMap()||!state.encounter.roster.length;
    host.querySelector('#epMapHelp').textContent=!config.getMap()?'Choose a battle map from the atlas to stage opponents. A roster-only package works without a map.':!state.encounter.roster.length?'Add opponents before choosing starting positions.':'Imports an inactive scene. Opponents begin hidden and combat is not started.';
    host.querySelector('#epMapTools').hidden=!state.staging;drawMap();
  }
  function number(value){return Number.isInteger(value)?String(value):Number(value.toFixed(1)).toString();}
  function renderBudget(){
    const result=contract.calculateEncounter(state.encounter),node=host.querySelector('#epBudget');
    node.innerHTML='<div class="ep-budget-head"><div><span class="ws-small ws-muted">Encounter XP</span><strong>'+ (result.budgeted?number(result.totalXP):number(result.knownXP)+' + ?')+' <small>/ '+result.budget+' target</small></strong></div><span class="ep-difficulty">'+esc(result.difficulty.label)+'</span></div>'+
      '<div class="ep-thresholds">'+result.thresholds.map(t=>'<span class="'+(t.target===state.encounter.target?'is-target':'')+'">'+label(t.target)+' <b>'+t.xp+'</b></span>').join('')+'</div>'+
      '<p class="ws-small">'+(result.budgeted?(result.remainingXP>=0?number(result.remainingXP)+' XP remaining to '+state.encounter.target+' target.':number(-result.remainingXP)+' XP over '+state.encounter.target+' target.')+' Estimated award: <strong>'+number(result.awardXP)+' XP per character</strong>.':'Difficulty and award are unknown until all opponents are within the supported level range.')+'</p>'+
      (result.unbudgeted.length?'<p class="ep-error ws-small">Outside the XP table: '+result.unbudgeted.map(r=>esc(r.name)+' (level '+r.level+')').join(', ')+'. Their XP is not counted as zero.</p>':'')+'<small class="ws-muted">Matches Foundry PF2e · five-character default</small>';
  }
  function renderRoster(){
    const node=host.querySelector('#epRoster'),math=contract.calculateEncounter(state.encounter);
    node.innerHTML=state.encounter.roster.length?'<ul class="ep-roster">'+state.encounter.roster.map(entry=>{const row=math.rows.find(x=>x.id===entry.id);return '<li><div><strong>'+esc(entry.name)+'</strong><small>Level '+entry.level+' · '+(entry.source.type==='campaign'?'Saeroth':'PF2e')+' · '+(row.xp===null?'Unbudgeted':row.xp+' XP each')+'</small></div><label class="ep-quantity">Count<input type="number" min="1" max="40" step="1" data-ep-count="'+entry.id+'" value="'+entry.count+'" aria-label="Count of '+esc(entry.name)+'"></label><button type="button" class="ws-button" data-ep-remove="'+entry.id+'" aria-label="Remove '+esc(entry.name)+'">Remove</button></li>';}).join('')+'</ul>':'<p class="ep-empty ws-small ws-muted">No opponents yet. Search the creature libraries below.</p>';
    node.onchange=event=>{const input=event.target.closest('[data-ep-count]');if(!input||busy)return;const candidate=clone(state.encounter),entry=candidate.roster.find(r=>r.id===input.dataset.epCount);if(!entry)return;entry.count=Number(input.value);candidate.placements=candidate.placements.filter(p=>p.entryId!==entry.id||p.instance<entry.count);try{contract.normalizeEncounter({...candidate,placements:[]});state.encounter=candidate;changed();}catch(error){report(error.message,true);renderRoster();}};
    node.onclick=event=>{const button=event.target.closest('[data-ep-remove]');if(!button||busy)return;state.encounter.roster=state.encounter.roster.filter(r=>r.id!==button.dataset.epRemove);state.encounter.placements=state.encounter.placements.filter(p=>p.entryId!==button.dataset.epRemove);if(!state.encounter.roster.length)state.staging=false;changed();};
  }
  async function loadCatalog(){
    if(!ready){await initialized.catch(()=>{});if(!ready)return;}
    if(!catalogPromise){
      catalogPromise=Promise.allSettled([['session-actors.json','campaign'],['encounter-creatures.json','compendium']].map(async([file,type])=>{
        const response=await fetch(new URL(file,base),{credentials:'omit'});if(!response.ok)throw Error(type==='campaign'?'Saeroth creatures unavailable.':'PF2e creatures unavailable.');const data=await response.json();const rows=type==='campaign'?data.actors:data.creatures;
        if(data.schema!==1||!Array.isArray(rows)||rows.length>10000)throw Error('Unsupported creature catalog.');
        const seen=new Set();return rows.map(raw=>{const source=type==='campaign'?{type,key:raw.key}:raw.source;
          const entry=contract.normalizeEncounter({...defaults(),roster:[{id:'catalog-entry',name:raw.name,level:raw.level,count:1,width:raw.width??1,height:raw.height??1,source}]}).roster[0];
          const id=contract.sourceKey(source);if(seen.has(id))throw Error('Duplicate catalog source.');seen.add(id);return {...entry,id,book:typeof raw.book==='string'?raw.book.slice(0,160):''};
        });
      })).then(results=>{catalog=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);catalogWarning=results.filter(r=>r.status==='rejected').map(r=>r.reason.message).join(' ');return catalog;}).catch(error=>{catalogPromise=null;catalogWarning=error.message;});
    }
    const ticket=generation;if(host){host.querySelector('#epCatalogStatus').textContent='Loading creature libraries…';}
    await catalogPromise;if(ticket===generation&&host)renderResults();
  }
  function renderResults(){
    if(!host||!ready)return;const node=host.querySelector('#epResults');host.querySelector('#epRetry').hidden=!catalogWarning;
    if(!catalogPromise){node.innerHTML='<p class="ws-small ws-muted">Creature libraries load when you open this planner.</p>';return;}
    const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const words=normalize(query).trim().split(/\s+/).filter(Boolean);
    const matches=catalog.filter(r=>(sourceFilter==='all'||r.source.type===sourceFilter)&&(!nearLevel||Math.abs(r.level-state.encounter.partyLevel)<=4)&&words.every(w=>normalize(r.name).includes(w)));
    const rows=matches.slice(0,20);host.querySelector('#epCatalogStatus').textContent=[catalogWarning,matches.length+' matches'+(matches.length>20?' · showing the first 20; refine your search.':'.')].filter(Boolean).join(' ');
    node.innerHTML=rows.length?rows.map((row,index)=>'<div class="ep-result"><span><strong>'+esc(row.name)+'</strong><small>Level '+row.level+' · '+(row.source.type==='campaign'?'Saeroth':esc(row.book||'PF2e compendium'))+'</small></span><button type="button" class="ws-button" data-ep-add="'+index+'" aria-label="Add '+esc(row.name)+'">Add</button></div>').join(''):'<p class="ws-small ws-muted">No matching creatures. Try a shorter name or include other levels.</p>';
    node.onclick=event=>{const button=event.target.closest('[data-ep-add]');if(!button||busy)return;const row=rows[Number(button.dataset.epAdd)];if(!row)return;
      const candidate=clone(state.encounter),existing=candidate.roster.find(e=>contract.sourceKey(e.source)===contract.sourceKey(row.source));
      if(existing)existing.count++;else{const bytes=crypto.getRandomValues(new Uint8Array(10));candidate.roster.push({id:'e'+Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join(''),name:row.name,level:row.level,count:1,width:row.width,height:row.height,source:clone(row.source)});}
      try{contract.normalizeEncounter({...candidate,placements:[]});state.encounter=candidate;changed();report(row.name+' added.');}catch(error){report(error.message,true);}
    };
  }
  function units(){return state.encounter.roster.flatMap(entry=>Array.from({length:entry.count},(_,instance)=>({entry,instance,key:entry.id+':'+instance})));}
  function renderPositions(){
    if(!host)return;const list=units();if(!list.some(u=>u.key===selectedUnit))selectedUnit=list.find(u=>!state.encounter.placements.some(p=>p.entryId===u.entry.id&&p.instance===u.instance))?.key||list[0]?.key||'';
    const select=host.querySelector('#epUnit');select.innerHTML=list.map((unit,index)=>{const position=state.encounter.placements.find(p=>p.entryId===unit.entry.id&&p.instance===unit.instance);return '<option value="'+unit.key+'">'+(index+1)+'. '+esc(unit.entry.name)+(unit.entry.count>1?' '+(unit.instance+1):'')+' — '+(position?'column '+(position.x/100+1)+', row '+(position.y/100+1):'unplaced')+'</option>';}).join('');select.value=selectedUnit;
    const unit=list.find(u=>u.key===selectedUnit),position=unit&&state.encounter.placements.find(p=>p.entryId===unit.entry.id&&p.instance===unit.instance);
    if(position){host.querySelector('#epColumn').value=position.x/100+1;host.querySelector('#epRow').value=position.y/100+1;}
    for(const id of ['epColumn','epRow'])host.querySelector('#'+id).max=config.getMap()?.recipe.size||40;
    host.querySelector('#epUnplace').disabled=busy||!position;host.querySelector('#epResetPositions').disabled=busy||!state.encounter.placements.length;
    host.querySelector('#epPlacementCount').textContent=state.encounter.placements.length+' of '+list.length+' opponents placed.'+(state.encounter.placements.length<list.length?' Place every opponent before exporting, or turn off map placement.':' Ready to stage hidden opponents.');
  }
  async function prepareMap(chosen){
    const selected=signature(chosen);if(!chosen)throw Error('Choose a battle map first.');if(mapScene&&mapSignature===selected)return {scene:mapScene,model:mapModel};
    if(mapPromise?.signature===selected)return mapPromise.promise;
    const promise=(async()=>{await config.loadMapAssets();const model=window.SaerothBattlemapEngine.generate({...chosen.recipe,name:chosen.name});const scene=window.SaerothBattlemapFoundry.scene(model,{backgroundPath:'asset:placement-preview',time:chosen.recipe.time});return {scene,model};})();
    mapPromise={signature:selected,promise};const prepared=await promise;
    // A backup preview may start while the selected map is still preparing.
    // Its separate promise must not suppress the active map's completed cache.
    if(selected===signature(config.getMap())){mapScene=prepared.scene;mapModel=prepared.model;mapSignature=selected;}
    if(mapPromise?.promise===promise)mapPromise=null;return prepared;
  }
  async function renderMap(){
    if(!host||!state.staging)return;const ticket=generation,selected=signature(config.getMap());report('Preparing the placement map…');
    try{await prepareMap(clone(config.getMap()));if(ticket!==generation||!host||selected!==signature(config.getMap())||!state.staging)return;drawMap();report('Choose an opponent and its starting square.');}
    catch(error){if(ticket===generation)report(error.message,true);}
  }
  function drawMap(){
    if(!host||!state.staging||!mapScene||mapSignature!==signature(config.getMap()))return;
    const canvas=host.querySelector('#epMapCanvas');window.SaerothBattlemapEngine.render(canvas,mapModel,{pixelsPerCell:24,grid:true});const ctx=canvas.getContext('2d'),list=units();
    for(const [index,unit]of list.entries()){
      const p=state.encounter.placements.find(p=>p.entryId===unit.entry.id&&p.instance===unit.instance);if(!p)continue;
      const x=p.x/100*24,y=p.y/100*24,w=unit.entry.width*24,h=unit.entry.height*24;ctx.fillStyle=unit.key===selectedUnit?'#f4ca68dd':'#702f38dd';ctx.strokeStyle='#fff4dc';ctx.lineWidth=2;ctx.fillRect(x+1,y+1,w-2,h-2);ctx.strokeRect(x+1,y+1,w-2,h-2);ctx.fillStyle=unit.key===selectedUnit?'#241a15':'#fff8e7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+Math.max(9,Math.min(16,w*.6))+'px system-ui';ctx.fillText(String(index+1),x+w/2,y+h/2);
    }
  }
  function inside(point,polygon){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
  function checkFloor(entry,column,row){
    if(mapModel?.kind!=='cave')return;
    for(const x of [column+.03,column+entry.width/2,column+entry.width-.03])for(const y of [row+.03,row+entry.height/2,row+entry.height-.03])if(!mapModel.floorPolygons.some(p=>inside([x,y],p))||mapModel.floorHoles.some(p=>inside([x,y],p)))throw Error('Choose a position on the cave floor.');
  }
  function place(column,row){
    if(busy||!state.staging||!mapScene||mapSignature!==signature(config.getMap()))return;const unit=units().find(u=>u.key===selectedUnit);if(!unit)return;
    try{
      if(!Number.isInteger(column)||!Number.isInteger(row))throw Error('Enter whole grid columns and rows.');checkFloor(unit.entry,column,row);
      const candidate=clone(state.encounter);candidate.placements=candidate.placements.filter(p=>p.entryId!==unit.entry.id||p.instance!==unit.instance);candidate.placements.push({entryId:unit.entry.id,instance:unit.instance,x:column*100,y:row*100});
      state.encounter=contract.normalizeEncounter(candidate,mapScene,{allowPartialPlacements:true});
      const next=units().find(u=>!state.encounter.placements.some(p=>p.entryId===u.entry.id&&p.instance===u.instance));selectedUnit=next?.key||unit.key;changed();report(unit.entry.name+' placed at column '+(column+1)+', row '+(row+1)+'.');
    }catch(error){report(error.message,true);}
  }
  function mapChanged(){
    const selected=signature(config?.getMap());if(state.mapSignature===selected)return;
    const hadPositions=state.encounter.placements.length||state.staging;state.encounter.placements=[];state.staging=false;state.mapSignature=selected;mapScene=null;mapModel=null;mapSignature='';mapPromise=null;
    if(ready){changed();if(hadPositions)report('Map changed. Opponents were kept; choose starting positions for the new map.');}
  }
  function download(blob,name,text){
    if(!host)return;for(const old of urls)URL.revokeObjectURL(old);const url=URL.createObjectURL(blob);urls=[url];const link=document.createElement('a');link.href=url;link.download=name;link.textContent=text;host.querySelector('#epDownloads').replaceChildren(link);link.click();
  }
  async function backup(){
    if(busy)return;
    const ticket=generation;
    try{await initialized;const chosen=config.getMap();const data={format:'saeroth-encounter-plan',version:1,encounter:clone(state.encounter),staging:state.staging,map:chosen?clone(chosen):null};
      const scene=data.encounter.placements.length?(await prepareMap(chosen)).scene:null;contract.normalizeEncounter(data.encounter,scene,{allowPartialPlacements:true});
      if(ticket!==generation||!host)return;
      download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'saeroth-encounter-plan.json','Save encounter backup');report('Encounter backup includes the roster, placements, and map recipe.');
    }catch(error){if(ticket===generation)report(error.message,true);}
  }
  async function readBackup(event){
    if(busy)return;const file=event.target.files[0],ticket=generation,revision=++restoreRevision;pendingRestore=null;host.querySelector('#epRestorePreview').hidden=true;if(!file)return;
    try{
      if(file.size>downloadLimit)throw Error('Encounter backups must be under 1 MiB.');const data=JSON.parse(await file.text());await initialized;
      if(data?.format!=='saeroth-encounter-plan'||data.version!==1||typeof data.staging!=='boolean')throw Error('Choose a Saeroth encounter backup.');
      const chosen=data.map?config.validateMap(data.map):null,scene=data.encounter?.placements?.length?(await prepareMap(chosen)).scene:null;
      const encounter=contract.normalizeEncounter(data.encounter,scene,{allowPartialPlacements:true});if(data.staging&&!chosen)throw Error('This staged encounter has no map recipe.');
      if(ticket!==generation||revision!==restoreRevision||!host||busy)return;pendingRestore={encounter,staging:data.staging,map:chosen};const preview=host.querySelector('#epRestorePreview');
      preview.innerHTML='<p><strong>'+esc(encounter.name)+'</strong> · '+encounter.roster.reduce((n,r)=>n+r.count,0)+' opponents. Restoring replaces this browser’s current encounter.</p>'+(chosen?'<label class="ep-check"><input id="epRestoreMap" type="checkbox" '+(!config.getMap()||signature(config.getMap())===signature(chosen)?'checked':'')+'> Use its map: '+esc(chosen.name)+'</label>':'')+'<button type="button" class="ws-button" id="epApplyRestore">Restore encounter</button>';preview.hidden=false;
      preview.querySelector('#epApplyRestore').onclick=()=>{
        if(busy||!pendingRestore)return;const restored=pendingRestore;pendingRestore=null;let omitted=false;
        if(restored.map&&preview.querySelector('#epRestoreMap')?.checked)config.selectMap(restored.map);
        else if(signature(restored.map)!==signature(config.getMap())){restored.encounter.placements=[];restored.staging=false;omitted=true;}
        state={encounter:restored.encounter,staging:restored.staging,mapSignature:signature(config.getMap())};selectedUnit='';changed();preview.hidden=true;report('Encounter restored.'+(omitted?' Your selected map was kept; starting positions were cleared.':''));if(state.staging)renderMap();
      };
    }catch(error){if(ticket===generation&&revision===restoreRevision)report(error instanceof SyntaxError?'This backup is not valid JSON.':error.message,true);}
    finally{if(ticket===generation&&revision===restoreRevision&&host)host.querySelector('#epRestore').value='';}
  }
  async function capture(){await initialized;return snapshot();}
  function snapshot(){return ready?clone(state):null;}
  function checkStaging(captured,chosenMap){
    if(!captured.staging)return;
    if(captured.mapSignature!==signature(chosenMap))throw Error('The encounter positions belong to a different map. Place the opponents again.');
    if(!chosenMap)throw Error('Choose a battle map before exporting staged opponents.');
    const opponents=captured.encounter.roster.reduce((total,entry)=>total+entry.count,0);
    if(captured.encounter.placements.length!==opponents)throw Error('Place every opponent before exporting, or turn off map placement.');
  }
  async function preflight(captured,chosenMap){
    // Keep this check tied to the export snapshot, even if the working desk changes.
    const draft=captured?clone(captured):null,chosen=chosenMap?clone(chosenMap):null;
    await initialized;if(!draft?.encounter.roster.length)return null;
    checkStaging(draft,chosen);
    // Geometry is sufficient here: never render the full-size map or load artwork.
    const scene=draft.staging?(await prepareMap(chosen)).scene:null;
    return exportEncounter(draft,scene,chosen);
  }
  async function exportEncounter(captured,scene,chosenMap){
    await initialized;if(!captured?.encounter.roster.length)return null;
    checkStaging(captured,chosenMap);
    const data=clone(captured.encounter);if(!captured.staging)data.placements=[];
    return contract.normalizeEncounter(data,scene);
  }
  function summary(){return {ready,error:ready?'':storageWarning,opponents:state.encounter.roster.reduce((n,r)=>n+r.count,0),sheets:state.encounter.roster.length,sources:state.encounter.roster.map(r=>contract?contract.sourceKey(r.source):''),staging:state.staging,placements:state.encounter.placements.length};}
  async function validatePreset(value){await math();const encounter=contract.normalizeEncounter(value);if(encounter.placements.length)throw Error('Prepared encounters must begin without placements.');return encounter;}
  async function addPrepared(value){await initialized;state.encounter=await validatePreset(value);state.staging=false;state.mapSignature=signature(config.getMap());selectedUnit='';changed();report('Prepared encounter added. Its roster can be adjusted before export.');}
  window.addEventListener('storage',event=>{
    if(window.SaerothSessionPrep?.externalChange(event))return;
    if(event.key!==key||!config||busy)return;
    // Other tabs never silently overwrite an encounter currently being prepared.
    storageWarning='The encounter changed in another tab. This tab kept its preparation; download a backup before reloading.';if(host)host.querySelector('#epStorage').textContent=storageWarning;
  });
  function sessionEntries(value){
    if(recoveryRaw&&!recoveryProtected)throw Error('Preserve the unreadable encounter before opening another session.');
    return [[key,JSON.stringify({format:'saeroth-encounter-draft',version:1,...value})]];
  }
  function commitSession(value){
    state=clone(value);storageWarning='';selectedUnit='';pendingRestore=null;restoreRevision++;
    mapScene=null;mapModel=null;mapSignature='';mapPromise=null;
    if(host){host.querySelector('#epRestorePreview').hidden=true;render();if(state.staging)renderMap();}
    config?.onChange?.();
  }
  window.SaerothEncounterPlanner={configure,mount,unmount,mapChanged,snapshot,capture,preflight,exportEncounter,summary,setBusy,validatePreset,addPrepared,sessionEntries,commitSession,isBusy:()=>busy};
})();
