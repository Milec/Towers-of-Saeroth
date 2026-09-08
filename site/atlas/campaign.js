/* The host owns note routing; this document owns all map coordinates and UI. */
(() => {
  if (new URLSearchParams(location.search).has('integrated')) {
    document.documentElement.classList.add('integrated');
    document.querySelector('header').hidden = true;
  }
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
  show = function(...args) { originalShow(...args); links(); };
  fetch('lore-index.json').then(r => { if (!r.ok) throw Error(r.status); return r.json(); })
    .then(value => { index = value; links(); }).catch(() => {});
})();
