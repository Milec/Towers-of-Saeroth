// Build Saeroth.map from world2.js/forge2.js on a big canvas.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const W = require('./forge.js');
const WORLD = require('./world.js');
const fs = require('fs');

const MAP_W = +(process.env.MAP_W || 3600);
const MAP_H = +(process.env.MAP_H || 2150);
const CELLS = +(process.env.CELLS || 50000);

const CFG = { tmpl: 'continents', eq: 29, np: -30, sp: -28, prec: 100, seed: '1' };
const OPTS = Object.assign({
  seed: 101,
  landFraction: 0.43, settledFraction: 0.86,
  plates: 64, layoutIters: 900, attract: 0.10, touchAt: 0.82,
  separate: 1.12, repel: 0.05, cohesion: 0.012, latPull: 0.030, groupGap: 1.9,
  capIters: 50, growIters: 45, growGain: 0.30, snapIters: 26, coastPull: 1200, coastWant: 4, ridgePull: 6000, ridgeWant: 0.35,
  latCost: 14000, latFree: 4, latBar: 2.4, ruins: 26, keepC: 0.72, varT: 0.5, varP: 0.38,
  borderFix: 45, minCells: 60, microCorridor: 8,
  relaxRounds: 14, sizeTol: 0.18, blur: 2, plateYield: 0.85,
  orogenLift: 58, lakes: 6, lakeR: 4.0, arcFreq: 0.009, arcLand: 0.46, arcNeed: 1.15,
  orogenyMinor: 0.30, foldFloor: 0.26, flatPush: 120000, flatFree: 0.20, flatCeil: 50, foldSharp: 1.7, spineAt: 0.38, orogeny: 2.9, beltWidth: 2.0, frontWarp: 14, frontFreq: 0.0060, rift: 1.6, riftWidth: 4.0, straitMin: 160, hotspots: 14, moat: 4.0, moatW: 3.4, iceY: 0.040,
  contBase: 0.62, marginTop: 0.055, wildRelief: 2.0, wildFreq: 0.0050, reliefAmp: 0.98, minPond: 22,
  warpAmp: 165, warpFreq: 0.0016, coastNoise: 0.19, coastBand: 0.12, coastFreq: 0.007, fjordFreq: 0.022, weather: 1,
}, JSON.parse(process.env.OPTS || '{}'));
const OUT = process.env.OUT || 'Saeroth.map';
const PFX = process.env.PFX || 'saeroth2';

const DIPLO = {
  Allied: 'Ally', Friendly: 'Friendly', Trade: 'Friendly', Rivalry: 'Rival',
  Friction: 'Suspicion', Territorial: 'Rival', Hostile: 'Enemy', Covert: 'Neutral',
};
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
};
const SHORT = {
  'Thurion Merchant Alliance': 'Thurion', 'Stoneborn Holds': 'Stoneborn',
  'Undertide Reaches': 'Undertide', 'Khazan Khaganate': 'Khazan',
  'Voskreld Union': 'Voskreld', 'Vaelic Principality': 'Vaelic',
  'Thesal Theocracy': 'Thesal', 'Melisor Magocracy': 'Melisor',
  'Lazarian Lichdom': 'Lazarian', 'Corvane Republic': 'Corvane',
  'Cindral Ashlands': 'Cindral', 'Thornwild Confederation': 'Thornwild',
  'Kesmarch Frontier': 'Kesmarch', 'Elven Confederacy': 'Elvenhome',
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

async function openApp(b) {
  const p = await b.newPage({ viewport: { width: 1500, height: 850 } });
  await p.goto(`http://127.0.0.1:5199/Fantasy-Map-Generator/?seed=1&width=${MAP_W}&height=${MAP_H}&cells=${CELLS}`,
               { waitUntil: 'domcontentloaded', timeout: 240000 });
  await p.waitForFunction(() => window.pack && window.pack.states && window.pack.states.length > 1, { timeout: 300000 });
  return p;
}
async function baseGen(p, c) {
  return p.evaluate(async (c) => {
    const L = { template: c.tmpl, statesNumber: '24', cultures: '12', religionsNumber: '6',
                temperatureEquator: String(c.eq), temperatureNorthPole: String(c.np),
                temperatureSouthPole: String(c.sp), prec: String(c.prec), provincesRatio: '30' };
    for (const [k, v] of Object.entries(L)) localStorage.setItem(k, v);
    applyOption(document.getElementById('templateInput'), c.tmpl, c.tmpl);
    options.temperatureEquator = c.eq; options.temperatureNorthPole = c.np;
    options.temperatureSouthPole = c.sp; options.prec = c.prec;
    options.mapSize = 100; options.latitude = 50;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('statesNumber', '24'); set('precInput', String(c.prec));
    set('mapSizeInput', '100'); set('latitudeInput', '50');
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
    return { w: graphWidth, h: graphHeight, grid: grid.cells.i.length, pack: pack.cells.i.length };
  }, c);
}

(async () => {
  const ties = readTies();
  console.log(`read ${ties.length} ties from the vault`);
  const b = await chromium.launch({ args: ['--no-sandbox', '--js-flags=--max-old-space-size=6144'] });
  const p = await openApp(b);
  p.on('pageerror', e => console.log('  [pageerror] ' + e.message.slice(0, 200)));
  const base = await baseGen(p, Object.assign({ cells: CELLS }, CFG));
  console.log(`canvas ${base.w}x${base.h}, grid ${base.grid} cells, pack ${base.pack}`);
  console.log(`forging world seed ${OPTS.seed}`);

  const t0 = Date.now();
  const r = await W.forgeWorld(p, Object.assign({
    SIZE: W.SIZE, LAND: W.LAND, CLAIM: W.CLAIM, BORDERS: W.BORDERS, GROUP: W.GROUP,
    ANCHOR: W.ANCHOR, WILD: W.WILD, GROUP_SHARE: W.GROUP_SHARE, ISLE_LANES: W.ISLE_LANES, LAT_TOP: W.LAT_TOP, LAT_BOT: W.LAT_BOT }, OPTS));
  console.log(`forged in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const l of r.log) console.log('  ' + l);

  let maj = 0;
  const fails = [];
  for (const s of r.prof) {
    const k = W.CLAIM[s.nation];
    const v = k === 'islands' ? (s.islands >= 3 ? 1 : 0) : s[k];
    if (v >= 0.5) maj++; else fails.push(`${s.nation} ${k}=${Math.round(v * 100)}%`);
  }
  const nb = Object.fromEntries(r.prof.map(s => [s.nation, new Set(s.neighbours)]));
  const gotB = W.BORDERS.filter(([a, c]) => nb[a] && nb[a].has(c));
  const BI = ['Marine','HotDesert','ColdDesert','Savanna','Grassland','TropSeasForest','TempDecidForest',
              'TropRainforest','TempRainforest','Taiga','Tundra','Glacier','Wetland'];
  const mix = Object.entries(r.biomeMix).sort((a, b2) => b2[1] - a[1])
    .map(([k, v]) => `${BI[k] || k} ${Math.round(v / r.landTotal * 100)}%`).join(' ');
  console.log(`terrain majority ${maj}/${r.prof.length}, borders ${gotB.length}/${W.BORDERS.length}, ` +
              `${r.unclaimed} unclaimed of ${r.landTotal} land (${r.wildTotal} wilderness), ` +
              `${r.rivers} rivers, ${r.lakes} lakes, shore ${(r.intricacy * 100).toFixed(0)}%, ` +
              `${r.masses} landmasses`);
  console.log('  biomes: ' + mix);
  const sizes = r.prof.slice().sort((a, c) => c.cells - a.cells);
  console.log(`  largest ${sizes[0].nation} ${(100 * sizes[0].cells / (r.landTotal - r.wildTotal)).toFixed(0)}%, ` +
              `smallest ${sizes[sizes.length - 1].nation} ${sizes[sizes.length - 1].cells} cells`);
  if (fails.length) {
    console.log('  short:');
    for (const f of fails) {
      const s = r.prof.find(x => f.startsWith(x.nation));
      const L = W.LAND[s.nation];
      console.log(`    ${f.padEnd(34)} lat ${L.tlat}/${s.lat}  T ${L.temp}/${s.meanT.toFixed(0)}` +
                  `  P ${L.prec}/${s.meanP.toFixed(0)}  h ${s.meanH.toFixed(0)}  ` +
                  s.top.map(([k, v]) => `${BI[k]} ${v}%`).join(' '));
    }
  }
  console.log('  latitudes want/got: ' + r.prof.map(s =>
    `${s.nation.split(' ')[0]} ${W.LAND[s.nation].tlat}/${s.lat}`).join(', '));
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
    try {
      const lay = document.getElementById('labels');
      const el = lay && lay.querySelector('#states');
      if (el) el.innerHTML = '';
      ['drawFeatures', 'drawStateLabels', 'drawStates', 'drawBorders', 'drawRivers',
       'drawRelief', 'drawBurgIcons', 'drawLabels', 'drawIce'].forEach(fn => {
        if (typeof window[fn] === 'function') { try { window[fn](); } catch (e) {} }
      });
    } catch (e) { /* cosmetic */ }
    await new Promise(x => setTimeout(x, 2500));
    const data = a.skip ? null : await window.Services.Save.prepareMapData();
    return { data, applied, unmatched, renamed: Object.keys(byName).length, renamedBurgs, addedBurgs, goodsFixed, seeded, res, capNames, goodNames: (pack.goods||[]).map(g=>[g.i,g.name]), stateNames: pack.states.filter(x=>x.i&&!x.removed).map(x=>[x.i,x.fullName]), cultures: cultures.length - 1 };
  }, { names: r.names, ties, DIPLO, FORMS, SHORT, NAME_BASE: WORLD.NAME_BASE, CULTURE_TYPE: WORLD.CULTURE_TYPE, CAPITAL: WORLD.CAPITAL, SPECIALTY: WORLD.SPECIALTY, skip: !!process.env.SKIP_SAVE });

  // look at it before believing any of the numbers above
  const views = process.env.NO_SHOT ? {} : {
    [PFX + '-world.png']: { states: 1, biomes: 0, height: 0, relief: 1 },
    [PFX + '-biomes.png']: { states: 0, biomes: 1, height: 0, relief: 0 },
    [PFX + '-relief.png']: { states: 0, biomes: 0, height: 1, relief: 1 },
  };
  for (const [file, v] of Object.entries(views)) {
    await p.evaluate(async (v) => {
      if (typeof resetZoom === 'function') resetZoom(0);
      const want = (id, on) => { if (!!layerIsOn(id) !== !!on) { const e = document.getElementById(id); if (e) e.click(); } };
      want('toggleStates', v.states); want('toggleBiomes', v.biomes);
      want('toggleHeight', v.height); want('toggleRelief', v.relief);
      document.querySelectorAll('.dialog, #alert').forEach(d => { d.style.display = 'none'; });
      await new Promise(r => setTimeout(r, 800));
      if (typeof drawLabels === 'function') drawLabels();
      await new Promise(r => setTimeout(r, 1500));
    }, v);
    const el = await p.$('#map');
    await (el ? el.screenshot({ path: file }) : p.screenshot({ path: file }));
    console.log('  shot ' + file);
  }
  await p.evaluate(() => {
    const want = (id, on) => { if (!!layerIsOn(id) !== !!on) { const e = document.getElementById(id); if (e) e.click(); } };
    want('toggleStates', 1); want('toggleBiomes', 0); want('toggleHeight', 0); want('toggleRelief', 1);
  });

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
  if (res.unmatched.length) console.log('  UNMATCHED: ' + res.unmatched.join(', '));
  if (process.env.SKIP_SAVE) { await b.close(); return; }
  fs.writeFileSync(OUT, res.data);
  console.log(`wrote ${OUT} (${(res.data.length / 1e6).toFixed(1)} MB)`);
  fs.writeFileSync('saeroth2-profile.json', JSON.stringify({
    cfg: CFG, opts: OPTS, size: r.size, cells: r.cells, majority: maj, borders: gotB.length,
    unclaimed: r.unclaimed, wildTotal: r.wildTotal, landTotal: r.landTotal, rivers: r.rivers,
    lakes: r.lakes, masses: r.masses, intricacy: r.intricacy, biomeMix: r.biomeMix,
    prof: r.prof, log: r.log, founded: r.founded, colonies: r.colonies,
    claim: W.CLAIM, land: W.LAND }, null, 1));
  await b.close();
})();
