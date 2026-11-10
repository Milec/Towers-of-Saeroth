/* Coordinate the editable session's existing stores without changing campaign canon. */
(() => {
  'use strict';
  const clone = value => structuredClone(value);
  const TX_FORMAT = 'saeroth-session-switch';
  let base, transactionKey='', modelPromise, recoveryError='', pendingRaw='', applying=false, externalError='';
  const knownRaw=new Map();
  const storageKeys = pathname => ['saeroth-workspace-v1:','saeroth-session-actors-v1:','saeroth-encounter-v1:'].map(prefix=>prefix+pathname);
  function put(key,value) { if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value); }
  function readTransaction(raw,pathname) {
    if(raw.length>4*1024*1024)throw Error('The interrupted session record is too large.');
    const data=JSON.parse(raw),keys=storageKeys(pathname);
    // Journals written while battle maps existed carry a fourth entry for the retired selection; drop it.
    if(Array.isArray(data?.entries))data.entries=data.entries.filter(entry=>!(Array.isArray(entry)&&entry[0]==='saeroth-session-map-v1:'+pathname));
    if(data?.format!==TX_FORMAT||data.version!==1||!Array.isArray(data.entries)||data.entries.length!==keys.length)throw Error('The interrupted session record is invalid.');
    for(let i=0;i<keys.length;i++)if(!Array.isArray(data.entries[i])||data.entries[i].length!==2||data.entries[i][0]!==keys[i]||!(data.entries[i][1]===null||typeof data.entries[i][1]==='string'))throw Error('The interrupted session record has invalid storage paths.');
    return data.entries;
  }
  function rollback(entries) {
    // Free the newly written values first so quota failures cannot strand a half-switch.
    for(const [key]of entries)localStorage.removeItem(key);
    for(const [key,value]of entries)put(key,value);
  }
  async function recover(value) {
    base=new URL(value,location.href);transactionKey='saeroth-session-switch-v1:'+base.pathname;
    recoveryError='';pendingRaw='';externalError='';
    const restore=()=>{try {
      pendingRaw=localStorage.getItem(transactionKey)||'';
      if(pendingRaw){rollback(readTransaction(pendingRaw,base.pathname));localStorage.removeItem(transactionKey);pendingRaw='';}
      knownRaw.clear();for(const key of storageKeys(base.pathname))knownRaw.set(key,localStorage.getItem(key));
    } catch (_) { recoveryError=pendingRaw?'An interrupted session switch could not be recovered. The original recovery record is preserved. Download it before clearing browser data.':'Browser storage is unavailable. Download your current session before leaving; opening another saved session is unavailable until storage works.'; }};
    if(navigator.locks?.request){
      try{await navigator.locks.request(transactionKey,{mode:'exclusive'},restore);}
      catch(_){recoveryError='This browser could not lock session storage safely. Your existing preparation is preserved; reload or use a supported browser before opening another session.';}
    }
    else {
      // Without a shared lock, an existing journal may belong to a live tab.
      try {pendingRaw=localStorage.getItem(transactionKey)||'';}catch(_){}
      if(pendingRaw)recoveryError='This browser cannot safely recover an interrupted session switch. Open Saeroth in a browser with Web Locks support; the recovery record is preserved.';
      else restore();
    }
  }
  function initialValue(key){return knownRaw.has(key)?knownRaw.get(key):localStorage.getItem(key);}
  function recordWrite(key,value){knownRaw.set(key,value);}
  function conflict(){
    if(!externalError){externalError='Another tab changed the working preparation. This tab kept its own copy. Save it to Saved sessions or download it, then reload before opening or saving more changes to the working desk.';document.dispatchEvent(new CustomEvent('saeroth-session-conflict'));}
  }
  function assertWritable() {
    if(recoveryError)throw Error(recoveryError);
    if(externalError)throw Error(externalError);
    if(transactionKey&&!applying&&localStorage.getItem(transactionKey))throw Error('Another session switch is in progress. Try again after it finishes.');
    if(!applying&&[...knownRaw].some(([key,value])=>localStorage.getItem(key)!==value)){conflict();throw Error(externalError);}
  }
  function externalChange(event) {
    if(!base||applying||event.storageArea!==localStorage)return false;
    if(event.key!==null&&event.key!==transactionKey&&!storageKeys(base.pathname).includes(event.key))return false;
    // A multi-store switch emits separate events. Never assemble a partial
    // foreign snapshot or let an old tab persist its roster over the new one.
    conflict();
    return true;
  }
  function getModel() {
    if(!modelPromise)modelPromise=(async()=>{
      const [library,encounters]=await Promise.all([import(new URL('session-library-model.mjs',base)),import(new URL('encounter-plan.mjs',base))]);
      return library.createSessionModel({normalizeEncounter:encounters.normalizeEncounter});
    })().catch(error=>{modelPromise=null;throw error;});
    return modelPromise;
  }
  function snapshot() {
    return {version:1,desk:window.SaerothWorkspace.sessionSnapshot(),...window.SaerothSessionExport.sessionSnapshot(),encounter:window.SaerothEncounterPlanner.snapshot()};
  }
  async function capture() {
    await window.SaerothEncounterPlanner.capture();
    return (await getModel()).normalizeSnapshot(snapshot());
  }
  async function validate(value) { return (await getModel()).normalizeSnapshot(value); }
  function empty() {
    return {version:1,desk:{title:'Next session',notes:'',board:[],tasks:[]},actors:[],encounter:{encounter:{rulesProfile:'foundry-pf2e-8.5',name:'Planned encounter',partyLevel:2,partySize:5,target:'moderate',roster:[],placements:[]},staging:false,mapSignature:''}};
  }
  const busy=()=>applying||window.SaerothSessionExport?.isBusy()||window.SaerothEncounterPlanner?.isBusy();
  function entries(value) {
    return [...window.SaerothWorkspace.sessionEntries(value.desk),...window.SaerothSessionExport.sessionEntries(value),...window.SaerothEncounterPlanner.sessionEntries(value.encounter)];
  }
  function commit(value) {
    window.SaerothWorkspace.commitSession(value.desk);
    window.SaerothSessionExport.commitSession(value);
    window.SaerothEncounterPlanner.commitSession(value.encounter);
  }
  async function apply(value,{expectedCurrent,stillCurrent}={}) {
    const model=await getModel(),next=model.normalizeSnapshot(value);
    await window.SaerothEncounterPlanner.capture();
    if(!navigator.locks?.request)throw Error('Opening saved sessions needs a browser with Web Locks support. Your working preparation and saved versions were kept.');
    return navigator.locks.request(transactionKey,{mode:'exclusive'},()=>{
    assertWritable();if(busy())throw Error('Wait for the current export or encounter operation to finish.');
    if(stillCurrent&&!stillCurrent())throw Error('Opening the session was cancelled when the page changed. Your working preparation was kept.');
    const previous=model.normalizeSnapshot(snapshot());
    if(!expectedCurrent||!model.sameContent(previous,expectedCurrent))throw Error('The current preparation changed while this session was opening. Nothing was replaced; try again.');
    // Validate every adapter and capture old raw values before changing any store.
    const updates=entries(next),before=updates.map(([key])=>[key,localStorage.getItem(key)]);
    const journal=JSON.stringify({format:TX_FORMAT,version:1,entries:before});
    localStorage.setItem(transactionKey,journal);
    applying=true;
    try {
      for(const [key,data]of updates)put(key,data);
      commit(next);localStorage.removeItem(transactionKey);
      for(const [key,data]of updates)knownRaw.set(key,data);
    } catch(error) {
      try {rollback(before);commit(previous);localStorage.removeItem(transactionKey);for(const [key,data]of before)knownRaw.set(key,data);}
      catch(_){pendingRaw=journal;recoveryError='The session switch could not finish or restore browser storage. Your previous preparation is saved in the session library. Reload to retry recovery.';}
      throw Error(recoveryError||'This browser could not switch sessions. Your current preparation was kept and its saved version is in the library.');
    } finally {applying=false;}
    document.dispatchEvent(new CustomEvent('saeroth-session-change'));
    document.dispatchEvent(new CustomEvent('saeroth-workspace-change'));
    return clone(next);
    });
  }
  function configure(options) {
    base=new URL(options.base,location.href);modelPromise=null;
    window.SaerothSessionLibrary?.configure({base:base.href,getModel,capture,validate,apply,empty,busy,recovery:()=>({message:recoveryError||externalError,raw:pendingRaw})});
  }
  window.addEventListener('storage',externalChange);
  window.SaerothSessionPrep={recover,configure,capture,validate,apply,empty,busy,getModel,assertWritable,externalChange,recordWrite,initialValue};
})();
