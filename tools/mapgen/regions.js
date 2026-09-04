// Saeroth, one continent at a time.
//
// The world map puts all three continents on one 3,600 x 2,150 canvas, and
// that is the constraint behind most of what is still wrong with it. Azgaar
// generates ONE heightmap from ONE template per canvas, so three continents
// share a single silhouette; the 50,000-cell grid is split three ways, so a
// coast can only ever be as detailed as a third of a world allows; and every
// nation is competing for latitude with 27 others rather than with the ten or
// so it actually shares a landmass with.
//
// So a region build gives one continent the whole canvas and the whole cell
// budget. Nothing about the vault changes — the same nations, the same
// required borders, the same terrain claims and climate bands — only how much
// of the world is being asked for at once.
//
//   REGION=west  node tools/mapgen/build.js
//   REGION=east  node tools/mapgen/build.js
//   REGION=middle node tools/mapgen/build.js
//
// Merging the three into one world image is a separate job and a later one;
// each of these is a complete, valid .map on its own terms in the meantime.
//
// What the split costs, measured rather than guessed:
//
//   - **Nothing on required borders.** All 16 of them are between nations on
//     the same continent, so no region build can be short one that the world
//     build gets.
//   - **Cross-continent trade.** Four of the nine corridors have a leg between
//     continents; those legs cannot exist on a map with one continent on it.
//     The build reports them as the merge's problem rather than failing.
//   - **Diplomacy across the water.** Ties between nations in different regions
//     are dropped from the region's own map for the same reason.
//
// Each region keeps its own latitude window, taken from the nations it holds
// with room at each end for ocean, so the climate model still puts a taiga
// kingdom in the taiga. That means the three maps are at three different
// scales in km per pixel, which is the merge tool's problem to reconcile —
// deliberately, because the alternative is shrinking every region's canvas to
// its share of the world and giving back the resolution this exists to buy.

// `groups` are the GROUP ids from world.js; `wild` are the WILD ids that
// belong with them. `latTop`/`latBot` bound the canvas: pad past the nations
// themselves, because a continent that runs edge to edge has no coast.
const REGIONS = {
  west: {
    groups: [0],
    wild: [],
    // Its nations want 21N to 56N. On the world map that band was a slice of a
    // 96-degree canvas; here the continent fills the canvas, so the window has
    // to sit close to the band itself — a generous one just pushes the
    // southernmost country to the bottom edge and out of its own climate.
    // Room above for Nordheim's ice, a little below for ocean.
    latTop: 64, latBot: 14,
    ice: true,
    // nothing unsettled on this map, so all of its land is somebody's
    landFraction: 0.34, settledFraction: 1, oneContinent: true,
    why: 'the settled west: seventeen nations from the ice down to the dry south',
  },
  middle: {
    groups: [2],
    wild: [],
    // its two nations want 21N to 34N
    latTop: 42, latBot: 12,
    ice: false,
    // An archipelago is mostly sea, and at the world map's 0.43 it comes out
    // as a continent with channels cut in it. Pushed the other way it shreds:
    // at 0.14 with the donor at double amplitude it made 127 landmasses, most
    // of them a few cells across, which is confetti rather than islands.
    landFraction: 0.28, settledFraction: 1,
    donorAmp: [1, 1, 1.05, 1],
    // many landmasses is the whole point here
    oneContinent: false,
    why: 'the middle sea: an archipelago and the two powers that work it',
  },
  east: {
    groups: [1],
    // the Wildlands and the southern island sit off the east, and all three of
    // their colonial enclaves belong to eastern nations
    wild: [-3, -4],
    // its nations want 3N to 43N, and the Wildlands run south of all of them
    latTop: 52, latBot: -18,
    ice: false,
    // The Wildlands used to be 0.24 of the world's land against this group's
    // 0.34, which on a canvas holding nine nations came out as more unexplored
    // continent than settled one. Some blank is the point — a world map with
    // none of it reads as a diagram — but not half the map.
    landFraction: 0.32, settledFraction: 0.70, oneContinent: true,
    why: 'the settled east and the Wildlands below it',
  },
};

const pick = (obj, keep) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => keep(k)));

// Take the world apart and hand back only the piece a region needs, in exactly
// the shape `forgeWorld` already expects — so nothing downstream has to know a
// region build is happening.
function regionWorld(W, name) {
  const R = REGIONS[name];
  if (!R) throw new Error(`unknown region ${name} — have ${Object.keys(REGIONS).join(', ')}`);
  const inRegion = n => R.groups.includes(W.GROUP[n]);

  // this region's nations now share the canvas among themselves alone
  const SHARE = {};
  const total = R.groups.reduce((a, g) => a + (W.GROUP_SHARE[g] || 0), 0) || 1;
  for (const g of R.groups) SHARE[g] = (W.GROUP_SHARE[g] || 0) / total;

  // and the continent sits in the middle of it rather than off to one side
  const ANCHOR = W.ANCHOR.map((a, g) => (R.groups.includes(g) ? [0.5, 0.42] : a));

  const WILD = W.WILD.filter(w => R.wild.includes(w.id))
    .map(w => Object.assign({}, w, {
      // a wilderness keeps its colonists only if they are on this map
      colonists: (w.colonists || []).filter(inRegion),
    }));
  // and it takes the whole non-settled budget, since the others are elsewhere
  const wTotal = WILD.reduce((a, w) => a + w.share, 0) || 1;
  for (const w of WILD) w.share = w.share / wTotal;

  // island trails that ran between continents have nothing to connect to here
  const ISLE_LANES = name === 'middle' ? W.ISLE_LANES.slice(2)
    : name === 'east' ? W.ISLE_LANES.slice(1, 2) : W.ISLE_LANES.slice(0, 1);

  return {
    name,
    forgeWorld: W.forgeWorld,
    SIZE: pick(W.SIZE, inRegion),
    LAND: pick(W.LAND, inRegion),
    CLAIM: pick(W.CLAIM, inRegion),
    GROUP: pick(W.GROUP, inRegion),
    BORDERS: W.BORDERS.filter(([a, b]) => inRegion(a) && inRegion(b)),
    RIDGE_BORDERS: W.RIDGE_BORDERS.filter(([a, b]) => inRegion(a) && inRegion(b)),
    GROUP_SHARE: SHARE,
    ANCHOR, WILD, ISLE_LANES,
    LAT_TOP: R.latTop, LAT_BOT: R.latBot,
    landFraction: R.landFraction, settledFraction: R.settledFraction,
    donorAmp: R.donorAmp, oneContinent: !!R.oneContinent,
    // the world build makes the polar cap deliberately; only the west has one
    ice: R.ice,
    inRegion,
    why: R.why,
  };
}

module.exports = { REGIONS, regionWorld };
