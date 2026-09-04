// Add settlements to a nation on an EXISTING map, without regenerating it.
//
// Azgaar places burgs by habitability, and two nations came out of the build at
// build.js's MIN_BURGS floor of 6 despite notes that describe them as settled
// country: Silicar is "a wet low basin, cut with rivers" exporting food, and
// the Qeshara Sultanate is a network of oasis towns on the caravan roads. Their
// terrain scored drier than their notes read, so neither earned its towns.
//
// This loads the saved .map through the app's own uploader, adds burgs with the
// app's own builder — so they get real coats of arms, markets and trade like
// every other burg — names them from the nation's own culture, and saves back
// over the same file. Nothing else on the map is touched: same seed, same
// coastline, same borders, same everything.
//
//   node tools/mapgen/touchup.js
//   MAP=... TARGETS='{"Silicar":28}' node tools/mapgen/touchup.js
//
// Needs Azgaar served on 5199, the same as build.js.
const APP = require('./app.js');
const fs = require('fs');

const MAP = process.env.MAP || 'campaign/Saeroth.map';
// how many burgs each nation should end up with, and why
const TARGETS = JSON.parse(process.env.TARGETS || JSON.stringify({
  'Silicar': 28,              // ~10 cells/burg, the density of its peers on the
                              // same wet lowland — Thesal 10, Corvane 8, Vaelic 8
  'Qeshara Sultanate': 14,    // ~26 cells/burg: denser than Thurigypt's one-river
                              // desert at 99, sparser than temperate farmland
}));
const GAP = Number(process.env.GAP || 26);   // px between any two burgs

(async () => {
  const b = await APP.launch();
  const p = await APP.openApp(b);
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await APP.loadMap(p, MAP);

  const res = await p.evaluate(({ TARGETS, GAP }) => {
    const cc = pack.cells;
    const out = [];
    const live = () => pack.burgs.filter(x => x && x.i && !x.removed);
    const spots = live().map(x => [x.x, x.y]);
    const used = new Set(live().map(x => x.name));

    for (const [name, want] of Object.entries(TARGETS)) {
      const st = pack.states.find(s => s.i && !s.removed && s.fullName === name);
      if (!st) { out.push({ name, error: 'no such state' }); continue; }
      const before = live().filter(x => x.state === st.i).length;

      // its own best ground first: habitability, then anywhere land and empty
      const land = [];
      for (let i = 0; i < cc.i.length; i++)
        if (cc.state[i] === st.i && cc.h[i] >= 20 && !cc.burg[i]) land.push(i);
      land.sort((x, y) => (cc.s[y] || 0) - (cc.s[x] || 0));

      let have = before, added = 0;
      for (const i of land) {
        if (have >= want) break;
        const x = cc.p[i][0], y = cc.p[i][1];
        if (spots.some(q => Math.hypot(q[0] - x, q[1] - y) < GAP)) continue;
        let id;
        // Burgs.add returns the new burg's ID, not the burg — resolve it, and
        // fall back to whatever now sits on the cell
        try { id = Burgs.add([x, y]); } catch (e) { continue; }
        if (id === undefined || id === null) id = cc.burg[i];
        const nb = typeof id === 'number' ? pack.burgs[id] : id;
        if (!nb || !nb.i) continue;
        spots.push([x, y]); have++; added++;

        // name it from the culture that actually lives there
        const cid = cc.culture[i] || 0;
        let nm = '', k = 0;
        do { nm = Names.getCultureShort(cid); k++; } while ((!nm || used.has(nm)) && k < 40);
        if (nm) { used.add(nm); nb.name = nm; }
        nb.culture = cid;
        nb.state = st.i;
      }
      // count what is actually on the map rather than what the loop thinks it
      // did — an earlier version of this script trusted `have`, reported +0,
      // and had in fact put a burg on every land cell in the country
      const actual = live().filter(x => x.state === st.i).length;
      out.push({ name, before, after: actual, added, want,
                 cells: land.length + before,
                 mismatch: actual === have ? null : `loop counted ${have}` });
    }
    // states carry their own burg tally; keep it honest
    for (const s of pack.states) if (s.i && !s.removed)
      s.burgs = live().filter(x => x.state === s.i).length;
    return out;
  }, { TARGETS, GAP });

  let bad = false;
  for (const r of res) {
    if (r.error) { console.log(`  ${r.name}: ${r.error}`); bad = true; continue; }
    console.log(`  ${r.name.padEnd(20)} ${r.before} -> ${r.after} burgs (+${r.added})`
      + (r.mismatch ? `  !! ${r.mismatch}` : ''));
    if (r.mismatch || r.after > r.want) bad = true;
  }
  if (bad) { console.log('refusing to save — the map was not changed as asked'); await b.close(); process.exit(1); }

  const data = await p.evaluate(() => window.Services.Save.prepareMapData());
  fs.writeFileSync(MAP, data);
  console.log(`rewrote ${MAP} (${(data.length / 1048576).toFixed(1)} MB)`);
  console.log('ERRORS:', errs.length ? errs.slice(0, 3) : 'none');
  await b.close();
})();
