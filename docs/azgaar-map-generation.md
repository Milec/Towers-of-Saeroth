# Driving Azgaar's Fantasy Map Generator from a script

Notes from building `Saeroth.map` — a 28-nation world generated to match the
campaign notes rather than at random. Written down because the useful parts
were all discovered the hard way, and most of them are not in Azgaar's docs.

**The headline: this is far more controllable than it looks.** The app is a
browser page with no scripting API, so the first instinct is that you can only
nudge it through the UI and re-roll until something fits. That is wrong. Drive
it with Playwright and you have the whole live `pack`/`grid` model in your
hands — you can rewrite territory, cultures, names, climate and trade after
generation, then hand the result back to its own save routine. Everything
below follows from that.

---

## 1. Running it headlessly

Serve the app and drive it with Playwright. Its generation options are read
from DOM inputs at load, so set them by URL query and by writing the inputs
before triggering a regenerate.

```js
const { chromium } = require('playwright');
const b = await chromium.launch();
const p = await b.newPage();
// labels are culled to the viewport, so the window must be the map size
// BEFORE anything is drawn or most of them never appear
await p.setViewportSize({ width: MAP_W, height: MAP_H });
await p.goto(`http://127.0.0.1:5199/Fantasy-Map-Generator/` +
             `?seed=1&width=${MAP_W}&height=${MAP_H}&cells=${CELLS}`);
```

Useful facts:

- **Cell count maxes at 100,000** (`pointsInput` is a 13-step ladder ending
  there). 50,000 is plenty; the difference is sampling resolution, not shape.
- **Generation is fast** — a full 50k-cell world including a custom heightmap
  is seconds, not minutes. Budget for many runs.
- `p.setDefaultTimeout(...)` matters. Any long in-page pass (rebuilding trade
  across 1,200 burgs takes minutes) will otherwise blow the 30-second default
  and kill the run *after* the expensive part.
- Save with `await window.Services.Save.prepareMapData()` and write the
  returned bytes to `.map`. Round-trip it before believing anything: load the
  file back and count states, burgs and diplomacy entries.

---

## 2. The pipeline, and why order matters

This sequence is the single most useful thing to know. Each stage consumes the
one before, so anything you rewrite must go in at the right point or a later
stage silently overwrites it — or worse, keeps stale data that no longer
matches.

```
heightmap  →  Features.markupGrid  →  OceanLayers
           →  calculateTemperatures / generatePrecipitation      ← climate (GRID)
           →  reGraph                                            ← builds PACK from GRID
           →  Features.markupPack
           →  Rivers.generate                                    ← rivers exist from here
           →  Biomes.define                                      ← reads climate + height
           →  Goods.generate → rankCells
           →  Cultures.generate / expand
           →  Burgs.generate → States.generate
           →  Routes / Religions / Provinces / Military
```

Consequences worth internalising:

- **Rivers do not exist while territory is being carved** if you carve on the
  grid. They are generated after `reGraph`, on the pack, in a different index
  space. Predicting them from the heightmap is possible but painful (see §7);
  the better move is to redraw borders *after* rivers exist.
- **Climate is painted on the grid, biomes are computed later on the pack.**
  If you change who owns what between those two points, nations end up carrying
  their neighbours' weather. Repaint and call `Biomes.define()` again.
- `grid` and `pack` are different graphs. `pack.cells.g[i]` maps a pack cell
  back to its grid cell. Climate and heights live on the grid; rivers, biomes,
  burgs, states and goods live on the pack.

---

## 3. The `.map` save format

Plain text, `\r\n`-separated, one section per line. Line numbers are stable
enough to parse directly:

| line | contents |
| ---: | --- |
| 1 | settings blob |
| 3 | biomes array |
| 5 | the whole SVG |
| 6 | grid (spacing, cellsX/Y, boundary) |
| 12 | pack features |
| 13 | **cultures** |
| 14 | **states** |
| 15 | **burgs** |
| 32 | rivers |

Enough to audit a saved map without opening the app:

```js
const t = fs.readFileSync('Saeroth.map', 'utf8').split('\r\n');
const cultures = JSON.parse(t[13]);
const states   = JSON.parse(t[14]);
const burgs    = JSON.parse(t[15]).filter(b => b && b.i);
```

---

## 4. Names and cultures

Azgaar seeds a dozen random cultures with real-world name bases and no relation
to whatever states you draw over them. Left alone, a Norse nation's capital
comes out of a Roman base and dwarves get Scythian names.

**Fix: make each nation its own culture.** Rebuild `pack.cultures` so culture
`i` corresponds to state `i`, set `pack.cells.culture` from `pack.cells.state`,
then rename every burg from its own culture.

```js
pack.cultures = [{ i: 0, name: 'Wildlands', base: 32, origins: [null],
                   shield: 'round', type: 'Generic' }];
for (const s of pack.states) {
  if (!s.i || s.removed) continue;
  pack.cultures[s.i] = {
    i: s.i, name: s.name, base: NAME_BASE[s.fullName],
    center: s.center, origins: [0], shield: 'round',
    type: CULTURE_TYPE[s.fullName] || 'Generic', expansionism: 1
  };
}
// ids must stay dense — the culture layer indexes straight into this array
for (const c of pack.cells.i) pack.cells.culture[c] =
  (pack.cells.h[c] >= 20 && pack.cells.state[c]) ? pack.cells.state[c] : 0;

for (const b of pack.burgs) {
  if (!b || !b.i || b.removed) continue;
  const cid = pack.cells.culture[b.cell] || 0;
  b.culture = cid;
  b.name = b.capital ? Names.getCulture(cid, 5, 9, '') : Names.getCultureShort(cid);
}
```

`window.Names` is global. `getBase(base, min, max, dupl)` /
`getBaseShort(base)` generate straight from a base index; `getCulture(cultureId, …)`
looks the base up from `pack.cultures`.

**Name base indices** (`src/data/name-bases.ts`) — 43 of them:

```
 0 German      1 English     2 French      3 Italian     4 Castillian
 5 Ruthenian   6 Nordic      7 Greek       8 Roman       9 Finnic
10 Korean     11 Chinese    12 Japanese   13 Portuguese 14 Nahuatl
15 Hungarian  16 Turkish    17 Berber     18 Arabic     19 Inuit
20 Basque     21 Nigerian   22 Celtic     23 Mesopotamian 24 Iranian
25 Hawaiian   26 Karnataka  27 Quechua    28 Swahili    29 Vietnamese
30 Cantonese  31 Mongolian  32 Human      33 Elven      34 Dark Elven
35 Dwarven    36 Goblin     37 Orc        38 Giant      39 Draconic
40 Arachnid   41 Serpents   42 Levantine
```

`cultureType` is one of `Generic`, `Naval`, `Highland`, `Nomadic`, `River`,
`Hunting`, `Lake`. It is not cosmetic — it feeds goods distribution (§6) and
how a culture spreads.

**Folk religions embed their culture's name** (`"Scythian Druidism"`). If you
rename cultures, capture the old names first and string-replace, or the
pantheon keeps referring to peoples who no longer exist.

---

## 5. Burgs

`Burgs.add([x, y])` builds a complete burg — coat of arms, population, type,
market, production — at the nearest cell to a point. It reads
`pack.cells.culture` for the name, so **rebuild cultures first** and new burgs
come out correctly named for free.

Useful because Azgaar sites burgs by how much population a cell supports: wet
deciduous nations get 170 settlements and dry grassland ones get one. That is
defensible geography and useless at a table. Top the thin ones up on their own
best cells (`pack.cells.s` is suitability), spaced apart:

```js
for (const s of pack.states) {
  let have = pack.burgs.filter(b => b && b.i && !b.removed && b.state === s.i).length;
  const land = cellsOf(s.i).sort((a, b) => cells.s[b] - cells.s[a]);
  for (const i of land) {
    if (have >= MIN_BURGS) break;
    const [x, y] = cells.p[i];
    if (spots.some(q => Math.hypot(q[0] - x, q[1] - y) < GAP)) continue;
    Burgs.add([x, y]); spots.push([x, y]); have++;
  }
}
```

---

## 6. Goods, trade and production

This build has a full economy. Burgs carry a `production` array mixing locally
produced goods (`{goodId, units}`), manufactures (`{goodId, units, recipe}`)
and trades (`{dealId}`).

**Two traps, both of which produced convincing nonsense:**

1. **`production` includes goods a burg *bought*.** Auditing it tells you what
   a market holds, not what the land yields. For "what does this nation
   produce", read `pack.cells.good` instead.
2. **Good ids are 1-based; `GOODS_DATA` is a 0-based array.** Indexing a
   hand-typed list with `cells.good[i]` shifts every name by one — *Horses*
   reads as *Elephants*, *Cattle* as *Fish*. Take the names from the app:
   `pack.goods.map(g => [g.i, g.name])`.

Each good has a `distribution` — a small DSL evaluated per cell — plus
`chance`, `biomeOutput` and `multipliers`:

```js
{ name: "Horses", distribution: "biome(3) || (biome(2) && nth(4))",
  multipliers: { cultureType: { Nomadic: 2 } } }
```

Available predicates include `biome(...)`, `minHeight(n)`, `minTemp(n)`,
`shore(n)`, `river()`, `type("ocean","freshwater","salt")`, `elevation()`,
`nth(n)`. `pack.goods` is editable at runtime, so you can bend a distribution
to your world and regenerate:

```js
for (const g of pack.goods)
  if (g.name === 'Horses') g.distribution = 'biome(3, 4) || (biome(2) && nth(4))';
Goods.generate({ randomSeed: 1 });
Production.regenerate();   // expensive — call it ONCE, at the end
```

That example is real: Azgaar puts horses on savanna and cold desert, but a
steppe khaganate on **grassland** (biome 4) gets none, which is exactly wrong
for the classic horse-nomad setting.

To force a nation's economy toward what its notes claim, reassign a share of
its resource cells and regenerate production once:

```js
const want = SPECIALTY[state.fullName].map(n => goodIdByName[n]);
mine.slice(0, mine.length * 0.55).forEach((c, k) => cells.good[c] = want[k % want.length]);
```

**Biome ids** (needed for every distribution expression):

```
0 Marine        1 Hot desert   2 Cold desert   3 Savanna     4 Grassland
5 Trop.season.  6 Temp.decid.  7 Trop.rainf.   8 Temp.rainf. 9 Taiga
10 Tundra      11 Glacier     12 Wetland
```

---

## 7. Territory: the part that took longest

If you want borders that look like real borders, this is the whole lesson.

### A power diagram cannot follow a river

The obvious way to assign territory is a capacity-constrained power diagram:
each cell picks the nation minimising `distance² − weight`, iterate the weights
until sizes match quotas. It is fast, it hits size targets, and its borders are
**smooth arcs that ignore the terrain entirely** — because the rule never looks
at what lies *between* the capital and the cell. No amount of tuning fixes
that; it is the wrong algorithm for the goal.

### Cost-distance growth does

Grow territory outward from each capital with a priority queue, where the price
of each step depends on the ground crossed. Growth stalls where the ground is
expensive, so two nations meet there — which is what a frontier physically is.

```js
const stepCost = (a, b, n) => {
  let c = Math.hypot(p[b][0] - p[a][0], p[b][1] - p[a][1]) * k[n];
  if (isRiver(b)) c *= 1 + RIVER_BAR;               // ~4-6x
  const climb = Math.max(0, (h[b] - 20) / 62);
  c *= 1 + RIDGE_BAR * climb * climb * (LAND[n].ridged ? 0.12 : 1);
  return c;
};
```

**Keep every term a multiplier on real distance.** Mixing raw constants into
squared pixels is how two of my preferences ended up two orders of magnitude
too weak to do anything at all — they ran fifteen million times and changed
nothing (see §8).

### Never cap growth mid-expansion

The single worst bug of the project. Stopping a nation's frontier the moment it
hits its quota strands every cell behind it, to be mopped up by some cruder
rule. That produces enclaves, single-cell salients and interlocking fingers —
"border gore" — and then you write a rebalancer to fix the sizes, a majority
filter to eat the salients, and a strand-remover to clear the enclaves, each
one damaging what the last one fixed.

**Let every nation grow until the map is claimed, and control size purely
through its cost multiplier `k[n]`, iterated between rounds.** Contiguity is
then free: a cost-distance region grown from one seed is connected by
construction. Deleting the cap deleted three corrective passes *and* improved
the scores.

The multiplier loop is a feedback controller and behaves like one — gain too
high and it oscillates (nations swinging between 4× and 0.1×) rather than
converging. Around `k *= (have/target)^0.3` over ~45 rounds is stable; 0.6+
diverges.

### Redraw borders after the rivers exist

Territory carved on the grid can only guess where water will run. It does not
have to be the last word: by the time you stamp territory onto the pack, the
rivers are there, and moving a border is cheap. Regrow each nation on the pack,
from the middle of the ground it already holds, over the real drainage. Same
areas, same neighbours, but the line between two countries settles into a river
or onto a watershed.

---

## 8. Gotchas that cost real time

**Integer heights make plateaus.** `cells.h` is an integer 20–85, so a plain is
one flat plateau with no strictly-lower neighbour anywhere on it. Steepest-
descent flow accumulation dies on the first flat cell — 50 river cells on a map
that grows 800. Jittering to break ties makes the *jitter* the gradient, so
water disperses down noise instead of gathering into channels. Route over the
continuous field the heightmap was quantised from, or don't predict rivers at
all (§7).

**Terms must share units.** The carve scores cells in squared pixels — values
around 250,000 on a large canvas. A preference set to "17,000, and that seems
strong" is noise. Compute what your term's maximum actually is before deciding
it is too strong or too weak; I twice explained a symptom by a cause that a
one-line test disproved.

**A continent must fit its climate band.** If a landmass needs 10,000 cells but
its nations only span 30° of latitude, it *cannot* fit in that band and will
bulge past it — nations get pushed into the tropics and no amount of latitude
penalty pulls them back, because you cannot price a nation into land that does
not exist. Fix the geometry (wider canvas, or fewer cells per continent), not
the cost function.

**Measure the stage you ship.** Border and terrain checks run on the carve are
describing a map that no longer exists once you redraw borders. Move every
check after the last thing that moves a cell.

**Per-nation metrics cannot see a broken continent.** Terrain majorities,
required borders, size ratios and latitude error are all per-nation — and a
nation stranded alone on its own island scores perfectly on every one of them.
Check landmass coherence explicitly (`group N: X cells across Y landmass(es)`)
or you will ship a map with a country sliced off the top edge.

**Report size against weight, not in cells.** "Largest nation 1,620 cells" is
meaningless; "1.8× its share" is actionable. The nation four times its due size
is invisible in the first framing.

**Watch the dev server.** A Vite server backgrounded from a shell gets reaped
when that shell exits, and every subsequent run fails at page load with an
unhelpful error. `setsid nohup … &` survives. A sweep that prints nothing looks
identical to a sweep with no good candidates.

---

## 9. What is worth automating

Things that turned out to be reliably scriptable, in rough order of payoff:

1. **Custom heightmaps.** Write `grid.cells.h` yourself before Azgaar's own
   markup runs and you control tectonics, coastlines and mountain ranges
   completely. Everything downstream — climate, rivers, biomes — follows.
2. **Territory.** As §7. This is where a generated map stops looking generated.
3. **Cultures and names.** Cheap, and the single biggest gain in how "real" the
   place reads.
4. **Climate forcing.** Recentring each nation's temperature and rainfall on a
   target, keeping local deviation at half strength, gives a nation the biome
   its notes claim while keeping rain shadows and windward coasts.
5. **Goods.** Worth it if the setting has stated economies.

And the general lesson, which applies past this app: when a system needs a
correction pass, check whether the previous stage created the problem. Three of
my passes existed only to repair damage from one line, and deleting that line
deleted all three and made the output better.
