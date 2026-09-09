/* Presentation helpers. Canon and geographic records stay in their source files. */
(() => {
  const q = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.polishNote = (el, target) => {
    const heading = el.querySelector('h1');
    if (target === 'campaign/README.md') {
      const archive = document.createElement('details');
      archive.innerHTML = '<summary>Repository and authoring guide</summary>';
      while (heading?.nextSibling) archive.append(heading.nextSibling);
      if (heading) heading.textContent = 'Explore Saeroth';
      const home = document.createElement('nav'); home.className = 'home-actions'; home.setAttribute('aria-label','Explore the campaign');
      home.innerHTML = [['atlas','Living Atlas','Places, roads and journeys'],['campaign/nations/Nations of the World.md','Nations','Cultures and capitals'],['campaign/nations/Political Relations.md','Relationships','Alliances and rivalries'],['campaign/world/Trade Routes.md','Trade','Goods and corridors'],['campaign/world/history/Ages of Saeroth.md','History','Events and eras']].map(([p,t,d]) => `<a href="#/${encodeURI(p)}"><strong>${t}</strong><span>${d}</span></a>`).join('') + '<button type="button" id="homeSearch">Search the campaign</button>';
      heading?.after(home); home.after(archive); q('#homeSearch').onclick = () => q('#searchBtn').click();
    }
    const headings = target === 'campaign/README.md' ? [] : [...el.querySelectorAll('h2[id]')];
    if (headings.length > 3) {
      const nav = document.createElement('details'); nav.className='section-links';
      nav.innerHTML='<summary>On this page</summary>'+headings.map(h=>`<a href="#/${encodeURI(target)}#${encodeURIComponent(h.id)}">${esc(h.textContent)}</a>`).join(''); heading?.after(nav);
    }
  };
  window.polishDiagram = (fig, nodes, select) => {
    const heading = fig.closest('article')?.querySelector('h1'); heading?.after(fig);
    const bar=document.createElement('div'); bar.className='diagram-tools';
    if (nodes) {
      const label=document.createElement('label'); label.textContent='Find a nation';
      const input=document.createElement('input');input.type='search';input.placeholder='Filter nations'; label.append(input);
      const list=document.createElement('div');list.className='nation-picker';list.setAttribute('aria-label','Nations');
      for(const node of [...nodes].sort((a,b)=>a.name.localeCompare(b.name))) {const b=document.createElement('button');b.textContent=node.name;b.onclick=()=>{select(node);fig.querySelector('.rel-ledger').scrollIntoView({block:'nearest'});};list.append(b);}
      input.oninput=()=>{for(const b of list.children)b.hidden=!b.textContent.toLowerCase().includes(input.value.toLowerCase());};
      bar.append(label,list);
      const toggle=document.createElement('button');toggle.textContent='Show relationship diagram';toggle.setAttribute('aria-expanded','false');
      toggle.onclick=()=>{const open=fig.classList.toggle('diagram-open');toggle.setAttribute('aria-expanded',open);toggle.textContent=open?'Hide relationship diagram':'Show relationship diagram';};bar.append(toggle);
    } else {
      const hint=document.createElement('p');hint.textContent='Schematic trade corridors. Use the atlas for road-by-road journeys.';bar.append(hint);
      const a=document.createElement('a');a.href='#/atlas';a.textContent='Plan a journey in the atlas';bar.append(a);
    }
    const fit=document.createElement('button');fit.textContent='Fit world';
    const zoom=document.createElement('button');zoom.textContent='Enlarge map';
    const canvas=fig.querySelector('.rel-canvas'), svg=fig.querySelector('svg');
    fit.onclick=()=>{svg.style.width='100%';if(svg.dataset.worldView)svg.setAttribute('viewBox',svg.dataset.worldView);canvas.scrollTo(0,0);};
    zoom.onclick=()=>{svg.style.width=Math.min(500,(parseFloat(svg.style.width)||100)*1.5)+'%';};
    const out=document.createElement('button');out.textContent='Zoom out';out.onclick=()=>{svg.style.width=Math.max(100,(parseFloat(svg.style.width)||100)/1.5)+'%';};
    bar.append(fit,zoom,out);fig.prepend(bar);
    if(!nodes)fig.append(fig.querySelector('.rel-controls'));
  };

  const modal=q('#searchModal'), input=q('#searchInput'), results=q('#searchResults'), box=modal.querySelector('.modalbox');
  input.id='searchInput'; input.placeholder='Search lore, places or rules';
  const label=document.createElement('label');label.htmlFor=input.id;label.textContent='Search Saeroth';
  const close=document.createElement('button');close.textContent='Close search';close.className='search-close';
  const scope=document.createElement('select');scope.setAttribute('aria-label','Search scope');scope.innerHTML=['All','Lore','Places','Rules'].map(x=>`<option>${x}</option>`).join('');
  box.prepend(label,close,scope);
  let opener, index;
  const background=()=>[q('.topbar'),q('.layout'),q('#graphView')];
  function shut(){modal.hidden=true;background().forEach(e=>{if(e)e.inert=false;});opener?.focus();}
  async function refresh(){
    const query=input.value.trim().toLowerCase(), mode=scope.value;
    let rows=search(input.value, mode).filter(r=>mode==='All'||mode==='Lore'&&r.p.startsWith('campaign/')||mode==='Rules'&&r.p.startsWith('vault/'));
    if(mode==='Places')rows=[];
    if(query&&(mode==='All'||mode==='Places')&&index) rows.push(...Object.entries(index.entries).filter(([k,r])=>r.name?.toLowerCase().includes(query)).slice(0,40).map(([k,r])=>({p:'atlas#'+k,name:r.name,snippet:'Map '+k.split('-')[0]+(r.direct?' · Dedicated campaign lore':' · Atlas record')})));
    showResults(rows.slice(0,60));
  }
  q('#searchBtn').addEventListener('click',e=>{e.stopImmediatePropagation();opener=document.activeElement;modal.hidden=false;background().forEach(e=>{if(e)e.inert=true;});input.focus();ensureVault().then(refresh).catch(()=>{});if(!index)fetch('atlas/lore-index.json').then(r=>r.json()).then(v=>{index=v;refresh();}).catch(()=>{});},true);
  close.onclick=shut;
  modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('#searchResults a')){e.stopImmediatePropagation();shut();}},true);
  input.addEventListener('input',e=>{e.stopImmediatePropagation();refresh();},true);scope.onchange=refresh;
  modal.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.stopImmediatePropagation();shut();}
    if(e.key==='Tab') {const items=[...box.querySelectorAll('button,input,select,a[href]')].filter(e=>!e.hidden),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  });
})();
