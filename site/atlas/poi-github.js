/* GitHub writes are atomic commits on review branches, never browser-stored credentials. */
(() => {
  const repo='Milec/Towers-of-Saeroth';
  const normalized=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  const meta=text=>{try{return JSON.parse(text.match(/^atlas_poi: (.+)$/m)?.[1]);}catch(_){return null;}};
  const safeTitle=(name,id)=>{
    let value=name.replace(/[\\/:*?"<>|\[\]#%\r\n\x00-\x1f]/g,' ').replace(/\s+/g,' ').replace(/[. ]+$/,'').trim();
    if(!value||/^(con|prn|aux|nul|com\d|lpt\d)(?:\.|$)/i.test(value))value='Map location '+id;
    return value;
  };
  const markdown=(p,title)=>'---\ntitle: '+JSON.stringify(title)+'\ntype: location\natlas_poi: '+JSON.stringify(Object.fromEntries(['id','name','kind','x','y'].map(k=>[k,p[k]])))+'\n---\n\n'+p.notes+'\n';
  function createClient(token,request=fetch){
    async function api(path,method='GET',body){
      const response=await request('https://api.github.com/repos/'+repo+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      if(!response.ok){const error=new Error(response.status===401?'GitHub connection expired. Reconnect to sync.':response.status===403?'GitHub denied access. Check token permissions or rate limits.':response.status===409||response.status===422?'The review branch changed. Retry; no changes were forced.':'GitHub request failed ('+response.status+'). Your POI remains saved locally.');error.status=response.status;throw error;}
      return response.status===204?null:response.json();
    }
    async function file(path,ref){
      try{
        const value=await api('/contents/'+path.split('/').map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(ref));
        const bytes=Uint8Array.from(atob(value.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
        return {sha:value.sha,text:new TextDecoder().decode(bytes)};
      }catch(error){if(error.status===404)return null;throw error;}
    }
    return {
      connect:async()=>{const r=await api('');if(!r.permissions?.push)throw Error('This connection needs write access to Towers-of-Saeroth.');return r;},
      sync:async function sync(p,directory,retries=0){
        if(!/^campaign\/(?:nations\/[^/]+\/locations|world\/locations)$/.test(directory))throw Error('Invalid campaign folder.');
        if(p.notePath&&(!/^campaign\/(nations|world)\/[^\\%\r\n]+\.md$/.test(p.notePath)||p.notePath.split('/').some(s=>s==='..'||s==='.')))throw Error('Invalid campaign note path.');
        const marker='<!-- atlas-poi-sync -->';let reviews=[];
        for(let page=1;page<=10;page++){
          const batch=await api('/pulls?state=open&per_page=100&page='+page);reviews.push(...batch.filter(pr=>pr.body?.includes(marker)&&pr.head?.repo?.full_name===repo));
          if(batch.length<100)break;if(page===10)throw Error('Too many open reviews to locate this POI safely.');
        }
        if(reviews.length>1)throw Error('More than one atlas sync review is open. Resolve those reviews before syncing.');
        const review=reviews[0];
        const ref=await api('/git/ref/heads/'+(review?encodeURIComponent(review.head.ref):'main'));
        const head=ref.object.sha,commit=await api('/git/commits/'+head);
        const root=await api('/git/trees/'+commit.tree.sha),campaign=root.tree.find(e=>e.path==='campaign');
        if(!campaign)throw Error('The campaign folder is missing.');
        const tree=await api('/git/trees/'+campaign.sha+'?recursive=1');
        if(tree.truncated)throw Error('The campaign listing is incomplete; nothing was changed.');
        const noteFiles=tree.tree.filter(e=>e.type==='blob'&&e.path.endsWith('.md')).map(e=>'campaign/'+e.path);
        const pointerPath='campaign/.atlas/poi-'+p.id+'.json';
        const pointerFile=await file(pointerPath,head);
        if(pointerFile){
          const pointer=JSON.parse(pointerFile.text);
          if(pointer.id!==p.id||!/^campaign\/(nations|world)\/[^\\%\r\n]+\.md$/.test(pointer.notePath)||pointer.notePath.split('/').some(s=>s==='..'||s==='.'))throw Error('Invalid campaign POI index.');
          const current=await file(pointer.notePath,head);
          if(current&&meta(current.text)?.id===p.id){
            if(review&&current.text===markdown(p,pointer.notePath.split('/').pop().slice(0,-3)))return {notePath:pointer.notePath,noteSHA:current.sha,url:review.html_url};
            if(!p.notePath)throw Error('This POI already has a campaign note. Load the published note or resolve its existing review first.');
          }
        }
        // Recover an acknowledged GitHub write whose response was lost locally.
        const candidateTitles=[safeTitle(p.name,p.id),safeTitle(p.name,p.id)+' ('+p.id+')'];
        if(review){
          for(const path of noteFiles.filter(path=>candidateTitles.includes(path.split('/').pop().slice(0,-3)))){
            const candidate=await file(path,head),metadata=candidate&&meta(candidate.text);
            if(metadata?.id===p.id&&candidate.text===markdown(p,path.split('/').pop().slice(0,-3)))return {notePath:path,noteSHA:candidate.sha,url:review.html_url};
            if(metadata?.id===p.id&&!p.notePath)throw Error('This POI already has changes in a review. Load that note before editing it from another browser.');
          }
        }
        const previous=p.notePath?await file(p.notePath,head):null;
        if(p.notePath&&(!previous||previous.sha!==p.noteSHA))throw Error('This campaign note changed on GitHub. Your local draft was kept. Import the latest published note or resolve its review before overwriting it.');
        if(previous&&meta(previous.text)?.id!==p.id)throw Error('The linked note no longer belongs to this POI.');
        let title=safeTitle(p.name,p.id);
        const collision=title=>noteFiles.some(path=>path!==p.notePath&&normalized(path.split('/').pop().slice(0,-3))===normalized(title));
        if(collision(title))title+=' ('+p.id+')';
        const folder=p.notePath?p.notePath.slice(0,p.notePath.lastIndexOf('/')):directory;
        const notePath=folder+'/'+title+'.md';
        if(collision(title)&&notePath!==p.notePath)throw Error('A campaign note already uses this name. Rename the POI first.');
        const content=markdown(p,title),changes=[{path:notePath,mode:'100644',type:'blob',content},{path:pointerPath,mode:'100644',type:'blob',content:JSON.stringify({id:p.id,notePath})+'\n'}];
        // A rename leaves a wikilink redirect instead of breaking existing links.
        if(p.notePath&&p.notePath!==notePath){const oldTitle=p.notePath.split('/').pop().slice(0,-3);changes.push({path:p.notePath,mode:'100644',type:'blob',content:'---\ntitle: '+JSON.stringify(oldTitle)+'\ntype: location\n---\n\nSee [['+title+']].\n'});}
        const indexPath='campaign/world/Atlas Locations.md';
        const index=await file(indexPath,head);
        const link='[['+title+']]';
        if(!index?.text.includes(link))changes.push({path:indexPath,mode:'100644',type:'blob',content:(index?.text||'---\ntitle: Atlas Locations\ntype: index\n---\n\n# Atlas Locations\n\n')+'\n- '+link+'\n'});
        const newTree=await api('/git/trees','POST',{base_tree:commit.tree.sha,tree:changes});
        const newCommit=await api('/git/commits','POST',{message:'Sync atlas POI: '+p.name,tree:newTree.sha,parents:[head]});
        const branch=review?review.head.ref:'atlas-notes-'+Date.now();
        if(review)await api('/git/refs/heads/'+encodeURIComponent(branch),'PATCH',{sha:newCommit.sha,force:false});
        else await api('/git/refs','POST',{ref:'refs/heads/'+branch,sha:newCommit.sha});
        if(review){
          const current=await api('/pulls/'+review.number);
          if(current.state!=='open'){
            if(retries>=1)throw Error('The sync PR closed during saving. Your local draft was kept; retry to publish it.');
            return sync(p,directory,retries+1);
          }
        }
        let pr=review;
        if(!pr)pr=await api('/pulls','POST',{title:'Sync atlas campaign locations',head:branch,base:'main',body:marker+'\n\nCreate or update the campaign note and shared atlas location for '+p.name+'. Generated from the atlas editor; authorized to merge and publish automatically after repository verification passes.'});
        const saved=await file(notePath,newCommit.sha);
        return {notePath,noteSHA:saved.sha,url:pr.html_url};
      }
    };
  }
  window.POIGitHub={createClient,markdown,safeTitle};
})();
