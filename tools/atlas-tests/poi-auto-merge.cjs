const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/atlas-poi-auto-merge.yml'),'utf8');
const source=workflow.split('script: |')[1];
const execute=new (Object.getPrototypeOf(async function(){}).constructor)('github','context',source);
async function scenario(change={}){
 const calls=[],run={conclusion:'success',event:'pull_request',head_repository:{full_name:'Milec/Towers-of-Saeroth'},head_branch:'atlas-notes-123',head_sha:'verified',...change.run};
 const pr={number:1,draft:false,base:{ref:'main'},user:{login:'Milec'},head:{repo:{full_name:'Milec/Towers-of-Saeroth'},sha:'verified'},body:'<!-- atlas-poi-sync -->',...change.pr};
 const files=change.files||[{filename:'campaign/world/locations/Tower.md',status:'added'},{filename:'campaign/.atlas/poi-123.json',status:'added'},{filename:'campaign/world/Atlas Locations.md',status:'modified'}];
 const github={rest:{pulls:{list:'list',listFiles:'files',get:async()=>({data:pr}),merge:async args=>{calls.push(['merge',args]);return {data:{merged:true}};}},actions:{createWorkflowDispatch:async args=>calls.push(['deploy',args])}},paginate:async endpoint=>endpoint==='list'?[pr]:files};
 await execute(github,{repo:{owner:'Milec',repo:'Towers-of-Saeroth'},payload:{workflow_run:run}});return calls;
}
(async()=>{
 const valid=await scenario();assert.equal(valid.length,2);assert.equal(valid[0][1].sha,'verified');assert.equal(valid[1][1].workflow_id,'pages.yml');
 for(const change of [
  {run:{conclusion:'failure'}},{run:{event:'push'}},{run:{head_branch:'feature/unrelated'}},
  {run:{head_repository:{full_name:'Someone/fork'}}},{pr:{user:{login:'Someone'}}},
  {pr:{draft:true}},{pr:{body:'Ordinary PR'}},{pr:{base:{ref:'other'}}},
  {pr:{head:{repo:{full_name:'Milec/Towers-of-Saeroth'},sha:'new-unverified'}}},
  {files:[{filename:'site/app.js',status:'modified'}]},
  {files:[{filename:'campaign/world/locations/Tower.md',status:'removed'}]},
  {files:[{filename:'campaign/world/locations/Tower.md',previous_filename:'site/app.js',status:'renamed'}]},
  {files:[]}
 ])assert.equal((await scenario(change)).length,0,JSON.stringify(change));
 assert(!workflow.includes('actions/checkout'));console.log('PASS: verified POI-only merge and deployment; unrelated, stale, fork, failed, draft and out-of-scope PRs excluded.');
})().catch(e=>{console.error(e);process.exit(1);});
