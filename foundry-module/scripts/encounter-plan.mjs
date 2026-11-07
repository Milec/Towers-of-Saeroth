/** Shared, data-only encounter planning for the website and Foundry importer. */
export const RULES_PROFILE = 'foundry-pf2e-8.5';
export const RULES_SOURCES = Object.freeze({
  foundry: 'https://github.com/foundryvtt/pf2e/blob/pf2e-8.5.0/src/scripts/macros/xp/index.ts',
  gmCore: 'https://2e.aonprd.com/Rules.aspx?ID=2716'
});
// Deliberately match the installed PF2e 8.5 standard-proficiency calculation:
// Low scales by 15 XP per PC. The current GM Core table instead prints 20.
// This is an explicit Foundry convention, not an undocumented erratum to it.
// Unlike Foundry's macro, out-of-table level differences are left unbudgeted.
export const TARGETS = Object.freeze(['trivial','low','moderate','severe','extreme']);
export const ENCOUNTER_LIMITS = Object.freeze({maxEntries:20,maxUnits:40,minPartyLevel:1,maxPartyLevel:20,minPartySize:1,maxPartySize:12,minCreatureLevel:-1,maxCreatureLevel:25,maxFootprint:8});
const perCharacter = Object.freeze({trivial:10,low:15,moderate:20,severe:30,extreme:40});
const costs = Object.freeze([10,15,20,30,40,60,80,120,160]);
const title = value => value[0].toUpperCase()+value.slice(1);

function object(value,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(`${label} must be an object.`);
  if(Object.keys(value).some(key=>['__proto__','prototype','constructor'].includes(key)))throw Error(`Unsafe key in ${label}.`);
  return value;
}
function text(value,label,max=160) {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw Error(`Invalid ${label}.`);
  return value.trim();
}
function finite(value,label,min,max) {
  if(!Number.isFinite(value)||value<min||value>max)throw Error(`Invalid ${label}.`);return value;
}
function integer(value,label,min,max) {
  finite(value,label,min,max);if(!Number.isInteger(value))throw Error(`${label} must be a whole number.`);return value;
}
function list(value,label,max) {
  if(!Array.isArray(value)||value.length>max)throw Error(`${label} must contain at most ${max} entries.`);return value;
}
function footprint(value,label) {
  finite(value,label,.5,ENCOUNTER_LIMITS.maxFootprint);if(!Number.isInteger(value*2))throw Error(`${label} must use half-square increments.`);return value;
}
function sourceFrom(source) {
  object(source,'Creature source');
  if(source.type==='campaign'){
    const key=text(source.key,'campaign source',500);
    if(!key.startsWith('campaign/')||!key.endsWith('.md')||key.includes('\\')||key.split('/').some(s=>!s||s==='.'||s==='..')||/[?#\x00-\x1f]/.test(key))throw Error('Creature source must be a campaign note path.');
    return {type:'campaign',key};
  }
  if(source.type==='compendium'){
    const uuid=text(source.uuid,'PF2e compendium source',180);
    if(!/^Compendium\.pf2e\.[a-z0-9][a-z0-9-]*\.Actor\.[a-zA-Z0-9]{16}$/.test(uuid))throw Error('Creature source must be a PF2e Actor compendium UUID.');
    return {type:'compendium',uuid};
  }
  throw Error('Choose a campaign creature or a PF2e Actor compendium source.');
}
export function sourceKey(source) {const ref=sourceFrom(source);return ref.type==='campaign'?ref.key:ref.uuid;}

/** A boundary wall may touch a footprint; it may not pass through its interior. */
function crossesInterior(c,rect) {
  const epsilon=1e-7;
  const min=[rect.x+epsilon,rect.y+epsilon],max=[rect.x+rect.width-epsilon,rect.y+rect.height-epsilon];
  let enter=0,exit=1;
  for(let axis=0;axis<2;axis++){
    const origin=c[axis],delta=c[axis+2]-origin;
    if(Math.abs(delta)<epsilon){if(origin<min[axis]||origin>max[axis])return false;continue;}
    const a=(min[axis]-origin)/delta,b=(max[axis]-origin)/delta;
    enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));if(enter>exit)return false;
  }
  return enter<=exit;
}
function placementScene(scene) {
  object(scene,'Placement scene');object(scene.grid,'Placement grid');
  const width=integer(scene.width,'scene width',800,6400),height=integer(scene.height,'scene height',800,6400);
  const size=integer(scene.grid.size,'grid size',50,200);
  if(scene.grid.type!==1||width%size||height%size)throw Error('Opponent placement requires a square grid aligned with the map.');
  const walls=list(scene.walls??[],'Placement walls',2000).map(wall=>{
    object(wall,'Placement wall');
    if(!Array.isArray(wall.c)||wall.c.length!==4||!wall.c.every((v,i)=>Number.isFinite(v)&&v>=0&&v<=(i%2?height:width)))throw Error('Invalid placement wall coordinates.');
    if(![0,10,20].includes(wall.move))throw Error('Invalid placement wall movement.');
    return wall;
  }).filter(wall=>wall.move>0&&!(wall.door>0&&wall.ds===1));
  return {width,height,size,walls};
}

/** Partial placements are accepted only for in-progress editor drafts. Exports use the strict default. */
export function normalizeEncounter(value,scene=null,{allowPartialPlacements=false}={}) {
  object(value,'Encounter');
  if(value.rulesProfile!==undefined&&value.rulesProfile!==RULES_PROFILE)throw Error('Unsupported encounter rules profile.');
  const name=text(value.name,'encounter name');
  const partyLevel=integer(value.partyLevel,'party level',1,20),partySize=integer(value.partySize,'party size',1,12);
  if(!TARGETS.includes(value.target))throw Error('Choose a valid encounter target.');
  const ids=new Set(),sources=new Set();let units=0;
  const roster=list(value.roster,'Encounter roster',ENCOUNTER_LIMITS.maxEntries).map(entry=>{
    object(entry,'Creature row');const id=text(entry.id,'roster ID',64);
    if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)||ids.has(id))throw Error('Encounter roster IDs must be unique lower-case identifiers.');ids.add(id);
    const source=sourceFrom(entry.source),key=sourceKey(source);
    if(sources.has(key))throw Error('Each creature source can appear only once; increase its quantity instead.');sources.add(key);
    const count=integer(entry.count,'creature quantity',1,ENCOUNTER_LIMITS.maxUnits);units+=count;
    if(units>ENCOUNTER_LIMITS.maxUnits)throw Error(`An encounter can contain at most ${ENCOUNTER_LIMITS.maxUnits} opponents.`);
    return {id,name:text(entry.name,'creature name'),level:integer(entry.level,'creature level',-1,25),count,width:footprint(entry.width,'token width'),height:footprint(entry.height,'token height'),source};
  });
  const input=list(value.placements??[],'Opponent placements',ENCOUNTER_LIMITS.maxUnits);
  if(input.length&&!scene)throw Error('Choose a battle map before placing opponents.');
  if(input.length&&!allowPartialPlacements&&input.length!==units)throw Error('Place every opponent, or clear placements to export the roster alone.');
  const geometry=input.length?placementScene(scene):null,seen=new Set(),rectangles=[];
  const placements=input.map(placement=>{
    object(placement,'Opponent placement');const entryId=text(placement.entryId,'placement roster ID',64);
    const entry=roster.find(row=>row.id===entryId);if(!entry)throw Error('A placement refers to a missing creature row.');
    const instance=integer(placement.instance,'opponent instance',0,entry.count-1),key=entryId+':'+instance;
    if(seen.has(key))throw Error('An opponent has more than one placement.');seen.add(key);
    const x=finite(placement.x,'opponent x',0,geometry.width),y=finite(placement.y,'opponent y',0,geometry.height);
    if(x%geometry.size||y%geometry.size)throw Error('Opponent positions must align with the map grid.');
    const rect={x,y,width:entry.width*geometry.size,height:entry.height*geometry.size};
    if(x+rect.width>geometry.width||y+rect.height>geometry.height)throw Error(`${entry.name} extends outside the map.`);
    if(rectangles.some(r=>x<r.x+r.width&&x+rect.width>r.x&&y<r.y+r.height&&y+rect.height>r.y))throw Error(`${entry.name} overlaps another opponent.`);
    if(geometry.walls.some(wall=>crossesInterior(wall.c,rect)))throw Error(`${entry.name} crosses a movement-blocking wall.`);
    rectangles.push(rect);return {entryId,instance,x,y};
  });
  return {rulesProfile:RULES_PROFILE,name,partyLevel,partySize,target:value.target,roster,placements};
}

export function calculateCreatureXP(level,partyLevel) {
  integer(level,'creature level',-1,25);integer(partyLevel,'party level',1,20);
  const delta=level-partyLevel;return delta>=-4&&delta<=4?costs[delta+4]:null;
}
export function encounterBudget(target,partySize) {
  if(!TARGETS.includes(target))throw Error('Choose a valid encounter target.');integer(partySize,'party size',1,12);return perCharacter[target]*partySize;
}
function difficultyFor(total,thresholds) {
  if(total===null)return {kind:'unknown',lower:null,upper:null,label:'Unbudgeted creatures'};
  if(total===0)return {kind:'empty',lower:null,upper:null,label:'No opponents'};
  const exact=thresholds.find(t=>t.xp===total);if(exact)return {kind:'exact',lower:exact.target,upper:exact.target,label:title(exact.target)};
  const lower=thresholds.filter(t=>t.xp<total).at(-1),upper=thresholds.find(t=>t.xp>total);
  if(!lower)return {kind:'below',lower:null,upper:'trivial',label:'Below trivial budget'};
  if(!upper)return {kind:'above',lower:'extreme',upper:null,label:'Above extreme budget'};
  return {kind:'between',lower:lower.target,upper:upper.target,label:`Between ${lower.target} and ${upper.target}`};
}
/** Budget estimates use standard proficiency, one party level, and creatures only. No XP is granted. */
export function calculateEncounter(value) {
  // Calculations deliberately ignore placements; in-progress drafts can still be budgeted.
  const encounter=normalizeEncounter({...value,placements:[]});
  const thresholds=TARGETS.map(target=>({target,xp:encounterBudget(target,encounter.partySize)}));
  const rows=encounter.roster.map(row=>{const xp=calculateCreatureXP(row.level,encounter.partyLevel);return {id:row.id,delta:row.level-encounter.partyLevel,xp,totalXP:xp===null?null:xp*row.count,count:row.count};});
  const unbudgeted=rows.filter(row=>row.xp===null).map(row=>{const entry=encounter.roster.find(e=>e.id===row.id);return {id:row.id,name:entry.name,level:entry.level,delta:row.delta};});
  const knownXP=rows.reduce((sum,row)=>sum+(row.totalXP??0),0),budgeted=unbudgeted.length===0,totalXP=budgeted?knownXP:null;
  const budget=encounterBudget(encounter.target,encounter.partySize),estimatedAwardXP=budgeted?totalXP*4/encounter.partySize:null;
  return {rulesProfile:RULES_PROFILE,totalXP,knownXP,budget,remainingXP:budgeted?budget-totalXP:null,estimatedAwardXP,awardXP:budgeted?Math.floor(estimatedAwardXP):null,budgeted,unbudgeted,difficulty:difficultyFor(totalXP,thresholds),rows,thresholds};
}
