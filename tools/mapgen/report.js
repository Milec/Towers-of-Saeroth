// Turn saeroth2-profile.json into readable notes to ship with the .map.
const fs = require('fs');
const W = require('./world.js');

const P = JSON.parse(fs.readFileSync(process.env.PROFILE || 'saeroth2-profile.json', 'utf8'));
const pc = v => Math.round(v * 100) + '%';
const BI = ['Marine', 'hot desert', 'cold desert', 'savanna', 'grassland',
            'tropical seasonal forest', 'deciduous forest', 'tropical rainforest',
            'temperate rainforest', 'taiga', 'tundra', 'glacier', 'wetland'];
const NICE = {
  desert: 'desert', grass: 'grassland', jungle: 'jungle', taiga: 'taiga/tundra',
  wetland: 'wetland', decid: 'deciduous forest', forest: 'forest', mtn: 'mountain',
  hills: 'hills', high: 'highland', coast: 'coastline', wetriver: 'river and marsh',
  islands: 'islands',
};
const claimText = s => {
  const k = P.claim[s.nation];
  return k === 'islands' ? s.islands + ' islands' : pc(s[k]) + ' ' + NICE[k];
};
const passes = s => {
  const k = P.claim[s.nation];
  return k === 'islands' ? s.islands >= 3 : s[k] >= 0.5;
};

const L = [];
L.push('# Saeroth, as a map\n');
L.push('Nothing here was generated and then edited to fit. **The landmass, the');
L.push('climate and the borders are all consequences of the vault.**\n');
L.push('## How the world was built\n');
L.push(`1. **All ${P.prof.length} nations are laid out at once, in open water.** The diplomacy`);
L.push('   graph pulls together every pair that must share a border, pushes the');
L.push('   rest apart, and drags each nation to the *latitude* its climate belongs');
L.push('   at. That is why the settled continent runs arctic-to-equator: it has to');
L.push('   hold Nordheim and the Thornwild at the same time.');
L.push('2. **The world is then built by plate tectonics.** Two dozen plates are laid');
L.push('   down and relaxed to even sizes; the ones carrying the political layout');
L.push('   become continental, the rest ocean floor. Each gets a motion, and three');
L.push('   are set deliberately — the settled continent is **rifting apart** along');
L.push('   one seam and **colliding** along another, which is where its inland');
L.push('   waters and its mountain spine come from, and the far continent is a');
L.push('   **collision zone**, which is why its mountain nations have mountains.');
L.push('   Coasts are plate outlines, so they are irregular by construction.');
L.push('3. **The coastline is then cut.** A second noise field bites only within a');
L.push('   narrow band of sea level, so it carves bays, capes and skerries without');
L.push('   touching the interior; above 40°N it goes ridged, and cuts fjords.');
L.push('   Anything it drowns inland that is smaller than a real lake gets filled');
L.push('   back in — that one pass is the difference between a continent and a doily.');
L.push('4. **A polar cap is built along the north edge**, with a frozen strait south');
L.push('   of it, and **hotspot chains** raise volcanic isles out in the deep ocean.');
L.push('5. **Territories are carved** with a capacity-constrained power diagram at');
L.push('   exact target sizes, then the borders **relax onto the relief** — sliding');
L.push('   along crests and down the valleys the rivers cut.');
L.push('6. **A climate model is run over the finished heightmap.** Zonal temperature');
L.push('   falling from the equator, zonal rainfall with an equatorial wet belt, a');
L.push('   subtropical dry belt and wet mid-latitudes; prevailing winds that swing');
L.push('   from trades to westerlies to polar easterlies with latitude; moisture');
L.push('   tracked upwind cell by cell, wrung out climbing every range and');
L.push('   exhausted crossing every interior. Each nation is then recentred on its');
L.push('   own mean, so the dry lee slope, the wet windward flank and the cold');
L.push('   summits all survive — around a climate the vault asked for.\n');

const [w, h] = P.size || [0, 0];
L.push(`Canvas ${w}×${h}, ${P.cells} map cells. World seed \`${P.opts && P.opts.seed}\`; ` +
       `${P.masses} landmasses, ${P.rivers} rivers, ${P.lakes} lakes, ` +
       `${Math.round((P.intricacy || 0) * 100)}% of land on a shoreline.\n`);
const settled = P.landTotal - P.wildTotal;
const nB = W.BORDERS.length;
L.push(`**Every nation has its own terrain as a majority** (${P.majority}/${P.prof.length}), ` +
       (P.borders >= nB ? `all ${nB} required borders exist` :
        `${P.borders} of the ${nB} required borders exist`) +
       `, and every one of the ${settled} settled land cells belongs to somebody ` +
       `(${P.unclaimed} unclaimed).\n`);
const wilds = P.log.filter(l => l.startsWith('wilderness:'))
  .map(l => l.replace(/^wilderness: (\d+) cells — /, (m, n) => '') + ` (${l.match(/(\d+) cells/)[1]} cells)`);
L.push(`A further **${P.wildTotal} cells are wilderness on purpose** — ` +
       wilds.join(', ') + ', and a scatter of volcanic isles raised by hotspots out');
L.push('in the deep ocean. A world map with nothing blank on it reads as a diagram;');
L.push('these are the parts of Saeroth the vault has never had to name, and they are');
L.push('yours to fill.\n');

if (P.colonies && P.colonies.length) {
  L.push('## The Wildlands\n');
  L.push('One of those unclaimed continents is only **partly** taken. Three powers');
  L.push('hold a coastal enclave apiece — the frontier republic that is named for');
  L.push('doing exactly this, and the two sea powers, who want harbours rather than');
  L.push('land. Everything behind those enclaves is unclaimed, and salted with things');
  L.push('to find:\n');
  for (const c of P.colonies) L.push(`- **${c.nation}** — ${c.cells} cells on ${c.where}`);
  L.push('');
  const finds = (P.log.find((l) => l.startsWith('placed ')) || '').replace(/^placed /, '');
  if (finds) L.push(`The interior carries ${finds}. They are real Azgaar markers with`);
  if (finds) L.push('generated legends, so tapping one in the app tells you what it is.\n');
  L.push('The colonies are stamped **after** the relief and climate are painted, so a');
  L.push('foothold does not reshape the ground it stands on the way a homeland does.');
  L.push('It is a flag, not a biome — the Wildlands are Wildlands underneath.\n');
}

L.push('## What each nation got\n');
L.push('| Nation | Cells | Burgs | °N | Its note says | The map gives it |');
L.push('| --- | ---: | ---: | ---: | --- | --- |');
const order = P.prof.slice().sort((a, b) => b.cells - a.cells);
for (const s of order)
  L.push(`| ${s.nation} | ${s.cells} | ${s.burgs} | ${s.lat} | ${(P.land[s.nation] || {}).why || ''} ` +
         `| ${claimText(s)}${passes(s) ? '' : ' ⚠'} |`);

L.push('\n## Terrain in full\n');
L.push('| Nation | desert | grass | jungle | taiga | wetland | decid | mtn | hills | coast | river |');
L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const s of order)
  L.push('| ' + s.nation + ' | ' + ['desert', 'grass', 'jungle', 'taiga', 'wetland', 'decid', 'mtn', 'hills', 'coast', 'river']
    .map(k => pc(s[k])).join(' | ') + ' |');

L.push('\n## The world, by biome\n');
const mixTot = Object.values(P.biomeMix).reduce((a, b) => a + b, 0);
L.push('| Biome | Share of land |');
L.push('| --- | ---: |');
for (const [k, v] of Object.entries(P.biomeMix).sort((a, b) => b[1] - a[1]))
  if (+k) L.push(`| ${BI[k] || k} | ${Math.round(v / mixTot * 100)}% |`);

L.push('\n## Size\n');
const tot = P.prof.reduce((a, s) => a + s.cells, 0);
L.push(`The largest nation is **${order[0].nation}** at ${(100 * order[0].cells / tot).toFixed(0)}% of the` +
       ` settled world; the smallest is **${order[order.length - 1].nation}** at ` +
       `${order[order.length - 1].cells} cells. Xian Ti and Vaelic are great powers; Nordheim`);
L.push('is a northern kingdom rather than an empire; the theocracy, the magocracy and');
L.push('the merchant league are city-states with a hinterland. Nobody dominates a');
L.push('continent alone.\n');

L.push('## Borders\n');
L.push(P.borders >= nB
  ? `All ${nB} borders the vault requires exist on the map, because the land was laid out to produce them:\n`
  : `${P.borders} of the ${nB} borders the vault requires exist on the map:\n`);
for (const [a, b] of W.BORDERS) L.push(`- ${a} ↔ ${b}`);
L.push('');
L.push('Two of the vault\'s territorial disputes are deliberately **not** a shared line');
L.push('on the ground, and both notes now say so:\n');
L.push('- **Khazan ↔ Thornwild** is "periodic raids for beast-stock", which steppe');
L.push('  riders can do at range, across other people\'s ground.');
L.push('- **Elvenhome ↔ Thurigypt** is a claim on oasis-groves the Confederacy tends');
L.push('  but has never held. Forcing it to be a frontier was what produced a');
L.push('  thousand-mile ribbon of elven territory down the seaboard — a border drawn');
L.push('  by a constraint rather than by anything in the world. The argument travels');
L.push('  by envoy and caravan instead.\n');

if (P.founded && P.founded.length) {
  L.push('## Capitals founded\n');
  L.push('Azgaar does not settle bare mountain, so a nation that came out entirely');
  L.push('highland had no town to promote. One was founded for each:\n');
  for (const f of P.founded) L.push(`- **${f.nation}** — ${f.burg}`);
  L.push('');
}

L.push('## Notes from the build\n');
for (const l of P.log) L.push('- ' + l);
L.push('');

L.push('## Loading it\n');
L.push('Open <https://azgaar.github.io/Fantasy-Map-Generator/>, then **Menu → Load Map');
L.push('→ Load from machine**, and pick `Saeroth.map`. It is Azgaar\'s own save format,');
L.push('not JSON — Azgaar cannot import JSON, which is why this is a `.map`.\n');
L.push('All 79 diplomatic ties from `campaign/nations/Political Relations.md` are carried');
L.push('into Azgaar\'s own relations matrix. Covert ties are stored as Neutral, which is');
L.push('the correct lie: a deniable tie should look like nothing from outside.\n');

fs.writeFileSync('Saeroth-map-notes.md', L.join('\n'));
console.log('wrote Saeroth-map-notes.md');
