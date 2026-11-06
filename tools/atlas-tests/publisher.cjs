const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const artwork = require('../../site/editor-asset.js');
const context = {window:{},fetch,atob,btoa,TextDecoder,TextEncoder,Uint8Array,crypto:crypto.webcrypto,SaerothEditorAsset:artwork};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../site/publisher.js'),'utf8'),context);
const {createClient,validPath,fields} = context.window.SaerothPublisher;
const REPO='Milec/Towers-of-Saeroth', REGISTRY='campaign/world/Campaign Library.md';
const digest = text => crypto.createHash('sha1').update(text).digest('hex');
const blob = text => crypto.createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
const note = (title,body='Maintained campaign notes.') => '---\ntitle: '+JSON.stringify(title)+'\ntype: location\n---\n\n# '+title+'\n\n'+body+'\n';
const artworkFixtures = [
  'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=',
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoCAAIAAUAmJaACdLoAA5gA/vtV4/+lwf/S4P/pcH/pcH8bss4bpAAA'
].map(data=>({mime:'image/webp',data,bytes:Buffer.from(data,'base64').length,sha256:crypto.createHash('sha256').update(Buffer.from(data,'base64')).digest('hex')}));
function harness(extra={}) {
  let serial=0, failure=null;
  const trees=new Map(),commits=new Map(),refs=new Map(),pulls=[],blobs=new Map(),campaignTrees=new Map(),writes=[];
  function tree(files) { const id=digest('tree'+JSON.stringify(files)); trees.set(id,{...files}); for(const text of Object.values(files))blobs.set(blob(text),text); const cid=digest('campaign:'+id);campaignTrees.set(cid,id);return id; }
  function commit(files,parents=[],message='fixture') { const id=digest('commit'+(++serial));commits.set(id,{sha:id,tree:{sha:tree(files)},parents:parents.map(sha=>({sha})),message});return id; }
  refs.set('main',commit({[REGISTRY]:note('Campaign Library'), 'campaign/README.md':note('Campaign'), 'campaign/npcs/Existing.md':note('Existing'), ...extra}));
  const headFiles = head => trees.get(commits.get(refs.get(head)||head).tree.sha);
  const prView = pr => ({...pr,head:{...pr.head,sha:refs.get(pr.head.ref)||pr.head.sha},base:{...pr.base,sha:refs.get('main')}});
  const changed = (base,head) => {
    const a=headFiles(base),b=headFiles(head);return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(p=>!(p in a)||!(p in b)||blob(a[p])!==blob(b[p])).map(p=>({filename:p,status:!(p in a)?'added':!(p in b)?'removed':'modified',sha:p in b?blob(b[p]):null}));
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
    if(route.startsWith('/git/blobs/')) {const text=blobs.get(route.split('/').at(-1));return text===undefined?bad(404):good({sha:blob(text),size:Buffer.byteLength(text),encoding:'base64',content:Buffer.from(text).toString('base64')});}
    if(route==='/git/blobs'&&method==='POST') {assert.equal(body.encoding,'base64');const bytes=Buffer.from(body.content,'base64'),sha=blob(bytes);blobs.set(sha,bytes);return good({sha});}
    if(route.startsWith('/git/trees/')&&method==='GET') {
      const id=route.split('/').at(-1);
      if(campaignTrees.has(id))return good({truncated:false,tree:Object.entries(trees.get(campaignTrees.get(id))).filter(([p])=>p.startsWith('campaign/')).map(([p,text])=>({path:p.slice(9),type:'blob',sha:blob(text)}))});
      return good({truncated:false,tree:[{path:'campaign',type:'tree',sha:digest('campaign:'+id)}]});
    }
    if(route.startsWith('/contents/')) {const text=headFiles(u.searchParams.get('ref'))[route.slice(10)];return text===undefined?bad(404):good({type:'file',sha:blob(text),size:Buffer.byteLength(text),encoding:'base64',content:Buffer.from(text).toString('base64')});}
    if(route.startsWith('/compare/')) {const [base,head]=route.slice(9).split('...');return good({files:changed(base,head)});}
    if(route==='/git/trees'&&method==='POST') {const files={...trees.get(body.base_tree)};for(const item of body.tree){if(item.sha===null)delete files[item.path];else if(item.sha){assert(blobs.has(item.sha));files[item.path]=blobs.get(item.sha);}else files[item.path]=item.content;}return good({sha:tree(files)});}
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
module.exports = {harness,note,blob,REPO,REGISTRY,artworkFixtures};
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
  const [red,blue]=artworkFixtures,withImage=(title,asset)=>note(title,'![Portrait]('+artwork.filename(asset.sha256)+')');
  assert.deepEqual(await artwork.validate(red),red);
  const withoutGlobalCrypto={module:{exports:{}},require,atob,btoa,Uint8Array,DataView};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../site/editor-asset.js'),'utf8'),withoutGlobalCrypto);
  assert.equal((await withoutGlobalCrypto.module.exports.validate(red)).sha256,red.sha256,'Trusted Node guard works without global crypto.');
  assert(artwork.reference(withImage('Artwork',red),artwork.filename(red.sha256)));
  assert(!artwork.reference(note('Artwork','~~~\n![]('+artwork.filename(red.sha256)+')\n~~~'),artwork.filename(red.sha256)));
  assert(!artwork.reference(note('Artwork','<!-- ![]('+artwork.filename(red.sha256)+') -->'),artwork.filename(red.sha256)));
  for(const asset of [{...red,sha256:'0'.repeat(64)},{...red,bytes:1},{...red,data:red.data+'junk'},{...red,mime:'image/svg+xml'},{...red,path:'site/evil.js'}])await assert.rejects(artwork.validate(asset));
  const images=harness(),ic=createClient('test-token',images.request),ip='campaign/npcs/Art Entry.md',it=withImage('Art Entry',red);
  const uploaded=await ic.publish({path:ip,content:it,expectedBlobSha:null,asset:red});
  const imagePath=artwork.assetPath(ip,red.sha256),firstHead=uploaded.head;
  assert.deepEqual(images.files(firstHead)[imagePath],Buffer.from(red.data,'base64'));assert.equal(images.files(firstHead)[ip],it);
  assert.equal(images.changed(images.refs.get('main'),firstHead).length,3);assert.equal(images.pulls[0].body.includes('"version":2'),true);
  assert.deepEqual((await ic.load(ip)).asset,red);assert.deepEqual((await ic.status(uploaded.number)).asset,red);
  const treeWrite=images.writes.find(w=>w.route==='/git/trees');assert(treeWrite.body.tree.some(row=>row.path===ip));assert(treeWrite.body.tree.some(row=>row.path===imagePath&&row.sha===blob(Buffer.from(red.data,'base64'))));
  const extraText=it+'\nLater prose.\n',revisedArt=await ic.publish({path:ip,content:extraText,expectedBlobSha:uploaded.noteSHA});
  assert.deepEqual(revisedArt.asset,red);assert.equal(images.pulls.length,1);
  const replacement=withImage('Art Entry',blue),replaced=await ic.publish({path:ip,content:replacement,expectedBlobSha:revisedArt.noteSHA,asset:blue});
  assert.equal(images.files(replaced.head)[imagePath],undefined);assert.deepEqual(images.files(replaced.head)[artwork.assetPath(ip,blue.sha256)],Buffer.from(blue.data,'base64'));
  assert.equal(images.changed(images.refs.get('main'),replaced.head).length,3);
  await assert.rejects(ic.publish({path:ip,content:replacement,expectedBlobSha:replaced.noteSHA,asset:null}),/Remove the staged artwork link/);
  const removed=await ic.publish({path:ip,content:note('Art Entry','No image.'),expectedBlobSha:replaced.noteSHA,asset:null});
  assert.equal(images.files(removed.head)[artwork.assetPath(ip,blue.sha256)],undefined);assert.equal(images.pulls[0].body.includes('"version":1'),true);assert.equal(removed.asset,null);
  for(const stage of ['/git/blobs','/git/trees','/git/commits','/git/refs','/pulls']){
    const h=harness(),c=createClient('test-token',h.request);h.setFailure(stage,'POST','lost');
    await assert.rejects(c.publish({path:ip,content:it,expectedBlobSha:null,asset:red}),/interrupted/);
    const recovered=await createClient('test-token',h.request).publish({path:ip,content:it,expectedBlobSha:null,asset:red});
    assert.equal(h.pulls.length,1);assert.deepEqual(h.files(recovered.head)[imagePath],Buffer.from(red.data,'base64'));assert.equal(h.changed(h.refs.get('main'),recovered.head).length,3);
  }
  for(const stage of ['body','ref']){
    const h=harness(),c=createClient('test-token',h.request),first=await c.publish({path:ip,content:it,expectedBlobSha:null,asset:red});
    h.setFailure(stage==='body'?'/pulls/'+first.number:'/git/refs/heads/'+first.branch,'PATCH','lost');
    await assert.rejects(c.publish({path:ip,content:replacement,expectedBlobSha:first.noteSHA,asset:blue}),/interrupted/);
    const recovered=await createClient('test-token',h.request).publish({path:ip,content:replacement,expectedBlobSha:first.noteSHA,asset:blue});
    assert.equal(h.pulls.length,1);assert.equal(h.files(recovered.head)[imagePath],undefined);assert.deepEqual((await c.load(ip)).asset,blue);
  }
  const reuse=harness({[imagePath]:Buffer.from(red.data,'base64')}),rc=createClient('test-token',reuse.request);
  const reused=await rc.publish({path:ip,content:it,expectedBlobSha:null,asset:red});assert.equal(reuse.changed(reuse.refs.get('main'),reused.head).length,2);assert(!reuse.writes.some(w=>w.route==='/git/blobs'));
  const collision=harness({[imagePath]:Buffer.from(blue.data,'base64')}),badArt=createClient('test-token',collision.request);
  await assert.rejects(badArt.publish({path:ip,content:it,expectedBlobSha:null,asset:red}),/fingerprint|verified/);assert.equal(collision.writes.length,0);
  const refreshArt=harness(),rac=createClient('test-token',refreshArt.request),raf=await rac.publish({path:ip,content:it,expectedBlobSha:null,asset:red});
  refreshArt.external({[REGISTRY]:refreshArt.files('main')[REGISTRY]+'\n- [[Other Entry]]\n'});
  const rar=await rac.publish({path:ip,content:it,expectedBlobSha:null});assert.deepEqual((await rac.load(ip)).asset,red);assert.equal(refreshArt.changed(refreshArt.refs.get('main'),rar.head).length,3);
  const adopted=harness(),ac=createClient('test-token',adopted.request),ep='campaign/npcs/Existing.md',eb=await ac.load(ep);
  const ea=await ac.publish({path:ep,content:withImage('Existing',red),expectedBlobSha:eb.sha,asset:red}),oldArt=artwork.assetPath(ep,red.sha256);
  adopted.external({[oldArt]:Buffer.from(red.data,'base64')});
  const replacedShared=await ac.publish({path:ep,content:withImage('Existing',blue),expectedBlobSha:ea.noteSHA,asset:blue});
  assert.deepEqual(adopted.files(replacedShared.head)[oldArt],Buffer.from(red.data,'base64'),'Artwork adopted on main is preserved.');
  assert.equal(adopted.changed(adopted.refs.get('main'),replacedShared.head).length,2);assert.deepEqual((await ac.load(ep)).asset,blue);
  console.log('Publisher: Unicode create/edit, atomic registry, pending resume, collision checks, stale guards, lost-response recovery, pinned branch updates, merged recovery and permissions passed.');
  console.log('Artwork: bounded fingerprinted WebP, atomic note/image commit, immutable reuse, pending replacement/removal, cross-device load, registry refresh, and every lost-response stage passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
