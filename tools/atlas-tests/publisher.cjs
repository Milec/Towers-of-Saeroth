const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const context = {window:{},fetch,atob,TextDecoder,TextEncoder,Uint8Array,crypto:crypto.webcrypto};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../site/publisher.js'),'utf8'),context);
const {createClient,validPath,fields} = context.window.SaerothPublisher;
const REPO='Milec/Towers-of-Saeroth', REGISTRY='campaign/world/Campaign Library.md';
const digest = text => crypto.createHash('sha1').update(text).digest('hex');
const blob = text => digest('blob '+Buffer.byteLength(text)+'\0'+text);
const note = (title,body='Maintained campaign notes.') => '---\ntitle: '+JSON.stringify(title)+'\ntype: location\n---\n\n# '+title+'\n\n'+body+'\n';
function harness(extra={}) {
  let serial=0, failure=null;
  const trees=new Map(),commits=new Map(),refs=new Map(),pulls=[],blobs=new Map(),campaignTrees=new Map(),writes=[];
  function tree(files) { const id=digest('tree'+JSON.stringify(files)); trees.set(id,{...files}); for(const text of Object.values(files))blobs.set(blob(text),text); const cid=digest('campaign:'+id);campaignTrees.set(cid,id);return id; }
  function commit(files,parents=[],message='fixture') { const id=digest('commit'+(++serial));commits.set(id,{sha:id,tree:{sha:tree(files)},parents:parents.map(sha=>({sha})),message});return id; }
  refs.set('main',commit({[REGISTRY]:note('Campaign Library'), 'campaign/README.md':note('Campaign'), 'campaign/npcs/Existing.md':note('Existing'), ...extra}));
  const headFiles = head => trees.get(commits.get(refs.get(head)||head).tree.sha);
  const prView = pr => ({...pr,head:{...pr.head,sha:refs.get(pr.head.ref)||pr.head.sha},base:{...pr.base,sha:refs.get('main')}});
  const changed = (base,head) => {
    const a=headFiles(base),b=headFiles(head);return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(p=>a[p]!==b[p]).map(p=>({filename:p,status:!(p in a)?'added':!(p in b)?'removed':'modified',sha:p in b?blob(b[p]):null}));
  };
  async function request(url,options) {
    assert.equal(options.headers.Authorization,'Bearer test-token');
    assert(url.startsWith('https://api.github.com/repos/'+REPO));
    const u=new URL(url),route=decodeURIComponent(u.pathname.slice(('/repos/'+REPO).length)),method=options.method,body=options.body?JSON.parse(options.body):null;
    const good = value => { if(failure?.route===route && failure.method===method){const mode=failure.mode;failure=null;if(mode==='lost')throw Error('lost response with secret detail');if(mode==='json')return {ok:true,status:200,json:async()=>{throw Error('bad JSON');}};}return {ok:true,status:200,json:async()=>value};};
    const bad = status => ({ok:false,status});
    if(method!=='GET')writes.push({route,method,body});
    if(!route)return good({full_name:REPO,permissions:{push:true}});
    if(route==='/pulls'&&method==='GET')return good(pulls.filter(pr=>(u.searchParams.get('state')==='all'||pr.state==='open')&&(!u.searchParams.get('head')||u.searchParams.get('head')==='Milec:'+pr.head.ref)).map(prView));
    if(/^\/pulls\/\d+$/.test(route)) {
      const pr=pulls.find(pr=>pr.number===+route.split('/').at(-1));if(!pr)return bad(404);
      if(method==='PATCH')Object.assign(pr,body);
      return good(prView(pr));
    }
    if(route.startsWith('/git/ref/heads/')) {const id=refs.get(route.slice(15));return id?good({object:{sha:id}}):bad(404);}
    if(route.startsWith('/git/commits/')&&method==='GET')return good(commits.get(route.split('/').at(-1)));
    if(route.startsWith('/git/blobs/')) {const text=blobs.get(route.split('/').at(-1));return text===undefined?bad(404):good({encoding:'base64',content:Buffer.from(text).toString('base64')});}
    if(route.startsWith('/git/trees/')&&method==='GET') {
      const id=route.split('/').at(-1);
      if(campaignTrees.has(id))return good({truncated:false,tree:Object.entries(trees.get(campaignTrees.get(id))).filter(([p])=>p.startsWith('campaign/')).map(([p,text])=>({path:p.slice(9),type:'blob',sha:blob(text)}))});
      return good({truncated:false,tree:[{path:'campaign',type:'tree',sha:digest('campaign:'+id)}]});
    }
    if(route.startsWith('/contents/')) {const text=headFiles(u.searchParams.get('ref'))[route.slice(10)];return text===undefined?bad(404):good({type:'file',sha:blob(text),encoding:'base64',content:Buffer.from(text).toString('base64')});}
    if(route.startsWith('/compare/')) {const [base,head]=route.slice(9).split('...');return good({files:changed(base,head)});}
    if(route==='/git/trees'&&method==='POST') {const files={...trees.get(body.base_tree)};for(const item of body.tree)files[item.path]=item.content;return good({sha:tree(files)});}
    if(route==='/git/commits'&&method==='POST') {const id=commit(trees.get(body.tree),body.parents,body.message);return good(commits.get(id));}
    if(route==='/git/refs'&&method==='POST') {const branch=body.ref.slice(11);assert.notEqual(branch,'main');if(refs.has(branch))return bad(422);refs.set(branch,body.sha);return good({object:{sha:body.sha}});}
    if(route.startsWith('/git/refs/heads/')&&method==='PATCH') {
      const branch=route.slice(16);assert.notEqual(branch,'main');assert.equal(body.force,false);
      if(failure?.route===route&&failure.mode==='conflict'){failure=null;return bad(422);}
      assert(commits.get(body.sha).parents.some(p=>p.sha===refs.get(branch)),'Only a fast-forward from the inspected branch is allowed');refs.set(branch,body.sha);return good({object:{sha:body.sha}});
    }
    if(route==='/pulls'&&method==='POST') {const pr={number:100+pulls.length,state:'open',merged:false,body:body.body,head:{ref:body.head,repo:{full_name:REPO},sha:refs.get(body.head)},base:{ref:'main',repo:{full_name:REPO}},html_url:'https://github.com/'+REPO+'/pull/'+(100+pulls.length)};pulls.push(pr);return good(prView(pr));}
    throw Error('Unhandled '+method+' '+route);
  }
  return {request,refs,pulls,writes,files:headFiles,changed,setFailure:(route,method,mode)=>failure={route,method,mode},external:(changes,branch='main')=>{const head=refs.get(branch);refs.set(branch,commit({...headFiles(head),...changes},[head]));}};
}
module.exports = {harness,note,blob,REPO,REGISTRY};
if (require.main === module) (async()=>{
  const h=harness(),client=createClient('test-token',h.request),start=h.refs.get('main');await client.connect();
  const existing=await client.load('campaign/npcs/Existing.md');
  assert.equal(existing.text,note('Existing'));assert.equal(existing.sha,blob(existing.text));
  const edited=note('Existing','Changed from the website.');
  let result=await client.publish({path:'campaign/npcs/Existing.md',content:edited,expectedBlobSha:existing.sha,baseText:existing.text});
  assert.equal(result.status,'pending');assert.equal(h.pulls.length,1);assert.equal(h.refs.get('main'),start);assert.equal(h.changed(start,result.head).length,1);
  const retryWrites=h.writes.length;
  const retry=await client.publish({path:'campaign/npcs/Existing.md',content:edited,expectedBlobSha:existing.sha,baseText:existing.text});
  assert.equal(retry.noteSHA,result.noteSHA);assert.equal(h.writes.length,retryWrites,'A repeated acknowledged or uncertain save is idempotent');
  const pending=await client.load('campaign/npcs/Existing.md');assert.equal(pending.sha,result.noteSHA);assert.equal(pending.pending.number,result.number);
  const revised=note('Existing','A second accepted revision.');
  result=await client.publish({path:'campaign/npcs/Existing.md',content:revised,expectedBlobSha:pending.sha,baseText:pending.text});
  assert.equal(h.pulls.length,1);assert.equal(h.files(result.head)['campaign/npcs/Existing.md'],revised);
  await assert.rejects(client.publish({path:'campaign/npcs/Existing.md',content:note('Existing','Stale!'),expectedBlobSha:existing.sha}),/changed/);
  h.external({'campaign/npcs/Existing.md':note('Existing','Other author changed main.')});
  await assert.rejects(client.publish({path:'campaign/npcs/Existing.md',content:revised,expectedBlobSha:result.noteSHA}),/published entry changed/);

  const unicode=harness(),uc=createClient('test-token',unicode.request),p='campaign/world/locations/Étoile du Nord.md',text=note('Étoile du Nord','La lumière — 星 🌙');
  const fresh=await uc.load(p);assert.equal(fresh.sha,null);
  const created=await uc.publish({path:p,content:text,expectedBlobSha:null,baseText:null,title:'Étoile du Nord'});
  assert.equal(unicode.files(created.head)[p],text);assert.equal(unicode.changed(unicode.refs.get('main'),created.head).length,2);
  assert.equal(unicode.files(created.head)[REGISTRY],unicode.files('main')[REGISTRY]+'\n- [[Étoile du Nord]]\n');
  assert.equal((await uc.load(p)).sha,created.noteSHA);
  await assert.rejects(uc.publish({path:'campaign/npcs/éTOILE DU NORD.md',content:note('Other'),expectedBlobSha:null}),/already uses/);

  for(const [name,extra,pathName,title] of [
    ['filename',{},'campaign/locations/existing.md','Unique title'],
    ['frontmatter',{'campaign/locations/Different Filename.md':note('Hidden Display Title')},'campaign/locations/Unique.md','hidden display title']
  ]) {const h=harness(extra),c=createClient('test-token',h.request);await assert.rejects(c.publish({path:pathName,content:note(title),expectedBlobSha:null}),/already uses/,name);assert.equal(h.writes.length,0);}
  for(const stage of ['/git/refs','/pulls','/git/commits']) {
    const h=harness(),c=createClient('test-token',h.request),path='campaign/npcs/Lost Response.md',content=note('Lost Response');h.setFailure(stage,'POST','lost');
    await assert.rejects(c.publish({path,content,expectedBlobSha:null}),/interrupted/);
    const recovered=await createClient('test-token',h.request).publish({path,content,expectedBlobSha:null});
    assert.equal(h.pulls.length,1,stage+' must not duplicate the review');assert.equal(h.files(recovered.head)[path],content);
  }
  const stale=harness(),sc=createClient('test-token',stale.request),base=await sc.load('campaign/npcs/Existing.md');stale.external({'campaign/npcs/Existing.md':note('Existing','New canon')});
  await assert.rejects(sc.publish({path:'campaign/npcs/Existing.md',content:note('Existing','Old edit'),expectedBlobSha:base.sha,baseText:base.text}),/published entry changed/);assert.equal(stale.writes.length,0);
  const merged=harness(),mc=createClient('test-token',merged.request),mp='campaign/locations/Merged.md',mt=note('Merged');const mr=await mc.publish({path:mp,content:mt,expectedBlobSha:null});merged.pulls[0].state='closed';merged.pulls[0].merged=true;merged.refs.set('main',mr.head);
  const recoveredMerge=await createClient('test-token',merged.request).publish({path:mp,content:mt,expectedBlobSha:null});assert.equal(recoveredMerge.status,'merged');assert.equal(merged.pulls.length,1);
  assert.equal((await mc.status(mr.number)).status,'merged');
  const conflict=harness(),cc=createClient('test-token',conflict.request),cb=await cc.load('campaign/npcs/Existing.md'),cr=await cc.publish({path:'campaign/npcs/Existing.md',content:note('Existing','First'),expectedBlobSha:cb.sha});conflict.setFailure('/git/refs/heads/'+cr.branch,'PATCH','conflict');
  await assert.rejects(cc.publish({path:'campaign/npcs/Existing.md',content:note('Existing','Second'),expectedBlobSha:cr.noteSHA}),/remote entry or review branch changed/);assert.equal(conflict.refs.get(cr.branch),cr.head);
  const foreign=harness(),fc=createClient('test-token',foreign.request),fr=await fc.publish({path:'campaign/npcs/Foreign.md',content:note('Foreign'),expectedBlobSha:null});foreign.pulls[0].head.repo.full_name='Someone/Else';
  await assert.rejects(fc.load('campaign/npcs/Foreign.md'),/could not be verified/);
  const unrelated=harness(),un=createClient('test-token',unrelated.request),ur=await un.publish({path:'campaign/npcs/Extra.md',content:note('Extra'),expectedBlobSha:null});unrelated.external({'site/app.js':'Unrelated change'},ur.branch);
  await assert.rejects(un.publish({path:'campaign/npcs/Extra.md',content:note('Extra','Replace'),expectedBlobSha:ur.noteSHA}),/other changes/);
  for(const lostStage of [null,'body','ref']) {
    const h=harness(),c=createClient('test-token',h.request),p='campaign/locations/Pending.md',content=note('Pending');
    const first=await c.publish({path:p,content,expectedBlobSha:null});
    const otherRegistry=h.files('main')[REGISTRY]+'\n- [[Another entry]]\n';
    h.external({[REGISTRY]:otherRegistry,'campaign/locations/Another entry.md':note('Another entry')});
    const latestMain=h.refs.get('main');
    if(lostStage) {
      h.setFailure(lostStage==='body'?'/pulls/'+first.number:'/git/refs/heads/'+first.branch,'PATCH','lost');
      await assert.rejects(c.publish({path:p,content,expectedBlobSha:null}),/interrupted/);
    }
    const refreshed=await createClient('test-token',h.request).publish({path:p,content,expectedBlobSha:null});
    assert.equal(h.pulls.length,1);assert.equal(h.refs.get('main'),latestMain);
    assert.equal(h.files(refreshed.head)[REGISTRY],otherRegistry+'\n- [[Pending]]\n');
    assert.equal(h.files(refreshed.head)['campaign/locations/Another entry.md'],note('Another entry'));
    assert.deepEqual(h.changed(latestMain,refreshed.head).map(r=>r.filename).sort(),[REGISTRY,p].sort());
    assert(h.pulls[0].body.includes('"baseHead":"'+latestMain+'"'));
  }
  for(const bad of ['players/Foo.md','vault/Foo.md','campaign/../Foo.md','campaign/.hidden/Foo.md','campaign/a%2fb.md','campaign/a#b.md','campaign/CON.md','campaign/AGENTS.md',REGISTRY])assert.equal(validPath(bad),false,bad);
  assert.equal(validPath('campaign/nations/Vaelic Principality/npcs/Éowyn.md'),true);
  assert.throws(()=>fields('---\ntitle:\ntype: npc\n---\n'),/empty or invalid/);
  assert.throws(()=>fields('---\nTitle: Uppercase\ntype: npc\n---\n'),/exactly one title/);
  assert.throws(()=>fields('---\ntitle: Uppercase\nType: npc\n---\n'),/exactly one type/);
  assert.throws(()=>fields(note('Controls','text\u001bwith terminal control')),/control characters/);
  assert.equal(validPath('campaign/world/campaign library.md'),false);
  assert.throws(()=>fields(note('Huge','x'.repeat(128*1024))),/under 128 KiB/);
  for(const status of [401,403]) {const c=createClient('test-token',async()=>({ok:false,status}));await assert.rejects(c.connect(),error=>error.code==='auth'&&!error.message.includes('test-token'));}
  const noWrite=createClient('test-token',async()=>({ok:true,status:200,json:async()=>({full_name:REPO,permissions:{push:false}})}));await assert.rejects(noWrite.connect(),/write access/);
  console.log('Publisher: Unicode create/edit, atomic registry, pending resume, collision checks, stale guards, lost-response recovery, pinned branch updates, merged recovery and permissions passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
