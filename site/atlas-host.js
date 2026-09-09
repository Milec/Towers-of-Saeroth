/* Narrow integration boundary: atlas globals never enter the wiki document. */
const validAtlasSelection = value => /^(nation|burg|poi|province|route)-\d+$/.test(value || '');
window.selectHostedAtlas = selection => {
  if (validAtlasSelection(selection)) document.querySelector('.atlas-frame')?.contentWindow.postMessage({type:'atlas-select', selection}, location.origin);
};
window.addEventListener('message', e => {
  const frame = document.querySelector('.atlas-frame');
  if (e.origin !== location.origin || e.source !== frame?.contentWindow || e.data?.type !== 'atlas-selection' || !validAtlasSelection(e.data.selection)) return;
  history.replaceState(null, '', '#/atlas#' + e.data.selection);
  dispatchEvent(new CustomEvent('atlas-selection-change',{detail:e.data.selection}));
});
window.mountAtlas = function(container, selection) {
  container.classList.add('wide');
  container.replaceChildren();
  document.body.classList.add('view-atlas');
  const frame = document.createElement('iframe');
  frame.title = 'Interactive Living Atlas of Saeroth';
  frame.className = 'atlas-frame';
  frame.src = 'atlas/?integrated=1' + (/^(nation|burg|poi|province|route)-\d+$/.test(selection || '') ? '#' + selection : '');
  container.append(frame);
  frame.addEventListener('load', () => {
    if (!frame.isConnected) return;
    const syncTheme = () => {
      const theme = document.documentElement.dataset.theme ||
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      frame.contentDocument.documentElement.dataset.theme = theme;
    };
    syncTheme();
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', syncTheme);
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
    frame.addEventListener('atlas-dispose', () => { observer.disconnect(); media.removeEventListener('change', syncTheme); }, {once:true});
  }, {once:true});
  document.title = 'Living Atlas — Towers of Saeroth';
};
let atlasLore;
window.addAtlasLinks = async function(container, note) {
  try {
    atlasLore ||= fetch('atlas/lore-index.json').then(r => { if (!r.ok) throw Error(r.status); return r.json(); });
    const index = await atlasLore;
    if (decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('#')[0] !== note) return;
    const ids = index.byNote[note] || [];
    if (!ids.length) return;
    const nav = document.createElement('nav');
    nav.className = 'atlas-note-links';
    nav.setAttribute('aria-label', 'Places on the atlas');
    for (const id of ids) {
      const a = document.createElement('a');
      a.className = 'linkbtn';
      a.href = '#/atlas#' + id;
      a.textContent = 'Show on map: ' + index.entries[id].name;
      nav.append(a);
    }
    container.querySelector('.crumbs')?.after(nav);
  } catch (_) { atlasLore = null; }
};
