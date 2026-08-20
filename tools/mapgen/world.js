// The vault, expressed as numbers a map generator can act on.
//
// The big change from world.js: every nation now carries a **target latitude**
// rather than a vague "north / south / doesn't matter" hint. Climate is no
// longer painted per country out of thin air — it is computed from a global
// model (zonal temperature, zonal rainfall, orographic rain shadow) and each
// nation is then nudged onto its intended character. So a nation gets the
// ground its note describes AND sits at the latitude where that ground makes
// sense, which is what stops the world reading as a patchwork quilt.
//
// `temp` values below are close to what the global model already produces at
// that latitude; the residual is the nation's own anomaly (a warm maritime
// coast, a great river's floodplain in a desert belt, a volcanic hotspot).

// Relative size WITHIN a landmass. Xian Ti and Vaelic are the great powers;
// Nordheim is a northern kingdom, not an empire; the theocracy, the magocracy
// and the merchant league are city-states with a hinterland.
const SIZE = {
  'Xian Ti': 2.2, 'Khazan Khaganate': 2.0, 'Vaelic Principality': 2.4,
  'Thurigypt': 1.4, 'Elven Confederacy': 1.3, 'Voskreld Union': 1.2,
  'Nordheim': 0.9, 'Quivar': 0.55, 'Kesmarch Frontier': 0.8,
  'Thornwild Confederation': 0.8, 'Aquoniti': 0.8, 'Lazarian Lichdom': 0.35,
  'Dalstan': 0.7, 'Corvane Republic': 0.55, 'Silicar': 0.6,
  'Stoneborn Holds': 0.6, 'Cindral Ashlands': 0.5, 'Thesal Theocracy': 0.5,
  'Melisor Magocracy': 0.55, 'Thurion Merchant Alliance': 0.34,
  'Undertide Reaches': 0.3,
  // the six minor states of the eastern continent
  'Kelvary March': 0.45, 'Tal Ulad': 0.28, 'Sarrowmere': 0.4,
  'Ashkar Pale': 0.4, 'Tessine': 0.15,
  // filled a gap in the setting's real-world inspirations
  'Sahenna Compact': 0.5, 'Qeshara Sultanate': 0.45,
};

// tlat  target latitude in degrees north (the map runs 66°N to 30°S)
// temp  the nation's own mean temperature in °C
// prec  its own mean rainfall, in the units Azgaar's biome function reads
//       (moisture = 4 + prec, and >=25 moisture with the right height is marsh)
// elev  height band; >=60 reads as mountain, 40-59 as hills
// ridged   sits on a fold belt: gets the collision uplift and parallel ridges
// coastal  seeded on an OCEAN shore rather than the edge of an inland sea
const LAND = {
  // ---- the European continent, arctic down to the steppe march ----------
  'Nordheim':                   { tlat: 56, temp: -1, prec: 9,  elev: [24, 46], coastal: 1, why: 'taiga and a fjord coast' },
  'Melisor Magocracy':          { ridged: 1, tlat: 56, temp: 3, prec: 5, elev: [44, 68], why: 'a high plateau' },
  'Stoneborn Holds':            { ridged: 1, tlat: 53, temp: 4, prec: 4, elev: [59, 90], why: 'high cold mountains' },
  'Undertide Reaches':          { ridged: 1, tlat: 51, temp: 4, prec: 4, elev: [59, 94], why: 'the mountains they live under' },
  'Elven Confederacy':          { tlat: 48, temp: 10, prec: 12, elev: [26, 48], coastal: 1, why: 'temperate rainforest on a wet western seaboard' },
  'Voskreld Union':             { tlat: 45, temp: 10, prec: 3, varMul: 0.35,  elev: [24, 42], why: 'plains' },
  'Dalstan':                    { ridged: 1, tlat: 44, latW: 0.7, takeMul: 0.30, temp: 10, prec: 5, elev: [40, 58], why: 'hill country' },
  'Khazan Khaganate':           { tlat: 43, latW: 1.3, temp: 11, prec: 3,  elev: [24, 42], why: 'open steppe in the continental interior' },
  'Silicar':                    { tlat: 41, temp: 11, prec: 25, elev: [27, 40], why: 'a wet low basin, cut with rivers' },
  'Corvane Republic':           { tlat: 37, latW: 0.7, temp: 12, prec: 8,  elev: [21, 30], coastal: 1, why: 'coastal lowland' },
  'Quivar':                     { tlat: 37, temp: 13, prec: 7,  elev: [24, 42], coastal: 1, why: 'deciduous valleys, soft coast' },
  'Vaelic Principality':        { tlat: 36, latW: 1.5, temp: 12, prec: 8,  elev: [26, 46], why: 'deciduous river valleys' },
  'Kelvary March':              { tlat: 34, temp: 13, prec: 3, elev: [30, 50], why: 'rolling hill country and horse pasture' },
  'Thesal Theocracy':           { tlat: 32, temp: 14, prec: 8,  elev: [28, 48], why: 'temperate crossroads country' },
  'Tessine':                    { tlat: 30, temp: 16, prec: 9, elev: [18, 28], coastal: 2, why: 'a deepwater bay behind a headland' },
  'Sarrowmere':                 { tlat: 26, temp: 18, prec: 27, elev: [26, 38], why: 'a vast freshwater fen' },
  'Lazarian Lichdom':           { tlat: 24, temp: 19, prec: 27, elev: [27, 42], why: 'the drowned delta of a great river' },
  'Tal Ulad':                   { tlat: 21, temp: 19, prec: 3, elev: [28, 46], why: 'high open grassland grazed on a circuit' },

  // ---- everywhere else: the wall, the desert bloc, the jungles ----------
  'Xian Ti':                    { tlat: 33, temp: 15, prec: 8,  elev: [24, 42], why: 'settled deciduous river country' },
  'Qeshara Sultanate':          { ridged: 1, tlat: 27, temp: 22, prec: -2, elev: [34, 56], why: 'a highland desert of oasis valleys, on the northern arm of the range' },
  'Thurigypt':                  { tlat: 24, temp: 25, prec: -3, elev: [26, 40], why: 'hot desert; the river makes its own green belt, and the range breaks around it' },
  'Cindral Ashlands':           { ridged: 1, tlat: 20, temp: 24, prec: 1, elev: [58, 92], volcanic: 1, why: 'volcanic highland, hot and bare' },
  'Ashkar Pale':                { ridged: 1, tlat: 17, temp: 23, prec: 4, varMul: 0.55, elev: [25, 44], why: 'ash plains and terraced valleys under the volcano, on the range\'s southern arm' },
  'Sahenna Compact':            { tlat: 15, temp: 24, prec: 2,  elev: [22, 36], why: 'open savanna between the frontier jungle and the equatorial rainforest' },
  'Kesmarch Frontier':          { tlat: 12, temp: 25, prec: 9,  elev: [24, 42], why: 'seasonal jungle at the frontier' },
  'Thornwild Confederation':    { tlat: 3,   temp: 26, prec: 18, elev: [26, 44], why: 'equatorial rainforest' },

  // ---- the island seas --------------------------------------------------
  'Thurion Merchant Alliance':  { tlat: 34, temp: 16, prec: 9,  elev: [21, 30], coastal: 1, why: 'harbours' },
  'Aquoniti':                   { tlat: 21, temp: 22, prec: 11, elev: [21, 32], coastal: 1, why: 'warm island seas' },
};

// what each nation is judged on afterwards
const CLAIM = {
  'Thurigypt': 'desert', 'Thornwild Confederation': 'jungle', 'Nordheim': 'taiga',
  'Stoneborn Holds': 'mtn', 'Undertide Reaches': 'mtn', 'Cindral Ashlands': 'mtn',
  'Melisor Magocracy': 'high', 'Khazan Khaganate': 'grass', 'Xian Ti': 'decid',
  'Voskreld Union': 'grass', 'Vaelic Principality': 'decid', 'Thesal Theocracy': 'decid',
  'Silicar': 'wetriver', 'Quivar': 'decid', 'Dalstan': 'hills',
  'Lazarian Lichdom': 'wetland', 'Corvane Republic': 'coast',
  'Thurion Merchant Alliance': 'coast', 'Aquoniti': 'islands',
  'Kesmarch Frontier': 'jungle', 'Elven Confederacy': 'forest',
  'Kelvary March': 'grass', 'Tessine': 'coast',
  'Sarrowmere': 'wetland', 'Tal Ulad': 'grass', 'Ashkar Pale': 'grass',
  'Sahenna Compact': 'grass', 'Qeshara Sultanate': 'desert',
};

const BORDERS = [
  //   ['Elven Confederacy', 'Khazan Khaganate'],   // Khazan moved east; see GROUP
  ['Elven Confederacy', 'Nordheim'],
  // Elvenhome once had to reach the desert, and the only shape that satisfied
  // that was a thousand-mile ribbon down the seaboard — a Chile, drawn by a
  // constraint rather than by anything in the world. The vault's own reason is
  // a claim on oasis-groves the Confederacy tends but has never held, which is
  // an argument carried by envoy, not across a frontier, so it no longer asks
  // for a shared line on the ground:
  //   ['Elven Confederacy', 'Thurigypt'],
  ['Kesmarch Frontier', 'Thornwild Confederation'],
  // Khazan needing five neighbours at once was the single hardest constraint
  // in the whole layout, and the one that failed most often. The Thornwild
  // quarrel is "periodic raids for beast-stock", which steppe riders can do at
  // range, so that is the one that does not need a shared line on the ground:
  //   ['Khazan Khaganate', 'Thornwild Confederation'],
  //   ['Khazan Khaganate', 'Vaelic Principality'],   // Khazan moved east; see GROUP
  //   ['Khazan Khaganate', 'Voskreld Union'],   // Khazan moved east; see GROUP
  ['Khazan Khaganate', 'Xian Ti'],
  // Keep this one even though the claim is on caverns *beneath* Stoneborn
  // rather than on a frontier: BORDERS is a layout constraint, not just a
  // scorecard, and deleting it let Stoneborn collapse from 326 cells to 21.
  ['Stoneborn Holds', 'Undertide Reaches'],
  ['Corvane Republic', 'Dalstan'],
  ['Dalstan', 'Thesal Theocracy'],
  ['Lazarian Lichdom', 'Thesal Theocracy'],
  // Lazarian's quarrel with Thurigypt is "life against undeath in the plainest
  // terms: Thurigypt's patron is the one goddess Lazarian has outlawed" — a
  // theological enmity, not a border dispute, and the only tie Thurigypt had
  // that asked for ground. It survives the move across the ocean unchanged,
  // the same way the Elven oasis claim above does:
  //   ['Lazarian Lichdom', 'Thurigypt'],
  ['Lazarian Lichdom', 'Vaelic Principality'],
  // The coronation road: no Vaelic prince is crowned without a Thesal
  // celebrant, and that is a road between two capitals, not a sea crossing.
  ['Thesal Theocracy', 'Vaelic Principality'],
  // the eastern continent's own quarrels, which are all about ground
  ['Ashkar Pale', 'Cindral Ashlands'],
  ['Kelvary March', 'Tal Ulad'],
  ['Silicar', 'Tal Ulad'],
  // Sahenna's savanna sits against the jungle frontier on one side and
  // Thurigypt's desert on the other; both pulls keep it wedged between them:
  ['Sahenna Compact', 'Kesmarch Frontier'],
  // Sahenna's first line calls it the savanna between Thurigypt's desert and
  // the Thornwild's jungle. That is a claim about the ground, so it needs one:
  ['Sahenna Compact', 'Thurigypt'],
  // Without a forced border here Qeshara's capital seed landed on a small
  // offshore plate at this seed and came out a wholly isolated island —
  // wrong for a caravan-and-camel sultanate, and it undercuts the trade
  // relationship the note describes ("the caravan road... older than either
  // nation's own founding record"). Force it onto the mainland.
  ['Sahenna Compact', 'Qeshara Sultanate'],
];

// Which continent each nation belongs to — and the split is now thematic, not
// just geometric. **Group 0 is the European-analogue continent**: Nordic,
// Ruthenian, Celtic, Italian, German, Greek, French, Finnic, English,
// Portuguese and Basque name bases, plus the Euro-adjacent fantasy peoples
// (elves, dwarves, the dark-elf Reaches under them, the lichdom). **Group 1 is
// everywhere else**: Chinese, Arabic, Berber, Levantine, Iranian, Swahili,
// Nigerian, and the draconic ashlands.
//
// Two nations were rebased rather than moved, because their ground is bound to
// neighbours on the European side but their names were not (see NAME_BASE):
// Melisor Magocracy and Tal Ulad.
//
// Khazan Khaganate was the hard call. Keeping it west preserved three required
// borders and the founding myths built on them; moving it east follows its
// culture and — decisively — balances the continents. At 18 west to 8 east the
// European side could not be given enough land to feed 18 nations without
// starving the east into seven fragments, which is what the sweep showed.
// Moving the Khaganate's 2.0 weight across takes the split to 17/9 and hands
// the east its own internal quarrel: the steppe against the wall. The three
// western ties it left behind are rewritten around a sea it no longer crosses,
// and Khazan/Xian Ti — the Great Wall relationship — comes back as a real
// frontier instead of raids by hired ship.
const GROUP = {
  // ---- the European continent ----
  'Nordheim': 0, 'Voskreld Union': 0, 'Dalstan': 0, 'Corvane Republic': 0,
  'Vaelic Principality': 0, 'Thesal Theocracy': 0, 'Elven Confederacy': 0,
  'Lazarian Lichdom': 0,
  'Quivar': 0, 'Silicar': 0, 'Kelvary March': 0, 'Tessine': 0,
  'Sarrowmere': 0, 'Stoneborn Holds': 0, 'Undertide Reaches': 0,
  'Melisor Magocracy': 0, 'Tal Ulad': 0,
  // ---- everywhere else ----
  'Khazan Khaganate': 1, 'Xian Ti': 1, 'Thurigypt': 1, 'Sahenna Compact': 1, 'Qeshara Sultanate': 1,
  'Ashkar Pale': 1, 'Kesmarch Frontier': 1, 'Thornwild Confederation': 1,
  'Cindral Ashlands': 1,
  // ---- the island seas ----
  'Aquoniti': 2, 'Thurion Merchant Alliance': 2,
};

// How much of the SETTLED land each continent gets, independent of how its
// nations divide it up. Derived from SIZE alone one continent takes three
// quarters of the world; stated outright, the relative scale of nations WITHIN
// each one is still theirs.
//
// This number has to be re-derived every time nations change continents,
// because it is really a statement about LAND PER DEGREE OF LATITUDE. A
// continent that cannot fit its band bulges past it, and no cost function pulls
// it back (docs/azgaar-map-generation.md §8). After the European/everywhere-else
// split, group 0 carries 17 nations and weight 12.1 across a 26° band
// (28°N-54°N); group 1 carries 9 and weight 9.1 across 40° (3°N-43°N).
// Land-by-weight wants 0.53/0.39 and land-by-band wants 0.36/0.56; 0.47/0.45
// is what actually tested best between them. Push group 0 to 0.50 and the
// European continent itself splits in two; drop it to 0.44 and its small
// states (Tessine, Sarrowmere, Undertide) get crushed under the big ones. An
// earlier 18/8 split could not be shared at any value — everything that fed
// the European side enough starved the east into seven fragments, which is
// what sent Khazan across the ocean.
const GROUP_SHARE = { 0: 0.47, 1: 0.45, 2: 0.08 };
// where each continent starts on the canvas, in fractions of width/height.
// Only x really matters — latitude decides y from here on.
const ANCHOR = [[0.24, 0.28], [0.76, 0.39], [0.50, 0.30]];

// Land nobody has settled. A world map with no blank on it reads as a diagram;
// these are the parts of Saeroth the vault has never had to name.
// The polar cap is built deliberately in the forge rather than out of plates,
// so it is not listed here; these are the ones the plates make.
const WILD = [
  // The Wildlands: a continent nobody has finished taking. Three powers hold a
  // coastal enclave apiece — the frontier republic that is named for doing
  // exactly this, and the two sea powers, who want harbours rather than land —
  // and the interior belongs to whatever is still standing in it.
  { id: -3, at: [0.45, 0.90], reach: 0.16, share: 0.80, why: 'the Wildlands',
    colonists: ['Kesmarch Frontier', 'Thurion Merchant Alliance', 'Aquoniti'],
    colonyFrac: 0.24, colonyCap: 0.32 },
  { id: -4, at: [0.13, 0.86], reach: 0.09, share: 0.20, why: 'an empty island in the southern ocean' },
];

// Deliberate island trails. Hotspot chains land where the dice put them, which
// left the sea between the continents blank as often as not; these are seeded
// on purpose so there is a way across by short crossings — the archipelago
// between the two inhabited continents, and stepping stones down to the
// frontier from each of them.
const ISLE_LANES = [
  { at: [0.28, 0.72], ang: 0.75, cones: 6 },   // mainland -> the Wildlands, south-east
  { at: [0.70, 0.74], ang: 2.40, cones: 6 },   // the east -> the Wildlands, south-west
  { at: [0.47, 0.22], ang: 0.60, cones: 4 },   // the northern reach of the archipelago
];

module.exports = { SIZE, LAND, CLAIM, BORDERS, GROUP, GROUP_SHARE, ANCHOR, WILD, ISLE_LANES };

// ---------------------------------------------------------------------------
// Naming. Azgaar seeds a dozen random cultures with real-world name bases and
// no relation to our nations, so Nordheim's capital came out "Iututute" off a
// Roman base and the dwarves of Stoneborn got Scythian names. Each nation gets
// ONE culture whose territory is its own, and a base chosen to match what the
// nation actually is — which is what makes a burg list read as a place.
// Index into Azgaar's name-base table (src/data/name-bases.ts).
const NAME_BASE = {
  // the mainland
  'Nordheim': 6,                    // Nordic — taiga and a fjord coast
  'Elven Confederacy': 33,          // Elven
  'Voskreld Union': 5,              // Ruthenian — the plains union
  'Dalstan': 22,                    // Celtic — hill country
  'Khazan Khaganate': 31,           // Mongolian — the steppe khaganate
  'Corvane Republic': 3,            // Italian — a maritime republic
  'Vaelic Principality': 0,         // German — river-valley princes
  'Thesal Theocracy': 7,            // Greek — the temperate crossroads
  'Xian Ti': 11,                    // Chinese
  'Lazarian Lichdom': 41,           // Serpents — the drowned delta of the dead
  'Thurigypt': 18,                  // Arabic — the desert and its river
  // the east
  'Melisor Magocracy': 8,           // Roman — academies, arcane law, competing spires
  'Stoneborn Holds': 35,            // Dwarven
  'Undertide Reaches': 34,          // Dark Elven — the mountains they live under
  'Silicar': 9,                     // Finnic — a wet basin cut with rivers
  'Quivar': 2,                      // French — soft coast and deciduous valleys
  'Cindral Ashlands': 39,           // Draconic — volcanic highland
  'Kelvary March': 1,               // English — horse pasture and marches
  'Tessine': 13,                    // Portuguese — a deepwater bay
  'Sarrowmere': 20,                 // Basque — the great fen
  'Tal Ulad': 15,                   // Hungarian — steppe horsemen who settled in a Europe
  'Ashkar Pale': 24,                // Iranian — terraces under the volcano
  'Kesmarch Frontier': 28,          // Swahili — the jungle frontier
  'Thornwild Confederation': 21,    // Nigerian — equatorial rainforest
  'Sahenna Compact': 17,            // Berber — the caravan roads and the salt trade
  'Qeshara Sultanate': 42,          // Levantine — the sultanate's own base, distinct from Thurigypt's Arabic
  // the sea powers
  'Thurion Merchant Alliance': 4,   // Castillian — the harbour league
  'Aquoniti': 25,                   // Hawaiian — warm island seas
};
// Azgaar uses this to decide how a culture spreads and what it settles.
const CULTURE_TYPE = {
  'Nordheim': 'Naval', 'Elven Confederacy': 'Naval', 'Corvane Republic': 'Naval',
  'Tessine': 'Naval', 'Thurion Merchant Alliance': 'Naval', 'Aquoniti': 'Naval',
  'Quivar': 'Naval',
  'Stoneborn Holds': 'Highland', 'Undertide Reaches': 'Highland',
  'Cindral Ashlands': 'Highland', 'Melisor Magocracy': 'Highland',
  'Qeshara Sultanate': 'Highland',
  'Khazan Khaganate': 'Nomadic', 'Tal Ulad': 'Nomadic', 'Sahenna Compact': 'Nomadic',
  'Thurigypt': 'River', 'Lazarian Lichdom': 'River', 'Silicar': 'River',
  'Sarrowmere': 'River', 'Xian Ti': 'River',
};
module.exports.NAME_BASE = NAME_BASE;
module.exports.CULTURE_TYPE = CULTURE_TYPE;

// Capitals as the vault already names them. These are canonical — the campaign
// notes are the source of truth for anything the world has already been told
// about itself, and a generated name silently overwriting one is a regression,
// not a feature. Tal Ulad is the sole nation with no entry: its note says the
// Season-Speaker's camp moves every quarter and "treaties name the season
// rather than the place", so its capital keeps a generated name.
const CAPITAL = {
  'Aquoniti': 'Thalassar',
  'Ashkar Pale': 'Vetch Landing',
  'Cindral Ashlands': 'Emberthrone',
  'Corvane Republic': 'Vantry',
  'Dalstan': 'Ostravin',
  'Elven Confederacy': 'Sylanthir',       // council seat; no capital by design
  'Kelvary March': 'Harrowgate',
  'Kesmarch Frontier': 'Charterhold',
  'Khazan Khaganate': 'Ordu-Khazan',
  'Lazarian Lichdom': 'Grauthaven',
  'Melisor Magocracy': 'Thelemar',
  'Nordheim': 'Hravnfjord',
  'Quivar': 'Valmont',
  'Qeshara Sultanate': 'Myrrhkand',
  'Sahenna Compact': 'Bonemarket',
  'Sarrowmere': 'Ilmen Wharf',
  'Silicar': 'Brightfurrow',
  'Stoneborn Holds': 'Highforge',
  'Tessine': 'Tessine',                   // the nation is the city
  'Thesal Theocracy': 'Concord',
  'Thornwild Confederation': 'Rootmeet',  // where the Circle meets
  'Thurigypt': 'Setharu',
  'Thurion Merchant Alliance': 'Vessene',
  'Undertide Reaches': 'Sunkenhold',
  'Vaelic Principality': 'Reichsmund',
  'Voskreld Union': 'Voskgrad',
  'Xian Ti': 'Renshan',
};
module.exports.CAPITAL = CAPITAL;

// The vault's "Economic Specialties" bullet, reduced to the raw resources
// Azgaar actually models. The notes are the source of truth here as they are
// for capitals — a khaganate whose note says "iron, livestock, horses" should
// not be handed whatever its biome rolled. Services (banking, arbitration,
// spellcasting) and manufactures (porcelain, fine armour) have no raw-resource
// equivalent and are left to the production chains, which build them from
// these; only what comes out of the ground or off the herd is listed.
const SPECIALTY = {
  'Aquoniti': ['Pearls', 'Fish'],
  'Ashkar Pale': ['Grain', 'Wine', 'White sand', 'Saltpeter'],
  'Cindral Ashlands': ['Iron', 'Gemstones', 'Coal', 'Stone'],
  'Corvane Republic': ['Wood', 'Hemp', 'Clay'],
  'Dalstan': ['Gold', 'Silk', 'Silver'],
  'Elven Confederacy': ['Wood', 'Wine', 'Silk', 'Honey'],
  'Kelvary March': ['Horses', 'Iron', 'Cattle'],
  'Kesmarch Frontier': ['Furs', 'Wood', 'Cattle', 'Grain'],
  'Khazan Khaganate': ['Horses', 'Iron', 'Cattle'],
  'Lazarian Lichdom': ['Gemstones', 'Saltpeter', 'Dyes'],
  'Melisor Magocracy': ['Gemstones', 'Silver', 'Incense'],
  'Nordheim': ['Wood', 'Furs', 'Amber', 'Iron', 'Whales'],
  'Qeshara Sultanate': ['Incense', 'Spices', 'Silk'],
  'Quivar': ['Wine', 'Dyes', 'Spices'],
  'Sahenna Compact': ['Salt', 'Cattle', 'Dyes'],
  'Sarrowmere': ['Hemp', 'Honey', 'Clay'],
  'Silicar': ['Grain', 'Iron', 'Clay'],
  'Stoneborn Holds': ['Iron', 'Gold', 'Gemstones'],
  'Tal Ulad': ['Horses', 'Cattle', 'Sheep'],
  'Tessine': ['Fish', 'Wine'],
  'Thesal Theocracy': ['Honey', 'Incense', 'Grain'],
  'Thornwild Confederation': ['Mahogany', 'Furs', 'Spices', 'Dyes'],
  'Thurigypt': ['Grain', 'Spices', 'White sand', 'Gold', 'Stone'],
  'Thurion Merchant Alliance': ['Fish', 'Wood'],
  'Undertide Reaches': ['Iron', 'Silver', 'Gemstones'],
  'Vaelic Principality': ['Grain', 'Sheep', 'Iron', 'Horses'],
  'Voskreld Union': ['Grain', 'Iron', 'Silver'],
  'Xian Ti': ['Silk', 'Tea', 'Clay', 'Hemp'],
};
module.exports.SPECIALTY = SPECIALTY;
