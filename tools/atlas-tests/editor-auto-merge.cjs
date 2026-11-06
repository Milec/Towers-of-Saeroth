'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const publish=require('../../.github/scripts/campaign-editor-publish.cjs');
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40),R='1'.repeat(40),OP='e'.repeat(64);
const fullName='Milec/Towers-of-Saeroth',notePath='campaign/npcs/Editor Test.md';
const registryPath='campaign/world/Campaign Library.md',registryBefore='---\ntitle: Campaign Library\ntype: index\n---\n\n# Campaign Library\n';
const registryAfter=registryBefore+'\n- [[Editor Test]]\n';
const note='---\ntitle: Editor Test\ntype: npc\n---\n\nA valid test entry.\n';
const meta={version:1,path:notePath,baseBlob:null,baseHead:B,operation:OP};
const body=value=>'An entry saved from the website.\n\n<!-- saeroth-entry-editor -->\nsaeroth_entry: '+JSON.stringify(value);
async function scenario(change={}){
 const calls=[],run={id:123,status:'completed',name:'Verify repository and interface',path:'.github/workflows/verify.yml',conclusion:'success',event:'pull_request',head_repository:{full_name:fullName},head_branch:'entry-editor-0123456789abcdef',head_sha:A,...change.run};
 const pr={number:42,state:'open',draft:false,merged:false,base:{ref:'main',sha:B,repo:{full_name:fullName}},user:{login:'TrustedWriter'},head:{repo:{full_name:fullName},ref:run.head_branch,sha:A},body:body(meta),...change.pr};
 const files=change.files||[{filename:notePath,status:'added',sha:C},{filename:registryPath,status:'modified',sha:R}];
 let reads=0;
 const github={rest:{
  pulls:{list:'pulls',get:async()=>({data:++reads===1?pr:{...pr,...change.latest}}),merge:async args=>{calls.push(['merge',args]);if(change.mergeError)throw Object.assign(Error('Head changed'),{status:409});return {data:{merged:change.mergeResult!==false}};}},
  repos:{getCollaboratorPermissionLevel:async args=>{calls.push(['permission',args]);return {data:{permission:change.permission||'write'}};},
   compareCommitsWithBasehead:async args=>{calls.push(['compare',args]);return {data:args.basehead===`${pr.base.sha}...${run.head_sha}`?{files,status:'ahead'}:{status:change.ancestry||'ahead'}};},
   getContent:async args=>{calls.push(['source',args]);if(args.path===registryPath){const source=change.registryBefore===undefined?registryBefore:change.registryBefore;return {data:{type:'file',sha:R,size:Buffer.byteLength(source),encoding:'base64',content:Buffer.from(source).toString('base64')}};}if(args.ref==='main'&&Object.hasOwn(change,'currentEntry')){if(change.currentEntry)return {data:change.currentEntry};throw Object.assign(Error('Not found'),{status:404});}if(change.original)return {data:change.original};throw Object.assign(Error('Not found'),{status:404});}},
  git:{getBlob:async args=>{calls.push(['blob',args]);if(args.file_sha===R){const source=change.registryAfter===undefined?registryAfter:change.registryAfter;return {data:{sha:R,size:Buffer.byteLength(source),encoding:'base64',content:Buffer.from(source).toString('base64')}};}const source=change.note===undefined?note:change.note;return {data:change.blob||{sha:C,size:Buffer.byteLength(source),encoding:'base64',content:Buffer.from(source).toString('base64')}};}},
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
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/campaign-editor-auto-merge.yml'),'utf8');
 assert(workflow.includes('ref: main'));assert(workflow.includes('persist-credentials: false'));assert(!/ref:.*(?:head|pull_request)|download-artifact|cache@/.test(workflow));
 console.log('PASS: verified single-entry publication; same-repo/author/job/path/blob guards; metadata validation; immutable diff; stale-head and branch-race refusal; failed dispatch recovery; trusted-main helper execution.');
})().catch(error=>{console.error(error);process.exitCode=1;});
