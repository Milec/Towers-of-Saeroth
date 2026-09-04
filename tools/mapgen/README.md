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
| `build.js` | drives Azgaar in a headless browser, runs the forge inside the page, renames states, rebuilds cultures, rebuilds roads and provinces on the new borders, regenerates goods, lays the trade corridors as journeys, and saves. |
| `app.js` | booting the app: the URL, the waits, the update dialog, the layer registry, loading a `.map`. Shared by the four scripts that drive a browser. |
| `sweep.js` | scores a batch of seeds or parameter values and ranks them. |
| `inspect.py` | fails a build on what a reader would notice. |
| `report.js` | writes `Saeroth-map-notes.md` from the last build. |
| `verify.js` | loads a saved `.map` back and checks states, burgs, diplomacy and the trade corridors survived. |
| `touchup.js` | adds settlements to a nation on a saved map without regenerating it. |

## Running it

Needs a local copy of Azgaar's Fantasy Map Generator served on port 5199, and
Playwright:

```sh
# the app is TypeScript on Vite since 1.110 and cannot be opened from disk
cd /path/to/Fantasy-Map-Generator && npm install
# serve it (setsid so it survives the shell — see the docs, §8)
setsid nohup npx vite --port 5199 --strictPort &

# a scoring run: no save, no screenshots, prints the diagnostics and writes
# the profile inspect.py reads
SKIP_SAVE=1 NO_SHOT=1 OPTS='{"seed":818}' node tools/mapgen/build.js

# the real thing: writes Saeroth.map plus four renders
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
`islands`. It also fails on a **trade corridor the map cannot carry** — a leg
of one of the nine routes with no road and no sea lane between its two nations
(see below).

**Then still open the PNG.** The build writes `saeroth-world.png`; look at it
before shipping. The inspector catches what is measurable, not whether the
thing reads as a world. Both times a map went out looking wrong, the numbers
had been fine.

A sweep should rank on this before terrain and borders — a map with perfect
counts and a country in the ice is worse than one a degree off everywhere.

## The trade corridors

`campaign/world/Trade Routes.md` names nine corridors and they are on the map,
as **journeys** — Azgaar's own named multi-leg routes, one leg per hop between
two nations, each leg pathfound over the real roads or the real sea lanes.
The table is the source of truth in both places: `build.js` reads the same
`| **Name** | Carried by | [[A]] -> [[B]] | cargo |` rows the site's own
`view: routes` reads, in the same order, with the same nine colours, so a stop
added to the note moves the line on the map and in the web view together.

The "Carried by" column picks the transport, and three of the four are added to
Azgaar's default list because it ships no freight: a **Camel caravan** and a
**Freight wagon** on land, a **River barge** on the water.

**A leg that will not route is a map failure, and `inspect.py` treats it as
one.** If the Salt Road has no road between two of its nations, or the Incense
Coast has no sea lane, then two countries the vault has trading are not
actually connected, and the seed is wrong.

**A corridor that cannot be carried by its own transport is carried by the
other one.** A river leg between two fens on different drainages is not a hole
in the world — the cargo goes overland, which is what a smuggling run does
anyway. The build says which legs did it (`REROUTED`), because a river route on
wheels is worth knowing about, and `inspect.py` still fails on a leg that
neither wheels nor hulls can make.

**A corridor ends at a capital, not at a wharf.** The capital wins the endpoint
whenever the transport can reach it at all — a delta or river capital is a
valid water endpoint and the router will run a hull up the river to it — and
where it cannot, the corridor picks up a short road leg from the quay to the
city at each end. Left to pick ports, a sea corridor visited five countries
without entering any of them.

**The build reports how far each leg wanders from a straight line**, because
nothing else was measuring the thing that made the corridors look wrong:

```
wander 1.70x straight on average; worst Grauthaven -> Ilmen Wharf 4.0x
```

Roads and caravan tracks come out at 1.1-1.4x, sea lanes at 1.2-2.4x — a hull
has to go round a peninsula. Anything at 3x or more is a route that is creeping
rather than travelling. The one that does here is the Delta Run, and it is
honest: Grauthaven and Ilmen Wharf sit on different drainages, so the only way
between them is out to sea and round. The router refuses any land cell that is
not a recorded navigable river edge, so no amount of re-pricing invents a
river that is not there.

## Correcting a map without regenerating it

`touchup.js` edits a saved `.map` in place. It loads the file through the app's
own uploader, changes what it is told to, and saves back over it — same seed,
same coastline, same borders, same everything else.

```sh
node tools/mapgen/touchup.js
TARGETS='{"Silicar":28}' node tools/mapgen/touchup.js
```

What it exists for: Azgaar places burgs by habitability, and `build.js` tops any
nation that comes out under `MIN_BURGS` up to a floor of six. Two nations hit
that floor on a map that was otherwise worth keeping — Silicar, "a wet low basin,
cut with rivers" exporting food, and the Qeshara Sultanate, a network of oasis
towns on the caravan roads. Their terrain scored drier than their notes read, so
neither earned its towns. Rerolling the world to fix two countries is the wrong
trade; this adds the settlements with the app's own builder, so they get real
coats of arms, markets and trade, and names off the nation's own culture.

**It counts what is on the map, not what its loop thinks it did, and refuses to
save if the two disagree.** The first version trusted its own counter, reported
adding nothing, and had in fact put a burg on every land cell in both countries —
`Burgs.add` returns the new burg's *ID*, not the burg. Take a backup of the
`.map` before running it anyway.

Always `node tools/mapgen/verify.js` afterwards: it reloads the saved file and
re-checks states, burgs, diplomacy and every nation's terrain mix, which is how
you know the save round-tripped rather than quietly dropping something.

## Reading the output

The diagnostics matter more than the map looking nice at a glance:

```
group 0: 7904 cells across 1 landmass(es) (7904)   ← continent coherence, with the
group 1: 7868 cells across 3 landmass(es) (7862, 5, 1)   sizes: this one is whole,
                                                  the other two are stray cells
territory traded: 780 cells from the swollen  ← the size fix, and what it left
  to the starved
raised 35 cells of frontier the vault calls   ← RIDGE_BORDERS
  mountains
required borders repaired on the pack: 3      ← frontiers the redraw pulled apart
required borders after the redraw: 16/16      ← the vault's adjacencies, measured
                                                AFTER the last pass that moves a cell
terrain majority 28/28                        ← each nation has the terrain its note claims
frontiers: 58 in all, 16 of them between      ← how much of the political map is
  nations the vault says nothing about (28%)    geography rather than diplomacy
trade: 9/9 corridors whole, 24/24 legs        ← the world can carry its own trade
wander 1.56x straight on average               ← a leg at 3x is creeping, not travelling
worst oversize: Tal Ulad 618 (3.1x)           ← size against WEIGHT, not raw cells
worst undersize: Voskreld Union 349 (0.4x)
```

**Print the landmass sizes, not just the count.** A continent of 7,862 cells
plus six cells on two skerries reports "3 landmasses" and reads as fractured,
which had the sweep ranking whole continents below broken ones for an
afternoon.

**Sweep, don't tune.** Most defects left are seed-dependent, not systematic.
Run a dozen seeds, rank them on coherence first, and pick — a seed that scores
well everywhere beats another round of parameter fiddling. Continent coherence
has to be one of the criteria: every other metric is per-nation, and a country
stranded alone on an island scores perfectly on all of them.

`sweep.js` does exactly that, three runs at a time:

```sh
node tools/mapgen/sweep.js --seeds 1-24            # rank two dozen worlds
node tools/mapgen/sweep.js --seeds 4,7,9 --vary '{"knit":[0,0.008,0.018]}'
```

It writes no `.map`; it builds each world, scores it with `inspect.py --json`,
and prints the table ranked on continent coherence, then inspector problems,
then required borders, then trade legs, then terrain. **Vary one thing at a
time and keep the seeds fixed**, or a parameter that seemed to help will turn
out to have been a seed that happened to be good.

The spread between seeds is far wider than the spread between parameter
values, which is the whole argument for sweeping: the same settings give one
seed 28/28 terrain with two whole continents, and the next one a country at
seven times its share sitting fifty degrees out of its climate band.

## Three maps, one world — an experiment, not the current map

**This is not how `campaign/Saeroth.map` is made.** The region split below works
and its tooling is kept, but it was tried and set aside: giving each continent
its own canvas fixed the climate-band crowding and gave the middle sea a real
archipelago, and cost more in look than it bought in numbers. A continent that
fills its own canvas reads as a continent that fills a canvas, and the three
maps come out at three different scales with no merge tool to put them back
together. `modernize.js` above is what the current map went through.


`campaign/maps/Saeroth-west.map`, `-middle.map` and `-east.map` are the same
world built one continent at a time, and they exist because putting three
continents on one canvas is the constraint behind most of what is still wrong
with the world map. Azgaar generates one heightmap from one template per
canvas, so three continents share a single silhouette. The 50,000-cell grid is
split three ways, so a coast can only be as detailed as a third of a world
allows. And every nation competes for latitude with 27 others rather than with
the ten or so it actually shares a landmass with.

```
REGION=west   node tools/mapgen/build.js
REGION=middle node tools/mapgen/build.js
REGION=east   node tools/mapgen/build.js
```

`regions.js` names them and hands `forgeWorld` a filtered world — the same
nations, borders, terrain claims and climate bands, minus everything on another
continent. Nothing downstream knows a region build is happening.

**The land is Azgaar's, not the plate model's.** A region sets
`landFrom: 'template'`, and from there the heightmap template *is* the land: the
plate field is kept at 18% for the rift and moat structure that breaks a coast
up, plus the rim drown and the polar cap, and it no longer decides where the
water is. Warp a Voronoi cell all you like and it is still a Voronoi cell, which
is why the continents came out as rounded lobes for as long as the plates drew
them.

Handing the template the land outright only became possible *because* of the
region split. A template describes one world: ask it for three continents on one
canvas and it gives a supercontinent with land to both edges and no archipelago,
which is why this was tried and rejected earlier. Ask it for one continent on
one canvas and it gives exactly that.

Two rules make it work:

- **A region is one continent** (`oneContinent`). Old World handed the east a
  main mass and a second nearly as large, and the carve put half the nations on
  each — which severed five of the east's seven required borders, because two
  countries cannot share a frontier across open sea. Rival masses are found at a
  provisional waterline and sunk. **Deep**, not gently: the sea level is taken
  afterwards as whatever percentile hits the land budget, so a small push down
  just lowers the waterline and the rival surfaces again. Sunk properly, the
  main continent grows to take the budget and the rivals come back as island
  chains off its coast. The middle sea opts out — there, many landmasses are the
  entire point.
- **The template's own relief is the orogen** (`templateRelief`). Its `Range`
  strokes are the only high ground that agrees with the coastline it just drew,
  so they are blended into the uplift field that the mountain chains are walked
  along and that the carve steers a mountain nation onto. Only ground well above
  the template's plains counts: taken as absolute height it reads as uplift
  everywhere there is land at all.
- **The land is the RAW heightmap, not the saturated one.** The saturated field
  is built for nudging a coastline — it clips a few units above the donor's sea
  level so the shore gets the whole amplitude. Used as the land itself that
  clipping is fatal: every land cell sits in the same flat band, so a waterline
  drawn anywhere inside it falls on flat ground and whatever noise is left
  underneath draws the coast. Unclipped, the waterline is a contour of Azgaar's
  own heightmap, which is the point of borrowing it.

### The middle sea keeps the plates, and why

The archipelago came out as a sponge — land and sea alternating every three
cells across half the map — through five rounds of fixes that each changed
nothing: blurring the donor (up to 160 passes), magnifying it, feeding it raw
instead of saturated, three different templates, and zeroing the coastal noise.

None of them mattered because none of them was the cause. `fv` for group 2 is
not modulated by anything upstream — it is **overwritten** by the island-arc
field, four octaves of fbm at `arcFreq`. On the world map that group was twelve
hundred cells and 0.026 read as a nice scatter of islands. Given its own canvas
the same frequency is a base wavelength of three cells, and four octaves go
finer still.

So the middle region sets `arcFreq: 0.006, arcOct: 2` — islands about thirteen
cells across — and keeps `landFrom: 'plates'`. Azgaar's Archipelago template is
ten wandering troughs and two straits cut through a low plateau, which at fifty
thousand cells is lace however it is sampled. The plate model with hotspot
chains and the deliberate island lanes in `world.js` is better at island chains
than any template is. Templates win on continents; they lose here. 48
landmasses, 34% shore, both nations within three degrees of their target
latitude.

| region | seed | nations | borders | terrain | trade | problems |
| --- | --- | --- | --- | --- | --- | --- |
| west | 16 | 17 | **9/9** | 15/17 | 5 corridors, 13/13 legs | **0** |
| middle | 6 | 2 | — | 2/2 | — | **0** |
| east | 1 | 9 | **7/7** | 8/9 | 3 corridors, 6/6 legs | **0** |

All three report *nothing a reader would flag*, all 16 required borders stand,
and every trade leg the split leaves on a map is pathfound. Terrain majorities
come to 25 of 28, against 27 under the plate-shaped land — that is what the
borrowed coastlines cost, and it is the whole of what they cost.

All **16 required borders survive the split** — every one of them is between
nations on the same continent, so no region build can be short one the world
build gets. What does not survive is anything that crosses water: 60 of the 119
diplomatic ties, and a leg in each of four trade corridors. Those are named in
the build output rather than silently dropped, because getting them back is
what a merge is *for*.

Two things the split fixes outright:

- **The middle sea is an archipelago again.** On its own canvas at
  `landFraction` 0.14 it comes out as 127 landmasses at 54% shore, with both
  nations landing within a degree of their target latitude. On the world map
  the same two nations share 8% of the land with 26 others and the result reads
  as a drowned continent.
- **Thurigypt sits in its own climate band.** It and Qeshara both want the
  24–27N strip and both are large; on the world map one of them was always
  15–20 degrees out, through every fix tried across two rebuilds. Given a
  canvas with nine nations on it instead of twenty-eight, Thurigypt lands at
  26N against a target of 24N.

Each region keeps its own latitude window — west 64N–14N, middle 42N–12N, east
52N–18S — taken from the nations it holds with room for ocean at each end. The
window has to sit close to the nations' own span: a region's continent fills
its canvas, so a generous window just pushes the southernmost country onto the
bottom edge and out of its climate. That also means the three maps are at three
different scales (2.6, 1.5 and 3.6 km per pixel), which the merge has to
reconcile. That is deliberate: the alternative is shrinking each canvas to its
share of the world and handing back the resolution the split exists to buy.

**There is no merge tool yet.** `campaign/Saeroth.map` remains the one map the
site draws from — and it is now the *last plate-shaped build*, not something the
current code reproduces. A world build from here would use the four-donor
template set and land a different map (seed 7: 28/28 terrain majorities but
three inspector problems, against the committed map's 26/28 and none). The
region maps are the path forward, and what a merge tool will consume; the world
map is frozen until there is one.

## The current map

`campaign/Saeroth.map` is a map the vault kept, generated on Azgaar **1.143.2**
and brought forward to **1.151.1** by `modernize.js` rather than regenerated:
three continents on a 3,600 x 2,150 canvas with an archipelago between the two
settled ones and an unsettled south, 28 nations, 1,270 settlements, 351
provinces, 327 regiments, 1,036 route segments, and all 119 diplomatic ties
from `Political Relations.md`.

Eight of the nine trade corridors are whole, over 23 pathfound legs. The ninth,
the Incense Coast, gets one of its two legs: the sea router will not leave
Qeshara for Thurion on this coastline. That is the map disagreeing with the
note, reported rather than papered over.

**It was not generated by `build.js`, and `inspect.py` does not score it.** The
inspector reads a profile the forge writes as it works — where each nation
wanted to be against where it ended up, what it claims to stand on against what
it does. A map that arrived as a file has no such record. What can still be
checked on it is checked: `verify.js` reloads it and confirms the journeys,
provinces, regiments and route segments survive the round trip.

## Auditing what a finished map claims about its people

`census.js` reads settlement population and capital placement off a map and,
with `FIX=1`, repairs the two things that were wrong with this one. Both are
the kind that hide in plain sight, because the map renders perfectly either way.

```
node tools/mapgen/census.js          # audit only
FIX=1 node tools/mapgen/census.js    # repair and save
```

**Suitability overflowed.** `pack.cells.s` is a `Uint16Array`, and seventeen
land cells came out of the older generator pegged at 65535 — against a median
of 12 and a 99th percentile of 38. Azgaar derives a settlement's population
straight from it (`cells.s / 5`, times 1.5 for a capital, times the cell's
connectivity), so the five burgs standing on those cells were handed populations
of six to thirty-three **million**. The next largest settlement in the world has
ninety thousand people. Between them those five held 84 of the world's 277
million, and the Qeshara Sultanate came out 98% urban. Repaired, the world is
183 million and 4% urban, which is what a pre-industrial one should read as.

The repair takes the **median of the cell's own land neighbours** rather than a
constant, so a genuinely good site stays a good site and a mountain-top desert
cell goes back to being one, then recomputes the affected burgs with Azgaar's
own rule minus its gaussian jitter — this has to be reproducible.

**A capital in a place its note says it is not.** Two were reseated:

- **Reichsmund** is "a fortified river-city that holds the Diet and the High
  Prince's court", and was sitting on a three-way corner with foreign territory
  on two sides, on a stream carrying a flux of 34. It moved 485px inland to the
  principality's own river — flux 3,355, four cells clear of any frontier.
- **Myrrhkand** is "a walled city of spice-souks and star-towers", and was the
  *fifth* settlement of its own realm at 4,876 people, on a desert peak. Azgaar's
  suitability is an agricultural score and Qeshara is desert, so no cell in the
  sultanate will ever hand its capital the size the note describes — hence the
  `first` flag, which raises a reseated capital past its largest rival when the
  terrain model cannot see why it is rich.

A capital keeps **the larger of** what it was and what its new ground supports.
A city does not shrink because the map was corrected about where it stands.

Two capitals were deliberately **left alone**, and the audit still flags them so
the decision stays visible. Sunkenhold is "a warden-hold built across a chasm,
reachable only by bridges that can be cut from either side" — small, third in
its own realm and hard against a frontier is exactly what that note says.
Brightfurrow is "a canal-town where the guildhalls sit level with the locks they
govern", and a canal town near a border in a 282-cell state is not a defect.
**Only a capital whose own note describes a place it is demonstrably not sitting
in gets moved**, and the list of them is in the file.

## Bringing an existing map forward

`build.js` forges a world from the vault, and is right when the world itself
should change. `modernize.js` is the other case, and the more common one: a map
that is already right — the coastline you want, the borders you want, the
nations where you want them — saved by an older generator and missing
everything the generator has grown since.

```
node tools/mapgen/modernize.js                      # campaign/Saeroth.map in place
IN=old.map OUT=campaign/Saeroth.map node tools/mapgen/modernize.js
```

It touches no terrain, no territory, no burgs, no rivers and no names. It loads
the file through the app's own uploader — which runs Azgaar's migration on the
way in — and adds what was not there:

- **Transports** and **journeys** (1.150): the nine corridors from
  `Trade Routes.md`, each leg pathfound between two real settlements, using the
  same code `build.js` uses. That is what `journeys.js` exists for — one copy,
  because a corridor drawn two subtly different ways on two maps is the drift
  the vault's sync scripts exist to prevent.
- **Provinces**, **armies** and **statistics**, and **markets** and **goods**
  where the map has none. Only where it has none: regenerating provinces on a
  map that already has them throws away names somebody may have edited.
- **Diplomacy**, re-applied from the note, so a tie edited since the map was
  saved is on the map. Nations are matched on the vault's full name *and* on
  whatever short form the map carries, because these files were named before
  the current naming pass existed.

It refuses to save if no journeys were laid, since then it has gained nothing.

Two traps, both of which cost a screenshot each. Loading a `.map` fits the SVG
to the browser window, and a shot is taken of the SVG element — so without
putting the element back to `graphWidth` x `graphHeight` first, every render is
the top-left corner of the world at 1:1. And the app has to be booted at the
map's own canvas size, which `modernize.js` reads out of the file's first line,
or the zoom is fitted to the wrong canvas before the map even arrives.

### Mountains are tectonic, not political

Relief used to be painted per nation out of its own `elev` band, with `elev[0]`
read as a floor. That gives a mountain nation whose every cell stands at
mountain height: a solid blob of hatching in the shape of a country, stopping
dead at the frontier with a flat plain on the other side. Every mountain
country on the map had the same blob.

Real ranges do not know where the borders are. So height is built in two parts:

1. **The orogen, which is global.** The collision uplift a cell actually sits
   on, folded into ridges running along the front and dying away from it, times
   a low-frequency modulation *along* the range so the crest drops into
   saddles — the passes that roads, armies and trade all have to use. A range
   with no gaps in it is a wall, and a wall is not somewhere a campaign
   happens.
2. **A regional bias, one number per nation** — the gap between the ground it
   was given and the band its note claims — which is **smoothed across the
   whole map** before it is added. That is what turns a political step into a
   slope: a mountain kingdom rides high and its neighbour comes down off the
   range gradually instead of falling off a cliff at the frontier.

The smoothing has a cost of its own: a small nation's correction gets smeared
away into its neighbours, and Melisor — 178 cells of claimed highland — came
out at grassland height. So `nationPin` closes part of the remaining gap
unblurred: enough to hold the claim, not enough to rebuild the wall.

3. **A chain walked along the crest.** A fold field says where mountains are;
   it never says where any one range starts or ends, so a whole orogen comes
   out as corrugation over a wide area rather than as something you could name.
   Azgaar's own `Range` operator has the answer and always has: a range is a
   **path**. Walk a connected line of cells, raise it, let the height fall away
   either side, and it reads as a range because it is one. Same idea here,
   except the strokes are not random — each is walked along the crest of the
   orogen the plates already built, stepping to whichever neighbour holds the
   most uplift and favouring carrying straight on over doubling back. Ten
   chains, the longest 92 cells.

   Two things make or break it. Each finished chain **fences off the ground
   around it** (`crestKeepout`), because otherwise the walk starts the next
   range one cell from the last and a dozen of them packed together is a
   plateau — the exact blob this was written to remove. And the chains are
   **blended over the folds** rather than replacing them (`crestMix`,
   `crestAmp`): the folds are the foothills a nation's terrain claim actually
   stands on, the chain is the range. Drop the folds and the terrain claims go
   with them.

   `relief: 'fold'` turns the chains off and leaves the folds alone.

`RIDGE_BORDERS` in `world.js` is the exception that proves the rule. A border
is normally wherever two nations happen to stop; the Thesal–Vaelic frontier is
a fact about the ground, because the vault leans on it — the coronation road is
a single high pass, which is what makes the two an alliance rather than a
march. Those cells are found after the territory is drawn and raised directly.

### The coastlines are borrowed, one template per continent

Plate tectonics decides where the continents are and decides it well, but a
plate is a Voronoi cell, and a warped Voronoi cell is still a blob. What the
plate model does not produce is structure at every scale at once: the gulf, the
peninsula off the gulf, the cape off the peninsula. That self-similarity is
most of what makes a coastline read as a real one.

Azgaar's stock templates have it, because they are not noise — **Old World** is
three long `Range` strokes, hills at two sizes, a strait cut end to end, then a
field of troughs and pits, each landing at a different scale. So the forge runs
a template on its own grid, through Azgaar's own `HeightmapGenerator`, and adds
the result to the potential field before the sea level is taken.

Three details are the whole thing:

- **One template run per continent, and each continent names its own.** A
  template only ever describes one world: run it once and drape the result over
  three continents and all three come out with the same silhouette, and the
  middle sea — which is supposed to read as an archipelago — comes out shaped
  like a continent that drowned. The two settled continents take Old World, the
  middle sea takes **Archipelago** (ten troughs and two straits cut through low
  hills, which is what makes islands rather than a coast), and the wilderness
  takes a fourth run so it does not inherit a neighbour's outline. That is
  `donorTemplates`; `donorAmp` runs the middle hotter, because there the
  fragmenting is the point. Averaging two fields over the whole map instead —
  the first version — cancelled exactly the structure that made either worth
  borrowing and left a smooth mush.
- **Each donor is slid so its own landmass sits over the continent it shapes**,
  rather than sampled where it happens to fall.
- **The donor is rescaled around its own sea level** (`oldWorldSoft`), not
  min-to-max. A template spends most of its 0–100 on mountains, so a plain
  min-max normalisation leaves the land/sea decision — the only part being
  borrowed — squeezed into a narrow band near the bottom, and the coast barely
  moves. Pivoting at 20 took the shore from 17% of cells to 22% and the
  landmass count from 31 to 47.

`oldWorld` is the amplitude, in the same units as the continental step itself
(`contBase` 0.55 against `oceanBase` -0.55), so it reads as a fraction of how
strongly the plate says land here. At 0.8 a donor can carve a gulf into a
continent or leave an island off it, and cannot move a continent. It goes into
the potential field rather than replacing the land mask, and every group is
re-levelled to its own land budget straight after, so this changes the *shape*
of a coast and never how much land a group gets or which group a nation lands
on. `oldWorld: 0` turns it off.

### The territory trade

The cost multiplier in the carve cannot shrink a runaway, and the reason is
structural: growth runs until every cell is claimed, so cost decides only where
two nations *meet*. A nation alone beside an empty lobe takes the whole lobe at
any price — which is how Tal Ulad came out at four times its share while
Voskreld and Sahenna sat at a fifth of theirs.

What works is trading. Peel the cells furthest from a swollen nation's own seat
and hand each one to whichever neighbour is furthest under quota. Two passes:
one for the runaways (above 1.3x giving to anything under 0.9x), then a much
gentler one for the crushed alone (a neighbour barely over quota can spare a
little for a nation at half its share).

**It runs once, on the finished territory, not inside the carve.** The first
version ran on every border-fix attempt, severed a frontier the vault requires,
and the attempt loop then spent the rest of its budget re-seeding to win that
border back — scoring a hundred points for the border against thirteen for the
country it had crushed getting there. Tal Ulad came out of a *size fix* at 47
cells. A required frontier is guarded inside the trade for the same reason, and
repaired again on the pack afterwards, because the redraw over the real
drainage can pull two nations apart that the grid still had touching.

### How far apart unrelated nations stand

`separate` is how far two nations with no relationship push each other apart in
the layout, and `knit` is how hard they are pulled back together once they have
drifted past `knitAt`. Together they are the strongest single lever on how the
political map reads, and the one to reach for before the seed.

At the old `separate: 1.12` with no knit at all, the only thing holding a
continent together was the diplomacy graph: nations the vault had paired
clustered, everyone else stood off, and the carve filled the gaps between them.
Seven of fifty frontiers on the finished world were between countries the notes
say nothing about. Real countries mostly border someone they have no opinion
of.

At **1.02 / 0.008** the same seed gives 12 of 56 quiet frontiers, and every
other number improves with it — 11 inspector problems to 1, 27 terrain
majorities to 28, 22 of 24 trade legs to all of them, and every seed in a
24-seed sweep comes out with both continents whole. The knit value itself
barely matters between 0.004 and 0.012; `separate` is the dial. Above 1.06 the
knit never engages at all, because the repulsion holds nations closer than
`knitAt` and the attractive term never fires.

### Why Vaelic Principality is a southern realm

It carries the largest SIZE weight in the west and used to come out at 466
cells, 0.3x its share. Nothing local fixes that, because **the response to
every growth lever is bimodal**: Vaelic either respects a band at 36N and stays
at ~470 cells, or stops respecting it and takes the entire southern lobe at
2600+, centred fifteen degrees out of its own climate. There is no setting in
between — `latW` flips between the two states somewhere under 0.7, and a cheap
`riverW` moves it by seventy cells.

What works is admitting where it lives. Its required borders already put it
between Thesal at 32N and the Lichdom at 24N, so `tlat: 26` is what the vault
was already saying. At 26N it comes out at **1563 cells, 0.9x its share** — the
largest nation on its continent, which is what its weight says it should be —
and the ridged Tal Ulad plateau walls it off from the far south.

**`tlat` is a layout parameter, not a local one.** Moving Vaelic ten degrees
shifted the western band's centre of mass, and the *eastern* continent slid
south out of its climate bands with it: seed 7 went from 3 inspector problems
to 8, five of them eastern nations that had not been touched. Rebuilding with
Tal Ulad un-ridged gave byte-identical eastern failures, which is how the
latitude move was identified as the cause rather than the plateau.

The repair was `latPull` 0.030 -> 0.08 and `groupGap` 1.9 -> 1.6 in `build.js`.
Those two trade against each other: `latPull` holds a nation at its own
latitude, `groupGap` is how hard the two continents shove each other apart, and
at the old values the shoving won — which is why one nation moving could drag a
continent it does not sit on. Fixing the balance took the same seed to 2
problems and 15/15 borders. **If a change to one continent breaks the other,
suspect this pair before the seed.**
