/* The host owns note routing; this document owns all map coordinates and UI. */
(() => {
  if (new URLSearchParams(location.search).has('integrated')) {
    document.documentElement.classList.add('integrated');
    document.querySelector('header').hidden = true;
  }
  const presets = document.createElement('nav'); presets.className='atlas-presets'; presets.setAttribute('aria-label','Map presets');
  presets.innerHTML=['Explore','Political','Travel'].map(name=>`<button type="button" data-map-preset="${name}">${name}</button>`).join('');
  document.querySelector('.search').after(presets);
  presets.onclick=e=>{
    const name=e.target.dataset.mapPreset;if(!name)return;
    document.querySelector(`[data-style="${name==='Political'?'political':'terrain'}"]`).click();
    for(const input of document.querySelectorAll('[data-layer]')) {
      const key=input.dataset.layer;
      if (['custompois','custompoilabels'].includes(key)) continue;
      const on=name==='Political'?['countries','provinces','settlements','townlabels'].includes(key):name==='Travel'?['countries','roads','trails','searoutes','settlements','ports','pois','townlabels'].includes(key):['countries','relief','roads','settlements','pois','townlabels'].includes(key);
      input.checked=on;input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    for(const button of presets.children)button.setAttribute('aria-pressed',button===e.target);
  };
  const jumps=document.querySelector('.atlas-jumps');
  jumps?.addEventListener('click',e=>{if(e.target.dataset.jump)for(const b of jumps.children)b.setAttribute('aria-current',b===e.target?'true':'false');});
  // Keep presentation state when visiting lore; never save geographic records.
  const save=()=>{try{sessionStorage.setItem('saeroth-view',JSON.stringify({box,selection:location.hash,layers:[...document.querySelectorAll('[data-layer]')].map(e=>[e.dataset.layer,e.checked])}));}catch{}};
  addEventListener('pagehide',save);
  document.addEventListener('click',e=>{if(e.target.closest('a[target="_top"]'))save();});
  try{const saved=JSON.parse(sessionStorage.getItem('saeroth-view'));if(saved?.selection===location.hash&&saved.box?.length===4&&saved.box.every(Number.isFinite)){box=saved.box;for(const [key,on]of saved.layers||[]){const input=[...document.querySelectorAll('[data-layer]')].find(e=>e.dataset.layer===key);if(input){input.checked=on;input.dispatchEvent(new Event('change',{bubbles:true}));}}renderView();}}catch{}
  let index;
  const info = document.getElementById('info');
  function links() {
    if (!index || !selected) return;
    const key = `${selected.type}-${selected.id}`;
    const record = index.entries[key];
    if (!record?.note || info.querySelector('.campaign-link')) return;
    const a = document.createElement('a');
    a.className = 'campaign-link';
    a.href = '../#/' + encodeURI(record.note);
    a.target = '_top';
    a.textContent = record.direct ? 'Read campaign lore →' : 'Read this nation’s campaign lore →';
    const p = document.createElement('p');
    p.className = 'campaign-link';
    p.append(a);
    info.querySelector('h2')?.after(p);
  }
  // Wrapping the current selection function preserves the existing geography,
  // symbol alignment and label hooks installed before this module.
  const originalShow = show;
  show = function(...args) {
    originalShow(...args); links();
    if (parent !== window && selected) parent.postMessage({type:'atlas-selection', selection:`${selected.type}-${selected.id}`}, location.origin);
  };
  addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== parent || e.data?.type !== 'atlas-select') return;
    const match = /^(nation|burg|poi|province|subprovince|custompoi|route)-(\d+)$/.exec(e.data.selection || '');
    if (!match) return;
    if (match[1] === 'custompoi') { if(window.ATLAS_CUSTOM_POIS?.has(+match[2])) show('custompoi',+match[2]); return; }
    const records = {nation:D.states, burg:D.burgs, poi:D.markers, province:D.provinces, subprovince:districts, route:D.routes}[match[1]];
    if (records?.some(r => r && r.i === +match[2] && !r.removed)) show(match[1], +match[2]);
  });
  fetch('lore-index.json').then(r => { if (!r.ok) throw Error(r.status); return r.json(); })
    .then(value => { index = value; links(); }).catch(() => {});
})();
