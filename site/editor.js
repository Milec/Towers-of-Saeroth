/* In-site authoring. Drafts are local; the publisher owns checked repository writes. */
(() => {
  'use strict';
  const MAX_CONTENT = 500000;
  const TYPES = {
    npc: { label: 'NPC', folder: 'npcs', regional: true, sections: ['Overview', 'Appearance', 'Personality and motives', 'Connections', 'At the table'] },
    creature: { label: 'Creature', folder: 'world/bestiary', sections: ['Description', 'Behavior', 'Abilities', 'Statblock'] },
    location: { label: 'Location', folder: 'locations', regional: true, sections: ['Overview', 'Notable features', 'People', 'At the table'] },
    session: { label: 'Session', folder: 'sessions', sections: ['Starting position', 'Scenes', 'People and places', 'Questions to resolve', 'After the session'] },
    faction: { label: 'Faction', folder: 'factions', regional: true, sections: ['Overview', 'Goals', 'Members', 'Relationships'] },
    reference: { label: 'Lore', folder: 'world', sections: ['Overview', 'Details', 'Connections'] },
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const href = path => '#/' + path.split('/').map(encodeURIComponent).join('/');
  const noteName = path => path.split('/').at(-1).replace(/\.md$/i, '');
  const safePath = path => typeof path === 'string' && path.length <= 450 && /^campaign\/.+\.md$/.test(path) && !path.split('/').some(p => !p || p.startsWith('.') || /[. ]$/.test(p)) && !/[\\\x00-\x1f\x7f<>:"|?*#%\[\]]/.test(path);
  const newId = () => 'new-' + (crypto.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  let config = {}, prefix = '', host = null, current = null, publisher = null, generation = 0, previewTimer = null;
  let mode = 'split', viewChosen = false, storageError = '', writeFailed = false, busy = false, conflict = null, discardId = null;
  const memoryDrafts = new Map();
  const memoryRecovery = new Map();

  function configure(options) { config = options; prefix = 'saeroth-entry-draft-v1:' + new URL(options.base || './', location.href).pathname + ':'; }
  function frontmatter(source) { const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source); return match ? { raw: match[0], text: match[1], body: source.slice(match[0].length) } : null; }
  function field(source, name) {
    const text = frontmatter(source)?.text || '', match = new RegExp('^' + name + ':\\s*([^\\r\\n]*)$', 'm').exec(text);
    if (!match) return '';
    let value = match[1].trim();
    if (value.startsWith('"') && value.endsWith('"')) { try { value = JSON.parse(value); } catch (_) { value = value.slice(1, -1); } }
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replace(/''/g, "'");
    return value;
  }
  function replaceField(source, name, value) {
    const fm = frontmatter(source); if (!fm) return source;
    const line = name + ': ' + JSON.stringify(value), re = new RegExp('^' + name + ':[^\\r\\n]*', 'm');
    const text = re.test(fm.text) ? fm.text.replace(re, () => line) : fm.text + '\n' + line;
    return '---\n' + text + '\n---\n' + fm.body;
  }
  function nationOf(path) { return /^campaign\/nations\/([^/]+)\/(?:npcs|locations|factions)\//.exec(path || '')?.[1] || ''; }
  function nations() { return (config.notes || []).filter(n => n.t === 'nation').map(n => ({ name: noteName(n.p), folder: n.p.slice(0, n.p.lastIndexOf('/')) })).sort((a, b) => a.name.localeCompare(b.name)); }
  function entryPath(doc = current) {
    if (!doc) return null; if (!doc.isNew) return doc.path;
    const name = doc.name.trim(), type = TYPES[doc.type]; if (!name || !type) return null;
    const nation = type.regional && nations().find(n => n.name === doc.nation);
    return `${nation ? nation.folder + '/' + type.folder : 'campaign/' + type.folder}/${name}.md`;
  }
  function template(type, name, nation) {
    const shape = TYPES[type] || TYPES.reference;
    return '---\ntitle: ' + JSON.stringify(name || 'Untitled entry') + '\ntype: ' + type +
      (nation && shape.regional ? '\nregion: ' + JSON.stringify('[[' + nation + ']]') : '') +
      (type === 'session' ? '\nstatus: prep\naudience: gm' : '') + '\n---\n\n' +
      shape.sections.map(section => '## ' + section + '\n\n').join('\n');
  }
  function blank() {
    const doc = { version: 1, id: newId(), isNew: true, path: null, name: '', type: 'npc', nation: '', content: template('npc', '', ''), baseText: null, baseSha: null, pending: null, updatedAt: '' };
    return doc;
  }
  function validDraft(value) {
    if (!value || value.version !== 1 || typeof value.id !== 'string' || value.id.length > 650 || typeof value.isNew !== 'boolean' || (!value.isNew && !safePath(value.path)) || typeof value.content !== 'string' || value.content.length > MAX_CONTENT || (value.baseText !== null && (typeof value.baseText !== 'string' || value.baseText.length > MAX_CONTENT)) || typeof value.name !== 'string' || value.name.length > 150 || typeof value.type !== 'string' || value.type.length > 50 || typeof value.nation !== 'string' || value.nation.length > 150) throw Error('This saved draft could not be read.');
    if (value.isNew ? !/^new-[\w-]+$/.test(value.id) : value.id !== value.path) throw Error('This draft has an invalid identifier.');
    return { version: 1, id: value.id, isNew: value.isNew, path: value.path, name: value.name, type: value.type, nation: value.nation, content: value.content, baseText: value.baseText, baseSha: typeof value.baseSha === 'string' && /^[0-9a-f]{40}$/.test(value.baseSha) ? value.baseSha : null, pending: value.pending && Number.isInteger(value.pending.number) && value.pending.number > 0 ? { number: value.pending.number, url: typeof value.pending.url === 'string' && /^https:\/\/github\.com\/Milec\/Towers-of-Saeroth\/pull\/\d+$/.test(value.pending.url) ? value.pending.url : '', status: String(value.pending.status || 'pending').slice(0, 30), noteSHA: typeof value.pending.noteSHA === 'string' ? value.pending.noteSHA : null } : null, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt.slice(0, 40) : '' };
  }
  const draftKey = doc => prefix + (doc.isNew ? doc.id : encodeURIComponent(doc.path));
  function readDraft(id, isPath = false) {
    const key = prefix + (isPath ? encodeURIComponent(id) : id);
    if (memoryDrafts.has(key)) return structuredClone(memoryDrafts.get(key));
    let raw;
    try { raw = localStorage.getItem(key); return raw ? validDraft(JSON.parse(raw)) : null; }
    catch (_) {
      if (raw) { try { localStorage.setItem(prefix + 'recovery:' + (isPath ? encodeURIComponent(id) : id), raw); } catch (_) { memoryRecovery.set(key, raw); } }
      storageError = raw ? 'An unreadable draft has been kept for recovery in the draft tray.' : 'This browser cannot save drafts. Download your writing before closing.';
      return null;
    }
  }
  function saveDraft() {
    if (!current) return false;
    current.updatedAt = new Date().toISOString(); const key = draftKey(current); memoryDrafts.set(key, structuredClone(current));
    try { if (memoryRecovery.has(key)) throw Error('The original recovery data must be kept.'); localStorage.setItem(key, JSON.stringify(current)); storageError = ''; writeFailed = false; }
    catch (_) { storageError = 'Draft could not be saved on this device. Download it before leaving.'; writeFailed = true; }
    statusDraft(); return !writeFailed;
  }
  function statusDraft() {
    const status = host?.querySelector('#edDraftStatus'); if (!status) return;
    status.textContent = storageError || (current?.updatedAt ? 'Draft saved on this device' : 'Website source loaded');
    status.classList.toggle('ed-error', !!storageError);
    host.querySelector('#edWordCount').textContent = `${(frontmatter(current?.content || '')?.body || current?.content || '').trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words`;
  }
  function recoverCurrent() {
    if (!current) return;
    const original = JSON.stringify(current, null, 2);
    try { localStorage.setItem(prefix + 'recovery:' + Date.now(), original); }
    catch (_) { download((current.name || 'entry') + '-previous-draft.md', current.content); }
  }
  function allDrafts() {
    const drafts = new Map(memoryDrafts), recovery = [...memoryRecovery.keys()];
    try { for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i); if (!key?.startsWith(prefix)) continue;
      if (key.startsWith(prefix + 'recovery:')) { recovery.push(key); continue; }
      if (!drafts.has(key)) { try { drafts.set(key, validDraft(JSON.parse(localStorage.getItem(key)))); } catch (_) { recovery.push(key); } }
    } } catch (_) {}
    return { drafts: [...drafts.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), recovery };
  }

  async function mount(el, options = {}) {
    dispose(); host = el; const ticket = ++generation; conflict = null; writeFailed = false;
    if (!viewChosen) mode = matchMedia('(max-width: 650px)').matches ? 'source' : 'split';
    el.classList.add('entry-editor'); el.classList.remove('wide');
    el.innerHTML = '<p class="ed-loading" role="status">Opening the entry editor…</p>';
    const path = options.path;
    if (path && !safePath(path)) { el.innerHTML = '<h1>Cannot edit this entry</h1><p>The editor works with campaign Markdown entries. Rules references and application files are read-only here.</p><a href="#/library">Return to the library</a>'; return; }
    if (path) {
      const local = readDraft(path, true);
      if (local) current = local;
      else {
        try {
          const raw = await config.fetchNote(path); if (ticket !== generation) return;
          current = { version: 1, id: path, isNew: false, path, name: field(raw, 'title') || noteName(path), type: field(raw, 'type') || 'reference', nation: nationOf(path), content: raw, baseText: raw, baseSha: null, pending: null, updatedAt: '' };
        } catch (_) { if (ticket !== generation) return; current = { version: 1, id: path, isNew: false, path, name: noteName(path), type: 'reference', nation: nationOf(path), content: '', baseText: null, baseSha: null, pending: null, updatedAt: '' }; storageError = 'The entry is unavailable offline. Connect publishing to load the current source.'; }
      }
    } else current = options.draftId && /^new-[\w-]+$/.test(options.draftId) ? readDraft(options.draftId) || blank() : blank();
    if (ticket !== generation) return;
    if (current.isNew) history.replaceState(null, '', '#/new#' + current.id);
    render();
    if (publisher && entryPath()) { try { await loadAuthoritative(ticket); } catch (error) { if (ticket === generation) host.querySelector('#edPublishStatus').textContent = error.message || 'The latest source could not be loaded. Your draft is unchanged.'; } }
  }

  function dispose() {
    generation++; clearTimeout(previewTimer);
    if (host) { host.classList.remove('entry-editor'); host.onclick = null; }
    host = null; current = null; conflict = null;
  }
  const hasUnsavedChanges = () => !!current && writeFailed;

  function render() {
    if (!host || !current) return;
    const newEntry = current.isNew, path = entryPath(), label = newEntry ? 'Create an entry' : 'Edit entry';
    document.title = label + ' — Towers of Saeroth';
    host.innerHTML = `<header class="ed-header"><div><p class="ed-kicker">Campaign authoring</p><h1>${label}</h1><p class="ed-lead">Write here, preview the result, and publish when it is ready.</p></div><a class="ed-button" href="${path && !newEntry ? href(path) : '#/library'}">Close editor</a></header>
      <div class="ed-layout"><div class="ed-writing"><section class="ed-metadata" aria-label="Entry details">${newEntry ? `<label for="edName">Entry name<input id="edName" maxlength="100" value="${esc(current.name)}" placeholder="A person, place, or story"></label><label for="edType">Entry type<select id="edType">${Object.entries(TYPES).map(([id, row]) => `<option value="${id}" ${id === current.type ? 'selected' : ''}>${row.label}</option>`).join('')}</select></label><label id="edNationField" for="edNation">Filed under<select id="edNation"><option value="">Independent / world-wide</option>${nations().map(n => `<option value="${esc(n.name)}" ${n.name === current.nation ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select></label>` : `<div class="ed-existing"><span class="ed-kicker">Editing existing entry</span><strong>${esc(current.name)}</strong><p>Its filename stays the same, so links keep working. The complete source and its properties are preserved below.</p></div>`}<p class="ed-path" id="edPath"></p></section>
      <div class="ed-toolbar" role="toolbar" aria-label="Markdown formatting"><button type="button" data-ed="bold" aria-label="Bold selected text"><b>B</b></button><button type="button" data-ed="italic" aria-label="Italic selected text"><em>I</em></button><button type="button" data-ed="heading">Heading</button><button type="button" data-ed="list">List</button><button type="button" data-ed="quote">Quote</button><button type="button" data-ed="link">Link an entry</button><button type="button" data-ed="image">Image</button><div class="ed-view" role="group" aria-label="Editor view"><button type="button" data-ed="source" aria-pressed="${mode === 'source'}">Write</button><button type="button" data-ed="preview" aria-pressed="${mode === 'preview'}">Preview</button><button type="button" data-ed="split" aria-pressed="${mode === 'split'}">Split</button></div></div>
      <div id="edLinkPanel" class="ed-insert" hidden><label for="edLinkName">Link to a campaign entry<input id="edLinkName" list="edNoteNames" placeholder="Start typing an entry name" autocomplete="off"></label><datalist id="edNoteNames">${(config.notes || []).map(n => `<option value="${esc(noteName(n.p))}">`).join('')}</datalist><button type="button" class="ed-button" data-ed="insert-link">Insert link</button><button type="button" class="ed-button" data-ed="close-insert">Cancel</button><p class="ed-inline-status" role="status"></p></div>
      <div id="edImagePanel" class="ed-insert" hidden><label for="edImageURL">Image URL or path<input id="edImageURL" placeholder="https://… or an image beside this note"></label><label for="edImageAlt">Image description<input id="edImageAlt" placeholder="Describe the artwork" maxlength="150"></label><button type="button" class="ed-button" data-ed="insert-image">Insert image</button><button type="button" class="ed-button" data-ed="close-insert">Cancel</button><p class="ed-inline-status" role="status"></p></div>
      <div id="edPanes" class="ed-panes" data-view="${mode}"><section class="ed-source-pane" aria-label="Markdown source"><label class="ed-pane-label" for="edSource">Markdown source <span>Ctrl/Cmd + B · I · S</span></label><textarea id="edSource" maxlength="${MAX_CONTENT}" spellcheck="true" aria-describedby="edDraftStatus">${esc(current.content)}</textarea></section><section class="ed-preview-pane" aria-label="Entry preview"><div class="ed-pane-label">Live preview <span>Only this draft</span></div><div id="edPreview" class="ed-preview-content content"></div></section></div>
      <div class="ed-save-row"><p id="edDraftStatus" role="status"></p><span id="edWordCount"></span></div><div id="edValidation" class="ed-validation" aria-live="polite"></div><section id="edConflict" class="ed-conflict" hidden></section></div>
      <aside class="ed-sidebar" aria-label="Publishing and saved drafts"><section class="ed-card"><h2>Publish to the campaign</h2><p>Your draft stays on this device until you publish. Publishing sends an update for verification; the site changes after the checks and deployment finish.</p><button id="edPublish" class="ed-button ed-primary" type="button" data-ed="publish">Publish entry</button><p id="edPublishStatus" class="ed-publish-status" role="status"></p><button class="ed-button" id="edCheckStatus" type="button" data-ed="check-status" ${current.pending ? '' : 'hidden'}>Check publication status</button><details id="edConnect" class="ed-connect" ${publisher ? '' : 'open'}><summary>Publishing connection</summary><p>Connect once for this tab. The token stays in memory and is never included in drafts or downloads.</p><form id="edConnectForm"><label for="edToken">GitHub access token<input id="edToken" type="password" autocomplete="off" spellcheck="false" required></label><button type="submit" class="ed-button">Connect publishing</button></form><button class="ed-button" type="button" id="edDisconnect" data-ed="disconnect" ${publisher ? '' : 'hidden'}>Disconnect</button><p id="edConnectionStatus" role="status">${publisher ? 'Connected for this tab.' : 'Not connected. You can write and save drafts without connecting.'}</p><details class="ed-token-help"><summary>One-time setup</summary><p>Create a fine-grained token for <strong>Milec/Towers-of-Saeroth</strong> with <strong>Contents</strong> and <strong>Pull requests</strong> read and write access. Repository checks still control publication.</p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a scoped token</a></details></details></section>
      <section class="ed-card"><h2>Keep a copy</h2><button class="ed-button" type="button" data-ed="download">Download Markdown</button><p>The download contains this entry, including its properties. It never contains your publishing token.</p><button type="button" class="ed-text-button" data-ed="reset">${newEntry ? 'Reset to template' : 'Reload published source'}</button><div id="edResetConfirm" class="ed-confirm" hidden><p>Your current draft will be kept as a recovery copy.</p><button type="button" class="ed-button" data-ed="confirm-reset">${newEntry ? 'Use clean template' : 'Load published source'}</button><button type="button" class="ed-button" data-ed="cancel-reset">Keep writing</button></div></section>
      <section class="ed-card"><div class="ed-card-head"><h2>Saved drafts</h2><a href="#/new">New entry</a></div><p>Drafts are private to this browser. Resume one here, or download it to move devices.</p><div id="edDraftTray"></div></section><section class="ed-card ed-guide"><h2>Writing reference</h2><p><code>## Heading</code> creates a section.<br><code>**bold**</code> adds emphasis.<br><code>[[Entry name]]</code> links campaign lore.</p><p>Use the Image button for an existing asset or image URL. Add a complete <code>pf2e-stats</code> block when an NPC or creature should become a playable Foundry actor.</p><p>The separate player website is curated independently; publishing here does not copy GM notes into it.</p></section></aside></div>`;
    host.onclick = handleClick;
    selection = [current.content.length, current.content.length];
    host.querySelector('#edSource').oninput = () => { current.content = host.querySelector('#edSource').value; if (current.isNew) { const name = field(current.content, 'title'); if (name && name !== 'Untitled entry') { current.name = name; host.querySelector('#edName').value = name; } } changed(); };
    host.querySelector('#edSource').onkeydown = event => { if (!(event.ctrlKey || event.metaKey)) return; const key = event.key.toLowerCase(); if (['b', 'i', 's'].includes(key)) { event.preventDefault(); if (key === 's') { saveDraft(); renderDraftTray(); } else format(key === 'b' ? 'bold' : 'italic'); } };
    if (newEntry) {
      host.querySelector('#edName').oninput = event => { current.name = event.target.value; current.content = replaceField(current.content, 'title', current.name || 'Untitled entry'); host.querySelector('#edSource').value = current.content; changed(); };
      host.querySelector('#edType').onchange = event => {
        const untouched = current.content === template(current.type, current.name, current.nation);
        current.type = event.target.value; if (!TYPES[current.type].regional) current.nation = '';
        current.content = untouched ? template(current.type, current.name, current.nation) : replaceField(current.content, 'type', current.type);
        host.querySelector('#edSource').value = current.content; host.querySelector('#edNation').value = current.nation; changed();
      };
      host.querySelector('#edNation').onchange = event => { current.nation = event.target.value; current.content = replaceField(current.content, 'region', current.nation ? '[[' + current.nation + ']]' : 'Independent'); host.querySelector('#edSource').value = current.content; changed(); };
    }
    host.querySelector('#edConnectForm').onsubmit = connect;
    host.querySelector('#edSource').addEventListener('select', rememberSelection);
    host.querySelector('#edSource').addEventListener('keyup', rememberSelection);
    host.querySelector('#edSource').addEventListener('click', rememberSelection);
    updatePath(); renderPreview(); statusDraft(); renderDraftTray(); connectionControls(); showPending();
  }

  let selection = [0, 0];
  function rememberSelection() { const source = host?.querySelector('#edSource'); if (source) selection = [source.selectionStart, source.selectionEnd]; }
  function changed() { current.baseSha = current.baseSha || null; rememberSelection(); saveDraft(); updatePath(); renderDraftTray(); clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 180); host.querySelector('#edValidation').replaceChildren(); }
  function updatePath() {
    if (!host || !current) return; const path = entryPath();
    host.querySelector('#edPath').textContent = path ? 'Destination: ' + path.replace(/^campaign\//, '') : 'Choose a name to set the destination.';
    const nationField = host.querySelector('#edNationField'); if (nationField) nationField.hidden = !TYPES[current.type]?.regional;
  }
  function renderPreview() {
    if (!host || !current) return;
    const fm = frontmatter(current.content), body = fm ? fm.body : current.content;
    const preview = host.querySelector('#edPreview');
    try {
      const fragment = document.createElement('template'); fragment.innerHTML = config.parseMarkdown(body);
      // Authored markup must never impersonate editor controls or delegated
      // actions, even if the shared content sanitizer changes in the future.
      for (const node of fragment.content.querySelectorAll('*')) {
        node.removeAttribute('id');
        for (const attribute of [...node.attributes]) if (attribute.name.startsWith('data-')) node.removeAttribute(attribute.name);
      }
      preview.replaceChildren(fragment.content);
      if (!preview.querySelector('h1')) { const h1 = document.createElement('h1'); h1.textContent = field(current.content, 'title') || current.name || 'Untitled entry'; preview.prepend(h1); }
      config.resolveImages?.(preview, entryPath() || 'campaign/npcs/Untitled entry.md');
      // Preview links must not replace a draft accidentally; use the editor's
      // own close action or the regular navigation to leave this screen.
      preview.querySelectorAll('a').forEach(a => { a.setAttribute('tabindex', '-1'); a.removeAttribute('href'); });
    } catch (_) { preview.textContent = 'The preview could not render this Markdown. Your source is still saved.'; }
  }
  function format(action, inserted) {
    const source = host?.querySelector('#edSource'); if (!source) return;
    let [start, end] = document.activeElement === source ? [source.selectionStart, source.selectionEnd] : selection;
    start = Math.min(start, source.value.length); end = Math.min(end, source.value.length);
    const selected = source.value.slice(start, end); let replacement, caret;
    if (inserted !== undefined) replacement = inserted;
    else if (action === 'bold' || action === 'italic') { const mark = action === 'bold' ? '**' : '*'; replacement = mark + (selected || 'text') + mark; caret = start + mark.length; }
    else { const marker = action === 'heading' ? '## ' : action === 'list' ? '- ' : '> '; start = source.value.lastIndexOf('\n', start - 1) + 1; replacement = source.value.slice(start, end).split('\n').map(line => marker + line).join('\n'); }
    source.setRangeText(replacement, start, end, 'end');
    if (caret !== undefined) source.setSelectionRange(caret, caret + (selected.length || 4));
    source.focus(); rememberSelection(); current.content = source.value; changed();
  }
  function renderDraftTray() {
    const tray = host?.querySelector('#edDraftTray'); if (!tray) return;
    const { drafts, recovery } = allDrafts();
    tray.innerHTML = drafts.length ? drafts.map(doc => `<div class="ed-draft-row"><a href="${doc.isNew ? '#/new#' + encodeURIComponent(doc.id) : '#/edit/' + doc.path.split('/').map(encodeURIComponent).join('/')}" ${doc.id === current?.id ? 'aria-current="page"' : ''}><strong>${esc(doc.name || 'Untitled ' + (TYPES[doc.type]?.label || 'entry'))}</strong><small>${doc.pending?.status === 'merged' ? 'Merged revision' : doc.pending?.status === 'closed' ? 'Closed revision draft' : doc.pending ? 'Awaiting publication' : doc.isNew ? 'New entry draft' : 'Changes to an entry'}</small></a><button type="button" data-ed="download-draft" data-draft-id="${esc(doc.id)}" aria-label="Download draft ${esc(doc.name || 'Untitled entry')}">↓</button><button type="button" data-ed="discard-draft" data-draft-id="${esc(doc.id)}" aria-label="Discard draft ${esc(doc.name || 'Untitled entry')}">×</button></div>`).join('') : '<p class="ed-empty">Your writing will appear here as soon as you change an entry.</p>';
    for (const key of recovery) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'ed-recovery-link'; button.textContent = 'Download recovered original'; button.onclick = () => { try { download('saeroth-recovered-draft.txt', memoryRecovery.get(key) || localStorage.getItem(key) || ''); } catch (_) {} }; tray.append(button);
    }
    const confirm = document.createElement('div'); confirm.id = 'edDiscardConfirm'; confirm.className = 'ed-confirm'; confirm.hidden = true; tray.append(confirm);
  }

  function validate() {
    const problems = [], path = entryPath(), name = current?.name.trim();
    if (!current || !path || !safePath(path) || !name || (current.isNew && (name.length > 100 || /[<>:"/\\|?*#%\[\]\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)))) problems.push('Choose a name under 100 characters without filename punctuation such as /, :, #, %, [, or ?.');
    if (window.SaerothPublisher?.validPath && !window.SaerothPublisher.validPath(path)) problems.push('This destination is reserved or cannot be published through the entry editor.');
    if (window.SaerothPublisher?.fields) { try { window.SaerothPublisher.fields(current.content); } catch (error) { problems.push(error.message); } }
    const fm = frontmatter(current?.content || '');
    if (!fm) problems.push('Keep the opening properties block between --- lines. It must include title and type.');
    else {
      if (field(current.content, 'title') !== name) problems.push('The title property must match the entry name and filename. Change the name field for a new entry; existing filenames stay fixed.');
      if (!field(current.content, 'type')) problems.push('Add a type property, such as npc, creature, location, session, faction, or reference.');
      if (current.isNew && field(current.content, 'type') !== current.type) problems.push('The type property must match the selected entry type.');
      for (const required of ['title', 'type']) if ((fm.text.match(new RegExp('^' + required + ':', 'gm')) || []).length !== 1) problems.push('Use exactly one ' + required + ' property.');
      const words = fm.body.replace(/<!--[\s\S]*?-->/g, '').split('\n').filter(line => !/^\s*#/.test(line)).join(' ').replace(/\s/g, '');
      if (!words) problems.push('Write some content beneath the headings before publishing.');
    }
    if (current.isNew && (config.notes || []).some(n => noteName(n.p).toLowerCase() === name?.toLowerCase() && n.p !== current.path) && !current.pending) problems.push('An entry with this name already exists. Open it from the library and choose Edit entry.');
    const country = nationOf(path); if (country && !current.content.includes('[[' + country)) problems.push('This entry is filed under ' + country + '. Include [[' + country + ']] in its properties or prose.');
    const mapped = source => /^atlas_poi:[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/m.exec(frontmatter(source || '')?.text || '')?.[0] || '';
    if (!current.isNew && mapped(current.content) !== mapped(current.baseText)) problems.push('Map coordinates and the atlas_poi property are managed in the atlas. Keep them unchanged here.');
    let inFence = false; const unknown = new Set();
    for (const original of (current.content || '').split('\n')) {
      if (/^\s*```/.test(original)) { inFence = !inFence; continue; } if (inFence) continue;
      const line = original.replace(/`[^`]*`/g, '');
      if (/\[\[(?:(?!\]\]).)*$/.test(line)) problems.push('Keep each [[entry link]] complete on a single line.');
      if (/^\s*\|/.test(line) && /\[\[[^\]|]*\|[^\]]*\]\]/.test(line)) problems.push('Use plain [[Entry]] links in table cells; aliases add an extra table column.');
      for (const match of line.matchAll(/\[\[([^\]\n|#]+)(?:[^\]]*)\]\]/g)) {
        const target = match[1].trim(); if (!target || target === name) continue;
        if (!(config.notes || []).some(n => noteName(n.p) === target)) unknown.add(target);
      }
    }
    if (unknown.size) problems.push('These links do not match a campaign entry: ' + [...unknown].slice(0, 6).join(', ') + '. Choose a known entry or use plain text for now.');
    if (current.content.length > MAX_CONTENT) problems.push('The entry exceeds the editor size limit.');
    const unique = [...new Set(problems)];
    host.querySelector('#edValidation').innerHTML = unique.length ? '<strong>Before publishing</strong><ul>' + unique.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '';
    return unique.length === 0;
  }

  function connectionControls() {
    if (!host) return;
    host.querySelector('#edToken').disabled = busy || !!publisher;
    host.querySelector('#edConnectForm button').disabled = busy || !!publisher;
    host.querySelector('#edDisconnect').hidden = !publisher;
    host.querySelector('#edDisconnect').disabled = busy;
    host.querySelector('#edPublish').disabled = busy;
    host.querySelector('#edPublish').textContent = busy ? 'Working…' : 'Publish entry';
  }
  async function connect(event) {
    event.preventDefault(); if (busy) return;
    const token = host.querySelector('#edToken').value.trim(); host.querySelector('#edToken').value = ''; if (!token) return;
    const status = host.querySelector('#edConnectionStatus'), ticket = generation;
    busy = true; connectionControls(); status.textContent = 'Connecting publishing…';
    try {
      if (!window.SaerothPublisher) throw Error('Publishing is not available in this version of the site yet. Your draft is still saved.');
      const client = window.SaerothPublisher.createClient(token); await client.connect(); publisher = client;
      if (ticket !== generation) return;
      status.textContent = 'Connected for this tab.'; host.querySelector('#edConnect').open = false;
      if (entryPath()) await loadAuthoritative(ticket);
    } catch (error) { publisher = null; if (ticket === generation) status.textContent = error.message || 'The publishing connection failed.'; }
    finally { busy = false; if (ticket === generation) connectionControls(); }
  }

  async function loadAuthoritative(ticket = generation) {
    if (!publisher || !current || !entryPath()) return false;
    const doc = current, path = entryPath(doc); const remote = await publisher.load(path);
    if (ticket !== generation || current !== doc || entryPath() !== path) return false;
    if (remote.pending) doc.pending = { ...remote.pending, noteSHA: remote.sha };
    if (remote.text === null && !doc.isNew) { showConflict(remote, 'This entry was removed from the published campaign. Your draft has been kept. Download it before deciding where to recreate the entry.'); return false; }
    if (remote.text === doc.baseText || remote.text === doc.content || (doc.content === doc.baseText && remote.text !== null) || (doc.isNew && remote.text === null && doc.baseText === null)) {
      if (doc.content === doc.baseText && remote.text !== null) { doc.content = remote.text; host.querySelector('#edSource').value = doc.content; renderPreview(); }
      doc.baseText = remote.text; doc.baseSha = remote.sha; conflict = null; host.querySelector('#edConflict').hidden = true; saveDraft(); showPending(); return true;
    }
    showConflict(remote, doc.isNew && !doc.pending ? 'An entry already exists at this destination. Keep your draft and use a different name, or open the existing entry to edit it.' : 'This entry changed after your draft started. Compare the latest source and reconcile your writing before publishing.');
    return false;
  }
  function showConflict(remote, message) {
    conflict = remote; const box = host.querySelector('#edConflict'); box.hidden = false;
    box.innerHTML = `<h2>Review the latest version</h2><p>${esc(message)}</p>${remote.text !== null ? `<details open><summary>Latest source</summary><pre>${esc(remote.text)}</pre></details><div class="ed-conflict-actions"><button class="ed-button" type="button" data-ed="use-latest">Use latest; keep draft backup</button><button class="ed-button" type="button" data-ed="reconciled">I have reconciled my draft</button></div><p class="ed-small">The second option keeps your writing and uses this latest version as its publishing baseline. Review and combine any changes in the source editor first.</p>` : ''}`;
    host.querySelector('#edPublishStatus').textContent = 'Publication paused: the source has changed.';
  }
  function showPending() {
    if (!host || !current) return;
    const status = host.querySelector('#edPublishStatus'), pending = current.pending;
    host.querySelector('#edCheckStatus').hidden = !pending;
    if (!pending) return;
    const label = pending.status === 'merged' ? 'Merged. The website deployment may still be running.' : pending.status === 'closed' ? 'This publication was closed without merging. Your draft is kept here.' : 'Submitted for verification. This is not published yet.';
    status.replaceChildren(document.createTextNode(label + ' '));
    if (pending.url) { const link = document.createElement('a'); link.href = pending.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'View progress'; status.append(link); }
  }
  async function publish() {
    if (busy || !current) return;
    if (!validate()) { host.querySelector('#edValidation').scrollIntoView({ block: 'nearest' }); return; }
    if (!publisher) { host.querySelector('#edConnect').open = true; host.querySelector('#edToken').focus(); host.querySelector('#edPublishStatus').textContent = 'Connect publishing once to submit this entry. Your draft is saved locally.'; return; }
    const ticket = generation, doc = current; busy = true; connectionControls();
    const status = host.querySelector('#edPublishStatus'); status.textContent = 'Checking the current campaign source…';
    try {
      if (!await loadAuthoritative(ticket)) return;
      if (!validate()) return;
      const snapshot = { path: entryPath(doc), content: doc.content, expectedBlobSha: doc.baseSha, baseText: doc.baseText, title: doc.name };
      status.textContent = 'Submitting the entry for verification…';
      const result = await publisher.publish(snapshot);
      if (ticket !== generation || current !== doc) return;
      doc.baseText = snapshot.content; doc.baseSha = result.noteSHA || doc.baseSha;
      if (Number.isInteger(result.number)) doc.pending = { number: result.number, url: result.url, status: result.status, noteSHA: result.noteSHA };
      saveDraft(); renderDraftTray(); showPending();
      if (result.status === 'unchanged') status.textContent = 'The submitted source already matches this entry. No new change was needed.';
      else if (!doc.pending) status.textContent = result.status === 'merged' ? 'Merged. Waiting for the website deployment.' : 'Submitted for verification. The published site has not changed yet.';
    } catch (error) { if (ticket === generation) status.textContent = error.message || 'Publication failed. Your draft is still saved.'; }
    finally { busy = false; if (ticket === generation) connectionControls(); }
  }
  async function checkPublication() {
    if (!current?.pending || busy) return;
    if (!publisher) { host.querySelector('#edConnect').open = true; host.querySelector('#edToken').focus(); host.querySelector('#edPublishStatus').textContent = 'Reconnect publishing to check the latest status.'; return; }
    const ticket = generation, doc = current; busy = true; connectionControls();
    try {
      const result = await publisher.status(doc.pending.number); if (ticket !== generation || current !== doc) return;
      if (result.status) doc.pending.status = result.status; if (result.url) doc.pending.url = result.url; saveDraft(); showPending();
      if (result.message) host.querySelector('#edPublishStatus').append(document.createTextNode(' ' + result.message));
    } catch (error) { if (ticket === generation) host.querySelector('#edPublishStatus').textContent = error.message; }
    finally { busy = false; if (ticket === generation) connectionControls(); }
  }

  async function reset() {
    if (!current || busy) return; recoverCurrent(); const ticket = generation;
    try {
      if (current.isNew) { current.content = template(current.type, current.name, current.nation); current.baseText = null; current.baseSha = null; }
      else {
        const raw = publisher ? await publisher.load(current.path) : { text: await config.fetchNote(current.path), sha: null };
        if (ticket !== generation) return; if (raw.text === null) throw Error('The published entry no longer exists. Your recovery copy is kept.');
        current.content = raw.text; current.baseText = raw.text; current.baseSha = raw.sha;
      }
      conflict = null; saveDraft(); render();
    } catch (error) { if (ticket === generation) host.querySelector('#edDraftStatus').textContent = error.message; }
  }
  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: filename.endsWith('.md') ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename.replace(/[<>:"/\\|?*]/g, '-'); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function handleClick(event) {
    if (event.target.closest?.('#edPreview')) return;
    const target = event.target.closest('[data-ed]'); if (!target || target.disabled) return; const action = target.dataset.ed;
    if (['bold', 'italic', 'heading', 'list', 'quote'].includes(action)) format(action);
    else if (['source', 'preview', 'split'].includes(action)) { mode = action; viewChosen = true; host.querySelector('#edPanes').dataset.view = mode; host.querySelectorAll('.ed-view button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ed === mode))); renderPreview(); }
    else if (action === 'link' || action === 'image') { host.querySelector('#edLinkPanel').hidden = action !== 'link'; host.querySelector('#edImagePanel').hidden = action !== 'image'; host.querySelector(action === 'link' ? '#edLinkName' : '#edImageURL').focus(); }
    else if (action === 'close-insert') { host.querySelector('#edLinkPanel').hidden = true; host.querySelector('#edImagePanel').hidden = true; host.querySelector('#edSource').focus(); }
    else if (action === 'insert-link') {
      const value = host.querySelector('#edLinkName').value.trim(); if (!(config.notes || []).some(n => noteName(n.p) === value)) { host.querySelector('#edLinkPanel .ed-inline-status').textContent = 'Choose an existing campaign entry from the list.'; return; }
      format('link', '[[' + value + ']]'); host.querySelector('#edLinkPanel').hidden = true;
    } else if (action === 'insert-image') {
      const value = host.querySelector('#edImageURL').value.trim(), alt = host.querySelector('#edImageAlt').value.trim() || 'Artwork';
      if (!value || /[<>\r\n]/.test(value) || (/^[a-z]+:/i.test(value) && !/^https?:/i.test(value))) { host.querySelector('#edImagePanel .ed-inline-status').textContent = 'Use an image file path or an http/https URL.'; return; }
      format('image', '![' + alt.replace(/[\[\]\\]/g, '') + '](<' + value + '>)'); host.querySelector('#edImagePanel').hidden = true;
    } else if (action === 'download') download((current.name || 'Untitled entry') + '.md', current.content);
    else if (action === 'download-draft') { const doc = allDrafts().drafts.find(d => d.id === target.dataset.draftId); if (doc) download((doc.name || 'Untitled entry') + '.md', doc.content); }
    else if (action === 'discard-draft') {
      discardId = target.dataset.draftId; const doc = allDrafts().drafts.find(d => d.id === discardId), confirm = host.querySelector('#edDiscardConfirm'); if (!doc) return;
      confirm.hidden = false; confirm.innerHTML = `<p>Discard the local draft for <strong>${esc(doc.name || 'Untitled entry')}</strong>? Published entries and any submitted revision stay unchanged.</p><button type="button" class="ed-button" data-ed="confirm-discard">Discard local draft</button><button type="button" class="ed-button" data-ed="cancel-discard">Keep draft</button>`;
      confirm.querySelector('button').focus();
    } else if (action === 'cancel-discard') { discardId = null; host.querySelector('#edDiscardConfirm').hidden = true; }
    else if (action === 'confirm-discard') {
      const doc = allDrafts().drafts.find(d => d.id === discardId); if (!doc) return;
      try { localStorage.removeItem(draftKey(doc)); memoryDrafts.delete(draftKey(doc)); const active = current.id === doc.id; discardId = null; if (active) { writeFailed = false; location.hash = doc.isNew ? '#/library' : href(doc.path); } else renderDraftTray(); }
      catch (_) { host.querySelector('#edDiscardConfirm').textContent = 'This browser could not remove the saved draft. It has been kept.'; }
    }
    else if (action === 'reset') host.querySelector('#edResetConfirm').hidden = false;
    else if (action === 'cancel-reset') host.querySelector('#edResetConfirm').hidden = true;
    else if (action === 'confirm-reset') reset();
    else if (action === 'publish') publish();
    else if (action === 'check-status') checkPublication();
    else if (action === 'disconnect') { publisher = null; host.querySelector('#edConnectionStatus').textContent = 'Disconnected. Your drafts are still on this device.'; connectionControls(); }
    else if (action === 'use-latest' && conflict?.text !== null) { recoverCurrent(); current.content = conflict.text; current.baseText = conflict.text; current.baseSha = conflict.sha; conflict = null; saveDraft(); render(); }
    else if (action === 'reconciled' && conflict?.text !== null) { current.baseText = conflict.text; current.baseSha = conflict.sha; conflict = null; host.querySelector('#edConflict').hidden = true; saveDraft(); host.querySelector('#edPublishStatus').textContent = 'Latest source accepted as the baseline. Review your preview, then publish when ready.'; }
  }

  window.addEventListener('beforeunload', event => { if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; } });
  window.SaerothEditor = { configure, mount, dispose, hasUnsavedChanges };
})();
