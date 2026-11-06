const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const adapter=require('../../site/atlas/battlemap-foundry.js');
const engine=require('../../site/atlas/battlemap-engine.js');

const sample={version:1,name:'Waystation — "Moon" <north>',seed:'seed-123',kind:'inn',terrain:'mountain',source:{type:'custompoi',id:1793996607857},cols:24,rows:24,
 walls:[{a:[2,2],b:[12,2],kind:'wall'},{a:[12,2],b:[12,6],kind:'wall'},{a:[12,6],b:[12,7],kind:'door'},{a:[12,7],b:[12,12],kind:'wall'},{a:[2,12],b:[12,12],kind:'window'},{a:[15,15],b:[16,15.25],kind:'terrain'}],
 lights:[{x:6,y:6,bright:4,dim:8,color:'#ffb366',alpha:.35}]};
// Header-only fixture: mocks below verify decoding failures independently.
const image='data:image/webp;base64,'+Buffer.from('RIFF0000WEBP').toString('base64');
const native=adapter.scene(sample,{backgroundPath:'worlds/test/saeroth-atlas/map.webp',time:'night'});
assert.equal(native._stats.coreVersion,'14.364');
assert.equal(native.grid.size,100);assert.equal(native.grid.distance,5);assert.equal(native.grid.units,'ft');
assert.equal(native.width,2400);assert.equal(native.height,2400);assert.equal(native.active,false);assert.equal(native.navigation,false);
assert.equal(native.levels[0]._id,native.initialLevel);assert.equal(native.levels[0].background.src,native.thumb);assert.equal(native.levels[0].textures.fit,'fill');
assert.equal(native.lights[0].config.bright,20);assert.equal(native.lights[0].config.dim,40);assert.equal(native.lights[0].x,600);
assert.equal(native.walls[2].door,1);assert.equal(native.walls[2].ds,0);assert.deepEqual(native.walls[2].c,[1200,600,1200,700]);
assert.equal(native.walls[4].sight,0);assert.equal(native.walls[4].move,20);assert.equal(native.walls[5].sight,10);assert.equal(native.walls[5].move,20);
assert.equal(native.environment.globalLight.enabled,false);assert.equal(native.environment.darknessLevel,.8);
assert.equal(native.tokens.length,0);assert.equal(native.ownership.default,0);
const ids=[native._id,...native.levels.map(d=>d._id),...native.walls.map(d=>d._id),...native.lights.map(d=>d._id)];
assert.equal(new Set(ids).size,ids.length);ids.forEach(id=>assert.match(id,/^[a-zA-Z0-9]{16}$/));
[...native.walls,...native.lights].forEach(d=>assert.deepEqual(d.levels,[native.initialLevel]));
assert.deepEqual(native,adapter.scene(structuredClone(sample),{backgroundPath:'worlds/test/saeroth-atlas/map.webp',time:'night'}));
assert.equal(adapter.scene(sample,{backgroundPath:'map.webp'}).environment.globalLight.enabled,true);
assert.throws(()=>adapter.scene(sample,{backgroundPath:''}));assert.throws(()=>adapter.scene(sample,{backgroundPath:'data:bad'}));
assert.throws(()=>adapter.scene(sample,{backgroundPath:'map.webp',time:'broken'}));assert.throws(()=>adapter.scene({...sample,cols:12.5},{backgroundPath:'map.webp'}));
assert.throws(()=>adapter.scene({...sample,walls:[{a:[-1,0],b:[2,2],kind:'wall'}]},{backgroundPath:'map.webp'}));
assert.throws(()=>adapter.scene({...sample,lights:[{...sample.lights[0],dim:1}]},{backgroundPath:'map.webp'}));
assert.throws(()=>adapter.macro(sample,{imageDataUrl:'https://example.com/map.webp'}));
assert.throws(()=>adapter.macro(sample,{imageDataUrl:'data:image/webp;base64,'+Buffer.from('not an image').toString('base64')}));

const macro=adapter.macro(sample,{imageDataUrl:image,time:'night'});
assert.equal(macro.type,'script');assert.equal(macro.scope,'global');assert.equal(macro.ownership.default,0);
assert.deepEqual(macro,adapter.macro(structuredClone(sample),{imageDataUrl:image,time:'night'}));
assert.notEqual(macro.flags.world.saerothAtlasBattlemap.key,adapter.macro(sample,{imageDataUrl:image,time:'day'}).flags.world.saerothAtlasBattlemap.key);

function harness(options={}){
 const documents=new Map(),calls={browse:[],mkdir:[],upload:[],create:[],notices:[],errors:[]};let random=0;
 documents.find=fn=>[...documents.values()].find(fn);
 const context={console:{error:(...args)=>calls.errors.push(args)},Symbol,Set,Uint8Array,File,atob,
   game:{user:{isGM:options.gm!==false},version:options.version||'14.367',world:{id:'test-world'},scenes:documents},
   ui:{notifications:Object.fromEntries(['info','warn','error'].map(level=>[level,message=>calls.notices.push({level,message})]))},
   createImageBitmap:async()=>{if(options.invalidImage)throw Error('Invalid image');return {width:options.wrongDimensions?10:2400,height:2400,close(){calls.closedBitmap=true;}};},
   foundry:{utils:{isNewerVersion:(a,b)=>Number(a.split('.')[0])>Number(b.split('.')[0])||(a.split('.')[0]===b.split('.')[0]&&Number(a.split('.')[1])>Number(b.split('.')[1])),randomID:()=>('safe'+(++random)).padEnd(24,'x'),deepClone:structuredClone},
     applications:{apps:{FilePicker:{implementation:{
       browse:async(source,folder)=>{calls.browse.push({source,folder});if(options.noBrowse)throw Error('No storage permission');return {dirs:options.folderExists?['worlds/test-world/saeroth-atlas']:[]};},
       createDirectory:async(source,folder)=>calls.mkdir.push({source,folder}),
       upload:async(source,folder,file,body,settings)=>{calls.upload.push({source,folder,name:file.name,mime:file.type,body,settings});if(options.uploadThrows)throw Error('Network error');if(options.uploadFalse)return false;return {path:options.badUploadPath?'javascript:alert(1)':folder+'/'+file.name};}
     }}}},canvas:{loadTexture:async()=>options.invalidTexture?null:{valid:true,width:2400,height:2400}}},
   CONFIG:{Scene:{documentClass:{create:async(data,operation)=>{
     calls.create.push({data,operation});if(options.createFails)throw Error('Creation denied');
     if(documents.has(data._id))throw Error('Duplicate ID');const result={...data,id:data._id};documents.set(data._id,result);
     if(options.lostCreateResponse)throw Error('Lost reply');return result;
   }}}}
 };
 const compiled=vm.createContext(context);
 return {calls,documents,context,run:command=>vm.runInContext('(async()=>{'+(command||macro.command)+'})()',compiled)};
}
async function nativeSchema(){
 const app=process.env.FOUNDRY_APP_PATH||'C:/Users/mikie/AppData/Local/Programs/Foundry Virtual Tabletop/resources/app';
 if(!fs.existsSync(path.join(app,'common/documents/scene.mjs')))return console.log('Native Foundry schema check skipped: set FOUNDRY_APP_PATH to an installed v14 app.');
 const load=file=>import(pathToFileURL(path.join(app,file)));
 globalThis.CONST=await load('common/constants.mjs');globalThis.CONFIG={compatibility:{mode:CONST.COMPATIBILITY_MODES.SILENT}};
 globalThis.game={version:'14.367',release:{version:'14.367'},system:{id:'pf2e',version:null,documentTypes:{},grid:{type:1,distance:5,units:'ft'}},modules:new Map(),model:{},i18n:{localize:x=>x,format:x=>x}};
 await load('common/primitives/_module.mjs');globalThis.foundry={utils:await load('common/utils/_module.mjs')};
 foundry.abstract=await load('common/abstract/_module.mjs');foundry.documents=await load('common/documents/_module.mjs');foundry.data={...await load('common/data/data.mjs'),fields:await load('common/data/fields.mjs')};
 for(const cls of Object.values(foundry.documents)){if(!cls.metadata?.name)continue;CONFIG[cls.metadata.name]={documentClass:cls,dataModels:{}};game.model[cls.metadata.name]=Object.fromEntries((cls.metadata.coreTypes||['base']).map(t=>[t,{}]));}
 const sceneDoc=new foundry.documents.BaseScene(native,{strict:true});assert.equal(sceneDoc.validate({strict:true}),true);
 assert.equal(sceneDoc.initialLevel.background.src,native.levels[0].background.src,'v14 migration must retain the exported background');
 assert.equal(sceneDoc.levels.size,1);assert.equal(sceneDoc.walls.size,6);assert.equal(sceneDoc.lights.size,1);
 for(const doc of [...sceneDoc.levels,...sceneDoc.walls,...sceneDoc.lights])assert.equal(doc.validate({strict:true}),true);
 const macroDoc=new foundry.documents.BaseMacro(macro,{strict:true});assert.equal(macroDoc.validate({strict:true}),true);
 for(const kind of engine.kinds){const map=engine.generate({seed:'native-integration',kind,terrain:'mountain',size:32,name:kind,source:{type:'poi',id:1}});const doc=new foundry.documents.BaseScene(adapter.scene(map,{backgroundPath:'map.webp'}),{strict:true});assert.equal(doc.validate({strict:true}),true);assert.equal(doc.walls.size,map.walls.length);assert.equal(doc.lights.size,map.lights.length);}
 console.log('Native Foundry14.367 Scene/Level/Wall/AmbientLight/Macro schemas pass in memory; no live world or import touched.');
}
(async()=>{
 for(const kind of engine.kinds)for(const terrain of engine.terrains)for(const size of [24,32,40]){
   const map=engine.generate({seed:'export-boundary',kind,terrain,size,name:'Boundary test',source:{type:'poi',id:1}}),scene=adapter.scene(map,{backgroundPath:'map.webp'});
   assert.equal(scene.width,size*100);assert.equal(scene.walls.length,map.walls.length);assert.equal(scene.lights.length,map.lights.length);
 }
 const h=harness();const created=await h.run();assert(created);assert.equal(h.calls.create.length,1);assert.equal(h.calls.upload.length,1);assert.equal(h.calls.mkdir.length,1);
 const saved=h.calls.create[0];assert(saved.data.levels[0].background.src.endsWith('.webp'));assert.equal(saved.data.thumb,saved.data.levels[0].background.src);
 assert.equal(saved.data.active,false);assert.equal(saved.data.navigation,false);assert.equal(saved.operation.keepId,true);assert.equal(saved.operation.renderSheet,false);
 assert.equal(saved.data.flags.world.saerothAtlasBattlemap.asset,saved.data.thumb);assert.equal(h.calls.upload[0].folder,'worlds/test-world/saeroth-atlas');assert.equal(h.calls.upload[0].mime,'image/webp');
 await h.run();assert.equal(h.calls.create.length,1);assert.equal(h.calls.upload.length,1);assert(h.calls.notices.some(n=>n.message.includes('already in Scenes')));
 const concurrent=harness();await Promise.all([concurrent.run(),concurrent.run()]);assert.equal(concurrent.calls.create.length,1);assert.equal(concurrent.calls.upload.length,1);
 for(const options of [{gm:false},{version:'13.350'},{version:'14.352'},{invalidImage:true},{wrongDimensions:true},{noBrowse:true},{uploadThrows:true},{uploadFalse:true},{badUploadPath:true},{invalidTexture:true}]){
   const fail=harness(options);await fail.run();assert.equal(fail.calls.create.length,0,JSON.stringify(options));assert(fail.calls.notices.some(n=>n.level==='error'));
 }
 const createFail=harness({createFails:true});await createFail.run();assert.equal(createFail.documents.size,0);assert(createFail.calls.notices.some(n=>n.message.includes('artwork remains')));
 await createFail.run();assert.notEqual(createFail.calls.upload[0].name,createFail.calls.upload[1].name,'Retries use unique asset filenames');
 const lost=harness({lostCreateResponse:true});assert(await lost.run());await lost.run();assert.equal(lost.calls.create.length,1);assert.equal(lost.documents.size,1);
 const collision=harness();collision.documents.set(saved.data._id,{_id:saved.data._id,name:'Unrelated',flags:{}});await collision.run();assert.equal(collision.calls.upload.length,0);assert.equal(collision.calls.create.length,0);
 assert(collision.calls.notices.some(n=>n.message.includes('different scene')));
 const injection=harness();const malicious=adapter.macro({...sample,name:'";globalThis.pwned=true;//',seed:'</script>'},{imageDataUrl:image});await injection.run(malicious.command);assert.equal(injection.context.pwned,undefined);assert.equal(injection.calls.create.length,1);
 await nativeSchema();
 console.log('Foundry battle maps: scale, native levels, walls/doors/light units, embedded art, GM/version gates, upload/texture failures, duplicate/race recovery and inert authored strings pass.');
})().catch(error=>{console.error(error);process.exitCode=1;});
