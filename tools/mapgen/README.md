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

`campaign/Saeroth.map` is seed 818: 27 nations, one landmass per continent,
17/17 required borders, 27/27 terrain majorities, 733 rivers, 1,232 settlements
named from 27 per-nation cultures, 26 capitals taken from the nation notes.

Known-imperfect: Stoneborn, Melisor and Sarrowmere sit at 0.2–0.3× their size
weight — mountain nations ringed by their own ranges, which cost-distance
growth cannot easily push out of.
