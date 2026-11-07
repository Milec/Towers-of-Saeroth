/* Data boundaries and native IndexedDB concurrency/recovery for saved sessions. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const clone=value=>structuredClone(value);
const time='2026-11-07T01:00:00.000Z';
let assertions=0;
const check=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++;};
const rejects=(fn,pattern)=>{assert.throws(fn,pattern);assertions++;};

(async()=>{
  const {createSessionModel,LIMITS}=await import(pathToFileURL(path.join(root,'site/session-library-model.mjs')));
  const {normalizeEncounter}=await import(pathToFileURL(path.join(root,'foundry-module/scripts/encounter-plan.mjs')));
  const engine=require('../../site/atlas/battlemap-engine.js');
  const foundry=require('../../site/atlas/battlemap-foundry.js');
  const sceneForMap=map=>foundry.scene(engine.generate({...map.recipe,name:map.name}),{backgroundPath:'asset:fixture'});
  const model=createSessionModel({normalizeEncounter,sceneForMap});
  const empty=model.normalizeSnapshot({version:1,desk:{title:'Session 6',notes:'Keep the camp secret.\n\nA second paragraph.',tasks:[{id:'task-1',text:'Review the route',done:false}],board:['campaign/npcs/John Guard.md','vault/Rules/Travel.md']},actors:[{key:'campaign/npcs/John Guard.md',name:'John Guard'}],map:null,encounter:null});
  const map={version:1,name:'Mountain road',recipe:{version:1,generatorVersion:1,source:{type:'poi',id:2},kind:'road',terrain:'mountain',size:24,time:'day',seed:'library-fixture'}};
  const encounter={name:'Road patrol',partyLevel:2,partySize:5,target:'moderate',roster:[{id:'guard',name:'John Guard',level:3,count:2,width:1,height:1,source:{type:'campaign',key:'campaign/npcs/John Guard.md'}}],placements:[]};
  const full={...clone(empty),map,encounter:{encounter,staging:true,mapSignature:JSON.stringify(map)}};
  // Select an actually legal generated-map position, preserving a partial draft.
  const scene=sceneForMap(map);let valid;
  for(let y=0;y<scene.height&&!valid;y+=100)for(let x=0;x<scene.width&&!valid;x+=100){
    try{normalizeEncounter({...encounter,placements:[{entryId:'guard',instance:0,x,y}]},scene,{allowPartialPlacements:true});valid={entryId:'guard',instance:0,x,y};}catch(_){}
  }
  assert(valid);full.encounter.encounter.placements=[valid];
  check(model.normalizeSnapshot(empty),empty);
  check(model.normalizeSnapshot({...empty,encounter:null}),empty);check(empty.encounter.encounter.partySize,5);
  const normalized=model.normalizeSnapshot(full);check(normalized.encounter.encounter.placements,[valid]);check(normalized.encounter.encounter.rulesProfile,'foundry-pf2e-8.5');
  check(model.sameContent(full,{...clone(normalized),unused:'metadata'}),true);
  check(model.sameContent(empty,{...clone(empty),desk:{...empty.desk,notes:'different'}}),false);
  check(model.normalizeSnapshot({...clone(empty),token:'never copied'}).token,undefined);
  const create=model.saveRecord(model.emptyLibrary(),full,{id:'one',now:time});check(create.created,true);check(create.library.revision,1);check(create.record.revision,0);
  check(model.saveRecord(create.library,normalized,{id:'two',now:time}).created,false);
  check(model.saveRecord(create.library,normalized,{id:'two',now:time}).library,create.library);
  const duplicate=model.duplicateRecord(create.library,'one',{newId:'two',now:time});check(duplicate.record.snapshot.desk.title,'Session 6 (copy)');check(duplicate.library.records.length,2);
  check(create.library.records.length,1);check(create.record.snapshot.desk.title,'Session 6');
  const archived=model.setArchived(duplicate.library,'one',true,{now:'2026-11-07T02:00:00.000Z'});check(archived.record.archived,true);check(archived.record.revision,1);
  const restored=model.setArchived(archived.library,'one',false,{now:time});check(restored.record.updatedAt,'2026-11-07T02:00:00.000Z');check(restored.record.snapshot,create.record.snapshot);
  check(model.setArchived(restored.library,'one',false,{now:time}).changed,false);
  const backup=model.exportBackup(archived.library.records,{now:time});check(backup.format,'saeroth-saved-sessions');
  let next=0;const imported=model.importBackup(model.emptyLibrary(),backup,{idFactory:()=>`import-${++next}`,now:time});
  check(imported.created,2);check(imported.library.records.map(record=>record.id),['import-1','import-2']);check(imported.library.records[0].archived,true);
  const repeated=model.importBackup(imported.library,backup,{idFactory:()=>`import-${++next}`,now:time});check(repeated.created,0);check(repeated.skipped,2);check(repeated.library,imported.library);
  const sameForeignId=model.exportBackup([{...create.record,snapshot:empty}],{now:time});
  const conflictImport=model.importBackup(create.library,sameForeignId,{idFactory:()=> 'new-local',now:time});check(conflictImport.created,1);check(conflictImport.library.records[0],create.record);
  check(model.importBackup(model.emptyLibrary(),model.exportBackup([create.record],{now:time}),{idFactory:()=> 'new',now:time}).library.records[0].snapshot,create.record.snapshot);
  rejects(()=>model.normalizeSnapshot({...empty,version:2}),/version/);
  rejects(()=>model.normalizeSnapshot({...empty,desk:{...empty.desk,notes:'a'.repeat(LIMITS.notes+1)}}),/scratchpad/);
  rejects(()=>model.normalizeSnapshot({...empty,desk:{...empty.desk,board:['campaign/../secret.md']}}),/path/);
  rejects(()=>model.normalizeSnapshot({...empty,desk:{...empty.desk,board:['https://evil.test/note.md']}}),/path/);
  rejects(()=>model.normalizeSnapshot({...empty,desk:{...empty.desk,tasks:[empty.desk.tasks[0],empty.desk.tasks[0]]}}),/duplicates/);
  rejects(()=>model.normalizeSnapshot({...empty,actors:[empty.actors[0],empty.actors[0]]}),/duplicates/);
  rejects(()=>model.normalizeSnapshot({...empty,actors:[{key:'vault/Rules/Travel.md',name:'Bad source'}]}),/source/);
  rejects(()=>model.normalizeSnapshot({...full,map:{...map,recipe:{...map.recipe,generatorVersion:2}}}),/version/);
  rejects(()=>model.normalizeSnapshot({...full,encounter:{...full.encounter,mapSignature:'wrong'}}),/different map/);
  rejects(()=>model.normalizeSnapshot({...full,encounter:{...full.encounter,staging:false}}),/roster-only/);
  rejects(()=>model.normalizeSnapshot({...full,encounter:{...full.encounter,encounter:{...encounter,placements:[valid,{...valid,instance:1}]}}}),/overlaps/);
  rejects(()=>model.normalizeSnapshot({...full,encounter:{...full.encounter,encounter:{...encounter,placements:[{...valid,x:999999}]}}}),/opponent x/);
  rejects(()=>model.normalizeSnapshot({...full,map:null,encounter:{...full.encounter,mapSignature:''}}),/needs a battle map/);
  rejects(()=>createSessionModel({normalizeEncounter}).normalizeSnapshot(full),/not ready/);
  rejects(()=>createSessionModel().normalizeSnapshot(full),/not ready/);
  rejects(()=>model.normalizeSnapshot(JSON.parse('{"version":1,"__proto__":{"polluted":true}}')),/Unsafe/);
  rejects(()=>model.normalizeSnapshot({...empty,desk:Object.create({title:'inherited'})}),/object/);
  const accessor={...empty};Object.defineProperty(accessor,'danger',{get(){throw Error('getter was invoked');},enumerable:true});rejects(()=>model.normalizeSnapshot(accessor),/Unsafe/);
  rejects(()=>model.saveRecord(create.library,empty,{id:'one',now:time}),/already in use/);
  rejects(()=>model.duplicateRecord(create.library,'missing',{newId:'new',now:time}),/no longer exists/);
  rejects(()=>model.normalizeLibrary({...create.library,records:[create.record,create.record]}),/duplicates/);
  rejects(()=>model.normalizeLibrary({...create.library,revision:Infinity}),/revision/);
  rejects(()=>model.normalizeLibrary({...create.library,version:9}),/version/);
  rejects(()=>model.normalizeRecord({...create.record,createdAt:'invalid'}),/time/);
  rejects(()=>model.normalizeRecord({...create.record,updatedAt:'2026-01-01T00:00:00.000Z'}),/before/);
  rejects(()=>model.normalizeBackup({format:'saeroth-session-package',version:1}),/Foundry/);
  rejects(()=>model.normalizeBackup({...backup,records:[]}),/empty/);
  rejects(()=>model.importBackup(create.library,sameForeignId,{idFactory:()=> 'one',now:time}),/collided/);
  const crowded=model.normalizeLibrary({version:1,revision:1,records:Array.from({length:LIMITS.records},(_,i)=>({...model.createRecord(empty,{id:`saved-${i}`,now:time}),snapshot:{...clone(empty),desk:{...empty.desk,title:`Session ${i}`}}}))});
  rejects(()=>model.saveRecord(crowded,full,{id:'overflow',now:time}),/at most 200/);check(crowded.records.length,200);
  const huge=clone(empty);huge.desk.notes='🙂'.repeat(20000);
  const bigRecords=Array.from({length:110},(_,i)=>model.createRecord(huge,{id:`huge-${i}`,now:time}));
  rejects(()=>model.normalizeLibrary({version:1,revision:0,records:bigRecords}),/8 MiB/);
  rejects(()=>model.exportBackup(bigRecords.slice(0,30),{now:time}),/2 MiB/);
  check({}.polluted,undefined);
  console.log(`Session library model: ${assertions} assertions passed.`);

  if(!process.argv.includes('--browser'))return;
  const {chromium}=require('playwright');
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try{
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
    await page.route('https://session-library.test/**',async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Session library storage checks</title>'});
      if(pathname==='/encounter-plan.mjs')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'foundry-module/scripts/encounter-plan.mjs'),'utf8')});
      if(!['/session-library-model.mjs','/session-library-store.mjs'].includes(pathname))return route.abort();
      return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'site',pathname.slice(1)),'utf8')});
    });
    await page.goto('https://session-library.test/');
    const result=await page.evaluate(async({snapshot,time})=>{
      const {createSessionModel}=await import('./session-library-model.mjs'),{createSessionStore}=await import('./session-library-store.mjs'),{normalizeEncounter}=await import('./encounter-plan.mjs');
      const model=createSessionModel({normalizeEncounter}),name='saeroth-native-test-'+crypto.randomUUID(),a=createSessionStore({name,model}),b=createSessionStore({name,model});
      const results=[];
      const assert=(condition,label)=>{if(!condition)throw Error(label);results.push(label);};
      const initial=await a.read();assert(initial.revision===0&&initial.records.length===0,'Empty store is preserved as empty');
      const first=model.saveRecord(initial,snapshot,{id:'first',now:time}).library,second=model.saveRecord(initial,{...snapshot,desk:{...snapshot.desk,title:'Another tab'}},{id:'second',now:time}).library;
      const concurrent=await Promise.allSettled([a.write(first,{expectedRevision:0}),b.write(second,{expectedRevision:0})]);
      assert(concurrent.filter(r=>r.status==='fulfilled').length===1,'One simultaneous revision wins');
      assert(concurrent.find(r=>r.status==='rejected').reason.code==='CONFLICT','Other writer receives conflict');
      const saved=await b.read();assert(saved.records.length===1&&saved.revision===1,'Conflict did not clobber data');
      const updated=model.setArchived(saved,saved.records[0].id,true,{now:time}).library;await b.write(updated,{expectedRevision:1});
      assert((await a.read()).records[0].archived,'Committed archive visible to other connection');
      let invalid;
      try{await a.write(updated,{expectedRevision:1});}catch(error){invalid=error.code;}
      assert(invalid==='CONFLICT','Stale save is rejected');
      a.close();b.close();
      const reopened=createSessionStore({name,model});assert((await reopened.read()).revision===2,'Persistence survives closing and reopening');reopened.close();
      const raw={version:99,revision:2,records:[{privateNote:'Preserve me'}]};
      await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('library','readwrite');tx.objectStore('library').put(raw,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
      const damaged=createSessionStore({name,model});let recoveryCode;
      try{await damaged.read();}catch(error){recoveryCode=error.code;}
      assert(recoveryCode==='UNREADABLE','Unknown stored version blocks ordinary reads');
      assert(JSON.stringify(await damaged.readRaw())===JSON.stringify(raw),'Raw recovery retains unknown data');
      let writeCode;try{await damaged.write(first,{expectedRevision:0});}catch(error){writeCode=error.code;}
      assert(writeCode==='UNREADABLE','Writes cannot reset an unreadable library');
      assert(JSON.stringify(await damaged.readRaw())===JSON.stringify(raw),'Rejected overwrite leaves raw data intact');damaged.close();
      let unavailable;try{await createSessionStore({name:'unavailable',model,indexedDB:null}).read();}catch(error){unavailable=error.code;}
      assert(unavailable==='UNAVAILABLE','Unavailable storage produces a clear failure');
      const closed=createSessionStore({name:'close-pending-'+crypto.randomUUID(),model});const pending=closed.read();closed.close();let closedCode;try{await pending;}catch(error){closedCode=error.code;}
      assert(closedCode==='UNAVAILABLE','Closing a pending database does not leak an open connection');
      return results;
    },{snapshot:empty,time});
    check(result.length,13);console.log(`Native IndexedDB: ${result.length} concurrency, persistence, and recovery assertions passed.`);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
