import {createHash} from 'node:crypto';

const VALID_ID=/^[a-zA-Z0-9]{16}$/;

/**
 * Older generated packs used base64url IDs, which can contain '-' or '_'.
 * Foundry v14 rejects those documents. Repair only the invalid IDs after all
 * generation has finished: changing the seed generator would also churn valid
 * child IDs whenever an actor ID changes.
 *
 * Exact ID values and embedded UUID components are references; arbitrary text
 * and image filenames are not. Leave filenames alone so existing token and
 * portrait paths continue to work across this compatibility repair.
 */
export function repairDocumentIds(source) {
  const data=structuredClone(source),replacements=new Map(),identities=new Set();
  function collect(value) {
    if(!value||typeof value!=='object')return;
    if(!Array.isArray(value)&&Object.hasOwn(value,'_id')){
      if(typeof value._id!=='string')throw Error('A generated document has a non-string ID.');
      identities.add(value._id);
      if(!VALID_ID.test(value._id))replacements.set(value._id,createHash('sha256').update('saeroth-foundry-id:'+value._id).digest('hex').slice(0,16));
    }
    for(const child of Object.values(value))collect(child);
  }
  collect(data);
  const destinations=new Map();
  for(const id of identities){const repaired=replacements.get(id)??id;const existing=destinations.get(repaired);if(existing&&existing!==id)throw Error('Generated document ID repair would collide with another document.');destinations.set(repaired,id);}
  function replace(value) {
    if(typeof value==='string'){
      if(replacements.has(value))return replacements.get(value);
      if(value.startsWith('Compendium.')||value.startsWith('Actor.')||value.startsWith('Item.')){
        return value.replace(/(^|\.)(Actor|Item|ActiveEffect|Scene|JournalEntry|JournalEntryPage|RollTable|TableResult)\.([^.[\]{}\s]+)/g,(match,prefix,type,id)=>prefix+type+'.'+(replacements.get(id)??id));
      }
      return value;
    }
    if(Array.isArray(value))return value.map(replace);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[replacements.get(key)??key,replace(child)]));
    return value;
  }
  return replace(data);
}
