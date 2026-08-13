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
  let h = escapeHtml(s);
  h = h.replace(/`\[(one-action|two-actions|three-actions|free-action|reaction)\]`/g,
    (_, k) => actionSVG(NAMED_ACTIONS[k]));
  h = h.replace(/`pf2:([0-3r])`/gi, (_, k) => actionSVG(k.toLowerCase() === 'r' ? 'r' : Number(k)));
  h = h.replace(/\[\[([^\]]+?)\]\]/g, (_, raw) => {
    const [tp, ...al] = raw.split('|');
    const [target] = tp.split('#');
    const p = resolveTarget(target);
    const label = escapeHtml((al.join('|') || target).trim());
    return p ? `<a class="wl" href="#/${encodeURI(p)}">${label}</a>`
             : `<span class="wl broken">${label}</span>`;
  });
  h = h.replace(/==([^=]+)==/g, (_, t) => `<span class="trait ${traitClass(t)}">${t}</span>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  return h;
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

async function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, frag] = hash.split('#');
  const target = path || 'campaign/README.md';
  state.current = target;
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
    el.innerHTML =
      `<nav class="crumbs">${crumbs(target)}</nav>` +
      frontmatterTable(fm) +
      marked.parse(body);
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

function renderLevel(node, mount, openDepth = 0, depth = 0) {
  mount.textContent = '';
  for (const key of [...node.dirs.keys()].sort()) {
    const child = node.dirs.get(key);
    const d = document.createElement('details');
    const s = document.createElement('summary');
    s.textContent = key;
    d.appendChild(s);
    const holder = document.createElement('div');
    d.appendChild(holder);
    d.addEventListener('toggle', async () => {
      if (!d.open || d.dataset.filled) return;
      d.dataset.filled = '1';
      // The vault subtree (41,718 notes) is only fetched and built when
      // someone actually opens it.
      if (child.lazy) {
        holder.innerHTML = '<p class="muted pad small">Loading 41,718 notes…</p>';
        try {
          await ensureVault();
          const built = makeTreeData(state.vault.map((v) => v.p)).dirs.get('vault');
          if (built) { node.dirs.set(key, built); renderLevel(built, holder); return; }
          holder.innerHTML = '<p class="muted pad small">No notes found.</p>';
        } catch (_) {
          holder.innerHTML = '<p class="muted pad small">Could not load — offline?</p>';
          d.dataset.filled = '';
        }
        return;
      }
      renderLevel(child, holder);
    });
    // Never auto-expand a lazy branch: that would mark it filled from its
    // empty placeholder and the real load would never fire.
    if (depth < openDepth && !child.lazy) {
      d.open = true; d.dataset.filled = '1';
      renderLevel(child, holder, openDepth, depth + 1);
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
function markActive(path) {
  document.querySelectorAll('.leaf.active').forEach((a) => a.classList.remove('active'));
  const a = document.querySelector(`.leaf[data-path="${CSS.escape(path)}"]`);
  if (a) { a.classList.add('active'); a.closest('details') && openParents(a); }
}
function openParents(el) {
  let d = el.closest('details');
  while (d) { d.open = true; d = d.parentElement.closest('details'); }
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

const graph = { nodes: [], edges: [], raf: 0, scale: 1, ox: 0, oy: 0, hover: -1, alpha: 0, legend: [] };
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
  const { nodes, edges } = await collectGraph();
  let ns = nodes, es = edges;
  if ($('hideOrphans').checked) {
    const keepIdx = new Map();
    ns = [];
    nodes.forEach((n, i) => { if (n.deg > 0) { keepIdx.set(i, ns.length); ns.push(n); } });
    es = edges.map(([a, b]) => [keepIdx.get(a), keepIdx.get(b)])
              .filter(([a, b]) => a != null && b != null);
  }
  const R = Math.max(120, Math.sqrt(ns.length) * 26);
  ns.forEach((n, i) => {
    const a = (i / ns.length) * Math.PI * 2, r = R * (0.35 + 0.65 * Math.random());
    n.x = Math.cos(a) * r; n.y = Math.sin(a) * r; n.vx = n.vy = 0;
  });
  assignColours(ns);
  graph.labelCut = null;
  graph.nodes = ns; graph.edges = es; graph.alpha = 1;
  graph.scale = Math.min(1, 420 / (R || 420)); graph.ox = 0; graph.oy = 0;
  $('ghint').hidden = ns.length === 0;
  tick();
}

/* Largest categories get the validated hues, in fixed order by size; the tail
   folds into a neutral "Other" rather than inventing a fourth hue. */
function assignColours(ns) {
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

function drawLegend() {
  const el = $('glegend');
  if (!graph.legend.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="scope-h">Legend</div>' + graph.legend.map((l) =>
    `<div class="lgd"><span class="sw" style="background:${slotColour(l.slot)}"></span>
      <span>${escapeHtml(l.label)}</span><span class="muted">${l.n.toLocaleString()}</span></div>`).join('');
}

function tick() {
  const { nodes: ns, edges: es } = graph;
  if (graph.alpha > 0.005 && ns.length) {
    // Forces scale with alpha so the layout eases to a stop instead of running
    // at full strength and then cutting off — which left nodes still drifting
    // under the cursor when the graph looked settled.
    const k = graph.alpha, cell = 60;
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
          if (d2 < 1e-4) { ddx = Math.random() - .5; ddy = Math.random() - .5; d2 = 1; }
          if (d2 > cell * cell * 4) continue;
          const f = (260 * k) / d2;
          a.vx += ddx * f; a.vy += ddy * f;
        }
      }
    }
    for (const [i, j] of es) {                    // spring attraction
      const a = ns[i], b = ns[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d - 46) * 0.012 * graph.alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const n of ns) {                          // gravity + damping
      n.vx -= n.x * 0.0016 * graph.alpha; n.vy -= n.y * 0.0016 * graph.alpha;
      n.x += (n.vx *= 0.82); n.y += (n.vy *= 0.82);
    }
    graph.alpha *= 0.985;
  }
  drawGraph();
  graph.raf = requestAnimationFrame(tick);
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

  const { nodes: ns, edges: es, hover } = graph;
  const near = new Set();
  if (hover >= 0) for (const [a, b] of es) { if (a === hover) near.add(b); if (b === hover) near.add(a); }

  ctx.lineWidth = 1 / graph.scale;
  ctx.strokeStyle = css.getPropertyValue('--rule') || '#ccc';
  ctx.globalAlpha = hover >= 0 ? 0.25 : 0.55;
  ctx.beginPath();
  for (const [a, b] of es) {
    ctx.moveTo(ns[a].x, ns[a].y); ctx.lineTo(ns[b].x, ns[b].y);
  }
  ctx.stroke();
  if (hover >= 0) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css.getPropertyValue('--accent') || '#a33';
    ctx.beginPath();
    for (const [a, b] of es) if (a === hover || b === hover) {
      ctx.moveTo(ns[a].x, ns[a].y); ctx.lineTo(ns[b].x, ns[b].y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  const ink = css.getPropertyValue('--ink') || '#222';
  const surface = css.getPropertyValue('--bg') || '#fff';
  const pal = paletteNow();
  const muted = css.getPropertyValue('--muted').trim() || '#888';
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i];
    const r = Math.min(12, 3.4 + Math.sqrt(n.deg) * 1.5);
    ctx.globalAlpha = hover >= 0 && i !== hover && !near.has(i) ? 0.28 : 1;
    // 2px surface ring so overlapping nodes stay separable
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + 1.4 / graph.scale, 0, Math.PI * 2);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.slot >= 0 ? pal[n.slot] : muted;
    ctx.fill();
    if (i === hover) {
      ctx.lineWidth = 2.2 / graph.scale;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  /* Selective labels: the best-connected nodes plus whatever is hovered.
     Labelling all of them turns a dense graph into a wall of overlapping
     text — zooming in reveals progressively more. */
  ctx.fillStyle = ink;
  ctx.font = `${Math.max(9.5, 12 / graph.scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  const budget = Math.round(26 * Math.max(1, graph.scale));
  const cut = graph.labelCut ?? (graph.labelCut = (() => {
    const degs = ns.map((n) => n.deg).sort((a, b) => b - a);
    return degs.length > budget ? degs[budget] : 0;
  })());
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i];
    const isNear = hover >= 0 && (i === hover || near.has(i));
    if (hover >= 0 && !isNear) continue;
    if (hover < 0 && !(n.deg > cut || graph.scale > 1.8)) continue;
    ctx.globalAlpha = isNear ? 1 : 0.85;
    ctx.fillText(n.name, n.x, n.y - Math.min(12, 5 + Math.sqrt(n.deg) * 1.5) - 3);
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

function initGraphEvents() {
  const cv = $('gcanvas');
  let dragging = false, lx = 0, ly = 0, moved = 0;
  cv.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (dragging) {
      graph.ox += e.clientX - lx; graph.oy += e.clientY - ly;
      moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
    } else graph.hover = graphPointer(e);
  });
  cv.addEventListener('pointerup', (e) => {
    dragging = false;
    if (moved < 5) {
      const i = graphPointer(e);
      if (i >= 0) { location.hash = '#/' + encodeURI(graph.nodes[i].p); closeGraph(); }
    }
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    graph.scale = Math.max(0.06, Math.min(6, graph.scale * f));
  }, { passive: false });
}

function openGraph() { $('graphView').hidden = false; buildScopeUI(); }
function closeGraph() { $('graphView').hidden = true; cancelAnimationFrame(graph.raf); graph.raf = 0; }

/* ------------------------------------------------------------------ boot */
function openSidebar() { $('sidebar').classList.add('open'); $('scrim').hidden = false; $('menuBtn').setAttribute('aria-expanded', 'true'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('scrim').hidden = true; $('menuBtn').setAttribute('aria-expanded', 'false'); }

async function init() {
  const theme = localStorage.getItem('theme');
  if (theme) document.documentElement.dataset.theme = theme;

  const idx = await (await fetch(BASE + 'index-campaign.json')).json();
  state.campaign = idx.notes;
  for (const it of state.campaign) indexEntry(it.p);
  for (const it of state.campaign) {
    if (it.body) state.text.set(it.p, it.body);
    state.links.set(it.p, it.l || []);
    if (it.t) state.type.set(it.p, it.t);
  }

  buildTree(state.campaign.map((n) => n.p), $('tree'), { open: 2 });

  $('menuBtn').onclick = () => ($('sidebar').classList.contains('open') ? closeSidebar() : openSidebar());
  $('scrim').onclick = closeSidebar;
  $('themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = cur;
    localStorage.setItem('theme', cur);
    if (graph.nodes.length) drawLegend();   // palette swaps with the theme
  };
  $('graphBtn').onclick = openGraph;
  $('graphClose').onclick = closeGraph;
  $('renderGraph').onclick = renderGraphNow;
  $('colorBy').onchange = () => { if (graph.nodes.length) { assignColours(graph.nodes); } };
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
    if (!q) { buildTree(state.campaign.map((n) => n.p), $('tree'), { open: 2 }); markActive(state.current); return; }
    const hits = state.campaign.map((n) => n.p).filter((p) => normalize(p).includes(q));
    state.tree = makeTreeData(hits);
    renderLevel(state.tree, $('tree'), 9);
  };

  addEventListener('hashchange', route);
  await route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(BASE + 'sw.js').catch(() => {});
  }
}
init();
