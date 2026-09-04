// Build Saeroth.map from world.js/forge.js on a big canvas.
const APP = require('./app.js');
const W = require('./forge.js');
const { REGIONS, regionWorld } = require('./regions.js');

// A region build gives ONE continent the whole canvas and the whole cell
// budget, instead of splitting both three ways. Everything downstream — the
// forge, the scoring, the profile, inspect.py — works on whatever world object
// it is handed, so the only thing a region changes is which world that is.
const REGION = process.env.REGION || '';
const WD = REGION ? regionWorld(W, REGION) : W;
const WORLD = require('./world.js');
const fs = require('fs');

const MAP_W = +(process.env.MAP_W || 3600);
const MAP_H = +(process.env.MAP_H || 2150);
const CELLS = +(process.env.CELLS || 50000);

const CFG = { tmpl: 'continents', eq: 29, np: -30, sp: -28, prec: 100, seed: '1' };
const OPTS = Object.assign({
  seed: 7,
  landFraction: 0.43, settledFraction: 0.86,
  plates: 64, layoutIters: 900, attract: 0.10, touchAt: 0.82,
  // latPull holds a nation at its own latitude; groupGap is how hard the two
  // continents shove each other apart. They trade against one another: with
  // the old 0.030/1.9 the shoving won, and moving ONE nation ten degrees
  // dragged the whole eastern continent south out of its climate bands
  // `separate` is how far apart two nations with no relationship stand off,
  // and `knit` is how hard they are pulled back together once they drift past
  // `knitAt`. It is the single strongest lever on how the political map reads:
  // at the old 1.12, with no knit at all, only 7 of 50 frontiers on the
  // finished world were between nations the vault says nothing about, and the
  // continent was a chain of related states. At 1.02/0.008 it is 12 of 56 —
  // and the same seed goes from 11 inspector problems to 1, 27 terrain
  // majorities to 28, and 22 of 24 trade legs to all of them.
  separate: 1.02, repel: 0.06, knitAt: 1.45, knit: 0.008,
  cohesion: 0.012, latPull: 0.08, groupGap: 1.6,
  capIters: 50, growIters: 45, growGain: 0.30, snapIters: 26, coastPull: 1200, coastWant: 4, ridgePull: 6000, ridgeWant: 0.35,
  latCost: 14000, latFree: 4, latBar: 2.4, ruins: 26, keepC: 0.72, varT: 0.5, varP: 0.38,
  borderFix: 45, minCells: 60, microCorridor: 8,
  relaxRounds: 14, sizeTol: 0.18, blur: 2, plateYield: 0.85,
  orogenLift: 58, lakes: 6, lakeR: 4.0, // arcFreq is the wavelength of the archipelago's own noise, and it is what
  // decides whether the middle sea holds islands or two more small continents.
  // At 0.009 the group-2 plates came out as one 693-cell blob and three
  // scraps; at 0.026 the same land is 16 landmasses — 509, 327, 125, 62, 55,
  // 31 and a tail of skerries — which is what an archipelago is, and gives
  // Aquoniti the nine islands its note claims instead of three.
  arcFreq: 0.026, arcLand: 0.46, arcNeed: 1.15,
  orogenyMinor: 0.30, foldFloor: 0.26, flatPush: 120000, flatFree: 0.20, flatCeil: 50, foldSharp: 1.7, spineAt: 0.38, orogeny: 2.9, beltWidth: 2.7, frontWarp: 14, frontFreq: 0.0060, rift: 1.6, riftWidth: 4.0, straitMin: 160, hotspots: 14, moat: 4.0, moatW: 3.4, iceY: 0.040,
  contBase: 0.62, marginTop: 0.055, wildRelief: 2.0, wildFreq: 0.0050, reliefAmp: 0.98, minPond: 22,
  warpAmp: 165, warpFreq: 0.0016, coastNoise: 0.19, coastBand: 0.12, coastFreq: 0.007, fjordFreq: 0.022, weather: 1,
  // ranges walked along the crest of the orogen, and coastlines shaped by
  // one Old World heightmap per continent — see tools/mapgen/README.md
  relief: 'crest', oldWorld: 0.8, donorAmp: [1, 1, 2, 1], packCorridor: 20,
}, JSON.parse(process.env.OPTS || '{}'));
const OUT = process.env.OUT ||
  (REGION ? `campaign/maps/Saeroth-${REGION}.map` : 'Saeroth.map');
const PFX = process.env.PFX || (REGION ? `saeroth-${REGION}` : 'saeroth2');

const DIPLO = {
  Allied: 'Ally', Friendly: 'Friendly', Trade: 'Friendly', Rivalry: 'Rival',
  Friction: 'Suspicion', Territorial: 'Rival', Hostile: 'Enemy', Covert: 'Neutral',
};
// What a corridor's "Carried by" column means on the ground. Azgaar ships
// twenty transport types and none of them is a freight caravan, so three are
// added: a corridor that moves salt on camels should say camels rather than
// borrow a stagecoach. The domain is what actually matters — it decides
// whether a leg is routed over the roads or over the sea.
const CARRIER = {
  sea:     { name: 'Sailing Ship', domain: 'water' },
  river:   { name: 'River barge',  domain: 'water' },
  road:    { name: 'Freight wagon', domain: 'land' },
  caravan: { name: 'Camel caravan', domain: 'land' },
};
const EXTRA_TRANSPORTS = [
  { name: 'Freight wagon', speed: 4, domain: 'land',  hoursPerDay: 10 },
  { name: 'Camel caravan', speed: 4, domain: 'land',  hoursPerDay: 10 },
  { name: 'River barge',   speed: 5, domain: 'water', hoursPerDay: 10 },
];
// The nine corridor colours the site already uses, in the note's own row
// order, so a corridor is the same colour on the map as in the web view.
const ROUTE_COLORS = ['#1f5f8b', '#8a5a1f', '#2f6b46', '#7a2f5f', '#5a4a9a',
                      '#146b6b', '#9a3b26', '#4a5f22', '#6b4a2f'];

const FORMS = {
  'Aquoniti': ['Republic', 'Thalassocracy'], 'Thurion Merchant Alliance': ['Union', 'Alliance'],
  'Nordheim': ['Monarchy', 'Kingdom'], 'Stoneborn Holds': ['Republic', 'Holds'],
  'Undertide Reaches': ['Republic', 'Reaches'], 'Khazan Khaganate': ['Monarchy', 'Khaganate'],
  'Xian Ti': ['Monarchy', 'Empire'], 'Voskreld Union': ['Union', 'Union'],
  'Vaelic Principality': ['Monarchy', 'Principality'], 'Thesal Theocracy': ['Theocracy', 'Theocracy'],
  'Melisor Magocracy': ['Republic', 'Magocracy'], 'Silicar': ['Republic', 'Republic'],
  'Quivar': ['Monarchy', 'Kingdom'], 'Dalstan': ['Theocracy', 'Inquisition'],
  'Lazarian Lichdom': ['Monarchy', 'Lichdom'], 'Corvane Republic': ['Republic', 'Republic'],
  'Thurigypt': ['Monarchy', 'Pharaonate'], 'Cindral Ashlands': ['Monarchy', 'Ashlands'],
  'Thornwild Confederation': ['Union', 'Confederation'], 'Kesmarch Frontier': ['Republic', 'Frontier'],
  'Elven Confederacy': ['Union', 'Confederacy'],
  'Sahenna Compact': ['Union', 'Compact'], 'Qeshara Sultanate': ['Monarchy', 'Sultanate'],
};
const SHORT = {
  'Thurion Merchant Alliance': 'Thurion', 'Stoneborn Holds': 'Stoneborn',
  'Undertide Reaches': 'Undertide', 'Khazan Khaganate': 'Khazan',
  'Voskreld Union': 'Voskreld', 'Vaelic Principality': 'Vaelic',
  'Thesal Theocracy': 'Thesal', 'Melisor Magocracy': 'Melisor',
  'Lazarian Lichdom': 'Lazarian', 'Corvane Republic': 'Corvane',
  'Cindral Ashlands': 'Cindral', 'Thornwild Confederation': 'Thornwild',
  'Kesmarch Frontier': 'Kesmarch', 'Elven Confederacy': 'Elvenhome',
  'Sahenna Compact': 'Sahenna', 'Qeshara Sultanate': 'Qeshara',
};

function readTies() {
  const p = '/home/user/Towers-of-Saeroth/campaign/nations/Political Relations.md';
  const out = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s.startsWith('|') || /^\|[\s:|-]+\|$/.test(s)) continue;
    const cs = s.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    if (cs.length < 2) continue;
    const pair = [...cs[0].matchAll(/\[\[([^\]|#]+)[^\]]*\]\]/g)].map(m => m[1].trim());
    if (pair.length !== 2) continue;
    const st = cs[1].replace(/\*/g, '').trim();
    if (DIPLO[st]) out.push([pair[0], pair[1], st]);
  }
  return out;
}

// The nine trade corridors, read out of the note that already describes them.
// Same rule as the diplomacy: the markdown table is the source of truth and
// nothing here restates it. A row is
//   | **Name** | Road | [[A]] -> [[B]] -> [[C]] | what it carries |
// and the run is an ordered list of wikilinks, exactly as the site's own
// `view: routes` reads it — so a stop added to the note moves the line on the
// map and on the site together, with no change here.
function readCorridors() {
  const p = '/home/user/Towers-of-Saeroth/campaign/world/Trade Routes.md';
  const out = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (t[0] !== '|') continue;
    const cs = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    if (cs.length < 4) continue;
    const name = cs[0].replace(/\*+/g, '').trim();
    const carry = cs[1].replace(/\*+/g, '').trim().toLowerCase();
    const stops = [...cs[2].matchAll(/\[\[([^\]|#]+)[^\]]*\]\]/g)].map(m => m[1].trim());
    if (!name || stops.length < 2 || !CARRIER[carry]) continue;
    out.push({ name, carry, stops, cargo: cs[3] || '' });
  }
  return out;
}

const openApp = b => APP.openApp(b, { width: MAP_W, height: MAP_H, cells: CELLS });
async function baseGen(p, c) {
  return p.evaluate(async (c) => {
    // The world's own latitude model fixes the map scale, so there is no reason
    // to let the dice pick it: the canvas spans LAT_TOP..LAT_BOT degrees over
    // its own height, and a degree of latitude is 111 km. Left random it came
    // out anywhere from 1 to 5 km per pixel, which makes every distance and
    // every journey time on the map wrong by up to a factor of five — and the
    // trade corridors are measured in exactly those units.
    const kmPerPx = Math.round(1110 * c.latSpan / graphHeight) / 10;
    const L = { template: c.tmpl, statesNumber: '24', cultures: '12', religionsNumber: '6',
                temperatureEquator: String(c.eq), temperatureNorthPole: String(c.np),
                temperatureSouthPole: String(c.sp), prec: String(c.prec), provincesRatio: '30',
                distanceScale: String(kmPerPx) };
    for (const [k, v] of Object.entries(L)) localStorage.setItem(k, v);
    applyOption(document.getElementById('templateInput'), c.tmpl, c.tmpl);
    options.temperatureEquator = c.eq; options.temperatureNorthPole = c.np;
    options.temperatureSouthPole = c.sp; options.prec = c.prec;
    options.mapSize = 100; options.latitude = 50;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('statesNumber', '24'); set('precInput', String(c.prec));
    set('mapSizeInput', '100'); set('latitudeInput', '50');
    // the stored key alone is not enough: it stops randomizeOptions rerolling
    // the value, but nothing reads it back into the live input mid-session
    set('distanceScaleInput', String(kmPerPx));
    window.distanceScale = kmPerPx;
    // cell density is read from pointsInput.dataset.cells, NOT from the url —
    // the ?cells= parameter is silently ignored once a value has been stored
    const pts = document.getElementById('pointsInput');
    if (pts) {
      const LADDER = [1000, 2000, 5000, 10000, 20000, 30000, 40000, 50000,
                      60000, 70000, 80000, 90000, 100000];
      let idx = 0;
      for (let k = 0; k < LADDER.length; k++) if (LADDER[k] <= c.cells) idx = k;
      pts.value = String(idx + 1);
      pts.dataset.cells = String(c.cells);
      localStorage.setItem('points', String(idx + 1));
    }
    const before = window.mapId;
    regenerateMap({ seed: c.seed });
    const t0 = Date.now();
    while (window.mapId === before && Date.now() - t0 < 240000) await new Promise(r => setTimeout(r, 300));
    await new Promise(r => setTimeout(r, 500));
    // regenerateMap runs randomizeOptions, which re-reads the input: put the
    // value back on the global as well, since that is what the save writes
    window.distanceScale = kmPerPx;
    return { w: graphWidth, h: graphHeight, grid: grid.cells.i.length,
             pack: pack.cells.i.length, kmPerPx };
  }, c);
}

(async () => {
  let ties = readTies();
  let corridors = readCorridors();
  console.log(`read ${ties.length} ties and ${corridors.length} trade corridors from the vault`);
  if (REGION) {
    // A tie or a trade leg between two continents has nowhere to be drawn on a
    // map holding one of them. Drop them here rather than letting the forge
    // fail to find a route it was never going to find, and say what was
    // dropped, because getting them back is what the merge is FOR.
    const keep = n => WD.SIZE[n] !== undefined;
    const tiesOut = ties.length;
    ties = ties.filter(t => keep(t[0]) && keep(t[1]));
    const cut = [];
    corridors = corridors.map(c => {
      const stops = c.stops.filter(keep);
      if (stops.length !== c.stops.length) cut.push(`${c.name} (${c.stops.length - stops.length} stop(s) off-map)`);
      return stops.length >= 2 ? Object.assign({}, c, { stops }) : null;
    }).filter(Boolean);
    console.log(`region ${REGION}: ${WD.why}`);
    console.log(`  ${Object.keys(WD.SIZE).length} nations, ${WD.BORDERS.length} required borders, ` +
                `${WD.LAT_TOP}N to ${WD.LAT_BOT}N`);
    console.log(`  ${ties.length}/${tiesOut} ties on this map; ${corridors.length} corridors` +
                (cut.length ? `, trimmed: ${cut.join(', ')}` : ''));
  }
  // Only the west reaches the ice. Building a cap on a map whose north edge is
  // 48N puts a glacier in the temperate zone.
  // A region's own land budget has to beat build.js's world-map defaults —
  // an archipelago at the world's 0.43 land comes out as a continent with
  // channels in it — but an explicit OPTS from the command line still wins.
  const ENV = JSON.parse(process.env.OPTS || '{}');
  const ICE = REGION ? Object.assign(
    WD.ice ? {} : { iceLift: 0, iceMoat: 0 },
    { landFraction: WD.landFraction, settledFraction: WD.settledFraction,
      // a region holds one continent, so a stock template can simply BE it
      landFrom: 'template', oneContinent: WD.oneContinent },
    WD.donorAmp ? { donorAmp: WD.donorAmp } : {},
    ENV) : {};
  const b = await APP.launch();
  const p = await openApp(b);
  p.on('pageerror', e => console.log('  [pageerror] ' + e.message.slice(0, 200)));
  const base = await baseGen(p, Object.assign({ cells: CELLS, latSpan: WD.LAT_TOP - WD.LAT_BOT }, CFG));
  console.log(`canvas ${base.w}x${base.h}, grid ${base.grid} cells, pack ${base.pack}, ` +
              `${base.kmPerPx} km per pixel`);
  console.log(`forging world seed ${OPTS.seed}`);

  const t0 = Date.now();
  const r = await WD.forgeWorld(p, Object.assign({
    SIZE: WD.SIZE, LAND: WD.LAND, CLAIM: WD.CLAIM, BORDERS: WD.BORDERS,
    RIDGE_BORDERS: WD.RIDGE_BORDERS, GROUP: WD.GROUP,
    ANCHOR: WD.ANCHOR, WILD: WD.WILD, GROUP_SHARE: WD.GROUP_SHARE, ISLE_LANES: WD.ISLE_LANES,
    LAT_TOP: WD.LAT_TOP, LAT_BOT: WD.LAT_BOT }, OPTS, ICE));
  console.log(`forged in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const l of r.log) console.log('  ' + l);

  let maj = 0;
  const fails = [];
  for (const s of r.prof) {
    const k = WD.CLAIM[s.nation];
    const v = k === 'islands' ? (s.islands >= 3 ? 1 : 0) : s[k];
    if (v >= 0.5) maj++; else fails.push(`${s.nation} ${k}=${Math.round(v * 100)}%`);
  }
  const nb = Object.fromEntries(r.prof.map(s => [s.nation, new Set(s.neighbours)]));
  const gotB = WD.BORDERS.filter(([a, c]) => nb[a] && nb[a].has(c));
  const BI = ['Marine','HotDesert','ColdDesert','Savanna','Grassland','TropSeasForest','TempDecidForest',
              'TropRainforest','TempRainforest','Taiga','Tundra','Glacier','Wetland'];
  const mix = Object.entries(r.biomeMix).sort((a, b2) => b2[1] - a[1])
    .map(([k, v]) => `${BI[k] || k} ${Math.round(v / r.landTotal * 100)}%`).join(' ');
  // How much of the map's political geography the vault actually asked for. A
  // world where every frontier is one the notes have an opinion about reads as
  // a diagram of the diplomacy rather than as a place: most countries border
  // someone they have nothing to say about, and those are the frontiers that
  // make the rest look like geography instead of a graph.
  const tieSet = new Set(ties.map(t => [t[0], t[1]].sort().join('|')));
  const frontier = new Set();
  for (const s of r.prof) for (const n of s.neighbours) frontier.add([s.nation, n].sort().join('|'));
  const quiet = [...frontier].filter(k => !tieSet.has(k)).length;

  console.log(`terrain majority ${maj}/${r.prof.length}, borders ${gotB.length}/${WD.BORDERS.length}, ` +
              `${r.unclaimed} unclaimed of ${r.landTotal} land (${r.wildTotal} wilderness), ` +
              `${r.rivers} rivers, ${r.lakes} lakes, shore ${(r.intricacy * 100).toFixed(0)}%, ` +
              `${r.masses} landmasses`);
  console.log('  biomes: ' + mix);
  console.log(`  frontiers: ${frontier.size} in all, ${quiet} of them between nations ` +
              `the vault says nothing about (${Math.round(100 * quiet / Math.max(1, frontier.size))}%)`);
  const sizes = r.prof.slice().sort((a, c) => c.cells - a.cells);
  console.log(`  largest ${sizes[0].nation} ${(100 * sizes[0].cells / (r.landTotal - r.wildTotal)).toFixed(0)}%, ` +
              `smallest ${sizes[sizes.length - 1].nation} ${sizes[sizes.length - 1].cells} cells`);
  if (fails.length) {
    console.log('  short:');
    for (const f of fails) {
      const s = r.prof.find(x => f.startsWith(x.nation));
      const L = WD.LAND[s.nation];
      console.log(`    ${f.padEnd(34)} lat ${L.tlat}/${s.lat}  T ${L.temp}/${s.meanT.toFixed(0)}` +
                  `  P ${L.prec}/${s.meanP.toFixed(0)}  h ${s.meanH.toFixed(0)}  ` +
                  s.top.map(([k, v]) => `${BI[k]} ${v}%`).join(' '));
    }
  }
  console.log('  latitudes want/got: ' + r.prof.map(s =>
    `${s.nation.split(' ')[0]} ${WD.LAND[s.nation].tlat}/${s.lat}`).join(', '));
  if (r.colonies && r.colonies.length)
    console.log('  colonies: ' + r.colonies.map(c => `${c.nation} ${c.cells}`).join(', '));
  if (r.founded.length) console.log('founded capitals: ' + r.founded.map(x => x.nation).join(', '));

  // labels are culled to the visible viewport, so the window has to be the
  // size of the map BEFORE anything is drawn or most of them never appear
  p.setDefaultTimeout(600000);
  await p.setViewportSize({ width: MAP_W, height: MAP_H });
  await p.evaluate(() => { if (typeof resetZoom === 'function') resetZoom(0); });
  const res = await p.evaluate(async (a) => {
    const { names, ties, DIPLO, FORMS, SHORT } = a;
    const byName = {};
    names.forEach((nation, k) => {
      const s = pack.states[k + 1];
      if (!s) return;
      const f = FORMS[nation] || ['Monarchy', 'Kingdom'];
      s.name = SHORT[nation] || nation;
      s.fullName = nation; s.form = f[0]; s.formName = f[1]; s.removed = false;
      byName[nation] = k + 1;
    });
    const ids = pack.states.filter(s => s.i && !s.removed).map(s => s.i);
    const maxId = Math.max.apply(null, ids);
    for (const s of pack.states) {
      if (!s.i || s.removed) continue;
      s.diplomacy = new Array(maxId + 1).fill('Neutral');
      s.diplomacy[0] = 'x'; s.diplomacy[s.i] = 'x';
    }
    // ---- one culture per nation, named in its own tongue -------------------
    // Azgaar seeds a dozen random cultures with real-world bases and no
    // relation to the states drawn over them, so every burg in the world was
    // named off the wrong one — Nordheim's capital came out "Iututute" from a
    // Roman base, the dwarves of Stoneborn got Scythian names. Rebuild the
    // cultures to BE the nations, then rename everything from them.
    const oldCulture = {};
    (pack.cultures || []).forEach(c => { if (c) oldCulture[c.i] = c.name; });
    const cultures = [{ i: 0, name: 'Wildlands', base: 32, origins: [null],
                        shield: 'round', type: 'Generic' }];
    for (const s of pack.states) {
      if (!s.i || s.removed) continue;
      const nation = s.fullName;
      cultures[s.i] = {
        i: s.i, name: s.name, base: a.NAME_BASE[nation] === undefined ? 32 : a.NAME_BASE[nation],
        origins: [0], shield: (s.coa && s.coa.shield) || 'round',
        center: s.center, type: a.CULTURE_TYPE[nation] || 'Generic',
        expansionism: 1, code: s.name.slice(0, 2).toUpperCase(),
        color: s.color
      };
    }
    // ids must stay dense or the culture layer indexes past the end of the array
    for (let k = 0; k < cultures.length; k++) if (!cultures[k])
      cultures[k] = { i: k, name: 'Wildlands', base: 32, origins: [0], shield: 'round', type: 'Generic' };
    pack.cultures = cultures;
    // a cell's culture is simply whose land it is
    const cc = pack.cells;
    for (let i = 0; i < cc.i.length; i++) {
      const st = cc.state[i];
      cc.culture[i] = (cc.h[i] >= 20 && st && cultures[st]) ? st : 0;
    }
    for (const s of pack.states) if (s.i && !s.removed) s.culture = s.i;
    // Azgaar sites burgs by how much population a cell supports, so the wet
    // deciduous nations came out with 174 towns and the dry grassland ones with
    // one. That is defensible geography and useless at a table — a nation you
    // can travel through needs somewhere to stop. Top the thin ones up on their
    // own best ground, spaced out, using the app's own burg builder so the new
    // ones get real coats of arms, markets and trade like the rest.
    const MIN_BURGS = a.minBurgs || 6, GAP = a.burgGap || 46;
    const landOf = {};
    for (let i = 0; i < cc.i.length; i++) {
      const st = cc.state[i];
      if (st && cc.h[i] >= 20 && !cc.burg[i]) (landOf[st] = landOf[st] || []).push(i);
    }
    const spots = pack.burgs.filter(b => b && b.i && !b.removed).map(b => [b.x, b.y]);
    let addedBurgs = 0;
    for (const s of pack.states) {
      if (!s.i || s.removed) continue;
      let have = pack.burgs.filter(b => b && b.i && !b.removed && b.state === s.i).length;
      if (have >= MIN_BURGS) continue;
      const list = (landOf[s.i] || []).sort((x, y) => (cc.s[y] || 0) - (cc.s[x] || 0));
      for (const i of list) {
        if (have >= MIN_BURGS) break;
        const x = cc.p[i][0], y = cc.p[i][1];
        if (spots.some(q => Math.hypot(q[0] - x, q[1] - y) < GAP)) continue;
        try { Burgs.add([x, y]); } catch (e) { continue; }
        spots.push([x, y]); have++; addedBurgs++;
      }
    }

    // rename every settlement from its own culture, capitals a little grander
    const used = new Set(); let renamedBurgs = 0; const capNames = [];
    for (const b of pack.burgs) {
      if (!b || !b.i || b.removed) continue;
      const cid = cc.culture[b.cell] || 0;
      // a capital the vault has already named keeps that name
      const canon = b.capital && a.CAPITAL[pack.states[b.state] && pack.states[b.state].fullName];
      let nm = '', k = 0;
      if (canon) nm = canon;
      else do {
        nm = b.capital ? Names.getCulture(cid, 5, 9, '') : Names.getCultureShort(cid);
        k++;
      } while ((!nm || used.has(nm)) && k < 40);
      if (!nm) continue;
      used.add(nm); b.name = nm; b.culture = cid; renamedBurgs++;
      if (b.capital) capNames.push([pack.states[b.state] && pack.states[b.state].fullName, nm, !!canon]);
    }
    // Everything downstream of a border was computed against a political map
    // that no longer exists. The forge stamps its own territory over the states
    // Azgaar drew, so the main roads ran between Azgaar's capitals, the
    // provinces belonged to countries that had since moved, and the stamp
    // cleared every army outright. Rebuild them on the map as it now stands —
    // and rebuild the ROADS first, because a trade corridor's land legs are
    // pathfound over the road network, so roads to the wrong capitals would
    // put the Salt Road through the wrong country.
    const rebuilt = [];
    for (const [what, step] of [
      ['statistics', () => States.collectStatistics()],
      ['roads', () => Routes.generate()],
      ['provinces', () => { Provinces.generate(); Provinces.getPoles(); }],
      ['armies', () => Military.generate()],
    ]) {
      try { step(); rebuilt.push(what); } catch (e) { rebuilt.push(what + ' FAILED: ' + e.message); }
    }

    // Goods are distributed by biome AND by culture type, and the culture types
    // were random until a moment ago — so the steppe khaganate was not counted
    // as nomadic when horses were handed out. Regenerate now that every nation
    // has its own culture, and patch the one distribution this world needs:
    // Azgaar puts horses on savanna and cold desert, but the great horse powers
    // here are on open GRASSLAND, which would have left the Khaganate and Tal
    // Ulad's circuit-grazed pasture without a single herd between them.
    let goodsFixed = 0;
    try {
      for (const g of (pack.goods || [])) {
        if (g.name === 'Horses' && g.distribution && !/biome\([^)]*\b4\b/.test(g.distribution)) {
          g.distribution = 'biome(3, 4) || (biome(2) && nth(4))';
          g.multipliers = g.multipliers || {};
          g.multipliers.cultureType = Object.assign({}, g.multipliers.cultureType, { Nomadic: 3 });
          goodsFixed++;
        }
      }
      Goods.generate({ randomSeed: 1 });
      // production is rebuilt once, after the vault's specialties are seeded
    } catch (e) { goodsFixed = -1; }

    // The vault says what each nation trades in. Bias its ground toward that:
    // a share of the resource cells inside each nation are switched to its own
    // specialties, and the rest keep whatever the terrain gave them, so the
    // notes are honoured without flattening the geography into a list.
    let seeded = 0;
    try {
      const byName = {};
      for (const g of (pack.goods || [])) byName[g.name] = g.i;
      for (const st of pack.states) {
        if (!st.i || st.removed) continue;
        const want = (a.SPECIALTY[st.fullName] || []).map(n => byName[n]).filter(Boolean);
        if (!want.length) continue;
        const mine = [];
        for (let i = 0; i < cc.i.length; i++)
          if (cc.state[i] === st.i && cc.h[i] >= 20 && cc.good[i]) mine.push(i);
        // enough to read as the nation's trade, not so much that a mountain
        // kingdom's every cell yields the same three things
        const take = Math.round(mine.length * (a.specialtyShare || 0.55));
        for (let k = 0; k < take; k++) {
          cc.good[mine[k]] = want[k % want.length];
          seeded++;
        }
      }
      Production.regenerate();
    } catch (e) { seeded = -1; }

    // per-nation resources, measured from the land rather than from what a
    // market happens to be holding: production[] also carries bought goods
    const res = {};
    for (let i = 0; i < cc.i.length; i++) {
      const st = cc.state[i], g = cc.good && cc.good[i];
      if (!st || !g || cc.h[i] < 20) continue;
      (res[st] = res[st] || {})[g] = (res[st][g] || 0) + 1;
    }

    // folk religions carry their culture's name, which is now a different word
    for (const r of (pack.religions || [])) {
      if (!r || !r.i || !r.culture) continue;
      const on = oldCulture[r.culture], nn = cultures[r.culture] && cultures[r.culture].name;
      if (on && nn && r.name) r.name = r.name.split(on).join(nn);
    }

    let applied = 0; const unmatched = [];
    for (const t of ties) {
      const ia = byName[t[0]], ib = byName[t[1]];
      if (!ia || !ib) { unmatched.push(t[0] + '/' + t[1]); continue; }
      pack.states[ia].diplomacy[ib] = DIPLO[t[2]];
      pack.states[ib].diplomacy[ia] = DIPLO[t[2]];
      applied++;
    }
    // ---- the vault's trade corridors, drawn as journeys -------------------
    // Trade is Azgaar's own feature now: a journey is a named, multi-leg route
    // with a transport per leg, saved with the map and drawn on its own layer.
    // The nine corridors the notes describe are exactly that shape, so they go
    // on the map as journeys rather than as decoration — each leg pathfound
    // between two real settlements over the real roads or the real sea lanes,
    // which is also the check that the corridor is possible on this map at
    // all: a leg with no route means two nations the vault has trading are
    // not actually connected.
    const trade = { laid: [], partial: [], legs: 0, skipped: [], detour: [], rerouted: [] };
    try {
      const tlist = Transports.getDefaults();
      let tid = Math.max.apply(null, tlist.map(t => t.i)) + 1;
      for (const t of a.EXTRA_TRANSPORTS) tlist.push(Object.assign({ i: tid++ }, t));
      Transports.set(tlist);

      // Azgaar's sea router prices water by how far from shore it is —
      // coastline 1, sea 1.8, open sea 4, ocean 6, anything deeper 8 — because
      // its own searoutes are coasting trade between neighbouring ports. Every
      // corridor here came out of that traced along the shoreline, so a run
      // from Xian Ti to Nordheim was drawn as an outline of the coast rather
      // than as a sea lane, and looked like one.
      //
      // Replace the schedule for the length of this pass. The cheapest water
      // is now `sea` — a cell or two off the beach, where a hull with a
      // destination actually sails — the shoreline itself costs more than
      // that, and the deep ocean is a premium rather than a wall.
      //
      // Keep a gradient. Flattening the schedule outright (everything at 1.6)
      // leaves the search nothing to follow, so it fans across the whole ocean
      // hunting one port's haven and the build goes from half a minute to ten.
      // The hard rules are untouched: leaving through a cell's own haven,
      // staying on a navigable river and not sailing into ice all come back
      // from the original as Infinity and are passed straight through.
      // The schedule runs the other way from Azgaar's: the shore is the
      // expensive water and the open ocean the cheap one, so a corridor
      // crosses instead of creeping. Making `sea` the cheapest tier was not
      // enough — a route still traced the coast one cell out, which looks
      // exactly as much like an outline of the continent as tracing the beach
      // does. There is still a gradient, and it still points somewhere: flat
      // water leaves the search nothing to follow, so it fans out across the
      // whole ocean hunting one port's haven and the build takes ten minutes.
      // Two schedules, because a barge and a merchantman want opposite things.
      // `sea` makes the open ocean the cheap water so a hull crosses instead of
      // creeping; `river` inverts it, so a barge takes a river where one goes
      // its way.
      //
      // It does not make one where there is none. The router refuses any land
      // cell that is not a recorded navigable river edge, so re-pricing can
      // only choose between paths that already exist — the Delta Run still
      // runs four times its straight line, because Grauthaven and Ilmen Wharf
      // are on different drainages and the only way between them is out to sea
      // and round. That is the map telling the truth, not the router failing.
      const WATER_MOD = {
        sea:   { land: 1.0, '-1': 1.9, '-2': 1.35, '-3': 1.05, '-4': 1.0, deep: 1.0 },
        river: { land: 0.7, '-1': 1.1, '-2': 1.8, '-3': 2.6, '-4': 3.2, deep: 3.6 },
      };
      let mod = WATER_MOD.sea;
      const seaCost = Routes.getWaterPathCost.bind(Routes);
      Routes.getWaterPathCost = function (from, to) {
        const c = seaCost(from, to);
        if (!isFinite(c)) return c;
        const d2 = dist2(pack.cells.p[from], pack.cells.p[to]);
        if (!(d2 > 0)) return c;
        const t2 = pack.cells.t[to];
        return d2 * (t2 >= 0 ? mod.land : (mod[t2] === undefined ? mod.deep : mod[t2]));
      };

      const burgsOf = id => pack.burgs.filter(b => b && b.i && !b.removed && b.state === id);
      const capitalOf = id => {
        const st = pack.states[id];
        return (st && st.capital && pack.burgs[st.capital]) || null;
      };
      // Where a corridor touches a nation. The capital wins whenever it CAN —
      // a delta or river capital is a valid water endpoint and the sea router
      // will run a hull up the river to reach it, which is the difference
      // between a corridor that visits a country and one that skims past its
      // beach. Only a capital the water cannot reach hands the leg to a port.
      //
      // Ranked rather than picked, because a valid endpoint is not the same as
      // a reachable one — the sea router insists on leaving through a cell's
      // own haven — so the leg tries the next candidate instead of giving up.
      const endpointsOf = (id, domain) => {
        const cap = capitalOf(id);
        const score = b => {
          let v = 1 + (b.population || 0);
          if (domain === 'water' && b.port) v *= 4;
          if (b === cap) v *= 40;
          return v;
        };
        return burgsOf(id)
          .filter(b => Journeys.isValidEndpoint(b.cell, domain))
          .sort((x, y) => score(y) - score(x))
          .slice(0, 3);
      };

      const journeys = [];
      a.corridors.forEach((cor, ci) => {
        const car = a.CARRIER[cor.carry];
        const tr = Transports.get(car.name);
        mod = WATER_MOD[cor.carry] || WATER_MOD.sea;
        const segments = [];
        let firstEnd = null, lastEnd = null;
        for (let k = 0; k + 1 < cor.stops.length; k++) {
          const na = cor.stops[k], nb = cor.stops[k + 1];
          const ia = byName[na], ib = byName[nb];
          if (!ia || !ib) { trade.skipped.push(`${cor.name}: ${na}/${nb} not on the map`); continue; }
          const AS = endpointsOf(ia, car.domain), BS = endpointsOf(ib, car.domain);
          let A = null, B = null, r = null, why = 'nowhere to leave from';
          for (const x of AS) {
            for (const y of BS) {
              // a land leg between two landmasses can only fail, and failing
              // costs a Dijkstra over the whole pack: nine of those per leg
              // turned a half-minute build into five minutes
              if (car.domain === 'land' && cc.f[x.cell] !== cc.f[y.cell]) {
                why = 'no-land-path'; continue;
              }
              const t2 = Journeys.findPath(x.cell, y.cell, car.domain);
              if (t2.errorCode || t2.points.length < 2) { why = t2.errorCode || 'no path'; continue; }
              A = x; B = y; r = t2; break;
            }
            if (r) break;
          }
          // A leg its own carrier cannot make is not automatically a hole in
          // the world: if the barges cannot float between two fens because
          // they sit on different drainages, the cargo goes overland, which is
          // what a smuggling run does anyway. Try the other domain before
          // calling the corridor broken — and say which legs did it, because a
          // river route carried on wheels is worth knowing about.
          let usedTr = tr;
          if (!r) {
            const alt = car.domain === 'water' ? 'land' : 'water';
            const altTr = Transports.get(alt === 'land' ? a.CARRIER.road.name
                                                        : a.CARRIER.sea.name);
            const AS2 = endpointsOf(ia, alt), BS2 = endpointsOf(ib, alt);
            for (const x of AS2) {
              for (const y of BS2) {
                if (alt === 'land' && cc.f[x.cell] !== cc.f[y.cell]) continue;
                const t3 = Journeys.findPath(x.cell, y.cell, alt);
                if (t3.errorCode || t3.points.length < 2) continue;
                A = x; B = y; r = t3; usedTr = altTr; break;
              }
              if (r) break;
            }
            if (r) trade.rerouted.push(`${cor.name}: ${na} \u2192 ${nb} goes by ` +
                                       `${usedTr.name.toLowerCase()} (${why})`);
          }
          if (!r) { trade.skipped.push(`${cor.name}: ${na} \u2192 ${nb} (${why})`); continue; }
          if (!firstEnd) firstEnd = A;
          lastEnd = B;
          segments.push({ i: segments.length, name: `${A.name} \u2192 ${B.name}`,
                          from: A.cell, to: B.cell, transport: usedTr.name, speed: usedTr.speed,
                          distance: r.distance, points: r.points });
        }
        const carried = segments.length;
        // A sea corridor that begins and ends at a wharf never enters the
        // country it is named for — it skims the beach and leaves, which is
        // what made the lines look like an outline of the coast rather than a
        // trade route. Where the capital could not take the hull itself, walk
        // the last stretch: the road from the quay up to the city is part of
        // the run, and mixed transport is what the Journeys layer is for.
        if (car.domain === 'water' && segments.length) {
          const road = Transports.get(a.CARRIER.road.name);
          const spur = (fromB, toB) => {
            if (!fromB || !toB || fromB === toB) return null;
            if (cc.f[fromB.cell] !== cc.f[toB.cell]) return null;
            const r2 = Journeys.findPath(fromB.cell, toB.cell, 'land');
            if (r2.errorCode || r2.points.length < 2) return null;
            return { name: `${fromB.name} \u2192 ${toB.name}`, from: fromB.cell, to: toB.cell,
                     transport: road.name, speed: road.speed,
                     distance: r2.distance, points: r2.points };
          };
          const head = spur(capitalOf(byName[cor.stops[0]]), firstEnd);
          const tail = spur(lastEnd, capitalOf(byName[cor.stops[cor.stops.length - 1]]));
          if (head) segments.unshift(head);
          if (tail) segments.push(tail);
          segments.forEach((sg, k2) => { sg.i = k2; });
        }
        // How far a leg wanders against the straight line between its ends.
        // A sea lane that creeps round every bay instead of crossing scores 3
        // or 4 here and reads on the map as an outline of the coast, which is
        // not something any number in the build was measuring.
        for (const sg of segments) {
          const A2 = cc.p[sg.from], B2 = cc.p[sg.to];
          const straight = Math.hypot(A2[0] - B2[0], A2[1] - B2[1]);
          if (straight > 1) trade.detour.push([cor.name, sg.name, sg.distance / straight]);
        }
        if (carried === cor.stops.length - 1) trade.laid.push(cor.name);
        else trade.partial.push(`${cor.name} ${carried}/${cor.stops.length - 1} legs`);
        if (!segments.length) return;
        journeys.push({ i: journeys.length, name: cor.name, type: 'Trade route',
                        color: a.ROUTE_COLORS[ci % a.ROUTE_COLORS.length], segments, lock: true });
        trade.legs += carried;
      });
      Routes.getWaterPathCost = seaCost;   // the app's own routes keep coasting
      // replaces the one journey the generator seeds every map with
      pack.journeys = journeys;
      // Azgaar's default styles are sized for a canvas about a thousand pixels
      // across. This one is 3,600, so a 1.8px corridor is a hairline you
      // cannot see at fit-width — which rather defeats putting the trade on
      // the map. Widen the journey stroke to match the canvas.
      // The style record is the source of truth since 1.150, but writing to it
      // does not touch the drawing: `Styles.apply` is what pushes the attrs
      // onto the layer group. Set one and not the other and the saved map is
      // right while every render out of this build is a hairline.
      if (window.styles && styles.journeys) {
        styles.journeys.attrs['stroke-width'] = a.journeyStroke || 5;
        styles.journeys.attrs.opacity = 0.85;
        try { Styles.apply('journeys'); } catch (e) { /* older build */ }
      }
    } catch (e) { trade.skipped.push('trade: ' + e.message); }

    // Every renderer used to be a bare global that could be called by name.
    // They are module-scoped now and reachable only through the layer
    // registry, which also knows the draw order — so ask it to redraw the lot
    // rather than naming nine functions that may or may not still exist.
    try { Layers.drawAll(); } catch (e) { /* cosmetic */ }
    await new Promise(x => setTimeout(x, 2500));
    const data = a.skip ? null : await window.Services.Save.prepareMapData();
    return { data, applied, unmatched, trade, rebuilt, renamed: Object.keys(byName).length, renamedBurgs, addedBurgs, goodsFixed, seeded, res, capNames, goodNames: (pack.goods||[]).map(g=>[g.i,g.name]), stateNames: pack.states.filter(x=>x.i&&!x.removed).map(x=>[x.i,x.fullName]), cultures: cultures.length - 1 };
  }, { names: r.names, ties, DIPLO, FORMS, SHORT, corridors, CARRIER, EXTRA_TRANSPORTS, ROUTE_COLORS,
       journeyStroke: OPTS.journeyStroke, seaDetour: OPTS.seaDetour,
       NAME_BASE: WORLD.NAME_BASE, CULTURE_TYPE: WORLD.CULTURE_TYPE, CAPITAL: WORLD.CAPITAL,
       SPECIALTY: WORLD.SPECIALTY, skip: !!process.env.SKIP_SAVE });

  // look at it before believing any of the numbers above
  // Layers are addressed by their own ids now (`Layers.set` turns the listed
  // ones on and everything else off), not by clicking a toggle button whose
  // element id the build had to guess at.
  const POLITICAL = ['texture', 'lakes', 'rivers', 'relief', 'states', 'borders',
                     'routes', 'ice', 'burgIcons', 'labels', 'journeys'];
  const views = process.env.NO_SHOT ? {} : {
    [PFX + '-world.png']: POLITICAL,
    [PFX + '-biomes.png']: ['biomes', 'lakes', 'rivers', 'ice'],
    [PFX + '-relief.png']: ['heightmap', 'lakes', 'rivers', 'relief'],
    [PFX + '-trade.png']: ['texture', 'lakes', 'rivers', 'states', 'borders',
                           'routes', 'burgIcons', 'journeys'],
  };
  for (const [file, on] of Object.entries(views)) {
    await p.evaluate(async (on) => {
      if (typeof resetZoom === 'function') resetZoom(0);
      Layers.set(on);
      await new Promise(r => setTimeout(r, 800));
      Layers.draw('labels');
      await new Promise(r => setTimeout(r, 1500));
    }, on);
    await APP.hideChrome(p);
    await APP.shoot(p, file);
    console.log('  shot ' + file);
  }
  await p.evaluate((on) => Layers.set(on), POLITICAL);

  if (r.stats) {
    const hi = Object.values(r.stats).filter(v => v && v.mtn >= 0.04)
      .sort((x, y) => y.mtn - x.mtn)
      .map(v => v.nation + ' ' + Math.round(v.mtn * 100) + '%');
    console.log('  mountain share: ' + (hi.join(', ') || 'none above 5%'));
  }
  if (res.res) {
    const G = {}; (res.goodNames || []).forEach(function (p) { G[p[0]] = p[1]; });
    console.log('  resources by nation (from the land):');
    for (const [id, nm] of res.stateNames) {
      const m = res.res[id] || {};
      const top = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 5)
        .map(([g, n]) => (G[g] || ('#' + g)) + '(' + n + ')');
      console.log('    ' + String(nm).padEnd(26) + (top.join(' ') || 'none'));
    }
  }
  if (res.capNames) {
    const gen = res.capNames.filter(c => !c[2]);
    console.log(`  capitals: ${res.capNames.length - gen.length} from the vault` +
                (gen.length ? `, generated for ${gen.map(c => c[0] + ' (' + c[1] + ')').join(', ')}` : ''));
  }
  console.log(`renamed ${res.renamed} states, ${res.renamedBurgs} burgs (${res.addedBurgs} added) across ${res.cultures} cultures, applied ${res.applied}/${ties.length} ties`);
  if (res.rebuilt) console.log('  rebuilt after the territory stamp: ' + res.rebuilt.join(', '));
  if (res.trade) {
    const wantLegs = corridors.reduce((n, c) => n + c.stops.length - 1, 0);
    console.log(`  trade: ${res.trade.laid.length}/${corridors.length} corridors whole, ` +
                `${res.trade.legs}/${wantLegs} legs pathfound`);
    const det = (res.trade.detour || []).slice().sort((x, y) => y[2] - x[2]);
    if (det.length) {
      const mean = det.reduce((n, d) => n + d[2], 0) / det.length;
      console.log(`    wander ${mean.toFixed(2)}x straight on average; ` +
                  'worst ' + det.slice(0, 3).map(d => `${d[1]} ${d[2].toFixed(1)}x`).join(', '));
    }
    for (const w of res.trade.rerouted || []) console.log('    REROUTED ' + w);
    for (const w of res.trade.partial) console.log('    PARTIAL ' + w);
    for (const w of res.trade.skipped) console.log('    no route: ' + w);
  }
  if (res.unmatched.length) console.log('  UNMATCHED: ' + res.unmatched.join(', '));
  // The profile is what `inspect.py` reads, so a scoring run has to write one
  // too — otherwise a sweep can only be ranked by eye on the console output,
  // which is how a map with a country in the polar ice got shipped twice.
  // A region build must not clobber the world build's profile, or the one the
  // last region wrote — inspect.py reads exactly one file and would happily
  // score the wrong map.
  fs.writeFileSync(process.env.PROFILE ||
    (REGION ? `saeroth-${REGION}-profile.json` : 'saeroth2-profile.json'), JSON.stringify({
    cfg: CFG, opts: OPTS, size: r.size, cells: r.cells, majority: maj, borders: gotB.length,
    unclaimed: r.unclaimed, wildTotal: r.wildTotal, landTotal: r.landTotal, rivers: r.rivers,
    lakes: r.lakes, masses: r.masses, intricacy: r.intricacy, biomeMix: r.biomeMix,
    prof: r.prof, log: r.log, founded: r.founded, colonies: r.colonies, trade: res.trade,
    ties: res.applied, tiesRead: ties.length, frontiers: frontier.size, quietFrontiers: quiet,
    corridors: corridors.map(c => ({ name: c.name, carry: c.carry, legs: c.stops.length - 1 })),
    claim: WD.CLAIM, land: WD.LAND, sizes: WD.SIZE, group: WD.GROUP, region: REGION || null }, null, 1));
  if (!process.env.SKIP_SAVE) {
    fs.writeFileSync(OUT, res.data);
    console.log(`wrote ${OUT} (${(res.data.length / 1e6).toFixed(1)} MB)`);
  }
  await b.close();
})();
