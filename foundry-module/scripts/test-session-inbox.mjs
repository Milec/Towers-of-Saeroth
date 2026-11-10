import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {sealPackage,validatePackage,normalizePackage,LIMITS,documentIdentity} from './session-package.mjs';
import {createSessionInbox} from './session-inbox.mjs';
const require=createRequire(import.meta.url);
const {JSDOM}=require('../../tools/atlas-tests/node_modules/jsdom');
const MODULE='saeroth-pf2e-content';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const clone=structuredClone;
const sourceKey='campaign/npcs/Test Quartermaster.md';
function rawPackage() {
 // A stored native Foundry v14 scene stands in for the packaged map; its artwork reference becomes the package asset.
 const scene=JSON.parse(fs.readFileSync(new URL('../content/scenes/expedition-supply-recovery.json',import.meta.url),'utf8').split('modules/saeroth-pf2e-content/assets/maps/expedition-supply-recovery.webp').join('asset:map'));
 return {format:'saeroth-session',version:1,name:'Expedition arrival',createdAt:'2026-11-06T22:00:00Z',assets:[{id:'map',name:'Camp artwork',mime:'image/png',data:png}],scene,journal:{name:'Expedition arrival',ownership:{default:3},pages:[{name:'Preparation',type:'text',text:{format:1,content:'<h1>Arrival</h1><p>Camp notes <a href="https://example.com/note">source</a>.</p><img src="asset:map" alt="Mountain camp">'}}]},actors:[{key:sourceKey,name:'Test Quartermaster'}]};
}
const coreUuid='Compendium.pf2e.monster-core.Actor.orcveteran000001';
function encounterPackage({staged=true}={}) {
 const raw=rawPackage();raw.version=2;raw.scene.walls=[];
 raw.encounter={name:'Survey yard recovery',partyLevel:2,partySize:5,target:'moderate',roster:[
  {id:'commander',name:'Orc Commander',level:2,count:1,width:1,height:1,source:{type:'campaign',key:sourceKey}},
  {id:'veteran',name:'Orc Veteran',level:1,count:2,width:1,height:1,source:{type:'compendium',uuid:coreUuid}}
 ],placements:staged?[{entryId:'commander',instance:0,x:100,y:100},{entryId:'veteran',instance:0,x:300,y:100},{entryId:'veteran',instance:1,x:500,y:100}]:[]};
 return raw;
}
function addCorePack(h) {
 const actor=new h.classes.Actor({_id:'orcveteran000001',name:'Orc Veteran',type:'npc',img:'icons/svg/mystery-man.svg',flags:{},system:{details:{level:{value:1}},attributes:{hp:{value:20,max:20}}},prototypeToken:{width:1,height:1,actorLink:true,hidden:false,disposition:1,texture:{src:'icons/svg/mystery-man.svg'}},items:[]});
 h.env.game.packs.set('pf2e.monster-core',{documentName:'Actor',getDocument:async id=>id===actor.id?actor:null});return actor;
}
function harness(options={}) {
 const collections={Actor:new Map(),JournalEntry:new Map(),Scene:new Map(),Token:new Map()},calls={create:[],delete:[],upload:[],validation:[],decode:0,browse:0,tokenParents:[]},failures={...options};let sequence=0;
 class Doc {
  constructor(type,data){this.documentName=type;this.data=clone(data);this.id=data._id;this.uuid=type+'.'+this.id;}
  get flags(){return this.data.flags??{};}get name(){return this.data.name;}get type(){return this.data.type;}
  get system(){return this.data.system;}get level(){return this.data.system?.details?.level?.value;}get prototypeToken(){return this.data.prototypeToken;}get img(){return this.data.img;}get _stats(){return this.data._stats;}
  get tokens(){return this.data.tokens??[];}
  async getTokenDocument(overrides,context){calls.tokenParents.push(context.parent);const data={...clone(this.data.prototypeToken??{}),...clone(overrides),delta:{}};if(failures.tokenDimensions)data.width=failures.tokenDimensions;return new classes.Token(data);}
  toObject(){return clone(this.data);}
  validate(){calls.validation.push(this.documentName);if(failures.invalidSchema===this.documentName)throw Error('Invalid native schema.');return true;}
  async update(changes){if(failures.delayedUpdate)await new Promise(resolve=>setImmediate(resolve));if(failures.updateFails)throw Error('Update rejected.');for(const [key,value]of Object.entries(changes)){const parts=key.split('.');let at=this.data;for(const part of parts.slice(0,-1))at=at[part]??={};at[parts.at(-1)]=clone(value);}if(failures.lostCompletionReply&&changes[`flags.${MODULE}.sessionInbox.state`]==='complete')throw Error('Lost completion reply.');return this;}
  async delete(){calls.delete.push(this.uuid);if(failures.deleteFails===this.documentName)throw Error('Delete rejected.');collections[this.documentName].delete(this.id);return this;}
 }
 const classes={};for(const type of Object.keys(collections))classes[type]=class extends Doc {
  constructor(data){super(type,data);}
  static async create(data){calls.create.push({type,data:clone(data)});await new Promise(resolve=>setImmediate(resolve));if(failures.beforeCreate)await failures.beforeCreate(type,data);if(failures.editActorDuringScene&&type==='Scene'){const actor=[...collections.Actor.values()][0];actor.data.name='GM edited actor';throw Error('Scene rejected after another GM edit.');}if(failures.createFails===type)throw Error('Creation rejected.');if(collections[type].has(data._id))throw Error('Duplicate ID.');const doc=new classes[type](data);collections[type].set(doc.id,doc);if(failures.lostReply===type)throw Error('Lost create reply.');return doc;}
 };
 const packActor=new classes.Actor({_id:'packactor0000001',name:'Test Quartermaster',type:'npc',ownership:{default:3},flags:{saeroth:{source:sourceKey}},system:{details:{level:{value:2}},attributes:{hp:{value:50,max:50}}},prototypeToken:{width:1,height:1,depth:1,texture:{src:'modules/saeroth-pf2e-content/assets/actors/test.png'}},items:[]});
 const picker={
  browse:async()=>{calls.browse++;if(failures.browseFails)throw Error('Browse rejected.');return {dirs:['worlds/test-world/saeroth-sessions']};},
  createDirectory:async()=>{},
  upload:async(_source,folder,file)=>{calls.upload.push({folder,name:file.name});if(failures.uploadFails)throw Error('Upload rejected.');return failures.badUpload?{path:'../outside.png'}:{path:folder+'/'+file.name};}
 };
 const env={
  File,DOMParser:new JSDOM('').window.DOMParser,CONFIG:Object.fromEntries(Object.entries(classes).map(([k,v])=>[k,{documentClass:v}])),
  game:{user:{isGM:options.gm!==false},system:{id:options.system??'pf2e'},version:options.version??'14.367',world:{id:'test-world'},actors:collections.Actor,journal:collections.JournalEntry,scenes:collections.Scene,settings:{get:(_scope,key)=>key==='proficiencyVariant'&&!!failures.pwol},packs:new Map(options.missingActor?[]:[['saeroth-pf2e-content.saeroth-actors',{getDocuments:async()=>[packActor]}]])},
  foundry:{
   utils:{randomID:()=>String(++sequence).padStart(24,'0'),isNewerVersion:(a,b)=>{const aa=a.split('.').map(Number),bb=b.split('.').map(Number);return aa[0]>bb[0]||aa[0]===bb[0]&&aa[1]>bb[1];}},
   applications:{apps:{FilePicker:{implementation:picker}}},
   canvas:{loadTexture:async()=>({valid:!failures.badTexture,width:failures.textureSize??3200,height:3200})}
  },
  createImageBitmap:async()=>{calls.decode++;if(failures.decodeFails)throw Error('Invalid pixels.');return {width:failures.imageSize??3200,height:3200,close(){}};}
 };
 const api=createSessionInbox(env);return {api,env,calls,collections,classes,failures,packActor,second:()=>createSessionInbox(env)};
}

test('portable package identity is stable, tamper evident and bounded',async()=>{
 const source=rawPackage(),sealed=await sealPackage(source);assert.match(sealed.id,/^[a-f0-9]{64}$/);assert.deepEqual(await validatePackage(sealed),sealed);
 assert.equal((await sealPackage({...source,createdAt:'2026-11-07T01:00:00Z'})).id,sealed.id);assert.equal(sealed.journal.ownership.default,0);assert.equal(sealed.scene.active,false);assert.equal(sealed.scene.navigation,false);
 await assert.rejects(validatePackage({...sealed,name:'Changed'}),/changed/);
 for(const alter of [p=>p.version=2,p=>p.assets[0].id='../../bad',p=>p.assets[0].mime='image/svg+xml',p=>p.assets[0].data='ABCD',p=>p.scene.walls[0].c[0]=-1,p=>p.scene.initialLevel='missing',p=>p.scene.tokens=[{actorId:'bad'}],p=>p.actors[0].key='campaign/../secret.md',p=>p.journal.pages[0].text.content='<script>alert(1)</script>',p=>p.journal.pages[0].text.content='<img src="https://outside.test/picture.png">',p=>p.journal.pages[0].text.content='<img src="asset:unknown">',p=>p.actors=Array.from({length:51},()=>p.actors[0])]){const data=rawPackage();alter(data);assert.throws(()=>normalizePackage(data));}
 const polluted=JSON.parse(JSON.stringify(source).replace('"format":','"__proto__":{"polluted":true},"format":'));assert.throws(()=>normalizePackage(polluted),/Unsafe/);assert.equal({}.polluted,undefined);
});
test('preview is read only and import creates validated GM content with embedded art',async()=>{
 const h=harness(),bundle=await sealPackage(rawPackage());const preview=await h.api.preview(bundle);assert.equal(preview.pages.length,1);assert.equal(preview.actors.length,1);assert.equal(preview.scene.walls,bundle.scene.walls.length);assert.equal(h.calls.create.length,0);assert.equal(h.calls.upload.length,0);assert.deepEqual(new Set(h.calls.validation),new Set(['Scene','Actor','JournalEntry']));
 const result=await h.api.import(bundle);assert.equal(result.created.length,3);assert.equal(h.calls.upload.length,1);assert.equal(h.collections.Scene.size,1);assert.equal(h.collections.Actor.size,1);assert.equal(h.collections.JournalEntry.size,1);
 const journal=[...h.collections.JournalEntry.values()][0],scene=[...h.collections.Scene.values()][0],actor=[...h.collections.Actor.values()][0];
 assert.equal(journal.data.ownership.default,0);assert.equal(journal.flags[MODULE].sessionInbox.state,'complete');assert(journal.data.pages[0].text.content.includes('worlds/test-world/saeroth-sessions/'));assert(!journal.data.pages[0].text.content.includes('asset:'));
 assert.equal(scene.data.levels[0].background.src,scene.data.thumb);assert.equal(scene.data.active,false);assert.equal(scene.data.navigation,false);assert.equal(scene.data.tokens.length,0);
 assert.equal(actor.data.ownership.default,0);assert.equal(actor.flags[MODULE].syncKey,sourceKey);assert.equal(actor.flags.saeroth,undefined);assert.equal(actor.data.prototypeToken.depth,undefined);assert.equal(h.packActor.data.ownership.default,3);
 const before=JSON.stringify([...h.collections.JournalEntry.values()].map(d=>d.toObject()));const duplicate=await h.api.import(bundle);assert.equal(duplicate.duplicate,true);assert.equal(h.calls.create.length,3);assert.equal(h.calls.upload.length,1);assert.equal(JSON.stringify([...h.collections.JournalEntry.values()].map(d=>d.toObject())),before);
});
test('completed preview retains original NPC names without reading packs or restoring deleted actors',async()=>{
 const h=harness(),raw=rawPackage();raw.actors.push({key:'campaign/npcs/Surveyor.md',name:'Test Surveyor'},{key:'campaign/npcs/Correspondent.md',name:'Test Correspondent'});
 h.env.game.packs.set(`${MODULE}.saeroth-actors`,{getDocuments:async()=>raw.actors.map(ref=>new h.classes.Actor({...h.packActor.toObject(),name:ref.name,flags:{saeroth:{source:ref.key}}}))});
 const bundle=await sealPackage(raw);await h.api.import(bundle);assert.equal(h.collections.Actor.size,3);h.collections.Actor.clear();
 h.env.game.packs.set(`${MODULE}.saeroth-actors`,{getDocuments:async()=>{throw Error('Completed imports must not reopen packs.');}});
 const before=h.calls.create.length,preview=await h.api.preview(bundle);assert.equal(preview.complete,true);assert.equal(preview.actors.length,3);assert.deepEqual(preview.actors.map(a=>a.name),raw.actors.map(a=>a.name));assert(preview.actors.every(a=>a.originalImport));
 const duplicate=await h.api.import(bundle);assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.actors,preview.actors);assert.equal(h.calls.create.length,before);assert.equal(h.collections.Actor.size,0);
});

test('existing actors and edited imported documents remain untouched',async()=>{
 const h=harness(),bundle=await sealPackage(rawPackage());const actor=new h.classes.Actor({_id:'existingactor001',name:'Quartermaster current',type:'npc',ownership:{default:2},flags:{saeroth:{source:sourceKey}},system:{attributes:{hp:{value:2,max:50}}}});h.collections.Actor.set(actor.id,actor);const before=JSON.stringify(actor.toObject());
 assert.equal((await h.api.preview(bundle)).actors[0].reuse,true);await h.api.import(bundle);assert.equal(h.collections.Actor.size,1);assert.equal(JSON.stringify(actor.toObject()),before);
 const journal=[...h.collections.JournalEntry.values()][0];journal.data.pages[0].text.content='GM later edit';await h.api.import(bundle);assert.equal(journal.data.pages[0].text.content,'GM later edit');
});
test('newer live-synced NPC wins over installed pack snapshot',async()=>{
 const h=harness(),bundle=await sealPackage(rawPackage());const synced=new h.classes.Actor({...h.packActor.toObject(),name:'Updated quartermaster'});h.env.game.packs.set('world.saeroth-synced-creatures',{getDocuments:async()=>[synced]});await h.api.import(bundle);assert.equal([...h.collections.Actor.values()][0].name,'Updated quartermaster');
});
test('permissions, missing actors, native schema and asset errors block writes',async()=>{
 const bundle=await sealPackage(rawPackage());
 for(const options of [{gm:false},{system:'dnd5e'},{version:'13.350'},{version:'14.352'},{missingActor:true},{invalidSchema:'Scene'},{imageSize:2300},{decodeFails:true},{browseFails:true},{uploadFails:true},{badUpload:true},{badTexture:true},{textureSize:1200}]){
  const h=harness(options);await assert.rejects(h.api.import(bundle));assert.equal(h.calls.create.length,0,JSON.stringify(options));assert.equal(h.collections.Scene.size,0);
 }
 const h=harness();const id=await documentIdentity(bundle.id,'journal');h.collections.JournalEntry.set(id,new h.classes.JournalEntry({_id:id,name:'Unrelated',flags:{}}));await assert.rejects(h.api.import(bundle),/different journal/);assert.equal(h.calls.upload.length,0);
});
test('creation failure and lost replies roll back only newly created documents',async()=>{
 const bundle=await sealPackage(rawPackage());
 for(const options of [{createFails:'Actor'},{createFails:'Scene'},{lostReply:'JournalEntry'},{lostReply:'Actor'},{lostReply:'Scene'}]){
  const h=harness(options);await assert.rejects(h.api.import(bundle));for(const c of Object.values(h.collections))assert.equal(c.size,0,JSON.stringify(options));assert.equal(h.packActor.data.name,'Test Quartermaster');
  delete h.failures.createFails;delete h.failures.lostReply;await h.api.import(bundle);assert.equal(h.collections.Scene.size,1);assert.equal(h.collections.Actor.size,1);
 }
 const h=harness({createFails:'Scene',deleteFails:'Actor'});await assert.rejects(h.api.import(bundle),error=>error.remainingDocuments.length===1&&error.message.includes('Cleanup'));assert.equal(h.collections.Actor.size,1);delete h.failures.createFails;delete h.failures.deleteFails;await h.api.import(bundle);assert.equal(h.collections.Actor.size,1);
});
test('same-browser and cross-client imports do not duplicate documents',async()=>{
 const bundle=await sealPackage(rawPackage());
 for(const crossClient of [false,true]){
  const h=harness();const second=crossClient?h.second():h.api;const results=await Promise.allSettled([h.api.import(bundle),second.import(bundle)]);assert(results.some(r=>r.status==='fulfilled'));assert.equal(h.collections.JournalEntry.size,1);assert.equal(h.collections.Actor.size,1);assert.equal(h.collections.Scene.size,1);assert.equal([...h.collections.JournalEntry.values()][0].flags[MODULE].sessionInbox.state,'complete');
 }
});
test('journal HTML attributes are parsed before use and cannot execute package text',async()=>{
 const p=rawPackage();p.journal.pages[0].text.content='<p style="position:fixed" data-action="delete">Safe <a href="jav&#97;script:alert(1)">link</a><img src="asset:map" srcset="https://outside.test/track 2x"></p>';
 const h=harness();await h.api.import(await sealPackage(p));const html=[...h.collections.JournalEntry.values()][0].data.pages[0].text.content;assert(!html.includes('javascript'));assert(!html.includes('srcset'));assert(!html.includes('data-action'));assert(!html.includes('style='));assert(html.includes('Safe'));
});
test('stale partial import resumes explicitly and preserves existing notes',async()=>{
 const bundle=await sealPackage(rawPackage()),h=harness();await h.api.import(bundle);const journal=[...h.collections.JournalEntry.values()][0];journal.flags[MODULE].sessionInbox.state='pending';journal.flags[MODULE].sessionInbox.startedAt=Date.now();h.collections.Scene.clear();journal.data.pages[0].text.content='<p>Preserved edit</p>';
 await assert.rejects(h.api.import(bundle),/interrupted or active/);assert.equal((await h.api.preview(bundle)).canResume,false);await assert.rejects(h.api.import(bundle,{resume:true}),/still active/);
 journal.flags[MODULE].sessionInbox.startedAt=Date.now()-6*60*1000;assert.equal((await h.api.preview(bundle)).canResume,true);await h.api.import(bundle,{resume:true});assert.equal(h.collections.Scene.size,1);assert.equal(journal.data.pages[0].text.content,'<p>Preserved edit</p>');assert.equal(journal.flags[MODULE].sessionInbox.state,'complete');assert.equal(h.calls.upload.length,1);
});
test('rollback keeps intervening GM edits and completion-reply loss is recovered',async()=>{
 const bundle=await sealPackage(rawPackage()),h=harness({editActorDuringScene:true});
 await assert.rejects(h.api.import(bundle),error=>error.remainingDocuments.length===1);assert.equal(h.collections.Actor.size,1);assert.equal([...h.collections.Actor.values()][0].name,'GM edited actor');assert.equal(h.collections.JournalEntry.size,0);
 const recovered=harness({lostCompletionReply:true});const result=await recovered.api.import(bundle);assert.equal(result.recovered,true);assert.equal(recovered.collections.Scene.size,1);assert.equal(recovered.collections.JournalEntry.size,1);assert.equal(recovered.calls.delete.length,0);
});
test('concurrent recovery claims cannot roll back content adopted by the winner',async()=>{
 const bundle=await sealPackage(rawPackage()),h=harness();await h.api.import(bundle);const journal=[...h.collections.JournalEntry.values()][0];journal.flags[MODULE].sessionInbox.state='pending';journal.flags[MODULE].sessionInbox.startedAt=Date.now()-6*60*1000;h.collections.Scene.clear();h.collections.Actor.clear();h.failures.delayedUpdate=true;
 const outcomes=await Promise.allSettled([h.api.import(bundle,{resume:true}),h.second().import(bundle,{resume:true})]);assert(outcomes.some(r=>r.status==='fulfilled'));assert.equal(h.collections.Scene.size,1);assert.equal(h.collections.Actor.size,1);assert.equal(h.collections.JournalEntry.size,1);assert.equal(journal.flags[MODULE].sessionInbox.state,'complete');
});
test('failed session cannot delete an actor adopted by a different completed session',async()=>{
 const first=await sealPackage(rawPackage()),second=await sealPackage({...rawPackage(),name:'Another session',scene:null});const h=harness();let release,entered;
 const blocked=new Promise(resolve=>entered=resolve),continueFirst=new Promise(resolve=>release=resolve);
 h.failures.beforeCreate=async type=>{if(type==='Scene'){entered();await continueFirst;throw Error('First scene rejected.');}};
 const failed=h.api.import(first).catch(error=>error);await blocked;await h.second().import(second);assert.equal(h.collections.Actor.size,1);release();const error=await failed;assert(error instanceof Error);assert.equal(error.remainingDocuments.length,1);assert.equal(h.collections.Actor.size,1);
 const completed=[...h.collections.JournalEntry.values()].find(j=>j.flags[MODULE].sessionInbox.bundleId===second.id);assert.equal(completed.flags[MODULE].sessionInbox.state,'complete');
});
test('v2 stages native hidden opponents, appends a roster, and preserves their compendium',async()=>{
 const h=harness(),source=addCorePack(h),sourceBefore=JSON.stringify(source.toObject()),bundle=await sealPackage(encounterPackage());
 const preview=await h.api.preview(bundle);assert.equal(preview.actors.length,2);assert.equal(preview.pages.length,2);assert.equal(preview.encounter.totalXP,100);assert.equal(preview.encounter.awardXP,80);assert.equal(preview.encounter.tokens,3);assert.equal(h.calls.create.length,0);assert.equal(h.calls.upload.length,0);assert(h.calls.validation.includes('Token'));
 const result=await h.api.import(bundle);assert.equal(result.created.length,4);assert.equal(result.actorsReused,0);assert.equal(h.collections.Actor.size,2);assert.equal(h.collections.Token.size,0,'Tokens are created atomically inside the new scene, never as loose world documents');
 const scene=[...h.collections.Scene.values()][0],journal=[...h.collections.JournalEntry.values()][0];assert.equal(scene.data.active,false);assert.equal(scene.data.navigation,false);assert.equal(scene.data.tokens.length,3);
 assert.equal(journal.data.pages.length,2);assert.match(journal.data.pages[1].text.content,/100 XP/);assert.match(journal.data.pages[1].text.content,/80 XP/);assert.match(journal.data.pages[1].text.content,/No combat is created or started/);
 assert.equal(journal.flags[MODULE].sessionInbox.actorKeys.length,2);assert(journal.flags[MODULE].sessionInbox.actorKeys.includes(coreUuid));
 const tokenIds=new Set();for(const token of scene.data.tokens){assert.equal(token.hidden,true);assert.equal(token.actorLink,false);assert.equal(token.disposition,-1);assert.equal(token.level,scene.data.initialLevel);assert.equal(token.depth,1);assert(h.collections.Actor.has(token.actorId));assert.match(token._id,/^[a-zA-Z0-9]{16}$/);tokenIds.add(token._id);}
 assert.equal(tokenIds.size,3);assert(h.calls.tokenParents.every(p=>p.documentName==='Scene'&&p.data.active===false));assert.equal(JSON.stringify(source.toObject()),sourceBefore);
 const copies=[...h.collections.Actor.values()],core=copies.find(a=>a.flags[MODULE].source===coreUuid);assert.equal(core.flags.core.sourceId,coreUuid);assert.equal(core.data.ownership.default,0);
 const before=h.calls.create.length;scene.data.tokens.pop();await h.api.import(bundle);assert.equal(h.calls.create.length,before);assert.equal(scene.data.tokens.length,2,'Completed import does not restore a GM-deleted token');
 h.collections.Actor.clear();h.env.game.packs.clear();assert.equal((await h.api.preview(bundle)).actors.length,2,'Completed preview does not resolve deleted sheets');
});

test('v2 roster-only imports sheets without tokens or combat and reuses core-source world actors',async()=>{
 const h=harness(),source=addCorePack(h),raw=encounterPackage({staged:false});raw.scene=null;raw.assets=[];raw.journal.pages[0].text.content='<p>Notes only</p>';
 const existing=new h.classes.Actor({...source.toObject(),_id:'existingCore0001',_stats:{compendiumSource:coreUuid},system:{details:{level:{value:1}},attributes:{hp:{value:1,max:20}}},ownership:{default:2}});h.collections.Actor.set(existing.id,existing);const before=JSON.stringify(existing.toObject());
 const bundle=await sealPackage(raw),preview=await h.api.preview(bundle);assert.equal(preview.encounter.tokens,0);assert(preview.actors.find(a=>a.key===coreUuid).reuse);await h.api.import(bundle);assert.equal(h.collections.Scene.size,0);assert.equal(h.collections.Actor.size,2);assert.equal(JSON.stringify(existing.toObject()),before);assert.equal(h.calls.upload.length,0);
 const journal=[...h.collections.JournalEntry.values()][0];assert.match(journal.data.pages[1].text.content,/Roster only/);
});

test('v2 incompatible sources, native footprints and rule variants block all writes',async()=>{
 const bundle=await sealPackage(encounterPackage());
 for(const failure of ['missingCore','wrongType','changedLevel','changedSize','preparedSize','pwol']){
  const h=harness(),source=addCorePack(h);
  if(failure==='missingCore')h.env.game.packs.delete('pf2e.monster-core');if(failure==='wrongType')source.data.type='character';if(failure==='changedLevel')source.data.system.details.level.value=2;if(failure==='changedSize')source.data.prototypeToken.width=2;if(failure==='preparedSize')h.failures.tokenDimensions=2;if(failure==='pwol')h.failures.pwol=true;
  await assert.rejects(h.api.import(bundle),undefined,failure);assert.equal(h.calls.create.length,0,failure);assert.equal(h.calls.upload.length,0,failure);
 }
});

test('v2 unbudgeted rosters stay explicitly unbudgeted and generated journal text is escaped',async()=>{
 const h=harness(),raw=encounterPackage({staged:false});addCorePack(h);raw.encounter.partyLevel=10;raw.encounter.name='Guard <script>alert(1)</script> & friend';raw.encounter.roster[0].name='Commander <img src="https://outside.test">';
 const bundle=await sealPackage(raw),preview=await h.api.preview(bundle);assert.equal(preview.encounter.budgeted,false);assert.equal(preview.encounter.totalXP,null);await h.api.import(bundle);
 const html=[...h.collections.JournalEntry.values()][0].data.pages.at(-1).text.content;assert.match(html,/Unbudgeted/);assert(!/<script>|<img src="https/.test(html));assert.match(html,/&lt;script&gt;/);assert(!html.includes('null XP'));assert(!html.includes('Estimated award'));
});

test('v2 lost scene replies and failed staging roll back only this import, then retry cleanly',async()=>{
 const bundle=await sealPackage(encounterPackage());
 for(const failure of [{lostReply:'Scene'},{createFails:'Scene'},{lostReply:'Actor'}]){
  const h=harness(failure);addCorePack(h);await assert.rejects(h.api.import(bundle));for(const docs of Object.values(h.collections))assert.equal(docs.size,0);
  delete h.failures.lostReply;delete h.failures.createFails;await h.api.import(bundle);assert.equal([...h.collections.Scene.values()][0].tokens.length,3);assert.equal(h.collections.Actor.size,2);
 }
 const h=harness({lostCompletionReply:true});addCorePack(h);assert.equal((await h.api.import(bundle)).recovered,true);assert.equal([...h.collections.Scene.values()][0].tokens.length,3);assert.equal(h.calls.delete.length,0);
});

test('v2 catches an intervening world sheet edit and retains the GM edit during rollback',async()=>{
 const h=harness(),source=addCorePack(h),bundle=await sealPackage(encounterPackage());let edited=false;
 h.failures.beforeCreate=type=>{if(type==='Actor'&&!edited&&h.collections.Actor.size){edited=true;const actor=[...h.collections.Actor.values()][0];actor.data.system.details.level.value=12;}};
 await assert.rejects(h.api.import(bundle),/level 12/);assert.equal(h.collections.Scene.size,0);assert.equal(h.collections.JournalEntry.size,0);assert.equal(h.collections.Actor.size,1);assert.equal([...h.collections.Actor.values()][0].level,12);assert.equal(source.level,1);
});

test('v2 concurrent imports deduplicate core actors and retain tokens when completion wins',async()=>{
 const h=harness(),bundle=await sealPackage(encounterPackage());addCorePack(h);
 const outcomes=await Promise.allSettled([h.api.import(bundle),h.second().import(bundle)]);assert(outcomes.some(r=>r.status==='fulfilled'));assert.equal(h.collections.Actor.size,2);assert.equal(h.collections.Scene.size,1);assert.equal(h.collections.JournalEntry.size,1);assert.equal([...h.collections.Scene.values()][0].tokens.length,3);
 const journal=[...h.collections.JournalEntry.values()][0];journal.flags[MODULE].sessionInbox.state='failed';h.collections.Scene.clear();h.failures.delayedUpdate=true;
 const resumed=await Promise.allSettled([h.api.import(bundle,{resume:true}),h.second().import(bundle,{resume:true})]);assert(resumed.some(r=>r.status==='fulfilled'));assert.equal(h.collections.Actor.size,2);assert.equal([...h.collections.Scene.values()][0].tokens.length,3);
});

test('v2 rollback preserves a core actor adopted by a different completed session',async()=>{
 const first=await sealPackage(encounterPackage()),other=encounterPackage({staged:false});other.name='Another encounter packet';other.scene=null;other.assets=[];other.journal.pages[0].text.content='<p>Other notes</p>';const second=await sealPackage(other),h=harness();addCorePack(h);let release,entered;
 const blocked=new Promise(resolve=>entered=resolve),continueFirst=new Promise(resolve=>release=resolve);
 h.failures.beforeCreate=async type=>{if(type==='Scene'){entered();await continueFirst;throw Error('First scene rejected.');}};
 const failed=h.api.import(first).catch(error=>error);await blocked;await h.second().import(second);assert.equal(h.collections.Actor.size,2);release();const error=await failed;assert.equal(error.remainingDocuments.length,2);assert.equal(h.collections.Actor.size,2);assert.equal(h.collections.Scene.size,0);
});

test('installed Foundry validates the native scene and journal schemas in memory',async t=>{
 const app=process.env.FOUNDRY_APP_PATH||path.join(process.env.LOCALAPPDATA||'','Programs/Foundry Virtual Tabletop/resources/app');
 if(!fs.existsSync(path.join(app,'common/documents/scene.mjs'))){t.skip('Local Foundry classes are not installed.');return;}
 const load=file=>import(pathToFileURL(path.join(app,file)));
 globalThis.CONST=await load('common/constants.mjs');globalThis.CONFIG={compatibility:{mode:CONST.COMPATIBILITY_MODES.SILENT}};globalThis.game={version:'14.367',release:{version:'14.367'},system:{id:'pf2e',version:null,documentTypes:{},grid:{type:1,distance:5,units:'ft'}},modules:new Map(),model:{},i18n:{localize:x=>x,format:x=>x}};
 await load('common/primitives/_module.mjs');globalThis.foundry={utils:await load('common/utils/_module.mjs')};foundry.abstract=await load('common/abstract/_module.mjs');foundry.documents=await load('common/documents/_module.mjs');foundry.data={...await load('common/data/data.mjs'),fields:await load('common/data/fields.mjs')};
 for(const cls of Object.values(foundry.documents)){if(!cls.metadata?.name)continue;CONFIG[cls.metadata.name]={documentClass:cls,dataModels:{}};game.model[cls.metadata.name]=Object.fromEntries((cls.metadata.coreTypes||['base']).map(t=>[t,{}]));}
 const bundle=await sealPackage(rawPackage());const scene=clone(bundle.scene);scene.levels[0].background.src='worlds/test/art.webp';scene.thumb=scene.levels[0].background.src;
 const s=new foundry.documents.BaseScene(scene,{strict:true});assert.equal(s.validate({strict:true}),true);assert.equal(s.walls.size,scene.walls.length);assert.equal(s.initialLevel.background.src,scene.thumb);
 const j=new foundry.documents.BaseJournalEntry(bundle.journal,{strict:true});assert.equal(j.validate({strict:true}),true);assert.equal(j.pages.size,1);
 const h=harness();addCorePack(h);await h.api.import(await sealPackage(encounterPackage()));
 const staged=[...h.collections.Scene.values()][0].toObject(),nativeScene=new foundry.documents.BaseScene(staged,{strict:true});assert.equal(nativeScene.validate({strict:true}),true);assert.equal(nativeScene.tokens.size,3);for(const token of nativeScene.tokens){assert.equal(token.level,staged.initialLevel);assert.equal(token.hidden,true);assert.equal(token.actorLink,false);assert.equal(token.disposition,-1);}
 const rosterJournal=new foundry.documents.BaseJournalEntry([...h.collections.JournalEntry.values()][0].toObject(),{strict:true});assert.equal(rosterJournal.validate({strict:true}),true);assert.equal(rosterJournal.pages.size,2);
});
