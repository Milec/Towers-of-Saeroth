import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TARGETS,RULES_PROFILE,ENCOUNTER_LIMITS,normalizeEncounter,sourceKey,calculateCreatureXP,encounterBudget,calculateEncounter} from './encounter-plan.mjs';
import {normalizePackage,sealPackage,validatePackage,documentIdentity,ENCOUNTER_VERSION} from './session-package.mjs';

const copy=structuredClone;
const source={type:'compendium',uuid:'Compendium.pf2e.pathfinder-monster-core.Actor.Abcdefgh12345678'};
function row(overrides={}) {return {id:'orc',name:'Orc veteran',level:1,count:2,width:1,height:1,source:copy(source),...overrides};}
function plan(overrides={}) {return {name:'Mountain bandits',partyLevel:2,partySize:5,target:'moderate',roster:[row()],placements:[],...overrides};}
function scene(walls=[]) {return {width:800,height:800,grid:{type:1,size:100},walls};}
function wall(c,extra={}) {return {c,move:20,door:0,ds:0,...extra};}
function packageFixture() {return {format:'saeroth-session',version:1,name:'Contract fixture',createdAt:'2026-11-07T00:00:00Z',assets:[],scene:null,journal:{name:'Contract fixture',pages:[{name:'Plan',type:'text',text:{format:1,content:'<p>Keep this stable.</p>'}}]},actors:[]};}

test('published creature costs and Foundry party-size budgets match the verified tables',()=>{
  assert.deepEqual(Array.from({length:9},(_,i)=>calculateCreatureXP(i+1,5)),[10,15,20,30,40,60,80,120,160]);
  assert.equal(calculateCreatureXP(-1,3),10);assert.equal(calculateCreatureXP(-1,4),null);assert.equal(calculateCreatureXP(25,20),null);
  assert.deepEqual(TARGETS.map(t=>encounterBudget(t,4)),[40,60,80,120,160]);
  assert.deepEqual(TARGETS.map(t=>encounterBudget(t,5)),[50,75,100,150,200]);
  assert.deepEqual(TARGETS.map(t=>encounterBudget(t,6)),[60,90,120,180,240]);
  assert.equal(encounterBudget('low',1),15,'Explicit Foundry profile avoids the printed GM Core solo Low=0 result');
  for(const args of [[NaN,2],[0,0],[26,2],[2.5,2],[2,21]])assert.throws(()=>calculateCreatureXP(...args));
  for(const args of [['high',5],['low',0],['low',1.5],['low',13]])assert.throws(()=>encounterBudget(...args));
});

test('award estimates are party-adjusted once and do not divide an award among players',()=>{
  const p=plan({roster:[row({level:2,count:2}),row({id:'scout',name:'Scout',level:0,count:1,source:{type:'campaign',key:'campaign/npcs/Scout.md'}})]});
  const result=calculateEncounter(p);assert.equal(result.totalXP,100);assert.equal(result.budget,100);assert.equal(result.remainingXP,0);
  assert.equal(result.estimatedAwardXP,80);assert.equal(result.awardXP,80);assert.equal(result.difficulty.label,'Moderate');assert.equal(result.rulesProfile,RULES_PROFILE);
  const odd=calculateEncounter(plan({partySize:3,roster:[row({count:1,level:0})]}));assert.equal(odd.estimatedAwardXP,80/3);assert.equal(odd.awardXP,26);
  const oldSix=calculateEncounter(plan({partySize:6,roster:[row({count:3,level:2})]}));assert.equal(oldSix.budget,120);assert.equal(oldSix.awardXP,80);
});

test('difficulty reports thresholds, gaps and out-of-table rows without false precision',()=>{
  assert.equal(calculateEncounter(plan({roster:[]})).difficulty.kind,'empty');
  assert.equal(calculateEncounter(plan({roster:[row({count:1,level:-1})]})).difficulty.kind,'below');
  const between=calculateEncounter(plan());assert.equal(between.totalXP,60);assert.deepEqual(between.difficulty,{kind:'between',lower:'trivial',upper:'low',label:'Between trivial and low'});
  const over=calculateEncounter(plan({roster:[row({level:6,count:2})]}));assert.equal(over.totalXP,320);assert.equal(over.difficulty.kind,'above');assert.equal(over.remainingXP,-220);
  const unknown=calculateEncounter(plan({roster:[row(),row({id:'dragon',name:'Ancient dragon',level:20,source:{type:'campaign',key:'campaign/world/bestiary/Ancient dragon.md'}})]}));
  assert.equal(unknown.knownXP,60);assert.equal(unknown.totalXP,null);assert.equal(unknown.remainingXP,null);assert.equal(unknown.awardXP,null);assert.equal(unknown.estimatedAwardXP,null);assert.equal(unknown.budgeted,false);
  assert.deepEqual(unknown.unbudgeted,[{id:'dragon',name:'Ancient dragon',level:20,delta:18}]);assert.equal(unknown.difficulty.kind,'unknown');
});

test('source references stay confined to campaign notes or PF2e Actor packs',()=>{
  assert.equal(sourceKey(source),source.uuid);assert.equal(sourceKey({type:'campaign',key:'campaign/npcs/John Guard.md'}),'campaign/npcs/John Guard.md');
  for(const bad of [null,[],{type:'world',uuid:'Actor.Abcdefgh12345678'},{type:'compendium',uuid:'Compendium.other.pack.Actor.Abcdefgh12345678'},{type:'compendium',uuid:'Compendium.pf2e.pack.Macro.Abcdefgh12345678'},{type:'compendium',uuid:'Compendium.pf2e.pack.Actor.bad'},{type:'compendium',uuid:'Compendium.pf2e.pack.Actor.Abcdefgh12345678.Item.Abcdefgh12345678'},...['vault/Bestiary/Orc.md','campaign/../secret.md','campaign/npcs\\Orc.md','campaign/npcs/Orc.md?raw=1','campaign//Orc.md','campaign/./Orc.md'].map(key=>({type:'campaign',key}))])assert.throws(()=>sourceKey(bad));
});

test('rosters are bounded and unambiguous, and carry an explicit rules profile',()=>{
  assert.equal(normalizeEncounter(plan()).rulesProfile,RULES_PROFILE);
  assert.equal(normalizeEncounter(plan({roster:[]})).roster.length,0,'An empty draft is valid before package export');
  const alters=[p=>p.rulesProfile='proficiency-without-level',p=>p.partyLevel=0,p=>p.partySize=13,p=>p.target='lethal',p=>p.name='<bad>\0',p=>p.roster[0].level=2.5,p=>p.roster[0].count=0,p=>p.roster[0].count=41,p=>p.roster[0].width=.25,p=>p.roster[0].height=8.5,p=>p.roster[0].id='../bad',p=>p.roster.push(copy(p.roster[0])),p=>p.roster.push({...copy(p.roster[0]),id:'duplicate-source'}),p=>p.roster=Array.from({length:21},(_,i)=>row({id:'row-'+i,source:{type:'campaign',key:'campaign/npcs/Creature '+i+'.md'}})),p=>p.roster=[row({count:21}),row({id:'second',count:20,source:{type:'campaign',key:'campaign/npcs/Other.md'}})]];
  for(const alter of alters){const p=plan();alter(p);assert.throws(()=>normalizeEncounter(p));}
  assert.throws(()=>normalizeEncounter(JSON.parse('{"__proto__":{},"name":"x"}')),/Unsafe/);
  assert.equal(normalizeEncounter(plan({roster:[row({count:ENCOUNTER_LIMITS.maxUnits,width:.5,height:.5})]})).roster[0].count,40);
});

test('map staging requires all instances while draft placement can be partial',()=>{
  const p=plan({placements:[{entryId:'orc',instance:0,x:0,y:0}]});
  assert.throws(()=>normalizeEncounter(p,scene()),/every opponent/);
  assert.equal(normalizeEncounter(p,scene(),{allowPartialPlacements:true}).placements.length,1);
  assert.throws(()=>normalizeEncounter(p,null,{allowPartialPlacements:true}),/battle map/);
  p.placements.push({entryId:'orc',instance:1,x:100,y:0});assert.equal(normalizeEncounter(p,scene()).placements.length,2);
  for(const change of [a=>a[1].instance=0,a=>a[1].instance=2,a=>a[1].entryId='missing',a=>a[1].x=50,a=>a[1].x=NaN,a=>a[1].x=-100,a=>a[1].x=800,a=>a[1].y=800,a=>a[1].x=0]){const bad=copy(p);change(bad.placements);assert.throws(()=>normalizeEncounter(bad,scene()));}
  const large=plan({roster:[row({count:1,width:2,height:2})],placements:[{entryId:'orc',instance:0,x:700,y:0}]});assert.throws(()=>normalizeEncounter(large,scene()),/outside/);
  const twoLarge=plan({roster:[row({width:2})],placements:[{entryId:'orc',instance:0,x:0,y:0},{entryId:'orc',instance:1,x:100,y:0}]});assert.throws(()=>normalizeEncounter(twoLarge,scene()),/overlaps/);
});

test('footprints cannot cross walls, but boundary edges and open doors remain usable',()=>{
  const p=plan({roster:[row({count:1})],placements:[{entryId:'orc',instance:0,x:100,y:100}]});
  for(const c of [[150,0,150,300],[0,150,300,150],[50,50,250,250],[150,150,300,300],[0,0,150,150]])assert.throws(()=>normalizeEncounter(p,scene([wall(c)])),/wall/);
  for(const c of [[100,100,200,100],[100,100,100,200],[0,200,200,0],[0,0,100,100],[200,100,200,200]])assert.equal(normalizeEncounter(p,scene([wall(c)])).placements.length,1);
  assert.equal(normalizeEncounter(p,scene([wall([150,0,150,300],{move:0})])).placements.length,1);
  assert.equal(normalizeEncounter(p,scene([wall([150,0,150,300],{door:1,ds:1})])).placements.length,1);
  assert.throws(()=>normalizeEncounter(p,scene([wall([150,0,150,300],{door:1,ds:0})])),/wall/);
  assert.throws(()=>normalizeEncounter(p,{...scene(),grid:{type:0,size:100}}),/square/);
  assert.throws(()=>normalizeEncounter(p,scene([wall([NaN,0,150,300])])),/coordinates/);
});

test('legacy package digests and document IDs are unchanged',async()=>{
  const bundle=await sealPackage(packageFixture());
  assert.equal(bundle.id,'0aa6bb039292f09dd7089dc6cc92ac5128f7eda57eb31bc9d4d19b41652b06ad');
  assert.equal(await documentIdentity(bundle.id,'journal'),'1ced54d30ec980ec');assert.equal(Object.hasOwn(bundle,'encounter'),false);
  assert.deepEqual(await validatePackage(bundle),bundle);
  for(const encounter of [null,plan()])assert.throws(()=>normalizePackage({...packageFixture(),encounter}),/version 2/);
});

test('v2 packages bind the complete roster and party assumptions to their identity',async()=>{
  const raw={...packageFixture(),version:ENCOUNTER_VERSION,encounter:plan()},sealed=await sealPackage(raw);
  assert.equal(sealed.version,2);assert.equal(sealed.encounter.rulesProfile,RULES_PROFILE);assert.deepEqual(await validatePackage(sealed),sealed);
  for(const change of [p=>p.encounter.partySize=6,p=>p.encounter.roster[0].count=3,p=>p.encounter.roster[0].level=2,p=>p.encounter.target='low']){const changed=copy(sealed);change(changed);await assert.rejects(validatePackage(changed),/changed/);}
  assert.equal((await sealPackage({...raw,createdAt:'2026-11-08T00:00:00Z'})).id,sealed.id);
  for(const bad of [{...raw,encounter:undefined},{...raw,encounter:plan({roster:[]})},{...raw,version:3}])assert.throws(()=>normalizePackage(bad));
  const excessive={...raw,actors:Array.from({length:50},(_,i)=>({key:'campaign/npcs/NPC '+i+'.md',name:'NPC '+i}))};assert.throws(()=>normalizePackage(excessive),/50 different actors/);
  const fullJournal=copy(raw);fullJournal.journal.pages=Array.from({length:100},()=>copy(raw.journal.pages[0]));assert.throws(()=>normalizePackage(fullJournal),/99 journal pages/);
  fullJournal.journal.pages.pop();assert.equal(normalizePackage(fullJournal).journal.pages.length,99);
});
