import {LIMITS,MINIMUM_FOUNDRY,validatePackage,assetReference,decodeAsset,assetByteLength,documentIdentity,digest,canonicalJSON} from './session-package.mjs';

const MODULE_ID='saeroth-pf2e-content',FLAG='sessionInbox';
const imageExtensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const htmlTags=new Set('a p br hr div span h1 h2 h3 h4 h5 h6 strong b em i s del u small sup sub ul ol li dl dt dd blockquote pre code table thead tbody tfoot tr th td caption img details summary'.split(' '));
const htmlAttributes=new Set(['title','alt','colspan','rowspan','width','height','href','src','start','reversed','open']);
const values=collection=>Array.from(collection?.contents??collection?.values?.()??[]);
const flag=doc=>doc?.flags?.[MODULE_ID]?.[FLAG];
const actorKey=doc=>doc?.flags?.[MODULE_ID]?.syncKey??doc?.flags?.[MODULE_ID]?.source??doc?.flags?.saeroth?.syncKey??doc?.flags?.saeroth?.source;
const clone=structuredClone;

/** Runtime API is dependency-injected so tests never require a running world. */
export function createSessionInbox(env=globalThis) {
  const locks=new Set();
  const documentClass=type=>env.CONFIG?.[type]?.documentClass??env[type];
  const now=()=>Date.now();
  function guard() {
    if(!env.game?.user?.isGM)throw Error('Only a GM can import a Saeroth session.');
    if(env.game.system?.id!=='pf2e')throw Error('Saeroth session imports need a Pathfinder 2e world.');
    if(!env.game.version||env.foundry.utils.isNewerVersion(MINIMUM_FOUNDRY,env.game.version))throw Error(`Session imports need Foundry VTT ${MINIMUM_FOUNDRY} or newer.`);
  }
  function safeHTML(content,assetPaths) {
    // Parse inside inert template content: even discarded srcset/other resource
    // attributes must not trigger network requests while we validate the file.
    const document=new env.DOMParser().parseFromString('','text/html');
    const template=document.createElement('template');template.innerHTML=content;
    for(const element of template.content.querySelectorAll('*')) {
      const tag=element.localName;
      if(!htmlTags.has(tag))throw Error(`Journal contains an unsupported <${tag}> element.`);
      for(const attribute of [...element.attributes]) {
        const name=attribute.name.toLowerCase();
        if(name.startsWith('on')||name==='srcdoc')throw Error('Journal contains an active HTML attribute.');
        if(!htmlAttributes.has(name)){element.removeAttribute(attribute.name);continue;}
        if(name==='src') {
          const id=assetReference(attribute.value);
          if(tag!=='img'||!id||!assetPaths.has(id))throw Error('Journal images must use bundled artwork.');
          element.setAttribute('src',assetPaths.get(id));
        } else if(name==='href') {
          const value=attribute.value.trim();
          if(!/^https?:\/\//i.test(value)){element.removeAttribute(name);continue;}
          let url;try{url=new URL(value);}catch{throw Error('Journal contains an invalid hyperlink.');}
          if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Journal contains an unsafe hyperlink.');
          element.setAttribute('href',url.href);element.setAttribute('rel','noopener noreferrer');
        } else if(['width','height','rowspan','colspan','start'].includes(name)&&!/^\d{1,4}$/.test(attribute.value))element.removeAttribute(name);
      }
      if(tag==='img'&&!element.hasAttribute('src'))throw Error('Journal image is missing its bundled artwork.');
    }
    return template.innerHTML;
  }
  async function imageInfo(asset) {
    const bytes=decodeAsset(asset),file=new env.File([bytes],asset.id+'.'+imageExtensions[asset.mime],{type:asset.mime});
    let bitmap;
    try{bitmap=await env.createImageBitmap(file);const info={width:bitmap.width,height:bitmap.height};if(info.width<1||info.height<1||info.width>8192||info.height>8192||info.width*info.height>40_000_000)throw Error('Image dimensions exceed the supported size.');return info;}
    catch(error){throw Error(`Could not read artwork “${asset.name}”: ${error.message}`);}
    finally{bitmap?.close();}
  }
  function validateDocument(type,data) {
    const candidate=new (documentClass(type))(clone(data),{strict:true});
    if(candidate.validate({strict:true})===false)throw Error(`${type} failed native Foundry validation.`);
  }
  async function identities(bundle) {
    return {journal:await documentIdentity(bundle.id,'journal'),scene:bundle.scene?await documentIdentity(bundle.id,'scene'):null};
  }
  function matching(collection,id,bundleId,kind) {
    const doc=collection?.get(id);if(!doc)return null;
    if(flag(doc)?.bundleId!==bundleId||flag(doc)?.kind!==kind)throw Error(`A different ${kind} already uses this import ID. No documents were changed.`);
    return doc;
  }
  async function findActors(refs) {
    const results=[],missing=[];let packed;
    for(const ref of refs) {
      const existing=values(env.game.actors).filter(a=>a.type==='npc'&&actorKey(a)===ref.key);
      if(existing.length){results.push({...ref,document:existing[0],existing:true,warning:existing.length>1?`Multiple world actors match ${ref.name}; reusing ${existing[0].name} (${existing[0].id}) without changes.`:null});continue;}
      // Explicit live sync is the GM's newest campaign revision. Use it before
      // the installed module snapshot, while always preserving world actors.
      if(!packed){packed=[];for(const key of ['world.saeroth-synced-creatures',`${MODULE_ID}.saeroth-actors`]){const pack=env.game.packs.get(key);if(pack)packed.push(...await pack.getDocuments());}}
      const source=packed.find(a=>a.type==='npc'&&actorKey(a)===ref.key);
      if(!source){missing.push(ref.name);continue;}
      results.push({...ref,document:source,existing:false});
    }
    if(missing.length)throw Error(`These NPCs are missing from the Saeroth packs: ${missing.join(', ')}. Use Sync Saeroth Content or install the current module, then preview again.`);
    return results;
  }
  async function actorData(entry,bundleId,operation) {
    const data=entry.document.toObject();
    data._id=(await digest('saeroth-session-actor:'+entry.key)).slice(0,16);
    delete data.folder;delete data._stats;delete data.prototypeToken?.depth;
    data.ownership={default:0};
    data.flags??={};data.flags[MODULE_ID]={...data.flags.saeroth,...data.flags[MODULE_ID],source:entry.key,syncKey:entry.key,[FLAG]:{bundleId,kind:'actor',sourceKey:entry.key,operation}};delete data.flags.saeroth;
    // Imported compendium actors are copied, never edited in their source pack.
    data.prototypeToken??={};data.prototypeToken.actorLink=false;
    return data;
  }
  async function journalData(bundle,paths,ids,operation,state='pending') {
    const data=clone(bundle.journal);data._id=ids.journal;
    for(const [index,page] of data.pages.entries()){page._id=await documentIdentity(bundle.id,'page',String(index));page.text.content=safeHTML(page.text.content,paths);}
    data.flags={[MODULE_ID]:{[FLAG]:{bundleId:bundle.id,kind:'journal',operation,state,startedAt:now(),assetPaths:Object.fromEntries(paths),actorKeys:bundle.actors.map(a=>a.key)}}};
    return data;
  }
  function sceneData(bundle,paths,ids,operation) {
    if(!bundle.scene)return null;const data=clone(bundle.scene);data._id=ids.scene;
    data.levels[0].background.src=paths.get(assetReference(data.levels[0].background.src));data.thumb=data.levels[0].background.src;
    data.flags={[MODULE_ID]:{[FLAG]:{bundleId:bundle.id,kind:'scene',operation}}};return data;
  }
  async function prepare(input,{images=true}={}) {
    guard();const bundle=await validatePackage(input),ids=await identities(bundle);
    const journal=matching(env.game.journal,ids.journal,bundle.id,'journal'),scene=ids.scene?matching(env.game.scenes,ids.scene,bundle.id,'scene'):null;
    const complete=journal&&flag(journal).state==='complete'&&(!bundle.scene||scene);
    if(complete)return {bundle,ids,journal,scene,complete:true,actors:[],images:new Map(),warnings:[]};
    const actors=await findActors(bundle.actors),info=new Map();
    if(images)for(const asset of bundle.assets)info.set(asset.id,await imageInfo(asset));
    if(bundle.scene&&images){const bg=info.get(assetReference(bundle.scene.levels[0].background.src));if(bg.width!==bundle.scene.width||bg.height!==bundle.scene.height)throw Error('The map image dimensions do not match its walls and grid. Export this map again.');}
    const placeholders=new Map(bundle.assets.map(a=>[a.id,'worlds/saeroth-preview/'+a.id+'.'+imageExtensions[a.mime]]));
    const j=await journalData(bundle,placeholders,ids,'preview');validateDocument('JournalEntry',j);
    if(bundle.scene)validateDocument('Scene',sceneData(bundle,placeholders,ids,'preview'));
    for(const actor of actors)if(!actor.existing){const data=await actorData(actor,bundle.id,'preview');const collision=env.game.actors.get(data._id);if(collision&&actorKey(collision)!==actor.key)throw Error(`A different actor uses the import ID for ${actor.name}.`);validateDocument('Actor',data);}
    return {bundle,ids,journal,scene,complete:false,actors,images:info,warnings:actors.map(a=>a.warning).filter(Boolean)};
  }
  function summary(plan) {
    const {bundle,journal,scene}=plan;const incomplete=!!journal&&!plan.complete;
    return {id:bundle.id,name:bundle.name,complete:plan.complete,incomplete,
      canResume:incomplete&&(flag(journal).state==='failed'||now()-(flag(journal).startedAt??0)>5*60*1000),
      pages:bundle.journal.pages.map(p=>p.name),scene:bundle.scene?{name:bundle.scene.name,width:bundle.scene.width,height:bundle.scene.height,walls:bundle.scene.walls.length,lights:bundle.scene.lights.length,existing:!!scene}:null,
      actors:plan.complete?bundle.actors.map(a=>({name:a.name,key:a.key,originalImport:true})):plan.actors.map(a=>({name:a.name,key:a.key,reuse:a.existing,uuid:a.document.uuid})),artwork:bundle.assets.length,artworkBytes:bundle.assets.reduce((n,a)=>n+assetByteLength(a),0),warnings:plan.warnings,
      documents:[journal?.uuid,scene?.uuid].filter(Boolean)};
  }
  async function preview(input) {return summary(await prepare(input));}
  function assertClaim(journal,operation) {if(flag(journal)?.operation!==operation)throw Error('Another GM has taken over this import. Preview again before retrying.');}
  async function importPackage(input,{resume=false}={}) {
    guard();const sealed=await validatePackage(input);
    if(locks.has(sealed.id))throw Error('This session is already being imported in this browser.');
    locks.add(sealed.id);
    const created=[],uploaded=[],rollbackSnapshots=new Map(),operation=env.foundry.utils.randomID(24);let claim=null,ownsClaim=false;
    const snapshot=doc=>{const data=doc.toObject();delete data._stats;const state=data.flags?.[MODULE_ID]?.[FLAG];if(state){delete state.startedAt;delete state.completedAt;delete state.state;}return canonicalJSON(data);};
    const track=doc=>{if(!created.includes(doc)){created.push(doc);rollbackSnapshots.set(doc.uuid,snapshot(doc));}return doc;};
    try{
      const plan=await prepare(sealed);if(plan.complete)return {...summary(plan),duplicate:true,created:[]};
      const {bundle,ids}=plan;
      if(plan.journal){
        if(!resume)throw Error('An interrupted or active import exists. Review it in the Session Inbox before resuming.');
        if(!summary(plan).canResume)throw Error('Another import is still active. Wait five minutes after it stops, then preview again.');
      }
      const world=String(env.game.world?.id??'');if(!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(world))throw Error('The current world has an unsupported data folder name.');
      const Picker=env.foundry.applications.apps.FilePicker.implementation,folder=`worlds/${world}/saeroth-sessions`,parent=`worlds/${world}`;
      const paths=new Map();
      if(plan.journal){
        for(const asset of bundle.assets){const path=flag(plan.journal).assetPaths?.[asset.id];if(typeof path!=='string'||!path.startsWith(folder+'/'))throw Error('The previous import has no reusable artwork record. Keep its documents and export a new package instead.');paths.set(asset.id,path);}
      }else if(bundle.assets.length){
        const listing=await Picker.browse('data',parent);
        if(!listing.dirs?.some(d=>String(d).replace(/\/$/,'')===folder)){try{await Picker.createDirectory('data',folder);}catch(error){const again=await Picker.browse('data',parent);if(!again.dirs?.some(d=>String(d).replace(/\/$/,'')===folder))throw error;}}
        for(const asset of bundle.assets){
          const file=new env.File([decodeAsset(asset)],'session-'+env.foundry.utils.randomID(24)+'.'+imageExtensions[asset.mime],{type:asset.mime});
          const result=await Picker.upload('data',folder,file,{}, {notify:false});
          if(!result||typeof result.path!=='string'||!result.path.startsWith(folder+'/')||/[\x00-\x1f]/.test(result.path)||result.path.split('/').some(p=>p==='.'||p==='..'))throw Error(`Artwork upload failed for ${asset.name}. No scene was created.`);
          paths.set(asset.id,result.path);uploaded.push(result.path);
        }
      }
      // Resolve every uploaded/retained image before claiming or creating any
      // documents. A failed upload can never result in an empty scene.
      for(const asset of bundle.assets){const texture=await env.foundry.canvas.loadTexture(paths.get(asset.id));const dimensions=plan.images.get(asset.id);if(!texture?.valid||texture.width!==dimensions.width||texture.height!==dimensions.height)throw Error(`Foundry could not load artwork “${asset.name}” at the expected size.`);}
      const current=matching(env.game.journal,ids.journal,bundle.id,'journal');
      if(current&&!plan.journal){
        if(flag(current).state==='complete'&&(!ids.scene||matching(env.game.scenes,ids.scene,bundle.id,'scene')))return {id:bundle.id,name:bundle.name,duplicate:true,created:[],documents:[current.uuid]};
        throw Error('Another GM started importing this session. Its documents were kept unchanged; preview again when it finishes.');
      }
      if(plan.journal){
        if(current!==plan.journal)throw Error('The previous import changed. Preview again.');
        if(!(flag(current).state==='failed'||now()-(flag(current).startedAt??0)>5*60*1000))throw Error('Another GM resumed this import. Wait for it to finish.');
        await current.update({[`flags.${MODULE_ID}.${FLAG}.operation`]:operation,[`flags.${MODULE_ID}.${FLAG}.state`]:'pending',[`flags.${MODULE_ID}.${FLAG}.startedAt`]:now()});claim=current;
      }else{
        const data=await journalData(bundle,paths,ids,operation);validateDocument('JournalEntry',data);
        try{claim=await documentClass('JournalEntry').create(data,{keepId:true,keepEmbeddedIds:true,renderSheet:false});}
        catch(error){const existing=env.game.journal.get(ids.journal);if(flag(existing)?.operation===operation){claim=existing;track(existing);ownsClaim=true;}throw error;}
        if(!claim)throw Error('Foundry did not create the session journal.');track(claim);ownsClaim=true;
      }
      for(const entry of plan.actors){
        assertClaim(claim,operation);
        // A world actor may have appeared after preview. Keep it, including HP,
        // ownership, equipment, and any edits the GM has made.
        const existing=values(env.game.actors).find(a=>a.type==='npc'&&actorKey(a)===entry.key);if(existing)continue;
        const data=await actorData(entry,bundle.id,operation);validateDocument('Actor',data);
        try{const actor=await documentClass('Actor').create(data,{keepId:true,keepEmbeddedIds:true,renderSheet:false});if(!actor)throw Error(`Foundry did not create ${entry.name}.`);track(actor);}
        catch(error){const actor=env.game.actors.get(data._id);if(flag(actor)?.operation===operation){track(actor);throw error;}if(actor&&actorKey(actor)===entry.key)continue;throw error;}
        await claim.update({[`flags.${MODULE_ID}.${FLAG}.startedAt`]:now()});
      }
      assertClaim(claim,operation);
      if(bundle.scene&&!matching(env.game.scenes,ids.scene,bundle.id,'scene')){
        const data=sceneData(bundle,paths,ids,operation);validateDocument('Scene',data);
        try{const scene=await documentClass('Scene').create(data,{keepId:true,keepEmbeddedIds:true,renderSheet:false});if(!scene)throw Error('Foundry did not create the scene.');track(scene);}
        catch(error){const scene=env.game.scenes.get(data._id);if(flag(scene)?.operation===operation){track(scene);throw error;}if(!scene||flag(scene)?.bundleId!==bundle.id)throw error;}
      }
      assertClaim(claim,operation);
      await claim.update({[`flags.${MODULE_ID}.${FLAG}.state`]:'complete',[`flags.${MODULE_ID}.${FLAG}.completedAt`]:now()});
      return {id:bundle.id,name:bundle.name,duplicate:false,created:created.map(d=>d.uuid),documents:[claim.uuid,ids.scene?env.game.scenes.get(ids.scene)?.uuid:null].filter(Boolean),actorsReused:plan.actors.filter(a=>a.existing).length};
    }catch(error){
      // A completion update may have succeeded even when its reply was lost.
      if(claim&&flag(claim)?.operation===operation&&flag(claim)?.state==='complete'){
        const sceneId=sealed.scene?await documentIdentity(sealed.id,'scene'):null;
        if((!sceneId||flag(env.game.scenes.get(sceneId))?.bundleId===sealed.id)&&sealed.actors.every(ref=>values(env.game.actors).some(actor=>actorKey(actor)===ref.key)))return {id:sealed.id,name:sealed.name,duplicate:false,recovered:true,created:created.map(d=>d.uuid),documents:[claim.uuid,sceneId?env.game.scenes.get(sceneId).uuid:null].filter(Boolean)};
      }
      const remaining=[];
      // A resumed import can adopt documents from an earlier, delayed operation.
      // The displaced operation must not delete those documents out from under it.
      const superseded=claim&&flag(claim)?.operation!==operation;
      for(const doc of [...new Set(created)].reverse()){
        // Another session may have reused this newly created world actor while
        // the current import was waiting. Its journal claim records actorKeys
        // before it resolves/creates actors, including during pending imports.
        const sharedActor=doc.documentName==='Actor'&&(
          values(env.game.journal).some(j=>j.id!==claim?.id&&flag(j)?.actorKeys?.includes(actorKey(doc)))||
          values(env.game.scenes).some(scene=>values(scene.tokens).some(token=>token.actorId===doc.id||token.toObject?.().actorId===doc.id))
        );
        if(superseded||sharedActor||flag(doc)?.operation!==operation||snapshot(doc)!==rollbackSnapshots.get(doc.uuid)){remaining.push(doc.uuid);continue;}
        try{await doc.delete();}catch{remaining.push(doc.uuid);}
      }
      if(claim&&(!ownsClaim||remaining.includes(claim.uuid))&&flag(claim)?.operation===operation){try{await claim.update({[`flags.${MODULE_ID}.${FLAG}.state`]:'failed',[`flags.${MODULE_ID}.${FLAG}.startedAt`]:now()});}catch{}}
      const retained=uploaded.length?' Uploaded artwork remains in the world’s saeroth-sessions folder; no existing files were overwritten.':'';
      const partial=remaining.length?` Cleanup could not remove: ${remaining.join(', ')}. Review these documents before retrying.`:'';
      const failure=new Error(`${error.message}${retained}${partial}`);failure.remainingDocuments=remaining;failure.uploadedAssets=uploaded;throw failure;
    }finally{locks.delete(sealed.id);}
  }
  return {preview,import:importPackage,limits:LIMITS};
}

let inboxAPI,dialog,selection,previewed,revision=0,busy=false;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openSessionInbox() {
  if(!globalThis.game?.user?.isGM)return;
  inboxAPI??=createSessionInbox();
  if(!dialog){
    dialog=document.createElement('dialog');dialog.className='saeroth-session-inbox';dialog.setAttribute('aria-labelledby','saeroth-inbox-title');
    dialog.innerHTML='<header><div><p class="si-eyebrow">TOWERS OF SAEROTH</p><h2 id="saeroth-inbox-title">Import a session</h2></div><button type="button" data-si="close" aria-label="Close session importer">Close ×</button></header><div class="si-body"><p>Choose the session package exported from your campaign desk. Preview its notes, map, and NPCs before adding them to this world.</p><label class="si-file">Session package<input data-si="file" type="file" accept="application/json,.json"></label><button type="button" data-si="refresh" disabled>Refresh preview</button><p class="si-status" data-si="status" role="status" aria-live="polite">Ready for a Saeroth session package.</p><section data-si="preview" aria-label="Package contents" hidden></section></div><footer><p>Creates GM-only notes and an inactive scene. Existing world actors are kept unchanged.</p><button type="button" data-si="import" disabled>Import session</button></footer>';
    document.body.append(dialog);
    dialog.querySelector('[data-si=close]').onclick=()=>{if(!busy)dialog.close();};
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{revision++;selection=null;previewed=null;});
    dialog.querySelector('[data-si=refresh]').onclick=()=>{if(!busy)dialog.querySelector('[data-si=file]').dispatchEvent(new Event('change'));};
    dialog.querySelector('[data-si=file]').onchange=async event=>{
      const file=event.target.files[0],ticket=++revision;selection=null;previewed=null;const output=dialog.querySelector('[data-si=preview]');output.hidden=true;setInboxBusy(true);status('Checking the package…');
      try{
        if(!file){status('Choose a session package.');return;}
        if(file.size>LIMITS.maxFileBytes)throw Error('This package is too large. Export fewer notes or smaller artwork.');
        const parsed=JSON.parse(await file.text()),result=await inboxAPI.preview(parsed);
        if(ticket!==revision||!dialog.open)return;selection=parsed;previewed=result;
        output.innerHTML='<h3>'+escape(result.name)+'</h3><dl><div><dt>Journal pages</dt><dd>'+result.pages.length+'</dd></div><div><dt>NPCs</dt><dd>'+result.actors.length+'</dd></div><div><dt>Artwork</dt><dd>'+result.artwork+' files · '+(result.artworkBytes/1024/1024).toFixed(1)+' MiB</dd></div></dl>'+(result.scene?'<p><strong>'+escape(result.scene.name)+'</strong><br>'+result.scene.width+' × '+result.scene.height+' pixels · '+result.scene.walls+' walls · '+result.scene.lights+' lights</p>':'<p>No battle map selected.</p>')+'<details><summary>Journal pages</summary><ul>'+result.pages.map(p=>'<li>'+escape(p)+'</li>').join('')+'</ul></details>'+(result.actors.length?'<h4>NPCs</h4><ul>'+result.actors.map(a=>'<li>'+escape(a.name)+' <span class="si-pill">'+(result.complete?'Included in original import':a.reuse?'Keep existing':'Copy from compendium')+'</span></li>').join('')+'</ul>':'')+(result.warnings.length?'<p>'+result.warnings.map(escape).join('<br>')+'</p>':'');output.hidden=false;
        status(result.complete?'This session is already imported. Its documents will be kept unchanged.':result.incomplete?(result.canResume?'An interrupted import can be resumed. Its existing documents will be kept unchanged.':'This session has an active or interrupted import. Wait five minutes after it stops, then choose the file again to resume.'):'Preview ready. Import adds the listed content to this world.');
      }catch(error){if(ticket===revision)status(error instanceof SyntaxError?'This is not a valid JSON session package.':error.message,true);}
      finally{if(ticket===revision)setInboxBusy(false);}
    };
    dialog.querySelector('[data-si=import]').onclick=async()=>{
      if(!selection||!previewed||busy)return;setInboxBusy(true);status('Importing artwork and session documents…');
      try{const result=await inboxAPI.import(selection,{resume:previewed.incomplete&&previewed.canResume});status(result.duplicate?'This session was already imported. Its documents were kept unchanged.':'Session imported. Find its notes in Journals, map in Scenes, and NPCs in Actors.');previewed={...previewed,complete:true,incomplete:false};ui.notifications.info('Saeroth: '+(result.duplicate?'session already imported.':'session imported successfully.'));}
      catch(error){previewed=null;status(error.message+' Refresh the preview to review the current world before retrying.',true);ui.notifications.error('Saeroth session import failed. See the importer for recovery details.');}
      finally{setInboxBusy(false);}
    };
  }
  if(!dialog.open){dialog.querySelector('[data-si=file]').value='';dialog.querySelector('[data-si=preview]').hidden=true;selection=null;previewed=null;setInboxBusy(false);status('Ready for a Saeroth session package.');dialog.showModal();dialog.querySelector('[data-si=close]').focus();}
  return dialog;
}
function status(message,error=false){const node=dialog.querySelector('[data-si=status]');node.textContent=message;node.classList.toggle('si-error',error);}
function setInboxBusy(value){busy=value;dialog.setAttribute('aria-busy',String(value));const input=dialog.querySelector('[data-si=file]');input.disabled=value;dialog.querySelector('[data-si=close]').disabled=value;dialog.querySelector('[data-si=refresh]').disabled=value||!input.files?.length;const button=dialog.querySelector('[data-si=import]');button.disabled=value||!selection||!previewed||previewed.complete||(previewed.incomplete&&!previewed.canResume);button.textContent=previewed?.incomplete&&previewed.canResume?'Resume import':'Import session';}
if(globalThis.Hooks){
  Hooks.once('ready',()=>{if(!game.user?.isGM)return;inboxAPI=createSessionInbox();game.saerothContent??={};game.saerothContent.sessionInbox={...inboxAPI,open:openSessionInbox};});
  for(const hook of ['renderSceneDirectory','renderJournalDirectory'])Hooks.on(hook,(_app,html)=>{
    if(!game.user?.isGM)return;const root=html instanceof HTMLElement?html:html?.[0];if(!root||root.querySelector('.saeroth-session-inbox-button'))return;
    const button=document.createElement('button');button.type='button';button.className='saeroth-session-inbox-button';button.innerHTML='<i class="fas fa-box-open" aria-hidden="true"></i> Import Saeroth Session';button.addEventListener('click',openSessionInbox);(root.querySelector('.directory-footer,footer')??root).append(button);
  });
}
