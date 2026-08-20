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

## Look at the map — and make the machine look too

`tools/mapgen/inspect.py` fails a build on the things a person notices at a
glance. It exists because a map once reported "15/15 borders, 27/28 terrain"
while Stoneborn Holds sat twelve degrees inside the arctic and Corvane had slid
twenty-one degrees south into a lobe four times its size. Every number needed to
catch both was already being printed. None of them failed.

```sh
python3 tools/mapgen/inspect.py        # after a build; non-zero if anything is wrong
python3 tools/mapgen/inspect.py --quiet
```

It flags a nation centred above 60°N (in the polar cap), more than 12° from its
target latitude (wrong climate band — desert beside taiga), under 100 cells (too
small to put a settlement in), over 3× its share of its own continent (it has
eaten a lobe), or scattered over more than two landmasses unless its CLAIM is
`islands`.

**Then still open the PNG.** The build writes `saeroth-world.png`; look at it
before shipping. The inspector catches what is measurable, not whether the
thing reads as a world. Both times a map went out looking wrong, the numbers
had been fine.

A sweep should rank on this before terrain and borders — a map with perfect
counts and a country in the ice is worse than one a degree off everywhere.

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

`campaign/Saeroth.map` is **seed 7**: 28 nations, 13/15 required borders, 26/28
terrain majorities, 707 rivers. Both inhabited continents are a single landmass
each, and `inspect.py` reports **3** problems — the lowest of ~30 seeds swept.

It was chosen on the inspector, not on borders or terrain, and that is the
point: the previous map scored better on both (15/15, 27/28) while putting
Stoneborn Holds twelve degrees inside the arctic.

**The European band was widened from 26 deg to 35 deg (21N-56N)** to make this
possible. Seventeen nations in a 26-degree strip is more land than the band can
hold, so the continent bulged and threw nations out of it — Stoneborn north into
the ice at 64N, Corvane twenty-one degrees south. Widening the band cut the best
seed's inspector score from 7 problems to 3. If nations start drifting again,
widen the band before touching `GROUP_SHARE`.

Known-imperfect, and all three are in the inspector output rather than hidden:
Cindral Ashlands sits 13 deg south of its band, Kesmarch Frontier 21 deg south,
and Tal Ulad has taken 3.8x its share. Vaelic Principality also comes out small
(466 cells) despite carrying the largest SIZE weight on its continent — raising
that weight to 3.4 does grow it to 811 and buys 15/15 borders, but costs six
more inspector problems including Voskreld drifting 20 deg and Cindral collapsing
to 59 cells. That trade is available if a bigger Vaelic matters more than a
map that reads cleanly.
