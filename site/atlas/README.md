# Saeroth — Living Atlas

Open index.html after extracting the ZIP, or use https://saeroth-living-atlas.mmcconag.chatgpt.site while signed into the owning account. Keep companion files together. Optional local server: node server.cjs.

## Exploration

Drag, pinch or use zoom controls. Search nations, settlements, provinces, routes and landmarks. Map layers include relief, main and minor roads, sea lanes, production goods, provinces and points of interest. Switch terrain/political views for clear national borders. Nine named trade corridors retain their saved connections.

Settlement detail controls icons and names independently for metropolis (50,000+), city (10,000+), town (1,000+) and village tiers. Crowns follow the seat's population tier; names avoid overlaps and become more numerous on zoom. These preferences are remembered on the device. Capital names are now interactive, not baked into the background.

Original illustrated landmark symbols distinguish volcanoes, passes, fortresses, ruins, mines, springs, shrines, forests, inns, towers, caves and hazards. Emberthrone volcano and Drakenstein were added from the campaign repository; their atlas placement is approximate, not a canonical coordinate. Other generated POIs retain their source identities and descriptions.

## Journeys

Choose From / To and an optional Via location, or use Start here / Travel here in a place detail panel. Choose foot, mounted or caravan travel, enable sailing, and optionally allow off-road approaches. Peach lines are roads and lilac lines are trails, teal dashes are sea travel and rust dots are off-road travel. Save a text itinerary or fit the whole journey on screen. Mobile navigation links jump between map, journey planner and place details.

Routing follows 110,966 saved transport and adjacent land-cell links. Off-road links never jump between disconnected landmasses. Ports connect to adjacent charted sea lanes. Inaccessible islands and underwater landmarks may have no route. This is a fantasy journey planner, not real GPS. The model uses 2 km/map unit, 24 km/day walking, 40 mounted, 20 caravan and 100 sailing. Trails take 30% longer; off-road movement takes 2.5 times longer. Estimates exclude rest days, waits, weather, vessel availability and border delays. Recorded hostile/strained relations are flagged, without inventing closed borders or permissions. Off-road river crossings and terrain accessibility require GM judgment.

## Retained world

1,279 settlements, 28 national seats, 127 provinces, 123 roads, 1,117 trails, 91 sea lanes, 468 POIs (466 inherited plus two lore landmarks), nine named corridors. Surviving names, capitals, cultures, populations and ports retain the source records. The southern continent and its detached southern islands remain uninhabited, as requested; no southern population was relocated. Some lowland borders coincide with rivers, and selected borders follow mountain ridges. The terrain was fitted to retained national topology.

The native Azgaar pass is maintained separately. Original-Azgaar.map in this package is an archived source with its earlier wilderness errors, not an editable version of this new geography. This companion does not implement Azgaar save round-tripping or terrain editing. Static travel PNGs/SVGs accompany the interactive atlas.

## Lore and validation

Reference: https://github.com/Milec/Towers-of-Saeroth/tree/main/campaign (retrieved September 8, 2026). Repository lore is reference material; explicit user requirements, including the empty southern wilderness, take precedence. Individual new landmarks link to supporting documents.

Automated tests cover tier icons/names, symbol references, searches, map controls, all existing goods/corridors, route connectivity, sailing/off-road restrictions, waypoints, same-point and unreachable paths, southern wilderness and retained records. Static exports are visually reviewed. Real browser/mobile visual QA remains unverified because no usable browser automation connection is available.

## Mountain and frontier update

Filled highland symbol gaps and continued ridge illustrations through the snowy Dalstan strip shown in the user reference without changing elevation or national borders. The Vaelic–Quivar Frontier Road connects Aisach to Ercellenenay along Lazarian’s frontier through Sarrowmere, tying into existing main roads at both ends. It is included in journey planning. Base map colors: main roads rust, trails dashed plum, sea lanes dashed teal, new frontier road green.

## Painted atlas edition

Terrain, settlement and most landmark symbols now use detailed artwork created with the built-in image generator. Highforge has a dedicated dwarven mountain-hold illustration. Crowns, anchors, danger skulls and trade badges remain crisp functional vector symbols. Generated source artwork and prompts: ARTWORK.md and assets/painted-atlas.png. The source uses a magenta key rendered once into a transparent RGBA sprite sheet; PNG metadata was normalized without changing pixels for compatibility with the exporter.

Highforge moved to a 4,130 m mountain site approximately 221 km from the coast in its existing Stoneborn province. Its culture, population, market and capital identity are preserved. The obsolete port flag is removed. Highforge Mountain Approach connects its surface gate to the existing roads; named corridor approaches and journey routing follow the new location. The underlying terrain and other settlements are unchanged.

## Blended symbol treatment

Current symbols use the baked blended-00.png through blended-23.png assets. They have a muted sage/stone palette, softer contrast, cleaned alpha edges and feathered ground contact. Forests and settlements are slightly smaller, while mountain ranges and Highforge retain their prominence. No new browser filters run per icon. Original generated artwork remains available alongside the treatment sources.

## Continuous woodland coverage

Forest, conifer and tropical canopy now follow the forest biomes as contiguous wooded areas, replacing the sparse scattered groves. There are 5,939 woodland markers (previously 854). Biome edges have smaller trees; settlement clearings, river corridors and main road approaches remain open. Small position/scale variations and mirrored groves reduce repeated patterns. Mountain, hill, dune and marsh markers are retained. This changes the illustration coverage, not population, national borders or the underlying biome definitions.

## Labels and population

Country, pass and settlement names are in the final labels layer, above terrain, settlement/POI symbols, trade goods, selection and journey overlays. Name visibility filters still apply.

Current estimated world population: 30,722,498 (26,463,423 rural; 4,259,075 in settlements), including unclaimed lands. The southern wilderness remains unpopulated. This sums corrected rural cell data and current settlements using the atlas population multiplier; see world-population.json.


## Progressive cartography
Automatic detail is the default. Capitals and major landmarks remain at overview; cities emerge at 1.5×, towns at 3× and villages at 6×. Names emerge at 2× / 4× / 8× for cities / towns / villages. Minor roads and harbor entrances emerge at 3×. Smaller POIs emerge at 2.5× or 4×. Your tier and layer filters remain in effect, and search reveals a selected record at any zoom. Choose All detail to disable zoom filtering.

39 geographic labels cover 13 existing named woods, 22 rivers, and four descriptive highland/icefield regions. River names are associated with nearby revised drainage using native Azgaar river mouths; these are approximate cartographic associations. The range labels are descriptive labels based on nation lore, not new canonical proper names. Existing Middle Sea and national labels remain. All text is drawn above artwork and route highlights; background copies have been removed.

New generated stone bridge, mountain saddle and harbor entrance illustrations use the same muted palette as the existing map. The six recorded bridge POIs and existing ports receive the new art; no roads, settlements, population, borders or cultures were relocated. Static travel images include all detail, subject to label collision avoidance.


## Audited geography corrections
The September 8 correction fits the terrain and drainage to Nordheim, Melisor, Vaelic and Sarrowmere lore. All road–river intersections have inferred bridge/ford classifications. Existing named bridges were aligned within their original nations; small crossing symbols appear at 5×. The population distribution excludes surface farming on ice while explicitly retaining subterranean residents in Stoneborn and Undertide.

Kelvary's capital is Almenara, with Harrowgate retained as a searchable former English atlas label. Melisor teleportation is an optional planning setting, disabled by default. One hour per transfer is an estimate, not a canonical journey time; permission and exact circle locations are unspecified.

The full audit is Geography-and-Settlement-Audit.md; machine-readable findings are geography-settlement-audit.json. The archived original native Azgaar pass remains a historical source. Current corrected physical geometry is maintained in the generated atlas and geography.npz.


## Settlement icon hierarchy
Every national settlement, including isolated places, scales against its nation's largest settlement using the fourth root of its population ratio. The largest settlement is the reference even if it is not the capital. Within 30 km, lower-population settlements shrink further where needed to remain smaller than higher-population neighbors. Unclaimed settlements use only the nearby comparison. Existing icon sizes remain hard maximums; no icon is enlarged. Capital and harbor artwork scales together and stays stable across zoom levels and filters. Labels and transparent selection targets retain their normal sizes. Population, locations and routes are unchanged.

Terrain texture uses deterministic grain, biome mottling and elevation-based slope shading beneath rivers and borders. No geography records change. Ordinary POIs and inferred crossings scale to at most 85% of their nearest settlement's displayed symbol width. Strategic mountain passes, volcanoes and explicitly sourced lore landmarks retain their original icon sizes, independent of local settlement population. Settlement illustrations remain at every zoom; labels and tap targets retain their sizes.


## Label visibility
Settlement names require the Settlements layer, Settlement names switch, and the tier's icons and names. POI names follow Points of interest independently of Settlement names. Country names follow Country selection; geographic names follow Geographic names, with mountain/forest captions also requiring Terrain symbols and sacred forest names requiring Points of interest. Search and zoom respect disabled components. Hidden labels do not reserve placement space. Legacy fixed pass captions have been removed in favor of POI-owned labels, with alternate positions spaced to the actual artwork size. Full downloadable maps deliberately enable POIs.


## Whole-atlas visual polish
Calmer distance-to-shore water wash and a narrow coastal rim separate land and sea; this is cartographic shading, not simulated bathymetry. Forest canopy paints beneath other relief with a softer wash. Transport colors keep their established categories, with quieter trails and road ink capped at close zoom. Production badges emerge at regional zoom unless a specific good is selected. Settlement population sizing and major-landmark prominence are preserved. The mobile map has more room, an accessible whole-world control, and a distance bar using the same 2 km per map unit as route planning. Downloadable overview maps label national seats, metropolises and important landmarks; all settlements and POIs remain available interactively.


## Road-aligned structures
Bridge decks and strategic pass trails are rotated along the nearest local land-road segment. Recorded bridge route associations constrain the alignment, so nearby unrelated roads cannot take precedence. Pass artwork is centered on its nearest road; these small cartographic offsets leave source coordinates and routing records intact. Labels, selection highlights and hit areas follow the displayed pass icon. Original icon sizes and importance rules are preserved.


## Zoom-dependent background detail
At close zoom (6x or more, once source pixels would be enlarged), the atlas loads only visible regional SVG backgrounds. Each tile combines the original terrain colors with finer grain and original vector rivers, shores and borders, at four times the overview sampling resolution. Up to twelve tiles are retained; offscreen tiles are released. The lightweight overview remains beneath loading or failed tiles. Both terrain and political styles are supported. Source geography is unchanged; no additional river bends or terrain features are invented.
