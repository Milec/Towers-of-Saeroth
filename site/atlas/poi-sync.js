/* Optional repository connection: saves draft notes to review PRs. */
(() => {
  let client=null,queue=Promise.resolve(),busy=false;
  const panel=document.createElement('details');panel.className='atlas-controls';panel.id='poiSync';
  panel.innerHTML='<summary>Campaign note sync</summary><p>Connect GitHub to create or update a campaign note whenever you save a POI. Changes go into a pull request; merging it publishes the note and POI to other devices.</p><p class="muted">Use a fine-grained token for Towers-of-Saeroth with Contents and Pull requests read/write. The credential stays in memory for this tab and is never included in a backup. Reconnect after refreshing.</p><p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a GitHub token</a> · <a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank" rel="noopener">Setup help</a></p><form id="poiSyncConnect"><label for="poiSyncToken">GitHub token</label><input id="poiSyncToken" type="password" autocomplete="off" spellcheck="false" required><button type="submit">Connect GitHub</button></form><label><input id="poiSyncAuto" type="checkbox" checked>Automatically sync POI saves</label><div class="journey-actions"><button type="button" id="poiSyncPending" disabled>Sync pending POIs</button><button type="button" id="poiSyncDisconnect" disabled>Disconnect</button></div><p id="poiSyncStatus" role="status" aria-live="polite">Not connected. POIs remain local drafts.</p>';
  $('#customPOIPanel').after(panel);
  const report=text=>$('#poiSyncStatus').textContent=text;
  const controls=()=>{ $('#poiSyncPending').disabled=!client||busy;$('#poiSyncDisconnect').disabled=!client||busy;$('#poiSyncConnect button').disabled=busy; };
  $('#poiSyncConnect').onsubmit=async e=>{
    e.preventDefault();const token=$('#poiSyncToken').value.trim();$('#poiSyncToken').value='';if(!token)return;
    busy=true;controls();report('Connecting to GitHub…');
    try{const candidate=POIGitHub.createClient(token);await candidate.connect();client=candidate;report('Connected. Future POI saves will create or update review notes. Use Sync pending POIs for existing drafts.');}
    catch(error){client=null;report(error.message);}finally{busy=false;controls();}
  };
  $('#poiSyncDisconnect').onclick=()=>{client=null;controls();report('Disconnected. POIs will be saved locally.');};
  let lore;
  async function directory(p){
    const context=document.createElement('canvas').getContext('2d');
    const country=D.countries.find(c=>context.isPointInPath(new Path2D(c.path),p.x,p.y,'evenodd'));
    if(!country)return 'campaign/world/locations';
    lore??=await fetch('lore-index.json').then(r=>{if(!r.ok)throw Error('Campaign links are unavailable. Try syncing again online.');return r.json();});
    const note=lore.entries['nation-'+country.properties.state]?.note;
    return note?.startsWith('campaign/nations/')?note.slice(0,note.lastIndexOf('/'))+'/locations':'campaign/world/locations';
  }
  function enqueue(id){
    queue=queue.then(async()=>{
      if(!client)return;
      const p=ATLAS_CUSTOM_POIS.get(id);if(!p)return;
      busy=true;controls();report('Creating campaign note for '+p.name+'…');
      try{
        const result=await client.sync(p,await directory(p));
        ATLAS_CUSTOM_POIS.synced(p,result.notePath,result.noteSHA);
        report('Campaign note saved for review. Merge the PR to publish it. ');
        const link=document.createElement('a');link.href=result.url;link.target='_blank';link.rel='noopener';link.textContent='Open pull request';$('#poiSyncStatus').append(link);
      }catch(error){if([401,403].includes(error.status))client=null;report(error.message);}finally{busy=false;controls();}
    });
  }
  addEventListener('atlas-poi-saved',e=>{
    if(client&&$('#poiSyncAuto').checked)enqueue(e.detail);
    else report('POI saved locally. '+(client?'Use Sync pending POIs to create its note.':'Connect GitHub to create its campaign note.'));
  });
  $('#poiSyncPending').onclick=()=>{
    const pending=ATLAS_CUSTOM_POIS.all().filter(p=>p.pendingSync||!p.notePath);
    if(!pending.length){report('All saved POIs have linked notes.');return;}
    pending.forEach(p=>enqueue(p.id));
  };
})();
