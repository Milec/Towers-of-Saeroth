/* Search the campaign, the atlas and PF2e without loading the rules on entry. */
(() => {
  'use strict';
  const modal = document.getElementById('searchModal');
  const box = modal?.querySelector('.modalbox');
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  if (!box || !input || !results) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ß/g, 'ss');
  const titleOf = path => path.split('/').pop().replace(/\.md$/i, '');
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
  let epoch = 0, timer, opener, inertStates = [], active = -1;
  let campaignSource, campaignRows = [], vaultSource, vaultRows = [];
  let placeRows = null, placesLoading = null;
  const status = {rules: '', places: ''};

  box.classList.add('search-dialog');
  box.setAttribute('aria-labelledby', 'searchTitle');
  box.removeAttribute('aria-label');
  const header = document.createElement('div');
  header.className = 'search-heading';
  header.innerHTML = '<div><span class="search-eyebrow">THE CAMPAIGN ARCHIVE</span><h2 id="searchTitle">Find your next thread</h2></div>' +
    '<button type="button" class="search-close" aria-label="Close search">Close <kbd aria-hidden="true">Esc</kbd></button>';
  const field = document.createElement('div');
  field.className = 'search-field';
  const label = document.createElement('label'); label.htmlFor = input.id;
  label.className = 'search-input-label'; label.textContent = 'Search Saeroth';
  field.innerHTML = icon;
  input.placeholder = 'A person, place, session or rule…';
  input.setAttribute('aria-describedby', 'searchHelp searchStatus');
  input.setAttribute('aria-controls', 'searchResults');
  input.maxLength = 160;
  field.append(input);
  const clear = document.createElement('button'); clear.type = 'button';
  clear.className = 'search-clear'; clear.textContent = 'Clear'; clear.hidden = true;
  field.append(clear);
  const tools = document.createElement('div'); tools.className = 'search-tools';
  tools.innerHTML = '<label for="searchScope">Look in</label><select id="searchScope" aria-label="Search scope">' +
    ['All', 'Lore', 'Places', 'Rules'].map(value => `<option>${value}</option>`).join('') + '</select>' +
    '<span id="searchStatus" class="search-status" role="status" aria-live="polite"></span>';
  const scope = tools.querySelector('select');
  const statusLine = tools.querySelector('#searchStatus');
  const errors = document.createElement('div'); errors.className = 'search-errors'; errors.hidden = true;
  const footer = document.createElement('p'); footer.id = 'searchHelp'; footer.className = 'search-help';
  footer.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd> to browse · <kbd>Enter</kbd> to open</span><span>Accents and word order are optional.</span>';
  box.replaceChildren(header, label, field, tools, errors, results, footer);

  function indexedNotes() {
    if (campaignSource !== state.campaign) {
      campaignSource = state.campaign;
      campaignRows = state.campaign.map(note => {
        const name = note.title || titleOf(note.p), body = String(note.body || note.summary || '');
        return {p: note.p, name, title: fold(name), body: fold(body), excerpt: body, summary: note.summary || '',
          kind: note.t || 'note', group: 'Campaign lore', location: note.p.split('/').slice(1, -1).join(' / ')};
      });
    }
    return campaignRows;
  }

  function indexedRules() {
    if (vaultSource !== state.vault) {
      vaultSource = state.vault;
      vaultRows = state.vault.map(note => {
        const name = titleOf(note.p), parts = note.p.split('/');
        return {p: note.p, name, title: fold(name), body: '', kind: parts[1] || 'rule',
          group: 'PF2e rules', location: parts.slice(1, -1).join(' / ')};
      });
    }
    return vaultRows;
  }

  async function ensurePlaces() {
    if (placeRows) return;
    if (!placesLoading) placesLoading = (async () => {
      const response = await fetch(BASE + 'atlas/lore-index.json');
      if (!response.ok) throw new Error('Map index is unavailable');
      const index = await response.json();
      if (!index.entries || typeof index.entries !== 'object') throw new Error('Map index is invalid');
      placeRows = Object.entries(index.entries).filter(([id, record]) =>
        /^(nation|burg|poi|province|subprovince|custompoi|route)-\d+$/.test(id) && typeof record?.name === 'string'
      ).map(([id, record]) => ({p: 'atlas#' + id, name: record.name, title: fold(record.name), body: '',
        kind: ({burg:'settlement', poi:'landmark', custompoi:'campaign place'})[id.split('-')[0]] || id.split('-')[0],
        group: 'Places on the atlas', location: record.direct ? 'Linked to campaign lore' : 'Atlas record'}));
    })().finally(() => { placesLoading = null; });
    return placesLoading;
  }

  function rank(rows, query, terms) {
    const matches = [];
    for (const row of rows) {
      const inTitle = terms.every(term => row.title.includes(term));
      if (!inTitle && !terms.every(term => row.title.includes(term) || row.body.includes(term))) continue;
      const score = row.title === query ? 0 : row.title.startsWith(query) ? 1 : row.title.includes(query) ? 2 : inTitle ? 3 : 4;
      matches.push({row, score});
    }
    matches.sort((a, b) => a.score - b.score || a.row.name.length - b.row.name.length || a.row.name.localeCompare(b.row.name));
    return matches;
  }

  function snippet(row, terms) {
    if (!row.excerpt) return '';
    if (row.summary && (terms.every(term => row.title.includes(term)) || terms.some(term => fold(row.summary).includes(term)))) return row.summary;
    const first = terms.map(term => row.body.indexOf(term)).filter(at => at >= 0).sort((a, b) => a - b)[0] ?? 0;
    const from = Math.max(0, first - 45), value = row.excerpt.slice(from, from + 155).replace(/\s+/g, ' ');
    return (from ? '…' : '') + value + (from + 155 < row.excerpt.length ? '…' : '');
  }

  function renderErrors() {
    const messages = [];
    if ((scope.value === 'All' || scope.value === 'Rules') && status.rules === 'error') {
      messages.push('<p>The rules index could not load. Campaign results are still available. <button type="button" data-retry="rules">Retry rules</button></p>');
    }
    if ((scope.value === 'All' || scope.value === 'Places') && status.places === 'error') {
      messages.push('<p>The atlas index could not load. <button type="button" data-retry="places">Retry places</button></p>');
    }
    errors.hidden = messages.length === 0;
    errors.innerHTML = messages.join('');
  }

  function selectResult(index, moveFocus = false) {
    const links = [...results.querySelectorAll('a.search-result')];
    if (!links.length) { active = -1; return; }
    active = (index + links.length) % links.length;
    links.forEach((link, i) => link.classList.toggle('is-selected', i === active));
    links[active].scrollIntoView({block:'nearest'});
    if (moveFocus) links[active].focus({preventScroll:true});
  }

  function render() {
    const query = fold(input.value.trim()), terms = query.split(/\s+/).filter(Boolean), mode = scope.value;
    clear.hidden = !input.value;
    active = -1;
    renderErrors();
    if (!terms.length) {
      results.innerHTML = '<div class="search-empty"><strong>Follow a name. Find a connection.</strong>' +
        '<p>Search campaign notes, mapped locations, and Pathfinder rules from one place.</p>' +
        '<div class="search-suggestions">' + ['Expedition Site', 'Karoline', 'Sanguinor', 'Session'].map(value =>
          `<button type="button" data-query="${esc(value)}">${esc(value)}</button>`).join('') + '</div></div>';
      statusLine.textContent = 'Start with a name or a few words';
      results.setAttribute('aria-busy', 'false');
      return;
    }
    const sources = [];
    if (mode === 'All' || mode === 'Lore') sources.push(['Campaign lore', indexedNotes()]);
    if (mode === 'All' || mode === 'Places') sources.push(['Places on the atlas', placeRows || []]);
    if ((mode === 'All' || mode === 'Rules') && state.vaultLoaded) sources.push(['PF2e rules', indexedRules()]);
    const groups = sources.map(([name, rows]) => ({name, matches: rank(rows, query, terms)}));
    const count = groups.reduce((sum, group) => sum + group.matches.length, 0);
    const loading = ((mode === 'All' || mode === 'Rules') && status.rules === 'loading') ||
      ((mode === 'All' || mode === 'Places') && status.places === 'loading');
    const perGroup = mode === 'All' ? 12 : 40;
    let shown = 0;
    results.innerHTML = groups.filter(group => group.matches.length).map(group => {
      const displayed = group.matches.slice(0, perGroup); shown += displayed.length;
      return `<section class="search-group" aria-label="${group.name}"><h3>${group.name}<span>${group.matches.length}</span></h3>` +
        displayed.map(({row}) => `<a class="search-result" href="#/${encodeURI(row.p)}"><span class="search-result-heading"><strong>${esc(row.name)}</strong><span class="search-kind">${esc(row.kind)}</span></span>` +
          `<span class="search-result-path">${esc(row.location || 'Campaign')}</span>` +
          (row.excerpt ? `<span class="snip">${esc(snippet(row, terms))}</span>` : '') + '</a>').join('') +
        (group.matches.length > perGroup ? `<p class="search-more">Showing ${perGroup} of ${group.matches.length}. ${mode === 'All' ? 'Choose a scope or ' : ''}Add a word to narrow the search.</p>` : '') + '</section>';
    }).join('');
    if (!shown) results.innerHTML = loading ? '<div class="search-empty"><strong>Searching the archive…</strong><p>Loading the relevant index.</p></div>' :
      `<div class="search-empty"><strong>No matches for “${esc(input.value.trim())}”</strong><p>Try fewer words or another scope. Rules search titles; lore searches the campaign index.</p></div>`;
    const pending = [];
    if (loading) {
      if (status.rules === 'loading' && (mode === 'All' || mode === 'Rules')) pending.push('loading rules');
      if (status.places === 'loading' && (mode === 'All' || mode === 'Places')) pending.push('loading places');
    }
    statusLine.textContent = `${count.toLocaleString()} ${count === 1 ? 'match' : 'matches'}` +
      (shown < count ? ` · showing ${shown}` : '') + (pending.length ? ' · ' + pending.join(', ') : '');
    if (mode === 'Rules' && state.vaultLoaded && !state.vault.length) statusLine.textContent = 'Rules are not included in this build';
    results.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  function refresh() {
    const generation = ++epoch, query = input.value.trim(), mode = scope.value;
    const wantsRules = query && (mode === 'Rules' || (mode === 'All' && query.length >= 2));
    const wantsPlaces = query && (mode === 'All' || mode === 'Places');
    const jobs = [];
    if (wantsRules && !state.vaultLoaded && status.rules !== 'error') {
      status.rules = 'loading';
      jobs.push(ensureVault().then(() => { status.rules = 'ready'; }, () => { status.rules = 'error'; }));
    }
    if (wantsPlaces && !placeRows && status.places !== 'error') {
      status.places = 'loading';
      jobs.push(ensurePlaces().then(() => { status.places = 'ready'; }, () => { status.places = 'error'; }));
    }
    render();
    for (const job of jobs) job.then(() => { if (generation === epoch && !modal.hidden) render(); });
  }

  function open(options = {}) {
    if (modal.hidden) {
      opener = document.activeElement;
      inertStates = [...document.querySelectorAll('.topbar, .layout, #graphView')].map(element => [element, element.inert]);
      for (const [element] of inertStates) element.inert = true;
    }
    modal.hidden = false;
    if (typeof options.query === 'string') input.value = options.query;
    if (['All', 'Lore', 'Places', 'Rules'].includes(options.scope)) scope.value = options.scope;
    input.focus(); input.select();
    refresh();
  }

  function close() {
    if (modal.hidden) return;
    ++epoch; clearTimeout(timer);
    modal.hidden = true;
    for (const [element, previous] of inertStates) element.inert = previous;
    inertStates = [];
    if (opener?.isConnected) opener.focus({preventScroll:true});
  }

  document.getElementById('searchBtn').addEventListener('click', () => open());
  header.querySelector('button').onclick = close;
  clear.onclick = () => { input.value = ''; input.focus(); refresh(); };
  input.addEventListener('input', () => {
    ++epoch; clearTimeout(timer);
    timer = setTimeout(refresh, 65);
  });
  scope.onchange = () => { clearTimeout(timer); refresh(); };
  errors.onclick = event => {
    const kind = event.target.closest('[data-retry]')?.dataset.retry;
    if (kind) { status[kind] = ''; refresh(); }
  };
  results.addEventListener('focusin', event => {
    const link = event.target.closest('a.search-result');
    if (link) selectResult([...results.querySelectorAll('a.search-result')].indexOf(link));
  });
  results.addEventListener('click', event => {
    const suggestion = event.target.closest('[data-query]');
    if (suggestion) { input.value = suggestion.dataset.query; input.focus(); refresh(); }
    if (event.target.closest('a[href]')) close();
  });
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (event.target === input || event.target.closest('a.search-result'))) {
      event.preventDefault();
      const links = results.querySelectorAll('a.search-result');
      const next = active < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1) : active + (event.key === 'ArrowDown' ? 1 : -1);
      selectResult(next, true);
    }
    if (event.key === 'Enter' && event.target === input) {
      // A quick Enter after typing must use this query, not the previous
      // query's results while its short debounce is still pending.
      clearTimeout(timer); refresh();
      const links = results.querySelectorAll('a.search-result');
      if (links.length) { event.preventDefault(); links[Math.max(0, active)].click(); }
    }
    if (event.key === 'Tab') {
      const focusable = [...box.querySelectorAll('button,input,select,a[href]')].filter(element => !element.disabled && element.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  // Leaving by a deep link must also restore the background, including Back.
  addEventListener('hashchange', close);
  window.SaerothSearch = Object.freeze({open, close, refresh});
})();
