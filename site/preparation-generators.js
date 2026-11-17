/* Browser-local loot, merchant stock, and NPC preparation. */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title=v=>v==='npc'?'NPC':v.charAt(0).toUpperCase()+v.slice(1),seed=()=>crypto.randomUUID();
  let host,base,key,scope,model,format,catalog,creatures,loading,mode='loot',busy=false,ticket=0,urls=[],recovery='';
  let results={},settings={},loaded=false,externalChange=false;
  function status(message,error=false){const node=host?.querySelector('#ggStatus');if(node){node.textContent=message;node.classList.toggle('gg-error',error);}}
  async function load(){
    if(!loading)loading=Promise.all([
      import(new URL('preparation-generators.mjs',base)),import(new URL('session-package.mjs',base)),
      ...['generator-items.json','encounter-creatures.json'].map(async file=>{const response=await fetch(new URL(file,base));if(!response.ok)throw Error('Generator data could not load. Reconnect and try again.');const value=await response.json();if(value.schema!==1)throw Error('Unsupported generator catalog.');return value;})
    ]).then(([m,f,c,n])=>{if(!Array.isArray(c.items)||!Array.isArray(n.creatures))throw Error('Generator data is incomplete.');model=m;format=f;catalog=c;creatures=n;return m;}).catch(error=>{loading=null;throw error;});
    return loading;
  }
  function save(){
    if(externalChange){status('Another tab changed generator results. This tab kept its results; export them before reloading.',true);return;}
    try{if(recovery&&localStorage.getItem(key+':recovery')!==recovery)throw Error('Preserve recovery first.');localStorage.setItem(key,JSON.stringify({version:1,mode,settings,results}));}
    catch(_){status('These results are available in this tab. Export them before leaving if browser storage is unavailable.',true);}
  }
  function unmount(){ticket++;host=null;busy=false;urls.forEach(URL.revokeObjectURL);urls=[];}
  function mount(element,options={}){
    unmount();host=element;base=new URL(options.base||'./',location.href);key='saeroth-generators-v1:'+base.pathname;
    if(scope!==key){scope=key;results={};settings={};mode='loot';recovery='';loaded=false;externalChange=false;}
    host.innerHTML='<p class="ws-small ws-muted">Roll treasure, stock a shop, or prepare a person. Results save in this browser and export as native Foundry sheets with GM notes.</p><div id="ggContent"></div><p id="ggStatus" role="status" aria-live="polite">Open the generators to load their item and NPC libraries.</p>';
    const current=ticket;
    const panel=host.closest('details');
    const init=async()=>{try{status('Loading item and NPC libraries…');await load();if(current!==ticket||!host)return;
      if(!loaded){let raw;try{raw=localStorage.getItem(key);if(raw){if(raw.length>1024*1024)throw Error('Backup too large.');const state=JSON.parse(raw);if(state.version!==1)throw Error('Unsupported generator save.');const restored={};for(const [kind,value]of Object.entries(state.results||{})){if(!['loot','shop','npc'].includes(kind))throw Error('Unknown generator result.');restored[kind]=model.normalizePreparation(value);if(restored[kind].kind!==kind)throw Error('Mismatched generator result.');}results=restored;settings=state.settings&&typeof state.settings==='object'?state.settings:{};mode=['loot','shop','npc'].includes(state.mode)?state.mode:'loot';}}catch(_){if(raw){recovery=raw;try{if(!localStorage.getItem(key+':recovery'))localStorage.setItem(key+':recovery',raw);}catch(_){}}}loaded=true;}host.dataset.ready='true';
      render();status(externalChange?'Another tab changed generator results. This tab kept its results; export them before reloading.':recovery?'An unreadable save was preserved. Download its recovery copy below.':'Ready. Choose a generator.');
    }catch(error){if(current===ticket&&host){host.querySelector('#ggContent').innerHTML='<button type="button" class="ws-button" id="ggRetry">Retry loading generator data</button>';host.querySelector('#ggRetry').onclick=init;status(error.message,true);}}};
    panel.addEventListener('toggle',()=>{if(panel.open&&!host?.dataset.ready)init();});
    if(panel.open)init();
  }
  function field(name,label,value,{type='text',min,max}={}){return '<label class="ws-field" for="gg-'+name+'">'+label+'<input id="gg-'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(min!==undefined?'min="'+min+'" ':'')+(max!==undefined?'max="'+max+'" ':'')+(type==='number'?'step="1" required':'maxlength="160"')+'></label>';}
  function select(name,label,value,values){return '<label class="ws-field" for="gg-'+name+'">'+label+'<select id="gg-'+name+'" name="'+name+'">'+values.map(v=>'<option value="'+v+'" '+(value===v?'selected':'')+'>'+title(v)+'</option>').join('')+'</select></label>';}
  function render(){
    const options={level:mode==='npc'?3:3,partySize:4,share:25,count:mode==='shop'?20:6,kind:'general',rarity:'common',role:'any',name:'',seed:seed(),funds:100,...settings[mode]};
    host.querySelector('#ggContent').innerHTML='<div class="gg-tabs" role="tablist" aria-label="Preparation generators">'+['loot','shop','npc'].map(k=>'<button type="button" id="gg-tab-'+k+'" data-gg-mode="'+k+'" role="tab" aria-selected="'+(mode===k)+'" tabindex="'+(mode===k?'0':'-1')+'" aria-controls="ggForm">'+title(k)+'</button>').join('')+'</div>'+
      '<form id="ggForm" role="tabpanel" aria-labelledby="gg-tab-'+mode+'"><fieldset id="ggFields"><legend class="ep-sr">'+title(mode)+' options</legend><div class="gg-fields">'+
      field('name',mode==='npc'?'Name (blank for a random name)':mode==='shop'?'Shop name':'Treasure name',options.name)+field('level',mode==='shop'?'Settlement level':mode==='npc'?'NPC level':'Party level',options.level,{type:'number',min:mode==='npc'?-1:mode==='shop'?0:1,max:20})+
      (mode==='loot'?field('partySize','Characters',options.partySize,{type:'number',min:1,max:12})+field('share','Share of level treasure (%)',options.share,{type:'number',min:1,max:100}):'')+
      (mode!=='npc'?field('count',mode==='shop'?'Stock lines':'Maximum item lines',options.count,{type:'number',min:mode==='shop'?1:0,max:100})+select('kind','Item theme',options.kind,model.SHOP_KINDS)+select('rarity','Rarity ceiling',options.rarity,['common','uncommon','rare']):select('role','Role',options.role,model.NPC_ROLES))+
      (mode==='shop'?field('funds','Merchant funds (gp)',options.funds,{type:'number',min:0,max:1000000}):'')+field('seed','Roll seed',options.seed)+
      '</div><p class="ws-small ws-muted">'+(mode==='loot'?'This is a share of a whole level’s treasure value, scaled proportionally for party size. Currency fills the remaining budget; item-slot allocation is flexible.':mode==='shop'?'Stock is filtered by settlement level and rarity. Listed PF2e prices are used.': 'Names, motives, and mannerisms are generated. Combat statistics use a published humanoid profile at this level, with a native elite or weak adjustment if no exact-level profile exists. A role match is preferred when available.')+'</p><div class="gg-actions"><button type="submit" class="ws-button">Generate '+(mode==='npc'?'NPC':mode)+'</button><button type="button" id="ggReroll" class="ws-button">New roll</button></div></fieldset></form><div id="ggResult"></div>';
    host.querySelectorAll('[data-gg-mode]').forEach(button=>{button.onclick=()=>{if(busy)return;mode=button.dataset.ggMode;save();render();host.querySelector('[data-gg-mode="'+mode+'"]').focus();};button.onkeydown=event=>{if(busy)return;if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const modes=['loot','shop','npc'],i=modes.indexOf(mode);mode=event.key==='Home'?modes[0]:event.key==='End'?modes[2]:modes[(i+(event.key==='ArrowRight'?1:2))%3];save();render();host.querySelector('[data-gg-mode="'+mode+'"]').focus();};});
    host.querySelector('#ggForm').onsubmit=generate;
    host.querySelector('#ggReroll').onclick=()=>{host.querySelector('#gg-seed').value=seed();host.querySelector('#ggForm').requestSubmit();};
    host.querySelector('#ggForm').onchange=()=>{settings[mode]=readOptions();save();};renderResult();
  }
  function readOptions(){const data=Object.fromEntries(new FormData(host.querySelector('#ggForm')));for(const k of ['level','partySize','share','count','funds'])if(data[k]!==undefined)data[k]=Number(data[k]);return data;}
  function generate(event){event.preventDefault();if(busy)return;try{const options=readOptions();settings[mode]=options;results[mode]=mode==='loot'?model.generateLoot(options,catalog):mode==='shop'?model.generateShop({...options,fundsCp:options.funds*100},catalog):model.generateNPC(options,creatures);renderResult();save();status(title(mode)+' generated. Review it before exporting.');}catch(error){status(error.message,true);}}
  function renderResult(){const node=host.querySelector('#ggResult'),result=results[mode];
    node.innerHTML=(result?'<section class="gg-result" aria-label="Generated '+mode+'"><h3>'+esc(result.name)+'</h3><p class="ws-small">'+esc(result.description)+'</p>'+(mode==='npc'?'<p>Level '+result.level+' · Native profile: <strong>'+esc(result.baseName)+'</strong></p>':'<div class="gg-table"><table><thead><tr><th>Item</th><th>Quantity</th><th>Listed price</th><th></th></tr></thead><tbody>'+result.items.map((item,i)=>'<tr><td>'+esc(item.name)+'</td><td><input data-gg-quantity="'+i+'" type="number" min="1" max="10000" value="'+item.quantity+'" aria-label="Quantity of '+esc(item.name)+'"></td><td>'+(model.money(item.priceCp)+(item.pricePer>1?' per '+item.pricePer:''))+'</td><td><button type="button" class="ws-button" data-gg-remove="'+i+'" aria-label="Remove '+esc(item.name)+'">×</button></td></tr>').join('')+'</tbody></table></div><p class="ws-small">Currency: '+(Object.entries(result.coins).filter(([,n])=>n).map(([k,n])=>n+' '+k).join(', ')||'none')+'</p><p class="gg-total">Total value: '+model.money(model.preparationValue(result))+(result.targetCp!==undefined?' / '+model.money(result.targetCp)+' target':'')+'</p>')+
      '<div class="gg-actions"><button type="button" class="ws-button" id="ggExport">Export '+(mode==='npc'?'NPC':mode)+' to Foundry</button><button type="button" class="ws-button" id="ggExportAll">Export all generated content</button></div><p class="ws-small ws-muted">Use Import Saeroth Session in Foundry with Saeroth module 0.5.0 or newer. Loot and shops become native loot or merchant sheets; NPCs use their published profiles. Generator results are separate from saved session versions.</p><div id="ggDownloads"></div></section>':'<p class="ws-small ws-muted">Generate '+(mode==='npc'?'NPC':mode)+' to see its result here.</p>')+(recovery?'<button type="button" class="ws-button" id="ggRecovery">Download unreadable generator save</button>':'');
    if(result){
      node.querySelector('#ggExport').onclick=()=>exportResults([result]);node.querySelector('#ggExportAll').onclick=()=>exportResults(Object.values(results));
      node.querySelectorAll('[data-gg-quantity]').forEach(input=>{input.onchange=()=>{try{const next=structuredClone(result);next.items[Number(input.dataset.ggQuantity)].quantity=Number(input.value);results[mode]=model.normalizePreparation(next);renderResult();save();}catch(error){status(error.message,true);input.value=result.items[Number(input.dataset.ggQuantity)].quantity;}};});
      node.querySelectorAll('[data-gg-remove]').forEach(button=>{button.onclick=()=>{result.items.splice(Number(button.dataset.ggRemove),1);renderResult();save();};});
    }
    node.querySelector('#ggRecovery')?.addEventListener('click',()=>download(new Blob([recovery],{type:'application/json'}),'saeroth-generators-recovery.json'));
  }
  function download(blob,name){urls.forEach(URL.revokeObjectURL);const url=URL.createObjectURL(blob);urls=[url];const a=document.createElement('a');a.href=url;a.download=name;a.textContent='Save '+name;let node=host.querySelector('#ggDownloads');if(!node){node=document.createElement('div');node.id='ggDownloads';host.append(node);}node.replaceChildren(a);a.click();}
  async function exportResults(selected){if(busy)return;busy=true;const current=ticket;host.querySelector('#ggFields').disabled=true;
    try{const preparations=selected.map(p=>model.normalizePreparation(structuredClone(p)));const name=preparations.length===1?preparations[0].name:'Generated GM preparation';const value={format:'saeroth-session',version:3,name,createdAt:new Date().toISOString(),assets:[],actors:[],preparations,journal:{name,pages:preparations.map((p,i)=>({name:p.name,type:'text',sort:(i+1)*100000,text:{format:1,content:model.preparationHTML(p)}}))}};
      const bundle=await format.sealPackage(value);if(current!==ticket||!host)return;download(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),'saeroth-generated-preparation.json');status('Package ready. Preview it in Foundry’s Import Saeroth Session.');
    }catch(error){if(current===ticket)status(error.message,true);}finally{if(current===ticket&&host){busy=false;host.querySelector('#ggFields').disabled=false;}}
  }
  window.SaerothGenerators={mount,unmount};
  addEventListener('storage',event=>{if(event.key===key&&loaded){externalChange=true;status('Another tab changed generator results. This tab kept its results; export them before reloading.',true);}});
})();
