/* Browser-only image preparation and durable draft artwork. No publishing credentials. */
(() => {
  'use strict';
  const SOURCE_BYTES=20*1024*1024, SOURCE_SIDE=8192, SOURCE_PIXELS=40000000;
  const DB='saeroth-entry-artwork-v1', memory=new Map();
  let database;
  const shared=()=>{if(!window.SaerothEditorAsset)throw Error('Image support has not loaded. Reload the site and try again.');return window.SaerothEditorAsset;};
  const base64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
  const decode=data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0));
  const key=(scope,sha)=>scope+':'+sha;
  function validLocal(value) {
    if(!value||value.version!==1||value.mime!=='image/webp'||!/^[a-f0-9]{64}$/.test(value.sha256)||
      !Number.isInteger(value.bytes)||value.bytes<1||value.bytes>2*1024*1024||typeof value.alt!=='string'||
      value.alt.length>150||/[\x00-\x1f\x7f]/.test(value.alt))throw Error('The saved image information is invalid.');
    return {version:1,mime:'image/webp',sha256:value.sha256,bytes:value.bytes,alt:value.alt};
  }
  function sourceDimensions(bytes) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(from,n)=>String.fromCharCode(...bytes.subarray(from,from+n));
    if(bytes.length>=24&&ascii(0,8)==='\x89PNG\r\n\x1a\n'&&ascii(12,4)==='IHDR')return {mime:'image/png',width:view.getUint32(16),height:view.getUint32(20)};
    if(bytes.length>=25&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
      const kind=ascii(12,4),u24=at=>bytes[at]+bytes[at+1]*256+bytes[at+2]*65536;
      if(kind==='VP8X'&&bytes.length>=30)return {mime:'image/webp',width:u24(24)+1,height:u24(27)+1};
      if(kind==='VP8 '&&bytes.length>=30&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a)return {mime:'image/webp',width:view.getUint16(26,true)&0x3fff,height:view.getUint16(28,true)&0x3fff};
      if(kind==='VP8L'&&bytes[20]===0x2f)return {mime:'image/webp',width:1+bytes[21]+((bytes[22]&0x3f)<<8),height:1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&0x0f)<<10)};
    }
    if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
      let offset=2;
      while(offset+4<=bytes.length){
        if(bytes[offset++]!==255)throw Error('This JPEG could not be read. Choose another image.');
        while(bytes[offset]===255)offset++;
        const marker=bytes[offset++];if(marker===217||marker===218)break;
        if(marker===1||(marker>=208&&marker<=215))continue;
        if(offset+2>bytes.length)break;
        const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break;
        if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
          if(length<8)break;return {mime:'image/jpeg',height:view.getUint16(offset+3),width:view.getUint16(offset+5)};
        }
        offset+=length;
      }
    }
    throw Error('Choose a PNG, JPEG, or WebP image. SVG and HEIC are not supported.');
  }
  async function prepare(file) {
    if(!(file instanceof Blob)||file.size<1||file.size>SOURCE_BYTES)throw Error('Choose an image no larger than 20 MiB.');
    const bytes=new Uint8Array(await file.arrayBuffer()),info=sourceDimensions(bytes);
    if(!info.width||!info.height||info.width>SOURCE_SIDE||info.height>SOURCE_SIDE||info.width*info.height>SOURCE_PIXELS)throw Error('Choose an image no larger than 8192 pixels per side and 40 megapixels.');
    let bitmap,canvas;
    try {
      bitmap=await createImageBitmap(new Blob([bytes],{type:info.mime}),{imageOrientation:'from-image'});
      if(bitmap.width>SOURCE_SIDE||bitmap.height>SOURCE_SIDE||bitmap.width*bitmap.height>SOURCE_PIXELS)throw Error('The decoded image is too large. Resize it before uploading.');
      const ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));
      let width=Math.max(1,Math.round(bitmap.width*ratio)),height=Math.max(1,Math.round(bitmap.height*ratio)),blob;
      canvas=document.createElement('canvas');
      for(let attempt=0;attempt<5;attempt++){
        canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');if(!context)throw Error('This browser could not prepare the image. Try another browser.');
        context.drawImage(bitmap,0,0,width,height);
        blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(Error('The image could not be encoded. Choose a smaller image.')),'image/webp',attempt?0.78:0.88));
        if(blob.type!=='image/webp')throw Error('This browser cannot save WebP images. Use a current version of Chrome, Safari, Firefox, or Edge.');
        if(blob.size<=shared().LIMIT_BYTES)break;
        width=Math.max(1,Math.floor(width*.75));height=Math.max(1,Math.floor(height*.75));
      }
      if(!blob||blob.size>shared().LIMIT_BYTES)throw Error('The prepared image is still too large. Choose a smaller image.');
      const output=new Uint8Array(await blob.arrayBuffer()),hash=await crypto.subtle.digest('SHA-256',output);
      const payload=await shared().validate({mime:'image/webp',data:base64(output),bytes:output.length,sha256:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')});
      return {payload,width,height};
    } catch(error){throw Error(error.message||'This image could not be decoded. Choose another PNG, JPEG, or WebP.');}
    finally{bitmap?.close();if(canvas)canvas.width=canvas.height=0;}
  }
  function openDB() {
    if(!database)database=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(Error('Image storage is unavailable.'));return;}
      let request;try{request=indexedDB.open(DB,1);}catch(error){reject(error);return;}
      const timeout=setTimeout(()=>reject(Error('Image storage did not respond.')),4000);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('images'))request.result.createObjectStore('images');};
      request.onerror=()=>{clearTimeout(timeout);reject(request.error||Error('Image storage is unavailable.'));};
      request.onblocked=()=>{clearTimeout(timeout);reject(Error('Image storage is blocked. Close older campaign tabs and retry.'));};
      request.onsuccess=()=>{clearTimeout(timeout);const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
    }).catch(error=>{database=null;throw error;});
    return database;
  }
  async function stored(mode,action) {
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('images',mode),store=tx.objectStore('images');let result;
      try{const request=action(store);request.onsuccess=()=>{result=request.result;};}catch(error){reject(error);return;}
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('The image could not be saved on this device.'));
    });
  }
  async function keep(scope,input) {
    const payload=await verified(input),id=key(scope,payload.sha256);
    memory.set(id,{payload,saved:false});
    try{await stored('readwrite',store=>store.put(new Blob([decode(payload.data)],{type:payload.mime}),id));memory.set(id,{payload,saved:true});return {payload,saved:true};}
    catch(_){return {payload,saved:false};}
  }
  async function load(scope,descriptor) {
    const meta=validLocal(descriptor),id=key(scope,meta.sha256),cached=memory.get(id);
    if(cached){if(cached.payload.bytes!==meta.bytes)throw Error('The saved image size does not match its draft.');return cached;}
    let blob;try{blob=await stored('readonly',store=>store.get(id));}catch(_){throw Error('The draft image could not be opened. Restore its draft backup or choose the image again.');}
    if(!(blob instanceof Blob))throw Error('This draft’s image is missing from this browser. Restore its draft backup or choose the image again.');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const payload=await verified({mime:meta.mime,bytes:meta.bytes,sha256:meta.sha256,data:base64(bytes)});
    const result={payload,saved:true};memory.set(id,result);return result;
  }
  function url(payload){return URL.createObjectURL(new Blob([decode(payload.data)],{type:payload.mime}));}
  async function verified(input){
    const payload=await shared().validate(input);let bitmap;
    try{bitmap=await createImageBitmap(new Blob([decode(payload.data)],{type:payload.mime}));if(bitmap.width<1||bitmap.height<1||bitmap.width>2048||bitmap.height>2048)throw Error('Invalid image dimensions.');}
    catch(_){throw Error('The saved artwork cannot be decoded. Restore a valid backup or choose the image again.');}
    finally{bitmap?.close();}
    return payload;
  }
  function local(payload,alt){return validLocal({version:1,mime:payload.mime,bytes:payload.bytes,sha256:payload.sha256,alt});}
  window.SaerothEditorImages={prepare,keep,load,url,local,validLocal,sourceDimensions,verified,MAX_BACKUP_BYTES:5*1024*1024};
})();
