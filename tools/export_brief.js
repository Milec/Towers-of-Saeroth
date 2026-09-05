// Saeroth as a design brief: the constraints a map has to satisfy, not a map.
//
// `tools/mapgen/` generates the world from these same facts. This writes them
// out as one machine-readable file so something else can do the same job its own
// way — an LLM with a code tool, a hand cartographer, a different generator.
//
// It carries no geometry at all, on purpose. There are no coastlines here and no
// coordinates: those are one *solution* to the constraints, and handing them over
// would just be asking for the existing map back. What it carries is everything
// that decides whether a map of Saeroth is right — which continent each nation is
// on, what latitude its climate needs, how large it is against its neighbours,
// what ground its own note claims it stands on, which frontiers the vault asserts
// must exist, what every nation thinks of every other, and where the trade goes.
//
//   node tools/export_brief.js            # -> saeroth-brief.json
//   OUT=somewhere.json node tools/export_brief.js
//
// Everything is read from the same sources the map generator reads, so this
// cannot drift from the vault: `tools/mapgen/world.js` for the geography,
// `campaign/nations/Political Relations.md` for the diplomacy,
// `campaign/world/Trade Routes.md` for the corridors, and each nation's own note
// for its capital and its one-line character.
const fs = require('fs');
const path = require('path');

const REPO = path.dirname(__dirname);
const W = require(path.join(REPO, 'tools', 'mapgen', 'world.js'));
// the latitude window the world spans lives with the forge, not with the facts
const F = require(path.join(REPO, 'tools', 'mapgen', 'forge.js'));
const OUT = process.env.OUT || path.join(REPO, 'saeroth-brief.json');

const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '')
  .split('|').map(c => c.trim());
const links = s => [...s.matchAll(/\[\[([^\]|#]+)[^\]]*\]\]/g)].map(m => m[1].trim());
const plain = s => s.replace(/\[\[([^\]|#]+)(\|[^\]]*)?\]\]/g, (_, a, b) => (b ? b.slice(1) : a))
  .replace(/\*+/g, '').trim();

// ---- the diplomacy, and what each standing means ------------------------
const relDoc = read('campaign/nations/Political Relations.md');
const STANDINGS = {};
for (const line of relDoc.split('\n')) {
  if (!line.trim().startsWith('|')) continue;
  const c = cells(line);
  if (c.length === 2 && /^\*\*\w/.test(c[0]) && !c[1].startsWith('---'))
    STANDINGS[plain(c[0])] = c[1];
}
const relations = [];
for (const line of relDoc.split('\n')) {
  if (!line.trim().startsWith('|')) continue;
  const c = cells(line);
  if (c.length < 3) continue;
  const pair = links(c[0]);
  if (pair.length !== 2) continue;
  const standing = plain(c[1]);
  if (!STANDINGS[standing]) continue;
  // the lead sentence is what the 28 nation notes carry; it stands alone
  const detail = plain(c[2] || '');
  relations.push({ between: pair, standing,
                   detail: (detail.match(/^[^.]+\./) || [detail])[0].trim() });
}

// ---- the trade corridors -------------------------------------------------
const corridors = [];
for (const line of read('campaign/world/Trade Routes.md').split('\n')) {
  if (!line.trim().startsWith('|')) continue;
  const c = cells(line);
  if (c.length < 4) continue;
  const stops = links(c[2] || '');
  if (stops.length < 2) continue;
  corridors.push({ name: plain(c[0]), carriedBy: plain(c[1]), stops, cargo: plain(c[3]) });
}

// ---- each nation's capital and character, from its own note --------------
const noteOf = {};
for (const dir of fs.readdirSync(path.join(REPO, 'campaign', 'nations'), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const f = path.join('campaign', 'nations', dir.name, dir.name + '.md');
  if (!fs.existsSync(path.join(REPO, f))) continue;
  const body = read(f);
  const bullet = label => {
    const m = body.match(new RegExp('^- \\*\\*' + label + '\\*\\* (.+)$', 'm'));
    return m ? plain(m[1]) : null;
  };
  const cap = bullet('Capital');
  noteOf[dir.name] = {
    capital: cap ? (cap.match(/^[^,.;]+/) || [cap])[0].trim() : null,
    capitalIs: cap,
    theme: (body.match(/^theme:\s*(.+)$/m) || [])[1] || null,
    government: (body.match(/^government:\s*(.+)$/m) || [])[1] || null,
    geography: bullet('Geography'),
    exports: bullet('Economic Specialties'),
  };
}

// ---- and the geography the generator works from -------------------------
const CONTINENTS = {
  0: { name: 'the western continent', share: W.GROUP_SHARE[0] },
  1: { name: 'the eastern continent', share: W.GROUP_SHARE[1] },
  2: { name: 'the middle sea', share: W.GROUP_SHARE[2],
       note: 'an archipelago, not a landmass: its nations hold islands' },
};
const nations = Object.keys(W.SIZE).sort().map(n => {
  const L = W.LAND[n] || {}, note = noteOf[n] || {};
  return {
    name: n,
    continent: CONTINENTS[W.GROUP[n]].name,
    // relative, not absolute: 1.0 is an average-sized nation on this map
    size: W.SIZE[n],
    targetLatitude: L.tlat,
    ground: W.CLAIM[n],            // what the majority of its land must be
    terrain: L.why || note.geography || null,
    elevationBand: L.elev || null,
    coastal: !!L.coastal, seaward: !!L.seaward,
    volcanic: !!L.volcanic, mountainous: !!L.ridged,
    capital: note.capital, capitalIs: note.capitalIs,
    theme: note.theme, government: note.government, exports: note.exports,
  };
});

const brief = {
  world: {
    name: 'Saeroth',
    continents: Object.values(CONTINENTS),
    latitudeRange: [F.LAT_BOT, F.LAT_TOP],
    note: 'Most of the world is northern hemisphere. The far north is a polar '
        + 'ice cap and the far south is unsettled wilderness; neither is any '
        + "nation's.",
    wilderness: W.WILD.map(w => ({ what: w.why, shareOfUnsettledLand: w.share,
                                   heldInPartBy: w.colonists || [] })),
  },
  nations,
  // the frontiers the vault asserts: these two nations MUST share a border
  requiredBorders: W.BORDERS,
  // and the ones the notes describe as mountain country
  mountainFrontiers: W.RIDGE_BORDERS,
  standings: STANDINGS,
  relations,
  corridors,
};

fs.writeFileSync(OUT, JSON.stringify(brief, null, 1));
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
console.log(`  ${nations.length} nations across ${Object.keys(CONTINENTS).length} regions`);
console.log(`  ${brief.requiredBorders.length} required borders, ` +
            `${brief.mountainFrontiers.length} of them mountain country`);
console.log(`  ${relations.length} relations across ${Object.keys(STANDINGS).length} standings`);
console.log(`  ${corridors.length} trade corridors`);
const missing = nations.filter(n => !n.capital).map(n => n.name);
if (missing.length) console.log(`  no fixed capital: ${missing.join(', ')}`);
