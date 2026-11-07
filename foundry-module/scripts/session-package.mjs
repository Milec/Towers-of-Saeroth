/** Portable, data-only Saeroth session package contract. No Foundry globals. */
import {normalizeEncounter,sourceKey} from './encounter-plan.mjs';
export const FORMAT = 'saeroth-session';
// VERSION remains the default for note/NPC/map packages and their stable IDs.
export const VERSION = 1;
export const ENCOUNTER_VERSION = 2;
export const MINIMUM_FOUNDRY = '14.364';
export const LIMITS = Object.freeze({maxAssets:100,maxAssetBytes:20*1024*1024,maxTotalAssetBytes:48*1024*1024,maxFileBytes:72*1024*1024,maxActors:50,maxPages:100,maxHtmlBytes:2*1024*1024,maxWalls:2000,maxLights:100});
const encoder = new TextEncoder();
const assetPattern = /^asset:([a-z0-9][a-z0-9_-]{0,63})$/;
const documentPattern = /^[a-zA-Z0-9]{16}$/;
const colors = /^#[0-9a-f]{6}$/i;

function object(value,label) {
  if (!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw Error(`${label} must be an object.`);
  return value;
}
function text(value,label,max=160) {
  if (typeof value!=='string' || !value.trim() || value.length>max || /[\x00-\x1f\x7f]/.test(value)) throw Error(`Invalid ${label}.`);
  return value.trim();
}
function finite(value,label,min,max) {
  if (!Number.isFinite(value) || value<min || value>max) throw Error(`Invalid ${label}.`);
  return value;
}
function integer(value,label,min,max) {
  finite(value,label,min,max);if (!Number.isInteger(value)) throw Error(`${label} must be a whole number.`);return value;
}
function choice(value,choices,label) { if (!choices.includes(value)) throw Error(`Invalid ${label}.`);return value; }
function color(value,label) { if (!colors.test(value)) throw Error(`Invalid ${label}.`);return value; }
function bool(value,label) { if (typeof value!=='boolean') throw Error(`Invalid ${label}.`);return value; }
function list(value,label,max) { if (!Array.isArray(value)||value.length>max) throw Error(`Invalid ${label}; maximum ${max}.`);return value; }
function documentId(value,label) {if (!documentPattern.test(value)) throw Error(`Invalid ${label}.`);return value;}
function checkStructure(value,depth=0,state={count:0}) {
  if (++state.count>100000 || depth>32) throw Error('The package is too deeply nested or too complex.');
  if (!value || typeof value!=='object') return;
  if (!Array.isArray(value)) object(value,'Package object');
  for (const [key,child] of Object.entries(value)) {
    if (['__proto__','prototype','constructor'].includes(key)) throw Error('Unsafe object key in package.');
    checkStructure(child,depth+1,state);
  }
}
export function assetReference(value) {const match=typeof value==='string'&&assetPattern.exec(value);return match?match[1]:null;}
export function assetByteLength(asset) {return asset.data.length/4*3-(asset.data.match(/=+$/)?.[0].length||0);}
export function decodeAsset(asset) {return Uint8Array.from(atob(asset.data),value=>value.charCodeAt(0));}
function assetsFrom(values) {
  const ids=new Set();let total=0;
  return list(values,'assets',LIMITS.maxAssets).map(value=>{
    object(value,'Asset');const id=text(value.id,'asset ID',64);
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)||ids.has(id)) throw Error('Asset IDs must be unique, lower-case identifiers.');ids.add(id);
    const mime=choice(value.mime,['image/png','image/webp','image/jpeg'],'asset format');
    const data=value.data;
    if (typeof data!=='string'||data.length<16||data.length>Math.ceil(LIMITS.maxAssetBytes/3)*4||data.length%4||! /^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw Error(`Asset ${id} has invalid base64 image data.`);
    const normalized={id,name:text(value.name,'asset name'),mime,data};
    const bytes=assetByteLength(normalized);total+=bytes;if(bytes>LIMITS.maxAssetBytes||total>LIMITS.maxTotalAssetBytes) throw Error('The package contains too much artwork. Use smaller images or fewer notes.');
    const header=atob(data.slice(0,Math.min(48,data.length)));
    const valid=mime==='image/png'?header.startsWith('\x89PNG\r\n\x1a\n'):mime==='image/jpeg'?header.startsWith('\xff\xd8\xff'):header.slice(0,4)==='RIFF'&&header.slice(8,12)==='WEBP';
    if (!valid) throw Error(`Asset ${id} does not match its image format.`);
    return normalized;
  });
}
function reference(value,ids,label) {
  const id=assetReference(value);if (!id||!ids.has(id)) throw Error(`${label} must reference bundled artwork.`);return value;
}
function htmlFrom(value,ids,state) {
  if(typeof value!=='string')throw Error('A journal page must contain HTML text.');state.bytes+=encoder.encode(value).length;
  if(state.bytes>LIMITS.maxHtmlBytes)throw Error('The journal is too large. Export fewer notes.');
  // The runtime also parses and validates every attribute with DOMParser before
  // use. These guards keep active constructs out of portable exports as well.
  if (/<\s*\/?\s*(?:script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|option|video|audio|source|link|meta|base)\b/i.test(value)||/\s(?:on[a-z]+|srcdoc)\s*=/i.test(value))throw Error('Journal HTML contains active or unsupported content.');
  for (const match of value.matchAll(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))reference(match[1]??match[2]??match[3],ids,'Journal image');
  return value;
}
function journalFrom(value,ids) {
  object(value,'Journal');const state={bytes:0};
  const pages=list(value.pages,'journal pages',LIMITS.maxPages).map((page,index)=>{
    object(page,'Journal page');if(page.type!=='text')throw Error('Session packages support text journal pages only.');
    object(page.text,'Journal text');if(page.text.format!==1)throw Error('Journal text must use HTML format.');
    return {name:text(page.name,'page name'),type:'text',sort:integer(page.sort??(index+1)*100000,'page sort order',0,100000000),text:{format:1,content:htmlFrom(page.text.content,ids,state)},_stats:{coreVersion:MINIMUM_FOUNDRY}};
  });
  if(!pages.length)throw Error('Add at least one journal page to the session.');
  return {name:text(value.name,'journal name'),ownership:{default:0},pages,_stats:{coreVersion:MINIMUM_FOUNDRY}};
}
function sceneFrom(value,ids) {
  if(value==null)return null;object(value,'Scene');
  const width=integer(value.width,'scene width',800,6400),height=integer(value.height,'scene height',800,6400);
  const levels=list(value.levels,'scene levels',1);if(levels.length!==1)throw Error('Session packages currently support one scene level.');
  const sourceLevel=object(levels[0],'Scene level'),level=documentId(sourceLevel._id,'level ID');
  if(value.initialLevel!==level)throw Error('The initial scene level does not exist.');
  for(const key of ['tokens','tiles','drawings','notes','sounds','regions'])if(value[key]!==undefined&&list(value[key],key,0).length)throw Error(`Scene ${key} are not supported in this package version.`);
  const background=object(sourceLevel.background,'Scene background');const src=reference(background.src,ids,'Scene background');
  // Keep generated maps at exact pixel size. No supplied transform can detach
  // wall coordinates from the bundled image.
  const grid=object(value.grid,'Scene grid');const size=integer(grid.size,'grid size',50,200);
  if(width%size||height%size)throw Error('Scene dimensions must align to whole grid squares.');
  if(grid.type!==1||grid.distance!==5||grid.units!=='ft')throw Error('Session maps use a square 5-foot grid.');
  const usedIds=new Set([level]);
  const embeddedId=(v,label)=>{const id=documentId(v,label);if(usedIds.has(id))throw Error('Scene embedded IDs must be unique.');usedIds.add(id);return id;};
  const refs=(v,label)=>{if(!Array.isArray(v)||v.length!==1||v[0]!==level)throw Error(`${label} references a missing level.`);return [level];};
  const walls=list(value.walls??[],'walls',LIMITS.maxWalls).map(w=>{
    object(w,'Wall');if(!Array.isArray(w.c)||w.c.length!==4)throw Error('A wall needs four endpoint coordinates.');
    const c=w.c.map((n,i)=>finite(n,'wall coordinate',0,i%2?height:width));if(Math.hypot(c[0]-c[2],c[1]-c[3])<1)throw Error('A wall must have distinct endpoints.');
    return {_id:embeddedId(w._id,'wall ID'),c,levels:refs(w.levels,'Wall'),move:choice(w.move,[0,10,20],'wall movement'),sight:choice(w.sight,[0,10,20],'wall sight'),light:choice(w.light,[0,10,20],'wall light'),sound:choice(w.sound??0,[0,10,20],'wall sound'),dir:choice(w.dir??0,[0,1,2],'wall direction'),door:choice(w.door??0,[0,1,2],'door type'),ds:choice(w.ds??0,[0,1,2],'door state')};
  });
  const lights=list(value.lights??[],'lights',LIMITS.maxLights).map((l,i)=>{
    object(l,'Light');const c=object(l.config,'Light configuration');const bright=finite(c.bright,'bright radius',0,320),dim=finite(c.dim,'dim radius',bright,320);
    const darkness=c.darkness??{min:0,max:1};object(darkness,'Light darkness');
    return {_id:embeddedId(l._id,'light ID'),name:text(l.name??`Map light ${i+1}`,'light name'),x:finite(l.x,'light x',0,width),y:finite(l.y,'light y',0,height),elevation:finite(l.elevation??0,'light elevation',-1000,1000),levels:refs(l.levels,'Light'),rotation:finite(l.rotation??0,'light rotation',0,360),walls:true,vision:false,hidden:false,config:{bright,dim,angle:finite(c.angle??360,'light angle',0,360),color:color(c.color,'light color'),alpha:finite(c.alpha??.3,'light opacity',0,1),luminosity:finite(c.luminosity??.5,'light luminosity',0,1),attenuation:finite(c.attenuation??.5,'light attenuation',0,1),darkness:{min:finite(darkness.min,'minimum darkness',0,1),max:finite(darkness.max,'maximum darkness',darkness.min,1)},animation:{type:choice(c.animation?.type??'torch',['torch','none'],'light animation'),speed:finite(c.animation?.speed??2,'animation speed',0,10),intensity:finite(c.animation?.intensity??3,'animation intensity',0,10)}}};
  });
  const environment=object(value.environment,'Scene environment'),global=object(environment.globalLight,'Global light');
  const darkness=finite(environment.darknessLevel,'scene darkness',0,1),globalEnabled=bool(global.enabled,'global illumination');
  const initial=value.initial??{};object(initial,'Initial view');
  return {_stats:{coreVersion:MINIMUM_FOUNDRY},name:text(value.name,'scene name'),active:false,navigation:false,navOrder:0,width,height,padding:0,shiftX:0,shiftY:0,initial:{x:finite(initial.x??width/2,'initial view x',0,width),y:finite(initial.y??height/2,'initial view y',0,height),scale:finite(initial.scale??.3,'initial zoom',.05,3)},initialLevel:level,thumb:src,grid:{type:1,size,distance:5,units:'ft',alpha:finite(grid.alpha??.15,'grid opacity',0,1),color:color(grid.color??'#b8b0a0','grid color'),style:'solidLines',thickness:1},tokenVision:true,environment:{darknessLevel:darkness,darknessLock:true,cycle:false,globalLight:{enabled:globalEnabled,bright:globalEnabled,darkness:{min:0,max:1}}},levels:[{_id:level,name:text(sourceLevel.name??'Battle map','level name'),elevation:{bottom:null,top:null},background:{src,color:color(background.color??'#252820','background color')},textures:{fit:'fill',scaleX:1,scaleY:1,anchorX:.5,anchorY:.5,offsetX:0,offsetY:0,rotation:0}}],walls,lights,tokens:[],notes:[],sounds:[],drawings:[],regions:[],tiles:[],ownership:{default:0}};
}
export function normalizePackage(value) {
  checkStructure(value);object(value,'Package');
  if(value.format!==FORMAT||![VERSION,ENCOUNTER_VERSION].includes(value.version))throw Error('Choose a Saeroth session package, version 1 or 2.');
  if(value.version===VERSION&&Object.hasOwn(value,'encounter'))throw Error('Encounter plans require session package version 2 and Saeroth module 0.4.0 or newer.');
  const assets=assetsFrom(value.assets??[]),ids=new Set(assets.map(a=>a.id));const keys=new Set();
  const actors=list(value.actors??[],'actors',LIMITS.maxActors).map(a=>{
    object(a,'Actor reference');const key=text(a.key,'actor source',500);
    if(!key.startsWith('campaign/')||!key.endsWith('.md')||key.includes('\\')||key.split('/').some(s=>!s||s==='.'||s==='..')||/[?#\x00-\x1f]/.test(key)||keys.has(key))throw Error('Actor sources must be unique campaign note paths.');keys.add(key);
    return {key,name:text(a.name,'actor name')};
  });
  const createdAt=text(value.createdAt,'creation time',40);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(createdAt)||!Number.isFinite(Date.parse(createdAt)))throw Error('Invalid package creation time.');
  const normalized={format:FORMAT,version:value.version,name:text(value.name,'session name'),createdAt,assets,journal:journalFrom(value.journal,ids),actors,scene:sceneFrom(value.scene,ids)};
  if(value.version===ENCOUNTER_VERSION){
    normalized.encounter=normalizeEncounter(value.encounter,normalized.scene);
    if(!normalized.encounter.roster.length)throw Error('Add at least one creature to an encounter package.');
    if(normalized.journal.pages.length>=LIMITS.maxPages)throw Error(`Encounter packages allow at most ${LIMITS.maxPages-1} journal pages, reserving one for the opponent roster.`);
    const allSources=new Set([...actors.map(actor=>actor.key),...normalized.encounter.roster.map(row=>sourceKey(row.source))]);
    if(allSources.size>LIMITS.maxActors)throw Error(`A session package can reference at most ${LIMITS.maxActors} different actors.`);
  }
  return normalized;
}
export function canonicalJSON(value) {
  if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export async function digest(value) {
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(typeof value==='string'?value:canonicalJSON(value)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function sealPackage(value) {
  const normalized=normalizePackage(value);const {createdAt,...content}=normalized;
  return {...normalized,id:await digest(content)};
}
export async function validatePackage(value) {
  if(typeof value?.id!=='string'||! /^[a-f0-9]{64}$/.test(value.id))throw Error('The package has no valid content identity. Export it again from Saeroth.');
  const normalized=await sealPackage(value);if(normalized.id!==value.id)throw Error('The package content has changed or is incomplete. Export it again from Saeroth.');return normalized;
}
// Keep the identity namespace stable for v1 imports. The bundle digest itself
// includes the version and all v2 encounter fields, preventing cross-version reuse.
export async function documentIdentity(bundleId,kind,key='') {return (await digest(`${FORMAT}:${VERSION}:${bundleId}:${kind}:${key}`)).slice(0,16);}
