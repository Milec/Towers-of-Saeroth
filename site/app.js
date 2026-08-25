/* Towers of Saeroth — static vault browser.
   Renders the repo's markdown client-side with Obsidian wikilinks and the two
   PF2e Obsidian plugins (statblocks + action icons) reimplemented natively. */
'use strict';

const BASE = location.pathname.replace(/\/[^/]*$/, '/');
const $ = (id) => document.getElementById(id);

const state = {
  campaign: [],      // [{p:path, t:title}]
  vault: [],         // [{p:path, t:title}]  (lazy)
  byName: new Map(), // lowercased basename -> [paths]
  byPath: new Set(),
  text: new Map(),   // campaign path -> lowercased body, for full-text search
  links: new Map(),  // campaign path -> outbound wikilink targets (from the build)
  vaultIndexOf: new Map(), // vault path -> row index in index-vault-links
  type: new Map(),   // path -> frontmatter type, for graph colouring
  tree: null,
  vaultLoaded: false,
  current: null,
};

/* ------------------------------------------------------------------ icons */
// Font-independent action glyphs. The Obsidian plugins use an embedded icon
// font that overlaps adjacent text on iOS; these are plain SVG and don't.
const ACTIONS = {
  1: { n: 1, label: 'single action' },
  2: { n: 2, label: 'two actions' },
  3: { n: 3, label: 'three actions' },
  0: { n: 0, label: 'free action' },
  r: { n: 'r', label: 'reaction' },
};
function actionSVG(kind) {
  const a = ACTIONS[kind];
  if (!a) return '';
  const cls = 'pf2-action';
  if (a.n === 'r') {
    return `<svg class="${cls}" viewBox="0 0 24 24" role="img" aria-label="${a.label}">
      <path d="M20 12a8 8 0 1 1-2.7-6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M20 3.2V10h-6.6z"/></svg>`;
  }
  if (a.n === 0) {
    return `<svg class="${cls}" viewBox="0 0 24 24" role="img" aria-label="${a.label}">
      <path d="M12 2.6 21.4 12 12 21.4 2.6 12z" fill="none" stroke="currentColor" stroke-width="3"/></svg>`;
  }
  const w = a.n * 9 + 6;
  let d = '';
  for (let i = 0; i < a.n; i++) d += `<path d="M${i * 9 + 5.2} 2.6 ${i * 9 + 9.6} 12 ${i * 9 + 5.2} 21.4 ${i * 9 + 0.8} 12z"/>`;
  return `<svg class="${cls}" viewBox="0 0 ${w} 24" role="img" aria-label="${a.label}">${d}</svg>`;
}
const NAMED_ACTIONS = {
  'one-action': 1, 'two-actions': 2, 'three-actions': 3,
  'free-action': 0, 'reaction': 'r',
};

/* ------------------------------------------------------- link resolution */
function normalize(s) { return s.trim().toLowerCase(); }

function resolveTarget(target) {
  const clean = target.replace(/\\/g, '/').replace(/\.md$/i, '').trim();
  // exact path first (vault-style links like Setting/Deities/Nethys)
  for (const root of ['campaign/', 'vault/']) {
    const cand = clean.startsWith(root) ? clean : root + clean;
    if (state.byPath.has(cand + '.md')) return cand + '.md';
  }
  // otherwise resolve by filename, preferring campaign notes
  const hits = state.byName.get(normalize(clean.split('/').pop()));
  if (!hits || !hits.length) return null;
  return hits.find((p) => p.startsWith('campaign/')) || hits[0];
}

/* ------------------------------------------------- markdown configuration */
function stripFrontmatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { fm: null, body: src };
  return { fm: m[1], body: src.slice(m[0].length) };
}

/* ------------------------------------------------------------- history
   Installed to a home screen there is no browser chrome and therefore no back
   button, so the app keeps its own trail. It is a real stack rather than a call
   to history.back(): the app can be launched straight onto a note, and going
   "back" from there would leave the app entirely.

   The browser's own back/forward still fire hashchange, so a step that lands on
   the neighbouring entry is treated as movement along this stack rather than a
   new visit — otherwise pressing the desktop back button would push a duplicate
   and the trail would grow instead of unwinding. */
const nav = { stack: [], i: -1 };

function navRecord(path) {
  if (nav.i >= 0 && nav.stack[nav.i] === path) return;          // same note again
  if (nav.i > 0 && nav.stack[nav.i - 1] === path) { nav.i--; }  // browser back
  else if (nav.stack[nav.i + 1] === path) { nav.i++; }          // browser forward
  else {
    nav.stack.length = nav.i + 1;   // a new path truncates the forward trail
    nav.stack.push(path);
    nav.i = nav.stack.length - 1;
  }
  syncBackBtn();
}

function syncBackBtn() {
  const b = $('backBtn');
  if (!b) return;
  const can = nav.i > 0;
  b.disabled = !can;
  b.title = can ? 'Back to ' + nav.stack[nav.i - 1].split('/').pop().replace(/\.md$/, '') : '';
}

function goBack() {
  if (nav.i <= 0) return;
  location.hash = '#/' + encodeURI(nav.stack[nav.i - 1]);   // navRecord sees the step
}

function fmField(fm, key) {
  if (!fm) return '';
  const m = new RegExp('^' + key + ':\\s*(.*)$', 'mi').exec(fm);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

const wikilink = {
  name: 'wikilink', level: 'inline',
  start(src) { return src.indexOf('[['); },
  tokenizer(src) {
    const m = /^!?\[\[([^\]\n]+?)\]\]/.exec(src);
    if (!m) return;
    const raw = m[1];
    const [targetPart, ...aliasParts] = raw.split('|');
    const [target, hash] = targetPart.split('#');
    return {
      type: 'wikilink', raw: m[0],
      target: target.trim(), hash: (hash || '').trim(),
      text: (aliasParts.join('|') || hash || target).trim(),
    };
  },
  renderer(t) {
    const path = resolveTarget(t.target);
    const label = escapeHtml(t.text);
    if (!path) return `<span class="wl broken" title="Unresolved: ${escapeHtml(t.target)}">${label}</span>`;
    const frag = t.hash ? '%23' + encodeURIComponent(t.hash) : '';
    return `<a class="wl" href="#/${encodeURI(path)}${frag}">${label}</a>`;
  },
};

const highlight = {
  name: 'highlight', level: 'inline',
  start(src) { return src.indexOf('=='); },
  tokenizer(src) {
    const m = /^==([^=\n]+)==/.exec(src);
    if (!m) return;
    return { type: 'highlight', raw: m[0], text: m[1] };
  },
  renderer(t) { return `<mark>${escapeHtml(t.text)}</mark>`; },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --------------------------------------------------- statblock rendering */
// Renders a ```pf2e-stats / ```sf2e-stats block the way the Obsidian plugin does.
function renderStatblock(src, starfinder) {
  const lines = src.split(/\r?\n/);
  let out = '';
  let listOpen = false;
  const closeList = () => { if (listOpen) { out += '</div>'; listOpen = false; } };

  for (let raw of lines) {
    const indent = (/^(\t+|\s{4,})/.exec(raw) || [''])[0].length;
    const line = raw.trim();
    if (!line) { closeList(); continue; }

    if (/^#\s+/.test(line)) {
      closeList();
      out += `<div class="sb-title">${inlineSB(line.replace(/^#\s+/, ''))}</div>`;
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeList();
      out += `<div class="sb-level">${inlineSB(line.replace(/^##\s+/, ''))}</div>`;
      continue;
    }
    if (/^###\s+/.test(line)) {
      closeList();
      out += `<div class="sb-traits">${traitPills(line.replace(/^###\s+/, ''))}</div>`;
      continue;
    }
    if (/^-{3,}$/.test(line)) { closeList(); out += '<hr class="sb-rule">'; continue; }
    if (/^==/.test(line) && /==$/.test(line)) {
      closeList();
      out += `<div class="sb-traits">${traitPills(line)}</div>`;
      continue;
    }
    const cls = indent ? ' class="sb-indent"' : '';
    out += `<p${cls}>${inlineSB(line)}</p>`;
  }
  closeList();
  return `<div class="statblock${starfinder ? ' sf' : ''}">${out}</div>`;
}

function traitPills(s) {
  const pills = [...s.matchAll(/==([^=]+)==/g)].map((m) => m[1].trim());
  const src = pills.length ? pills : s.split(/\s{2,}|,/).map((x) => x.trim()).filter(Boolean);
  return src.map((t) => `<span class="trait ${traitClass(t)}">${escapeHtml(t)}</span>`).join('');
}
const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const RARITY = { common: 'common', uncommon: 'uncommon', rare: 'rare', unique: 'unique' };
function traitClass(t) {
  const k = t.toLowerCase();
  if (RARITY[k]) return 'r-' + RARITY[k];
  if (SIZES.includes(k)) return 'r-size';
  if (/^(lg|ng|cg|ln|n|cn|le|ne|ce)$/.test(k)) return 'r-align';
  return '';
}

// inline formatting inside a statblock: bold, italics, action icons, wikilinks
function inlineSB(s) {
  /* Wikilinks come out of the RAW text before anything is escaped, and go back
     in as finished HTML at the very end. Resolving them after escapeHtml turns
     an apostrophe in a note name into `&#39;`, and then both resolveTarget and
     the `#`-fragment split read that entity as part of the name — which broke
     every link to a note like The Pilgrim's Peace. */
  const links = [];
  const src = s.replace(/\[\[([^\]\n]+?)\]\]/g, (_, raw) => {
    const [tp, ...al] = raw.split('|');
    const [target] = tp.split('#');
    const p = resolveTarget(target);
    const label = escapeHtml((al.join('|') || target).trim());
    links.push(p ? `<a class="wl" href="#/${encodeURI(p)}">${label}</a>`
                 : `<span class="wl broken">${label}</span>`);
    return '\u0000' + (links.length - 1) + '\u0000';
  });
  let h = escapeHtml(src);
  h = h.replace(/`\[(one-action|two-actions|three-actions|free-action|reaction)\]`/g,
    (_, k) => actionSVG(NAMED_ACTIONS[k]));
  h = h.replace(/`pf2:([0-3r])`/gi, (_, k) => actionSVG(k.toLowerCase() === 'r' ? 'r' : Number(k)));
  h = h.replace(/==([^=]+)==/g, (_, t) => `<span class="trait ${traitClass(t)}">${t}</span>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  return h.replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

/* --------------------------------------------------------- marked wiring */
/* marked 12 passes positional arguments to renderer methods, not token
   objects — the token-object signature only arrived in later majors. */
const renderer = {
  code(code, infostring) {
    const lang = (infostring || '').trim().toLowerCase();
    if (lang === 'pf2e-stats' || lang === 'sf2e-stats') {
      return renderStatblock(code, lang === 'sf2e-stats');
    }
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  },
  // `text` arrives already HTML-escaped by marked, so it is not escaped again.
  codespan(text) {
    let m = /^pf2:([0-3r])$/i.exec(text);
    if (m) return actionSVG(m[1].toLowerCase() === 'r' ? 'r' : Number(m[1]));
    m = /^\[(one-action|two-actions|three-actions|free-action|reaction)\]$/.exec(text);
    if (m) return actionSVG(NAMED_ACTIONS[m[1]]);
    // "Full entry: `vault/Ancestries/Kholo.md`" citations. These are plain code
    // in the markdown because a wikilink there would be dead in Obsidian, whose
    // vault root is campaign/ — but this app serves the whole repo, so make
    // them navigable. Linked optimistically: the vault index may not be loaded
    // yet, and a wrong path lands on the app's own "Not found" page.
    if (/^(vault|campaign)\/[^\s]+\.md$/.test(text)) {
      return `<a class="wl cite" href="#/${encodeURI(text)}"><code>${text}</code></a>`;
    }
    return `<code>${text}</code>`;
  },
  // `quote` is the already-rendered inner HTML.
  blockquote(quote) {
    const m = /^\s*<p>\s*\[!(\w+)\]([^<\n]*)/.exec(quote);
    if (m) {
      const kind = m[1].toLowerCase();
      const title = (m[2] || '').trim() || kind[0].toUpperCase() + kind.slice(1);
      const body = quote.replace(/^\s*<p>\s*\[!\w+\][^<\n]*/, '<p>').replace(/^<p>\s*<\/p>\s*/, '');
      return `<div class="callout c-${kind}"><div class="callout-t">${escapeHtml(title)}</div>${body}</div>`;
    }
    return `<blockquote>${quote}</blockquote>`;
  },
  heading(text, level, raw) {
    const id = String(raw || text).toLowerCase().replace(/<[^>]*>/g, '')
      .replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
    return `<h${level} id="${id}">${text}</h${level}>`;
  },
};

marked.use({ extensions: [wikilink, highlight], renderer, gfm: true, breaks: false });

/* ------------------------------------------------------------- rendering */
async function fetchNote(path) {
  const res = await fetch(BASE + 'content/' + path.split('/').map(encodeURIComponent).join('/'));
  if (!res.ok) throw new Error(res.status + ' ' + path);
  return res.text();
}

function frontmatterTable(fm) {
  if (!fm) return '';
  const rows = [];
  for (const line of fm.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_ -]+):\s*(.*)$/.exec(line);
    if (m && m[2].trim()) rows.push([m[1], m[2].replace(/^["']|["']$/g, '')]);
  }
  if (!rows.length) return '';
  return `<details class="props"><summary>Properties</summary><dl>` +
    rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('') +
    `</dl></details>`;
}

/* Art referenced from a note sits beside it in the repo and is copied beside
   it into content/, so `![](towers.jpg)` is right in Obsidian and on GitHub.
   The browser would resolve that against the page URL, which is the site root
   rather than the note, so point each one back at its own note's directory. */
function resolveImages(el, notePath) {
  const dir = notePath.replace(/[^/]*$/, '');
  const seg = (s) => { try { return encodeURIComponent(decodeURIComponent(s)); }
                       catch (_) { return encodeURIComponent(s); } };
  for (const img of el.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (!src || /^(?:[a-z]+:|\/\/|\/)/i.test(src)) continue;
    img.src = BASE + 'content/' + (dir + src).split('/').map(seg).join('/');
    img.loading = 'lazy';
  }
}

async function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, frag] = hash.split('#');
  const target = path || 'campaign/README.md';
  state.current = target;
  navRecord(target);
  // Navigating means the reader wants the note, so the graph gets out of the
  // way — whether they came from a node, the tree, or the back arrow.
  if (!$('graphView').hidden) closeGraph();
  const el = $('content');
  // Vault notes cross-link heavily to other vault notes, so the vault index
  // has to be in memory before rendering or every one of those links renders
  // as unresolved. Campaign notes never link into the vault, so this stays
  // lazy and the common path never pays for it.
  if (target.startsWith('vault/')) {
    try { await ensureVault(); } catch (_) { /* offline: links degrade to plain text */ }
  }
  try {
    const raw = await fetchNote(target);
    const { fm, body } = stripFrontmatter(raw);
    el.classList.remove('wide');   // only a relations note widens the column
    el.innerHTML =
      `<nav class="crumbs">${crumbs(target)}</nav>` +
      frontmatterTable(fm) +
      marked.parse(body);
    resolveImages(el, target);
    if (fmField(fm, 'view') === 'relations') {
      try { mountRelations(el, body); } catch (_) { /* the table still renders */ }
    }
    if (fmField(fm, 'view') === 'routes') {
      mountRoutes(el, body).catch(() => { /* the table still renders */ });
    }
    if (fmField(fm, 'view') === 'nation') {
      try { mountNation(el); } catch (_) { /* the bullets still render */ }
    }
    if (fmField(fm, 'view') === 'timeline') {
      try { mountTimeline(el, body); } catch (_) { /* the tables still render */ }
    }
    document.title = target.split('/').pop().replace(/\.md$/, '') + ' — Towers of Saeroth';
    renderBacklinks(target);
    if (frag) {
      const t = document.getElementById(frag.toLowerCase().replace(/[^\w]+/g, '-'));
      if (t) t.scrollIntoView();
    } else {
      $('main').scrollTop = 0;
    }
  } catch (e) {
    el.innerHTML = `<h1>Not found</h1><p class="muted">Could not load <code>${escapeHtml(target)}</code>.</p>`;
  }
  markActive(target);
  closeSidebar();
}

function crumbs(path) {
  const parts = path.split('/');
  return parts.map((p, i) =>
    i === parts.length - 1
      ? `<span>${escapeHtml(p.replace(/\.md$/, ''))}</span>`
      : `<span class="muted">${escapeHtml(p)}</span>`
  ).join('<span class="sep">/</span>');
}

/* Backlinks: which campaign notes link here. Vault is too large to scan.
   Uses the outbound-link lists captured at build time — the searchable body
   has wikilinks flattened to their display text, so it cannot be used here. */
function renderBacklinks(target) {
  const name = normalize(target.split('/').pop().replace(/\.md$/, ''));
  const hits = [];
  for (const [p, links] of state.links) {
    if (p !== target && links.includes(name)) hits.push(p);
  }
  const box = $('backlinks');
  if (!hits.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = `<h2>Linked from</h2><ul>` + hits.sort().map((p) =>
    `<li><a href="#/${encodeURI(p)}">${escapeHtml(p.split('/').pop().replace(/\.md$/, ''))}</a></li>`
  ).join('') + '</ul>';
}

/* ------------------------------------------------------------ navigation
   The tree holds up to ~42k notes, so only one level is ever put in the DOM
   at a time; children are rendered the first time a folder is expanded. */
function makeTreeData(paths) {
  const root = { dirs: new Map(), files: [] };
  for (const p of paths) {
    const parts = p.split('/');
    let node = root;
    parts.forEach((seg, i) => {
      if (i === parts.length - 1) node.files.push({ seg, p });
      else {
        if (!node.dirs.has(seg)) node.dirs.set(seg, { dirs: new Map(), files: [] });
        node = node.dirs.get(seg);
      }
    });
  }
  return root;
}

function renderLevel(node, mount, openDepth = 0, depth = 0, prefix = '') {
  mount.textContent = '';
  for (const key of [...node.dirs.keys()].sort()) {
    const child = node.dirs.get(key);
    const path = prefix ? prefix + '/' + key : key;
    const d = document.createElement('details');
    d.dataset.dir = path;
    const s = document.createElement('summary');
    s.textContent = key;
    d.appendChild(s);
    const holder = document.createElement('div');
    d.appendChild(holder);
    // Kept as a method rather than only a toggle handler, because `toggle` is
    // queued rather than dispatched synchronously: revealing the folder a note
    // lives in has to be able to fill it and read its children in one go.
    d.fill = async () => {
      if (d.dataset.filled) return;
      d.dataset.filled = '1';
      // The vault subtree (41,718 notes) is only fetched and built when
      // someone actually opens it.
      if (child.lazy) {
        holder.innerHTML = '<p class="muted pad small">Loading 41,718 notes…</p>';
        try {
          await ensureVault();
          const built = makeTreeData(state.vault.map((v) => v.p)).dirs.get('vault');
          if (built) { node.dirs.set(key, built); renderLevel(built, holder, 0, 0, path); return; }
          holder.innerHTML = '<p class="muted pad small">No notes found.</p>';
        } catch (_) {
          holder.innerHTML = '<p class="muted pad small">Could not load — offline?</p>';
          d.dataset.filled = '';
        }
        return;
      }
      renderLevel(child, holder, 0, 0, path);
    };
    d.addEventListener('toggle', () => { if (d.open) d.fill(); });
    // Never auto-expand a lazy branch: that would mark it filled from its
    // empty placeholder and the real load would never fire.
    if (depth < openDepth && !child.lazy) {
      d.open = true; d.dataset.filled = '1';
      renderLevel(child, holder, openDepth, depth + 1, path);
    }
    mount.appendChild(d);
  }
  for (const f of node.files.sort((a, b) => a.seg.localeCompare(b.seg))) {
    const a = document.createElement('a');
    a.className = 'leaf';
    a.dataset.path = f.p;
    a.href = '#/' + encodeURI(f.p);
    a.textContent = f.seg.replace(/\.md$/, '');
    mount.appendChild(a);
  }
}

function buildTree(paths, mount, opts = {}) {
  state.tree = makeTreeData(paths);
  // placeholder branch; populated from index-vault.json on first expand
  state.tree.dirs.set('vault', { dirs: new Map(), files: [], lazy: true });
  renderLevel(state.tree, mount, opts.open || 0);
}
/* The tree opens fully collapsed, so the note being read is not in the DOM at
   all until its folders are filled. Walk down to it, opening and filling each
   level in turn, then highlight it.

   Not on the very first route, though: landing on the app should show a closed
   tree, not one already opened onto whatever note the URL happened to carry. */
async function markActive(path) {
  document.querySelectorAll('.leaf.active').forEach((a) => a.classList.remove('active'));
  if (!path || !state.routed) { state.routed = true; return; }
  const segs = path.split('/');
  segs.pop();
  let mount = $('tree'), acc = '';
  for (const seg of segs) {
    acc = acc ? acc + '/' + seg : seg;
    const d = mount.querySelector(`:scope > details[data-dir="${CSS.escape(acc)}"]`);
    if (!d) return;
    if (d.fill) await d.fill();
    d.open = true;
    mount = d.lastElementChild;
  }
  const a = document.querySelector(`.leaf[data-path="${CSS.escape(path)}"]`);
  if (a) a.classList.add('active');
}

/* ---------------------------------------------------------------- search */
async function ensureVault() {
  if (state.vaultLoaded) return;
  const res = await fetch(BASE + 'index-vault.json');
  const list = await res.json();
  state.vault = list;
  list.forEach((it, i) => { indexEntry(it.p); state.vaultIndexOf.set(it.p, i); });
  state.vaultLoaded = true;
}
function indexEntry(p) {
  state.byPath.add(p);
  const n = normalize(p.split('/').pop().replace(/\.md$/, ''));
  if (!state.byName.has(n)) state.byName.set(n, []);
  state.byName.get(n).push(p);
}

function search(q) {
  const needle = normalize(q);
  if (!needle) return [];
  const out = [];
  for (const it of state.campaign) {
    const name = it.p.split('/').pop().replace(/\.md$/, '');
    const inTitle = normalize(name).includes(needle);
    const body = state.text.get(it.p) || '';
    const at = body.indexOf(needle);
    if (inTitle || at >= 0) {
      out.push({ p: it.p, name, score: inTitle ? 0 : 1,
        snippet: at >= 0 ? body.slice(Math.max(0, at - 40), at + 80) : '' });
    }
  }
  if (state.vaultLoaded) {
    for (const it of state.vault) {
      const name = it.p.split('/').pop().replace(/\.md$/, '');
      if (normalize(name).includes(needle)) out.push({ p: it.p, name, score: 2, snippet: '' });
    }
  }
  return out.sort((a, b) => a.score - b.score || a.name.length - b.name.length).slice(0, 60);
}

function showResults(list) {
  $('searchResults').innerHTML = list.length
    ? list.map((r) => `<a href="#/${encodeURI(r.p)}"><strong>${escapeHtml(r.name)}</strong>
        <span class="muted">${escapeHtml(r.p.split('/').slice(0, -1).join('/'))}</span>
        ${r.snippet ? `<span class="snip">…${escapeHtml(r.snippet)}…</span>` : ''}</a>`).join('')
    : '<p class="muted pad">No matches.</p>';
}

/* ------------------------------------------------------------- graph view
   Canvas force-directed layout. Scope is chosen before anything is built:
   graphing all 41,718 vault notes and their 457,000 links would lock the
   browser, so the vault is opt-in folder by folder. */
/* Categorical palette, both modes selected from the same ramps.
   Only THREE hues are used, and that is a hard limit rather than taste: a node
   graph shows every pair of marks at once, and validating this palette
   all-pairs shows the first three slots are the largest set that clears both
   the CVD floor and the normal-vision floor in light *and* dark. A fourth hue
   fails outright (blue↔violet ΔE 9.8 in dark — indistinguishable even with
   full colour vision). So beyond three categories the rest fold into a neutral
   "Other", and the legend — not colour alone — carries identity. */
const PALETTE = {
  light: ['#2a78d6', '#eb6834', '#1baf7a'],
  dark:  ['#3987e5', '#d95926', '#199e70'],
};
const MAX_HUES = PALETTE.light.length;

const COLOR_MODES = {
  domain: { label: 'Campaign vs rules', of: (n) => (n.p.startsWith('campaign/') ? 'Campaign' : 'Rules vault') },
  type:   { label: 'Note type', of: (n) => n.type || folderOf(n.p) },
  folder: { label: 'Folder', of: (n) => folderOf(n.p) },
};
function folderOf(p) {
  const parts = p.split('/');
  return parts.length > 2 ? parts[1] : parts[0];
}

/* Layout tuning, in one place. `repel`/`springLen` set how airy the graph is;
   `range` matters more than it looks — repulsion is only computed between
   nearby cells, so if it is too small a dense cluster has nothing pushing it
   apart globally and collapses into a ball. */
const SIM = {
  repel: 1400, minD: 30, range: 190,
  springLen: 95, springK: 0.0055, springCap: 1.2,
  centre: 0.00040, damp: 0.86, maxV: 3.5, decay: 0.988,
};

/* `sel` is the selected node and `nbr`/`selEdges` are its neighbourhood, cached
   at selection time rather than recomputed per frame. That caching is the whole
   reason selection is affordable here: the old hover highlight rescanned all
   457,000 edges on every single frame, and a selection that persists would have
   paid that cost forever. */
const graph = {
  nodes: [], edges: [], raf: 0, scale: 1, ox: 0, oy: 0,
  hover: -1, sel: -1, nbr: null, selEdges: null,
  alpha: 0, legend: [], mute: new Set(), dirty: false, interacting: false,
};
window.__g = graph;   // exposed for automated UI tests
let vaultLinks = null;   // {names:[], links:[[id,...]]} — fetched on demand

function scopeKey(p) {
  const parts = p.split('/');
  return parts.length > 2 ? parts[0] + '/' + parts[1] : parts[0];
}

function buildScopeUI() {
  const box = $('scopes');
  const groups = new Map();
  for (const it of state.campaign) {
    const k = scopeKey(it.p);
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  const vaultGroups = new Map();
  if (state.vaultLoaded) {
    for (const it of state.vault) {
      const k = scopeKey(it.p);
      vaultGroups.set(k, (vaultGroups.get(k) || 0) + 1);
    }
  }
  const row = (k, n, checked) =>
    `<label class="chk"><input type="checkbox" class="scope" value="${escapeHtml(k)}"${checked ? ' checked' : ''}>
      <span>${escapeHtml(k)}</span><span class="muted">${n.toLocaleString()}</span></label>`;
  box.innerHTML =
    '<div class="scope-h">Campaign</div>' +
    [...groups.keys()].sort().map((k) => row(k, groups.get(k), true)).join('') +
    '<div class="scope-h">Rules vault' +
      (state.vaultLoaded ? '' : ' <button id="loadVault" class="linkbtn">load list</button>') + '</div>' +
    (state.vaultLoaded
      ? [...vaultGroups.keys()].sort().map((k) => row(k, vaultGroups.get(k), false)).join('')
      : '<p class="muted small pad">41,718 notes — load to pick folders.</p>');

  const lv = $('loadVault');
  if (lv) lv.onclick = async () => {
    lv.textContent = 'loading…';
    await ensureVault();
    buildScopeUI();
    updateCounts();
  };
  box.querySelectorAll('.scope').forEach((c) => (c.onchange = updateCounts));
  $('hideOrphans').onchange = updateCounts;
  updateCounts();
}

function selectedScopes() {
  return [...document.querySelectorAll('.scope:checked')].map((c) => c.value);
}

async function collectGraph() {
  const scopes = new Set(selectedScopes());
  const wantVault = [...scopes].some((s) => s.startsWith('vault'));
  if (wantVault && !vaultLinks) {
    vaultLinks = await (await fetch(BASE + 'index-vault-links.json')).json();
  }
  const paths = [];
  for (const it of state.campaign) if (scopes.has(scopeKey(it.p))) paths.push(it.p);
  if (wantVault) for (const it of state.vault) if (scopes.has(scopeKey(it.p))) paths.push(it.p);

  const idx = new Map(paths.map((p, i) => [p, i]));
  const nodes = paths.map((p) => ({
    p, name: p.split('/').pop().replace(/\.md$/, ''),
    campaign: p.startsWith('campaign/'), type: state.type.get(p) || '', deg: 0,
    cat: '', slot: -1, x: 0, y: 0, vx: 0, vy: 0,
  }));

  // outbound links, by source path
  const linksFor = (p, i) => {
    if (p.startsWith('campaign/')) return state.links.get(p) || [];
    if (!vaultLinks) return [];
    const vi = state.vaultIndexOf.get(p);
    return vi == null ? [] : vaultLinks.links[vi].map((id) => vaultLinks.names[id]);
  };

  const edges = [];
  const seen = new Set();
  paths.forEach((p, i) => {
    for (const t of linksFor(p, i)) {
      const tp = resolveTarget(t);
      if (!tp) continue;
      const j = idx.get(tp);
      if (j == null || j === i) continue;
      const key = i < j ? i + ':' + j : j + ':' + i;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
      nodes[i].deg++; nodes[j].deg++;
    }
  });
  return { nodes, edges };
}

async function updateCounts() {
  const el = $('gcount');
  el.textContent = 'counting…';
  try {
    const { nodes, edges } = await collectGraph();
    const keep = $('hideOrphans').checked ? nodes.filter((n) => n.deg > 0).length : nodes.length;
    el.textContent = `${keep.toLocaleString()} nodes · ${edges.length.toLocaleString()} links`;
    const warn = $('gwarn');
    if (keep > 4000 || edges.length > 12000) {
      warn.hidden = false;
      warn.textContent = 'That is a lot to draw — expect it to be slow and tangled. Fewer folders reads better.';
    } else warn.hidden = true;
  } catch (e) { el.textContent = 'count failed'; }
}

async function renderGraphNow() {
  cancelAnimationFrame(graph.raf);
  graph.raf = 0;
  clearGraphSelection();     // node indices are about to change under it
  graph.hover = -1;
  const { nodes, edges } = await collectGraph();
  let ns = nodes, es = edges;
  if ($('hideOrphans').checked) {
    const keepIdx = new Map();
    ns = [];
    nodes.forEach((n, i) => { if (n.deg > 0) { keepIdx.set(i, ns.length); ns.push(n); } });
    es = edges.map(([a, b]) => [keepIdx.get(a), keepIdx.get(b)])
              .filter(([a, b]) => a != null && b != null);
  }
  // Phyllotaxis seeding: evenly spread and deterministic. Random radii used to
  // drop nodes almost on top of each other, which is what the repulsion term
  // then turned into an explosion on the first few frames.
  const R = Math.max(160, Math.sqrt(ns.length) * 40);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  ns.forEach((n, i) => {
    const r = R * Math.sqrt((i + 0.5) / ns.length);
    const a = i * GOLDEN;
    n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; n.vx = n.vy = 0;
  });
  assignColours(ns);
  graph.labelCut = null;
  graph.nodes = ns; graph.edges = es; graph.alpha = 1;
  // Settle most of the layout before the first frame. The big rearrangement is
  // inherently fast and jumpy; running it off-screen means the animation the
  // user actually sees is only the gentle tail of the settle.
  const warm = ns.length > 4000 ? 90 : 240;
  for (let i = 0; i < warm; i++) if (!step()) break;
  /* Initial zoom is driven by how far apart neighbours actually ended up, not
     by fitting the whole graph. Fitting alone is self-defeating: spreading the
     layout in world units just zooms out by the same factor and the on-screen
     spacing neverchanges. So aim for a comfortable pixel gap between typical
     neighbours, clamped so the graph still fits reasonably and never blows up. */
  const cvEl = $('gcanvas');
  const cw = cvEl.clientWidth || 800, chh = cvEl.clientHeight || 600;
  let maxR = 1;
  for (const n of ns) maxR = Math.max(maxR, Math.hypot(n.x, n.y));
  const fit = (Math.min(cw, chh) * 0.46) / maxR;
  const nn = medianNearest(ns);
  const wanted = TARGET_GAP_PX / Math.max(nn, 1);
  const slack = cw < 700 ? 1.55 : 2.3;   // less overflow on a phone
  graph.scale = Math.max(0.06, Math.min(6, Math.max(fit, Math.min(wanted, fit * slack))));
  graph.ox = 0; graph.oy = 0;
  $('ghint').hidden = ns.length === 0;
  if (innerWidth <= 860) setPanel(false);   // hand the screen to the graph
  tick();
}

/* Largest categories get the validated hues, in fixed order by size; the tail
   folds into a neutral "Other" rather than inventing a fourth hue. */
const TARGET_GAP_PX = 54;   // desired on-screen distance between neighbours

/* Median distance to nearest neighbour, sampled for big graphs so this stays
   linear-ish rather than O(n²) on 40k nodes. */
function medianNearest(ns) {
  if (ns.length < 2) return 1;
  const step = ns.length > 1200 ? Math.ceil(ns.length / 600) : 1;
  const out = [];
  for (let i = 0; i < ns.length; i += step) {
    let best = Infinity;
    for (let j = 0; j < ns.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(ns[i].x - ns[j].x, ns[i].y - ns[j].y);
      if (d < best) best = d;
    }
    if (best < Infinity) out.push(best);
  }
  out.sort((a, b) => a - b);
  return out[Math.floor(out.length / 2)] || 1;
}

function assignColours(ns) {
  graph.mute.clear();   // slots are about to be reassigned
  const mode = COLOR_MODES[$('colorBy').value] || COLOR_MODES.domain;
  const counts = new Map();
  for (const n of ns) {
    n.cat = mode.of(n) || 'Other';
    counts.set(n.cat, (counts.get(n.cat) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const slotOf = new Map(ranked.slice(0, MAX_HUES).map(([k], i) => [k, i]));
  for (const n of ns) n.slot = slotOf.has(n.cat) ? slotOf.get(n.cat) : -1;

  graph.legend = ranked.slice(0, MAX_HUES).map(([k], i) => ({ label: k, slot: i, n: counts.get(k) }));
  const restN = ranked.slice(MAX_HUES).reduce((a, [, v]) => a + v, 0);
  if (restN) graph.legend.push({ label: `Other (${ranked.length - MAX_HUES} more)`, slot: -1, n: restN });
  drawLegend();
}

function paletteNow() {
  const dark = getComputedStyle(document.documentElement).colorScheme.includes('dark')
    || document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  return PALETTE[dark ? 'dark' : 'light'];
}
function slotColour(slot) {
  if (slot < 0) return getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#888';
  return paletteNow()[slot];
}

/* The legend doubles as a filter, the way the relations web's standing chips do:
   clicking a category mutes it, so a graph of everything can be narrowed to the
   one kind of note you are actually looking for without re-rendering. */
function drawLegend() {
  const el = $('glegend');
  if (!graph.legend.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="scope-h">Legend <span class="muted">— click to filter</span></div>' +
    graph.legend.map((l) =>
      `<button type="button" class="lgd" data-slot="${l.slot}"
         aria-pressed="${graph.mute.has(l.slot) ? 'false' : 'true'}">
        <span class="sw" style="background:${slotColour(l.slot)}"></span>
        <span>${escapeHtml(l.label)}</span><span class="muted">${l.n.toLocaleString()}</span>
      </button>`).join('');
  el.querySelectorAll('.lgd').forEach((b) => {
    b.onclick = () => {
      // Keyed on the colour slot, not the label: the tail category's legend row
      // reads "Other (12 more)", which matches no node's category name.
      const slot = Number(b.dataset.slot);
      if (graph.mute.has(slot)) graph.mute.delete(slot); else graph.mute.add(slot);
      b.setAttribute('aria-pressed', graph.mute.has(slot) ? 'false' : 'true');
      needsDraw();
    };
  });
}

/* One physics iteration, separated from drawing so the layout can be warmed
   up off-screen before the first paint. */
function step() {
  const { nodes: ns, edges: es } = graph;
  if (!(graph.alpha > 0.005 && ns.length)) return false;
  {
    // Forces scale with alpha so the layout eases to a stop instead of running
    // at full strength and then cutting off — which left nodes still drifting
    // under the cursor when the graph looked settled.
    const k = graph.alpha, cell = SIM.range / 2;
    const MIN_D = SIM.minD;      // repulsion floor: without it two nodes that start
                           // close get flung apart at hundreds of units a frame
    const MAX_V = SIM.maxV;       // per-axis speed cap, so nothing can ever explode
    const grid = new Map();
    for (let i = 0; i < ns.length; i++) {
      const gx = Math.round(ns[i].x / cell), gy = Math.round(ns[i].y / cell);
      const key = gx + ',' + gy;
      (grid.get(key) || grid.set(key, []).get(key)).push(i);
    }
    // repulsion, only against nearby cells — O(n) instead of O(n²)
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      const gx = Math.round(a.x / cell), gy = Math.round(a.y / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get((gx + dx) + ',' + (gy + dy));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j === i) continue;
          const b = ns[j];
          let ddx = a.x - b.x, ddy = a.y - b.y;
          let d2 = ddx * ddx + ddy * ddy;
          if (d2 < 1e-6) { ddx = Math.random() - .5; ddy = Math.random() - .5; d2 = 0.25; }
          if (d2 > cell * cell * 4) continue;
          const d = Math.sqrt(d2);
          const dc = Math.max(d, MIN_D);           // clamped for the magnitude
          const f = (SIM.repel * k) / (dc * dc);         // unit direction × bounded magnitude
          a.vx += (ddx / d) * f; a.vy += (ddy / d) * f;
        }
      }
    }
    /* Spring attraction. Two guards matter here: the per-edge force is capped,
       and each endpoint's share is divided by its degree. Without the second,
       a hub with twenty edges accumulates twenty pulls in a single frame and
       slingshots across the canvas — that was the "spazzing", not repulsion. */
    for (const [i, j] of es) {
      const a = ns[i], b = ns[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = Math.max(-SIM.springCap, Math.min(SIM.springCap, (d - SIM.springLen) * SIM.springK)) * k;
      const ux = dx / d, uy = dy / d;
      const sa = 1 / (1 + Math.sqrt(a.deg) * 0.6);
      const sb = 1 / (1 + Math.sqrt(b.deg) * 0.6);
      a.vx += ux * f * sa; a.vy += uy * f * sa;
      b.vx -= ux * f * sb; b.vy -= uy * f * sb;
    }
    // Centering: a weak, distance-capped pull. The old one grew without bound
    // with distance, so outlying nodes were yanked at the middle.
    for (const n of ns) {
      const d = Math.hypot(n.x, n.y) || 1;
      const pull = Math.min(d, 700) * SIM.centre * k;
      n.vx -= (n.x / d) * pull;
      n.vy -= (n.y / d) * pull;
      n.vx = Math.max(-MAX_V, Math.min(MAX_V, n.vx * SIM.damp));
      n.vy = Math.max(-MAX_V, Math.min(MAX_V, n.vy * SIM.damp));
      n.x += n.vx; n.y += n.vy;
    }
    graph.alpha *= SIM.decay;
  }
  return true;
}

/* Two ways to draw. `tick` runs while the layout is still settling; once it
   stops moving the loop ends and nothing is drawn until something actually
   changes. The old loop ran requestAnimationFrame forever — redrawing an
   unchanging picture at 60fps, which on a phone that has the site installed is
   pure battery burn for no visible difference. */
function tick() {
  const moving = step();
  drawGraph();
  graph.raf = moving ? requestAnimationFrame(tick) : 0;
}

let idleTimer = 0;
function markInteracting() {
  graph.interacting = true;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { graph.interacting = false; needsDraw(); }, 180);
}

function needsDraw() {
  if (graph.raf || graph.dirty) return;      // already scheduled
  graph.dirty = true;
  requestAnimationFrame(() => { graph.dirty = false; drawGraph(); });
}

/* Neighbourhood of one node: a single O(edges) pass, run on selection rather
   than on every frame. */
function neighbourhood(i) {
  const nbr = new Set(), selEdges = [];
  for (let e = 0; e < graph.edges.length; e++) {
    const [a, b] = graph.edges[e];
    if (a === i) { nbr.add(b); selEdges.push(e); }
    else if (b === i) { nbr.add(a); selEdges.push(e); }
  }
  return { nbr, selEdges };
}

/* Nudge a node into the visible area, keeping clear of the selection card.
   Without this, walking to a link in the card is silent when the target happens
   to be off-screen or behind the card — you click a name and nothing appears to
   happen. Pan only, never zoom: changing the scale under someone mid-exploration
   loses their sense of where they were. */
function panIntoView(i) {
  const cv = $('gcanvas');
  const w = cv.clientWidth || 800, h = cv.clientHeight || 600;
  const n = graph.nodes[i];
  const sx = w / 2 + graph.ox + n.x * graph.scale;
  const sy = h / 2 + graph.oy + n.y * graph.scale;
  const narrow = w <= 860;
  const pad = 70;
  const left = pad, right = w - (narrow ? pad : 300);
  const top = pad, bottom = h - (narrow ? h * 0.46 : pad);
  let dx = 0, dy = 0;
  if (sx < left) dx = left - sx; else if (sx > right) dx = right - sx;
  if (sy < top) dy = top - sy; else if (sy > bottom) dy = bottom - sy;
  if (dx || dy) { graph.ox += dx; graph.oy += dy; }
}

function selectGraphNode(i) {
  if (i < 0 || i >= graph.nodes.length) return clearGraphSelection();
  graph.sel = i;
  const { nbr, selEdges } = neighbourhood(i);
  graph.nbr = nbr; graph.selEdges = selEdges;
  renderGraphCard();
  panIntoView(i);
  needsDraw();
}

function clearGraphSelection() {
  graph.sel = -1; graph.nbr = null; graph.selEdges = null;
  const card = $('gsel');
  card.hidden = true; card.innerHTML = '';
  needsDraw();
}

/* The selection card is the graph's answer to the relations ledger: clicking a
   note tells you about it instead of navigating away from it, and its links are
   themselves clickable so the graph can be walked without ever leaving. */
function renderGraphCard() {
  const card = $('gsel');
  const n = graph.nodes[graph.sel];
  if (!n) { card.hidden = true; return; }
  // Carry the index alongside the node — looking it up again with indexOf would
  // be an O(nodes) scan per link, which at 40k notes is not free.
  const links = [...graph.nbr]
    .map((j) => ({ i: j, n: graph.nodes[j] }))
    .sort((a, b) => b.n.deg - a.n.deg || a.n.name.localeCompare(b.n.name));
  const shown = links.slice(0, 40);
  const folder = n.p.split('/').slice(0, -1).join('/');

  card.hidden = false;
  card.innerHTML =
    `<div class="gsel-head">
       <strong>${escapeHtml(n.name)}</strong>
       <button class="iconbtn gsel-x" aria-label="Clear selection">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
       </button>
     </div>
     <p class="gsel-path muted">${escapeHtml(folder)}</p>
     <p><a class="gsel-open" href="#/${encodeURI(n.p)}">Open the note →</a></p>
     <p class="gsel-count muted">${links.length} link${links.length === 1 ? '' : 's'}${
       n.type ? ` · ${escapeHtml(n.type)}` : ''}</p>` +
    (links.length
      ? `<ul class="gsel-links">` + shown.map((m) =>
          `<li><button type="button" data-i="${m.i}">${escapeHtml(m.n.name)}</button></li>`
        ).join('') +
        (links.length > shown.length
          ? `<li class="muted gsel-more">…and ${links.length - shown.length} more</li>` : '') +
        `</ul>`
      : '<p class="muted">Nothing links here.</p>');

  card.querySelector('.gsel-x').onclick = clearGraphSelection;
  card.querySelectorAll('.gsel-links button').forEach((b) => {
    b.onclick = () => selectGraphNode(Number(b.dataset.i));
  });
  card.querySelector('.gsel-open').onclick = () => closeGraph();
}

function drawGraph() {
  const cv = $('gcanvas'), ctx = cv.getContext('2d');
  const dpr = devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.body);
  ctx.fillStyle = css.getPropertyValue('--bg') || '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 + graph.ox, h / 2 + graph.oy);
  ctx.scale(graph.scale, graph.scale);

  const { nodes: ns, edges: es } = graph;
  /* A selection outranks a hover, and unlike a hover it persists — so the
     neighbourhood comes from the cache rather than another sweep of the edges.
     A hover is transient enough to be worth one scan. */
  let focus = -1, near = null, focusEdges = null;
  if (graph.sel >= 0) {
    focus = graph.sel; near = graph.nbr; focusEdges = graph.selEdges;
  } else if (graph.hover >= 0) {
    focus = graph.hover;
    const nb = neighbourhood(focus);
    near = nb.nbr; focusEdges = nb.selEdges;
  }
  const filtering = graph.mute.size > 0;
  const lit = (i) => !filtering || !graph.mute.has(ns[i].slot);

  /* A full draw of the whole vault is ~130ms, which is fine for a one-off but
     makes a drag feel like mud. While the pointer is actually moving, a big
     graph draws a sampled sixth of its edges and skips the per-node surface
     ring; the full picture is redrawn the moment it stops. Structure stays
     legible throughout — it is detail that is deferred, not the shape. */
  const huge = es.length > 60000 || ns.length > 8000;
  const cheap = graph.interacting && huge;
  const edgeStep = cheap ? 6 : 1;

  ctx.lineWidth = 1 / graph.scale;
  ctx.strokeStyle = css.getPropertyValue('--rule') || '#ccc';
  ctx.globalAlpha = focus >= 0 ? 0.18 : (cheap ? 0.4 : 0.55);
  ctx.beginPath();
  for (let e = 0; e < es.length; e += edgeStep) {
    const [a, b] = es[e];
    if (filtering && !(lit(a) && lit(b))) continue;
    ctx.moveTo(ns[a].x, ns[a].y); ctx.lineTo(ns[b].x, ns[b].y);
  }
  ctx.stroke();
  if (focus >= 0) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css.getPropertyValue('--accent') || '#a33';
    ctx.lineWidth = 1.8 / graph.scale;
    ctx.beginPath();
    for (const e of focusEdges) {
      const [a, b] = es[e];
      ctx.moveTo(ns[a].x, ns[a].y); ctx.lineTo(ns[b].x, ns[b].y);
    }
    ctx.stroke();
    ctx.lineWidth = 1 / graph.scale;
  }

  ctx.globalAlpha = 1;
  const ink = css.getPropertyValue('--ink') || '#222';
  const surface = css.getPropertyValue('--bg') || '#fff';
  const pal = paletteNow();
  const dim = css.getPropertyValue('--muted').trim() || '#888';
  const accent = css.getPropertyValue('--accent').trim() || '#a33';
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i];
    const r = Math.min(10, 3 + Math.sqrt(n.deg) * 1.3);
    const inFocus = focus < 0 || i === focus || near.has(i);
    ctx.globalAlpha = (inFocus ? 1 : 0.22) * (lit(i) ? 1 : 0.15);
    // 2px surface ring so overlapping nodes stay separable — the first thing
    // worth dropping mid-drag, since it doubles the arc count
    if (!cheap) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 1.4 / graph.scale, 0, Math.PI * 2);
      ctx.fillStyle = surface;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = i === graph.sel ? accent : (n.slot >= 0 ? pal[n.slot] : dim);
    ctx.fill();
    if (i === focus || (near && near.has(i))) {
      ctx.lineWidth = (i === focus ? 2.6 : 1.8) / graph.scale;
      ctx.strokeStyle = i === focus ? accent : ink;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  /* Selective labels: the best-connected notes, plus the whole neighbourhood of
     whatever is focused. Labelling everything turns a dense graph into a wall of
     overlapping text — zooming in reveals progressively more.

     Focused labels get a background chip, the same trick the relations web uses:
     a bare name is unreadable once it crosses three or four edges, and the
     neighbourhood is exactly the text the reader is trying to read. */
  const fontPx = Math.max(9.5, 12 / graph.scale);
  ctx.font = `${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const area = (cv.clientWidth || 800) * (cv.clientHeight || 600);
  const budget = Math.round(Math.max(7, Math.min(34, area / 26000)) * Math.max(1, graph.scale));

  const cand = [];
  for (let i = 0; i < ns.length; i++) {
    if (focus >= 0 && !(i === focus || near.has(i))) continue;
    if (!lit(i)) continue;
    cand.push(i);
  }
  // Best-connected first, so the names that matter win a contested spot
  cand.sort((a, b) => (a === focus ? -1 : b === focus ? 1 : ns[b].deg - ns[a].deg));

  const placed = [];
  const pad = 2 / graph.scale;
  let drawn = 0;
  for (const i of cand) {
    if (focus < 0 && drawn >= budget) break;
    const n = ns[i];
    const w = ctx.measureText(n.name).width;
    const h = fontPx;
    const x = n.x - w / 2, y = n.y - Math.min(11, 4 + Math.sqrt(n.deg) * 1.3) - 3 - h;
    // skip anything that would sit on top of a label already drawn
    let clash = false;
    for (const r of placed) {
      if (x - pad < r.x + r.w && x + w + pad > r.x && y - pad < r.y + r.h && y + h + pad > r.y) { clash = true; break; }
    }
    if (clash) continue;
    placed.push({ x, y, w, h });
    if (focus >= 0) {
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = surface;
      ctx.fillRect(x - pad * 1.5, y - pad, w + pad * 3, h + pad * 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = i === focus ? accent : ink;
    ctx.fillText(n.name, n.x, y + h);
    drawn++;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function graphPointer(ev) {
  const cv = $('gcanvas'), r = cv.getBoundingClientRect();
  const x = (ev.clientX - r.left - r.width / 2 - graph.ox) / graph.scale;
  const y = (ev.clientY - r.top - r.height / 2 - graph.oy) / graph.scale;
  let best = -1, bd = 14 / graph.scale;
  graph.nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

/* Zoom about a screen point rather than the canvas centre, so pinching or
   scrolling keeps whatever is under the fingers/cursor in place. */
function zoomAt(sx, sy, factor) {
  const r = $('gcanvas').getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const wx = (sx - cx - graph.ox) / graph.scale;
  const wy = (sy - cy - graph.oy) / graph.scale;
  const next = Math.max(0.06, Math.min(6, graph.scale * factor));
  graph.scale = next;
  graph.ox = sx - cx - wx * next;
  graph.oy = sy - cy - wy * next;
  needsDraw();
}

function initGraphEvents() {
  const cv = $('gcanvas');
  // Every active pointer is tracked, because a phone needs two of them: one
  // finger pans or holds, two pinch to zoom.
  const pts = new Map();
  let moved = 0, holdTimer = 0, held = false, pinchD = 0;
  const TOUCH_SLOP = 16;   // a finger jitters far more than a mouse

  const cancelHold = () => { clearTimeout(holdTimer); holdTimer = 0; };
  const centre = () => {
    let x = 0, y = 0;
    for (const q of pts.values()) { x += q.x; y += q.y; }
    return { x: x / pts.size, y: y / pts.size };
  };
  const spread = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2) {          // second finger down: start pinching
      cancelHold();
      held = false; graph.hover = -1;
      pinchD = spread();
      return;
    }
    if (pts.size > 2) { cancelHold(); return; }

    moved = 0; held = false;
    const sx = e.clientX, sy = e.clientY;
    cancelHold();
    holdTimer = setTimeout(() => {
      if (moved < TOUCH_SLOP && pts.size === 1) {
        const i = graphPointer({ clientX: sx, clientY: sy });
        if (i >= 0) {
          held = true;
          graph.hover = i;
          needsDraw();
          if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) {} }
        }
      }
    }, 300);
  });

  cv.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'touch') return;
      const h = graphPointer(e);                       // mouse hover
      if (h !== graph.hover) { graph.hover = h; needsDraw(); }
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;

    if (pts.size >= 2) {                    // pinch: scale by finger spread
      const d = spread();
      if (pinchD > 0 && d > 0) {
        const c = centre();
        zoomAt(c.x, c.y, d / pinchD);
      }
      pinchD = d;
      markInteracting();
      needsDraw();
      return;
    }

    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > TOUCH_SLOP) cancelHold();
    if (!held) { graph.ox += dx; graph.oy += dy; markInteracting(); needsDraw(); }   // holding inspects, never pans
  });

  const release = (e) => {
    const wasPinching = pts.size >= 2;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchD = 0;
    if (pts.size > 0 || wasPinching) { cancelHold(); return; }  // ignore the tail of a pinch

    cancelHold();
    if (held) { held = false; graph.hover = -1; needsDraw(); return; }   // release ends the preview
    if (moved < 8) {
      /* A tap selects and explains; it does not navigate. Opening the note was
         the old behaviour and it made the graph almost unusable for browsing —
         one stray tap and you had left the graph entirely, losing the layout,
         the scope you picked and where you were looking. Double-tap still
         opens, and so does the link in the selection card. */
      const i = graphPointer(e);
      if (i >= 0) selectGraphNode(i); else clearGraphSelection();
    }
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchD = 0;
    cancelHold();
    if (!pts.size) { held = false; graph.hover = -1; }
  });
  // Stop iOS turning a long press into a selection callout, which cancels the
  // pointer stream and kills the hold.
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    markInteracting();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  /* Double-tap opens the note when it lands on one, and otherwise zooms a step
     in, anchored where you tapped. Splitting it this way is what lets a single
     tap be free to mean "tell me about this". */
  let lastTap = 0, lastX = 0, lastY = 0;
  cv.addEventListener('pointerup', (e) => {
    if ($('graphView').hidden) { lastTap = 0; return; }
    const now = Date.now();
    if (now - lastTap < 300 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 30) {
      const i = graphPointer(e);
      if (i >= 0) {
        location.hash = '#/' + encodeURI(graph.nodes[i].p);
        closeGraph();
      } else {
        zoomAt(e.clientX, e.clientY, 1.6);
      }
      lastTap = 0;
    } else { lastTap = now; lastX = e.clientX; lastY = e.clientY; }
  });
}

function setPanel(open) {
  $('graphView').classList.toggle('collapsed', !open);
  $('gExpand').hidden = open;
}
function openGraph() {
  $('graphView').hidden = false;
  $('graphBtn').setAttribute('aria-pressed', 'true');
  setPanel(true);
  buildScopeUI();
}
function closeGraph() {
  $('graphView').hidden = true;
  $('graphBtn').setAttribute('aria-pressed', 'false');
  cancelAnimationFrame(graph.raf);
  graph.raf = 0;
  clearGraphSelection();
}

/* ------------------------------------------------------------ relations web
   A note carrying `view: relations` in its frontmatter has its diplomacy table
   redrawn as a force-directed web, in place, above the table it came from.

   The markdown table stays the single source of truth — it is what Obsidian
   and GitHub render, and it is what this parses — so adding a row to the note
   adds an edge here with no code change and nothing to keep in sync by hand.

   Eight standings is far past what hue alone can carry, and measurably so: to
   normal vision the warm four are comfortably apart, but simulate deuteranopia
   and trade/friction/territorial/hostile collapse into each other — friction
   and territorial sit at ΔE 9.2 normally and 0.6 under CVD. That is not a
   palette that can be fixed by picking better oranges; four warm categories
   simply do not survive red-green colour blindness. So the dash patterns and
   stroke weights below are load-bearing rather than decorative, and the legend,
   tags and ledger all name the standing in words. Colour is the last of four
   cues here, never the only one.

   Line style also carries valence: the three standings that are warm or
   neutral are solid, weighted by how strong the bond is, and every negative
   standing is broken. Where two encodings do sit close — Allied and Friendly
   are both solid greens — they are deliberately neighbours in meaning, so
   mistaking one for the other costs almost nothing. */
const STANDINGS = [
  ['allied', 'Allied'], ['friendly', 'Friendly'], ['trade', 'Trade'],
  ['rivalry', 'Rivalry'], ['friction', 'Friction'], ['territorial', 'Territorial'],
  ['hostile', 'Hostile'], ['covert', 'Covert'],
];
const STANDING_LABEL = new Map(STANDINGS);
const WARM = new Set(['allied', 'friendly', 'trade']);
const DASH = {
  allied: '', friendly: '', trade: '', rivalry: '7 5', friction: '2 5',
  territorial: '13 4', hostile: '5 4', covert: '1.5 8',
};
const STROKE = {
  allied: 3.2, friendly: 2.1, trade: 1.3, rivalry: 1.9, friction: 2.0,
  territorial: 3.0, hostile: 3.2, covert: 1.6,
};

/* Rest length per standing, so the layout itself carries the argument rather
   than just colouring one someone else made: allies and trading partners
   settle close together, territorial and hostile pairs are shoved apart. The
   trade web ends up holding the middle and the flashpoints splay to the rim. */
const REST = {
  allied: 140, friendly: 158, trade: 178, rivalry: 226, friction: 250,
  territorial: 310, hostile: 335, covert: 268,
};
/* Retuned when the board went from 21 nations / 79 ties to 27 / 108: at that
   density the springs overwhelmed repulsion and the middle of the web closed
   into a knot. Repulsion and the rest lengths both go up together, because the
   whole thing is rescaled to fit afterwards — it is the RATIO that decides how
   much clear space a node ends up with, not the absolute numbers. Retuned again
   at 28 nations / 113 ties: minGap had drifted back down to ~22px. */
const RSIM = { repel: 26000, centre: 0.0026, spring: 0.05, damp: 0.82, pad: 54 };
const RVIEW = { w: 1120, h: 780 };
const SVGNS = 'http://www.w3.org/2000/svg';

/* ---- the same web, laid over the world map -------------------------------
   An optional second mode: instead of the force layout deciding where nations
   sit, pin each one to where it actually is on `campaign/Saeroth.map`, so the
   ties read as trade routes and borders rather than as an abstract graph.

   Both halves of it are GENERATED — `tools/map_backdrop.js` writes
   `nation-positions.json` and the backdrop image out of the .map file itself —
   so when the map is rebuilt, rerunning that script moves the nodes with it.
   Nothing here is hand-placed, and nothing about the force layout changed:
   `web` is still the default and still the mode this note opens in. Deleting
   the toggle, the JSON and the image removes the whole feature again. */
const RMAP = {
  data: null,          // null = not tried, false = unavailable, else the JSON
  w: 1120,             // the map is drawn into the same width as the web
  h: 780,              // recomputed from the map's own aspect once loaded
  scale: 1,
  labelScale: 9.5 / 11.5,   // names shrink with the dots they belong to
};

async function loadMapPositions() {
  if (RMAP.data !== null) return RMAP.data;
  try {
    const d = await (await fetch(BASE + 'nation-positions.json')).json();
    if (!d || !d.nations || !d.width) throw new Error('malformed');
    RMAP.scale = RMAP.w / d.width;
    RMAP.h = Math.round(d.height * RMAP.scale);
    RMAP.data = d;
  } catch (_) {
    RMAP.data = false;   // no map on this deploy: the toggle simply never appears
  }
  return RMAP.data;
}

const rel = { nodes: [], edges: [], sel: null, active: new Set(), themes: new Map(), mode: 'web' };
window.__rel = rel;   // exposed for automated UI tests, like window.__g

function svgEl(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

/* Label widths are measured on a canvas rather than read back with getBBox:
   getBBox needs the node laid out in the document, and the web is built while
   the article is still being assembled offscreen. */
const LABEL_FONT = '600 11.5px system-ui, -apple-system, "Segoe UI", sans-serif';
let _mctx = null;
function labelWidth(s) {
  if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
  _mctx.font = LABEL_FONT;
  return _mctx.measureText(s).width;
}

/* Rows look like `| [[A]] ↔ [[B]] | **Standing** | prose |`. Anything that is
   not two wikilinks plus a known standing is skipped, which is what keeps the
   note's own legend table (| Label | Means |) out of the graph. */
function parseRelations(body) {
  const byName = new Map();
  const edges = [];
  const node = (name) => {
    let n = byName.get(name);
    if (!n) byName.set(name, (n = { name, deg: 0, ties: [], x: 0, y: 0, vx: 0, vy: 0, r: 0 }));
    return n;
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line[0] !== '|') continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 2) continue;
    const pair = [...cells[0].matchAll(/\[\[([^\]|#]+)[^\]]*\]\]/g)].map((m) => m[1].trim());
    if (pair.length !== 2 || pair[0] === pair[1]) continue;
    const standing = cells[1].replace(/\*+/g, '').trim().toLowerCase();
    if (!STANDING_LABEL.has(standing)) continue;
    const a = node(pair[0]), b = node(pair[1]);
    const e = { a, b, standing, desc: cells[2] || '' };
    a.deg++; b.deg++; a.ties.push(e); b.ties.push(e);
    edges.push(e);
  }
  const nodes = [...byName.values()];
  /* Two radii, because the two modes are drawn at different densities. On the
     map a node has to sit INSIDE its own country — Tessine is 81 cells — so the
     dot shrinks to a pin. In the web it is the only thing on the canvas and can
     afford to carry its degree at a glance. */
  for (const n of nodes) {
    n.rWeb = 12 + Math.min(n.deg, 6) * 2.4;
    n.rMap = 2.6 + Math.min(n.deg, 12) * 0.42;
    n.r = n.rWeb;
  }
  return { nodes, edges };
}

/* Seeded, so the same note lays out the same way on every visit. A random seed
   would redraw differently each time it is opened and nothing about the shape
   would ever become familiar. */
function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function relaxRelations(nodes, edges, iters, frozen) {
  const { w, h } = RVIEW;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = 1; dy = 0.3; d2 = 1.09; }
        const d = Math.sqrt(d2), f = RSIM.repel / d2;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      a.vx += (w / 2 - a.x) * RSIM.centre;
      a.vy += (h / 2 - a.y) * RSIM.centre;
    }
    /* Each endpoint's pull is divided by its degree, the same guard the graph
       view uses. Without it a hub like the Merchant Alliance accumulates a
       dozen pulls per frame and drags its partners into a knot on top of it —
       which is exactly what happened when the table grew from 32 ties to 69. */
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d - REST[e.standing]) * RSIM.spring;
      const sa = 1 / (1 + Math.sqrt(e.a.deg) * 0.55);
      const sb = 1 / (1 + Math.sqrt(e.b.deg) * 0.55);
      e.a.vx += (dx / d) * f * sa; e.a.vy += (dy / d) * f * sa;
      e.b.vx -= (dx / d) * f * sb; e.b.vy -= (dy / d) * f * sb;
    }
    for (const n of nodes) {
      if (n === frozen) { n.vx = n.vy = 0; continue; }
      n.vx *= RSIM.damp; n.vy *= RSIM.damp;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.min(w - RSIM.pad - n.r, Math.max(RSIM.pad + n.r, n.x));
      n.y = Math.min(h - RSIM.pad - n.r, Math.max(RSIM.pad + n.r, n.y));
    }
  }
}

/* The forces decide where nations sit relative to each other; this decides how
   much of the frame that arrangement gets to use. Settling alone reliably
   leaves a clump in the middle with a third of the canvas empty, and the answer
   is not more force tuning — scale the settled result out to the edges instead.
   Uniform, so every distance the layout argued for is preserved in proportion. */
function fitRelations() {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of rel.nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  // Asymmetric on purpose: every node carries a label underneath it, and the
  // bottom strip belongs to the hint line.
  const padX = 78, padTop = 62, padBottom = 112;
  const s = Math.min((RVIEW.w - padX * 2) / Math.max(1, maxX - minX),
                     (RVIEW.h - padTop - padBottom) / Math.max(1, maxY - minY));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const midY = padTop + (RVIEW.h - padTop - padBottom) / 2;
  for (const n of rel.nodes) {
    n.x = RVIEW.w / 2 + (n.x - cx) * s;
    n.y = midY + (n.y - cy) * s;
    n.vx = n.vy = 0;
  }
}

function chipSwatch(k) {
  return `<svg class="rel-sw" viewBox="0 0 28 10" aria-hidden="true"><line x1="1" y1="5" x2="27" y2="5"
    stroke="var(--rel-${k})" stroke-width="${STROKE[k]}" stroke-linecap="round"
    ${DASH[k] ? `stroke-dasharray="${DASH[k]}"` : ''}/></svg>`;
}

function mountRelations(container, body) {
  const { nodes, edges } = parseRelations(body);
  if (edges.length < 2) return;
  rel.nodes = nodes; rel.edges = edges; rel.sel = null;
  rel.active = new Set(STANDINGS.map(([k]) => k));

  const rand = mulberry32(0x5AE407);
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    const r = 180 + rand() * 95;
    n.x = RVIEW.w / 2 + Math.cos(a) * r;
    n.y = RVIEW.h / 2 + Math.sin(a) * r;
    n.vx = n.vy = 0;
  });
  relaxRelations(nodes, edges, 520, null);
  fitRelations();
  for (const n of nodes) { n.wx = n.x; n.wy = n.y; }   // the web's own layout, kept

  const counts = new Map(STANDINGS.map(([k]) => [k, 0]));
  for (const e of edges) counts.set(e.standing, counts.get(e.standing) + 1);

  const fig = document.createElement('figure');
  fig.className = 'relweb';
  fig.innerHTML = `
    <div class="rel-controls" role="group" aria-label="Filter ties by standing">
      ${STANDINGS.filter(([k]) => counts.get(k)).map(([k, label]) =>
        `<button type="button" class="rel-chip" data-k="${k}" aria-pressed="true">
           ${chipSwatch(k)}<span>${label}</span><span class="muted">${counts.get(k)}</span>
         </button>`).join('')}
      <button type="button" class="rel-reset linkbtn">Reset</button>
      <button type="button" class="rel-mode linkbtn" hidden aria-pressed="false">On the map</button>
    </div>
    <div class="rel-board">
      <div class="rel-canvas">
        <svg class="rel-svg" viewBox="0 0 ${RVIEW.w} ${RVIEW.h}" role="img"
             aria-label="Web of ${edges.length} diplomatic ties between ${nodes.length} nations">
          <image class="rel-basemap" hidden preserveAspectRatio="none"></image>
          <g class="rel-edges"></g><g class="rel-nodes"></g>
        </svg>
        <p class="rel-hint muted">Tap a nation for its ties · drag to untangle · double-tap opens its note</p>
      </div>
      <aside class="rel-ledger" aria-live="polite"></aside>
    </div>
    <figcaption>Distance is an argument, not decoration: the warmer the
      standing the closer the pull, so allies sit tightest and territorial and
      hostile pairs are pushed to the rim. Solid lines are warm or neutral
      standings, weighted by the strength of the bond; every broken line is a
      grievance.</figcaption>`;

  // Sit the web directly above the table it was read from, and fold that table
  // away — it is still the source of truth and still fully readable, it just no
  // longer needs to be the first thirty rows you scroll past.
  container.classList.add('wide');
  const table = [...container.querySelectorAll('table')]
    .find((t) => /↔|<->/.test(t.textContent) && /\[\[|\w/.test(t.textContent));
  if (table) {
    // Go above the heading that introduces the table, not just above the table,
    // so the page doesn't read "The table" followed by a picture of a web.
    const prev = table.previousElementSibling;
    const anchor = prev && /^H[2-4]$/.test(prev.tagName) ? prev : table;
    anchor.parentNode.insertBefore(fig, anchor);
    const det = document.createElement('details');
    det.className = 'relsource';
    det.innerHTML = `<summary>The ${edges.length} rows this is read from</summary>`;
    table.parentNode.insertBefore(det, table);
    det.appendChild(table);
  } else {
    container.appendChild(fig);
  }

  buildRelSvg(fig);
  wireRelations(fig);
  renderRelLedger(fig);
  loadNationThemes(fig);
  offerMapMode(fig);
}

/* The toggle only exists if the generated positions do. An older deploy, or a
   service worker still holding the previous shell, simply gets the web. */
async function offerMapMode(fig) {
  const d = await loadMapPositions();
  if (!d) return;
  const missing = rel.nodes.filter((n) => !d.nations[n.name]);
  // one or two nations off the map is survivable — they drop out of map mode
  // and say so. Half of them missing means the JSON is stale, and a map with
  // holes in it is worse than no map.
  if (missing.length > rel.nodes.length / 4) return;
  fig.querySelector('.rel-mode').hidden = false;
}

/* Switch the same nodes and the same edges between the two layouts. Nothing is
   rebuilt: only positions, radii and the backdrop change. */
function applyRelMode(fig) {
  const map = rel.mode === 'map' && RMAP.data;
  const svg = fig.querySelector('.rel-svg');
  const img = fig.querySelector('.rel-basemap');
  const hint = fig.querySelector('.rel-hint');

  fig.classList.toggle('mapmode', !!map);
  svg.setAttribute('viewBox', map ? `0 0 ${RMAP.w} ${RMAP.h}` : `0 0 ${RVIEW.w} ${RVIEW.h}`);

  if (map) {
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', BASE + RMAP.data.image);
    img.setAttribute('href', BASE + RMAP.data.image);
    img.setAttribute('x', 0); img.setAttribute('y', 0);
    img.setAttribute('width', RMAP.w); img.setAttribute('height', RMAP.h);
    img.hidden = false;
    for (const n of rel.nodes) {
      const p = RMAP.data.nations[n.name];
      n.offmap = !p;
      n.r = n.rMap;
      if (p) { n.x = p[0] * RMAP.scale; n.y = p[1] * RMAP.scale; }
    }
  } else {
    img.hidden = true;
    for (const n of rel.nodes) {
      n.offmap = false;
      n.r = n.rWeb;
      n.x = n.wx; n.y = n.wy;
    }
  }
  for (const n of rel.nodes) {
    n.el.classList.toggle('offmap', !!n.offmap);
    n.circle.setAttribute('r', n.r);
  }
  for (const e of rel.edges) e.el.classList.toggle('offmap', !!(e.a.offmap || e.b.offmap));

  const btn = fig.querySelector('.rel-mode');
  btn.textContent = map ? 'As a web' : 'On the map';
  btn.setAttribute('aria-pressed', map ? 'true' : 'false');
  if (hint) {
    hint.textContent = map
      ? 'Every nation sits where it does on the world map · tap for its ties · double-tap opens its note'
      : 'Tap a nation for its ties · drag to untangle · double-tap opens its note';
  }
  placeRelLabels();
}

function buildRelSvg(fig) {
  const eLayer = fig.querySelector('.rel-edges');
  const nLayer = fig.querySelector('.rel-nodes');
  eLayer.textContent = ''; nLayer.textContent = '';

  for (const e of rel.edges) {
    e.el = svgEl('line', {
      class: 'rel-edge s-' + e.standing,
      'stroke-width': STROKE[e.standing],
      'stroke-linecap': DASH[e.standing] ? 'round' : 'butt',
      x1: e.a.x, y1: e.a.y, x2: e.b.x, y2: e.b.y,
    });
    if (DASH[e.standing]) e.el.setAttribute('stroke-dasharray', DASH[e.standing]);
    eLayer.appendChild(e.el);
  }

  for (const n of rel.nodes) {
    const g = svgEl('g', {
      class: 'rel-node', tabindex: '0', role: 'button',
      'aria-label': `${n.name}, ${n.deg} relationship${n.deg === 1 ? '' : 's'}`,
    });
    n.circle = svgEl('circle', { class: 'rel-dot', cx: n.x, cy: n.y, r: n.r });
    n.bg = svgEl('rect', { class: 'rel-labelbg', rx: 3 });
    n.label = svgEl('text', { class: 'rel-label', 'text-anchor': 'middle' });
    n.label.textContent = n.name;
    g.append(n.circle, n.bg, n.label);
    nLayer.appendChild(g);
    n.el = g;
  }
  placeRelLabels();
}

/* Labels sit under their node by default and flip above when that would land
   on one already placed — nation names are far wider than the dots they belong
   to, so without this the crowded middle of the web reads as one run-on word.
   Best-connected first, so the names that matter keep the natural position. */
function placeRelLabels() {
  const placed = [];
  const hits = (r) => placed.some((p) =>
    r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);

  for (const n of rel.nodes) {
    n.circle.setAttribute('cx', n.x);
    n.circle.setAttribute('cy', n.y);
  }
  const ls = rel.mode === 'map' ? RMAP.labelScale : 1;
  for (const n of [...rel.nodes].sort((a, b) => b.deg - a.deg)) {
    const w = labelWidth(n.name) * ls;
    const rect = (y) => ({ x: n.x - w / 2 - 3, y: y - 9.5 * ls, w: w + 6, h: 13 * ls });
    const below = n.y + n.r + 13 * ls, above = n.y - n.r - 6 * ls;
    const y = (hits(rect(below)) && !hits(rect(above))) ? above : below;
    const r = rect(y);
    placed.push(r);
    n.label.setAttribute('x', n.x); n.label.setAttribute('y', y);
    n.bg.setAttribute('x', r.x); n.bg.setAttribute('y', r.y);
    n.bg.setAttribute('width', r.w); n.bg.setAttribute('height', r.h);
  }
  for (const e of rel.edges) {
    e.el.setAttribute('x1', e.a.x); e.el.setAttribute('y1', e.a.y);
    e.el.setAttribute('x2', e.b.x); e.el.setAttribute('y2', e.b.y);
  }
}

function applyRelFilter() {
  for (const e of rel.edges) e.el.classList.toggle('off', !rel.active.has(e.standing));
  for (const n of rel.nodes) {
    const live = n.ties.some((t) => rel.active.has(t.standing));
    n.el.classList.toggle('off', !live && !rel.sel);
  }
}

function selectRelNode(fig, node) {
  rel.sel = node;
  for (const n of rel.nodes) n.el.classList.remove('sel', 'near', 'far');
  for (const e of rel.edges) e.el.classList.remove('lit', 'dim');
  if (node) {
    node.el.classList.add('sel');
    const near = new Set();
    for (const t of node.ties) {
      const other = t.a === node ? t.b : t.a;
      near.add(other);
      t.el.classList.add('lit');
    }
    for (const e of rel.edges) if (!e.el.classList.contains('lit')) e.el.classList.add('dim');
    for (const n of rel.nodes) {
      if (n === node) continue;
      n.el.classList.add(near.has(n) ? 'near' : 'far');
    }
  }
  applyRelFilter();
  renderRelLedger(fig);
}

/* The default panel is derived, not written down: it re-reads the parsed rows
   every time, so it stays true when the table changes. */
function relOverview() {
  const count = (n, pred) => n.ties.filter(pred).length;
  const maxDeg = Math.max(...rel.nodes.map((n) => n.deg));
  const busiest = rel.nodes.filter((n) => n.deg === maxDeg)
    .sort((a, b) => a.name.localeCompare(b.name));
  const terr = rel.nodes
    .map((n) => ({ n, c: count(n, (t) => t.standing === 'territorial') }))
    .sort((a, b) => b.c - a.c)[0];
  // Deliberately a high bar: at three ties "no friends" is common enough to be
  // noise, and listing six nations buries the one or two that actually stand out.
  const friendless = rel.nodes
    .filter((n) => n.deg >= 4 && !n.ties.some((t) => WARM.has(t.standing)))
    .sort((a, b) => b.deg - a.deg || a.name.localeCompare(b.name));
  // Specifically trade, not warmth generally — this sentence is about who the
  // shipping runs through, and Thesal is well liked without moving cargo.
  const anchors = rel.nodes
    .map((n) => ({ n, c: count(n, (t) => t.standing === 'trade') }))
    .sort((a, b) => b.c - a.c || a.n.name.localeCompare(b.n.name))
    .filter((x) => x.c >= 3).slice(0, 2);

  const names = (list) => list.map((n) => `<strong>${escapeHtml(n.name)}</strong>`)
    .join(list.length === 2 ? ' and ' : ', ');

  const out = ['<h3>Reading the board</h3>'];
  out.push(`<p>${names(busiest)} ${busiest.length > 1 ? 'each carry' : 'carries'} ` +
    `the most ties here — ${maxDeg} ${busiest.length > 1 ? 'apiece' : 'of them'}.</p>`);
  if (terr && terr.c >= 3) {
    out.push(`<p><strong>${escapeHtml(terr.n.name)}</strong> is the pressure source: ` +
      `${terr.c} territorial borders, more than anyone else. Most land wars start there.</p>`);
  }
  if (friendless.length) {
    out.push(`<p>${names(friendless)} ${friendless.length > 1 ? 'have' : 'has'} nothing warmer ` +
      `than a rivalry on the board — no ally, no friend, not one trading partner.</p>`);
  }
  if (anchors.length === 2) {
    out.push(`<p>${names(anchors.map((x) => x.n))} anchor the trade web, which is why the ` +
      `layout pulls them inward and they stay clear of most fights.</p>`);
  }
  out.push('<p class="muted rel-cta">Tap any nation in the web for its full ledger.</p>');
  return out.join('');
}

function renderRelLedger(fig) {
  const box = fig.querySelector('.rel-ledger');
  const n = rel.sel;
  if (!n) { box.innerHTML = relOverview(); return; }

  const order = STANDINGS.map(([k]) => k);
  const ties = [...n.ties].sort((a, b) =>
    order.indexOf(a.standing) - order.indexOf(b.standing));
  const path = resolveTarget(n.name);
  const theme = rel.themes.get(n.name);

  box.innerHTML =
    `<h3>${escapeHtml(n.name)}</h3>` +
    (theme ? `<p class="rel-theme muted">${escapeHtml(theme)}</p>` : '') +
    (path ? `<p><a class="rel-open" href="#/${encodeURI(path)}">Open the note →</a></p>` : '') +
    `<ul class="rel-ties">` + ties.map((t) => {
      const other = t.a === n ? t.b : t.a;
      return `<li>
        <div class="rel-tie-h">
          <span class="rel-tag s-${t.standing}">${STANDING_LABEL.get(t.standing)}</span>
          <button type="button" class="rel-jump" data-to="${escapeHtml(other.name)}">${escapeHtml(other.name)}</button>
        </div>
        ${t.desc ? `<p class="muted">${escapeHtml(t.desc)}</p>` : ''}
      </li>`;
    }).join('') + `</ul>`;
}

function wireRelations(fig) {
  const svg = fig.querySelector('.rel-svg');

  fig.querySelectorAll('.rel-chip').forEach((btn) => {
    btn.onclick = () => {
      const k = btn.dataset.k;
      if (rel.active.has(k)) rel.active.delete(k); else rel.active.add(k);
      btn.setAttribute('aria-pressed', rel.active.has(k) ? 'true' : 'false');
      applyRelFilter();
    };
  });
  fig.querySelector('.rel-reset').onclick = () => {
    rel.active = new Set(STANDINGS.map(([k]) => k));
    fig.querySelectorAll('.rel-chip').forEach((b) => b.setAttribute('aria-pressed', 'true'));
    selectRelNode(fig, null);
  };
  fig.querySelector('.rel-mode').onclick = () => {
    rel.mode = rel.mode === 'map' ? 'web' : 'map';
    applyRelMode(fig);
    applyRelFilter();
    if (rel.sel) selectRelNode(fig, rel.sel);
  };
  fig.querySelector('.rel-ledger').addEventListener('click', (ev) => {
    const jump = ev.target.closest('.rel-jump');
    if (!jump) return;
    const target = rel.nodes.find((n) => n.name === jump.dataset.to);
    if (target) selectRelNode(fig, target);
  });

  /* Pointer handling. A press that does not travel is a select, one that does
     is a drag, and dragging re-settles everything except the node under the
     finger so the web reflows around it.

     Everything below is measured in SCREEN pixels and converted, because the
     two numbers that decide whether a tap works are both about a fingertip,
     and the SVG's own units are not. At a 390px viewport the web renders 1120
     viewBox units into about 355 real ones, so one viewBox unit is a third of
     a pixel: a 12-unit dot is a 7px target, and a 4-unit move threshold is
     just over a pixel of finger jitter. That combination is why selecting a
     nation on a phone took several attempts — the dot was too small to hit,
     and any hit that wobbled was read as a drag and selected nothing. */
  const TOUCH_R = 22;    // half a 44px target, the platform minimum
  // A press that travels less than this is still a tap. A finger jitters far
  // more than a mouse — the graph view has used 16 for touch since it was
  // written, and anything tighter turns an ordinary tap into a one-pixel drag
  // that selects nothing.
  const slopFor = (ev) => (ev.pointerType === 'touch' ? 16 : 5);
  const pt = svg.createSVGPoint();
  const toLocal = (ev) => {
    pt.x = ev.clientX; pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  };
  // viewBox units per screen pixel, live: the same web is 355px on a phone and
  // 1100 on a desktop, and in map mode the viewBox changes as well
  const perPx = () => {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return (r.width && vb && vb.width) ? vb.width / r.width : 1;
  };

  /* Nearest node within reach, rather than whatever the finger happened to
     land on. The drawn dot is not the target — a tap near a nation is a tap on
     it, which is also what stops a near miss falling through to the background
     and clearing the selection you were trying to make. */
  const nodeAt = (p) => {
    const scale = perPx();
    let best = null, bestD = Infinity;
    for (const n of rel.nodes) {
      if (n.offmap) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (!best) return null;
    // never reach so far that one tap could mean two different countries
    const reach = Math.min(Math.max(best.r + 4, TOUCH_R * scale), 90);
    return bestD <= reach ? best : null;
  };

  let drag = null, moved = false, start = null, lastTap = 0, held = null;

  svg.addEventListener('pointerdown', (ev) => {
    start = toLocal(ev);
    held = nodeAt(start);
    moved = false;
    drag = null;
    if (!held) return;
    // On the map a node is pinned to its own country, so there is nothing to
    // drag — don't capture the pointer or swallow the gesture, or a swipe that
    // starts on a nation stops the page scrolling under a thumb.
    if (rel.mode === 'map') return;
    drag = held;
    try { svg.setPointerCapture(ev.pointerId); } catch (_) { /* synthetic event */ }
    ev.preventDefault();
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!held) return;
    const p = toLocal(ev);
    const tol = slopFor(ev) * perPx();
    if (Math.abs(p.x - start.x) > tol || Math.abs(p.y - start.y) > tol) moved = true;
    if (!drag || !moved) return;
    drag.x = Math.min(RVIEW.w - 20, Math.max(20, p.x));
    drag.y = Math.min(RVIEW.h - 20, Math.max(20, p.y));
    relaxRelations(rel.nodes, rel.edges, 5, drag);
    for (const m of rel.nodes) { m.wx = m.x; m.wy = m.y; }   // the web keeps what you untangled
    placeRelLabels();
  });

  svg.addEventListener('pointerup', () => {
    const n = held, dragged = drag && moved;
    drag = null; held = null;
    if (dragged) return;
    if (!n) { selectRelNode(fig, null); return; }   // a tap on open canvas clears
    const now = Date.now();
    if (now - lastTap < 400 && rel.sel === n) {     // double-tap opens the note
      const path = resolveTarget(n.name);
      if (path) { location.hash = '#/' + encodeURI(path); return; }
    }
    lastTap = now;
    selectRelNode(fig, rel.sel === n ? null : n);
  });
  svg.addEventListener('pointercancel', () => { drag = null; held = null; });

  for (const n of rel.nodes) {
    n.el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        selectRelNode(fig, rel.sel === n ? null : n);
      }
    });
  }
}

/* Themes are a nicety, so this never blocks the web: if the index note moves or
   its table changes shape, the ledger simply renders without the subtitle. */
async function loadNationThemes(fig) {
  if (rel.themes.size) { renderRelLedger(fig); return; }
  const path = resolveTarget('Nations of the World');
  if (!path) return;
  try {
    const raw = await fetchNote(path);
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (t[0] !== '|') continue;
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (cells.length < 2) continue;
      const m = /\[\[([^\]|#]+)[^\]]*\]\]/.exec(cells[0]);
      if (!m) continue;
      const theme = cells[1].replace(/\*+/g, '').replace(/\s*\(new\)\s*/i, '').trim();
      if (theme) rel.themes.set(m[1].trim(), theme);
    }
    if (rel.sel) renderRelLedger(fig);
  } catch (_) { /* offline or moved: the ledger just has no subtitle */ }
}

/* ------------------------------------------------------------- trade routes
   A note carrying `view: routes` has its corridor table drawn on the world
   map: each route becomes a line through the nations it actually runs through,
   pinned to where those nations are.

   Same rule as the relations web — the markdown table is the single source of
   truth. A row is `| **Name** | Carried by | [[A]] → [[B]] → [[C]] | cargo |`,
   the run is read as an ordered list of wikilinks, and adding a stop to the
   note moves the line here with no code change. The `Carried by` column is
   what the note already had to say anyway, and it chooses the line style, so a
   sea lane and a caravan track do not read as the same kind of thing.

   Positions and the backdrop are the same generated pair the relations map
   mode uses; if they are missing this does nothing and the table stands. */
const CARRY = {
  sea:     { dash: '9 7',   width: 3.0 },
  caravan: { dash: '2 6',   width: 3.2 },
  road:    { dash: '',      width: 3.0 },
  river:   { dash: '11 4 2 4', width: 2.4 },
};
const ROUTE_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const routes = { list: [], sel: null };
window.__routes = routes;   // exposed for automated UI tests, like window.__rel

/* Rows look like `| **Name** | Road | [[A]] → [[B]] | what it carries |`.
   Anything without a name and at least two linked stops is skipped, which
   keeps the note's own prose tables out of the drawing. */
function parseRoutes(bodyText) {
  const out = [];
  for (const raw of bodyText.split(/\r?\n/)) {
    const line = raw.trim();
    if (line[0] !== '|') continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const name = cells[0].replace(/\*+/g, '').trim();
    const carry = cells[1].replace(/\*+/g, '').trim().toLowerCase();
    const stops = [...cells[2].matchAll(/\[\[([^\]|#]+)[^\]]*\]\]/g)].map((m) => m[1].trim());
    if (!name || stops.length < 2 || !CARRY[carry]) continue;
    out.push({ name, carry, stops, cargo: cells[3] || '', key: ROUTE_KEYS[out.length % ROUTE_KEYS.length] });
  }
  return out;
}

async function mountRoutes(container, bodyText) {
  const list = parseRoutes(bodyText);
  if (!list.length) return;
  const pos = await loadMapPositions();
  if (!pos) return;                       // no map on this deploy: table only
  const missing = list.filter((r) => r.stops.some((s) => !pos.nations[s]));
  if (missing.length === list.length) return;
  routes.list = list.filter((r) => r.stops.every((s) => pos.nations[s]));
  routes.sel = null;

  const P = (n) => [pos.nations[n][0] * RMAP.scale, pos.nations[n][1] * RMAP.scale];
  const stops = [...new Set(routes.list.flatMap((r) => r.stops))];

  const fig = document.createElement('figure');
  fig.className = 'routemap';
  fig.innerHTML = `
    <div class="rel-controls" role="group" aria-label="Show one corridor">
      ${routes.list.map((r) =>
        `<button type="button" class="rel-chip route-chip r-${r.key}" data-r="${escapeHtml(r.name)}"
                 aria-pressed="false"><span>${escapeHtml(r.name)}</span></button>`).join('')}
      <button type="button" class="rel-reset linkbtn">All of them</button>
    </div>
    <div class="rel-board">
      <div class="rel-canvas">
        <svg class="rel-svg route-svg" viewBox="0 0 ${RMAP.w} ${RMAP.h}" role="img"
             aria-label="The ${routes.list.length} trade corridors of Saeroth, drawn on the world map">
          <image class="rel-basemap" preserveAspectRatio="none"
                 x="0" y="0" width="${RMAP.w}" height="${RMAP.h}"></image>
          <g class="route-lines"></g><g class="route-stops"></g>
        </svg>
        <p class="rel-hint muted">Tap a corridor for what it carries · tap a port to open its note</p>
      </div>
      <aside class="rel-ledger" aria-live="polite"></aside>
    </div>
    <figcaption>Every line runs through the nations the table names, pinned to
      where they sit on the world map. Solid is a road, dashed is a sea lane,
      dotted is a caravan track and the broken line is the river run nobody
      admits to.</figcaption>`;

  const table = [...container.querySelectorAll('table')]
    .find((t) => /→/.test(t.textContent));
  if (table) {
    const prev = table.previousElementSibling;
    const anchor = prev && /^H[2-4]$/.test(prev.tagName) ? prev : table;
    anchor.parentNode.insertBefore(fig, anchor);
    const det = document.createElement('details');
    det.className = 'relsource';
    det.innerHTML = `<summary>The ${routes.list.length} rows this is read from</summary>`;
    table.parentNode.insertBefore(det, table);
    det.appendChild(table);
  } else {
    container.appendChild(fig);
  }
  container.classList.add('wide');

  const img = fig.querySelector('.rel-basemap');
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', BASE + pos.image);
  img.setAttribute('href', BASE + pos.image);

  const lines = fig.querySelector('.route-lines');
  for (const r of routes.list) {
    const c = CARRY[r.carry];
    const points = r.stops.map((s) => P(s).join(' ')).join(' ');
    r.el = svgEl('polyline', {
      class: 'route-line r-' + r.key, 'stroke-width': c.width,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', points,
    });
    if (c.dash) r.el.setAttribute('stroke-dasharray', c.dash);
    // a 3px line is not a touch target; this invisible one is 44px on a phone
    r.hit = svgEl('polyline', { class: 'route-hit', 'stroke-width': 26, points });
    lines.append(r.el, r.hit);
  }

  const sLayer = fig.querySelector('.route-stops');
  const marks = new Map();
  const placed = [];
  const hits = (r) => placed.some((p) =>
    r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
  // busiest ports first, so the names that matter keep the natural position
  // under the dot and the quiet ones are the ones that get flipped above
  const byTraffic = [...stops].sort((a, b) =>
    routes.list.filter((r) => r.stops.includes(b)).length -
    routes.list.filter((r) => r.stops.includes(a)).length);
  for (const s of byTraffic) {
    const [x, y] = P(s);
    const on = routes.list.filter((r) => r.stops.includes(s)).length;
    const rad = 3.4 + Math.min(on, 4) * 0.9;
    const g = svgEl('g', { class: 'route-stop', tabindex: '0', role: 'button',
      'aria-label': `${s}, on ${on} corridor${on === 1 ? '' : 's'}` });
    const dot = svgEl('circle', { class: 'route-dot', cx: x, cy: y, r: rad });
    const bg = svgEl('rect', { class: 'rel-labelbg', rx: 3 });
    const tx = svgEl('text', { class: 'rel-label route-label', 'text-anchor': 'middle', x });
    tx.textContent = s;
    const w = labelWidth(s) * RMAP.labelScale;
    const box = (ly) => ({ x: x - w / 2 - 3, y: ly - 8, w: w + 6, h: 11 });
    const below = y + rad + 9, above = y - rad - 4;
    const ly = (hits(box(below)) && !hits(box(above))) ? above : below;
    const b = box(ly);
    placed.push(b);
    tx.setAttribute('y', ly);
    bg.setAttribute('x', b.x); bg.setAttribute('y', b.y);
    bg.setAttribute('width', b.w); bg.setAttribute('height', b.h);
    g.append(dot, bg, tx);
    sLayer.appendChild(g);
    marks.set(s, { g, x, y });
  }

  const ledger = fig.querySelector('.rel-ledger');
  const overview = () => {
    const busiest = stops
      .map((s) => ({ s, c: routes.list.filter((r) => r.stops.includes(s)).length }))
      .sort((a, b) => b.c - a.c || a.s.localeCompare(b.s));
    const top = busiest.filter((x) => x.c === busiest[0].c);
    ledger.innerHTML = `<h3>The network</h3>
      <p>${routes.list.length} corridors, ${stops.length} nations on them.</p>
      <p>${top.map((x) => `<strong>${escapeHtml(x.s)}</strong>`).join(' and ')}
         ${top.length > 1 ? 'each sit' : 'sits'} on ${busiest[0].c} of them — more than
         anyone else, and the reason ${top.length > 1 ? 'their' : 'its'} foreign policy
         is mostly a freight schedule.</p>
      <p class="rel-cta muted">Tap a corridor to follow it.</p>`;
  };
  const detail = (r) => {
    ledger.innerHTML = `<h3>${escapeHtml(r.name)}</h3>
      <p class="rel-theme muted">${escapeHtml(r.carry[0].toUpperCase() + r.carry.slice(1))} —
         ${r.stops.length} stops</p>
      <p>${r.stops.map((s) => `<a class="rel-open" href="#/${encodeURI(resolveTarget(s) || '')}">${escapeHtml(s)}</a>`).join(' → ')}</p>
      <p>${escapeHtml(r.cargo)}</p>`;
  };

  const show = (r) => {
    routes.sel = r;
    for (const x of routes.list) {
      x.el.classList.toggle('dim', !!r && x !== r);
      x.el.classList.toggle('lit', !!r && x === r);
    }
    for (const [name, m] of marks) {
      m.g.classList.toggle('far', !!r && !r.stops.includes(name));
    }
    fig.querySelectorAll('.route-chip').forEach((b) =>
      b.setAttribute('aria-pressed', r && b.dataset.r === r.name ? 'true' : 'false'));
    if (r) detail(r); else overview();
  };

  fig.querySelectorAll('.route-chip').forEach((btn) => {
    btn.onclick = () => {
      const r = routes.list.find((x) => x.name === btn.dataset.r);
      show(routes.sel === r ? null : r);
    };
  });
  fig.querySelector('.rel-reset').onclick = () => show(null);

  for (const [name, m] of marks) {
    const open = () => {
      const path = resolveTarget(name);
      if (path) location.hash = '#/' + encodeURI(path);
    };
    m.g.addEventListener('click', open);
    m.g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
    });
  }
  for (const r of routes.list) {
    r.hit.addEventListener('click', () => show(routes.sel === r ? null : r));
  }
  show(null);
}

/* ------------------------------------------------------------ nation view
   A note carrying `view: nation` has its profile bullets rendered as one
   uniform two-column table, and its Relations sub-list as a table of ties with
   the standing shown as the same coloured tag the relations web uses.

   This is a view rather than a markdown table on purpose. 51 of the 28 nations'
   bullet values contain a literal `|`, every one of them from an aliased
   wikilink like `[[Human|Humans]]` — put those in a table cell and the pipe
   ends the cell, the link renders as literal bracket text and the row grows a
   phantom column, which is the exact failure tools/lint_notes.py checks for.
   The bullets stay bullets in the file, so they still read correctly in
   Obsidian and on GitHub and stay safe to edit.

   It reuses the already-rendered DOM rather than re-parsing the markdown, so
   wikilinks, statblock icons and emphasis inside a value are carried across
   exactly as they were, with nothing resolved twice. */

/* The order the fields are written in; anything unrecognised keeps its place
   at the end rather than being dropped. */
const NATION_FIELDS = ['Founded', 'Capital', 'Geography', 'Government', 'Races',
  'Naming', 'Culture', 'Faith', 'Economic Specialties', 'Military', 'History',
  'Reputation', 'Want', "Won't", 'Tension'];

/* A cell inherits the text node that followed `</strong>`, which begins with
   the separating space — and for a relations gist, with ": " as well. */
function trimCell(el, drop) {
  const first = el.firstChild;
  if (first && first.nodeType === 3) {
    let t = first.nodeValue.replace(/^\s+/, '');
    if (drop) t = t.replace(/^[:—–-]\s*/, '');
    first.nodeValue = t;
  }
  const last = el.lastChild;
  if (last && last.nodeType === 3) last.nodeValue = last.nodeValue.replace(/\s+$/, '');
}

function nationRelRow(li) {
  const link = li.querySelector('a');
  const tag = li.querySelector('strong');
  if (!link || !tag) return null;
  const standing = tag.textContent.trim();
  const key = standing.toLowerCase();
  const tr = document.createElement('tr');

  const who = document.createElement('td');
  who.className = 'nat-who';
  who.appendChild(link.cloneNode(true));

  const how = document.createElement('td');
  how.className = 'nat-how';
  how.innerHTML = `<span class="rel-tag s-${STANDING_LABEL.has(key) ? key : 'trade'}">`
                + `${escapeHtml(standing)}</span>`;

  const what = document.createElement('td');
  what.className = 'nat-what';
  let n = tag.nextSibling;
  while (n) { const next = n.nextSibling; what.appendChild(n); n = next; }
  trimCell(what, true);

  tr.append(who, how, what);
  return tr;
}

function mountNation(container) {
  /* Five of the 28 carry an italic GM line between the profile and Relations,
     which splits the markdown into two separate lists. That line is real
     content, so the view adapts to it rather than the notes being flattened:
     every top-level list is scanned, and each block is replaced where it
     stands so the note's own order survives. */
  const rows = [];
  let profileUl = null, rel = null;

  for (const ul of [...container.querySelectorAll(':scope > ul')]) {
    for (const li of [...ul.children]) {
      const label = li.querySelector(':scope > strong');
      if (!label) continue;
      const field = label.textContent.trim();
      const nested = li.querySelector(':scope > ul');
      if (field === 'Relations') { if (nested) rel = { ul, li, label, nested }; continue; }
      if (nested) continue;                 // some other nested list: leave it alone

      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = field;
      const td = document.createElement('td');
      label.remove();
      while (li.firstChild) td.appendChild(li.firstChild);
      trimCell(td, false);
      tr.append(th, td);
      rows.push({ field, tr });
      if (!profileUl) profileUl = ul;
    }
  }
  if (!rows.length) return;

  const at = (f) => { const i = NATION_FIELDS.indexOf(f); return i < 0 ? NATION_FIELDS.length : i; };
  rows.sort((a, b) => at(a.field) - at(b.field));

  const table = document.createElement('table');
  table.className = 'nat';
  const tbody = document.createElement('tbody');
  for (const r of rows) tbody.appendChild(r.tr);
  table.appendChild(tbody);

  let relFrag = null;
  if (rel) {
    const ties = [...rel.nested.children].map(nationRelRow).filter(Boolean);
    if (ties.length) {
      const head = document.createElement('h2');
      head.className = 'nat-relhead';
      head.textContent = 'Relations';
      const sub = document.createElement('span');
      sub.className = 'nat-relsub';
      sub.appendChild(document.createTextNode(ties.length + ' ties — in full at '));
      const link = rel.li.querySelector(':scope > a');
      if (link) sub.appendChild(link.cloneNode(true));
      head.appendChild(sub);

      const rt = document.createElement('table');
      rt.className = 'nat-rel';
      rt.innerHTML = '<thead><tr><th>Nation</th><th>Standing</th><th>In brief</th></tr></thead>';
      const rb = document.createElement('tbody');
      for (const t of ties) rb.appendChild(t);
      rt.appendChild(rb);

      relFrag = document.createDocumentFragment();
      relFrag.append(head, rt);
    }
  }

  if (relFrag && rel.ul === profileUl) {
    const frag = document.createDocumentFragment();
    frag.append(table, relFrag);
    profileUl.replaceWith(frag);
  } else {
    profileUl.replaceWith(table);
    if (relFrag) rel.ul.replaceWith(relFrag);
  }
}

/* ---------------------------------------------------------------- timeline
   A note carrying `view: timeline` has its dated tables drawn as a rail, one
   band per `##` era, above a proportional strip of the whole span.

   Same rule as the relations web and the trade routes: the markdown is the
   single source of truth. An era is an `## <range> — <Name>` heading, a row is
   `| <year> | <what happened> | <note link> |`, and adding a row to the note
   adds a dot here with no code change. The note still reads as a plain dated
   chronicle in Obsidian and on GitHub.

   The strip is the point of drawing this at all. Saeroth's history is 2,376
   years long and almost every event anybody can name is in the last seventy of
   them, which a list cannot show and a proportional bar cannot hide. */
const timeline = { eras: [], now: 0 };
window.__tl = timeline;   // exposed for automated UI tests, like window.__rel

/* Year cells are `0`, `c. 180`, `c. 1 – c. 95`, `2316`. The first integer is
   the year; a second one makes it a span. Anything with no integer at all is
   a header or separator row and is skipped, which keeps the note's own prose
   tables out of the drawing. */
function parseYear(cell) {
  const nums = cell.match(/\d+/g);
  if (!nums) return null;
  return {
    label: cell.replace(/\*+/g, '').trim(),
    y: Number(nums[0]),
    y2: nums.length > 1 ? Number(nums[1]) : Number(nums[0]),
    approx: /c\./i.test(cell),
  };
}

function parseTimeline(body) {
  const eras = [];
  let era = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^##\s+(.*)$/.exec(line);
    if (h) {
      // "c. 700 – 1496 — The Old Foundations" → the em dash splits range from
      // name; the en dash inside the range never does
      const parts = h[1].split('—').map((s) => s.trim());
      const name = parts.length > 1 ? parts.pop() : h[1].trim();
      era = { name, range: parts.join(' — '), rows: [] };
      eras.push(era);
      continue;
    }
    if (!era || line[0] !== '|') continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 3) continue;
    const year = parseYear(cells[0]);
    if (!year) continue;
    era.rows.push({ year, text: cells[1], note: cells[2] });
  }
  return eras.filter((e) => e.rows.length);
}

function mountTimeline(container, bodyText) {
  const eras = parseTimeline(bodyText);
  if (!eras.length) return;
  timeline.eras = eras;
  const now = timeline.now = Math.max(...eras.flatMap((e) => e.rows.map((r) => r.year.y2)));

  // an era runs from its first dated row to the next era's, so the strip is
  // built from the rows rather than from the headings it could disagree with
  const bounds = eras.map((e, i) => {
    const start = Math.min(...e.rows.map((r) => r.year.y));
    const next = eras[i + 1];
    const end = next ? Math.min(...next.rows.map((r) => r.year.y))
                     : Math.max(now, ...e.rows.map((r) => r.year.y2));
    return { start, end: Math.max(end, start + 1) };
  });

  const fig = document.createElement('figure');
  fig.className = 'tl';
  const X = (y) => (y / now) * 1000;

  const bands = eras.map((e, i) => {
    const b = bounds[i];
    const w = Math.max(X(b.end) - X(b.start), 1.5);
    return `<rect class="tl-band b${Math.min(i, 7)}" x="${X(b.start).toFixed(2)}" y="0" `
         + `width="${w.toFixed(2)}" height="26" data-era="${i}">`
         + `<title>${escapeHtml(e.name)} — ${escapeHtml(e.range || '')}</title></rect>`;
  }).join('');

  const ticks = [0, 500, 1000, 1500, 2000, now].map((y) =>
    `<line class="tl-tick" x1="${X(y).toFixed(2)}" y1="26" x2="${X(y).toFixed(2)}" y2="31"/>`
    + `<text class="tl-ticklab" x="${Math.min(X(y), 986).toFixed(2)}" y="41" `
    + `text-anchor="${y === 0 ? 'start' : y === now ? 'end' : 'middle'}">${y}</text>`).join('');

  // the last two eras are the war and the peace: about three per cent of the
  // span and nearly everything the world talks about
  const liveFrom = bounds[Math.max(bounds.length - 2, 0)].start;
  const callout =
    `<rect class="tl-live" x="${X(liveFrom).toFixed(2)}" y="-4" `
    + `width="${Math.max(1000 - X(liveFrom), 2).toFixed(2)}" height="34"/>`;

  fig.innerHTML =
    `<svg class="tl-strip" viewBox="0 0 1000 46" preserveAspectRatio="none" role="img"
          aria-label="The whole of recorded history, to scale">
       ${bands}${callout}${ticks}
     </svg>
     <p class="tl-scalenote">Everything from the Two-Crown War onward — the war,
       the Peace, the Delta War and the towers — is the highlighted sliver at the
       right: seventy-one years out of ${now}.</p>
     <div class="tl-rail"></div>`;

  const rail = fig.querySelector('.tl-rail');
  eras.forEach((e, i) => {
    const sec = document.createElement('section');
    sec.className = 'tl-era';
    sec.id = 'tl-era-' + i;
    sec.innerHTML =
      `<h3 class="tl-eraname"><span class="tl-swatch b${Math.min(i, 7)}"></span>${escapeHtml(e.name)}`
      + (e.range ? ` <span class="tl-erarange">${escapeHtml(e.range)}</span>` : '') + `</h3>`;
    const ol = document.createElement('ol');
    ol.className = 'tl-list';
    for (const r of e.rows) {
      const li = document.createElement('li');
      li.className = 'tl-ev' + (r.year.approx ? ' approx' : '');
      const note = /\[\[/.test(r.note) ? `<p class="tl-note">${inlineSB(r.note)}</p>` : '';
      li.innerHTML = `<span class="tl-year">${escapeHtml(r.year.label)}</span>`
                   + `<div class="tl-what"><p>${inlineSB(r.text)}</p>${note}</div>`;
      ol.appendChild(li);
    }
    sec.appendChild(ol);
    rail.appendChild(sec);
  });

  fig.querySelector('.tl-strip').addEventListener('click', (ev) => {
    const i = ev.target.getAttribute && ev.target.getAttribute('data-era');
    if (i === null || i === undefined) return;
    const sec = document.getElementById('tl-era-' + i);
    if (sec) sec.scrollIntoView({ block: 'start' });
  });

  // insert above the first dated table and tuck every source table away, the
  // same way the relations web and the routes map do
  const tables = [...container.querySelectorAll('table')]
    .filter((t) => /^\s*Year\b/.test(t.textContent));
  if (!tables.length) { container.appendChild(fig); return; }
  const first = tables[0];
  const prev = first.previousElementSibling;
  const anchor = prev && /^H[2-4]$/.test(prev.tagName) ? prev : first;
  anchor.parentNode.insertBefore(fig, anchor);
  const det = document.createElement('details');
  det.className = 'relsource';
  const n = eras.reduce((a, e) => a + e.rows.length, 0);
  det.innerHTML = `<summary>The ${n} dated rows this is read from</summary>`;
  first.parentNode.insertBefore(det, first);
  for (const t of tables) {
    const head = t.previousElementSibling;
    if (head && /^H2$/.test(head.tagName)) det.appendChild(head);
    det.appendChild(t);
  }
}

/* ------------------------------------------------------------------ boot */
/* The topbar's height is not a constant: installed to the home screen on iOS it
   grows by env(safe-area-inset-top), and the sidebar, scrim and graph overlay
   are all positioned from its bottom edge. Measuring it beats guessing — with
   the guess, standalone mode put the sidebar and its sticky filter box up
   underneath the bar and left the tree scrolling behind it. */
function syncTopbarHeight() {
  const bar = document.querySelector('.topbar');
  if (bar) document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
}

function openSidebar() {
  const sb = $('sidebar');
  sb.classList.add('open');
  // On a wide screen the tree normally sits in the layout, where the graph
  // overlay would cover it. `over` lifts it above the graph at any width, so
  // the menu button means the same thing everywhere.
  sb.classList.toggle('over', !$('graphView').hidden);
  $('scrim').hidden = false;
  $('menuBtn').setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  $('sidebar').classList.remove('open', 'over');
  $('scrim').hidden = true;
  $('menuBtn').setAttribute('aria-expanded', 'false');
}

async function init() {
  const theme = localStorage.getItem('theme');
  if (theme) document.documentElement.dataset.theme = theme;

  syncTopbarHeight();
  addEventListener('resize', syncTopbarHeight);
  addEventListener('orientationchange', syncTopbarHeight);
  // Safari settles the safe-area insets a frame or two after first paint.
  requestAnimationFrame(syncTopbarHeight);
  addEventListener('load', syncTopbarHeight);

  const idx = await (await fetch(BASE + 'index-campaign.json')).json();
  state.campaign = idx.notes;
  for (const it of state.campaign) indexEntry(it.p);
  for (const it of state.campaign) {
    if (it.body) state.text.set(it.p, it.body);
    state.links.set(it.p, it.l || []);
    if (it.t) state.type.set(it.p, it.t);
  }

  buildTree(state.campaign.map((n) => n.p), $('tree'));   // everything collapsed

  $('menuBtn').onclick = () => ($('sidebar').classList.contains('open') ? closeSidebar() : openSidebar());
  $('scrim').onclick = closeSidebar;
  $('themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = cur;
    localStorage.setItem('theme', cur);
    if (graph.nodes.length) { drawLegend(); needsDraw(); }   // palette swaps with the theme
  };
  $('graphBtn').onclick = () => ($('graphView').hidden ? openGraph() : closeGraph());
  $('graphClose').onclick = closeGraph;
  $('gLeave').onclick = closeGraph;
  $('backBtn').onclick = goBack;
  $('renderGraph').onclick = renderGraphNow;
  $('gCollapse').onclick = () => setPanel(false);
  $('gExpand').onclick = () => setPanel(true);
  $('colorBy').onchange = () => { if (graph.nodes.length) { assignColours(graph.nodes); needsDraw(); } };
  initGraphEvents();
  $('searchBtn').onclick = async () => {
    $('searchModal').hidden = false; $('searchInput').focus();
    ensureVault().catch(() => {});
  };
  $('searchModal').onclick = (e) => { if (e.target.id === 'searchModal') $('searchModal').hidden = true; };
  $('searchInput').oninput = (e) => showResults(search(e.target.value));
  $('searchResults').onclick = () => { $('searchModal').hidden = true; };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('searchModal').hidden = true; closeSidebar(); if (!$('graphView').hidden) closeGraph(); }
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
      if (document.activeElement.tagName === 'INPUT') return;
      e.preventDefault(); $('searchBtn').click();
    }
  });
  $('filter').oninput = (e) => {
    const q = normalize(e.target.value);
    if (!q) { buildTree(state.campaign.map((n) => n.p), $('tree')); markActive(state.current); return; }
    const hits = state.campaign.map((n) => n.p).filter((p) => normalize(p).includes(q));
    state.tree = makeTreeData(hits);
    renderLevel(state.tree, $('tree'), 9);   // a filter shows its matches, so this one opens
  };

  addEventListener('hashchange', route);
  await route();

  if ('serviceWorker' in navigator) {
    /* Installed to a home screen there is no navigation — the app is resumed
       from the switcher — so nothing ever triggers the browser's own update
       check and the phone can serve a months-old cache indefinitely. Bumping
       VERSION in sw.js is necessary and was never sufficient. Check on boot
       and on every resume. */
    const hadWorker = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register(BASE + 'sw.js').then((reg) => {
      const check = () => reg.update().catch(() => {});
      check();
      addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      showVersion();
    }).catch(() => {});

    /* sw.js calls skipWaiting(), so a new worker claims this page as soon as
       it installs — but the note already on screen came from the old cache.
       Reload once so what is displayed is what the new worker just cached.
       Guarded on hadWorker: on a first ever visit the claim is not an update
       and reloading for it would be a pointless flash. */
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadWorker || reloading) return;
      reloading = true;
      location.reload();
    });
  }
}

/* Prints the serving worker's cache version in the sidebar. This is the only
   way from inside the app to tell "the note is wrong" from "this device is
   showing you an old copy of the note". */
function showVersion() {
  const el = $('build');
  if (!el || !navigator.serviceWorker.controller) return;
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => {
    if (e.data && e.data.version) el.textContent = 'build ' + e.data.version;
  };
  navigator.serviceWorker.controller.postMessage('version', [ch.port2]);
}
init();
