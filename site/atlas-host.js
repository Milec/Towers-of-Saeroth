/* Narrow integration boundary: atlas globals never enter the wiki document. */
window.mountAtlas = function(container, selection) {
  container.classList.add('wide');
  container.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = 'Living Atlas';
  const frame = document.createElement('iframe');
  frame.title = 'Interactive Living Atlas of Saeroth';
  frame.className = 'atlas-frame';
  frame.src = 'atlas/' + (/^(nation|burg|poi|province|route)-\d+$/.test(selection || '') ? '#' + selection : '');
  container.append(title, frame);
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
