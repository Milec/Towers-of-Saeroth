/* Complete, editable session snapshots. Current preparation continues to save separately. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const pageSize = 8;
  let config, base, model, store, library, ready, host, generation = 0, configuration = 0;
  let busy = false, available = false, error = '', query = '', archived = false, visible = pageSize;
  let pendingImport = null, importRevision = 0, form = null, urls = [], refreshPending = false;
  let nextFocus = '';
  let rawRecovery = null;

  function configure(options) {
    unmount();
    config = options;
    base = new URL(options.base || './', location.href);
    const ticket = ++configuration;
    store?.close(); store = null; model = null; library = null; available = false; error = ''; rawRecovery = null; refreshPending = false;
    ready = (async () => {
      const [loadedModel, storage] = await Promise.all([
        options.getModel(), import(new URL('session-library-store.mjs', base).href)
      ]);
      if (ticket !== configuration) return;
      model = loadedModel;
      const openedStore = storage.createSessionStore({name:'saeroth-session-library-v1:' + base.pathname, model});
      store = openedStore;
      try {
        const stored = await openedStore.read();
        if (ticket !== configuration) return;
        library = stored;
        if (!library.records.length) {
          const current = await options.capture();
          if (ticket !== configuration) return;
          const initial = model.saveRecord(library, current, {id:uid(), now:now()});
          try { await openedStore.write(initial.library, {expectedRevision:library.revision}); if (ticket !== configuration) return; library = initial.library; }
          catch (failure) {
            if (failure.code !== 'CONFLICT') throw failure;
            // Another tab may have initialized the library first. Neither working copy is replaced.
            const currentLibrary = await openedStore.read();
            if (ticket !== configuration) return;
            library = currentLibrary;
          }
        }
        available = true;
      } catch (failure) {
        try { const raw = await openedStore.readRaw(); if (ticket === configuration) rawRecovery = raw; } catch (_) { /* Existing data is never cleared to recover. */ }
        throw failure;
      }
    })().catch(failure => {
      if (ticket !== configuration) return;
      available = false;
      error = failure.code === 'UNREADABLE'
        ? 'The saved-session library could not be read. Its original data is kept. Download a recovery copy before making repairs.'
        : 'Saved sessions are unavailable in this browser. Your current preparation is unchanged; download it below to keep a portable copy.';
    }).finally(() => { if (ticket === configuration) render(); });
  }

  function unmount() {
    generation++; host = null; pendingImport = null; form = null; importRevision++; nextFocus = '';
    for (const url of urls) URL.revokeObjectURL(url);
    urls = [];
  }

  function mount(element) {
    unmount();
    if (!element || !config) return;
    host = element;
    host.className = 'session-library';
    host.setAttribute('aria-label', 'Saved sessions');
    host.innerHTML = '<p class="sl-intro">Working prep autosaves in this browser. Saved versions keep a separate copy of your notes, NPCs, and encounter.</p>' +
      '<fieldset id="slControls" disabled><legend class="sl-sr">Saved session controls</legend>' +
      '<div class="sl-actions sl-main-actions"><button type="button" class="ws-button ws-primary" id="slSave">Save current prep</button><button type="button" class="ws-button" id="slNew">New session</button><span id="slCount" class="ws-label"></span></div>' +
      '<div id="slForm" class="sl-form" hidden></div><div id="slImportPreview" class="sl-import-preview" hidden></div>' +
      '<details id="slShelf"><summary>Browse saved sessions <span id="slShelfCount"></span></summary><div class="sl-browser">' +
      '<div class="sl-filters"><label class="ws-field" for="slSearch">Find a saved session<input type="search" id="slSearch" autocomplete="off" placeholder="Session name…"></label><label class="sl-check" for="slArchived"><input type="checkbox" id="slArchived"> Show archived</label></div>' +
      '<p id="slResults" class="ws-small ws-muted" role="status"></p><div id="slList"></div><button type="button" class="ws-button sl-more" id="slMore" hidden>Show more sessions</button></div></details></fieldset>' +
      '<details id="slTransfer"><summary>Backups &amp; transfer</summary><div class="sl-portability"><p class="ws-small ws-muted">Move editable prep to another browser or device. Artwork stays linked; saved versions stay as saved. Use the Foundry package for play.</p><div class="sl-actions"><button type="button" class="ws-button" id="slCurrentBackup">Download current prep</button><button type="button" class="ws-button" id="slImport" disabled>Import editable backup</button><input type="file" id="slImportFile" accept="application/json,.json" hidden></div></div></details>' +
      '<p id="slStatus" class="sl-status" role="status" aria-live="polite">Loading saved sessions…</p><p id="slLibraryError" class="sl-status sl-error" hidden></p><p id="slSwitchError" class="sl-status sl-error" hidden></p><div id="slRecoveryActions" class="sl-actions sl-recovery" hidden><button type="button" class="ws-button" id="slRetry" hidden>Retry saved sessions</button><button type="button" class="ws-button" id="slRecovery" hidden>Download library recovery</button><button type="button" class="ws-button" id="slSwitchRecovery" hidden>Download interrupted-switch recovery</button></div><div id="slDownloads" class="sl-downloads"></div>';
    host.querySelector('#slSave').onclick = () => perform(saveCurrent);
    host.querySelector('#slNew').onclick = () => showForm('new');
    host.querySelector('#slImport').onclick = () => host.querySelector('#slImportFile').click();
    host.querySelector('#slImportFile').onchange = readImport;
    host.querySelector('#slCurrentBackup').onclick = () => perform(exportCurrent, {requiresStore:false});
    host.querySelector('#slRetry').onclick = () => perform(retry, {requiresStore:false});
    host.querySelector('#slRecovery').onclick = () => download(rawRecovery, 'saeroth-session-library-recovery.json', 'Save library recovery');
    host.querySelector('#slSwitchRecovery').onclick = () => {
      const recovery = config.recovery?.();
      if (recovery?.raw) download(recovery.raw, 'saeroth-session-switch-recovery.json', 'Save interrupted-switch recovery', {raw:true});
    };
    host.querySelector('#slSearch').value = query;
    host.querySelector('#slSearch').oninput = event => { query = event.target.value; visible = pageSize; renderList(); };
    host.querySelector('#slArchived').checked = archived;
    host.querySelector('#slArchived').onchange = event => { archived = event.target.checked; visible = pageSize; renderList(); };
    host.querySelector('#slMore').onclick = () => { visible += pageSize; renderList(); };
    host.querySelector('#slList').onclick = event => {
      const button = event.target.closest('button[data-sl-action]');
      if (!button || !host.querySelector('#slList').contains(button) || busy) return;
      const record = library?.records.find(item => item.id === button.dataset.id);
      if (!record) return;
      if (button.dataset.slAction === 'duplicate') showForm('duplicate', record);
      else if (button.dataset.slAction === 'open') perform(ticket => openRecord(record, ticket));
      else if (button.dataset.slAction === 'download') perform(ticket => exportRecord(record, ticket));
      else if (button.dataset.slAction === 'archive') perform(ticket => archiveRecord(record, ticket));
    };
    render();
    ready?.then(() => render());
  }

  function check(ticket) {
    if (!host || ticket !== generation) { const failure = Error('This action was cancelled when the page changed.'); failure.cancelled = true; throw failure; }
  }

  function status(message, failed = false) {
    const node = host?.querySelector('#slStatus');
    if (!node) return;
    node.textContent = message; node.classList.toggle('sl-error', failed);
  }

  function render() {
    if (!host) return;
    host.querySelector('#slControls').disabled = busy || !available;
    host.querySelector('#slImport').disabled = busy || !available;
    host.querySelector('#slCurrentBackup').disabled = busy || !model;
    host.querySelector('#slRetry').hidden = available || !error;
    host.querySelector('#slRetry').disabled = busy;
    host.querySelector('#slRecovery').hidden = rawRecovery === null || rawRecovery === undefined;
    host.querySelector('#slRecovery').disabled = busy;
    const recovery = config.recovery?.();
    const switchError = host.querySelector('#slSwitchError');
    switchError.hidden = !recovery?.message;
    switchError.textContent = recovery?.message || '';
    host.querySelector('#slSwitchRecovery').hidden = !recovery?.raw;
    host.querySelector('#slSwitchRecovery').disabled = busy;
    host.querySelector('#slRecoveryActions').hidden = !error && rawRecovery == null && !recovery?.raw;
    if (error || recovery?.message) host.querySelector('#slTransfer').open = true;
    host.querySelector('#slNew').disabled = busy || !!recovery?.message;
    host.setAttribute('aria-busy', String(busy));
    host.querySelector('#slLibraryError').hidden = !error;
    host.querySelector('#slLibraryError').textContent = error;
    if (host.querySelector('#slStatus').textContent === 'Loading saved sessions…') {
      if (error) status('Download your current preparation, or retry saved sessions.', true);
      else if (available && !busy) status('');
    }
    renderList();
  }

  function renderList() {
    if (!host) return;
    const records = library?.records || [];
    const activeCount = records.filter(record => !record.archived).length;
    host.querySelector('#slCount').textContent = records.length ? activeCount + ' ready' : '';
    host.querySelector('#slShelfCount').textContent = records.length ? '(' + records.length + ')' : '';
    const needle = query.trim().toLocaleLowerCase();
    const filtered = records.filter(record => record.archived === archived && (!needle || record.snapshot.desk.title.toLocaleLowerCase().includes(needle)))
      .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    host.querySelector('#slResults').textContent = filtered.length + (filtered.length === 1 ? ' saved version' : ' saved versions') + (archived ? ' in the archive' : ' ready to open') + '.';
    host.querySelector('#slList').innerHTML = filtered.length ? filtered.slice(0, visible).map(card).join('') : '<p class="sl-empty">' + (needle ? 'No saved sessions match that search.' : archived ? 'Nothing is archived. Archive a saved version when you no longer need it in the ready list.' : 'Save your current preparation to keep it here.') + '</p>';
    host.querySelector('#slMore').hidden = filtered.length <= visible;
    host.querySelector('#slMore').disabled = busy;
    host.querySelectorAll('#slList button').forEach(button => button.disabled = busy || (button.dataset.slAction === 'open' && !!config.recovery?.()?.message));
  }

  function summary(snapshot) {
    const opponents = snapshot.encounter?.encounter?.roster?.reduce((total,row) => total + row.count, 0) || 0;
    const completed = snapshot.desk.tasks.filter(task => task.done).length;
    return [snapshot.desk.board.length + ' reference notes', snapshot.desk.tasks.length + ' checklist items' + (completed ? ' (' + completed + ' done)' : ''), snapshot.actors.length + ' NPC sheets', opponents + ' opponents'].join(' · ');
  }

  function card(record) {
    const data = record.snapshot;
    const date = new Date(record.createdAt);
    const dateText = Number.isFinite(date.valueOf()) ? date.toLocaleString(undefined, {dateStyle:'medium',timeStyle:'medium'}) : record.createdAt;
    const notes = data.desk.notes.trim().replace(/\s+/g, ' ');
    return '<article class="sl-card" data-sl-record="' + esc(record.id) + '"><div class="sl-card-head"><h3>' + esc(data.desk.title || 'Untitled session') + '</h3>' + (record.archived ? '<span class="ws-label">Archived</span>' : '') + '</div>' +
      '<p class="sl-card-date">Saved <time datetime="' + esc(record.createdAt) + '">' + esc(dateText) + '</time></p><p class="sl-card-summary">' + esc(summary(data)) + '</p>' +
      (notes ? '<p class="sl-card-excerpt">' + esc(notes.slice(0,160)) + (notes.length > 160 ? '…' : '') + '</p>' : '') +
      '<div class="sl-actions">' +
      [['open','Open'],['duplicate','Duplicate'],['download','Download'],['archive',record.archived ? 'Restore to ready' : 'Archive']].map(([action,text]) => '<button type="button" class="ws-button" data-sl-action="' + action + '" data-id="' + esc(record.id) + '" aria-label="' + esc(text + ' ' + (data.desk.title || 'untitled session')) + '">' + text + '</button>').join('') + '</div></article>';
  }

  async function perform(action, {requiresStore = true} = {}) {
    if (busy || !host) return;
    const ticket = generation;
    const originalFocus = document.activeElement;
    busy = true; render();
    try {
      await ready; check(ticket);
      if (config.busy?.()) throw Error('Finish or cancel the session export before changing saved preparation.');
      if (requiresStore && !available) throw Error(error || 'Saved sessions are unavailable. Download your current prep instead.');
      await action(ticket);
    } catch (failure) {
      if (!failure.cancelled && ticket === generation) {
        if (failure.code === 'CONFLICT') {
          try { library = await store.read(); } catch (_) { /* Show original conflict without replacing the working prep. */ }
          status('Saved sessions changed in another tab. The list was refreshed and your working prep was kept. Try the action again.', true);
        } else status(failure.message || 'That action could not finish. Your current preparation was kept.', true);
      }
    } finally {
      busy = false;
      if (host) render();
      if (host && ticket === generation) {
        const target = nextFocus && document.querySelector(nextFocus);
        nextFocus = '';
        if (target) target.focus();
        else if (originalFocus && !originalFocus.isConnected) host.querySelector('#slShelf > summary')?.focus();
      }
      if (refreshPending) { refreshPending = false; refreshFromStorage(); }
    }
  }

  async function persistResult(result, expectedRevision, ticket) {
    check(ticket);
    if (result.library.revision !== expectedRevision) await store.write(result.library, {expectedRevision});
    check(ticket);
    library = result.library;
    return result;
  }

  async function checkpoint(snapshot, ticket) {
    const latest = await store.read(); check(ticket);
    const result = model.saveRecord(latest, snapshot, {id:uid(), now:now()});
    return persistResult(result, latest.revision, ticket);
  }

  async function saveCurrent(ticket) {
    status('Saving the complete preparation…');
    const snapshot = await config.capture(); check(ticket);
    const result = await checkpoint(snapshot, ticket); check(ticket);
    host.querySelector('#slShelf').open = true; archived = false; host.querySelector('#slArchived').checked = false; query = ''; host.querySelector('#slSearch').value = ''; visible = pageSize;
    status(result.created ? 'Saved “' + snapshot.desk.title + '” with its notes, NPCs, and encounter. Later edits stay in your working prep until you save another version.' : 'An identical saved version is already in your library. No duplicate was added.');
  }

  async function openSnapshot(snapshot, ticket, message) {
    const target = await config.validate(snapshot); check(ticket);
    const current = await config.capture(); check(ticket);
    status('Saving your current preparation before opening the other session…');
    await checkpoint(current, ticket); check(ticket);
    const latest = await config.capture(); check(ticket);
    if (!model.sameContent(current, latest)) throw Error('Your working prep changed while opening the session. It was kept; try opening again when your edits are finished.');
    await config.apply(target, {expectedCurrent:current,stillCurrent:() => !!host && ticket === generation}); check(ticket);
    closeForm(); pendingImport = null; host.querySelector('#slImportPreview').hidden = true;
    nextFocus = '#wsTitle';
    status(message + ' Your previous working prep is saved in the library.');
  }

  async function openRecord(record, ticket) {
    const latest = await store.read(); check(ticket);
    const chosen = latest.records.find(item => item.id === record.id);
    if (!chosen || chosen.revision !== record.revision) throw Object.assign(Error('Saved session changed.'), {code:'CONFLICT'});
    library = latest;
    await openSnapshot(chosen.snapshot, ticket, 'Opened “' + chosen.snapshot.desk.title + '”.');
  }

  function showForm(kind, record) {
    if (busy || !available || !host) return;
    form = {kind,record};
    const panel = host.querySelector('#slForm'); panel.hidden = false;
    const title = kind === 'duplicate' ? (record.snapshot.desk.title + ' — copy').slice(0,100) : 'Next session';
    panel.innerHTML = '<form id="slNameForm"><label class="ws-field" for="slName">' + (kind === 'duplicate' ? 'Name the copy' : 'New session title') + '<input id="slName" maxlength="100" required value="' + esc(title) + '"></label><p class="ws-small ws-muted">' + (kind === 'duplicate' ? 'The copy keeps the notes, NPCs, map recipe, and encounter. Your working prep stays unchanged until you open it.' : 'Your current working prep is saved before the new, empty session opens. Pinned references and recent entries stay on your desk.') + '</p><div class="sl-actions"><button type="submit" class="ws-button ws-primary">' + (kind === 'duplicate' ? 'Save copy' : 'Create and open') + '</button><button type="button" class="ws-button" id="slCancelForm">Cancel</button></div></form>';
    panel.querySelector('#slCancelForm').onclick = () => { closeForm(); host.querySelector(kind === 'new' ? '#slNew' : '#slShelf > summary')?.focus(); };
    panel.querySelector('#slNameForm').onsubmit = event => {
      event.preventDefault();
      const title = panel.querySelector('#slName').value.trim();
      if (!title) { panel.querySelector('#slName').setCustomValidity('Enter a session title.'); panel.querySelector('#slName').reportValidity(); return; }
      const selected = form;
      perform(async ticket => {
        if (selected.kind === 'new') {
          const snapshot = await config.empty(); snapshot.desk.title = title;
          await openSnapshot(snapshot, ticket, 'Created “' + title + '”.');
        } else {
          const latest = await store.read(); check(ticket);
          const original = latest.records.find(item => item.id === selected.record.id);
          if (!original || original.revision !== selected.record.revision) throw Object.assign(Error('Saved session changed.'), {code:'CONFLICT'});
          const result = model.duplicateRecord(latest, original.id, {newId:uid(), now:now(), title});
          await persistResult(result, latest.revision, ticket); check(ticket);
          closeForm(); archived = false; host.querySelector('#slArchived').checked = false; host.querySelector('#slShelf').open = true;
          query = ''; host.querySelector('#slSearch').value = ''; visible = pageSize; nextFocus = '#slShelf > summary';
          status('Saved “' + title + '” as a separate copy. Your working prep was kept.');
        }
      });
    };
    panel.querySelector('#slName').oninput = event => event.target.setCustomValidity('');
    panel.querySelector('#slName').focus(); panel.querySelector('#slName').select();
  }

  function closeForm() { form = null; const panel = host?.querySelector('#slForm'); if (panel) { panel.hidden = true; panel.replaceChildren(); } }

  async function archiveRecord(record, ticket) {
    const latest = await store.read(); check(ticket);
    const existing = latest.records.find(item => item.id === record.id);
    if (!existing || existing.revision !== record.revision) throw Object.assign(Error('Saved session changed.'), {code:'CONFLICT'});
    const result = model.setArchived(latest, record.id, !record.archived, {now:now()});
    await persistResult(result, latest.revision, ticket); check(ticket);
    status(record.archived ? 'Restored “' + record.snapshot.desk.title + '” to the ready list.' : 'Archived “' + record.snapshot.desk.title + '”. It is still available under Show archived.');
    nextFocus = '#slArchived';
  }

  function download(value, name, text, {raw = false} = {}) {
    if (!host) return;
    const blob = new Blob([raw ? value : JSON.stringify(value,null,2)], {type:'application/json'}), url = URL.createObjectURL(blob);
    urls.push(url);
    const link = document.createElement('a'); link.href = url; link.download = name; link.textContent = text;
    host.querySelector('#slDownloads').replaceChildren(link); link.click();
    if (busy) nextFocus = '#slDownloads a'; else link.focus();
    // Retain the latest save link for browsers that need a second tap to download.
    while (urls.length > 3) URL.revokeObjectURL(urls.shift());
  }

  function filename(title) { return 'saeroth-' + (title.toLocaleLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75) || 'session') + '-editable.json'; }

  async function exportRecord(record, ticket) {
    const normalized = await config.validate(record.snapshot); check(ticket);
    download(model.exportBackup([{...record,snapshot:normalized}], {now:now()}), filename(normalized.desk.title), 'Save editable session backup');
    status('Downloaded an editable session backup. Import it into Saved sessions on the other device.');
  }

  async function exportCurrent(ticket) {
    if (!model) throw Error('The session tools could not load. Reconnect and try again.');
    const snapshot = await config.capture(); check(ticket);
    const result = model.saveRecord(model.emptyLibrary(), snapshot, {id:uid(),now:now()});
    download(model.exportBackup([result.record], {now:now()}), filename(snapshot.desk.title), 'Save current editable preparation');
    status('Downloaded your complete editable preparation. Saved-session storage was not changed.');
  }

  async function readImport(event) {
    const file = event.target.files[0]; event.target.value = '';
    if (!file || busy || !available) return;
    const revision = ++importRevision;
    pendingImport = null; host.querySelector('#slImportPreview').hidden = true;
    await perform(async ticket => {
      if (file.size > 2 * 1024 * 1024) throw Error('Choose an editable session backup under 2 MiB.');
      let value; try { value = JSON.parse(await file.text()); } catch (_) { throw Error('This file is not valid JSON. Choose an editable Saeroth session backup.'); }
      check(ticket);
      const backup = model.normalizeBackup(value);
      for (const record of backup.records) { await config.validate(record.snapshot); check(ticket); }
      if (revision !== importRevision) return;
      pendingImport = backup;
      const panel = host.querySelector('#slImportPreview'); panel.hidden = false;
      panel.innerHTML = '<h3>Import preview</h3><p class="ws-small">' + backup.records.length + (backup.records.length === 1 ? ' saved session' : ' saved sessions') + ' will be added as separate copies. Existing sessions and your working prep stay unchanged. Archived copies remain in the archive.</p><ul>' + backup.records.slice(0,8).map(record => '<li><strong>' + esc(record.snapshot.desk.title) + (record.archived ? ' <span class="ws-label">Archived</span>' : '') + '</strong><span>' + esc(summary(record.snapshot)) + '</span></li>').join('') + (backup.records.length > 8 ? '<li>And ' + (backup.records.length - 8) + ' more saved sessions.</li>' : '') + '</ul><div class="sl-actions"><button type="button" class="ws-button ws-primary" id="slConfirmImport">Add to saved sessions</button><button type="button" class="ws-button" id="slCancelImport">Cancel</button></div>';
      panel.querySelector('#slCancelImport').onclick = () => { pendingImport = null; importRevision++; panel.hidden = true; host.querySelector(host.querySelector('#slTransfer').open ? '#slImport' : '#slTransfer > summary')?.focus(); };
      panel.querySelector('#slConfirmImport').onclick = () => perform(confirmImport);
      nextFocus = '#slConfirmImport';
      status('Backup checked. Review the sessions before adding them.');
    });
  }

  async function confirmImport(ticket) {
    if (!pendingImport) return;
    const backup = pendingImport;
    const latest = await store.read(); check(ticket);
    const result = model.importBackup(latest, backup, {idFactory:uid, now:now()});
    await persistResult(result, latest.revision, ticket); check(ticket);
    pendingImport = null; host.querySelector('#slImportPreview').hidden = true;
    host.querySelector('#slShelf').open = true; query = ''; host.querySelector('#slSearch').value = ''; visible = pageSize;
    nextFocus = '#slShelf > summary';
    const archivedCount = result.records.filter(record => record.archived).length;
    status('Added ' + result.created + (result.created === 1 ? ' saved session' : ' saved sessions') + (result.skipped ? '; ' + result.skipped + ' identical versions were already saved' : '') + '.' + (archivedCount ? ' ' + archivedCount + ' archived ' + (archivedCount === 1 ? 'version is' : 'versions are') + ' under Show archived.' : '') + ' Your working prep was kept.');
  }

  async function retry(ticket) {
    status('Reopening saved sessions…');
    if (!model || !store) throw Error('The session tools could not load. Reconnect and reload the page.');
    const next = await store.read(); check(ticket);
    library = next; available = true; error = ''; rawRecovery = null;
    status('Saved sessions are available again. Your working prep was kept.');
  }

  async function refreshFromStorage() {
    if (!store || !available) return;
    if (busy) { refreshPending = true; return; }
    const ticket = configuration, selectedStore = store;
    try { const next = await selectedStore.read(); if (ticket === configuration && selectedStore === store) { library = next; renderList(); } } catch (_) { /* Never swap in incomplete or unreadable library data. */ }
  }

  window.addEventListener('focus', refreshFromStorage);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFromStorage(); });
  document.addEventListener('saeroth-session-conflict', render);
  window.SaerothSessionLibrary = {configure,mount,unmount};
})();
