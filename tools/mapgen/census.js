// Audit — and repair — settlement population and capital placement on a
// finished map.
//
// Two things went wrong on `campaign/Saeroth.map` and both are the kind that
// hide in plain sight, because the map renders perfectly either way.
//
// **Suitability overflowed.** `pack.cells.s` is a Uint16Array, and seventeen
// land cells came out of the older generator pegged at 65535 against a median
// of 12 and a 99th percentile of 38. Azgaar derives a settlement's population
// straight from it — `cells.s / 5`, times 1.5 for a capital, times the cell's
// connectivity — so the five burgs standing on those cells were handed
// populations of six to thirty-three MILLION. The next largest settlement in
// the world has ninety thousand people. Between them those five held 84 of the
// world's 277 million, and Qeshara came out 98% urban.
//
// **A capital on a frontier.** Reichsmund is the seat of the Diet and the High
// Prince's court, and the note calls it a fortified river-city. It was sitting
// on a cell with foreign territory on two sides — a three-way corner — 197px
// off its own realm's centre, on a stream carrying a flux of 34.
//
// Neither is a judgement call about what the world should look like. The first
// is an integer overflow and the second is a capital in a place its own note
// says it is not. Everything else this prints, it prints and leaves alone.
//
//   node tools/mapgen/census.js            # audit only
//   FIX=1 node tools/mapgen/census.js      # repair and save
//   MAP=other.map FIX=1 node tools/mapgen/census.js
//
// Needs Azgaar served on 5199, the same as build.js.
const APP = require('./app.js');
const fs = require('fs');

const MAP = process.env.MAP || 'campaign/Saeroth.map';
const FIX = !!process.env.FIX;
// Above this a suitability is not a high score, it is a broken number: the 99th
// percentile of this map is 38.
const S_CEILING = Number(process.env.S_CEILING || 200);
// A named settlement below this many people is not a hamlet, it is a burg the
// broken suitability talked the generator into placing. The world's
// tenth-percentile settlement holds 1,254.
const STRAND_FLOOR = Number(process.env.STRAND_FLOOR || 250);
// How far one may be moved, in pixels. Far enough to find real ground, near
// enough that the roads and trade legs already drawn to it still make sense.
const STRAND_REACH = Number(process.env.STRAND_REACH || 220);
// Capitals to reseat, and what the vault says they are. A capital is only moved
// when its note describes a place it is demonstrably not sitting in.
// Two, and only two. Sunkenhold is "a warden-hold built across a chasm,
// reachable only by bridges that can be cut from either side" — small, third in
// its own realm and hard against a frontier is exactly what that note says, so
// it stays. Brightfurrow is "a canal-town where the guildhalls sit level with
// the locks they govern", and a canal town near a border in a 282-cell state is
// not a defect either. Neither is moved.
const RESEAT = JSON.parse(process.env.RESEAT || JSON.stringify({
  // "a fortified river-city that holds the Diet and the High Prince's court"
  'Reichsmund': { river: true, offBorder: 2 },
  // "a deepwater harbor town that swells fourfold whenever the Great Thing is
  // called", in a realm whose note says the sea is the road — and it was not a
  // port at all, in a country holding 121 coastal cells and 91 havens with one
  // port among its thirteen settlements
  'Hravnfjord': { port: true, offBorder: 1, wFlux: 0.3, wSuit: 1.6, wDist: 1.0 },
  // "a walled city of spice-souks and star-towers" — which the map had as the
  // fifth settlement of its own realm, on a desert peak. `first` because
  // Azgaar's suitability is an agricultural score and Qeshara is desert: the
  // model cannot see that a caravan city on the Salt Road is rich, so no cell
  // in the sultanate will ever hand its capital the size its note describes.
  'Myrrhkand': { river: false, offBorder: 1, first: true },
}));

(async () => {
  const b = await APP.launch();
  const head = fs.readFileSync(MAP, 'utf8').slice(0, 400).split('\n')[0].split('|');
  const p = await APP.openApp(b, { width: +head[4] || 3600, height: +head[5] || 2150,
                                   cells: 50000, viewport: { width: 1800, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await APP.loadMap(p, MAP);

  const out = await p.evaluate(async (a) => {
    const cc = pack.cells;
    const live = pack.states.filter(s => s && s.i && !s.removed);
    const nameOf = {}; live.forEach(s => { nameOf[s.i] = s.fullName || s.name; });
    const land = Array.from(cc.i).filter(i => cc.h[i] >= 20);
    const rate = populationRate, urb = urbanization;
    const K = v => Math.round(v * rate * urb);
    const conn = c => { try { return Routes.getConnectivityRate(c) || 1; } catch (e) { return 1; } };

    const report = { fixedCells: [], repopulated: [], moved: [], stranded: [], notes: [] };

    // ---- 1. the overflowed suitability -----------------------------------
    // Replaced with the median of the cell's own land neighbours rather than a
    // constant, so a genuinely good site stays a good site and a mountain-top
    // desert cell goes back to being one.
    const broken = land.filter(i => cc.s[i] > a.S_CEILING);
    for (const i of broken) {
      const near = cc.c[i].filter(c => cc.h[c] >= 20 && cc.s[c] <= a.S_CEILING)
        .map(c => cc.s[c]).sort((x, y) => x - y);
      const was = cc.s[i];
      cc.s[i] = near.length ? near[Math.floor(near.length / 2)] : 1;
      report.fixedCells.push([i, was, cc.s[i], nameOf[cc.state[i]] || 'unclaimed']);
    }

    // ---- 2. the settlements that were standing on them --------------------
    // Azgaar's own rule, minus its gaussian jitter: this has to be reproducible.
    if (broken.length) {
      const bset = new Set(broken);
      for (const bg of pack.burgs) {
        if (!bg || !bg.i || bg.removed || !bset.has(bg.cell)) continue;
        const was = bg.population;
        let v = cc.s[bg.cell] / 5;
        if (bg.capital) v *= 1.5;
        v *= conn(bg.cell);
        v += ((bg.i % 100) - (bg.cell % 100)) / 1000;   // unround, as the generator does
        bg.population = Math.round(Math.max(v, 0.01) * 1000) / 1000;
        report.repopulated.push([bg.name, nameOf[bg.state] || '-', K(was), K(bg.population)]);
      }
    }

    // ---- 3. capitals sitting somewhere their note says they are not -------
    const borderDist = (cell, state, cap) => {
      // rings out from the cell until foreign land is met
      let ring = [cell]; const seen = new Set(ring);
      for (let d = 1; d <= cap; d++) {
        const next = [];
        for (const i of ring) for (const c of cc.c[i]) {
          if (seen.has(c)) continue; seen.add(c); next.push(c);
          if (cc.h[c] >= 20 && cc.state[c] && cc.state[c] !== state) return d;
        }
        ring = next;
      }
      return cap + 1;
    };

    // One reseater, two callers. A capital in the wrong place and a village
    // stranded on a broken cell are the same operation with different
    // constraints: find the best ground this settlement's own realm has within
    // reach, and put it there.
    const reseat = (bg, want) => {
      const st = bg.state;
      const own = land.filter(i => cc.state[i] === st);
      if (!own.length) return { note: `${bg.name}: its state holds no land` };

      // What the search is measured from: a capital wants to sit near the
      // middle of its realm, a stranded village wants to stay near where the
      // map has already drawn it and its roads.
      let ax, ay;
      if (want.anchor === 'here') { ax = cc.p[bg.cell][0]; ay = cc.p[bg.cell][1]; }
      else {
        ax = 0; ay = 0;
        for (const i of own) { ax += cc.p[i][0]; ay += cc.p[i][1]; }
        ax /= own.length; ay /= own.length;
      }

      const maxFlux = Math.max.apply(null, own.map(i => cc.fl[i] || 0)) || 1;
      const maxS = Math.max.apply(null, own.map(i => cc.s[i])) || 1;
      const maxD = Math.max.apply(null, own.map(i =>
        Math.hypot(cc.p[i][0] - ax, cc.p[i][1] - ay))) || 1;
      const reach = want.reach || Infinity;

      let best = null, bestScore = -Infinity, bestHaven = null;
      for (const i of own) {
        if (cc.burg[i] && cc.burg[i] !== bg.i) continue;
        if (cc.h[i] >= (want.maxH || 70)) continue;
        const dist = Math.hypot(cc.p[i][0] - ax, cc.p[i][1] - ay);
        if (dist > reach) continue;
        if (want.river && !(cc.fl[i] > 0) && !cc.r[i]) continue;
        let haven = null;
        if (want.port) {
          // a deepwater harbour, not a beach: the cell must open onto water
          // through its own haven and be graded as sheltered
          if (!cc.haven[i]) continue;
          if (cc.harbor && cc.harbor[i] > (want.harbor || 1)) continue;
          haven = cc.haven[i];
        }
        if (want.offBorder && borderDist(i, st, want.offBorder) <= want.offBorder) continue;
        const score = (want.wFlux === undefined ? 2.2 : want.wFlux) * ((cc.fl[i] || 0) / maxFlux)
                    + (want.wSuit === undefined ? 1.0 : want.wSuit) * (cc.s[i] / maxS)
                    - (want.wDist === undefined ? 1.4 : want.wDist) * (dist / maxD);
        if (score > bestScore) { bestScore = score; best = i; bestHaven = haven; }
      }
      if (best === null || best === bg.cell)
        return { note: `${bg.name}: nothing inside ${nameOf[st]} scores better` };

      const from = { cell: bg.cell, x: bg.x, y: bg.y, s: cc.s[bg.cell],
                     fl: Math.round(cc.fl[bg.cell] || 0), port: !!bg.port,
                     border: borderDist(bg.cell, st, 3), pop: K(bg.population) };
      if (cc.burg[bg.cell] === bg.i) cc.burg[bg.cell] = 0;
      bg.cell = best;
      cc.burg[best] = bg.i;
      if (bestHaven !== null) {
        // sit on the water's edge, the way the generator places a port
        bg.port = cc.f[bestHaven];
        bg.x = Math.round((cc.p[best][0] + cc.p[bestHaven][0]) / 2 * 100) / 100;
        bg.y = Math.round((cc.p[best][1] + cc.p[bestHaven][1]) / 2 * 100) / 100;
      } else {
        bg.port = 0;
        bg.x = Math.round(cc.p[best][0] * 100) / 100;
        bg.y = Math.round(cc.p[best][1] * 100) / 100;
      }
      try { bg.type = Burgs.getType ? Burgs.getType(best, bg.port) : bg.type; } catch (e) { /* keep */ }

      let v = cc.s[best] / 5;
      if (bg.capital) v *= 1.5;
      v *= conn(best);
      // A city does not shrink because the map was corrected about where it
      // stands — but a settlement that only existed because of the overflow has
      // no size worth keeping, so it takes what its new ground supports.
      let pop = want.keepSize ? Math.max(v, bg.population, 0.01) : Math.max(v, 0.01);
      if (want.first) {
        const rivals = pack.burgs
          .filter(x => x && x.i && !x.removed && x.state === st && x.i !== bg.i)
          .map(x => x.population);
        const top = rivals.length ? Math.max.apply(null, rivals) : 0;
        if (pop <= top) pop = top * 1.05;
      }
      bg.population = Math.round(pop * 1000) / 1000;
      return { moved: {
        name: bg.name, state: nameOf[st], from,
        to: { cell: best, x: bg.x, y: bg.y, s: cc.s[best], fl: Math.round(cc.fl[best] || 0),
              port: !!bg.port, border: borderDist(best, st, 3) },
        pop: K(bg.population),
        movedPx: Math.round(Math.hypot(bg.x - from.x, bg.y - from.y)),
      } };
    };

    for (const [bname, want] of Object.entries(a.RESEAT)) {
      const bg = pack.burgs.find(x => x && x.name === bname && !x.removed);
      if (!bg) { report.notes.push(`${bname}: not on this map`); continue; }
      const r = reseat(bg, Object.assign({ keepSize: true }, want));
      if (r.note) report.notes.push(r.note); else report.moved.push(r.moved);
    }

    // ---- 4. settlements the overflow stranded ------------------------------
    // A named town of ten people is not a town. The world's tenth-percentile
    // settlement holds 1,254, so anything under a few hundred here is not a
    // hamlet — it is a burg the generator only placed because the broken
    // suitability told it this was the best ground in the country. Put each one
    // on the best cell its own realm actually has within reach, and let the
    // ordinary rule decide how big that makes it. If nothing nearby is better,
    // nothing moves and it stays a hamlet, which is then the truth.
    for (const bg of pack.burgs) {
      if (!bg || !bg.i || bg.removed || bg.capital) continue;
      if (K(bg.population) >= a.STRAND_FLOOR) continue;
      const r = reseat(bg, { anchor: 'here', reach: a.STRAND_REACH,
                             wFlux: 0.8, wSuit: 2.4, wDist: 0.9, keepSize: false });
      if (r.moved) report.stranded.push(r.moved);
      else report.notes.push(`${bg.name}: ${K(bg.population).toLocaleString()} people and ` +
                             `nothing better within reach — left as it is`);
    }


    // measured AFTER the repairs, so the table is the map as it now stands
    const audit = live.map(s => {
      const bs = pack.burgs.filter(x => x && x.i && !x.removed && x.state === s.i);
      const sorted = bs.slice().sort((x, y) => y.population - x.population);
      const cap = pack.burgs[s.capital];
      const cells = land.filter(i => cc.state[i] === s.i);
      const rural = cells.reduce((n, i) => n + cc.pop[i], 0);
      const urban = bs.reduce((n, x) => n + x.population, 0);
      return {
        name: nameOf[s.i], cells: cells.length, burgs: bs.length,
        urban: Math.round(urban * rate * urb), rural: Math.round(rural * rate),
        capital: cap ? cap.name : null, capPop: cap ? K(cap.population) : 0,
        capRank: cap ? sorted.findIndex(x => x.i === cap.i) + 1 : 0,
        largest: sorted[0] ? sorted[0].name : null,
        largestPop: sorted[0] ? K(sorted[0].population) : 0,
        capBorder: cap ? borderDist(cap.cell, s.i, 3) : null,
        capFlux: cap ? Math.round(cc.fl[cap.cell] || 0) : 0,
      };
    });

    if (a.FIX) {
      try { States.collectStatistics(); } catch (e) { report.notes.push('statistics: ' + e.message); }
      try { Layers.drawAll(); } catch (e) { /* cosmetic */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    return { report, audit, rate, urb,
             sStats: (() => {
               const v = land.map(i => cc.s[i]).sort((x, y) => y - x);
               return { max: v[0], p99: v[Math.floor(v.length * 0.01)], median: v[Math.floor(v.length / 2)] };
             })() };
  }, { S_CEILING, RESEAT, FIX, STRAND_FLOOR, STRAND_REACH });

  const R = out.report;
  console.log(`suitability now: max ${out.sStats.max}, 99th ${out.sStats.p99}, median ${out.sStats.median}`);
  if (R.fixedCells.length) {
    console.log(`repaired ${R.fixedCells.length} overflowed suitability cell(s):`);
    const byState = {};
    for (const [, , , st] of R.fixedCells) byState[st] = (byState[st] || 0) + 1;
    for (const [st, n] of Object.entries(byState)) console.log(`    ${n} in ${st}`);
  }
  for (const [n, st, was, now] of R.repopulated)
    console.log(`  ${n} (${st}) ${was.toLocaleString()} -> ${now.toLocaleString()}`);
  for (const m of R.moved)
    console.log(`  reseated ${m.name} (${m.state}) ${m.movedPx}px: ` +
                `river flux ${m.from.fl} -> ${m.to.fl}, ` +
                `port ${m.from.port} -> ${m.to.port}, ` +
                `${m.from.border} cell(s) from a foreign border -> ${m.to.border}, ` +
                `population ${m.pop.toLocaleString()}`);
  for (const m of (R.stranded || []))
    console.log(`  reseated ${m.name} (${m.state}) ${m.movedPx}px onto better ground: ` +
                `suitability ${m.from.s} -> ${m.to.s}, ` +
                `${m.from.pop.toLocaleString()} -> ${m.pop.toLocaleString()} people`);
  for (const n of R.notes) console.log('  ' + n);

  const A = out.audit.slice().sort((x, y) => (y.urban + y.rural) - (x.urban + x.rural));
  const world = A.reduce((n, r) => n + r.urban + r.rural, 0);
  console.log(`\n${A.length} nations, ${world.toLocaleString()} people, ` +
              `${Math.round(A.reduce((n, r) => n + r.urban, 0) / world * 100)}% of them urban\n`);
  console.log('nation'.padEnd(28) + 'cells'.padStart(6) + 'burgs'.padStart(6) +
              'total'.padStart(12) + 'urb%'.padStart(6) + '  ' + 'capital'.padEnd(16) +
              'pop'.padStart(9) + '  notes');
  for (const r of A) {
    const tot = r.urban + r.rural;
    const flags = [];
    if (r.capRank > 1) flags.push(`capital is #${r.capRank} behind ${r.largest} (${r.largestPop.toLocaleString()})`);
    if (r.capBorder !== null && r.capBorder <= 1) flags.push('capital on a foreign border');
    console.log(r.name.slice(0, 27).padEnd(28) + String(r.cells).padStart(6) +
      String(r.burgs).padStart(6) + tot.toLocaleString().padStart(12) +
      (Math.round(r.urban / tot * 100) + '%').padStart(6) + '  ' +
      String(r.capital).slice(0, 15).padEnd(16) + r.capPop.toLocaleString().padStart(9) +
      '  ' + flags.join('; '));
  }

  if (FIX) {
    if (!R.fixedCells.length && !R.moved.length && !(R.stranded || []).length) {
      console.log('\nnothing to repair — not rewriting the map');
    } else {
      const data = await p.evaluate(() => window.Services.Save.prepareMapData());
      fs.writeFileSync(MAP, data);
      console.log(`\nwrote ${MAP} (${(data.length / 1048576).toFixed(1)} MB)`);
    }
  } else {
    console.log('\naudit only — rerun with FIX=1 to repair and save');
  }
  console.log('ERRORS:', errs.length ? errs.slice(0, 3) : 'none');
  await b.close();
})();
