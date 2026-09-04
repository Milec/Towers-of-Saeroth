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
required borders after the redraw: 15/16      ← the vault's adjacencies, measured
                                                AFTER the last pass that moves a cell
terrain majority 28/28                        ← each nation has the terrain its note claims
frontiers: 56 in all, 12 of them between      ← how much of the political map is
  nations the vault says nothing about (21%)    geography rather than diplomacy
trade: 9/9 corridors whole, 24/24 legs        ← the world can carry its own trade
worst oversize: Tal Ulad 795 (4.0x)           ← size against WEIGHT, not raw cells
worst undersize: Voskreld Union 144 (0.2x)
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

## The current map

`campaign/Saeroth.map` is **seed 7**, built on Azgaar **1.151.1**: 28 nations
on a 3,600 x 2,150 canvas at 5 km to the pixel, **15/16 required borders**,
**28/28 terrain majorities**, both inhabited continents a single landmass each,
**all nine trade corridors whole** at 24 of 24 legs, and `inspect.py` reports
**1** problem.

It carries 1,240 settlements — 27 of the capitals named by the vault, the
twenty-eighth generated because Tal Ulad's note says its seat moves with the
season — 333 provinces, 102 regiments, 67 markets, 748 rivers, and all 119
diplomatic ties from `Political Relations.md`.

Of its 56 frontiers, **12 are between nations the vault says nothing about**.
That number is the point of the layout change that produced this map: at the
old spacing it was 7 of 50, and a continent whose every border was one the
notes had a reason for read as a diagram of the diplomacy rather than as a
place.

It is still chosen on the inspector rather than on borders or terrain — a map
before it scored 15/15 and 27/28 while putting Stoneborn Holds twelve degrees
inside the arctic.

The scale is derived rather than rolled: the canvas spans 96 degrees of
latitude over 2,150 pixels, and a degree is 111 km, so 5 km per pixel is the
only value consistent with the world's own climate model. Azgaar picks that
number at random otherwise, which put every distance and every journey time on
the previous map out by up to a factor of five.

**The European band was widened from 26 deg to 35 deg (21N-56N)** to make this
possible. Seventeen nations in a 26-degree strip is more land than the band can
hold, so the continent bulged and threw nations out of it — Stoneborn north into
the ice at 64N, Corvane twenty-one degrees south. Widening the band cut the best
seed's inspector score from 7 problems to 3. If nations start drifting again,
widen the band before touching `GROUP_SHARE`.

Known-imperfect, and in the output rather than hidden:

- **Tal Ulad holds 795 cells, four times its share.** It is the one thing
  `inspect.py` fails on. The plateau it is given is real terrain rather than a
  lobe it wandered into, and the fix would be to raise a SIZE weight to match
  the map instead of the note, which is the wrong direction.
- **Corvane Republic and Dalstan do not touch**, so 15 of the 16 required
  borders are met rather than all 16.
- **Voskreld and Sahenna come out at a fifth of their share** (144 and 119
  cells). The growth controller cannot equalise a nation boxed in by
  mountains and coast, and every seed tried has two or three like this.

Retuning the growth controller was tried against this seed and made all of it
worse: `growIters` 70 dropped the required borders to 13 and left Tal Ulad with
one cell; `growGain` 0.45 put Tal Ulad at 5.8x. Leave it alone.

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
