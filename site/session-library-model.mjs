/** Portable, data-only snapshots of editable session preparation. */
export const LIMITS = Object.freeze({records:200,fileBytes:2*1024*1024,libraryBytes:8*1024*1024,notes:40000,board:60,tasks:100,actors:50});
export const BACKUP_FORMAT = 'saeroth-saved-sessions';
const unsafe = new Set(['__proto__','prototype','constructor']);
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function object(value,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(`${label} must be an object.`);
  if(Object.entries(Object.getOwnPropertyDescriptors(value)).some(([key,descriptor])=>unsafe.has(key)||descriptor.get||descriptor.set))throw Error(`Unsafe property in ${label}.`);
  return value;
}
function text(value,label,max,{empty=false,multiline=false}={}) {
  if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||(multiline?/\x00/:/[\x00-\x1f\x7f]/).test(value))throw Error(`Invalid ${label}.`);
  return value;
}
function list(value,label,max) {
  if(!Array.isArray(value)||value.length>max)throw Error(`${label} must contain at most ${max} entries.`);
  return value;
}
function identifier(value,label='session ID') {
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value))throw Error(`Invalid ${label}.`);
  return value;
}
function revision(value,label) {
  if(!Number.isSafeInteger(value)||value<0||value===Number.MAX_SAFE_INTEGER)throw Error(`Invalid ${label} revision.`);
  return value;
}
function timestamp(value,label) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw Error(`Invalid ${label}.`);
  return value;
}
function path(value,actor=false) {
  text(value,actor?'NPC source':'reference path',499);
  if(!(actor?/^campaign\/[^?#]+\.md$/i:/^(campaign|vault)\/[^?#]+\.md$/i).test(value)||value.includes('\\')||value.split('/').some(part=>!part||part==='.'||part==='..'))throw Error(`Invalid ${actor?'NPC source':'reference path'}.`);
  return value;
}
function unique(values,label) {if(new Set(values).size!==values.length)throw Error(`${label} contains duplicates.`);}
function size(value,limit,label) {if(bytes(value)>limit)throw Error(`${label} exceeds the ${limit/(1024*1024)} MiB limit.`);return value;}
function nowValue(now) {return timestamp(now??new Date().toISOString(),'save time');}

/** Dependencies reuse the installed encounter contract. */
export function createSessionModel({normalizeEncounter}={}) {
  function normalizeSnapshot(value) {
    object(value,'Session preparation');if(value.version!==1)throw Error('Unsupported editable session version.');
    const desk=object(value.desk,'Session desk');
    const board=list(desk.board,'Reference packet',LIMITS.board).map(p=>path(p));unique(board,'Reference packet');
    const tasks=list(desk.tasks,'Checklist',LIMITS.tasks).map(task=>{
      object(task,'Checklist task');if(typeof task.done!=='boolean')throw Error('Invalid checklist task state.');
      return {id:identifier(task.id,'checklist task ID'),text:text(task.text,'checklist task',240,{multiline:true}),done:task.done};
    });unique(tasks.map(task=>task.id),'Checklist');
    const actors=list(value.actors,'Selected NPCs',LIMITS.actors).map(actor=>{object(actor,'Selected NPC');return {key:path(actor.key,true),name:text(actor.name,'NPC name',160)};});unique(actors.map(actor=>actor.key),'Selected NPCs');
    let encounter;
    {
      // Persist the same empty editor state used by the live planner. Null is a
      // supported portable input, but is not a valid planner storage record.
      // Saves made while battle maps existed may carry a map and token positions;
      // both are dropped and the roster is kept.
      const draft=value.encounter===null?{encounter:{name:'Planned encounter',partyLevel:2,partySize:5,target:'moderate',roster:[],placements:[]},staging:false,mapSignature:''}:object(value.encounter,'Encounter draft');object(draft.encounter,'Encounter');
      if(typeof draft.staging!=='boolean')throw Error('Invalid encounter placement setting.');
      if(typeof normalizeEncounter!=='function')throw Error('Encounter validation is not ready. Reopen the campaign desk and try again.');
      if(!Array.isArray(draft.encounter.placements))throw Error('Invalid encounter placement list.');
      encounter={encounter:normalizeEncounter({...draft.encounter,placements:[]}),staging:false,mapSignature:''};
    }
    return {version:1,desk:{title:text(desk.title,'session title',100,{empty:true,multiline:true}),notes:text(desk.notes,'scratchpad',LIMITS.notes,{empty:true,multiline:true}),tasks,board},actors,encounter};
  }
  function normalizeRecord(value) {
    object(value,'Saved session');if(typeof value.archived!=='boolean')throw Error('Invalid saved-session archive state.');
    const createdAt=timestamp(value.createdAt,'creation time'),updatedAt=timestamp(value.updatedAt,'modification time');
    if(updatedAt<createdAt)throw Error('A saved session cannot be modified before it was created.');
    return {id:identifier(value.id),revision:revision(value.revision,'saved-session'),createdAt,updatedAt,archived:value.archived,snapshot:normalizeSnapshot(value.snapshot)};
  }
  function emptyLibrary() {return {version:1,revision:0,records:[]};}
  function normalizeLibrary(value) {
    object(value,'Session library');if(value.version!==1)throw Error('Unsupported saved-session library version.');
    const records=list(value.records,'Session library',LIMITS.records).map(normalizeRecord);unique(records.map(record=>record.id),'Session library');
    return size({version:1,revision:revision(value.revision,'library'),records},LIMITS.libraryBytes,'Session library');
  }
  function sameContent(a,b) {return JSON.stringify(normalizeSnapshot(a))===JSON.stringify(normalizeSnapshot(b));}
  function createRecord(snapshot,{id,now,archived=false}={}) {
    const time=nowValue(now);return normalizeRecord({id,revision:0,createdAt:time,updatedAt:time,archived,snapshot});
  }
  function commit(library,records) {return normalizeLibrary({version:1,revision:library.revision+1,records});}
  function saveRecord(value,snapshot,{id,now}={}) {
    const library=normalizeLibrary(value),normalized=normalizeSnapshot(snapshot);
    const content=JSON.stringify(normalized),existing=library.records.find(record=>!record.archived&&JSON.stringify(record.snapshot)===content);
    if(existing)return {library,record:existing,created:false};
    const record=createRecord(normalized,{id,now});
    if(library.records.some(item=>item.id===record.id))throw Error('That saved-session ID is already in use. Save a new copy.');
    return {library:commit(library,[...library.records,record]),record,created:true};
  }
  function duplicateRecord(value,id,{newId,now,title}={}) {
    const library=normalizeLibrary(value),original=library.records.find(record=>record.id===id);if(!original)throw Error('The saved session no longer exists. Refresh the library.');
    const snapshot=structuredClone(original.snapshot);snapshot.desk.title=title??((snapshot.desk.title||'Untitled session').slice(0,93)+' (copy)');
    const record=createRecord(snapshot,{id:newId,now});
    if(library.records.some(item=>item.id===record.id))throw Error('That saved-session ID is already in use.');
    return {library:commit(library,[...library.records,record]),record,created:true};
  }
  function setArchived(value,id,archived,{now}={}) {
    const library=normalizeLibrary(value),record=library.records.find(item=>item.id===id);if(!record)throw Error('The saved session no longer exists. Refresh the library.');
    if(typeof archived!=='boolean')throw Error('Invalid archive state.');
    if(record.archived===archived)return {library,record,changed:false};
    const updated={...record,archived,revision:record.revision+1,updatedAt:[record.updatedAt,nowValue(now)].sort().at(-1)};
    return {library:commit(library,library.records.map(item=>item.id===id?updated:item)),record:updated,changed:true};
  }
  function normalizeBackup(value) {
    object(value,'Editable session backup');size(value,LIMITS.fileBytes,'Editable session backup');
    if(value.format!==BACKUP_FORMAT||value.version!==1)throw Error('Choose a saved-session backup, not a Foundry import package or desk-only backup.');
    const records=list(value.records,'Editable session backup',LIMITS.records).map(normalizeRecord);
    if(!records.length)throw Error('The editable session backup is empty.');unique(records.map(record=>record.id),'Editable session backup');
    return {format:BACKUP_FORMAT,version:1,exportedAt:timestamp(value.exportedAt,'export time'),records};
  }
  function exportBackup(records,{now}={}) {return normalizeBackup({format:BACKUP_FORMAT,version:1,exportedAt:nowValue(now),records});}
  function importBackup(value,input,{idFactory,now}={}) {
    const library=normalizeLibrary(value),backup=normalizeBackup(input),records=[...library.records],selected=[];let created=0,skipped=0;
    if(typeof idFactory!=='function')throw Error('A local ID generator is required to import saved sessions.');
    for(const incoming of backup.records){
      const content=JSON.stringify(incoming.snapshot),existing=records.find(record=>record.archived===incoming.archived&&JSON.stringify(record.snapshot)===content);
      if(existing){selected.push(existing);skipped++;continue;}
      const record=createRecord(incoming.snapshot,{id:idFactory(),now,archived:incoming.archived});
      if(records.some(item=>item.id===record.id))throw Error('A new saved-session ID collided with an existing copy. Try importing again.');
      records.push(record);selected.push(record);created++;
    }
    return {library:created?commit(library,records):library,records:selected,created,skipped};
  }
  return Object.freeze({normalizeSnapshot,normalizeRecord,normalizeLibrary,emptyLibrary,createRecord,sameContent,saveRecord,duplicateRecord,setArchived,normalizeBackup,exportBackup,importBackup});
}
