/* Native Foundry v14 export. Background art travels inside the import macro. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SaerothBattlemapFoundry=api;
})(typeof window==='object'?window:null,()=>{
  'use strict';
  const CORE_VERSION='14.364',FLAG='saerothAtlasBattlemap';
  const text=(value,label,max=160)=>{
    if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw Error('Invalid '+label+'.');
    return value.trim();
  };
  const number=(value,label,min,max)=>{
    if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid '+label+'.');return value;
  };
  // A deterministic content identity, not a security primitive or credential.
  function identity(value){
    let a=0x9e3779b9,b=0x243f6a88,c=0xb7e15162,d=0xdeadbeef;
    for(let i=0;i<value.length;i++){
      const n=value.charCodeAt(i);a=Math.imul(a^n,0x85ebca6b);b=Math.imul(b^n,0xc2b2ae35);
      c=Math.imul(c^n,0x27d4eb2d);d=Math.imul(d^n,0x165667b1);
    }
    return [a,b,c,d].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
  }
  function normalize(map){
    if(!map||map.version!==1)throw Error('Unsupported battle map version.');
    const cols=number(map.cols,'map width',8,64),rows=number(map.rows,'map height',8,64);
    if(!Number.isInteger(cols)||!Number.isInteger(rows))throw Error('Map size must be whole grid squares.');
    if(!Array.isArray(map.walls)||map.walls.length>2000||!Array.isArray(map.lights)||map.lights.length>100)throw Error('Invalid battle map geometry.');
    const point=(p,label)=>{
      if(!Array.isArray(p)||p.length!==2)throw Error('Invalid '+label+'.');
      return [number(p[0],label,0,cols),number(p[1],label,0,rows)];
    };
    const walls=map.walls.map(w=>{
      if(!w||!['wall','door','window','terrain'].includes(w.kind))throw Error('Unknown wall type.');
      const a=point(w.a,'wall endpoint'),b=point(w.b,'wall endpoint');
      if(Math.hypot(a[0]-b[0],a[1]-b[1])<.01)throw Error('A wall must have two distinct endpoints.');
      return {a,b,kind:w.kind};
    });
    const lights=map.lights.map(l=>{
      if(!l||!/^#[a-f0-9]{6}$/i.test(l.color))throw Error('Invalid light color.');
      const bright=number(l.bright,'bright light radius',0,64),dim=number(l.dim,'dim light radius',bright,64);
      return {x:number(l.x,'light position',0,cols),y:number(l.y,'light position',0,rows),bright,dim,color:l.color,alpha:number(l.alpha,'light opacity',0,1)};
    });
    const source=map.source&&['poi','custompoi','burg'].includes(map.source.type)&&Number.isSafeInteger(map.source.id)&&map.source.id>=0?{type:map.source.type,id:map.source.id}:null;
    return {version:1,name:text(map.name,'map name'),seed:text(map.seed,'seed',80),kind:text(map.kind,'map kind',32),terrain:text(map.terrain,'terrain',32),source,cols,rows,walls,lights};
  }
  function scene(map,{backgroundPath,gridSize=100,time='day'}={}){
    const data=normalize(map);
    if(typeof backgroundPath!=='string'||!backgroundPath.trim()||backgroundPath.length>2048||/[\x00-\x1f\x7f]/.test(backgroundPath)||/^(?:data|javascript):/i.test(backgroundPath))throw Error('Choose a real uploaded background image path.');
    if(!Number.isInteger(gridSize)||gridSize<50||gridSize>200)throw Error('Use a grid size between 50 and 200 pixels.');
    if(!['day','night'].includes(time))throw Error('Choose day or night lighting.');
    const key=identity(JSON.stringify({...data,gridSize,time})),id=label=>identity(key+':'+label).slice(0,16),level=id('level');
    const width=data.cols*gridSize,height=data.rows*gridSize,night=time==='night';
    return {
      _stats:{coreVersion:CORE_VERSION},_id:id('scene'),name:data.name,active:false,navigation:false,navOrder:0,
      width,height,padding:0,shiftX:0,shiftY:0,initial:{x:width/2,y:height/2,scale:.3},initialLevel:level,
      thumb:backgroundPath,
      grid:{type:1,size:gridSize,distance:5,units:'ft',alpha:.15,color:'#b8b0a0',style:'solidLines',thickness:1},
      tokenVision:true,
      environment:{darknessLevel:night?.8:0,darknessLock:true,cycle:false,globalLight:{enabled:!night,bright:!night,darkness:{min:0,max:1}}},
      levels:[{_id:level,name:'Battle map',elevation:{bottom:null,top:null},background:{src:backgroundPath,color:'#252820'},textures:{fit:'fill',scaleX:1,scaleY:1,anchorX:.5,anchorY:.5,offsetX:0,offsetY:0,rotation:0}}],
      walls:data.walls.map((wall,i)=>{
        const sense=wall.kind==='window'?0:wall.kind==='terrain'?10:20;
        return {_id:id('wall-'+i),c:[...wall.a,...wall.b].map(n=>Math.round(n*gridSize)),levels:[level],move:20,sight:sense,light:sense,sound:0,dir:0,door:wall.kind==='door'?1:0,ds:0};
      }),
      lights:data.lights.map((light,i)=>({_id:id('light-'+i),name:'Map light '+(i+1),x:Math.round(light.x*gridSize),y:Math.round(light.y*gridSize),elevation:3,levels:[level],rotation:0,walls:true,vision:false,hidden:false,
        config:{bright:light.bright*5,dim:light.dim*5,angle:360,color:light.color,alpha:light.alpha,luminosity:.5,attenuation:.5,darkness:{min:night?0:.25,max:1},animation:{type:'torch',speed:2,intensity:3}}})),
      tokens:[],notes:[],sounds:[],drawings:[],regions:[],tiles:[],ownership:{default:0},
      flags:{world:{[FLAG]:{version:1,key,seed:data.seed,kind:data.kind,terrain:data.terrain,source:data.source,generated:true}}}
    };
  }
  // This function is serialized into the export. It has no closure dependencies,
  // no network service keys, and never evaluates authored map text as code.
  async function importBattlemap(payload){
    const flag='saerothAtlasBattlemap',notice=ui.notifications;
    if(!game.user?.isGM){notice.error('Only a GM can import this battle map.');return;}
    if(!game.version||foundry.utils.isNewerVersion('14.364',game.version)){notice.error('This battle map needs Foundry VTT 14.364 or newer.');return;}
    const SceneClass=CONFIG.Scene.documentClass,Picker=foundry.applications.apps.FilePicker.implementation;
    const key=payload.scene.flags.world[flag].key,sceneId=payload.scene._id;
    const existing=()=>game.scenes.get(sceneId)||game.scenes.find(s=>s.flags?.world?.[flag]?.key===key);
    const reportExisting=doc=>{
      if(doc.flags?.world?.[flag]?.key!==key)throw Error('This scene ID belongs to a different scene. Reroll the map before importing.');
      notice.info('This battle map is already in Scenes. It was kept unchanged.');return doc;
    };
    const locks=globalThis[Symbol.for('saeroth.atlas.imports')]??=new Set();
    if(locks.has(key)){notice.warn('This battle map is already being imported.');return;}
    locks.add(key);
    let uploadedPath='';
    try{
      const prior=existing();if(prior)return reportExisting(prior);
      const world=String(game.world?.id||'');if(!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(world))throw Error('The current world has an unsupported folder name.');
      const decoded=Uint8Array.from(atob(payload.image),char=>char.charCodeAt(0));
      const file=new File([decoded],'battlemap-'+foundry.utils.randomID(24)+'.'+payload.extension,{type:payload.mime});
      const bitmap=await createImageBitmap(file);
      const matching=bitmap.width===payload.scene.width&&bitmap.height===payload.scene.height;bitmap.close();
      if(!matching)throw Error('The background dimensions do not match the scene grid. Nothing was created.');
      const folder='worlds/'+world+'/saeroth-atlas',parent='worlds/'+world;
      const listing=await Picker.browse('data',parent);
      if(!listing.dirs?.some(dir=>String(dir).replace(/\/$/,'')===folder)){
        try{await Picker.createDirectory('data',folder);}
        catch(error){const retry=await Picker.browse('data',parent);if(!retry.dirs?.some(dir=>String(dir).replace(/\/$/,'')===folder))throw error;}
      }
      notice.info('Uploading battle map artwork…');
      const upload=await Picker.upload('data',folder,file,{}, {notify:false});
      if(!upload||typeof upload.path!=='string'||!upload.path.trim()||/[\x00-\x1f]/.test(upload.path)||/^(?:data|javascript):/i.test(upload.path))throw Error('The background upload did not return an image path. No scene was created.');
      uploadedPath=upload.path;
      const texture=await foundry.canvas.loadTexture(uploadedPath);
      if(!texture?.valid||texture.width!==payload.scene.width||texture.height!==payload.scene.height)throw Error('Foundry could not load the uploaded background at the correct size. No scene was created.');
      const afterUpload=existing();if(afterUpload)return reportExisting(afterUpload);
      const data=foundry.utils.deepClone(payload.scene);
      data.levels[0].background.src=uploadedPath;data.thumb=uploadedPath;
      data.flags.world[flag].asset=uploadedPath;
      // keepId prevents two clients importing the same export from creating two
      // scenes. No existing scene is updated, activated, or deleted.
      let created;
      try{created=await SceneClass.create(data,{keepId:true,renderSheet:false});}
      catch(error){const raced=existing();if(raced)return reportExisting(raced);throw error;}
      if(!created)throw Error('Foundry did not create the scene.');
      notice.info('Battle map created in Scenes: '+created.name+'. Open it when you are ready.');
      return created;
    }catch(error){
      const suffix=uploadedPath?' The uploaded artwork remains in the world\'s saeroth-atlas folder; you can reuse or remove it in the File Browser.':'';
      notice.error('Battle map import failed: '+(error?.message||'Unknown error.')+suffix);
      console.error('Saeroth battle map import:',error);
    }finally{locks.delete(key);}
  }
  function macro(map,{imageDataUrl,time='day'}={}){
    if(typeof imageDataUrl!=='string'||imageDataUrl.length>28*1024*1024)throw Error('The background must be a WebP or PNG under 20 MiB.');
    const image=/^data:image\/(webp|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageDataUrl);
    if(!image||image[2].length%4!==0||image[2].length<16)throw Error('The background must be an embedded WebP or PNG image.');
    if(image[2].length/4*3-(image[2].match(/=+$/)?.[0].length||0)>20*1024*1024)throw Error('The background must be under 20 MiB.');
    const header=typeof atob==='function'?atob(image[2].slice(0,16)):Buffer.from(image[2].slice(0,16),'base64').toString('binary');
    if(image[1]==='webp'?(header.slice(0,4)!=='RIFF'||header.slice(8,12)!=='WEBP'):!header.startsWith('\x89PNG\r\n\x1a\n'))throw Error('The background image format is invalid.');
    const data=scene(map,{backgroundPath:'saeroth-atlas-pending.'+image[1],time});
    const key=identity(data.flags.world[FLAG].key+imageDataUrl);
    data._id=identity(key+':scene').slice(0,16);data.flags.world[FLAG].key=key;
    const payload={scene:data,image:image[2],mime:'image/'+image[1],extension:image[1]};
    return {_stats:{coreVersion:CORE_VERSION},name:'Import battle map — '+data.name,type:'script',scope:'global',img:'icons/svg/dice-target.svg',ownership:{default:0},
      command:'// Saeroth atlas: imports its bundled artwork and a new inactive scene.\nreturn await ('+importBattlemap.toString()+')('+JSON.stringify(payload)+');',
      flags:{world:{[FLAG]:{version:1,key,source:data.flags.world[FLAG].source}}}};
  }
  return Object.freeze({scene,macro,minimumVersion:CORE_VERSION});
});
