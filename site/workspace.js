/* Personal campaign desk. Canon stays in Markdown; browser drafts are portable. */
(() => {
  'use strict';
  const VERSION = 1;
  const JOURNAL_CORE_VERSION = '14.364'; // Saeroth module's minimum; the native journal page schema is v13+.
  const LIMITS = { pins: 100, recent: 12, board: 60, tasks: 100, notes: 40000 };
  const icons = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    book: '<path d="M4 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM14 7a3 3 0 0 1 3-3h3v15h-3a4 4 0 0 0-3 2"/>',
    pin: '<path d="m9 3 6 0-1 5 4 4v2h-5v7l-2-3v-4H6v-2l4-4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.book}</svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cleanPath = p => typeof p === 'string' && p.length < 500 && /^(campaign|vault)\/[^?#\x00-\x1f]+\.md$/i.test(p) && !p.split('/').some(x => x === '..' || x === '.') && !p.includes('\\');
  const noteName = p => p.split('/').at(-1).replace(/\.md$/i, '');
  const href = p => '#/' + p.split('/').map(encodeURIComponent).join('/');
  const empty = () => ({ version: VERSION, pins: [], recent: [], board: [], tasks: [], title: 'Next session', notes: '', libraryView: 'cards', updatedAt: '' });
  let config = {}, notes = [], byPath = new Map(), saved = empty(), key = '', host = null, view = '', generation = 0;
  let storageWarning = '', recoveryRaw = '', recoverySaved = false, lastUndo = null, libraryQuery = '', libraryType = 'all', libraryLimit = 24;
  const sessionMeta = new Map();
  const title = p => byPath.get(p)?.title || noteName(p);
  const typeName = t => ({ pc: 'Player character', npc: 'NPC', creature: 'Creature', backstory: 'Backstory', ancestry: 'Ancestry', deity: 'Deity', nation: 'Nation', faction: 'Faction', history: 'History', index: 'Index', reference: 'Reference', session: 'Session', location: 'Location', item: 'Item' }[t] || 'Note');
  const pathType = p => p.startsWith('vault/') ? 'PF2e rules' : typeName(byPath.get(p)?.t);
  const uid = () => globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2);

  function validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== VERSION) throw Error('This is not a supported Saeroth desk backup.');
    const result = empty();
    for (const field of ['pins', 'recent', 'board']) {
      if (!Array.isArray(value[field]) || value[field].length > LIMITS[field] || value[field].some(p => !cleanPath(p))) throw Error(`The backup has an invalid ${field} list.`);
      result[field] = [...new Set(value[field])];
    }
    if (!Array.isArray(value.tasks) || value.tasks.length > LIMITS.tasks) throw Error('The backup has too many tasks.');
    const ids = new Set();
    result.tasks = value.tasks.map(task => {
      if (!task || typeof task.id !== 'string' || !/^[\w-]{1,80}$/.test(task.id) || ids.has(task.id) || typeof task.text !== 'string' || !task.text.trim() || task.text.length > 240 || typeof task.done !== 'boolean') throw Error('The backup has an invalid task.');
      ids.add(task.id); return { id: task.id, text: task.text, done: task.done };
    });
    if (typeof value.title !== 'string' || value.title.length > 100 || typeof value.notes !== 'string' || value.notes.length > LIMITS.notes) throw Error('The backup has invalid session notes.');
    result.title = value.title; result.notes = value.notes;
    result.libraryView = value.libraryView === 'list' ? 'list' : 'cards';
    result.updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt.slice(0, 40) : '';
    return result;
  }

  function configure(options) {
    config = options; notes = options.notes || []; byPath = new Map(notes.map(n => [n.p, n]));
    key = 'saeroth-workspace-v1:' + new URL(options.base || './', location.href).pathname;
    let raw = '';
    try {
      recoveryRaw = localStorage.getItem(key + ':recovery') || ''; recoverySaved = !!recoveryRaw;
      raw = localStorage.getItem(key) || ''; if (raw) saved = validate(JSON.parse(raw));
    } catch (_) {
      storageWarning = 'Saved desk data could not be read. Download the recovery file below to keep the original.';
      if (raw) {
        recoveryRaw = raw;
        try { localStorage.setItem(key + ':recovery', raw); recoverySaved = true; }
        catch (_) { recoverySaved = false; }
      } else storageWarning = 'Browser storage is unavailable. Download backups to keep this desk.';
    }
    window.SaerothSessionExport?.configure({ base: options.base || './', snapshot: () => structuredClone(saved), buildJournal, addPrepared,
      noteTitle: title, notify: announce });
  }

  function persist(message = '') {
    saved.updatedAt = new Date().toISOString();
    try {
      if (recoveryRaw && !recoverySaved) throw Error('Preserve the unreadable original before saving over it.');
      localStorage.setItem(key, JSON.stringify(saved)); storageWarning = '';
    }
    catch (_) { storageWarning = 'This browser could not save your changes. Download a backup before leaving.'; }
    updateSaveStatus();
    document.dispatchEvent(new CustomEvent('saeroth-workspace-change'));
    if (message) announce(storageWarning || message);
  }

  function updateSaveStatus() {
    const label = host?.querySelector('#wsSaveStatus');
    if (label) { label.textContent = storageWarning || 'Saved in this browser'; label.classList.toggle('ws-error', !!storageWarning); }
  }

  function announce(message, undo) {
    let toast = document.getElementById('wsToast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'wsToast'; toast.className = 'ws-toast'; toast.setAttribute('role', 'status'); document.body.append(toast); }
    toast.replaceChildren(document.createTextNode(message));
    if (undo) {
      lastUndo = undo;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Undo';
      button.onclick = () => { const action = lastUndo; lastUndo = null; if (action) action(); toast.remove(); };
      toast.append(button);
    } else lastUndo = null;
    const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Dismiss notification'); close.innerHTML = icon('close'); close.onclick = () => toast.remove(); toast.append(close);
  }

  function togglePin(path) {
    if (!cleanPath(path)) return;
    const index = saved.pins.indexOf(path);
    if (index >= 0) saved.pins.splice(index, 1);
    else if (saved.pins.length < LIMITS.pins) saved.pins.push(path);
    else { announce(`Your desk can hold ${LIMITS.pins} pinned notes. Remove a pin first.`); return; }
    persist(index < 0 ? 'Pinned to your campaign desk.' : 'Pin removed.'); refreshLists(); refreshNoteActions();
  }

  function addBoard(path) {
    if (!cleanPath(path)) return;
    if (saved.board.includes(path)) { announce('That note is already in your session packet.'); return; }
    if (saved.board.length >= LIMITS.board) { announce(`A session packet can hold up to ${LIMITS.board} notes.`); return; }
    saved.board.push(path); persist('Added to your session packet.'); refreshLists(); refreshNoteActions();
  }

  function visit(path) {
    if (!cleanPath(path)) return;
    saved.recent = [path, ...saved.recent.filter(p => p !== path)].slice(0, LIMITS.recent);
    persist();
  }

  function decorateNote(el, path) {
    if (!cleanPath(path)) return;
    el.querySelector('.ws-note-actions')?.remove();
    const toolbar = document.createElement('nav'); toolbar.className = 'ws-note-actions'; toolbar.setAttribute('aria-label', 'Save this note'); toolbar.dataset.path = path;
    toolbar.innerHTML = `<button type="button" data-ws-action="pin">${icon('pin')}<span></span></button><button type="button" data-ws-action="board">${icon('plus')}<span></span></button><a href="#/workspace">Campaign desk ${icon('arrow')}</a>`;
    toolbar.onclick = event => { const button = event.target.closest('button'); if (button?.dataset.wsAction === 'pin') togglePin(path); else if (button) addBoard(path); };
    const heading = el.querySelector('h1'); if (heading) heading.after(toolbar); else el.prepend(toolbar);
    refreshNoteActions();
  }

  function refreshNoteActions() {
    document.querySelectorAll('.ws-note-actions').forEach(bar => {
      const p = bar.dataset.path, pinned = saved.pins.includes(p), inBoard = saved.board.includes(p);
      const pin = bar.querySelector('[data-ws-action="pin"]'); pin.setAttribute('aria-pressed', String(pinned)); pin.querySelector('span').textContent = pinned ? 'Pinned' : 'Pin note';
      const board = bar.querySelector('[data-ws-action="board"]'); board.disabled = inBoard; board.querySelector('span').textContent = inBoard ? 'In session packet' : 'Add to session';
    });
    host?.querySelectorAll('[data-ws-action="pin"][data-path]').forEach(button => {
      const pinned = saved.pins.includes(button.dataset.path); button.setAttribute('aria-pressed', String(pinned)); button.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${title(button.dataset.path)}`);
    });
    host?.querySelectorAll('[data-ws-action="board"][data-path]').forEach(button => {
      const added = saved.board.includes(button.dataset.path); button.disabled = added; button.innerHTML = icon(added ? 'check' : 'plus') + (button.classList.contains('ws-add') ? (added ? 'Added' : 'Session') : '');
      button.setAttribute('aria-label', added ? `${title(button.dataset.path)} is in the session packet` : `Add ${title(button.dataset.path)} to session`);
    });
  }

  function shell(active) {
    if (document.querySelector('.primary-nav')) return '';
    return `<nav class="ws-tabs" aria-label="Campaign workspace"><a href="#/workspace" ${active === 'workspace' ? 'aria-current="page"' : ''}>${icon('book')}Campaign desk</a><a href="#/library" ${active === 'library' ? 'aria-current="page"' : ''}>Library</a><a href="#/atlas">Living Atlas ${icon('arrow')}</a></nav>`;
  }

  function mount(el, nextView = 'workspace') {
    dispose(); host = el; view = nextView; const ticket = ++generation;
    el.classList.add('workspace'); el.classList.remove('wide');
    el.innerHTML = shell(view) + (view === 'library' ? libraryHTML() : workspaceHTML());
    el.onclick = handleClick;
    if (view === 'library') bindLibrary(); else bindWorkspace();
    if (view === 'workspace') window.SaerothSessionExport?.mount(el.querySelector('#wsFoundryPackage'));
    if (view === 'workspace' && recoveryRaw) {
      const recovery = document.createElement('div'); recovery.className = 'ws-recovery';
      recovery.innerHTML = '<p class="ws-small">An earlier desk could not be read. Its original data is preserved separately for recovery.</p><button class="ws-button" type="button" data-ws-action="recovery">Download original data</button>';
      el.querySelector('.ws-backup').append(recovery);
    }
    refreshLists(); updateSaveStatus();
    document.title = (view === 'library' ? 'Campaign Library' : 'Campaign Desk') + ' — Towers of Saeroth';
    if (view === 'workspace') loadSessionMetadata(ticket);
  }

  function dispose() {
    generation++;
    window.SaerothSessionExport?.unmount();
    if (host) { host.onclick = null; host.classList.remove('workspace'); }
    host = null; view = '';
  }

  function workspaceHTML() {
    const count = notes.filter(n => n.t !== 'index').length;
    return `<header class="ws-hero"><div><p class="ws-eyebrow">Towers of Saeroth · GM workspace</p><h1>Campaign desk</h1><p class="ws-intro">Keep the world close. Gather tonight’s notes, follow the party’s journey, and take your preparation into Foundry.</p><div class="ws-hero-actions"><a class="ws-button ws-primary" href="#/library">Browse the campaign ${icon('arrow')}</a><button class="ws-button" type="button" data-ws-action="jump-board">Prepare a session</button></div><div class="ws-stats"><span><b>${count}</b> campaign entries</span><span><b>${notes.filter(n => n.t === 'session').length}</b> session records</span><span><b>${notes.filter(n => n.t === 'nation').length}</b> nations</span></div></div><a class="ws-atlas-preview" href="#/atlas"><img src="${esc((config.base || '') + 'atlas/political.webp')}" alt="" loading="eager" fetchpriority="high" decoding="async"><span>${icon('map')}Explore the Living Atlas ${icon('arrow')}</span></a></header>
      <div class="ws-columns"><div class="ws-primary-column"><section class="ws-section" aria-labelledby="wsStoryHeading"><div class="ws-section-head"><div><p class="ws-eyebrow">From the campaign record</p><h2 id="wsStoryHeading">Where we left off</h2></div><a href="#/library" data-ws-action="sessions">All sessions ${icon('arrow')}</a></div><div id="wsLatest" class="ws-latest"><p class="ws-muted">Loading session records…</p></div></section>
      <section id="wsSession" class="ws-section ws-board" aria-labelledby="wsBoardHeading"><div class="ws-section-head"><div><p class="ws-eyebrow">Your next game</p><h2 id="wsBoardHeading">Session workbench</h2></div><span class="ws-label">Personal draft</span></div><label class="ws-field" for="wsTitle">Session title<input id="wsTitle" type="text" maxlength="100" value="${esc(saved.title)}" placeholder="Name this session"></label><div class="ws-section-head ws-subhead"><h3>Reference packet <span id="wsBoardCount"></span></h3><a href="#/library">Add from library ${icon('plus')}</a></div><p class="ws-muted ws-small">Pin the notes you need in order of play. Each becomes a page in your Foundry journal.</p><div id="wsBoardList"></div><div class="ws-section-head ws-subhead"><h3>Preparation checklist</h3><span id="wsTaskCount" class="ws-muted ws-small"></span></div><ul id="wsTasks" class="ws-tasks"></ul><form id="wsTaskForm" class="ws-task-form"><label class="ws-sr-only" for="wsTaskInput">New preparation task</label><input id="wsTaskInput" maxlength="240" placeholder="Add a task for the next game" required><button type="submit" class="ws-button">${icon('plus')}Add task</button></form><label class="ws-field ws-notes-field" for="wsNotes">GM scratchpad<textarea id="wsNotes" rows="7" maxlength="${LIMITS.notes}" placeholder="Open questions, scene beats, reminders, or things the players surprised you with…">${esc(saved.notes)}</textarea></label><p class="ws-muted ws-small">Personal draft, saved on this device. These notes do not change campaign canon or the player site.</p><div class="ws-export"><div id="wsFoundryPackage"></div><div class="ws-journal-only"><p class="ws-small ws-muted">Only need your notes?</p><button class="ws-button" data-ws-action="foundry" type="button">${icon('download')}Export Foundry journal</button><details class="ws-help"><summary>How to use it in Foundry</summary><p>Create a <strong>new, unshared Journal Entry</strong> in Foundry 14, then use its <strong>Import Data</strong> action to load the downloaded JSON. It includes your scratchpad, tasks, and full selected notes. Foundry keeps the permissions of the destination journal when importing, so set player ownership to <strong>None</strong> before importing GM notes.</p><p>Campaign links and images point back to this website and need network access inside Foundry. Existing world content is unchanged until you import the file.</p></details></div></div></section></div>
      <aside class="ws-secondary-column" aria-label="Campaign shortcuts"><section class="ws-section"><div class="ws-section-head"><h2>${icon('pin')}Pinned notes</h2><span id="wsPinCount" class="ws-count"></span></div><div id="wsPins"></div></section><section class="ws-section"><div class="ws-section-head"><h2>${icon('clock')}Recently opened</h2></div><div id="wsRecent"></div></section><section class="ws-section"><p class="ws-eyebrow">Around the table</p><h2>The party</h2><div class="ws-party">${notes.filter(n => n.t === 'pc' && n.status !== 'inactive').map(n => `<a href="${href(n.p)}"><span class="ws-monogram" aria-hidden="true">${esc(title(n.p).slice(0, 1))}</span><span>${esc(title(n.p))}<small>${esc(n.summary?.slice(0, 85) || 'Character notes & backstory')}</small></span>${icon('arrow')}</a>`).join('')}</div></section><section class="ws-section"><h2>Prepared notes</h2><p class="ws-muted ws-small">Earlier preparation may contain scenes that were played differently. The session records remain authoritative.</p><div id="wsPrep"></div></section><section class="ws-section ws-backup"><h2>Take your desk with you</h2><p class="ws-muted ws-small">Back up your pins, reference notes, checklist, and scratchpad. NPC selections and the map are separate: use Download session package to take them into Foundry.</p><p id="wsSaveStatus" class="ws-save" role="status">Saved in this browser</p><div class="ws-backup-actions"><button class="ws-button" type="button" data-ws-action="backup">${icon('download')}Download backup</button><button class="ws-button" type="button" data-ws-action="import">Import backup</button><input id="wsImportFile" type="file" accept="application/json,.json" hidden></div><p id="wsImportStatus" class="ws-small" role="status"></p></section></aside></div>`;
  }

  const categories = [ ['all', 'All entries'], ['people', 'People'], ['places', 'Places & nations'], ['sessions', 'Sessions'], ['factions', 'Factions'], ['lore', 'Lore & history'], ['pinned', 'Pinned'] ];
  function inCategory(n, category) {
    if (category === 'all') return true;
    if (category === 'pinned') return saved.pins.includes(n.p);
    if (category === 'people') return ['npc', 'pc', 'creature', 'backstory'].includes(n.t);
    if (category === 'places') return ['nation', 'location'].includes(n.t);
    if (category === 'sessions') return n.t === 'session';
    if (category === 'factions') return n.t === 'faction';
    return ['history', 'deity', 'ancestry', 'reference', 'item'].includes(n.t);
  }
  function libraryHTML() {
    return `<header class="ws-library-head"><p class="ws-eyebrow">The world, connected</p><h1>Campaign library</h1><p class="ws-intro">Find a person, place, or thread of the story. Open their lore or gather it into your next session.</p></header><div class="ws-library-tools"><label class="ws-field ws-library-search" for="wsLibrarySearch">Search the campaign<input id="wsLibrarySearch" type="search" value="${esc(libraryQuery)}" placeholder="Name, place, or keyword…" autocomplete="off"></label><label class="ws-field" for="wsLibrarySort">Sort by<select id="wsLibrarySort"><option value="name">Name A–Z</option><option value="type">Entry type</option></select></label><div class="ws-view-options" role="group" aria-label="Library layout"><button type="button" data-ws-action="cards" aria-pressed="${saved.libraryView === 'cards'}">Cards</button><button type="button" data-ws-action="list" aria-pressed="${saved.libraryView === 'list'}">List</button></div></div><div class="ws-categories" role="group" aria-label="Filter campaign entries">${categories.map(([id, label]) => `<button type="button" data-ws-action="category" data-category="${id}" aria-pressed="${id === libraryType}">${label}<span>${notes.filter(n => inCategory(n, id)).length}</span></button>`).join('')}</div><p id="wsLibraryCount" class="ws-muted ws-small" role="status"></p><div id="wsLibraryResults"></div><button type="button" class="ws-button ws-load-more" data-ws-action="more" hidden>Show more entries</button><p class="ws-library-footer">Looking for PF2e rules? <button type="button" class="ws-text-button" data-ws-action="search">Open global search</button> includes the rules reference.</p>`;
  }

  function bindWorkspace() {
    host.querySelector('#wsTitle').oninput = event => { saved.title = event.target.value; persist(); };
    host.querySelector('#wsNotes').oninput = event => { saved.notes = event.target.value; persist(); };
    host.querySelector('#wsTaskForm').onsubmit = event => {
      event.preventDefault(); const input = host.querySelector('#wsTaskInput'), text = input.value.trim(); if (!text) return;
      if (saved.tasks.length >= LIMITS.tasks) { announce(`The checklist holds up to ${LIMITS.tasks} tasks.`); return; }
      saved.tasks.push({ id: uid(), text, done: false }); input.value = ''; persist('Task added.'); renderTasks(); input.focus();
    };
    host.querySelector('#wsImportFile').onchange = importBackup;
  }

  function bindLibrary() {
    host.querySelector('#wsLibrarySearch').oninput = event => { libraryQuery = event.target.value; libraryLimit = 24; renderLibrary(); };
    host.querySelector('#wsLibrarySort').onchange = () => { libraryLimit = 24; renderLibrary(); };
  }

  function noteRow(path, actions = '') {
    const exists = byPath.has(path) || path.startsWith('vault/');
    return `<div class="ws-note-row"><a href="${href(path)}"><span class="ws-row-title">${esc(title(path))}</span><small>${exists ? esc(pathType(path)) : 'Source no longer in the campaign index'}</small></a>${actions}</div>`;
  }
  function smallAction(action, path, label, symbol) {
    return `<button type="button" class="ws-icon-button" data-ws-action="${action}" data-path="${esc(path)}" aria-label="${esc(label)}">${icon(symbol)}</button>`;
  }
  function refreshLists() {
    if (!host) return;
    if (view === 'library') { renderLibrary(); return; }
    host.querySelector('#wsPins').innerHTML = saved.pins.length ? saved.pins.map(p => noteRow(p, smallAction('pin', p, `Unpin ${title(p)}`, 'pin'))).join('') : '<p class="ws-empty">Keep your most useful notes one tap away. Use <strong>Pin note</strong> on any campaign or rules page.</p>';
    host.querySelector('#wsPinCount').textContent = saved.pins.length;
    host.querySelector('#wsRecent').innerHTML = saved.recent.length ? saved.recent.slice(0, 5).map(p => noteRow(p)).join('') : '<p class="ws-empty">The notes you open will appear here, ready to pick up again.</p>';
    renderBoard(); renderTasks(); refreshNoteActions();
  }

  function renderBoard() {
    if (!host?.querySelector('#wsBoardList')) return;
    host.querySelector('#wsBoardCount').textContent = `(${saved.board.length})`;
    host.querySelector('#wsBoardList').innerHTML = saved.board.length ? `<ol class="ws-packet">${saved.board.map((p, i) => `<li><span class="ws-packet-number">${String(i + 1).padStart(2, '0')}</span><a href="${href(p)}"><strong>${esc(title(p))}</strong><small>${esc(pathType(p))}</small></a><div class="ws-packet-actions"><button type="button" class="ws-icon-button" data-ws-action="up" data-path="${esc(p)}" aria-label="Move ${esc(title(p))} earlier" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button type="button" class="ws-icon-button" data-ws-action="down" data-path="${esc(p)}" aria-label="Move ${esc(title(p))} later" ${i === saved.board.length - 1 ? 'disabled' : ''}>${icon('down')}</button>${smallAction('remove-board', p, `Remove ${title(p)} from session`, 'close')}</div></li>`).join('')}</ol>` : '<div class="ws-packet-empty">' + icon('book') + '<div><strong>Build a packet for the table</strong><p>Add NPCs, locations, session prep, or rules from their note pages or the library.</p></div><a class="ws-button" href="#/library">Choose notes</a></div>';
  }

  function renderTasks() {
    if (!host?.querySelector('#wsTasks')) return;
    host.querySelector('#wsTaskCount').textContent = `${saved.tasks.filter(t => t.done).length} of ${saved.tasks.length} complete`;
    host.querySelector('#wsTasks').innerHTML = saved.tasks.map(t => `<li><label class="${t.done ? 'is-done' : ''}"><input type="checkbox" data-task-id="${t.id}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}</span></label><button type="button" class="ws-icon-button" data-ws-action="remove-task" data-task-id="${t.id}" aria-label="Remove task: ${esc(t.text)}">${icon('close')}</button></li>`).join('');
    host.querySelector('#wsTasks').onchange = event => {
      const input = event.target.closest('[data-task-id]'), task = saved.tasks.find(t => t.id === input?.dataset.taskId);
      if (!task) return; task.done = input.checked; input.closest('label').classList.toggle('is-done', task.done); persist();
      host.querySelector('#wsTaskCount').textContent = `${saved.tasks.filter(t => t.done).length} of ${saved.tasks.length} complete`;
    };
  }

  function renderLibrary() {
    if (!host?.querySelector('#wsLibraryResults')) return;
    const focused = document.activeElement;
    const focusPath = focused?.closest('.ws-library-card')?.dataset.notePath;
    const focusAction = focused?.dataset.wsAction;
    const query = libraryQuery.trim().toLocaleLowerCase(), words = query.split(/\s+/).filter(Boolean);
    let rows = notes.filter(n => inCategory(n, libraryType) && words.every(word => `${title(n.p)} ${n.body || n.summary || ''}`.toLocaleLowerCase().includes(word)));
    const sort = host.querySelector('#wsLibrarySort').value;
    rows.sort((a, b) => sort === 'type' ? typeName(a.t).localeCompare(typeName(b.t)) || title(a.p).localeCompare(title(b.p)) : title(a.p).localeCompare(title(b.p)));
    const shown = rows.slice(0, libraryLimit), list = host.querySelector('#wsLibraryResults');
    list.className = 'ws-library-results ws-library-' + saved.libraryView;
    list.innerHTML = shown.length ? shown.map(n => {
      const image = typeof n.image === 'string' && !/^(?:[a-z]+:|\/\/)/i.test(n.image) ? `<img src="${esc(new URL(n.image, new URL(config.base || './', location.href)).href)}" alt="" loading="lazy" decoding="async">` : `<span class="ws-card-glyph" aria-hidden="true">${icon(['nation', 'location'].includes(n.t) ? 'map' : 'book')}</span>`;
      const summary = n.summary || `${typeName(n.t)} in the Towers of Saeroth campaign.`;
      return `<article class="ws-library-card ${n.image ? '' : 'ws-no-art'}" data-note-path="${esc(n.p)}"><a class="ws-card-art" href="${href(n.p)}" tabindex="-1" aria-hidden="true">${image}</a><div class="ws-card-body"><span class="ws-eyebrow">${esc(typeName(n.t))}</span><h2><a href="${href(n.p)}">${esc(title(n.p))}</a></h2><p>${esc(summary)}</p><div class="ws-card-actions"><a href="${href(n.p)}">Read entry ${icon('arrow')}</a>${smallAction('pin', n.p, `Pin ${title(n.p)}`, 'pin')}<button class="ws-add" type="button" data-ws-action="board" data-path="${esc(n.p)}">${icon('plus')}Session</button></div></div></article>`;
    }).join('') : '<div class="ws-no-results"><h2>No entries found</h2><p>Try a shorter name or search all entry types.</p><button type="button" class="ws-button" data-ws-action="reset-search">Clear filters</button></div>';
    host.querySelector('#wsLibraryCount').textContent = `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}${query ? ` matching “${libraryQuery.trim()}”` : ''}${rows.length > shown.length ? ` · showing ${shown.length}` : ''}`;
    host.querySelector('[data-ws-action="more"]').hidden = shown.length >= rows.length;
    host.querySelectorAll('[data-ws-action="category"]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.category === libraryType)); button.querySelector('span').textContent = notes.filter(n => inCategory(n, button.dataset.category)).length; });
    host.querySelectorAll('.ws-view-options button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.wsAction === saved.libraryView)));
    refreshNoteActions();
    if (focusPath) {
      const card = list.querySelector(`[data-note-path="${CSS.escape(focusPath)}"]`);
      const target = focusAction ? card?.querySelector(`[data-ws-action="${focusAction}"]:not(:disabled)`) : null;
      (target || card?.querySelector('h2 a') || host.querySelector('#wsLibrarySearch')).focus({ preventScroll: true });
    }
  }

  async function loadSessionMetadata(ticket) {
    const sessions = notes.filter(n => n.t === 'session');
    await Promise.all(sessions.map(async n => {
      if (sessionMeta.has(n.p)) return;
      if (typeof n.status === 'string') { sessionMeta.set(n.p, { status: n.status, audience: n.audience || '', summary: n.summary || '' }); return; }
      try {
        const raw = await config.fetchNote(n.p), fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] || '';
        const field = name => new RegExp('^' + name + ':\\s*(.*)$', 'm').exec(fm)?.[1]?.trim() || '';
        sessionMeta.set(n.p, { status: field('status'), audience: field('audience'), summary: n.summary || '' });
      } catch (_) { /* The record remains browsable even if not cached offline. */ }
    }));
    if (!host || ticket !== generation || view !== 'workspace') return;
    const num = p => Number(/session\s*0*(\d+)/i.exec(title(p))?.[1] || 0);
    sessions.sort((a, b) => num(b.p) - num(a.p) || (sessionMeta.get(b.p)?.audience === 'players') - (sessionMeta.get(a.p)?.audience === 'players') || title(a.p).localeCompare(title(b.p)));
    const played = sessions.filter(n => sessionMeta.get(n.p)?.status.startsWith('played'));
    const latest = played[0];
    host.querySelector('#wsLatest').innerHTML = latest ? `<span class="ws-label">Latest played session</span><h3><a href="${href(latest.p)}">${esc(title(latest.p))}</a></h3>${latest.summary ? `<p>${esc(latest.summary)}</p>` : '<p>Open the session record for what happened at the table.</p>'}<a class="ws-read" href="${href(latest.p)}">Read the recap ${icon('arrow')}</a>` : '<p class="ws-muted">Open the session archive to revisit the campaign.</p><a href="#/library" data-ws-action="sessions">Browse sessions</a>';
    const prep = sessions.filter(n => sessionMeta.get(n.p)?.status.startsWith('prep'));
    host.querySelector('#wsPrep').innerHTML = prep.length ? prep.map(n => noteRow(n.p, smallAction('board', n.p, `Add ${title(n.p)} to session`, 'plus'))).join('') : '<p class="ws-empty">Find and collect preparation notes from the library.</p>';
    refreshNoteActions();
  }

  function handleClick(event) {
    const button = event.target.closest('[data-ws-action]'); if (!button || button.disabled) return;
    const action = button.dataset.wsAction, path = button.dataset.path;
    if (action === 'pin') togglePin(path);
    else if (action === 'board') addBoard(path);
    else if (action === 'jump-board') { host.querySelector('#wsSession').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); host.querySelector('#wsTitle').focus({ preventScroll: true }); }
    else if (action === 'sessions') libraryType = 'sessions';
    else if (action === 'cards' || action === 'list') { saved.libraryView = action; persist(); renderLibrary(); }
    else if (action === 'category') { libraryType = button.dataset.category; libraryLimit = 24; renderLibrary(); }
    else if (action === 'more') { libraryLimit += 24; renderLibrary(); }
    else if (action === 'reset-search') { libraryQuery = ''; libraryType = 'all'; host.querySelector('#wsLibrarySearch').value = ''; renderLibrary(); host.querySelector('#wsLibrarySearch').focus(); }
    else if (action === 'search') document.getElementById('searchBtn')?.click();
    else if (action === 'remove-board') {
      const index = saved.board.indexOf(path); if (index < 0) return; saved.board.splice(index, 1); persist(); renderBoard();
      announce('Removed from the session packet.', () => { if (!saved.board.includes(path)) saved.board.splice(Math.min(index, saved.board.length), 0, path); persist('Note restored.'); refreshLists(); });
    } else if (action === 'up' || action === 'down') {
      const index = saved.board.indexOf(path), target = index + (action === 'up' ? -1 : 1);
      if (index < 0 || target < 0 || target >= saved.board.length) return;
      [saved.board[index], saved.board[target]] = [saved.board[target], saved.board[index]]; persist(); renderBoard();
      host.querySelector(`[data-ws-action="${action}"][data-path="${CSS.escape(path)}"]:not(:disabled)`)?.focus();
    } else if (action === 'remove-task') {
      const index = saved.tasks.findIndex(t => t.id === button.dataset.taskId), task = saved.tasks[index]; if (!task) return;
      saved.tasks.splice(index, 1); persist(); renderTasks(); announce('Task removed.', () => { if (!saved.tasks.some(t => t.id === task.id)) saved.tasks.splice(Math.min(index, saved.tasks.length), 0, task); persist('Task restored.'); renderTasks(); });
    } else if (action === 'backup') { download('saeroth-desk-backup.json', JSON.stringify(saved, null, 2), 'application/json'); announce('Desk backup downloaded.'); }
    else if (action === 'import') host.querySelector('#wsImportFile').click();
    else if (action === 'recovery') { download('saeroth-desk-recovery.txt', recoveryRaw, 'text/plain'); announce('Original desk data downloaded.'); }
    else if (action === 'foundry') exportFoundry(button);
  }

  function addPrepared(input) {
    if (!input || !Array.isArray(input.notes) || input.notes.some(p => !cleanPath(p) || !p.startsWith('campaign/') || !byPath.has(p))) throw Error('This preparation contains a note that is not in the campaign.');
    const next = [...new Set([...saved.board, ...input.notes])];
    if (next.length > LIMITS.board) throw Error(`Your reference packet can hold ${LIMITS.board} notes. Remove a note before adding this preparation.`);
    const added = next.length - saved.board.length;
    saved.board = next;
    if ((!saved.title.trim() || saved.title === 'Next session') && typeof input.name === 'string') saved.title = input.name.slice(0, 100);
    persist(); refreshLists();
    if (host?.querySelector('#wsTitle')) host.querySelector('#wsTitle').value = saved.title;
    return added;
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function importBackup(event) {
    const file = event.target.files?.[0], status = host?.querySelector('#wsImportStatus'); if (!file || !status) return;
    try {
      if (file.size > 1000000) throw Error('This file is too large for a desk backup.');
      const imported = validate(JSON.parse(await file.text()));
      // Merge rather than overwrite, so importing a phone backup cannot erase PC work.
      const merged = { ...saved, pins: [...new Set([...saved.pins, ...imported.pins])], board: [...new Set([...saved.board, ...imported.board])], recent: [...new Set([...saved.recent, ...imported.recent])].slice(0, LIMITS.recent) };
      if (merged.pins.length > LIMITS.pins || merged.board.length > LIMITS.board) throw Error('The combined backup exceeds the pin or session-packet limit. Remove some entries before importing.');
      const tasks = new Set(saved.tasks.map(t => t.text)); merged.tasks = [...saved.tasks, ...imported.tasks.filter(t => !tasks.has(t.text)).map(t => ({ ...t, id: uid() }))];
      if (merged.tasks.length > LIMITS.tasks) throw Error('The combined backup has too many tasks.');
      if (imported.notes && imported.notes !== saved.notes) merged.notes = saved.notes ? `${saved.notes}\n\n— Imported desk notes —\n${imported.notes}` : imported.notes;
      if (merged.notes.length > LIMITS.notes) throw Error('The combined scratchpad is too long. Download this desk first and shorten its notes.');
      if (!saved.title || saved.title === 'Next session') merged.title = imported.title;
      saved = merged; persist();
      if (host?.querySelector('#wsTitle')) { host.querySelector('#wsTitle').value = saved.title; host.querySelector('#wsNotes').value = saved.notes; refreshLists(); }
      status.textContent = 'Backup merged. Existing notes and tasks were kept.'; status.classList.remove('ws-error');
    } catch (error) { status.textContent = error instanceof SyntaxError ? 'This file is not valid JSON. Choose a Saeroth desk backup.' : error.message; status.classList.add('ws-error'); }
    event.target.value = '';
  }

  function safeJournalHTML(raw, path) {
    const source = new URL(config.base || './', location.href).href + href(path);
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    // A template stays inert: inspecting journal HTML must not request images
    // before the session packer has checked their addresses.
    const template = document.createElement('template'); template.innerHTML = config.parseMarkdown(body);
    const element = template.content;
    config.resolveImages?.(element, path);
    // Keep action names when the wiki renders them as inline SVG, without
    // handing active SVG/XML or form content to Foundry's journal renderer.
    element.querySelectorAll('svg').forEach(node => node.replaceWith(document.createTextNode(node.getAttribute('aria-label') ? `[${node.getAttribute('aria-label')}]` : '')));
    element.querySelectorAll('script,style,iframe,object,embed,form,input,button,meta,link,base,math,video,audio,source').forEach(n => n.remove());
    const allowedAttributes = new Set(['class', 'id', 'title', 'alt', 'colspan', 'rowspan', 'width', 'height', 'href', 'src']);
    for (const node of element.querySelectorAll('*')) {
      for (const attr of [...node.attributes]) if (!allowedAttributes.has(attr.name)) node.removeAttribute(attr.name);
      for (const attr of ['href', 'src']) {
        const value = node.getAttribute(attr); if (!value) continue;
        if (/^(?:javascript|data|vbscript):/i.test(value.trim())) { node.removeAttribute(attr); continue; }
        if (attr === 'href' && value.startsWith('#/')) node.setAttribute(attr, new URL(config.base || './', location.href).href + value);
        else if (attr === 'href' && value.startsWith('#')) node.setAttribute(attr, source + value);
        else { try { const url = new URL(value, new URL(config.base || './', location.href)); if (['http:', 'https:'].includes(url.protocol)) node.setAttribute(attr, url.href); else node.removeAttribute(attr); } catch (_) { node.removeAttribute(attr); } }
      }
    }
    return `<p><a href="${esc(source)}">Open this note in Saeroth</a></p>` + template.innerHTML;
  }

  async function buildJournal(draft = structuredClone(saved)) {
    if (!config.fetchNote || !config.parseMarkdown) throw Error('The campaign is still loading. Try again in a moment.');
    const pages = [{ name: 'Session plan', type: 'text', sort: 100000, text: { format: 1, content: `<h1>${esc(draft.title || 'Session plan')}</h1><h2>GM scratchpad</h2>${draft.notes ? draft.notes.split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : '<p>No scratch notes recorded.</p>'}${draft.tasks.length ? '<h2>Preparation checklist</h2><ul>' + draft.tasks.map(t => `<li>${t.done ? '[Done]' : '[To do]'} ${esc(t.text)}</li>`).join('') + '</ul>' : ''}` } }];
    // Snapshot inputs and keep network concurrency bounded for long packets.
    for (let i = 0; i < draft.board.length; i += 4) {
      const batch = await Promise.all(draft.board.slice(i, i + 4).map(async (p, offset) => {
        let raw; try { raw = await config.fetchNote(p); } catch (_) { throw Error(`Could not load “${title(p)}”. Open it while online, then export again. No partial journal was downloaded.`); }
        return { name: title(p), type: 'text', sort: (i + offset + 2) * 100000, text: { format: 1, content: safeJournalHTML(raw, p) } };
      })); pages.push(...batch);
    }
    for (const page of pages) page._stats = { coreVersion: JOURNAL_CORE_VERSION };
    return { name: draft.title.trim() || 'Saeroth session packet', ownership: { default: 0 }, pages, _stats: { coreVersion: JOURNAL_CORE_VERSION } };
  }

  async function exportFoundry(button) {
    button.disabled = true; const original = button.innerHTML; button.textContent = 'Preparing journal…';
    const draft = structuredClone(saved);
    try {
      const journal = await buildJournal(draft);
      const slug = journal.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session-packet';
      download(`saeroth-${slug}-journal.json`, JSON.stringify(journal, null, 2), 'application/json');
      announce(`Downloaded ${journal.pages.length} journal pages for Foundry. Import the JSON into a new, unshared Journal Entry.`);
    } catch (error) { announce(error.message); }
    finally { button.disabled = false; button.innerHTML = original; }
  }

  window.addEventListener('storage', event => {
    if (!key || event.key !== key || !event.newValue) return;
    try {
      const next = validate(JSON.parse(event.newValue));
      // Do not replace a textarea being edited in this tab. Its next input saves it.
      const editing = host?.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
      if (editing) { announce('This desk changed in another tab. Download a backup of this tab before reloading if you want to keep both versions.'); return; }
      saved = next; refreshLists(); updateSaveStatus(); refreshNoteActions();
      if (host?.querySelector('#wsTitle')) { host.querySelector('#wsTitle').value = saved.title; host.querySelector('#wsNotes').value = saved.notes; }
    } catch (_) { /* Another tab's invalid state cannot replace this working copy. */ }
  });
  window.SaerothWorkspace = { configure, mount, dispose, visit, decorateNote };
})();
