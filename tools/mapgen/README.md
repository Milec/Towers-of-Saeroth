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

`campaign/Saeroth.map` is seed 7: 28 nations, **15/15 required borders**,
**28/28 terrain majorities**, 671 rivers, 27 capitals taken from the nation
notes. The European continent is a single landmass.

**The continents are split by culture, not just geometry.** Group 0 is the
European analogue — Nordic, Ruthenian, Celtic, Italian, German, Greek, French,
Finnic, English, Portuguese and Basque name bases plus the Euro-adjacent
fantasy peoples (elves, dwarves, the dark-elf Reaches beneath them, the
lichdom). Group 1 is everywhere else: Chinese, Mongolian, Arabic, Berber,
Levantine, Iranian, Swahili, Nigerian, and the draconic ashlands.

Three things that split cost, and are worth knowing before changing it again:

- **Two nations were rebased rather than moved.** Melisor Magocracy (was
  Karnataka) and Tal Ulad (was Turkish) are bound by borders to European
  neighbours, so their `NAME_BASE` changed instead of their continent — Roman
  for the academies, Hungarian for a steppe-horse people who settled in a
  Europe. Moving them would have cost four required borders.
- **Khazan Khaganate had to go east, and it is the reason the split works.**
  Keeping the Mongolian khaganate west preserved three required borders and the
  founding myths built on them, but left an 18/8 split that could not be shared
  at any value of `GROUP_SHARE`: every number that fed 18 European nations
  starved the east into seven fragments. Moving its 2.0 weight across makes it
  17/9 and hands the east its own quarrel — the steppe against Xian Ti's wall,
  a border that came *back* in the move.
- **`GROUP_SHARE` is a statement about land per degree of latitude.** Group 0
  holds 17 nations across a 26° band, group 1 holds 9 across 40°. Land-by-weight
  wants 0.53/0.39, land-by-band wants 0.36/0.56; 0.47/0.45 tested best between
  them. At 0.50 the European continent itself splits in two; at 0.44 its small
  states get crushed under the big ones.

Known-imperfect on this seed: the eastern continent comes out as four landmasses
rather than one, Tal Ulad grows to about 4x its size weight (it is the southern
edge of the European continent, with open coast and no competitor below it), and
Corvane, Voskreld and Tessine sit near 0.3x. More `growIters` does not fix the
Tal Ulad case — it is where the land is, not a convergence failure.
