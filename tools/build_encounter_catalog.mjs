/** Build a metadata-only PF2e creature picker from installed core compendiums.
 * No world database is read. Open snapshots, never the installed LevelDB packs.
 * Usage: node tools/build_encounter_catalog.mjs SYSTEM_DIR FOUNDRY_NODE_MODULES
 */
import {cp,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [systemArgument,nodeModulesArgument]=process.argv.slice(2);
if(!systemArgument||!nodeModulesArgument)throw Error('Provide the installed PF2e system directory and Foundry node_modules directory.');
const systemDir=resolve(systemArgument),manifest=JSON.parse(await readFile(join(systemDir,'system.json'),'utf8'));
if(manifest.id!=='pf2e')throw Error('Source must be the PF2e system.');
const wanted=new Set(['pathfinder-monster-core','pathfinder-monster-core-2','pathfinder-npc-core','pathfinder-bestiary','pathfinder-bestiary-2','pathfinder-bestiary-3','npc-gallery']);
const packs=manifest.packs.filter(p=>p.type==='Actor'&&wanted.has(p.name));
if(packs.length!==wanted.size)throw Error('The source does not contain all configured core bestiary packs.');
const ClassicLevel=createRequire(import.meta.url)(join(resolve(nodeModulesArgument),'classic-level')).ClassicLevel;
const snapshots=await mkdtemp(join(tmpdir(),'saeroth-creature-catalog-'));
const creatures=[],seen=new Set(),sizes={tiny:.5,sm:1,med:1,lg:2,huge:3,grg:4};
for(const pack of packs){
 const sourcePath=resolve(systemDir,pack.path),rel=relative(systemDir,sourcePath);
 if(rel.startsWith('..')||resolve(sourcePath)===systemDir)throw Error('Invalid system pack path.');
 const snapshot=join(snapshots,pack.name);await cp(sourcePath,snapshot,{recursive:true,errorOnExist:true,force:false});
 const db=new ClassicLevel(snapshot,{valueEncoding:'json',createIfMissing:false});
 await db.open();
 try{for await(const [key,value]of db.iterator()){
  if(!key.startsWith('!actors!'))continue;
  const actor=typeof value==='string'?JSON.parse(value):value;
  if(actor.type!=='npc')continue;
  const level=actor.system?.details?.level?.value,id=actor._id;
  if(!/^[A-Za-z0-9]{16}$/.test(id)||!Number.isInteger(level)||level < -1||level>25)throw Error('Invalid actor metadata in '+pack.name);
  const token=actor.prototypeToken??{},link=token.flags?.pf2e?.linkToActorSize!==false;
  const size=sizes[actor.system?.traits?.size?.value];
  if(!size)throw Error('Unknown size for '+actor.name);
  const width=link?size:token.width??size,height=link?size:token.height??size;
  if(![width,height].every(n=>Number.isFinite(n)&&n>=.5&&n<=8&&n*2===Math.floor(n*2)))throw Error('Unsupported token footprint for '+actor.name);
  const uuid=`Compendium.pf2e.${pack.name}.Actor.${id}`;
  if(seen.has(uuid))throw Error('Duplicate creature UUID');seen.add(uuid);
  creatures.push({id:'pf2e-'+createHash('sha256').update(uuid).digest('hex').slice(0,24),name:actor.name,level,width,height,source:{type:'compendium',uuid},book:pack.label,traits:actor.system?.traits?.value??[]});
 }}finally{await db.close();}
}
creatures.sort((a,b)=>a.name.localeCompare(b.name,'en')||a.source.uuid.localeCompare(b.source.uuid,'en'));
const data={schema:1,system:{id:'pf2e',version:manifest.version},source:'https://github.com/foundryvtt/pf2e',packs:packs.map(p=>({id:p.name,name:p.label})),creatures};
const destination=join(root,'site','encounter-creatures.json');await mkdir(dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(data)+'\n');
console.log(JSON.stringify({system:manifest.version,packs:packs.length,creatures:creatures.length,destination,snapshots}));
