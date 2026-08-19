# The world map generator

Builds `campaign/Saeroth.map` — the Azgaar map of Saeroth, generated to match
the campaign notes rather than rolled at random. Read
[`docs/azgaar-map-generation.md`](../../docs/azgaar-map-generation.md) first;
it explains *why* this is shaped the way it is, and records the mistakes that
are easy to repeat.

## Files

| file | what it holds |
| --- | --- |
| `world.js` | **the vault, as data.** Every nation's target latitude, temperature, rainfall and elevation; which continent it belongs to; its size weight; the borders the world requires; capital names and trade specialties read from the notes; name bases per culture. This is the file you edit when the campaign changes. |
| `forge.js` | the generator: plates, heightmap, climate, territory, the border redraw, colonies. No campaign facts live here. |
| `build.js` | drives Azgaar in a headless browser, runs the forge inside the page, renames states, rebuilds cultures, regenerates goods, and saves. |
| `report.js` | writes `Saeroth-map-notes.md` from the last build. |
| `verify.js` | loads a saved `.map` back and checks states, burgs and diplomacy survived. |

## Running it

Needs a local copy of Azgaar's Fantasy Map Generator served on port 5199, and
Playwright:

```sh
# serve the app (setsid so it survives the shell — see the docs, §8)
cd /path/to/Fantasy-Map-Generator && setsid nohup npx vite --port 5199 --strictPort &

# a scoring run: no save, no screenshots, prints the diagnostics
SKIP_SAVE=1 NO_SHOT=1 OPTS='{"seed":818}' node tools/mapgen/build.js

# the real thing: writes Saeroth.map plus three renders
PFX=saeroth OUT=campaign/Saeroth.map OPTS='{"seed":818}' node tools/mapgen/build.js
node tools/mapgen/report.js
node tools/mapgen/verify.js
```

`OPTS` is JSON merged over the defaults at the top of `build.js`, so any knob
can be overridden per run without editing anything — which is how you sweep.

## Reading the output

The diagnostics matter more than the map looking nice at a glance:

```
group 0: 7852 cells across 1 landmass(es)     ← continent coherence. >2 is bad.
required borders after the redraw: 17/17      ← the vault's adjacencies, measured
                                                AFTER the last pass that moves a cell
terrain majority 27/27                        ← each nation has the terrain its note claims
worst oversize: Thornwild 2076 (2.1x)         ← size against WEIGHT, not raw cells
worst undersize: Melisor 170 (0.2x)
```

**Sweep, don't tune.** Most defects left are seed-dependent, not systematic.
Run a dozen seeds, rank them on coherence first, and pick — a seed that scores
well everywhere beats another round of parameter fiddling. Continent coherence
has to be one of the criteria: every other metric is per-nation, and a country
stranded alone on an island scores perfectly on all of them.

## The current map

`campaign/Saeroth.map` is seed 111: 28 nations, **15/15 required borders**,
27/28 terrain majorities, 729 rivers, 1,232 settlements. Both inhabited
continents are a single landmass each.

**The continents are split by culture.** Group 0 is the European analogue —
Nordic, Ruthenian, Celtic, Italian, German, Greek, French, Finnic, English,
Portuguese, Basque, plus the Euro-adjacent fantasy peoples. Group 1 is
everywhere else: Chinese, Mongolian, Arabic, Berber, Levantine, Iranian,
Swahili, Nigerian, draconic.

### Mountains are the only real brake on nation size

`ridged: 1` puts a nation on the fold belt, and a *chain* of them makes a range
that runs rather than a single massif. There are two: **Melisor - Stoneborn -
Undertide - Dalstan** in the west, and **Qeshara - Cindral - Ashkar** in the
east. Ranges are expensive to cross (`RIDGE_BAR`), so they settle borders and
stop a neighbour spilling over — which is why the eastern range was extended
past the one nation that claims mountains. A nation's own CLAIM is safe as long
as it is a *biome* test: desert and grass do not care about height, so a range
can run through Qeshara and Ashkar without costing them their terrain majority.
Watch the `mountains inside lowland nations` line anyway — Ashkar hit 89% before
its `elev` band was pulled back to `[25, 44]`.

Two failures worth not repeating:

- **Do not put Kelvary March on the belt.** At tlat 38 it pins Corvane (40)
  between two ranges and crushes it to 11 cells.
- **Thurigypt is not a mountain nation.** Ridging the delta gave it 29%
  mountains and cost the Sahenna border. The range breaks around it, the way a
  great river valley does.

### Why oversize is not a tuning problem

Territory grows until **every** cell is claimed, so the cost multiplier `k[n]`
only decides where two nations *meet*. A nation seeded beside an empty lobe of
coast takes the whole lobe at any price, and no amount of `growIters` or
`growGain` changes that — 110 iterations behaves like 45. Widening the `k`
clamp past its `[0.2, 5]` range does nothing either; that was tried and
reverted. Oversize is **geometric**: fix it with a seed where the lobes fall to
nations that should be large, a mountain chain across the lobe, or a neighbour
seeded into it.

Known-imperfect on this seed: Corvane Republic runs to 5.6x its weight on the
southern lobe, Lazarian Lichdom sits at 2.8x, and Stoneborn Holds is pinched
against the polar edge. Nation size is far more sensitive to seed than to
`SIZE`: dropping Lazarian from 0.35 to 0.26 moved Tal Ulad from 189 cells to
1271 and cost Corvane 2,600. Change one weight at a time and re-read the whole
table, not just the nation you meant to change.
