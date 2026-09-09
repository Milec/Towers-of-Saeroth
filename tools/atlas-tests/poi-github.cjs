const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const context={window:{},fetch,atob,TextDecoder,Uint8Array,Date};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../../site/atlas/poi-github.js'),'utf8'),context);
const {createClient}=context.window.POIGitHub;
const blob=text=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0'+text).digest('hex');
let serial=1;const trees=new Map([['tree0',{'campaign/world/Existing Tower.md':'Existing canon','campaign/README.md':'Index'}]]),commits=new Map([['base',{tree:'tree0',parent:null}]]),refs=new Map([['main','base']]),reviews=[];
let rejectPatch=false;const writes=[];
async function request(url,options){
 assert.equal(options.headers.Authorization,'Bearer test-token');const u=new URL(url),path=decodeURIComponent(u.pathname.replace('/repos/Milec/Towers-of-Saeroth','')),body=options.body?JSON.parse(options.body):null,method=options.method;
 const ok=value=>({ok:true,status:200,json:async()=>value});const fail=status=>({ok:false,status});
 if(method!=='GET')writes.push({path,body});
 if(!path)return ok({permissions:{push:true}});
 if(path==='/pulls'&&method==='GET')return ok(reviews);
 if(path.startsWith('/git/ref/heads/')){const sha=refs.get(path.slice('/git/ref/heads/'.length));return sha?ok({object:{sha}}):fail(404);}
 if(path.startsWith('/git/commits/')){const c=commits.get(path.split('/').pop());return ok({tree:{sha:c.tree}});}
 if(path.startsWith('/git/trees/')&&method==='GET'){
  const key=path.split('/').pop();if(key.startsWith('campaign-'))return ok({truncated:false,tree:Object.keys(trees.get(key.slice(9))).filter(p=>p.startsWith('campaign/')).map(p=>({path:p.slice(9),type:'blob'}))});
  return ok({tree:[{path:'campaign',sha:'campaign-'+key}]});
 }
 if(path.startsWith('/contents/')){
  const ref=u.searchParams.get('ref'),c=commits.get(refs.get(ref)||ref),text=trees.get(c.tree)[path.slice(10)];
  return text===undefined?fail(404):ok({sha:blob(text),content:Buffer.from(text).toString('base64')});
 }
 if(path==='/git/trees'&&method==='POST'){const sha='tree'+serial++;trees.set(sha,{...trees.get(body.base_tree),...Object.fromEntries(body.tree.map(p=>[p.path,p.content]))});return ok({sha});}
 if(path==='/git/commits'&&method==='POST'){const sha='commit'+serial++;commits.set(sha,{tree:body.tree,parent:body.parents[0]});return ok({sha});}
 if(path==='/git/refs'&&method==='POST'){const ref=body.ref.slice(11);assert.notEqual(ref,'main');refs.set(ref,body.sha);return ok({});}
 if(path.startsWith('/git/refs/heads/')&&method==='PATCH'){
  const ref=path.slice('/git/refs/heads/'.length);assert.notEqual(ref,'main');assert.equal(body.force,false);
  if(rejectPatch)return fail(422);assert.equal(commits.get(body.sha).parent,refs.get(ref));refs.set(ref,body.sha);return ok({});
 }
 if(path==='/pulls'&&method==='POST'){const review={body:body.body,head:{ref:body.head,repo:{full_name:'Milec/Towers-of-Saeroth'}},html_url:'https://github.com/Milec/Towers-of-Saeroth/pull/1000'};reviews.push(review);return ok(review);}
 throw Error('Unhandled '+method+' '+path);
}
(async()=>{
 const client=createClient('test-token',request);await client.connect();
 let p={id:123,name:'New Tower',kind:'tower',notes:'A guarded tower.',x:100,y:120};
 let result=await client.sync(p,'campaign/world/locations');assert.match(result.notePath,/New Tower.md$/);assert.equal(reviews.length,1);
 const writesBefore=writes.length;const retry=await client.sync(p,'campaign/world/locations');assert.equal(retry.noteSHA,result.noteSHA);assert.equal(writes.length,writesBefore,'Uncertain response retry must not duplicate a note');
 p={...p,...result,name:'Renamed Tower',notes:'Revised notes.'};result=await client.sync(p,'campaign/world/locations');
 const files=trees.get(commits.get(refs.get(reviews[0].head.ref)).tree);
 assert.match(files['campaign/world/locations/New Tower.md'],/See \[\[Renamed Tower\]\]/);
 assert.match(files[result.notePath],/Revised notes/);assert.match(files['campaign/world/Atlas Locations.md'],/\[\[Renamed Tower\]\]/);
 await assert.rejects(client.sync({...p,noteSHA:'0'.repeat(40),notes:'Stale change'},'campaign/world/locations'),/changed on GitHub/);
 rejectPatch=true;await assert.rejects(client.sync({...p,...result,notes:'Concurrent write'},'campaign/world/locations'),/branch changed/);rejectPatch=false;
 const other=await client.sync({...p,id:124,notePath:undefined,noteSHA:undefined,name:'Existing Tower'},'campaign/world/locations');assert.match(other.notePath,/Existing Tower \(124\).md$/);
 assert.equal(refs.get('main'),'base');assert.equal(trees.get('tree0')['campaign/world/Existing Tower.md'],'Existing canon');
 await assert.rejects(client.sync({...p,notePath:'campaign/world/../bad.md'},'campaign/world/locations'),/Invalid campaign note path/);
 console.log('PASS: atomic review commits, note/index creation, rename redirects, retry recovery, stale/concurrent-write protection and collision-safe paths.');
})().catch(e=>{console.error(e);process.exit(1);});
