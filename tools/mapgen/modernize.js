// Bring an existing .map forward to the current Azgaar, without regenerating it.
//
// `build.js` forges a world from the vault and is the right tool when the world
// itself should change. This is the other case, and the more common one: a map
// that is already right — the coastline you want, the borders you want, the
// nations where you want them — saved by an older version of the generator, and
// missing everything the generator has grown since.
//
// So nothing here touches the terrain, the territories, the burgs, the rivers
// or the names. It loads the file through the app's own uploader, which runs
// Azgaar's own migration on the way in, adds the features that did not exist
// when the file was written, and saves it back.
//
//   node tools/mapgen/modernize.js
//   IN=some.map OUT=campaign/Saeroth.map node tools/mapgen/modernize.js
//
// What gets added:
//
//   - **Transports** (1.150). Three carriers the vault's corridors need and
//     Azgaar does not ship: a freight wagon, a camel caravan and a river barge.
//   - **Journeys** (1.150) — the nine trade corridors from
//     `campaign/world/Trade Routes.md`, each leg pathfound between two real
//     settlements over the real roads or the real sea lanes. This is also the
//     check that a corridor is possible at all: a leg with no route means two
//     nations the vault has trading are not connected on this map.
//   - **Diplomacy** re-applied from `campaign/nations/Political Relations.md`,
//     so a tie edited in the vault since the map was saved is on the map.
//
// A map that already has journeys gets them rebuilt rather than doubled.
//
// Needs Azgaar served on 5199, the same as build.js.
const APP = require('./app.js');
const fs = require('fs');
const path = require('path');
const { CARRIER, EXTRA_TRANSPORTS, ROUTE_COLORS, readCorridors, layJourneys } =
  require('./journeys.js');

const IN = process.env.IN || 'campaign/Saeroth.map';
const OUT = process.env.OUT || IN;
const PFX = process.env.PFX || 'saeroth';

// Same mapping build.js uses; the vault's standings are not Azgaar's words.
const DIPLO = {
  Allied: 'Ally', Friendly: 'Friendly', Trade: 'Friendly', Rivalry: 'Rival',
  Friction: 'Suspicion', Territorial: 'Rival', Hostile: 'Enemy', Covert: 'Neutral',
};

function readTies() {
  const p = path.join(__dirname, '..', '..', 'campaign', 'nations', 'Political Relations.md');
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

(async () => {
  const ties = readTies();
  const corridors = readCorridors();
  console.log(`read ${ties.length} ties and ${corridors.length} trade corridors from the vault`);

  // The header's first line carries the version and the canvas the map was
  // saved at. Boot the app at those dimensions: loading a 3600x2150 map into an
  // app booted at its 1200x700 default leaves the zoom fitted to the wrong
  // canvas, and every screenshot comes out as a corner of the world.
  const head = fs.readFileSync(IN, 'utf8').slice(0, 400).split('\n')[0].split('|');
  const savedBy = head[0], mw = +head[4] || 3600, mh = +head[5] || 2150;
  console.log(`${IN} was saved by Azgaar ${savedBy} at ${mw}x${mh}`);

  const b = await APP.launch();
  const p = await APP.openApp(b, { width: mw, height: mh, cells: 50000,
                                   viewport: { width: 1800, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await APP.loadMap(p, IN);

  const before = await p.evaluate(() => ({
    version: (typeof version !== 'undefined' ? version : '?'),
    w: graphWidth, h: graphHeight,
    states: pack.states.filter(s => s.i && !s.removed).length,
    burgs: pack.burgs.filter(x => x && x.i && !x.removed).length,
    journeys: (pack.journeys || []).length,
    transports: (typeof Transports !== 'undefined' ? Transports.getDefaults().length : 0),
    scale: window.distanceScale,
  }));
  console.log(`loaded: ${before.w}x${before.h}, ${before.states} states, ${before.burgs} burgs, ` +
              `${before.journeys} journeys, ${before.transports} transports, running on ${before.version}`);

  const res = await p.evaluate(async (a) => {
    const out = { applied: 0, unmatched: [] };

    // Diplomacy, re-applied from the note. Matching is by the full name the
    // vault uses and by the short one the map may carry instead, because these
    // maps were named before the current naming pass existed.
    const byName = {};
    for (const s of pack.states) {
      if (!s || !s.i || s.removed) continue;
      byName[s.fullName] = s.i;
      byName[s.name] = s.i;
    }
    for (const t of a.ties) {
      const ia = byName[t[0]], ib = byName[t[1]];
      if (!ia || !ib) { out.unmatched.push(t[0] + '/' + t[1]); continue; }
      pack.states[ia].diplomacy[ib] = a.DIPLO[t[2]];
      pack.states[ib].diplomacy[ia] = a.DIPLO[t[2]];
      out.applied++;
    }

    // Markets and production came in after some of these maps were saved, and
    // a journey wants somewhere to be going. Rebuild them if the map has none.
    try {
      if (typeof Markets !== 'undefined' && !(pack.markets || []).length) {
        Markets.generate(); out.markets = (pack.markets || []).length;
      }
      if (typeof Production !== 'undefined' && !(pack.goods || []).length) {
        Production.regenerate(); out.goods = (pack.goods || []).length;
      }
    } catch (e) { out.marketErr = e.message; }

    // Provinces and standing armies are generator features this map predates,
    // and both are per-state derivations rather than anything about the
    // terrain — so they can be added to a finished world without touching it.
    // Only when the map has none: regenerating provinces on a map that already
    // has them would throw away names somebody may have edited.
    out.built = [];
    for (const [what, have, run] of [
      ['statistics', () => true, () => States.collectStatistics()],
      ['provinces', () => (pack.provinces || []).filter(x => x && x.i).length,
        () => { Provinces.generate(); Provinces.getPoles(); }],
      ['armies', () => pack.states.some(x => x && x.i && (x.military || []).length),
        () => Military.generate()],
    ]) {
      try {
        if (what !== 'statistics' && have()) continue;
        run(); out.built.push(what);
      } catch (e) { out.built.push(what + ' FAILED: ' + e.message); }
    }

    // journeys.js runs inside the page, so it comes across as source
    out.trade = (new Function('return ' + a.laySrc))()(a);

    try { Layers.drawAll(); } catch (e) { /* cosmetic */ }
    await new Promise(x => setTimeout(x, 2500));
    return out;
  }, { ties, DIPLO, corridors, CARRIER, EXTRA_TRANSPORTS, ROUTE_COLORS,
       journeyStroke: Number(process.env.JOURNEY_STROKE || 5),
       seaDetour: Number(process.env.SEA_DETOUR || 0) || undefined,
       laySrc: layJourneys.toString() });

  console.log(`  diplomacy: ${res.applied}/${ties.length} ties applied` +
              (res.unmatched.length ? `, unmatched: ${res.unmatched.slice(0, 4).join(', ')}` : ''));
  if (res.markets) console.log(`  generated ${res.markets} markets`);
  if (res.goods) console.log(`  generated ${res.goods} goods`);
  if (res.marketErr) console.log(`  markets/production: ${res.marketErr}`);
  if ((res.built || []).length) console.log(`  generated: ${res.built.join(', ')}`);

  const t = res.trade || {};
  console.log(`  trade: ${(t.laid || []).length}/${corridors.length} corridors whole, ` +
              `${t.legs || 0} legs pathfound`);
  for (const k of ['partial', 'rerouted', 'detour', 'skipped']) {
    for (const line of (t[k] || [])) console.log('    ' + line);
  }

  const after = await p.evaluate(() => ({
    journeys: (pack.journeys || []).length,
    transports: Transports.getDefaults().length,
    segments: (pack.journeys || []).reduce((n, j) => n + (j.segments || []).length, 0),
  }));
  console.log(`  now ${after.journeys} journeys over ${after.segments} legs, ` +
              `${after.transports} transports`);

  if (!after.journeys) {
    console.log('refusing to save — no journeys were laid, so nothing was gained');
    console.log('ERRORS:', errs.length ? errs.slice(0, 3) : 'none');
    await b.close();
    process.exit(1);
  }

  if (!process.env.NO_SHOT) {
    const views = {
      [PFX + '-world.png']: ['texture', 'lakes', 'rivers', 'relief', 'states', 'borders',
                             'routes', 'ice', 'burgIcons', 'labels', 'journeys'],
      [PFX + '-trade.png']: ['texture', 'lakes', 'rivers', 'states', 'borders',
                             'routes', 'burgIcons', 'journeys'],
    };
    for (const [file, on] of Object.entries(views)) {
      await p.evaluate(async on => {
        // Loading a .map fits the svg to the browser window, and the shot is
        // taken of the svg element — so without this every screenshot is the
        // top-left corner of the world at 1:1. Put the element back to the
        // map's own size first; a generated map never needed it, because it is
        // already at those dimensions.
        const svg = document.getElementById('map');
        if (svg) {
          svg.setAttribute('width', graphWidth);
          svg.setAttribute('height', graphHeight);
          svg.style.width = graphWidth + 'px';
          svg.style.height = graphHeight + 'px';
        }
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
  }

  const data = await p.evaluate(() => window.Services.Save.prepareMapData());
  fs.writeFileSync(OUT, data);
  console.log(`wrote ${OUT} (${(data.length / 1048576).toFixed(1)} MB), ` +
              `saved by ${data.slice(0, data.indexOf('|'))}`);
  console.log('ERRORS:', errs.length ? errs.slice(0, 3) : 'none');
  await b.close();
})();
