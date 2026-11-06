'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const publish=require('../../.github/scripts/campaign-editor-publish.cjs');
const artwork=require('../../site/editor-asset.js');
const {artworkFixtures}=require('./publisher.cjs');
const crypto=require('node:crypto');
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40),R='1'.repeat(40),OP='e'.repeat(64);
const fullName='Milec/Towers-of-Saeroth',notePath='campaign/npcs/Editor Test.md';
const registryPath='campaign/world/Campaign Library.md',registryBefore='---\ntitle: Campaign Library\ntype: index\n---\n\n# Campaign Library\n';
const registryAfter=registryBefore+'\n- [[Editor Test]]\n';
const note='---\ntitle: Editor Test\ntype: npc\n---\n\nA valid test entry.\n';
const meta={version:1,path:notePath,baseBlob:null,baseHead:B,operation:OP};
const body=value=>'An entry saved from the website.\n\n<!-- saeroth-entry-editor -->\nsaeroth_entry: '+JSON.stringify(value);
const imagePayload=artworkFixtures[0],imageDescriptor=artwork.descriptor(notePath,imagePayload),imagePath=imageDescriptor.path,I='2'.repeat(40);
const imageBlob={sha:I,size:imagePayload.bytes,encoding:'base64',content:imagePayload.data};
const artMeta={...meta,version:2,asset:imageDescriptor},artNote=note+'\n![Portrait]('+artwork.filename(imagePayload.sha256)+')\n';
const artFiles=[{filename:notePath,status:'added',sha:C},{filename:registryPath,status:'modified',sha:R},{filename:imagePath,status:'added',sha:I}];
async function scenario(change={}){
 const calls=[],run={id:123,status:'completed',name:'Verify repository and interface',path:'.github/workflows/verify.yml',conclusion:'success',event:'pull_request',head_repository:{full_name:fullName},head_branch:'entry-editor-0123456789abcdef',head_sha:A,...change.run};
 const pr={number:42,state:'open',draft:false,merged:false,base:{ref:'main',sha:B,repo:{full_name:fullName}},user:{login:'TrustedWriter'},head:{repo:{full_name:fullName},ref:run.head_branch,sha:A},body:body(meta),...change.pr};
 const files=change.files||[{filename:notePath,status:'added',sha:C},{filename:registryPath,status:'modified',sha:R}];
 let reads=0;
 const github={rest:{
  pulls:{list:'pulls',get:async()=>({data:++reads===1?pr:{...pr,...change.latest}}),merge:async args=>{calls.push(['merge',args]);if(change.mergeError)throw Object.assign(Error('Head changed'),{status:409});return {data:{merged:change.mergeResult!==false}};}},
  repos:{getCollaboratorPermissionLevel:async args=>{calls.push(['permission',args]);return {data:{permission:change.permission||'write'}};},
   compareCommitsWithBasehead:async args=>{calls.push(['compare',args]);return {data:args.basehead===`${pr.base.sha}...${run.head_sha}`?{files,status:'ahead'}:{status:change.ancestry||'ahead'}};},
   getContent:async args=>{calls.push(['source',args]);if(args.path===registryPath){const source=change.registryBefore===undefined?registryBefore:change.registryBefore;return {data:{type:'file',sha:R,size:Buffer.byteLength(source),encoding:'base64',content:Buffer.from(source).toString('base64')}};}if(args.path===imagePath){const value=args.ref===A?(change.imageAtHead===undefined?{type:'file',sha:I}:change.imageAtHead):args.ref==='main'?change.imageOnMain:change.imageAtBase;if(value)return {data:value};throw Object.assign(Error('Not found'),{status:404});}if(args.ref==='main'&&Object.hasOwn(change,'currentEntry')){if(change.currentEntry)return {data:change.currentEntry};throw Object.assign(Error('Not found'),{status:404});}if(change.original)return {data:change.original};throw Object.assign(Error('Not found'),{status:404});}},
  git:{getBlob:async args=>{calls.push(['blob',args]);if(args.file_sha===I)return {data:change.imageBlob||imageBlob};if(args.file_sha===R){const source=change.registryAfter===undefined?registryAfter:change.registryAfter;return {data:{sha:R,size:Buffer.byteLength(source),encoding:'base64',content:Buffer.from(source).toString('base64')}};}const source=change.note===undefined?note:change.note;return {data:change.blob||{sha:C,size:Buffer.byteLength(source),encoding:'base64',content:Buffer.from(source).toString('base64')}};}},
  actions:{listJobsForWorkflowRun:'jobs',createWorkflowDispatch:async args=>{calls.push(['deploy',args]);if(change.dispatchError)throw Error('Pages dispatch unavailable');}}
 },paginate:async endpoint=>endpoint==='pulls'?(change.candidates===undefined?[pr]:change.candidates):change.jobs||[{name:'verify',status:'completed',conclusion:'success'}]};
 let result,error;try{result=await publish({github,context:{repo:{owner:'Milec',repo:'Towers-of-Saeroth'},payload:{workflow_run:run}}});}catch(e){error=e;}
 return {calls,result,error,writes:calls.filter(([name])=>name==='merge'||name==='deploy')};
}
(async()=>{
 const valid=await scenario();assert.equal(valid.error,undefined);assert.equal(valid.result.merged,true);assert.deepEqual(valid.writes.map(c=>c[0]),['merge','deploy']);assert.equal(valid.writes[0][1].sha,A);assert.equal(valid.writes[0][1].merge_method,'squash');assert.equal(valid.writes[1][1].workflow_id,'pages.yml');
 assert(valid.calls.some(([name,args])=>name==='compare'&&args.basehead===B+'...'+A));
 for(const permission of ['admin','maintain'])assert.equal((await scenario({permission})).result.merged,true);
 const edit={...meta,baseBlob:D};
 assert.equal((await scenario({pr:{body:body(edit)},files:[{filename:notePath,status:'modified',sha:C}],original:{type:'file',sha:D}})).result.merged,true);
 assert.equal((await scenario({pr:{body:body({...meta,baseHead:D})}})).result.merged,true);
 for(const change of [
  {run:{conclusion:'failure'}},{run:{status:'in_progress'}},{run:{event:'push'}},{run:{name:'Spoofed verification'}},{run:{path:'.github/workflows/forged.yml'}},
  {run:{head_branch:'feature/unrelated'}},{run:{head_branch:'entry-editor-../main'}},{run:{head_repository:{full_name:'Someone/fork'}}},
  {pr:{head:{repo:{full_name:'Someone/fork'},ref:'entry-editor-0123456789abcdef',sha:A}}},{pr:{draft:true}},{pr:{state:'closed'}},{pr:{base:{ref:'other',sha:B,repo:{full_name:fullName}}}},
  {pr:{body:'Ordinary PR'}},{pr:{body:body(meta)+'\n<!-- saeroth-entry-editor -->'}},{pr:{body:body({...meta,path:'site/app.js'})}},{pr:{body:body({...meta,extra:'unapproved'})}},
  {pr:{body:body(meta).replace('saeroth_entry:','saeroth_entry: invalid')}},{pr:{body:body({...meta,operation:'bad'})}},{pr:{body:body({...meta,baseHead:'bad'})}},
  {pr:{head:{repo:{full_name:fullName},ref:'entry-editor-0123456789abcdef',sha:D}}},{permission:'read'},{permission:'none'},
  {jobs:[{name:'verify',status:'completed',conclusion:'failure'}]},{jobs:[{name:'verify',status:'queued',conclusion:null}]},{jobs:[]},
  {jobs:[{name:'verify',status:'completed',conclusion:'success'},{name:'important',status:'completed',conclusion:'skipped'}]},
  {files:[]},{files:[{filename:notePath,status:'added',sha:C},{filename:'site/app.js',status:'modified',sha:D}]},
  {files:[{filename:notePath,status:'added',sha:C}]},
  {files:[{filename:notePath,status:'added',sha:C},{filename:registryPath,status:'removed',sha:R}]},
  {registryAfter:registryBefore+'\n- [[Different Note]]\n'},
  {registryAfter:registryAfter+'\n- [[Unapproved Second Entry]]\n'},
  {registryAfter:registryBefore.replace('# Campaign Library','# Removed original text')+'\n- [[Editor Test]]\n'},
  {registryBefore:registryBefore+'\n- [[Another Editor]]\n'},
  {currentEntry:{type:'file',sha:D}},
  {files:[{filename:'site/app.js',status:'modified',sha:C}]},{files:[{filename:notePath,status:'removed',sha:C}]},
  {files:[{filename:notePath,status:'renamed',previous_filename:'campaign/Original.md',sha:C}]},
  {files:[{filename:notePath,status:'added',previous_filename:'site/app.js',sha:C}]},{files:[{filename:notePath,status:'modified',sha:C}]},
  {original:{type:'file',sha:D}},{pr:{body:body(edit)},files:[{filename:notePath,status:'modified',sha:C}],original:{type:'file',sha:B}},
  {pr:{body:body(edit)},files:[{filename:notePath,status:'modified',sha:C}],original:{type:'file',sha:D},currentEntry:{type:'file',sha:B}},
  {pr:{body:body({...meta,baseHead:D})},ancestry:'diverged'},
  {note:'no frontmatter'},{note:'---\ntitle: X\ntitle: Duplicate\ntype: npc\n---\nHello'},
  {note:'---\ntitle: ""\ntype: npc\n---\nHello'},{note:'---\ntitle: X\ntype: ../script\n---\nHello'},
  {note:'---\ntitle: "unclosed\ntype: npc\n---\nHello'},{note:'---\ntitle: "\\u0000"\ntype: npc\n---\nHello'},
  {note:note+'x'.repeat(128*1024)},{blob:{sha:C,encoding:'base64',size:2,content:Buffer.from([0xff,0xff]).toString('base64')}},
  {latest:{head:{repo:{full_name:fullName},ref:'entry-editor-0123456789abcdef',sha:D}}},
  {latest:{base:{ref:'main',sha:D,repo:{full_name:fullName}}}},{latest:{body:body({...meta,path:'campaign/Other.md'})}},{latest:{user:{login:'OtherWriter'}}},
  {latest:{head:{repo:{full_name:fullName},ref:'entry-editor-new-branch',sha:A}}},{candidates:[]},{candidates:[{number:1},{number:2}]}
 ]){const check=await scenario(change);assert.equal(check.error,undefined,JSON.stringify(change));assert.equal(check.writes.length,0,JSON.stringify(change));}
 for(const filename of [registryPath,'campaign/.hidden/Test.md','campaign/world/../Test.md','campaign/world/%2e%2e/Test.md','campaign/AGENTS.md','campaign/world/CLAUDE.md','campaign/SKILL.md','campaign/CON.md','campaign/world/a?.md','campaign/world/space /Test.md','players/Test.md','vault/Test.md','campaign/../../site/script.md'])assert.equal(publish.allowedPath(filename),false,filename);
 assert(publish.allowedPath('campaign/README.md'));assert(publish.allowedPath('campaign/nations/Vaelic Principality/locations/A Place.md'));
 assert.equal((await scenario({files:[{filename:notePath,status:'added',sha:C}],registryBefore:registryAfter})).result.merged,true,'A pre-existing exact registry line needs no duplicate edit.');
 const race=await scenario({mergeError:true});assert.equal(race.error.status,409);assert.equal(race.writes.length,1,'A branch race must not dispatch Pages.');
 const refused=await scenario({mergeResult:false});assert(refused.error);assert.equal(refused.writes.length,1);
 const dispatch=await scenario({dispatchError:true});assert(dispatch.error);assert.equal(dispatch.writes.length,2);
 const repaired=await scenario({pr:{state:'closed',merged:true,merge_commit_sha:D}});assert.equal(repaired.result.merged,true);assert.deepEqual(repaired.writes.map(c=>c[0]),['deploy']);
 const withArt={pr:{body:body(artMeta)},note:artNote,files:artFiles};
 assert.equal((await scenario(withArt)).result.merged,true);
 assert.equal((await scenario({...withArt,pr:{body:body({...artMeta,baseBlob:D})},files:artFiles.filter(f=>f.filename!==registryPath).map(f=>f.filename===notePath?{...f,status:'modified'}:f),original:{type:'file',sha:D}})).result.merged,true);
 assert.equal((await scenario({...withArt,files:artFiles.slice(0,2),imageAtBase:{type:'file',sha:I},imageOnMain:{type:'file',sha:I}})).result.merged,true);
 for(const change of [
   {pr:{body:body({...artMeta,asset:{...imageDescriptor,path:'site/saeroth-art-'+imagePayload.sha256+'.webp'}})}},
   {pr:{body:body({...artMeta,asset:{...imageDescriptor,path:'campaign/other/saeroth-art-'+imagePayload.sha256+'.webp'}})}},
   {pr:{body:body({...artMeta,asset:{...imageDescriptor,extra:'unexpected'}})}},
   {pr:{body:body({...artMeta,asset:{...imageDescriptor,mime:'image/svg+xml'}})}},
   {pr:{body:body({...artMeta,asset:{...imageDescriptor,bytes:artwork.LIMIT_BYTES+1}})}},
   {files:[...artFiles,{filename:'site/evil.js',status:'added',sha:D}]},
   {files:artFiles.map(f=>f.filename===imagePath?{...f,status:'modified'}:f)},
   {files:artFiles.map(f=>f.filename===imagePath?{...f,status:'renamed',previous_filename:'campaign/old.webp'}:f)},
   {files:artFiles.map(f=>f.filename===imagePath?{...f,status:'removed'}:f)},
   {files:artFiles.slice(0,2)},{note},{note:note+'\n~~~\n![]('+artwork.filename(imagePayload.sha256)+')\n~~~'},
   {note:note+'\n<!-- ![]('+artwork.filename(imagePayload.sha256)+') -->'},
   {imageAtHead:null},{imageAtHead:{type:'symlink',sha:I}},{imageAtHead:{type:'file',sha:D}},
   {imageBlob:{...imageBlob,sha:D}},{imageBlob:{...imageBlob,size:20}},
   {imageBlob:{...imageBlob,content:Buffer.alloc(imagePayload.bytes,0).toString('base64')}},
   {imageOnMain:{type:'file',sha:D}},{imageOnMain:{type:'symlink',sha:I}},
   {files:artFiles.slice(0,2),imageAtBase:{type:'file',sha:I}},
   {latest:{body:body({...artMeta,asset:{...imageDescriptor,bytes:20}})}}
 ]){const check=await scenario({...withArt,...change});assert.equal(check.error,undefined,JSON.stringify(change));assert.equal(check.writes.length,0,JSON.stringify(change));}
 function binaryBlob(bytes){const content=bytes.toString('base64');return [{encoding:'base64',size:bytes.length,content},{mime:'image/webp',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,path:imagePath}];}
 const red=Buffer.from(imagePayload.data,'base64');
 const malformed=[];
 const trailing=Buffer.concat([red,Buffer.from('<script>evil</script>')]);malformed.push(trailing);
 const badLength=Buffer.from(red);badLength.writeUInt32LE(red.length,4);malformed.push(badLength);
 const huge=Buffer.from(red);huge.writeUInt16LE(8192,26);malformed.push(huge);
 const animated=Buffer.concat([red,Buffer.from('ANIM'),Buffer.from([6,0,0,0,0,0,0,0,0,0])]);animated.writeUInt32LE(animated.length-8,4);malformed.push(animated);
 const duplicate=Buffer.concat([red,red.subarray(12)]);duplicate.writeUInt32LE(duplicate.length-8,4);malformed.push(duplicate);
 const headerOnly=red.subarray(0,30);const tiny=Buffer.from(headerOnly);tiny.writeUInt32LE(tiny.length-8,4);tiny.writeUInt32LE(10,16);malformed.push(tiny);
 for(const bad of malformed){const [data,desc]=binaryBlob(bad);assert.equal(await publish.validArtwork(data,desc),false);}
 assert.equal(await publish.validArtwork(imageBlob,imageDescriptor),true);
 assert.equal(await publish.validArtwork({...imageBlob,content:imagePayload.data.match(/.{1,60}/g).join('\n')+'\n'},imageDescriptor),true,'GitHub wraps base64 blob responses.');
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/campaign-editor-auto-merge.yml'),'utf8');
 assert(workflow.includes('ref: main'));assert(workflow.includes('persist-credentials: false'));assert(!/ref:.*(?:head|pull_request)|download-artifact|cache@/.test(workflow));
 console.log('PASS: verified single-entry publication; same-repo/author/job/path/blob guards; metadata validation; immutable diff; stale-head and branch-race refusal; failed dispatch recovery; trusted-main helper execution.');
 console.log('PASS: atomic artwork scope, immutable additions/reuse, body references, SHA256/size/WebP validation, malformed/animated/trailing payload rejection, and main-image race guards.');
})().catch(error=>{console.error(error);process.exitCode=1;});
