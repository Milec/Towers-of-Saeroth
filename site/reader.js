/* An entry can stay open while the GM looks up a connected person or place. */
(() => {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const href = path => '#/' + encodeURI(path);
  const eye = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  let current, observer, dialog, previewSerial = 0, opener;
  const cache = new Map();

  function title(row) { return row?.title || row?.p?.split('/').pop().replace(/\.md$/, '') || ''; }
  function textExcerpt(raw) {
    return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !/^[#>|]/.test(p))
      .slice(0, 5).map(p => p.replace(/[*_`]/g, '').replace(/\n/g, ' ').slice(0, 1200));
  }
  function closePreview() {
    previewSerial++;
    if (dialog?.open) dialog.close();
  }
  async function preview(path, source) {
    if (!current) return;
    const api = current.api;
    const row = api.notes.find(n => n.p === path) || {p:path};
    const serial = ++previewSerial;
    opener = source;
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'note-preview';
      dialog.setAttribute('aria-labelledby', 'previewTitle');
      document.body.append(dialog);
      dialog.addEventListener('click', e => { if (e.target === dialog) closePreview(); });
      dialog.addEventListener('cancel', () => { previewSerial++; });
      dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus(); });
    }
    dialog.innerHTML = `<header class="preview-head"><span>QUICK REFERENCE</span><button type="button" class="preview-close" aria-label="Close preview">Close <span aria-hidden="true">×</span></button></header><div class="preview-body"><p class="reader-kicker">${esc(row.t || 'Campaign entry')}</p><h2 id="previewTitle">${esc(title(row))}</h2><div class="preview-excerpt" aria-live="polite"><p class="muted">Loading entry…</p></div></div><footer><a class="preview-open" href="${href(path)}">Open full entry <span aria-hidden="true">↗</span></a><span>Keep your place while you look up the details.</span></footer>`;
    dialog.querySelector('.preview-close').onclick = closePreview;
    dialog.querySelector('.preview-open').onclick = closePreview;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.preview-close').focus();
    try {
      let raw = cache.get(path);
      if (!raw) { raw = await api.fetchNote(path); cache.set(path, raw); if (cache.size > 24) cache.delete(cache.keys().next().value); }
      if (serial !== previewSerial || !dialog.open) return;
      const paras = textExcerpt(raw);
      const body = dialog.querySelector('.preview-excerpt');
      body.innerHTML = (row.image ? `<img class="preview-art" src="${esc(api.base + row.image.split('/').map(encodeURIComponent).join('/'))}" alt="${esc(title(row))}" loading="lazy">` : '') +
        (paras.length ? paras.map(p => `<p>${esc(p)}</p>`).join('') : '<p class="muted">This entry contains structured reference material. Open the full entry to read it.</p>');
    } catch (_) {
      if (serial === previewSerial && dialog.open) dialog.querySelector('.preview-excerpt').innerHTML = '<p class="muted">This entry is unavailable offline. Open it when you are connected.</p>';
    }
  }

  function dispose() {
    observer?.disconnect(); observer = null;
    document.getElementById('readerContext')?.remove();
    document.body.classList.remove('view-reader');
    closePreview(); current = null;
  }
  function mount(el, path, api) {
    current = {el, path, api};
    document.body.classList.add('view-reader');
    el.querySelector('.section-links')?.remove();
    const row = api.notes.find(n => n.p === path);
    const heading = el.querySelector('h1');
    if (path.startsWith('campaign/')) {
      const edit=document.createElement('a'); edit.className='entry-edit'; edit.href='#/edit/'+encodeURI(path); edit.textContent='Edit entry';
      const actions=el.querySelector('.ws-note-actions');
      if(actions)actions.prepend(edit);
    }
    if (heading && !el.querySelector('.reader-kicker')) {
      const kicker = document.createElement('p'); kicker.className = 'reader-kicker';
      kicker.textContent = row?.t ? row.t.replace(/-/g, ' ') : path.startsWith('vault/') ? 'Pathfinder reference' : 'Campaign entry';
      heading.before(kicker);
    }
    if (['npc', 'pc', 'creature', 'deity'].includes(row?.t)) {
      const portrait = el.querySelector('p > img');
      if (portrait) {
        portrait.parentElement.classList.add('entry-portrait-wrap');
        const link = document.createElement('a');
        link.href = portrait.src; link.target = '_blank'; link.rel = 'noopener';
        link.setAttribute('aria-label', 'Open full portrait of ' + title(row));
        portrait.replaceWith(link); link.append(portrait);
      }
    }
    const headings = [...el.querySelectorAll('h2[id], h3[id]')].filter(h => !h.closest('.relsource, .props')).slice(0, 40);
    const outbound = new Set((row?.l || []).map(name => api.resolveTarget(name)).filter(p => p && p !== path));
    const name = path.split('/').pop().replace(/\.md$/, '').toLowerCase();
    const inbound = api.notes.filter(n => n.p !== path && (n.l || []).includes(name));
    const related = [...outbound].map(p => ({p, relation:'Mentioned here'}));
    for (const n of inbound) if (!outbound.has(n.p)) related.push({p:n.p, relation:'Links to this entry'});
    const aside = document.createElement('aside'); aside.id = 'readerContext'; aside.className = 'reader-context'; aside.setAttribute('aria-label', 'Entry guide');
    aside.innerHTML = `<details class="reader-guide" open><summary>In this entry <span>${headings.length} sections</span></summary><nav aria-label="On this page">${headings.length ? headings.map(h => `<a class="reader-section${h.tagName === 'H3' ? ' sub' : ''}" href="${href(path)}#${encodeURIComponent(h.id)}" data-heading="${esc(h.id)}">${esc(h.textContent)}</a>`).join('') : '<p class="reader-empty">A short entry. Everything is on this page.</p>'}</nav></details><details class="reader-connections" open><summary>Connected entries <span>${related.length}</span></summary><p class="reader-tip">Preview a connection without leaving this entry.</p><ul>${related.slice(0, 24).map(item => {
      const linked = api.notes.find(n => n.p === item.p) || {p:item.p};
      return `<li><a href="${href(item.p)}">${esc(title(linked))}<small>${esc(linked.t || item.relation)}</small></a><button type="button" data-preview="${esc(item.p)}" aria-label="Preview ${esc(title(linked))}">${eye}</button></li>`;
    }).join('') || '<li class="reader-empty">No linked campaign entries yet.</li>'}</ul>${related.length > 24 ? '<p class="reader-tip">More incoming links appear below the entry.</p>' : ''}</details><a class="reader-library" href="#/library">Browse the world library <span aria-hidden="true">↗</span></a>`;
    el.after(aside);
    const tools = document.createElement('div'); tools.className='reader-tools';
    tools.innerHTML = `<button type="button" class="reader-copy">Copy entry link</button><span class="reader-copy-status" role="status"></span>`;
    aside.append(tools);
    tools.querySelector('button').onclick = async () => {
      const url = new URL(api.base, location.href).href + href(path);
      try { await navigator.clipboard.writeText(url); tools.querySelector('[role="status"]').textContent='Entry link copied.'; }
      catch (_) {
        tools.querySelector('[role="status"]').textContent='Select and copy this link:';
        let input=tools.querySelector('input');
        if(!input){input=document.createElement('input');input.readOnly=true;input.setAttribute('aria-label','Entry link');tools.append(input);}
        input.value=url;input.focus();input.select();
      }
    };
    let mobileGuide;
    if (headings.length) {
      mobileGuide = document.createElement('details'); mobileGuide.className='reader-mobile-guide';
      const summary = document.createElement('summary'); summary.textContent='On this page';
      const toc = aside.querySelector('.reader-guide nav').cloneNode(true);
      toc.setAttribute('aria-label','Sections in this entry'); mobileGuide.append(summary,toc);
      (el.querySelector('.ws-note-actions') || heading)?.after(mobileGuide);
    }
    const sectionLinks = [...aside.querySelectorAll('[data-heading]'), ...(mobileGuide?.querySelectorAll('[data-heading]') || [])];
    sectionLinks.forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); const h = headings.find(n => n.id === a.dataset.heading); if (!h) return;
      for (let p=h.parentElement;p && p!==el;p=p.parentElement) if (p.tagName === 'DETAILS') p.open=true;
      history.replaceState(null, '', a.getAttribute('href')); h.scrollIntoView({block:'start'});
      h.setAttribute('tabindex','-1'); h.focus({preventScroll:true});
    }));
    aside.querySelectorAll('[data-preview]').forEach(b => b.onclick = () => preview(b.dataset.preview, b));
    if (headings.length && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a,b) => a.boundingClientRect.top-b.boundingClientRect.top)[0];
        if (!visible) return;
        sectionLinks.forEach(a => {
          if (a.dataset.heading === visible.target.id) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current');
        });
      }, {root:document.getElementById('main'), rootMargin:'0px 0px -55% 0px', threshold:0});
      headings.forEach(h => observer.observe(h));
    }
    if (matchMedia('(max-width:1100px)').matches) aside.querySelectorAll('details').forEach(d => d.open=false);
  }
  window.SaerothReader = {mount, dispose, preview};
})();
