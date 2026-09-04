// Forge Saeroth: the landmass, the climate and the borders are all consequences
// of the vault, generated rather than edited.
//
//   1. lay all 21 nations out at once. The diplomacy graph pulls the pairs that
//      must share a border together; each nation is dragged to the LATITUDE its
//      climate belongs at, so the settled continent runs arctic-to-equator
//   2. build the world with plate tectonics — 26 plates, continental where the
//      politics needs land and where the map wants wilderness. Convergence
//      raises fold belts and volcanic arcs, divergence opens a rift that
//      becomes an inland sea, rift shoulders stand up as escarpments
//   3. cut the coastline with noise that only bites near sea level, so the shore
//      gets bays, capes, skerries and — at high latitude — fjords
//   4. carve territories with a capacity-constrained power diagram, then let the
//      borders relax onto the relief
//   5. run a real climate model over the finished heightmap: zonal temperature
//      and rainfall, prevailing winds that swing with latitude, orographic
//      enhancement on windward slopes and rain shadow behind every range. Each
//      nation is then nudged to its own mean, so it keeps its character while
//      the world stays physically coherent
//
// Nothing is left to a lucky seed.

const { SIZE, LAND, CLAIM, BORDERS, RIDGE_BORDERS, GROUP, GROUP_SHARE, ANCHOR, WILD, ISLE_LANES } = require('./world.js');

// The map covers this latitude range, north edge to south edge. Most of the
// world is northern hemisphere: the settled continent runs from the ice down to
// the equator, and the far south is wilderness.
const LAT_TOP = 66, LAT_BOT = -30;

async function forgeWorld(page, opts) {
  return page.evaluate(async (O) => {
    const { SIZE, LAND, CLAIM, BORDERS, GROUP, GROUP_SHARE, ANCHOR, WILD, ISLE_LANES, LAT_TOP, LAT_BOT } = O;
    const RIDGE_BORDERS = O.RIDGE_BORDERS || [];
    const NAMES = Object.keys(SIZE);
    const idxOf = {}; NAMES.forEach((n, k) => { idxOf[n] = k; });
    const log = [];
    const W = graphWidth, H = graphHeight;
    const LAT_SPAN = LAT_TOP - LAT_BOT;
    const latOf = y => LAT_TOP - LAT_SPAN * (y / H);
    const yOfLat = l => (LAT_TOP - l) / LAT_SPAN * H;

    // ---------- noise ------------------------------------------------------
    const SEED = O.seed >>> 0;
    const hash2 = (x, y) => {
      let h = (x | 0) * 374761393 + (y | 0) * 668265263 + SEED;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const vnoise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return hash2(xi, yi) * (1 - u) * (1 - v) + hash2(xi + 1, yi) * u * (1 - v)
           + hash2(xi, yi + 1) * (1 - u) * v + hash2(xi + 1, yi + 1) * u * v;
    };
    const fbm = (x, y, oct, f0) => {
      let s = 0, amp = 1, tot = 0, f = f0;
      for (let o = 0; o < oct; o++) { s += amp * vnoise(x * f, y * f); tot += amp; amp *= 0.5; f *= 2.03; }
      return s / tot;
    };
    // ridged noise: absolute-value folded, so it makes creases rather than lumps
    const ridge = (x, y, oct, f0) => {
      let s = 0, amp = 1, tot = 0, f = f0;
      for (let o = 0; o < oct; o++) { s += amp * (1 - Math.abs(2 * vnoise(x * f, y * f) - 1)); tot += amp; amp *= 0.5; f *= 2.11; }
      return s / tot;
    };

    // Domain warp. A plate is a Voronoi cell, so its outline is straight edges
    // meeting at sharp corners, and every coast built from one inherits that —
    // which is exactly what a coastline never looks like. Warping the space the
    // plates are looked up in bends those edges into something a river system
    // and a few million years could have left, before any of the rest runs.
    const WARPA = O.warpAmp === undefined ? 165 : O.warpAmp;
    const WARPF = O.warpFreq || 0.0016;
    const warp = (x, y) => [
      x + (fbm(x + 1700, y + 300, 3, WARPF) - 0.5) * WARPA
        + (fbm(x + 8100, y + 2200, 2, WARPF * 4.5) - 0.5) * WARPA * 0.38,
      y + (fbm(x + 5300, y + 900, 3, WARPF) - 0.5) * WARPA
        + (fbm(x + 3300, y + 6400, 2, WARPF * 4.5) - 0.5) * WARPA * 0.38,
    ];

    function Heap() { this.a = []; }
    Heap.prototype.push = function (x) {
      const a = this.a; a.push(x); let i = a.length - 1;
      while (i > 0) { const p2 = (i - 1) >> 1; if (a[p2].pri >= a[i].pri) break;
        const t = a[p2]; a[p2] = a[i]; a[i] = t; i = p2; }
    };
    Heap.prototype.pop = function () {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) { a[0] = last; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < a.length && a[l].pri > a[m].pri) m = l;
          if (r < a.length && a[r].pri > a[m].pri) m = r;
          if (m === i) break; const t = a[m]; a[m] = a[i]; a[i] = t; i = m; } }
      return top;
    };

    // ---------- 1. lay the nations out in open space -----------------------
    const adjWant = {};
    for (const [a, b] of BORDERS) {
      (adjWant[a] = adjWant[a] || []).push(b);
      (adjWant[b] = adjWant[b] || []).push(a);
    }
    const landFrac = O.landFraction || 0.34;      // of the whole canvas
    const settledFrac = O.settledFraction || 0.76; // of the land
    const totalW = NAMES.reduce((s, n) => s + SIZE[n], 0);
    const area = {}, radius = {};
    for (const n of NAMES) {
      area[n] = (W * H * landFrac * settledFrac) * SIZE[n] / totalW;
      radius[n] = Math.sqrt(area[n] / Math.PI);
    }

    const pos = {};
    NAMES.forEach((n, k) => {
      const a = ANCHOR[GROUP[n]];
      pos[n] = [a[0] * W + (hash2(k, 71) - 0.5) * W * 0.10, yOfLat(LAND[n].tlat)];
    });
    for (let it = 0; it < (O.layoutIters || 900); it++) {
      const F = {}; NAMES.forEach(n => { F[n] = [0, 0]; });
      for (let i = 0; i < NAMES.length; i++)
        for (let j = i + 1; j < NAMES.length; j++) {
          const a = NAMES[i], b = NAMES[j];
          let dx = pos[b][0] - pos[a][0], dy = pos[b][1] - pos[a][1];
          const d = Math.hypot(dx, dy) || 1;
          dx /= d; dy /= d;
          const touch = radius[a] + radius[b];
          let f;
          if (GROUP[a] !== GROUP[b]) {
            const want = touch * (O.groupGap || 1.9);
            f = d < want ? (d - want) * 0.035 : 0;
          } else if ((adjWant[a] || []).includes(b)) {
            f = (d - touch * (O.touchAt || 0.82)) * (O.attract || 0.10);
          } else {
            // Two nations with nothing to say about each other used to do
            // nothing but push apart, which made the diplomacy graph the only
            // thing holding a continent together: every frontier on the map
            // was one the vault had a reason for. Real countries mostly border
            // someone they have no opinion of, and a continent laid out this
            // way came out as a chain of related states with holes between
            // them for the carve to paper over. So they knit as well as repel
            // — pushed apart only where they actually overlap, and pulled back
            // in once they have drifted past touching.
            const sep = touch * (O.separate || 1.00);
            const knit = touch * (O.knitAt || 1.45);
            f = d < sep ? (d - sep) * (O.repel || 0.05)
              : d > knit ? (d - knit) * (O.knit || 0.018) : 0;
          }
          F[a][0] += dx * f; F[a][1] += dy * f;
          F[b][0] -= dx * f; F[b][1] -= dy * f;
        }
      for (const n of NAMES) {
        const a = ANCHOR[GROUP[n]];
        // x is held near the continent's anchor; y belongs to the climate
        F[n][0] += (a[0] * W - pos[n][0]) * (O.cohesion || 0.012);
        F[n][1] += (yOfLat(LAND[n].tlat) - pos[n][1]) * (O.latPull || 0.030);
        pos[n][0] = Math.max(W * 0.05, Math.min(W * 0.95, pos[n][0] + Math.max(-14, Math.min(14, F[n][0]))));
        pos[n][1] = Math.max(H * 0.04, Math.min(H * 0.96, pos[n][1] + Math.max(-14, Math.min(14, F[n][1]))));
      }
    }

    const G = grid.cells, gn = G.i.length, GP = grid.points;
    const nbrs = i => G.c[i] || [];
    const SP = grid.spacing, CX = grid.cellsX, CY = grid.cellsY;
    const cellAt = (x, y) => {
      const cx = Math.max(0, Math.min(CX - 1, Math.floor(x / SP)));
      const cy = Math.max(0, Math.min(CY - 1, Math.floor(y / SP)));
      return cy * CX + cx;
    };

    // ---------- 2. tectonics -----------------------------------------------
    const NP = O.plates || 26;
    let pcx = [];
    for (let k = 0; k < NP; k++) pcx.push([hash2(k * 13 + 1, 5) * W, hash2(k * 29 + 3, 9) * H]);
    for (let it = 0; it < (O.lloyd === undefined ? 2 : O.lloyd); it++) {
      const acc = pcx.map(() => [0, 0, 0]);
      for (let i = 0; i < gn; i++) {
        const [x, y] = GP[i];
        let b = 0, bd = Infinity;
        for (let k = 0; k < NP; k++) {
          const dx = x - pcx[k][0], dy = y - pcx[k][1], d = dx * dx + dy * dy;
          if (d < bd) { bd = d; b = k; }
        }
        acc[b][0] += x; acc[b][1] += y; acc[b][2]++;
      }
      pcx = pcx.map((p, k) => acc[k][2] ? [acc[k][0] / acc[k][2], acc[k][1] / acc[k][2]] : p);
    }
    const plateOf = new Int16Array(gn);
    for (let i = 0; i < gn; i++) {
      const [x, y] = warp(GP[i][0], GP[i][1]);
      let b = 0, bd = Infinity;
      for (let k = 0; k < NP; k++) {
        const dx = x - pcx[k][0], dy = y - pcx[k][1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; b = k; }
      }
      plateOf[i] = b;
    }
    const plateCells = new Int32Array(NP);
    for (let i = 0; i < gn; i++) plateCells[plateOf[i]]++;
    const plateAt = (x0, y0) => {
      const [x, y] = warp(x0, y0);
      let b = 0, bd = Infinity;
      for (let k = 0; k < NP; k++) {
        const dx = x - pcx[k][0], dy = y - pcx[k][1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; b = k; }
      }
      return b;
    };

    // Which plates are continental? The ones carrying the political layout —
    // chosen by distance to the NEAREST member nation rather than to the group
    // centroid, so a continent laid out tall comes out tall instead of round.
    const continental = new Uint8Array(NP);
    const plateGroup = new Int16Array(NP).fill(-1);
    const groupIds = [...new Set(Object.values(GROUP))].sort();
    // Only part of a continental plate ends up above sea level — the rest is
    // continental shelf — so the plate budget has to be inflated by that yield
    // or every continent comes out a third of the size it was asked for.
    const yieldF = O.plateYield || 0.62;
    const needCells = {};
    for (const g of groupIds) {
      // Derived from the nations' own sizes, the mainland took three quarters
      // of the world and the east read as an afterthought. The continents get
      // stated shares; SIZE still decides how each one is divided up inside.
      const share = GROUP_SHARE && GROUP_SHARE[g] !== undefined
        ? GROUP_SHARE[g]
        : NAMES.filter(n => GROUP[n] === g).reduce((a, n) => a + SIZE[n], 0) / totalW;
      needCells[g] = gn * landFrac * settledFrac * share / yieldF;
    }
    for (const g of groupIds) {
      const members = NAMES.filter(n => GROUP[n] === g);
      // Anisotropic: distance north-south is cheap, east-west expensive. A
      // continent whose nations run from the ice to the equator has to grow
      // TALL; measured plainly it grows round instead, and then everyone ends
      // up at the wrong latitude.
      const ay = O.plateAniso || 0.45;
      const near = k => Math.min.apply(null, members.map(n =>
        Math.hypot(pcx[k][0] - pos[n][0], (pcx[k][1] - pos[n][1]) * ay)));
      const order = Array.from({ length: NP }, (_, k) => k)
        .filter(k => !continental[k]).sort((a, b) => near(a) - near(b));
      // an island arc barely surfaces, so it needs far more plate to show up
      const want = needCells[g] * (g === 2 ? (O.arcNeed || 2.4) : 1);
      let have = 0;
      for (const k of order) {
        if (have >= want && have > 0) break;
        continental[k] = 1; plateGroup[k] = g; have += plateCells[k];
      }
      log.push(`group ${g}: ${Array.from(plateGroup).filter(x => x === g).length} plates, ` +
               `${have} cells for a target of ${Math.round(needCells[g])}`);
    }
    // and the wilderness: land the vault has never had to name
    for (const wd of WILD) {
      const wx = wd.at[0] * W, wy = wd.at[1] * H, reach = wd.reach * Math.hypot(W, H);
      const want = gn * landFrac * (1 - settledFrac) * wd.share / yieldF;
      const order = Array.from({ length: NP }, (_, k) => k)
        .filter(k => !continental[k] && Math.hypot(pcx[k][0] - wx, pcx[k][1] - wy) < reach)
        .sort((a, b) => Math.hypot(pcx[a][0] - wx, pcx[a][1] - wy) -
                        Math.hypot(pcx[b][0] - wx, pcx[b][1] - wy));
      let have = 0;
      for (const k of order) {
        if (have >= want && have > 0) break;
        continental[k] = 1; plateGroup[k] = wd.id; have += plateCells[k];
      }
    }

    // Plate motions. Most are arbitrary drift; two are set deliberately — the
    // far continent is a collision zone, and the settled continent is being
    // pulled apart along a rift.
    const vel = [];
    for (let k = 0; k < NP; k++) {
      const a = hash2(k * 7 + 11, 17) * Math.PI * 2;
      vel.push([Math.cos(a), Math.sin(a)]);
    }
    const contOf = g => Array.from({ length: NP }, (_, k) => k).filter(k => plateGroup[k] === g);
    // The two margins the world is built around. Every OTHER divergent pair
    // gets a much gentler treatment: left at full strength, ten plates' worth
    // of random internal rifting tears each continent into an archipelago.
    const pairKey = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
    const bigRift = new Set(), bigCollide = new Set();
    {
      const drive = (two, sign, set) => {
        const dx = pcx[two[1]][0] - pcx[two[0]][0], dy = pcx[two[1]][1] - pcx[two[0]][1];
        const d = Math.hypot(dx, dy) || 1;
        vel[two[0]] = [sign * dx / d, sign * dy / d];
        vel[two[1]] = [-sign * dx / d, -sign * dy / d];
        set.add(pairKey(two[0], two[1]));
      };
      // Every settled continent needs BOTH: a rift, which becomes its inland
      // sea, and collisions, which become the spines its rain shadows and its
      // steppe depend on. Given only a rift a continent came out uniformly flat.
      //
      // A collision pair must be the one sharing the most BOUNDARY, not the one
      // with the largest plates. Picked by size it lands on two plates that
      // barely touch, and the range is a patch of hills in the middle of
      // nowhere — which is exactly what the eastern continent had, and why its
      // four mountain nations had no orogen to sit on and went blobby.
      // Length alone is not enough. On the mainland the longest boundary ran
      // straight through the open-steppe khaganate, and a range has to land
      // where some nation is glad of it — so score each candidate by how much
      // boundary it carries AND how near it runs to a nation that wants high
      // ground, against how near it runs to one that wants none.
      const wantsHigh = n => LAND[n].ridged || CLAIM[n] === 'mtn' ||
                             CLAIM[n] === 'high' || CLAIM[n] === 'hills';
      const longestPair = (g, avoid) => {
        const share = {}, mid = {};
        for (let i = 0; i < gn; i++) {
          const a2 = plateOf[i];
          if (plateGroup[a2] !== g || avoid.has(a2)) continue;
          for (const c of nbrs(i)) {
            const b2 = plateOf[c];
            if (b2 === a2 || plateGroup[b2] !== g || avoid.has(b2)) continue;
            const k = pairKey(a2, b2);
            share[k] = (share[k] || 0) + 1;
            const m = mid[k] || (mid[k] = [0, 0, 0]);
            m[0] += GP[i][0]; m[1] += GP[i][1]; m[2]++;
          }
        }
        const members = NAMES.filter(n => GROUP[n] === g);
        const high = members.filter(wantsHigh), flat = members.filter(n => !wantsHigh(n));
        const reach = Math.hypot(W, H) * 0.22;
        const near = (p, list) => list.length
          ? Math.min.apply(null, list.map(n => Math.hypot(p[0] - pos[n][0], p[1] - pos[n][1]))) : 1e9;
        const scored = Object.keys(share).map(k => {
          const m = mid[k], p = [m[0] / m[2], m[1] / m[2]];
          const pull = high.length ? Math.exp(-near(p, high) / reach) : 0;
          const push = flat.length ? Math.exp(-near(p, flat) / reach) : 0;
          return [k, share[k] * (1 + 1.6 * pull - 0.9 * push)];
        }).sort((x, y) => y[1] - x[1]);
        return scored.length ? scored[0][0].split(':').map(Number) : null;
      };
      // Pairs must stay disjoint: drive() writes both plates' velocities, so
      // reusing a plate in a second pair silently cancels the first one.
      for (const g of [0, 1]) {
        const cs = contOf(g).sort((a, b) => plateCells[b] - plateCells[a]);
        if (cs.length < 2) continue;
        const used = new Set();
        drive([cs[0], cs[1]], -1, bigRift);
        used.add(cs[0]); used.add(cs[1]);
        // As many ranges as there are nations built to live on one. The east
        // has four ridged nations and needs two spines; the mainland has NONE,
        // and giving it two anyway is why a cordillera kept landing in the
        // middle of an open-steppe khaganate — the range had no rightful owner,
        // so the biggest neighbour simply absorbed it. One is enough there to
        // give the continent a watershed and a rain shadow.
        const ridgedHere = NAMES.filter(n => GROUP[n] === g && LAND[n].ridged).length;
        const spines = Math.max(1, Math.min(O.spines || 2, Math.ceil(ridgedHere / 2)));
        for (let k = 0; k < spines; k++) {
          const pair = longestPair(g, used);
          if (!pair) break;
          drive(pair, 1, bigCollide);
          used.add(pair[0]); used.add(pair[1]);
        }
      }
      // The frontier is where the adventuring happens, and a group whose plates
      // are never driven anywhere comes out as a featureless plain. Give it a
      // spine of its own — no rift, which would only split it in two.
      for (const g of [-3, -4]) {
        const cs = contOf(g);
        if (cs.length < 2) continue;
        const pair = longestPair(g, new Set());
        if (pair) drive(pair, 1, bigCollide);
      }
    }

    // distance to the nearest plate boundary, and which plate is on the far side
    const bDist = new Float32Array(gn).fill(1e9);
    const bOther = new Int16Array(gn).fill(-1);
    {
      let ring = [];
      for (let i = 0; i < gn; i++) {
        for (const c of nbrs(i)) {
          if (plateOf[c] === plateOf[i]) continue;
          if (bDist[i] > 0) { bDist[i] = 0; bOther[i] = plateOf[c]; ring.push(i); }
          break;
        }
      }
      for (let d = 1; ring.length && d < 45; d++) {
        const next = [];
        for (const c of ring) for (const q of nbrs(c)) {
          if (bDist[q] <= d) continue;
          bDist[q] = d; bOther[q] = bOther[c]; next.push(q);
        }
        ring = next;
      }
    }
    // warped, so the belt meanders instead of tracking a straight Voronoi edge
    const bWarp = new Float32Array(gn);
    for (let i = 0; i < gn; i++) {
      const [x, y] = GP[i];
      bWarp[i] = bDist[i] + (fbm(x + 210, y + 640, 4, O.frontFreq || 0.008) - 0.5) * (O.frontWarp || 8);
    }

    const CONT = O.contBase !== undefined ? O.contBase : 0.55;
    const OCEA = O.oceanBase !== undefined ? O.oceanBase : -0.55;
    const width = O.beltWidth || 2.8;
    const frame = new Float32Array(gn);
    const fv = new Float32Array(gn);
    const uplift = new Float32Array(gn);
    for (let i = 0; i < gn; i++) {
      const a = plateOf[i], b = bOther[i];
      let v = continental[a] ? (plateGroup[a] === 2 ? CONT * (O.arcBase || 0.06) : CONT) : OCEA;
      if (b >= 0) {
        let nx = pcx[b][0] - pcx[a][0], ny = pcx[b][1] - pcx[a][1];
        const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const conv = (vel[a][0] - vel[b][0]) * nx + (vel[a][1] - vel[b][1]) * ny;
        const strike = 0.40 + 0.60 * fbm(GP[i][0] + 77, GP[i][1] + 915, 3, O.strikeFreq || 0.004);
        const near = Math.exp(-Math.max(0, bWarp[i]) / width) * strike;
        const pk = pairKey(a, b);
        if (conv > 0) {
          if (continental[a] && continental[b]) {
            const u = conv * near * (O.orogeny || 1.5) * (bigCollide.has(pk) ? 1 : (O.orogenyMinor || 0.7));
            v += u; uplift[i] = u;
          } else if (continental[a]) {
            const u = conv * near * (O.arc || 0.9);
            v += u; uplift[i] = u * 0.7;
          } else v -= conv * near * (O.trench || 0.7);
        } else {
          const div = -conv;
          if (continental[a] && continental[b]) {
            const big = bigRift.has(pk);
            const wide = big
              ? Math.exp(-Math.max(0, bWarp[i]) / (O.riftWidth || 5.0)) * strike : near;
            v -= div * wide * (big ? (O.rift || 1.35) : (O.riftMinor || 0.22));
            // rift shoulders: the flanks of a continental rift stand up as
            // escarpments, which is why the Rift Valley has walls
            const t = (bWarp[i] - (O.shoulderAt || 3.6)) / (O.shoulderW || 2.4);
            const sh = Math.exp(-t * t) * strike;
            const u = div * sh * (O.shoulder || 0.62) * (big ? 1 : 0.35);
            v += u; uplift[i] = Math.max(uplift[i], u * 0.8);
          } else if (!continental[a] && !continental[b]) v += div * near * 0.15;
        }
        // A moat between continents that are meant to be separate. Without it
        // two adjacent continental plates from different groups simply fuse,
        // and the wilderness quietly annexes whatever it happens to touch.
        if (continental[a] && continental[b] && plateGroup[a] !== plateGroup[b])
          v -= Math.exp(-Math.max(0, bWarp[i]) / (O.moatW || 2.6)) * (O.moat || 1.7);
      }
      v += (fbm(GP[i][0], GP[i][1], 5, O.reliefFreq || 0.0030) - 0.5) * (O.reliefAmp || 1.15);
      // The settled continents are unions of many plates, so rifts and moats
      // already break their outlines up. A wilderness built from one or two
      // plates has nothing doing that, and comes out as a polygon; this gives
      // it its own bays and headlands.
      if (plateGroup[a] < -1)
        v += (fbm(GP[i][0] + 7700, GP[i][1] + 2300, 4, O.wildFreq || 0.0055) - 0.5) * (O.wildRelief || 1.6);
      // drown the rim so the world has an ocean around it. This and the ice
      // below are the FRAME rather than the crust: they are kept separately
      // because a template-shaped world throws the plate field away and still
      // needs an ocean at the edges and a cap at the top.
      let rim = 0;
      const [px, py] = GP[i];
      const mx = (O.marginX || 0.075) * W, mtop = (O.marginTop || 0.020) * H, mbot = (O.marginBot || 0.045) * H;
      const e = Math.min(px / mx, (W - px) / mx, py / mtop, (H - py) / mbot);
      if (e < 1) rim -= (1 - e) * (O.edgeDrop || 2.2);

      // The ice. Left to the plates it either failed to surface or fused onto
      // the top of the settled continent; a polar cap is too important to the
      // shape of a world to be left to chance, so it is built deliberately: a
      // ragged landmass along the north edge, and a frozen strait south of it
      // wide enough that nothing ever walks across.
      const iceY = (O.iceY || 0.125) * H;
      // A wide range on the wobble is what turns a white bar across the top of
      // the map into a coast: where it runs low the sea opens to the map edge,
      // where it runs deep the ice reaches south in a great peninsula.
      const wob = iceY * (0.15 + 1.85 * fbm(px + 6100, 0, 4, O.iceFreq || 0.0013));
      if (py < wob) rim += (1 - py / wob) * (O.iceLift || 2.6);
      const gap = (py - wob) / ((O.iceMoatW || 0.045) * H);
      if (gap > -0.4 && gap < 2.6) rim -= Math.exp(-Math.pow(gap - 0.7, 2)) * (O.iceMoat || 2.4);
      frame[i] = rim;
      fv[i] = v + rim;
    }

    // Hotspot chains: a volcanic line in the deep ocean, which is where the
    // scattered isles on any decent world map come from. Continental plates are
    // left alone — these are meant to be out in the blue.
    const lanes = (ISLE_LANES || []).map((L2, k) => ({
      hx: L2.at[0] * W, hy: L2.at[1] * H, ang: L2.ang, cones: L2.cones, k: 900 + k }));
    const spots = lanes.concat(Array.from({ length: O.hotspots || 12 }, (_, k) => ({
      hx: hash2(k * 91 + 5, 601) * W, hy: hash2(k * 37 + 9, 733) * H,
      ang: hash2(k, 811) * Math.PI * 2, cones: 2 + Math.floor(hash2(k, 97) * 4), k })));
    for (const sp of spots) {
      const hx = sp.hx, hy = sp.hy, k = sp.k;
      if (continental[plateAt(hx, hy)]) continue;
      const ang = sp.ang, cones = sp.cones;
      const step = (O.hotspotStep || 0.055) * Math.min(W, H);
      for (let c = 0; c < cones; c++) {
        const cx2 = hx + Math.cos(ang) * step * c, cy2 = hy + Math.sin(ang) * step * c;
        const rr = step * (0.30 + 0.45 * hash2(k * 13 + c, 41));
        const lift = (O.hotspotLift || 1.5) * (0.55 + 0.9 * hash2(k * 7 + c, 63));
        for (let i = 0; i < gn; i++) {
          const dx = GP[i][0] - cx2, dy = GP[i][1] - cy2;
          const d2 = (dx * dx + dy * dy) / (rr * rr);
          if (d2 > 4) continue;
          fv[i] += lift * Math.exp(-d2) * (0.5 + fbm(GP[i][0], GP[i][1], 3, 0.02));
        }
      }
    }

    // ---- borrowed shape: one heightmap template per continent --------------
    // Plate tectonics decides where the continents are, and it decides it well
    // — but a plate is a Voronoi cell, and a warped Voronoi cell is still a
    // blob. What the plate model does not produce is structure at every scale
    // at once: the gulf, the peninsula off the gulf, the cape off the
    // peninsula. That self-similarity is most of what makes a coastline read
    // as a real one rather than an outline somebody drew.
    //
    // Azgaar's stock templates have it, because they are not noise: Old World
    // is three long Range strokes, hills at two sizes, a strait cut end to end
    // and a field of troughs and pits, each landing at a different scale.
    // So the shape of every coast here is borrowed from one.
    //
    // ONE TEMPLATE RUN PER CONTINENT, and each continent names its own. A
    // template only ever describes one world: run it once and drape the result
    // over three continents and all three come out with the same silhouette,
    // and the middle sea — which is supposed to read as an archipelago —
    // comes out shaped like a continent that drowned. So the two settled
    // continents take Old World, the middle sea takes Azgaar's Archipelago
    // (ten troughs and two straits cut through low hills, which is what makes
    // islands rather than a coast), and the wilderness takes its own fourth
    // run so it does not inherit either neighbour's outline.
    //
    // What does NOT work is averaging them. The first version ran the template
    // twice over the whole map and averaged the pair, which cancels exactly
    // the structure that made either of them worth borrowing and leaves a
    // smooth mush. Neither does normalising a donor min-to-max: a template
    // spends most of its 0-100 on mountains, so that squeezes the land/sea
    // decision — the only part being borrowed — into a narrow band near the
    // bottom, and the coast barely moves.
    //
    // It goes into the potential field rather than replacing the land mask, so
    // the continents still sit where the diplomacy and the climate bands put
    // them, and each group is re-levelled to its own land budget straight
    // after. This can change the SHAPE of a coast. It cannot change how much
    // land a group ends up with, or which group a nation lands on.
    const OW = O.oldWorld === undefined ? 0.8 : O.oldWorld;
    const tmpl = new Float32Array(gn), tmplRaw = new Float32Array(gn);
    if (OW > 0 && typeof HeightmapGenerator !== 'undefined') {
      // index by group: 0 and 1 are the settled continents, 2 is the middle
      // sea, and the last entry catches the wilderness and the open ocean
      const TMPL = O.donorTemplates || ['oldWorld', 'oldWorld', 'archipelago', 'oldWorld'];
      const AMP = O.donorAmp || [1, 1, 1.4, 1];
      const DONORS = TMPL.length;
      const groupAt = i => plateGroup[plateOf[i]];
      const donorFor = g => (g >= 0 && g < DONORS - 1) ? g : DONORS - 1;

      // where each group actually sits, so a donor can be slid onto it
      const gx = new Float64Array(DONORS), gy = new Float64Array(DONORS), gc = new Int32Array(DONORS);
      for (let i = 0; i < gn; i++) {
        const g = groupAt(i);
        if (g < 0) continue;                  // ocean and wilderness pull the
        const d = donorFor(g);                // centroid off the continent
        gx[d] += GP[i][0]; gy[d] += GP[i][1]; gc[d]++;
      }

      const keepH = Uint8Array.from(G.h);
      const keepRandom = Math.random;
      const soft = O.oldWorldSoft === undefined ? 25 : O.oldWorldSoft;
      const field = [], raw = [], dx = new Float64Array(DONORS), dy = new Float64Array(DONORS);
      try {
        for (let d = 0; d < DONORS; d++) {
          Math.random = aleaPRNG(`${SEED}-donor-${d}`);
          G.h.fill(0);
          const hh = Float32Array.from(HeightmapGenerator.fromTemplate(grid, TMPL[d]));
          // slide the donor so ITS land sits over OUR continent
          let ax = 0, ay = 0, ac = 0;
          for (let i = 0; i < gn; i++) if (hh[i] >= 20) { ax += GP[i][0]; ay += GP[i][1]; ac++; }
          if (ac && gc[d]) { dx[d] = gx[d] / gc[d] - ax / ac; dy[d] = gy[d] / gc[d] - ay / ac; }
          // The saturated copy is for the coastline: rescaled around the
          // donor's OWN sea level, so the land/sea decision — the only part
          // being borrowed for the shape — gets the whole amplitude. The raw
          // copy keeps the template's relief, which is what its mountains are.
          raw.push(Float32Array.from(hh));
          for (let i = 0; i < gn; i++) hh[i] = Math.max(-1, Math.min(1, (hh[i] - 20) / soft));
          field.push(hh);
        }
      } finally {
        Math.random = keepRandom;
        G.h.set(keepH);
      }

      // The amplitude is in the same units as the continental step itself
      // (`contBase` for crust against `oceanBase` for ocean), so `oldWorld`
      // reads as a fraction of "how strongly does the plate say land here": at
      // 0.8 a donor can carve a gulf into a continent or leave an island off
      // it, and cannot move a continent. The middle sea runs hotter, because
      // there the fragmenting IS the point.
      for (let i = 0; i < gn; i++) {
        const d = donorFor(groupAt(i));
        const sx = Math.max(0, Math.min(W - 1, GP[i][0] - dx[d]));
        const sy = Math.max(0, Math.min(H - 1, GP[i][1] - dy[d]));
        const j = Grid.findCell(sx, sy, grid);
        const k = j === undefined ? i : j;
        tmpl[i] = field[d][k];
        tmplRaw[i] = raw[d][k];
        fv[i] += OW * (AMP[d] === undefined ? 1 : AMP[d]) * tmpl[i];
      }

      // LAND FROM THE TEMPLATE, not from the plates.
      //
      // A plate is a Voronoi cell. Warp it, add noise at the shore, add a
      // template on top at a third of the crust step, and it is still a
      // Voronoi cell underneath — the continents come out as rounded lobes
      // because that is the shape the model has. Azgaar's templates do not
      // have that problem, and never did.
      //
      // Handing them the land outright only became possible with the region
      // split. A template describes ONE world: ask it for three continents on
      // one canvas and it gives you a supercontinent, land to both edges and
      // no archipelago, which is why this was tried and rejected before. Ask
      // it for one continent on one canvas and it gives you exactly that.
      //
      // The plate field still runs, and is still worth running — the orogen it
      // computes is what the mountain chains are walked along, and the rift and
      // moat structure is what breaks a coast up. It just no longer decides
      // where the water is. What survives from it here is the FRAME: an ocean
      // drowning the rim, and the polar cap.
      if (O.landFrom === 'template') {
        const gain = O.templateGain === undefined ? 2.4 : O.templateGain;
        const keepPlate = O.plateMix === undefined ? 0.18 : O.plateMix;
        for (let i = 0; i < gn; i++)
          fv[i] = tmpl[i] * gain + (fv[i] - frame[i]) * keepPlate + frame[i];
        const used = [...new Set(Object.values(GROUP).map(g => TMPL[donorFor(g)]))];
        log.push(`land taken from the ${used.join(' + ')} template (gain ${gain}, plates at ${keepPlate})`);

        // A REGION IS ONE CONTINENT. Old World does not know that: left alone
        // it hands back a main mass and a second one nearly as large, and the
        // carve then puts half a continent's nations on each — which severed
        // five of the east's seven required borders, because two countries
        // cannot share a frontier across open sea.
        //
        // So find the landmasses at a provisional waterline, keep the biggest,
        // and push the rest down. Down rather than away: a second mass at a
        // fraction of the step becomes an island chain off the coast, which is
        // worth having. An archipelago region opts out — there, many masses
        // are the entire point.
        if (O.oneContinent) {
          // Deep, not shallow. The sea level is taken afterwards as whatever
          // percentile hits the land budget, so a gentle push down just lowers
          // the waterline to compensate and the rival surfaces again. It has
          // to go under far enough that the main continent grows to take the
          // budget instead.
          const sink = O.sinkRivals === undefined ? 4 : O.sinkRivals;
          const prov = Float32Array.from(fv).sort();
          const wl = prov[Math.max(0, gn - Math.round(gn * landFrac) - 1)];
          const comp = new Int32Array(gn).fill(-1);
          const sizes = [];
          for (let i = 0; i < gn; i++) {
            if (fv[i] <= wl || comp[i] >= 0) continue;
            const id = sizes.length;
            let ring = [i], n2 = 0;
            comp[i] = id;
            while (ring.length) {
              const next = [];
              for (const c of ring) {
                n2++;
                for (const q of nbrs(c)) {
                  if (comp[q] >= 0 || fv[q] <= wl) continue;
                  comp[q] = id; next.push(q);
                }
              }
              ring = next;
            }
            sizes.push(n2);
          }
          let big = -1, bn = 0;
          sizes.forEach((n2, id) => { if (n2 > bn) { bn = n2; big = id; } });
          if (big >= 0 && sizes.length > 1) {
            let dropped = 0;
            for (let i = 0; i < gn; i++) {
              if (comp[i] < 0 || comp[i] === big) continue;
              // the bigger the rival, the harder it goes down; a genuine
              // islet was never competing for the nations in the first place
              const w2 = Math.min(1, sizes[comp[i]] / (bn * 0.12));
              fv[i] -= sink * w2; dropped++;
            }
            log.push(`one continent: kept ${bn} cells, sank ${sizes.length - 1} rival mass(es) (${dropped} cells)`);
          }
        }
      }
      log.push(`shaped the coast from ${DONORS} heightmaps (${TMPL.join(', ')}) at amp ${OW}`);
    }

    // Coastal detail. A second, much finer noise field is added with an
    // amplitude that peaks AT sea level and dies inland and offshore, so it
    // carves bays, capes and skerries without turning the interior to gravel.
    // Above 45°N it goes ridged, which cuts the long narrow inlets that read
    // as fjords.
    {
      const sorted0 = Float32Array.from(fv).sort();
      const t0 = sorted0[Math.max(0, gn - Math.round(gn * landFrac) - 1)];
      const span0 = (sorted0[gn - 1] - t0) || 1;
      const amp = span0 * (O.coastNoise || 0.17);
      const band = span0 * (O.coastBand || 0.11);
      for (let i = 0; i < gn; i++) {
        const [x, y] = GP[i];
        const w = Math.exp(-Math.pow((fv[i] - t0) / band, 2));
        if (w < 0.03) continue;
        const lat = latOf(y);
        const cold = Math.max(0, Math.min(1, (lat - 40) / 12));
        // bays and capes at the scale of a bay, not of a cell: at three cells
        // across this stops being a coastline and becomes a lace of lakes
        // Two scales, both of them big enough to SEE: a gulf about fourteen
        // cells across and a cove about four. An octave finer than the cell
        // spacing is not detail, it is aliasing — it alternates land and water
        // cell by cell, and that sawtooth is what reads as "jagged" from a
        // distance. Detail has to live at a scale the grid can actually hold.
        const cf = O.coastFreq || 0.007;
        const smooth = (fbm(x + 3300, y + 1700, 2, cf) - 0.5) * 2.4
                     + (fbm(x + 900, y + 4100, 2, cf * 3.5) - 0.5) * 1.0;
        // Drowned valleys: only the sharp crests of a ridged field cut, so the
        // coast gets long narrow inlets instead of being uniformly lowered.
        // Everywhere gets rias; cold coasts get them deep enough to be fjords.
        const cut = -Math.max(0, ridge(x + 8800, y + 2400, 3, O.fjordFreq || 0.022) - 0.72) * 3.0;
        fv[i] += w * amp * (smooth + cut * (0.30 + 0.70 * cold) * (O.fjord || 1.6));
      }
    }

    // Level every continental group to its OWN land budget before the sea level
    // is taken. Taking one global percentile put all the groups into a single
    // distribution to compete in, so whichever happened to sit low that seed
    // drowned wholesale — which is why the frontier swung between ten thousand
    // cells and seven from one seed to the next, and why the polar cap came and
    // went. Levelling first makes each group surface what it was promised, and
    // leaves the global threshold to do nothing but pick the waterline.
    if (O.landFrom !== 'template') {
      const byGroup = new Map();
      for (let i = 0; i < gn; i++) {
        const g = plateGroup[plateOf[i]];
        // group 2 is rewritten relative to the waterline just below, and the
        // open ocean has no budget to hit
        if (!continental[plateOf[i]] || g === 2) continue;
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(i);
      }
      for (const [g, cells] of byGroup) {
        const share = g >= 0
          ? (GROUP_SHARE && GROUP_SHARE[g] !== undefined ? GROUP_SHARE[g]
             : NAMES.filter(n => GROUP[n] === g).reduce((a, n) => a + SIZE[n], 0) / totalW)
          : (WILD.find(w => w.id === g) || { share: 0 }).share;
        const want = Math.round(gn * landFrac *
          (g >= 0 ? settledFrac * share : (1 - settledFrac) * share));
        if (!want || want >= cells.length) continue;
        const vals = Float32Array.from(cells, i => fv[i]).sort();
        const t = vals[Math.max(0, cells.length - want - 1)];
        for (const i of cells) fv[i] -= t;
      }
    }

    // sea level: the height that leaves us the land budget we asked for
    const sortedF = Float32Array.from(fv).sort();
    const wantLand = Math.round(gn * landFrac);
    const thresh = sortedF[Math.max(0, gn - wantLand - 1)];
    const span = (sortedF[gn - 1] - thresh) || 1;

    // The island arc is defined RELATIVE to sea level: a fixed base either
    // drowns entirely or fuses into one island.
    {
      const frac = O.arcLand || 0.40, amp = span * (O.arcAmp || 0.95);
      for (let i = 0; i < gn; i++) {
        if (plateGroup[plateOf[i]] !== 2) continue;
        const n = fbm(GP[i][0] + 4400, GP[i][1] + 1300, 4, O.arcFreq || 0.017);
        fv[i] = thresh + (n - (1 - frac)) * amp;
      }
    }
    log.push(`sea level ${thresh.toFixed(3)}; ${NP} plates, ` +
             `${Array.from(continental).filter(Boolean).length} continental ` +
             `(${WILD.map(w => Array.from(plateGroup).filter(x => x === w.id).length).join('+')} wild)`);

    for (let i = 0; i < gn; i++) {
      G.h[i] = fv[i] >= thresh
        ? Math.max(20, Math.min(85, Math.round(20 + Math.min(1, (fv[i] - thresh) / span) * 62)))
        : 0;
    }
    // Weathering. A headland one cell wide is not a headland and a notch one
    // cell wide is not a bay — they are sampling artefacts, and they are what
    // reads as "jagged" at a glance. Two conservative majority passes take the
    // sawtooth off without touching the shape of an actual peninsula.
    for (let pass = 0; pass < (O.weather === undefined ? 2 : O.weather); pass++) {
      const flip = [];
      for (let i = 0; i < gn; i++) {
        const N = nbrs(i);
        if (N.length < 4) continue;
        let water = 0;
        for (const c of N) if (G.h[c] < 20) water++;
        if (G.h[i] >= 20) { if (water >= N.length - 1) flip.push([i, 0]); }
        else if (water <= 1) flip.push([i, 1]);
      }
      for (const [i, toLand] of flip) {
        if (!toLand) { G.h[i] = 0; continue; }
        let s2 = 0, k = 0;
        for (const c of nbrs(i)) if (G.h[c] >= 20) { s2 += G.h[c]; k++; }
        G.h[i] = k ? Math.max(20, Math.round(s2 / k)) : 22;
      }
    }

    // Fill the pinpricks. However carefully the coastal noise is tuned, a few
    // cells always dip below the waterline well inland, and Azgaar turns every
    // one of them into a lake — the difference between a continent and a doily
    // is entirely this pass.
    {
      const minPond = O.minPond || 20;
      const seen = new Uint8Array(gn);
      let filled = 0, ponds = 0;
      for (let i = 0; i < gn; i++) {
        if (G.h[i] >= 20 || seen[i]) continue;
        const cells = [i]; seen[i] = 1;
        let edge = false;
        for (let k = 0; k < cells.length; k++) {
          const c = cells[k];
          if (GP[c][0] < SP || GP[c][1] < SP || GP[c][0] > W - SP || GP[c][1] > H - SP) edge = true;
          for (const q of nbrs(c)) if (G.h[q] < 20 && !seen[q]) { seen[q] = 1; cells.push(q); }
        }
        if (edge || cells.length > minPond) continue;
        for (const c of cells) {
          let s = 0, k = 0;
          for (const q of nbrs(c)) if (G.h[q] >= 20) { s += G.h[q]; k++; }
          G.h[c] = k ? Math.max(20, Math.round(s / k)) : 22;
        }
        filled += cells.length; ponds++;
      }
      if (ponds) log.push(`filled ${ponds} noise ponds (${filled} cells) back into the land`);
    }

    // a proper shelf: shallow water only near a shore, deep ocean beyond
    const gradeSea = () => {
      const dist = new Int32Array(gn).fill(-1);
      let ring = [];
      for (let i = 0; i < gn; i++) {
        if (G.h[i] < 20) continue;
        for (const c of nbrs(i)) if (G.h[c] < 20 && dist[c] === -1) { dist[c] = 1; ring.push(c); }
      }
      for (let d = 2; ring.length && d <= 14; d++) {
        const next = [];
        for (const c of ring) for (const q of nbrs(c)) {
          if (G.h[q] >= 20 || dist[q] !== -1) continue;
          dist[q] = d; next.push(q);
        }
        ring = next;
      }
      const shelf = O.shelf || 4;
      for (let i = 0; i < gn; i++) {
        if (G.h[i] >= 20) continue;
        G.h[i] = dist[i] === -1 ? 0 : Math.max(0, Math.round(19 - (dist[i] - 1) * (19 / shelf)));
      }
    };
    gradeSea();

    // A rift basin that never reached the margin is a puddle. Cut any enclosed
    // sea of real size a strait to the open ocean — which is what a rift does
    // when it finally breaches the continental edge.
    const waterComponents = () => {
      const comp = new Int32Array(gn).fill(-1);
      const groupsW = [];
      for (let i = 0; i < gn; i++) {
        if (G.h[i] >= 20 || comp[i] !== -1) continue;
        const id = groupsW.length, cells = [i];
        comp[i] = id;
        for (let k = 0; k < cells.length; k++)
          for (const c of nbrs(cells[k]))
            if (G.h[c] < 20 && comp[c] === -1) { comp[c] = id; cells.push(c); }
        groupsW.push(cells);
      }
      let oceanId = -1, oceanN = -1;
      for (const [id, cells] of groupsW.entries()) {
        const touches = cells.some(c => GP[c][0] < SP || GP[c][1] < SP ||
                                        GP[c][0] > W - SP || GP[c][1] > H - SP);
        if (touches && cells.length > oceanN) { oceanN = cells.length; oceanId = id; }
      }
      return { comp, groupsW, oceanId };
    };
    {
      const { comp, groupsW, oceanId } = waterComponents();
      for (const [id, cells] of groupsW.entries()) {
        if (id === oceanId || cells.length < (O.straitMin || 60)) continue;
        const dist = new Float32Array(gn).fill(Infinity);
        const prev = new Int32Array(gn).fill(-1);
        const q = new Heap();
        for (const c of cells) { dist[c] = 0; q.push({ cell: c, pri: 0 }); }
        let hit = -1;
        while (q.a.length) {
          const { cell, pri } = q.pop();
          if (-pri > dist[cell]) continue;
          if (comp[cell] === oceanId) { hit = cell; break; }
          for (const c of nbrs(cell)) {
            const step = G.h[c] < 20 ? 0.02 : G.h[c] - 19;
            const nd = dist[cell] + step;
            if (nd < dist[c]) { dist[c] = nd; prev[c] = cell; q.push({ cell: c, pri: -nd }); }
          }
        }
        if (hit === -1) continue;
        let cut = 0;
        for (let c = hit; c !== -1; c = prev[c]) {
          if (G.h[c] >= 20) {
            G.h[c] = 12; cut++;
            for (const n2 of nbrs(c)) if (G.h[n2] >= 20 && hash2(c, n2) > 0.5) { G.h[n2] = 14; cut++; }
          }
        }
        if (cut) log.push(`cut a strait of ${cut} cells from an inland sea of ${cells.length} cells to the ocean`);
      }
    }

    // Great lakes. A dry continental interior with no standing water looks
    // unfinished; a couple of real basins give the map somewhere for a river to
    // end that is not the sea.
    {
      const inland = new Int32Array(gn).fill(0);
      let ring = [];
      for (let i = 0; i < gn; i++) if (G.h[i] < 20) { inland[i] = 0; ring.push(i); }
      const seen = new Uint8Array(gn);
      for (const c of ring) seen[c] = 1;
      for (let d = 1; ring.length; d++) {
        const next = [];
        for (const c of ring) for (const q of nbrs(c)) {
          if (seen[q]) continue;
          seen[q] = 1; inland[q] = d; next.push(q);
        }
        ring = next;
      }
      const want = O.lakes === undefined ? 6 : O.lakes;
      const cand = [];
      for (let i = 0; i < gn; i++)
        if (G.h[i] >= 20 && G.h[i] < 46 && inland[i] >= (O.lakeInland || 7) && uplift[i] < 0.15)
          cand.push(i);
      cand.sort((a, b) => (hash2(a, 401) - hash2(b, 401)));
      const placed = [];
      for (const c of cand) {
        if (placed.length >= want) break;
        if (placed.some(p => Math.hypot(GP[p][0] - GP[c][0], GP[p][1] - GP[c][1]) < W * 0.13)) continue;
        placed.push(c);
      }
      let lakeCells = 0;
      placed.forEach((c, k) => {
        const r = (O.lakeR || 3.2) * SP * (0.6 + 1.5 * hash2(k, 77));
        const ex = 0.7 + 0.9 * hash2(k, 91), ang = hash2(k, 55) * Math.PI;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (let i = 0; i < gn; i++) {
          if (G.h[i] < 20) continue;
          const dx = GP[i][0] - GP[c][0], dy = GP[i][1] - GP[c][1];
          const u = (dx * ca + dy * sa) / ex, v = (-dx * sa + dy * ca) * ex;
          const d = Math.hypot(u, v) / r;
          if (d > 1) continue;
          const wob = 0.72 + 0.5 * fbm(GP[i][0] + 2200, GP[i][1] + 9100, 3, 0.02);
          if (d > wob) continue;
          G.h[i] = 13; lakeCells++;
        }
      });
      if (lakeCells) log.push(`flooded ${placed.length} inland basins (${lakeCells} cells) as great lakes`);
    }

    const DBG = { flat: 0 };
    // uplift as 0..1, for steering territories onto the range
    const upMax = Math.max(0.0001, uplift.reduce((a, b) => Math.max(a, b), 0));
    const upN = new Float32Array(gn);
    for (let i = 0; i < gn; i++) upN[i] = uplift[i] / upMax;
    // When the land comes from a template, its own Range strokes ARE its
    // orogen — and they are the only relief that agrees with the coastline it
    // just drew. Blend them into the uplift, because everything downstream
    // reads this one field: the chains are walked along it, the carve steers a
    // mountain nation onto it, and the fold belt is gated by it. Only ground
    // well above the template's own plains counts; taken as absolute height it
    // reads as uplift everywhere there is land at all.
    if (O.landFrom === 'template') {
      const at = O.tmplHillAt === undefined ? 34 : O.tmplHillAt;
      const wd = O.tmplHillW === undefined ? 26 : O.tmplHillW;
      const mix = O.templateRelief === undefined ? 0.72 : O.templateRelief;
      for (let i = 0; i < gn; i++) {
        const r = Math.max(0, Math.min(1, (tmplRaw[i] - at) / wd));
        upN[i] = upN[i] * (1 - mix) + r * mix;
      }
    }

    // ---------- 3. landmasses of the world we just made --------------------
    const isLand = new Uint8Array(gn), landCells = [];
    for (let i = 0; i < gn; i++) if (G.h[i] >= 20) { isLand[i] = 1; landCells.push(i); }
    const massOf = new Int32Array(gn).fill(-1);
    const masses = [];
    for (const s of landCells) {
      if (massOf[s] !== -1) continue;
      const id = masses.length, cells = [s];
      massOf[s] = id;
      for (let k = 0; k < cells.length; k++)
        for (const c of nbrs(cells[k]))
          if (isLand[c] && massOf[c] === -1) { massOf[c] = id; cells.push(c); }
      masses.push(cells);
    }
    log.push(`${landCells.length} land cells in ${masses.length} landmasses ` +
             `(largest ${masses.map(m => m.length).sort((a, b) => b - a).slice(0, 6).join(', ')})`);

    const seaDist = new Int32Array(gn).fill(9999);
    {
      let ring = [];
      for (const i of landCells)
        for (const c of nbrs(i)) if (!isLand[c]) { seaDist[i] = 1; ring.push(i); break; }
      for (let d = 2; ring.length; d++) {
        const next = [];
        for (const c of ring) for (const q of nbrs(c)) {
          if (!isLand[q] || seaDist[q] <= d) continue;
          seaDist[q] = d; next.push(q);
        }
        ring = next;
      }
    }

    // ---------- 4. seat the nations on the land the plates actually made ---
    const owner = new Int16Array(gn).fill(-1);
    const seedCell = {}, homeMass = {};
    const bySize = masses.map((m, i) => [i, m.length]).sort((a, b) => b[1] - a[1]);

    // Each landmass belongs to whichever plate group dominates it. A landmass
    // dominated by wilderness plates stays unsettled — that is the point of it.
    const groupCells = {};
    for (const g of groupIds) groupCells[g] = [];
    const massGroup = {};
    const wildIds = new Set(WILD.map(w => w.id));
    wildIds.add(-9);                                  // the polar cap
    const iceEdge = (O.iceY || 0.115) * H * 1.6;
    for (const [mi, cells] of masses.entries()) {
      const tally = {};
      for (const c of cells) {
        const pg = GP[c][1] < iceEdge ? -9 : plateGroup[plateOf[c]];
        if (pg !== -1) tally[pg] = (tally[pg] || 0) + 1;
      }
      // A settled group ALWAYS outranks wilderness on a shared landmass. By
      // plain majority, a frontier that fused with a continent and happened to
      // be the larger half annexed the whole thing — eleven nations reduced to
      // a hundred cells between them. A frontier that comes out small is a
      // disappointment; a continent that vanishes is a broken map.
      let bg = null, bn = -1;
      for (const k of Object.keys(tally)) {
        const key = +k, mine = key >= 0, best = bg !== null && bg >= 0;
        if (bg === null || (mine && !best) || (mine === best && tally[k] > bn)) {
          bn = tally[k]; bg = key;
        }
      }
      // an island raised by a hotspot out in the ocean belongs to nobody
      if (bg === null) bg = -9;
      massGroup[mi] = bg;
      if (!wildIds.has(bg)) groupCells[bg].push(...cells);
    }
    for (const g of groupIds) {
      if (groupCells[g].length >= 40) continue;
      const donor = bySize.find(([mi]) => massGroup[mi] !== g && !wildIds.has(massGroup[mi]) &&
        groupCells[massGroup[mi]].length - masses[mi].length >= 300);
      if (!donor) continue;
      const mi = donor[0], from = massGroup[mi];
      groupCells[from] = groupCells[from].filter(c => massOf[c] !== mi);
      groupCells[g].push(...masses[mi]);
      massGroup[mi] = g;
    }
    const settled = new Uint8Array(gn);
    for (const g of groupIds) for (const c of groupCells[g]) settled[c] = 1;
    const settledCells = landCells.filter(c => settled[c]);
    for (const g of groupIds) {
      // The count on its own is misleading and was read wrongly for a while:
      // a continent whose 7,868 cells are one landmass of 7,862 plus six cells
      // on two skerries reads as "3 landmasses" and looks fractured. Print the
      // sizes, so a real split is visible and a stray cell is not.
      const per = {};
      for (const c of groupCells[g]) per[massOf[c]] = (per[massOf[c]] || 0) + 1;
      const sizes = Object.values(per).sort((a, b) => b - a);
      log.push(`group ${g}: ${groupCells[g].length} cells across ` +
        `${sizes.length} landmass(es) (${sizes.slice(0, 6).join(', ')})`);
    }
    for (const wd of WILD.concat([{ id: -9, why: 'the polar ice' }])) {
      const n = masses.reduce((a, m, mi) => a + (massGroup[mi] === wd.id ? m.length : 0), 0);
      if (n) log.push(`wilderness: ${n} cells — ${wd.why}`);
    }

    // which shoreline touches the open ocean, as opposed to a lake or inland sea
    const openSea = new Uint8Array(gn);
    {
      const seen = new Uint8Array(gn);
      let ring = [];
      for (let i = 0; i < gn; i++) {
        if (G.h[i] >= 20 || seen[i]) continue;
        if (GP[i][0] < SP || GP[i][1] < SP || GP[i][0] > W - SP || GP[i][1] > H - SP) { seen[i] = 1; ring.push(i); }
      }
      while (ring.length) {
        const next = [];
        for (const c of ring) for (const q of nbrs(c)) {
          if (G.h[q] >= 20 || seen[q]) continue;
          seen[q] = 1; next.push(q);
        }
        ring = next;
      }
      for (let i = 0; i < gn; i++)
        if (G.h[i] >= 20) for (const c of nbrs(i)) if (seen[c]) { openSea[i] = 1; break; }
    }

    const embed = (cells, members) => {
      if (!members.length || !cells.length) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of cells) {
        const [x, y] = GP[c];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const P = {};
      members.forEach(n => {
        P[n] = [(minX + maxX) / 2 + (hash2(idxOf[n], 313) - 0.5) * (maxX - minX) * 0.5,
                Math.max(minY, Math.min(maxY, yOfLat(LAND[n].tlat)))];
      });
      const R = {};
      const tw = members.reduce((a, n) => a + SIZE[n], 0);
      for (const n of members) R[n] = Math.sqrt((cells.length * SIZE[n] / tw) / Math.PI) * SP;
      for (let it = 0; it < (O.embedIters || 500); it++) {
        const F2 = {}; members.forEach(n => { F2[n] = [0, 0]; });
        for (let i = 0; i < members.length; i++)
          for (let j = i + 1; j < members.length; j++) {
            const a = members[i], b = members[j];
            let dx = P[b][0] - P[a][0], dy = P[b][1] - P[a][1];
            const d = Math.hypot(dx, dy) || 1;
            dx /= d; dy /= d;
            const touch = R[a] + R[b];
            const f = (adjWant[a] || []).includes(b)
              ? (d - touch * (O.touchAt || 0.82)) * (O.attract || 0.10)
              : (d < touch * (O.separate || 1.12)
                  ? (d - touch * (O.separate || 1.12)) * (O.repel || 0.05) : 0);
            F2[a][0] += dx * f; F2[a][1] += dy * f;
            F2[b][0] -= dx * f; F2[b][1] -= dy * f;
          }
        for (const n of members) {
          const goal = Math.max(minY, Math.min(maxY, yOfLat(LAND[n].tlat)));
          F2[n][1] += (goal - P[n][1]) * (O.latPullEmbed || 0.045);
          P[n][0] = Math.max(minX, Math.min(maxX, P[n][0] + Math.max(-16, Math.min(16, F2[n][0]))));
          P[n][1] = Math.max(minY, Math.min(maxY, P[n][1] + Math.max(-16, Math.min(16, F2[n][1]))));
        }
      }
      const taken = new Set();
      for (const n of members) {
        let best = -1, bestD = Infinity;
        for (const pass of [0, 1]) {
          for (const c of cells) {
            if (taken.has(c)) continue;
            // `seaward` is the weaker sibling of `coastal`: it asks only that
            // the nation START on an open-sea shore, so its capital is a port
            // and a sea route can leave from it, and then lets the territory
            // grow wherever the ground and the latitude take it. `coastal`
            // additionally prices every cell by its distance from the water,
            // which turns a highland sultanate into a beach.
            if (pass === 0 && (LAND[n].coastal || LAND[n].seaward) && !openSea[c]) continue;
            if (pass === 0 && LAND[n].ridged && upN[c] < 0.35) continue;
            const dx = GP[c][0] - P[n][0], dy = GP[c][1] - P[n][1];
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = c; }
          }
          if (best !== -1) break;
          bestD = Infinity;
        }
        taken.add(best);
        seedCell[n] = best;
        homeMass[n] = massOf[best];
      }
    };
    for (const g of groupIds)
      embed(groupCells[g], NAMES.filter(n => GROUP[n] === g));

    const byMass = {};
    for (const g of groupIds) byMass[g] = NAMES.filter(n => GROUP[n] === g);

    // Where the water will run. Azgaar does not cut rivers until long after
    // territory is drawn, so if borders are to follow rivers we have to know
    // where they will be first: steepest-descent flow accumulation over the
    // finished heightmap, which is the same thing its river generator does,
    // so the drainage we predict here is the drainage it later carves.
    // Where the water will run. Azgaar does not cut rivers until long after
    // territory is drawn — and on a different graph — so if borders are to
    // follow water we must find it ourselves, on the grid, beforehand.
    //
    // Flow accumulation was the obvious way and it does not survive contact
    // with this terrain: the integer heightmap makes plains into tie-locked
    // plateaus, and the continuous field it came from is fractal enough that
    // water pools in local pits long before it reaches the sea. Both gave a
    // few dozen river cells on a map that grows eight hundred rivers, and
    // fixing it properly means depression-filling the whole surface.
    //
    // But a border does not follow a river because of its DISCHARGE. It
    // follows it because a river sits in the lowest line of a valley, and a
    // valley is a barrier however much water is in it. So measure the valley
    // directly: a cell markedly lower than the ground around it is a hollow,
    // and hollows chain together into exactly the linear low corridors that
    // rivers occupy and borders settle into.
    const drain = new Uint8Array(gn);
    {
      const lap = new Float32Array(gn);
      const vals = [];
      for (let i = 0; i < gn; i++) {
        if (G.h[i] < 20) continue;
        let sum = 0, k = 0;
        for (const c of nbrs(i)) { sum += fv[c]; k++; }
        if (!k) continue;
        lap[i] = sum / k - fv[i];              // positive = sits in a hollow
        vals.push(lap[i]);
      }
      // the lowest-lying share of the land, whatever this seed's relief scale
      vals.sort((a2, b2) => a2 - b2);
      const cut = vals[Math.floor(vals.length * (1 - (O.valleyFrac || 0.14)))];
      let n = 0;
      for (let i = 0; i < gn; i++) if (G.h[i] >= 20 && lap[i] >= cut) { drain[i] = 1; n++; }
      log.push(`drainage: ${n} valley cells to hold borders before territory is drawn`);
    }

    // ---------- 5. carve: cost-distance growth from each capital -----------
    // This used to be a capacity-constrained power diagram — every cell picked
    // its nation by straight-line distance from a seed. That cannot produce a
    // natural border, because it never looks at what lies BETWEEN: the result
    // is smooth arcs across whatever happens to be in the way. Territory now
    // GROWS, cell to cell, and the price of each step depends on the ground
    // crossed. Rivers and ridges are dear, so growth stalls there and two
    // nations meet on them — which is what a frontier actually is.
    //
    // Everything is a multiplier on real distance, so the terms stay in the
    // same units. The old cost mixed raw constants into squared pixels, which
    // is how two of its preferences ended up two orders of magnitude too weak
    // to do anything at all.
    const areaScale = (W * H) / 2073600;
    const latCost = (O.latCost || 3000) * areaScale;
    const coastPull = (O.coastPull || 6500) * areaScale;
    const ridgePull = (O.ridgePull || 9000) * areaScale;
    function carve(cells, members, recentre) {
      if (!members.length) return;
      const tw = members.reduce((s2, n) => s2 + SIZE[n], 0);
      const target = {};
      for (const n of members) target[n] = Math.max(6, Math.round(cells.length * SIZE[n] / tw));
      const inSet = new Uint8Array(gn);
      for (const c of cells) inSet[c] = 1;
      const idxIn = {}; members.forEach((n, i) => { idxIn[n] = i; });
      const k = {}; members.forEach(n => { k[n] = 1; });

      // the price of stepping from a into b for nation n
      const stepCost = (a2, b2, n) => {
        const L = LAND[n];
        let c = Math.hypot(GP[b2][0] - GP[a2][0], GP[b2][1] - GP[a2][1]);
        // a river is the classic border: expensive to cross, so territory
        // stops on the bank and the neighbour stops on the other one — but not
        // for everyone. A delta polity moves BY the water, so riverW scales the
        // toll per nation: below 1 the rivers are its roads, above 1 its walls
        if (drain[b2]) c *= 1 + (O.riverBar || 3.4) * (L.riverW === undefined ? 1 : L.riverW);
        // and so is a watershed. Climbing is dear for everyone, but a nation
        // built to live up there pays a fraction of it
        const climb = Math.max(0, (G.h[b2] - 20) / 62);
        c *= 1 + (O.ridgeBar || 5.0) * climb * climb * (L.ridged ? 0.12 : 1);
        // preferences, same multiplicative footing as the terrain
        if (L.coastal) {
          const want = L.coastWant === undefined ? (O.coastWant || 4) : L.coastWant;
          c *= 1 + (O.coastBar || 0.55) * Math.max(0, seaDist[b2] - want);
        }
        if (L.ridged) c *= 1 + (O.ridgeWantBar || 1.6) * Math.max(0, 1 - upN[b2] / (O.ridgeWant || 0.35));
        const dl = Math.max(0, Math.abs(latOf(GP[b2][1]) - L.tlat) - (O.latFree || 9)) / 10;
        c *= 1 + (O.latBar || 0.85) * (L.latW === undefined ? 1 : L.latW) * dl * dl;
        return c * k[n];
      };

      // binary heap over (cost, cell, member)
      const HC = [], HX = [], HN = [];
      const hpush = (c, x, m) => {
        let i = HC.length; HC.push(c); HX.push(x); HN.push(m);
        while (i > 0) {
          const par = (i - 1) >> 1;
          if (HC[par] <= HC[i]) break;
          [HC[par], HC[i]] = [HC[i], HC[par]];
          [HX[par], HX[i]] = [HX[i], HX[par]];
          [HN[par], HN[i]] = [HN[i], HN[par]];
          i = par;
        }
      };
      const hpop = () => {
        const top = [HC[0], HX[0], HN[0]];
        const c = HC.pop(), x = HX.pop(), m = HN.pop();
        if (HC.length) {
          HC[0] = c; HX[0] = x; HN[0] = m;
          let i = 0;
          for (;;) {
            const l = i * 2 + 1, r = l + 1;
            let sm = i;
            if (l < HC.length && HC[l] < HC[sm]) sm = l;
            if (r < HC.length && HC[r] < HC[sm]) sm = r;
            if (sm === i) break;
            [HC[sm], HC[i]] = [HC[i], HC[sm]];
            [HX[sm], HX[i]] = [HX[i], HX[sm]];
            [HN[sm], HN[i]] = [HN[i], HN[sm]];
            i = sm;
          }
        }
        return top;
      };

      const dist = new Float64Array(gn);
      const mine = new Int16Array(gn);
      for (let it = 0; it < (O.growIters || 22); it++) {
        dist.fill(Infinity); mine.fill(-1);
        HC.length = 0; HX.length = 0; HN.length = 0;
        const size = {}; members.forEach(n => { size[n] = 0; });
        for (const n of members) { dist[seedCell[n]] = 0; hpush(0, seedCell[n], idxIn[n]); }
        while (HC.length) {
          const [cost, c, m] = hpop();
          if (mine[c] !== -1 || cost > dist[c] + 1e-9) continue;
          const n = members[m];
          mine[c] = m; size[n]++;
          for (const b2 of nbrs(c)) {
            if (!inSet[b2] || mine[b2] !== -1) continue;
            const nc = cost + stepCost(c, b2, n);
            if (nc < dist[b2]) { dist[b2] = nc; hpush(nc, b2, m); }
          }
        }
        for (const c of cells) if (mine[c] >= 0) owner[c] = idxOf[members[mine[c]]];
        if (it === (O.growIters || 22) - 1) break;
        // a nation short of its quota gets cheaper ground to cross next round
        const got = {}; members.forEach(n => { got[n] = 0; });
        for (const c of cells) if (mine[c] >= 0) got[members[mine[c]]]++;
        for (const n of members) {
          const r = Math.max(0.25, Math.min(4, got[n] / target[n]));
          k[n] *= Math.pow(r, O.growGain || 0.62);
          // Widening this clamp does NOT stop a runaway, though it looks like it
          // should: growth runs until every cell is claimed, so cost only decides
          // where two nations MEET. A nation alone beside an empty lobe takes the
          // whole lobe at any price. Oversize is geometric — fix it with a seed
          // where the lobes fall to nations that should be large, or a neighbour.
          k[n] = Math.max(0.2, Math.min(5, k[n]));
        }
        if (recentre !== false && it % 5 === 4) {
          const sum = {}; members.forEach(n => { sum[n] = [0, 0, 0]; });
          for (const c of cells) {
            const n = members[mine[c]];
            if (mine[c] < 0 || !sum[n]) continue;
            sum[n][0] += GP[c][0]; sum[n][1] += GP[c][1]; sum[n][2]++;
          }
          for (const n of members) {
            if (!sum[n][2]) continue;
            const cx = sum[n][0] / sum[n][2], cy = sum[n][1] / sum[n][2];
            let bc = seedCell[n], bd = Infinity;
            for (const c of cells) {
              if ((LAND[n].coastal || LAND[n].seaward) && seaDist[c] > (LAND[n].coastWant === undefined ? (O.coastWant || 4) : LAND[n].coastWant)) continue;
              if (drain[c]) continue;              // do not sit a capital in a riverbed
              const dx = GP[c][0] - cx, dy = GP[c][1] - cy;
              const d = dx * dx + dy * dy;
              if (d < bd) { bd = d; bc = c; }
            }
            seedCell[n] = bc;
          }
        }
      }
    }

    const adjacentNow = () => {
      const set = new Set();
      for (const i of settledCells) {
        const a = owner[i];
        if (a < 0) continue;
        for (const c of nbrs(i)) {
          const b = owner[c];
          if (b >= 0 && b !== a) set.add(a < b ? a + ':' + b : b + ':' + a);
        }
      }
      return set;
    };
    let missing = [], best = null, latRounds = 0;
    for (let attempt = 0; attempt <= (O.borderFix || 26); attempt++) {
      owner.fill(-1);
      for (const g of groupIds)
        carve(groupCells[g], byMass[g], O.recentre === true && attempt === 0);
      for (const i of settledCells) {
        if (owner[i] >= 0) continue;
        let bn = -1, bd = Infinity;
        for (const n of NAMES) {
          const s2 = GP[seedCell[n]];
          const dx = GP[i][0] - s2[0], dy = GP[i][1] - s2[1];
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; bn = idxOf[n]; }
        }
        owner[i] = bn;
      }
      const adj = adjacentNow();
      missing = BORDERS.filter(([a, b]) => GROUP[a] === GROUP[b] &&
        !adj.has(idxOf[a] < idxOf[b] ? idxOf[a] + ':' + idxOf[b] : idxOf[b] + ':' + idxOf[a]));
      const tally = new Int32Array(NAMES.length);
      const ySum = new Float64Array(NAMES.length);
      for (const i of settledCells) {
        const o = owner[i];
        if (o < 0) continue;
        tally[o]++; ySum[o] += GP[i][1];
      }
      let smallest = Infinity;
      for (const n of NAMES) smallest = Math.min(smallest, tally[idxOf[n]]);

      // This loop already re-seeds the world forty-five times looking for the
      // frontiers the vault requires, and it was scoring only those. Two of
      // the three things a reader still notices — a nation twenty degrees
      // south of the band its climate belongs in, and one at three times its
      // share — are visible in every one of those attempts and were being
      // thrown away with them. Score them too.
      //
      // Both terms are CAPPED below the price of a single required border, so
      // the search stays lexicographic: it never trades a frontier the notes
      // assert for a nation sitting a few degrees more comfortably. They only
      // choose between attempts that got the same borders.
      let drift = 0, fat = 0;
      {
        const quota = new Float64Array(NAMES.length);
        for (const g of groupIds) {
          const mem = NAMES.filter(n => GROUP[n] === g);
          let have = 0;
          for (const n of mem) have += tally[idxOf[n]];
          const tw2 = mem.reduce((a2, n) => a2 + SIZE[n], 0);
          for (const n of mem) quota[idxOf[n]] = Math.max(8, have * SIZE[n] / tw2);
        }
        for (const n of NAMES) {
          const k = idxOf[n];
          if (!tally[k]) { drift += 900; continue; }
          const d = Math.max(0, Math.abs(latOf(ySum[k] / tally[k]) - LAND[n].tlat) -
                                (O.driftFree || 8));
          drift += d * d;
          const over = Math.max(0, tally[k] / quota[k] - (O.fatFree || 2.0));
          fat += over * over;
        }
      }
      const score = -missing.length * 100
                  - Math.min(drift * (O.driftW || 0.10), 90)
                  - Math.min(fat * (O.fatW || 6), 60)
                  + Math.min(smallest, O.minCells || 60)
                  + Math.min(smallest, 400) / 1000;
      if (!best || score > best.score)
        best = { score, owner: Int16Array.from(owner), seeds: Object.assign({}, seedCell), missing: missing.slice() };
      if (attempt === (O.borderFix || 26)) break;
      const push = {};
      if (missing.length) {
        for (const [a, b] of missing) {
          const pa = GP[seedCell[a]], pb = GP[seedCell[b]];
          const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
          for (const [n, pt] of [[a, pa], [b, pb]]) {
            push[n] = push[n] || [0, 0, 0];
            push[n][0] += mx - pt[0]; push[n][1] += my - pt[1]; push[n][2]++;
          }
        }
      } else {
        // Every required frontier is met, and the loop used to stop here — on
        // the first arrangement that satisfied the vault's adjacencies,
        // whatever else was wrong with it. Nothing was pushing on the thing a
        // reader actually notices next: a nation twenty degrees south of the
        // band its climate belongs in.
        //
        // So spend what is left of the budget pulling the worst drifters back
        // north or south by the amount their own territory is out by. The
        // border pushes above are unchanged and still come first; an attempt
        // that loses a frontier scores a hundred points worse and is thrown
        // away, so this can only ever choose among arrangements that kept
        // them all.
        if (latRounds++ >= (O.latFix === undefined ? 14 : O.latFix)) break;
        let nudged = 0;
        for (const n of NAMES) {
          const k = idxOf[n];
          if (!tally[k]) continue;
          const off = yOfLat(LAND[n].tlat) - ySum[k] / tally[k];
          if (Math.abs(latOf(ySum[k] / tally[k]) - LAND[n].tlat) < (O.driftFree || 8)) continue;
          push[n] = [0, off, 1];
          nudged++;
        }
        if (!nudged) break;
      }
      for (const n of Object.keys(push)) {
        const cells = groupCells[GROUP[n]], pt = GP[seedCell[n]], k = push[n][2];
        const tx = pt[0] + (push[n][0] / k) * 0.22, ty = pt[1] + (push[n][1] / k) * 0.22;
        let bc = seedCell[n], bd = Infinity;
        for (const c of cells) {
          if ((LAND[n].coastal || LAND[n].seaward) && seaDist[c] > (LAND[n].coastWant === undefined ? (O.coastWant || 4) : LAND[n].coastWant)) continue;
          const dx = GP[c][0] - tx, dy = GP[c][1] - ty;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; bc = c; }
        }
        seedCell[n] = bc;
      }
    }
    if (best) { owner.set(best.owner); Object.assign(seedCell, best.seeds); missing = best.missing; }

    // ---------- 5b. trade the excess along the frontiers a nation has -----
    // The cost multiplier in the carve cannot shrink a runaway, and the reason
    // is structural: growth runs until every cell is claimed, so cost decides
    // only where two nations MEET. A nation alone beside an empty lobe takes
    // the whole lobe at any price — which is how Tal Ulad came out at four
    // times its share while Voskreld and Sahenna sat at a fifth of theirs.
    //
    // What works is trading. Peel the cells furthest from a swollen nation's
    // own seat and hand each one to whichever neighbour is furthest under its
    // own quota. It runs ONCE, here, on the finished territory, and not inside
    // the carve: the first version ran on every border-fix attempt, severed a
    // frontier the vault requires, and the attempt loop then spent the rest of
    // its budget re-seeding to win that border back — scoring a hundred points
    // for the border against thirteen for the country it crushed getting
    // there. A required frontier is guarded here for the same reason.
    if (O.trimRounds !== 0) {
      const rounds = O.trimRounds === undefined ? 12 : O.trimRounds;
      const over  = O.trimOver  === undefined ? 1.30 : O.trimOver;
      const under = O.trimUnder === undefined ? 0.90 : O.trimUnder;
      const ckey = (a2, b2) => (a2 < b2 ? a2 + ':' + b2 : b2 + ':' + a2);
      const req = new Set();
      for (const [a2, b2] of BORDERS) {
        if (idxOf[a2] === undefined || idxOf[b2] === undefined) continue;
        req.add(ckey(idxOf[a2], idxOf[b2]));
      }
      const contact = new Map();
      for (const i of settledCells) {
        const a2 = owner[i];
        if (a2 < 0) continue;
        for (const c of nbrs(i)) {
          const o = owner[c];
          if (o < 0 || o === a2) continue;
          const k2 = ckey(a2, o);
          contact.set(k2, (contact.get(k2) || 0) + 1);
        }
      }
      const got = new Int32Array(NAMES.length);
      for (const i of settledCells) if (owner[i] >= 0) got[owner[i]]++;
      const target = new Float64Array(NAMES.length);
      for (const g of groupIds) {
        const mem = NAMES.filter(n => GROUP[n] === g);
        let have = 0;
        for (const i of settledCells) if (owner[i] >= 0 && GROUP[NAMES[owner[i]]] === g) have++;
        const tw2 = mem.reduce((a2, n) => a2 + SIZE[n], 0);
        for (const n of mem) target[idxOf[n]] = Math.max(8, have * SIZE[n] / tw2);
      }
      const ratio = k => got[k] / target[k];
      // A frontier the vault requires must survive the trade.
      const ckey2 = ckey;
      // outermost first, measured from the nation's own seat
      const far = new Float64Array(gn);
      for (const i of settledCells) {
        const o = owner[i];
        if (o < 0) continue;
        const s2 = GP[seedCell[NAMES[o]]];
        far[i] = Math.hypot(GP[i][0] - s2[0], GP[i][1] - s2[1]);
      }
      let total = 0;
      // Three passes, each looser than the last:
      //   1. the runaways feed the starved
      //   2. the starved are fed by anyone barely over quota — a nation at a
      //      third of its share is a failure whoever is next to it
      //
      // A third, looser pass was tried — a serious runaway shedding onto
      // whoever it touches, however healthy — and it is a trap: it fixed the
      // size flag and cost two required frontiers and two trade legs, because
      // the cells a runaway has to give up in that case are exactly the ones
      // holding it against its neighbours. Size is not worth a border.
      const stages = O.trimStages || [[over, under], [1.02, 0.55]];
      for (const [hi, lo] of stages) {
        for (let round = 0; round < rounds; round++) {
          const givers = [], takers = new Set();
          for (let k = 0; k < NAMES.length; k++) {
            if (!target[k]) continue;
            if (ratio(k) > hi) givers.push(k);
            else if (ratio(k) < lo) takers.add(k);
          }
          if (!givers.length || !takers.size) break;
          givers.sort((a2, b2) => ratio(b2) - ratio(a2));
          let moved = 0;
          for (const gi of givers) {
            const own = [];
            for (const i of settledCells) if (owner[i] === gi) own.push(i);
            own.sort((a2, b2) => far[b2] - far[a2]);
            for (const c of own) {
              if (ratio(gi) <= hi) break;
              let take2 = -1, bestR = Infinity;
              for (const b2 of nbrs(c)) {
                const o = owner[b2];
                if (o < 0 || o === gi || !takers.has(o)) continue;
                if (GROUP[NAMES[o]] !== GROUP[NAMES[gi]]) continue;
                const r2 = ratio(o);
                if (r2 < bestR) { bestR = r2; take2 = o; }
              }
              if (take2 < 0) continue;
              const delta = new Map();
              for (const b2 of nbrs(c)) {
                const o = owner[b2];
                if (o < 0) continue;
                if (o !== gi) { const k2 = ckey2(gi, o); delta.set(k2, (delta.get(k2) || 0) - 1); }
                if (o !== take2) { const k2 = ckey2(take2, o); delta.set(k2, (delta.get(k2) || 0) + 1); }
              }
              let severs = false;
              for (const [k2, d] of delta) {
                if (req.has(k2) && (contact.get(k2) || 0) + d <= 0) { severs = true; break; }
              }
              if (severs) continue;
              for (const [k2, d] of delta) contact.set(k2, (contact.get(k2) || 0) + d);
              owner[c] = take2; got[gi]--; got[take2]++; moved++; total++;
              if (ratio(take2) >= lo) takers.delete(take2);
            }
          }
          if (!moved) break;
        }
      }
      if (total) {
        const rank = NAMES.map((n, k) => [n, ratio(k)]).filter(x => target[idxOf[x[0]]])
                          .sort((a2, b2) => b2[1] - a2[1]);
        log.push(`territory traded: ${total} cells from the swollen to the starved; ` +
                 `worst now ${rank[0][0]} ${rank[0][1].toFixed(1)}x and ` +
                 `${rank[rank.length - 1][0]} ${rank[rank.length - 1][1].toFixed(1)}x`);
      }
    }


    // The trade above moves cells, so the list of frontiers the vault requires
    // has to be taken again before the bridging below tries to repair it —
    // otherwise the repair is working from a map that no longer exists.
    {
      const adj = adjacentNow();
      missing = BORDERS.filter(([a2, b2]) => GROUP[a2] === GROUP[b2] &&
        !adj.has(idxOf[a2] < idxOf[b2] ? idxOf[a2] + ':' + idxOf[b2]
                                       : idxOf[b2] + ':' + idxOf[a2]));
    }


    if (missing.length) {
      const maxGap = O.microCorridor || 6;
      const still = [];
      for (const [a, b] of missing) {
        const A = idxOf[a], B = idxOf[b];
        const dist = new Int32Array(gn).fill(-1);
        const prev = new Int32Array(gn).fill(-1);
        let ring = [];
        for (const i of settledCells) if (owner[i] === A) { dist[i] = 0; ring.push(i); }
        let hit = -1;
        for (let d = 1; d <= maxGap + 1 && ring.length && hit === -1; d++) {
          const next = [];
          for (const c of ring) {
            for (const q of nbrs(c)) {
              if (!isLand[q] || !settled[q] || dist[q] !== -1 || massOf[q] !== massOf[c]) continue;
              dist[q] = d; prev[q] = c;
              if (owner[q] === B) { hit = q; break; }
              next.push(q);
            }
            if (hit !== -1) break;
          }
          ring = next;
        }
        if (hit === -1) { still.push([a, b]); continue; }
        const path = [];
        for (let c = hit; c !== -1; c = prev[c]) path.push(c);
        const flip = path.filter(c => owner[c] !== A && owner[c] !== B);
        if (flip.length > maxGap) { still.push([a, b]); continue; }
        flip.forEach((c, k) => { owner[c] = k < flip.length / 2 ? A : B; });
        log.push(`bridged ${a} <-> ${b} across ${flip.length} cell(s)`);
      }
      missing = still;
    }
    if (missing.length) log.push('borders unreached: ' + missing.map(x => x.join(' <-> ')).join('; '));

    // ---------- 6. relief, then let the borders fall onto it ---------------
    // ONE range system for the whole world, and nations placed on it.
    //
    // Relief used to be painted per nation out of its own `elev` band, with
    // `elev[0]` as a floor. That gives a mountain nation whose every cell is
    // at mountain height: a solid blob of hatching in the shape of a country,
    // stopping dead at the frontier, with a flat plain on the other side.
    // Real ranges do not know where the borders are. The Alps run through six
    // countries, the Andes are one chain for seven thousand kilometres, and
    // either side of a crest there are foothills, spurs and passes rather than
    // a step down to a plain.
    //
    // So height is built in two parts. First the OROGEN, which is global: the
    // collision uplift a cell actually sits on, folded into ridges running
    // along the front and dying away from it, plus rolling background. That
    // field crosses every border, because plates do. Then a REGIONAL BIAS —
    // one number per nation, the gap between the ground it was given and the
    // band its note claims — which is smoothed across the whole map before it
    // is added, so a mountain kingdom rides high and its neighbour comes down
    // off the range gradually instead of falling off a cliff at the border.
    const RANGE = O.rangeH === undefined ? 66 : O.rangeH;
    const PLAINH = O.plainH === undefined ? 15 : O.plainH;
    const BIAS = O.nationBias === undefined ? 1 : O.nationBias;
    const BIASBLUR = O.biasBlur === undefined ? 7 : O.biasBlur;

    // CRESTS. A fold field says where mountains are; it does not say where any
    // one range STARTS and ENDS, so the whole orogen comes out as texture —
    // corrugation over a wide area rather than a chain you could name. Azgaar's
    // own `Range` operator has the answer and has had it all along: a range is a
    // PATH. Walk a connected line of cells, raise it, let the height fall away
    // either side, and the result reads as a range because it is one. The Old
    // World template is three of those strokes plus hills, and its mountains
    // look more like mountains than any noise field's do.
    //
    // The difference here is that the strokes are not random. Each one is walked
    // along the crest of the orogen the plates already built — step to whichever
    // neighbour holds the most uplift, favour carrying straight on over turning
    // back, and stop where the uplift runs out. So the chains follow the real
    // collision fronts, fork where the fronts fork, and taper at both ends the
    // way a range dies into foothills instead of stopping at a contour.
    const crestBelt = () => {
      const AT = O.crestAt === undefined ? 0.46 : O.crestAt;      // start a chain here
      const END = O.crestEnd === undefined ? 0.22 : O.crestEnd;   // give up here
      const MINLEN = O.crestMin === undefined ? 8 : O.crestMin;
      const MAXLEN = O.crestMax === undefined ? 140 : O.crestMax;
      const FLANK = O.crestFlank === undefined ? 0.54 : O.crestFlank;
      const TAPER = O.crestTaper === undefined ? 9 : O.crestTaper;
      const KEEPOUT = O.crestKeepout === undefined ? 4 : O.crestKeepout;
      const val = new Float32Array(gn);

      const seeds = [];
      for (let i = 0; i < gn; i++) if (isLand[i] && upN[i] >= AT) seeds.push(i);
      seeds.sort((a, b) => upN[b] - upN[a]);

      // A chain is only a chain if it stands alone. Left to itself the walk
      // starts a new one beside the last, and a dozen ranges packed a cell
      // apart is a plateau — which is the blob this was written to be rid of.
      // So each finished chain fences off the ground around it, and the next
      // range has to start somewhere else.
      const claimed = new Uint8Array(gn);   // cells a chain has walked
      const fenced = new Uint8Array(gn);    // and the ground it holds off
      const chains = [];
      for (const s0 of seeds) {
        if (claimed[s0] || fenced[s0]) continue;
        const chain = [s0];
        claimed[s0] = 1;
        // walk away from the seed twice, so a chain grows out of its own
        // highest point in both directions rather than trailing off one end
        for (let dir = 0; dir < 2; dir++) {
          let cur = s0, prev = -1;
          for (let step = 0; step < MAXLEN; step++) {
            let best = -1, bv = 0;
            for (const c of nbrs(cur)) {
              if (!isLand[c] || claimed[c] || upN[c] < END) continue;
              let v = upN[c];
              if (prev >= 0) {
                // momentum: a range bends, it does not double back
                const [px, py] = GP[prev], [cx, cy] = GP[cur], [nx, ny] = GP[c];
                const ax = cx - px, ay = cy - py, bx = nx - cx, by = ny - cy;
                const m = Math.hypot(ax, ay) * Math.hypot(bx, by) || 1;
                v *= 0.45 + 0.55 * Math.max(0, (ax * bx + ay * by) / m);
              }
              v *= 0.85 + 0.30 * hash2(c * 11 + dir, step * 7);
              if (v > bv) { bv = v; best = c; }
            }
            if (best < 0) break;
            claimed[best] = 1;
            if (dir === 0) chain.push(best); else chain.unshift(best);
            prev = cur; cur = best;
          }
        }
        if (chain.length < MINLEN) continue;
        chains.push(chain);
        let ring2 = chain.slice();
        for (const i of ring2) fenced[i] = 1;
        for (let r = 0; r < KEEPOUT && ring2.length; r++) {
          const nx = [];
          for (const i of ring2) for (const c of nbrs(i)) {
            if (fenced[c]) continue;
            fenced[c] = 1; nx.push(c);
          }
          ring2 = nx;
        }
      }

      // lay the chains down, tapering to nothing at either end and dropping
      // into saddles along the way — the passes roads and armies have to use
      const ring0 = [];
      for (const chain of chains) {
        const L = chain.length;
        for (let k = 0; k < L; k++) {
          const i = chain[k];
          const [x, y] = GP[i];
          const gap = 0.55 + 0.45 * fbm(x + 3300, y + 8800, 2, O.passFreq || 0.0042);
          const taper = Math.min(1, (Math.min(k, L - 1 - k) + 1) / TAPER);
          const a = gap * (0.35 + 0.65 * taper);
          if (a > val[i]) { val[i] = a; ring0.push(i); }
        }
      }
      // and let each one fall away over its own flanks
      let ring = ring0;
      for (let r = 0; r < 24 && ring.length; r++) {
        const next = [];
        for (const i of ring) {
          const v = val[i] * FLANK;
          if (v < 0.05) continue;
          for (const c of nbrs(i)) {
            if (!isLand[c] || val[c] >= v - 1e-4) continue;
            val[c] = v; next.push(c);
          }
        }
        ring = next;
      }
      log.push(`${chains.length} range chain(s), longest ${chains.reduce((m, c) => Math.max(m, c.length), 0)} cells`);
      return val;
    };
    const CREST = O.relief === 'crest' ? crestBelt() : null;

    const h0 = new Float32Array(gn);
    for (let i = 0; i < gn; i++) {
      if (!isLand[i]) { h0[i] = G.h[i]; continue; }
      const [x, y] = GP[i];
      const shore = Math.min(1, (seaDist[i] - 1) / 3);
      // parallel folds along the collision front, dying away from it
      const phase = bWarp[i] * (O.foldFreq || 0.55) + (fbm(x, y, 2, 0.018) - 0.5) * 3.0;
      const fold = 1 - Math.abs(Math.sin(phase));
      const spine = Math.min(1, upN[i] / (O.spineAt || 0.42));
      // A range with no gaps in it is a wall, and a wall is not somewhere a
      // campaign happens. Modulate the crest along its own length so it drops
      // into saddles — the passes that roads, armies and trade all have to
      // use, and that every border on this map is drawn to run through.
      const gap = 0.62 + 0.38 * fbm(x + 3300, y + 8800, 2, O.passFreq || 0.0042);
      const folded = Math.pow(fold, O.foldSharp || 1.6) * spine * spine * gap;
      // The folds are the foothills — broad, and what a nation's terrain claim
      // actually stands on. The chains are the range itself. Keeping both is
      // what puts a white crest line inside a wide brown country instead of
      // either a bare plateau or a bare thread.
      const belt = CREST
        ? folded * (O.crestMix === undefined ? 0.52 : O.crestMix)
          + CREST[i] * (O.crestAmp === undefined ? 0.95 : O.crestAmp)
        : folded;
      // a range does not politely subside before it reaches the sea, but a
      // plain does fade to the shore
      const plain = fbm(x, y, 5, 0.010) * (0.35 + 0.65 * shore);
      h0[i] = 21 + PLAINH * plain + RANGE * belt * (0.55 + 0.45 * shore);
      // volcanic country is a field of isolated cones, not a folded range
      const n0 = owner[i] >= 0 ? NAMES[owner[i]] : null;
      if (n0 && LAND[n0].volcanic) {
        const cone = ridge(x + 1900, y + 4400, 3, 0.014);
        h0[i] += RANGE * 0.75 * Math.pow(Math.max(0, (cone - 0.45) / 0.55), 2.2);
      }
    }

    // what each nation was given against what its note claims
    const bAcc = new Float64Array(NAMES.length), bCnt = new Int32Array(NAMES.length);
    for (let i = 0; i < gn; i++) {
      const o = isLand[i] ? owner[i] : -1;
      if (o < 0) continue;
      bAcc[o] += h0[i]; bCnt[o]++;
    }
    const off = new Float32Array(gn);
    for (let i = 0; i < gn; i++) {
      const o = isLand[i] ? owner[i] : -1;
      if (o < 0 || !bCnt[o]) continue;
      const L = LAND[NAMES[o]];
      const want = (L.elev[0] + L.elev[1]) / 2;
      off[i] = (want - bAcc[o] / bCnt[o]) * BIAS;
    }
    // Smoothing the bias is what turns a political step into a slope: without
    // it every frontier between a highland and a lowland is a wall.
    {
      const tmp = new Float32Array(gn);
      for (let k = 0; k < BIASBLUR; k++) {
        for (let i = 0; i < gn; i++) {
          let s2 = off[i], c2 = 1;
          for (const c of nbrs(i)) { s2 += off[c]; c2++; }
          tmp[i] = s2 / c2;
        }
        off.set(tmp);
      }
    }

    // A frontier the vault describes as mountain country is a fact about the
    // ground, not an accident of where two nations stopped growing. Find the
    // cells where the pair actually meet and raise a ridge along them, falling
    // away over a few cells either side — so Thesal and Vaelic meet across a
    // pass instead of across a field, which is what makes their alliance a
    // road between two capitals rather than a march.
    if (RIDGE_BORDERS.length) {
      const lift = O.borderRidge === undefined ? 46 : O.borderRidge;
      const reach = O.borderRidgeReach === undefined ? 5 : O.borderRidgeReach;
      let raised = 0;
      for (const [a2, b2] of RIDGE_BORDERS) {
        const A = idxOf[a2], B = idxOf[b2];
        if (A === undefined || B === undefined) continue;
        const seam = [];
        for (let i = 0; i < gn; i++) {
          if (!isLand[i] || (owner[i] !== A && owner[i] !== B)) continue;
          const want = owner[i] === A ? B : A;
          for (const c of nbrs(i)) if (isLand[c] && owner[c] === want) { seam.push(i); break; }
        }
        if (!seam.length) continue;
        const d = new Int32Array(gn).fill(-1);
        let ring = seam.slice();
        for (const i of ring) d[i] = 0;
        for (let r = 1; r <= reach && ring.length; r++) {
          const next = [];
          for (const c of ring) for (const q of nbrs(c)) {
            if (!isLand[q] || d[q] !== -1) continue;
            d[q] = r; next.push(q);
          }
          ring = next;
        }
        for (let i = 0; i < gn; i++) {
          if (d[i] < 0) continue;
          const t2 = 1 - d[i] / (reach + 1);
          off[i] += lift * t2 * t2;
        }
        raised += seam.length;
      }
      if (raised) log.push(`raised ${raised} cells of frontier the vault calls mountains`);
    }

    // Blurring the bias is what makes the range cross the border, and it also
    // smears a small nation's own correction away into its neighbours:
    // Melisor, 178 cells of claimed highland, came out at grassland height.
    // So measure the gap again on the blurred field and close part of it
    // unblurred — enough to hold the claim, not enough to rebuild the wall.
    {
      const pin = O.nationPin === undefined ? 0.55 : O.nationPin;
      if (pin > 0) {
        const acc2 = new Float64Array(NAMES.length), cnt2 = new Int32Array(NAMES.length);
        for (let i = 0; i < gn; i++) {
          const o = isLand[i] ? owner[i] : -1;
          if (o < 0) continue;
          acc2[o] += h0[i] + off[i]; cnt2[o]++;
        }
        for (let i = 0; i < gn; i++) {
          const o = isLand[i] ? owner[i] : -1;
          if (o < 0 || !cnt2[o]) continue;
          const L = LAND[NAMES[o]];
          const want = (L.elev[0] + L.elev[1]) / 2;
          off[i] += (want - acc2[o] / cnt2[o]) * pin;
        }
      }
    }

    const tgtH = new Float32Array(gn);
    for (let i = 0; i < gn; i++) {
      if (!isLand[i]) { tgtH[i] = G.h[i]; continue; }
      if (owner[i] < 0) {
        // wilderness keeps whatever the plates built, with its own grain
        const [x, y] = GP[i];
        const wild = ridge(x + 5100, y + 700, 4, 0.013) * 20;
        tgtH[i] = Math.max(20, h0[i] * 0.72 + G.h[i] * 0.28 + wild * 0.5 + off[i]);
        continue;
      }
      tgtH[i] = Math.max(20, h0[i] + off[i]);
    }

    const relax = (rounds, tol) => {
      const relief = new Float32Array(gn);
      for (const i of settledCells) {
        let sum = 0, k = 0;
        for (const c of nbrs(i)) { if (!isLand[c]) continue; sum += tgtH[c]; k++; }
        relief[i] = k ? tgtH[i] - sum / k : 0;
      }
      const cost = (i, j) => {
        const rdg = Math.max(0, Math.min(relief[i], relief[j])) / 6;
        const trench = Math.max(0, -Math.max(relief[i], relief[j])) / 6;
        const slope = Math.abs(tgtH[i] - tgtH[j]) / 14;
        const wander = hash2(i * 7, j * 13) * 0.35;
        return 1 / (1 + Math.min(2.2, rdg + trench + slope + wander));
      };
      const count = new Int32Array(NAMES.length);
      for (const i of settledCells) if (owner[i] >= 0) count[owner[i]]++;
      const target = Int32Array.from(count);
      const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
      const required = new Set();
      for (const [a, b] of BORDERS) if (GROUP[a] === GROUP[b]) required.add(key(idxOf[a], idxOf[b]));
      const contact = new Map();
      for (const i of settledCells) {
        const a = owner[i];
        if (a < 0) continue;
        for (const c of nbrs(i)) {
          if (!isLand[c] || owner[c] < 0 || owner[c] === a) continue;
          const k = key(a, owner[c]);
          contact.set(k, (contact.get(k) || 0) + 1);
        }
      }
      for (let round = 0; round < rounds; round++) {
        let moved = 0;
        for (const i of settledCells) {
          const mine = owner[i];
          if (mine < 0) continue;
          const Lm = LAND[NAMES[mine]];
          if ((Lm.coastal || Lm.seaward) && seaDist[i] <= 1) continue;
          const tally = {};
          let own = 0;
          for (const c of nbrs(i)) {
            if (!isLand[c] || owner[c] < 0 || massOf[c] !== massOf[i]) continue;
            if (owner[c] === mine) { own++; continue; }
            tally[owner[c]] = (tally[owner[c]] || 0) + 1;
          }
          const cands = Object.keys(tally).map(Number);
          if (!cands.length || own < 2) continue;
          const energy = who => {
            let e = 0;
            for (const c of nbrs(i)) {
              if (!isLand[c] || owner[c] < 0) continue;
              if (owner[c] !== who) e += cost(i, c);
            }
            return e;
          };
          const stay = energy(mine);
          let bw = -1, bg = 1e-6;
          for (const w of cands) {
            if (tally[w] < 2) continue;
            if (count[w] >= target[w] * (1 + tol)) continue;
            if (count[mine] <= target[mine] * (1 - tol)) continue;
            const g = stay - energy(w);
            if (g > bg) { bg = g; bw = w; }
          }
          if (bw < 0) continue;
          const delta = new Map();
          for (const c of nbrs(i)) {
            if (!isLand[c] || owner[c] < 0) continue;
            const o = owner[c];
            if (o !== mine) { const k = key(mine, o); delta.set(k, (delta.get(k) || 0) - 1); }
            if (o !== bw) { const k = key(bw, o); delta.set(k, (delta.get(k) || 0) + 1); }
          }
          let severs = false;
          for (const [k, d] of delta) if (required.has(k) && (contact.get(k) || 0) + d <= 0) { severs = true; break; }
          if (severs) continue;
          for (const [k, d] of delta) contact.set(k, (contact.get(k) || 0) + d);
          count[mine]--; count[bw]++; owner[i] = bw; moved++;
        }
        if (!moved) break;
      }
    };
    if (O.relaxRounds) relax(O.relaxRounds, O.sizeTol || 0.18);

    const blurPass = (arr, keep) => {
      const out = new Float32Array(gn);
      for (let i = 0; i < gn; i++) {
        let s = 0, k = 0;
        for (const c of nbrs(i)) { s += arr[c]; k++; }
        out[i] = k ? arr[i] * keep + (s / k) * (1 - keep) : arr[i];
      }
      return out;
    };
    let bh = tgtH;
    for (let k = 0; k < (O.blur || 2); k++) bh = blurPass(bh, O.keepH || 0.62);
    for (let i = 0; i < gn; i++) if (isLand[i]) G.h[i] = Math.max(20, Math.min(100, Math.round(bh[i])));

    // ---------- 7. climate, from the finished heightmap ---------------------
    // Zonal temperature, zonal rainfall, prevailing winds that swing with
    // latitude, orographic enhancement climbing a range and rain shadow behind
    // it. Every desert, steppe and rainforest below is a consequence of where
    // the mountains ended up, not a colour someone chose.
    const TEQ = O.tempEquator === undefined ? 27 : O.tempEquator;
    const TAMP = O.tempAmp === undefined ? 30 : O.tempAmp;
    const LAPSE = O.lapse === undefined ? 0.22 : O.lapse;
    const T0 = lat => TEQ - TAMP * Math.pow(Math.abs(lat) / 60, 1.8);

    // rainfall by latitude: ITCZ, horse latitudes, westerlies, polar desert
    const PBAND = [[0, 23], [6, 22], [12, 15], [20, 6], [27, 3], [33, 6],
                   [40, 11], [48, 15], [55, 14], [62, 9], [70, 4], [85, 2]];
    const P0 = lat => {
      const a = Math.abs(lat);
      for (let k = 1; k < PBAND.length; k++) {
        if (a > PBAND[k][0]) continue;
        const [x0, y0] = PBAND[k - 1], [x1, y1] = PBAND[k];
        return y0 + (y1 - y0) * (a - x0) / (x1 - x0);
      }
      return PBAND[PBAND.length - 1][1];
    };
    // which way the wind blows: trades near the equator, westerlies in the
    // mid-latitudes, polar easterlies at the top. Returns the UPWIND direction.
    const upwind = lat => {
      const a = Math.abs(lat), s = lat >= 0 ? 1 : -1;
      if (a < 30) return [1, -0.25 * s];        // NE trades: air comes from the east
      if (a < 60) return [-1, -0.30 * s];       // westerlies: air comes from the west
      return [1, 0.20 * s];                     // polar easterlies
    };

    const mT = new Float32Array(gn), mP = new Float32Array(gn);
    const MAXW = O.windSteps || 55;
    const DRY = O.dryPerStep === undefined ? 0.030 : O.dryPerStep;
    const ORO = O.oroDrain === undefined ? 0.030 : O.oroDrain;
    const BOOST = O.oroBoost === undefined ? 0.032 : O.oroBoost;
    for (let i = 0; i < gn; i++) {
      const [x, y] = GP[i];
      const lat = latOf(y);
      mT[i] = T0(lat) - (isLand[i] ? LAPSE * Math.max(0, G.h[i] - 20) : 0)
            + (fbm(x + 900, y + 40, 3, 0.014) - 0.5) * 2.2;
      if (!isLand[i]) { mP[i] = P0(lat); continue; }
      // walk upwind to find where this air came from
      const [ux, uy] = upwind(lat);
      const ul = Math.hypot(ux, uy);
      const sx = ux / ul * SP, sy = uy / ul * SP;
      const path = [i];
      let cx = x, cy = y, reached = false;
      for (let k = 0; k < MAXW; k++) {
        cx += sx; cy += sy;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
        const c = cellAt(cx, cy);
        if (c === path[path.length - 1]) continue;
        path.push(c);
        if (!isLand[c]) { reached = true; break; }
      }
      // integrate downwind: moisture is lost crossing land and wrung out by lift
      let m = reached ? 1 : 0.45;
      for (let k = path.length - 1; k > 0; k--) {
        const cur = path[k], nxt = path[k - 1];
        if (!isLand[cur]) { m = Math.min(1, m * 0.55 + 0.45); continue; }
        const lift = Math.max(0, G.h[nxt] - G.h[cur]);
        m *= Math.exp(-(DRY + lift * ORO));
      }
      const liftHere = path.length > 1 ? Math.max(0, G.h[i] - G.h[path[1]]) : 0;
      const boost = Math.min(O.oroCap || 2.4, 1 + BOOST * liftHere);
      mP[i] = P0(lat) * m * boost + (fbm(x, y + 900, 3, 0.016) - 0.5) * 1.6;
    }

    // Each nation is then recentred on its own mean. Left raw, the model's
    // spread inside a single country runs from rain shadow to windward coast —
    // physically right, but it scatters one nation across four biomes and the
    // note that says "steppe" stops being true. So the deviation from the
    // nation's mean is kept at half strength: the dry lee slope, the wet
    // windward flank and the cold summits all survive, at half the amplitude,
    // around a mean that is exactly what the vault asked for.
    const tSum = new Float64Array(NAMES.length), pSum = new Float64Array(NAMES.length),
          nCnt = new Int32Array(NAMES.length);
    for (const i of settledCells) {
      const o = owner[i];
      if (o < 0) continue;
      tSum[o] += mT[i]; pSum[o] += mP[i]; nCnt[o]++;
    }
    const tMean = new Float32Array(NAMES.length), pMean = new Float32Array(NAMES.length);
    const anomalies = [];
    NAMES.forEach((n, k) => {
      if (!nCnt[k]) return;
      tMean[k] = tSum[k] / nCnt[k]; pMean[k] = pSum[k] / nCnt[k];
      const dt = LAND[n].temp - tMean[k], dp = LAND[n].prec - pMean[k];
      if (Math.abs(dt) > 6 || Math.abs(dp) > 9)
        anomalies.push(`${n} ${dt > 0 ? '+' : ''}${dt.toFixed(0)}°C ${dp > 0 ? '+' : ''}${dp.toFixed(0)} rain`);
    });
    if (anomalies.length) log.push('climate anomalies applied: ' + anomalies.join('; '));

    const varT = O.varT === undefined ? 0.5 : O.varT;
    const varP = O.varP === undefined ? 0.5 : O.varP;
    const tgtT = new Float32Array(gn), tgtP = new Float32Array(gn);
    for (let i = 0; i < gn; i++) {
      const o = isLand[i] ? owner[i] : -1;
      if (o < 0 || !nCnt[o]) { tgtT[i] = mT[i]; tgtP[i] = mP[i]; continue; }
      const n = NAMES[o], vm = LAND[n].varMul === undefined ? 1 : LAND[n].varMul;
      tgtT[i] = LAND[n].temp + (mT[i] - tMean[o]) * varT * vm;
      tgtP[i] = LAND[n].prec + (mP[i] - pMean[o]) * varP * vm;
    }
    let bt = tgtT, bp = tgtP;
    for (let k = 0; k < (O.blur || 2); k++) {
      bt = blurPass(bt, O.keepC || 0.45);
      bp = blurPass(bp, O.keepC || 0.45);
    }
    const pT = new Int8Array(gn), pP = new Uint8Array(gn);
    for (let i = 0; i < gn; i++) {
      pT[i] = Math.max(-40, Math.min(40, Math.round(bt[i])));
      pP[i] = Math.max(0, Math.min(255, Math.round(bp[i])));
    }

    // ---------- 7b. footholds on the Wildlands ------------------------------
    // A continent nobody has finished taking. The colonists get a coastal
    // enclave apiece and the interior stays unclaimed — and because this runs
    // AFTER the relief and climate are painted, a colony does not reshape the
    // ground it stands on the way a homeland does. It is a flag, not a biome.
    const colonies = [];
    {
      const wd = WILD.find(w => w.colonists && w.colonists.length);
      // Colonists land on the BIGGEST unclaimed continent, whichever plate
      // happened to build it — nobody crosses an ocean for the small one.
      let bestMass = -1, bestN = 0;
      for (const [mi, cells] of masses.entries()) {
        if (!wildIds.has(massGroup[mi]) || massGroup[mi] === -9) continue;
        if (cells.length > bestN) { bestN = cells.length; bestMass = mi; }
      }
      const mine = bestMass >= 0 ? masses[bestMass] : [];
      if (!wd || mine.length < 300) { /* nothing worth taking */ } else {
      const shore = mine.filter(c => openSea[c]);
      if (shore.length >= 20) {
      let cx = 0, cy = 0;
      for (const c of mine) { cx += GP[c][0]; cy += GP[c][1]; }
      cx /= mine.length; cy /= mine.length;
      const per = Math.round(mine.length * (wd.colonyFrac || 0.24) / wd.colonists.length);
      const taken = new Uint8Array(gn);
      const homeCount = new Int32Array(NAMES.length);
      for (const c of settledCells) if (owner[c] >= 0) homeCount[owner[c]]++;
      wd.colonists.forEach((n, k) => {
        if (idxOf[n] === undefined) return;
        // spread the footholds around the coast rather than letting them fuse
        const ang = (k / wd.colonists.length) * Math.PI * 2 + (wd.colonyAngle || 0.6);
        const tx = cx + Math.cos(ang) * 1e5, ty = cy + Math.sin(ang) * 1e5;
        let seed = -1, bd = Infinity;
        for (const c of shore) {
          if (taken[c]) continue;
          const d = Math.hypot(GP[c][0] - tx, GP[c][1] - ty);
          if (d < bd) { bd = d; seed = c; }
        }
        if (seed < 0) return;
        // a colony no bigger than a third of the homeland, or its own terrain
        // stops being what the nation's note says it is
        const want = Math.min(per, Math.round(homeCount[idxOf[n]] * (wd.colonyCap || 0.30)));
        const q = [seed], got = [seed];
        taken[seed] = 1;
        for (let i = 0; i < q.length && got.length < want; i++)
          for (const c of nbrs(q[i])) {
            if (!isLand[c] || taken[c] || massOf[c] !== massOf[seed]) continue;
            taken[c] = 1; q.push(c); got.push(c);
            if (got.length >= want) break;
          }
        for (const c of got) { owner[c] = idxOf[n]; settled[c] = 1; }
        colonies.push({ nation: n, cells: got.length, where: wd.why });
      });
      const held = colonies.reduce((a2, c) => a2 + c.cells, 0);
      log.push(`${wd.why}: ${mine.length} cells, ${held} of them colonised ` +
               `(${colonies.map(c => c.nation).join(', ')}), the rest unclaimed`);
      } }
    }

    // ---------- 8. hand it to Azgaar ---------------------------------------
    // Azgaar owns the order now. Since 1.149 the app declares its generation
    // sequence as a pipeline object, and the hand-copied call list that used
    // to live here had already gone stale against it: no provinces, no lake
    // names, no taxes, no map name, and half a dozen bare globals
    // (`reGraph`, `calculateTemperatures`, `rankCells`) that the Vite build
    // deleted outright. So run the app's own pipeline, and substitute only
    // the three steps this world owns — the heightmap, and the two climate
    // fields — by wrapping them for the length of the run.
    //
    // Substituting rather than pre-writing matters: the pipeline's first step
    // is `Grid.prepare`, which blanks `grid.cells.h` before anything reads it.
    // Anything written to the grid before the run is thrown away.
    const forgedH = Uint8Array.from(G.h);
    const HG = window.HeightmapGenerator, TG = window.Temperature, PG = window.Precipitation;
    const keep = { h: HG.generate, t: TG.generate, p: PG.generate };
    HG.generate = async function (graph) {
      // the real one reseeds the PRNG here, and every later step is downstream
      // of that: drop it and the same forge seed stops producing the same world
      Math.random = aleaPRNG(seed);
      const g = graph || grid;
      g.cells.h = Uint8Array.from(forgedH);
      return g.cells.h;
    };
    TG.generate = function () { keep.t.apply(TG, arguments); grid.cells.temp.set(pT); };
    PG.generate = function () { keep.p.apply(PG, arguments); grid.cells.prec.set(pP); };
    try {
      await GenerationPipeline.run({});
    } finally {
      HG.generate = keep.h; TG.generate = keep.t; PG.generate = keep.p;
    }

    // ---------- 9. stamp our territories -----------------------------------
    const pc = pack.cells, pn = pc.i.length;
    const nationOf = new Int16Array(pn).fill(-1);
    const wildPack = new Uint8Array(pn);
    for (let i = 0; i < pn; i++) {
      if (pc.h[i] < 20) continue;
      const g = pc.g[i];
      if (!settled[g]) { wildPack[i] = 1; continue; }
      const o = owner[g];
      if (o >= 0) nationOf[i] = o;
    }
    for (let pass = 0; pass < 14; pass++) {
      let changed = 0;
      for (let i = 0; i < pn; i++) {
        if (pc.h[i] < 20 || nationOf[i] >= 0 || wildPack[i]) continue;
        const tally = {};
        for (const c of pc.c[i] || []) {
          if (pc.h[c] < 20 || nationOf[c] < 0) continue;
          tally[nationOf[c]] = (tally[nationOf[c]] || 0) + 1;
        }
        const win = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
        if (win) { nationOf[i] = +win[0]; changed++; }
      }
      if (!changed) break;
    }
    // ---------- 9b. redraw the borders on the real rivers -------------------
    // Territory is carved on the grid, before Azgaar cuts a single river, so
    // the best the carve can do is guess where water will run. It does not
    // have to be the last word: by the time territory is stamped onto the pack
    // the rivers ARE there, and a border is cheap to move. So each nation is
    // regrown here, from the middle of the ground it already holds, over the
    // real drainage — same area, same neighbours, but the line between two
    // countries now settles into a river or onto a watershed, because those
    // are the expensive places to cross.
    if (O.snapBorders !== false) {
      const isLand = i => pc.h[i] >= 20 && !wildPack[i] && nationOf[i] >= 0;
      const mineOf = {}, sizeOf = {};
      for (let i = 0; i < pn; i++) if (isLand(i)) {
        (mineOf[nationOf[i]] = mineOf[nationOf[i]] || []).push(i);
        sizeOf[nationOf[i]] = (sizeOf[nationOf[i]] || 0) + 1;
      }
      const seed = {};
      for (const k of Object.keys(mineOf)) {
        const list = mineOf[k];
        let cx = 0, cy = 0;
        for (const i of list) { cx += pc.p[i][0]; cy += pc.p[i][1]; }
        cx /= list.length; cy /= list.length;
        let bi = list[0], bd = Infinity;
        for (const i of list) {
          if (pc.r[i]) continue;                       // not in a riverbed
          const dx = pc.p[i][0] - cx, dy = pc.p[i][1] - cy;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; bi = i; }
        }
        seed[k] = bi;
      }
      const keys = Object.keys(seed);
      const stepC = (a2, b2, k) => {
        const n = NAMES[+k];
        let c = Math.hypot(pc.p[b2][0] - pc.p[a2][0], pc.p[b2][1] - pc.p[a2][1]) * (kw[k] || 1);
        if (pc.r[b2]) c *= 1 + (O.riverSnap || 5.5);   // a river is the border
        const climb = Math.max(0, (pc.h[b2] - 20) / 62);
        c *= 1 + (O.ridgeSnap || 4.0) * climb * climb * (LAND[n] && LAND[n].ridged ? 0.12 : 1);
        return c;
      };
      const HC = [], HX = [], HN = [];
      const hp = (c, x, m) => {
        let i = HC.length; HC.push(c); HX.push(x); HN.push(m);
        while (i > 0) { const p2 = (i - 1) >> 1; if (HC[p2] <= HC[i]) break;
          [HC[p2],HC[i]]=[HC[i],HC[p2]];[HX[p2],HX[i]]=[HX[i],HX[p2]];[HN[p2],HN[i]]=[HN[i],HN[p2]]; i = p2; }
      };
      const ho = () => {
        const t = [HC[0], HX[0], HN[0]];
        const c = HC.pop(), x = HX.pop(), m = HN.pop();
        if (HC.length) { HC[0]=c;HX[0]=x;HN[0]=m; let i=0;
          for(;;){ const l=i*2+1,r=l+1; let sm=i;
            if(l<HC.length&&HC[l]<HC[sm])sm=l; if(r<HC.length&&HC[r]<HC[sm])sm=r;
            if(sm===i)break;
            [HC[sm],HC[i]]=[HC[i],HC[sm]];[HX[sm],HX[i]]=[HX[i],HX[sm]];[HN[sm],HN[i]]=[HN[i],HN[sm]]; i=sm; } }
        return t;
      };
      const kw = {};
      for (const k of keys) kw[k] = 1;
      const dist = new Float64Array(pn);
      const got = new Int16Array(pn);
      // Grow the whole map each round, then nudge each nation's cost until it
      // lands on the size it should have. No caps, so every region stays in one
      // piece; size is a price, not a fence.
      for (let it = 0; it < (O.snapIters || 10); it++) {
        dist.fill(Infinity); got.fill(-1);
        HC.length = 0; HX.length = 0; HN.length = 0;
        for (const k of keys) { dist[seed[k]] = 0; hp(0, seed[k], +k); }
        while (HC.length) {
          const [cost, i, m] = ho();
          if (got[i] !== -1 || cost > dist[i] + 1e-9) continue;
          got[i] = m;
          for (const c of (pc.c[i] || [])) {
            if (!isLand(c) || got[c] !== -1) continue;
            const nc = cost + stepC(i, c, String(m));
            if (nc < dist[c]) { dist[c] = nc; hp(nc, c, m); }
          }
        }
        if (it === (O.snapIters || 10) - 1) break;
        const have = {}; keys.forEach(k => { have[k] = 0; });
        for (let i = 0; i < pn; i++) if (got[i] >= 0) have[String(got[i])] = (have[String(got[i])] || 0) + 1;
        for (const k of keys) {
          const r = Math.max(0.3, Math.min(3, (have[k] || 1) / Math.max(1, sizeOf[k])));
          kw[k] = Math.max(0.15, Math.min(6, kw[k] * Math.pow(r, 0.55)));
        }
      }

      // anything stranded keeps the owner it already had
      let moved = 0;
      for (let i = 0; i < pn; i++) {
        if (got[i] < 0 || !isLand(i)) continue;
        if (got[i] !== nationOf[i]) moved++;
        nationOf[i] = got[i];
      }
      log.push(`borders redrawn on the real rivers: ${moved} cells changed hands`);
      // The climate was painted for the territory the CARVE produced, and the
      // redraw has since moved three thousand cells. A nation now standing on
      // ground that was painted for its neighbour inherits its neighbour's
      // weather — which is how a desert kingdom came out 86% temperate forest
      // while still reporting a passing score. Repaint on the FINAL map.
      {
        const gOwn = new Int16Array(gn).fill(-1);
        const tal = new Map();
        for (let i = 0; i < pn; i++) {
          if (!isLand(i)) continue;
          const g = pc.g[i], n = nationOf[i];
          let m = tal.get(g);
          if (!m) { m = {}; tal.set(g, m); }
          m[n] = (m[n] || 0) + 1;
        }
        for (const [g, m] of tal) {
          let bn = -1, bc = 0;
          for (const k in m) if (m[k] > bc) { bc = m[k]; bn = +k; }
          gOwn[g] = bn;
        }
        const t2 = new Float64Array(NAMES.length), p2 = new Float64Array(NAMES.length),
              c2 = new Int32Array(NAMES.length);
        for (let i = 0; i < gn; i++) {
          const o = gOwn[i];
          if (o < 0) continue;
          t2[o] += mT[i]; p2[o] += mP[i]; c2[o]++;
        }
        const tM = new Float32Array(NAMES.length), pM = new Float32Array(NAMES.length);
        for (let k = 0; k < NAMES.length; k++) if (c2[k]) { tM[k] = t2[k] / c2[k]; pM[k] = p2[k] / c2[k]; }
        const nT = new Float32Array(gn), nP = new Float32Array(gn);
        for (let i = 0; i < gn; i++) {
          const o = gOwn[i];
          if (o < 0 || !c2[o]) { nT[i] = mT[i]; nP[i] = mP[i]; continue; }
          const n = NAMES[o], vm = LAND[n].varMul === undefined ? 1 : LAND[n].varMul;
          nT[i] = LAND[n].temp + (mT[i] - tM[o]) * varT * vm;
          nP[i] = LAND[n].prec + (mP[i] - pM[o]) * varP * vm;
        }
        let b2t = nT, b2p = nP;
        for (let k = 0; k < (O.blur || 2); k++) {
          b2t = blurPass(b2t, O.keepC || 0.45);
          b2p = blurPass(b2p, O.keepC || 0.45);
        }
        for (let i = 0; i < gn; i++) {
          G.temp[i] = Math.max(-40, Math.min(40, Math.round(b2t[i])));
          G.prec[i] = Math.max(0, Math.min(255, Math.round(b2p[i])));
        }
        try { Biomes.define(); } catch (e) { /* keep the old biomes if it fails */ }
        log.push('climate repainted on the redrawn borders');
      }

      // Trading territory and then regrowing it over the real drainage can
      // pull apart two nations the vault requires to touch — Tal Ulad lost
      // both the March and Silicar that way, and the corridor repair on the
      // grid cannot see it, because it runs before either. Repair it here,
      // where the final borders actually are: walk the shortest land path
      // between the two and hand its cells to them, half each. A frontier a
      // few cells wide is a pass or a river crossing, which is what a border
      // between two countries that barely meet looks like anyway.
      {
        // 14, not 10: the latitude repair moves nations further than the border
        // repair ever did, so the gap it has to bridge afterwards is wider.
        const maxGap = O.packCorridor === undefined ? 14 : O.packCorridor;
        let fixed = 0;
        for (const [a2, b2] of BORDERS) {
          const A = idxOf[a2], B = idxOf[b2];
          if (A === undefined || B === undefined || GROUP[a2] !== GROUP[b2]) continue;
          let touch = false;
          for (let i = 0; i < pn && !touch; i++) {
            if (nationOf[i] !== A) continue;
            for (const c of (pc.c[i] || [])) if (nationOf[c] === B) { touch = true; break; }
          }
          if (touch) continue;
          const dq = new Int32Array(pn).fill(-1), prev = new Int32Array(pn).fill(-1);
          let ring = [];
          for (let i = 0; i < pn; i++) if (nationOf[i] === A) { dq[i] = 0; ring.push(i); }
          let hit = -1;
          for (let d = 1; d <= maxGap + 1 && ring.length && hit === -1; d++) {
            const next = [];
            for (const c of ring) {
              for (const q of (pc.c[c] || [])) {
                if (dq[q] !== -1 || pc.h[q] < 20) continue;
                dq[q] = d; prev[q] = c;
                if (nationOf[q] === B) { hit = q; break; }
                next.push(q);
              }
              if (hit !== -1) break;
            }
            if (hit !== -1) break;
            ring = next;
          }
          if (hit === -1) continue;
          const path = [];
          for (let c = prev[hit]; c !== -1 && nationOf[c] !== A; c = prev[c]) path.push(c);
          if (!path.length || path.length > maxGap) continue;
          path.forEach((c, k) => { nationOf[c] = k < path.length / 2 ? B : A; });
          fixed++;
        }
        if (fixed) log.push(`required borders repaired on the pack: ${fixed}`);
      }

      // the required borders have to be checked HERE, after the redraw: the
      // grid carve's count describes a map that no longer exists
      {
        const adj = new Set();
        for (let i = 0; i < pn; i++) {
          if (!isLand(i)) continue;
          for (const c of (pc.c[i] || [])) {
            if (!isLand(c) || nationOf[c] === nationOf[i]) continue;
            const a2 = nationOf[i], b2 = nationOf[c];
            adj.add(a2 < b2 ? a2 + ':' + b2 : b2 + ':' + a2);
          }
        }
        const gone = BORDERS.filter(([x, y]) => {
          const a2 = idxOf[x], b2 = idxOf[y];
          if (a2 === undefined || b2 === undefined) return false;
          return !adj.has(a2 < b2 ? a2 + ':' + b2 : b2 + ':' + a2);
        });
        log.push(`required borders after the redraw: ${BORDERS.length - gone.length}/${BORDERS.length}` +
                 (gone.length ? ` — lost ${gone.map(p2 => p2[0] + '/' + p2[1]).join(', ')}` : ''));
      }
      {
        const fin = {};
        for (let i = 0; i < pn; i++) if (isLand(i)) fin[nationOf[i]] = (fin[nationOf[i]] || 0) + 1;
        const quota = {};
        for (const g of groupIds) {
          const mem = NAMES.filter(n => GROUP[n] === g && idxOf[n] !== undefined);
          let have = 0;
          for (let i = 0; i < pn; i++) if (isLand(i) && GROUP[NAMES[nationOf[i]]] === g) have++;
          const tw2 = mem.reduce((t, n) => t + SIZE[n], 0);
          for (const n of mem) quota[idxOf[n]] = Math.max(8, Math.round(have * SIZE[n] / tw2));
        }
        const v = Object.entries(fin).map(([k2, n2]) => [NAMES[+k2], n2, n2 / Math.max(1, quota[+k2])])
          .sort((x, y) => y[2] - x[2]);
        log.push(`worst oversize: ${v.slice(0, 3).map(x => x[0] + ' ' + x[1] + ' (' + x[2].toFixed(1) + 'x)').join(', ')}`);
        log.push(`worst undersize: ${v.slice(-3).map(x => x[0] + ' ' + x[1] + ' (' + x[2].toFixed(1) + 'x)').join(', ')}`);
      }
    }

    if (!pc.state) pc.state = new Uint16Array(pn);
    pc.state.fill(0);
    for (let i = 0; i < pn; i++) if (nationOf[i] >= 0) pc.state[i] = nationOf[i] + 1;
    if (!pc.province) pc.province = new Uint16Array(pn);
    pc.province.fill(0);
    pack.provinces = [0];

    while (pack.states.length <= NAMES.length) {
      const i = pack.states.length;
      pack.states.push({ i, name: 'S' + i, diplomacy: [], provinces: [], color: '#cccccc',
                         expansionism: 1, capital: 0, type: 'Generic', center: 0,
                         culture: 1, military: [], alert: 1, coa: null });
    }
    for (const s of pack.states) {
      if (!s.i) continue;
      s.removed = s.i > NAMES.length;
      s.provinces = []; s.military = [];
    }
    for (const b of pack.burgs) {
      if (!b.i || b.removed) continue;
      b.state = pc.state[b.cell];
      b.capital = 0;
    }
    const founded = [];
    const PAL = ['#c9a227','#7fb069','#8a6fa8','#d08c60','#5b8fa8','#b8656a','#6a9955',
                 '#a87f5b','#7a86b8','#c98fb0','#5fa08a','#b0a04a','#8fa8c9','#a85b7f',
                 '#6fa87f','#c9784a','#8a8a8a','#9a7fb8','#7fb8a8','#b89a5b','#6a7fa8'];
    for (const n of NAMES) {
      const id = idxOf[n] + 1, s = pack.states[id];
      let cap = null;
      for (const b of pack.burgs) {
        if (!b.i || b.removed || b.state !== id) continue;
        if (!cap || (b.population || 0) > (cap.population || 0)) cap = b;
      }
      if (!cap) {
        let bc = -1, bp = -1;
        for (let i = 0; i < pn; i++) if (pc.state[i] === id && pc.pop[i] > bp) { bp = pc.pop[i]; bc = i; }
        if (bc >= 0) {
          const bid = Burgs.add(pc.p[bc]);
          cap = pack.burgs[bid]; cap.state = id;
          founded.push({ nation: n, burg: cap.name });
        }
      }
      if (cap) { cap.capital = 1; s.capital = cap.i; s.center = cap.cell; }
      else { s.capital = 0; s.center = 0; }
      if (!s.color || s.color === '#cccccc') s.color = PAL[idxOf[n] % PAL.length];
    }
    States.getPoles();
    States.findNeighbors();
    States.collectStatistics();

    // Something to find out there. Azgaar's own markers avoid unclaimed ground
    // — most of them require a culture — so the interior of a continent nobody
    // has taken comes out empty, which is the opposite of the point. These are
    // placed by hand, spread out, on land with no flag over it.
    const ruins = [];
    try {
      const FIND = ['ruins', 'ruins', 'ruins', 'dungeons', 'caves', 'necropolises',
                    'disturbed-burials', 'statues', 'battlefields', 'portals', 'rifts'];
      const blank = [];
      for (let i = 0; i < pn; i++)
        if (pc.h[i] >= 20 && pc.h[i] < 70 && wildPack[i] && !pc.state[i]) blank.push(i);
      const want = Math.min(O.ruins || 26, Math.floor(blank.length / 40));
      const placed = [];
      const apart = (O.ruinApart || 0.035) * Math.hypot(W, H);
      for (let k = 0; k < blank.length && placed.length < want; k++) {
        const c = blank[Math.floor(hash2(k * 31 + 7, 2029) * blank.length)];
        const [x, y] = pc.p[c];
        if (placed.some(q => Math.hypot(q[0] - x, q[1] - y) < apart)) continue;
        placed.push([x, y]);
        const type = FIND[Math.floor(hash2(k, 3001) * FIND.length)];
        const m = Markers.add({ type, cell: c });
        if (m) ruins.push(type);
      }
    } catch (e) { /* markers are decorative */ }

    // ---------- 10. measure -------------------------------------------------
    const B = pc.biome, h = pc.h, t = pc.t, r = pc.r;
    const prof = NAMES.map(n => {
      const id = idxOf[n] + 1, mine = [];
      for (let i = 0; i < pn; i++) if (pc.state[i] === id) mine.push(i);
      const f = fn => mine.length ? mine.reduce((a, i) => a + (fn(i) ? 1 : 0), 0) / mine.length : 0;
      const isl = new Set(mine.map(i => pc.f[i]));
      const bt = {};
      for (const i of mine) bt[B[i]] = (bt[B[i]] || 0) + 1;
      const top = Object.entries(bt).sort((a, b2) => b2[1] - a[1]).slice(0, 3)
        .map(([k, v]) => [+k, Math.round(v / Math.max(1, mine.length) * 100)]);
      return {
        top,
        meanT: mine.length ? mine.reduce((a, i) => a + grid.cells.temp[pc.g[i]], 0) / mine.length : 0,
        meanP: mine.length ? mine.reduce((a, i) => a + grid.cells.prec[pc.g[i]], 0) / mine.length : 0,
        meanH: mine.length ? mine.reduce((a, i) => a + h[i], 0) / mine.length : 0,
        nation: n, id, cells: mine.length, burgs: pack.states[id].burgs || 0,
        lat: mine.length ? Math.round(mine.reduce((a, i) => a + latOf(pc.p[i][1]), 0) / mine.length) : 0,
        neighbours: (pack.states[id].neighbors || []).map(x => NAMES[x - 1]).filter(Boolean),
        desert: f(i => B[i] === 1 || B[i] === 2), grass: f(i => B[i] === 3 || B[i] === 4),
        jungle: f(i => B[i] === 5 || B[i] === 7), taiga: f(i => B[i] === 9 || B[i] === 10 || B[i] === 11),
        wetland: f(i => B[i] === 12), decid: f(i => B[i] === 6),
        forest: f(i => B[i] === 5 || B[i] === 6 || B[i] === 7 || B[i] === 8),
        mtn: f(i => h[i] >= 60), hills: f(i => h[i] >= 40 && h[i] < 60),
        high: mine.length ? mine.reduce((a, i) => a + Math.min(1, (h[i] - 20) / 60), 0) / mine.length : 0,
        coast: f(i => t[i] >= 1 && t[i] <= 4), shoreline: f(i => t[i] === 1),
        river: f(i => r[i] > 0),
        wetriver: f(i => r[i] > 0 || B[i] === 12), islands: isl.size,
      };
    });
    let unclaimed = 0, landTotal = 0, wildTotal = 0;
    for (let i = 0; i < pn; i++) if (pc.h[i] >= 20) {
      landTotal++;
      if (wildPack[i]) wildTotal++;
      else if (!pc.state[i]) unclaimed++;
    }
    let coastCells = 0;
    for (let i = 0; i < pn; i++) if (pc.h[i] >= 20 && pc.t[i] === 1) coastCells++;
    const biomeMix = {};
    for (let i = 0; i < pn; i++) if (pc.h[i] >= 20) biomeMix[B[i]] = (biomeMix[B[i]] || 0) + 1;
    const lakes = (pack.features || []).filter(f => f && f.type === 'lake').length;
    const seas = (pack.features || []).filter(f => f && f.type === 'ocean' && f.group !== 'ocean').length;
    {
      const flatMtn = prof
        .filter(v => v && (CLAIM[v.nation] === 'grass' || CLAIM[v.nation] === 'desert'))
        .map(v => v.nation.split(' ')[0] + ' ' + Math.round((v.mtn + v.hills) * 100) + '%');
      log.push(`mountains inside lowland nations: ${flatMtn.join(', ')}`);
    }
    if (ruins.length) {
      const tally = {};
      for (const t2 of ruins) tally[t2] = (tally[t2] || 0) + 1;
      log.push('placed ' + ruins.length + ' finds in the unclaimed interior: ' +
               Object.entries(tally).map(([k, v]) => `${v}× ${k}`).join(', '));
    }
    return { prof, log, unclaimed, landTotal, wildTotal, founded, names: NAMES, colonies,
             rivers: pack.rivers ? pack.rivers.length : 0,
             intricacy: coastCells / Math.max(1, landTotal),
             masses: masses.length, biomeMix, lakes, seas,
             size: [W, H], cells: pn };
  }, opts);
}

module.exports = { forgeWorld, SIZE, LAND, CLAIM, BORDERS, RIDGE_BORDERS, GROUP, GROUP_SHARE, ANCHOR, WILD, ISLE_LANES, LAT_TOP, LAT_BOT };
