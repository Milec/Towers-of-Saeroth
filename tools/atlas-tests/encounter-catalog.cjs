const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
(async()=>{
 const root=path.resolve(__dirname,'../..');
 const {normalizeEncounter,calculateEncounter,sourceKey}=await import(pathToFileURL(path.join(root,'foundry-module/scripts/encounter-plan.mjs')));
 const data=JSON.parse(fs.readFileSync(path.join(root,'site/encounter-creatures.json'),'utf8'));
 assert.equal(data.schema,1);assert.equal(data.system.id,'pf2e');assert.equal(data.system.version,'8.5.0');
 assert.equal(data.packs.length,7);assert(data.creatures.length>1500&&data.creatures.length<3000);
 const ids=new Set(),refs=new Set(),packs=new Set(data.packs.map(p=>p.id));
 for(const row of data.creatures){
  const encounter=normalizeEncounter({name:'Catalog validation',partyLevel:2,partySize:5,target:'moderate',roster:[{...row,count:1}],placements:[]});
  assert.equal(encounter.roster[0].name,row.name);
  assert(!ids.has(row.id));ids.add(row.id);
  const key=sourceKey(row.source);assert(!refs.has(key));refs.add(key);
  assert(packs.has(row.source.uuid.split('.')[2]));
  assert(Array.isArray(row.traits)&&row.traits.every(t=>typeof t==='string'&&/^[a-z0-9-]+$/.test(t)));
  assert.equal(row.book,data.packs.find(p=>p.id===row.source.uuid.split('.')[2]).name);
  assert(!Object.hasOwn(row,'system')&&!Object.hasOwn(row,'items')&&!Object.hasOwn(row,'img'),'Catalog holds metadata, not actor documents or artwork');
 }
 const preset=JSON.parse(fs.readFileSync(path.join(root,'site/session-presets.json'),'utf8')).presets.find(p=>p.id==='expedition-arrival-v1');
 const encounter=normalizeEncounter(preset.encounter);
 for(const row of encounter.roster){const source=data.creatures.find(c=>sourceKey(c.source)===sourceKey(row.source));assert(source,'Preset must resolve in shipped catalog');for(const field of ['name','level','width','height'])assert.equal(row[field],source[field]);}
 const math=calculateEncounter(encounter);assert.equal(encounter.partySize,5);assert.equal(math.totalXP,100);assert.equal(math.budget,100);assert.equal(math.awardXP,80);
 const quest=fs.readFileSync(path.join(root,'campaign/quests/The Missing Survey Stores.md'),'utf8');
 assert(quest.includes('moderate for five level-2 PCs'));assert(quest.includes('**100 XP**'));assert(!quest.includes('| Orc Scrapper |'));
 console.log(`Encounter catalog: ${data.creatures.length} native PF2e references and five-player expedition preset validated.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
