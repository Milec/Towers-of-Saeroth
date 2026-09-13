# Saeroth geography and settlement audit — corrected
September 8, 2026.

All actionable defects identified in the initial audit have been addressed.

- Nordheim now peaks at 2,583 m, with 45 added ridge clusters and preserved fjord/harbor terrain.
- Thelemar stands on a 1,250 m plateau.
- Reichsmund is in grassland with a connected river through the city.
- Sarrowmere is wetland; Ilmen Wharf has a connected channel. Voskgrad also now has a mapped river.
- Road and sea-lane geometry is corrected, including shared routes using the same affected segments. The rerun finds no road-water or shipping-land cuts.
- All 475 road–river intersections are classified: 282 bridges and 193 fords. Six existing named bridge POIs were moved to nearby crossings within their original nations.
- 37,393 surface rural residents were redistributed off ice, preserving every nation's total. This includes ice newly formed by the Nordheim elevation correction. No surface rural population remains on glaciers.
- Stoneborn and Undertide population records explicitly include underground residents; those people were not treated as surface farmers.
- Kelvary's capital is Almenara, matching its Castilian frontier culture. Harrowgate remains searchable as its former English atlas name.
- Optional Melisor teleportation planning connects its 15 remote settlements through Thelemar. It is off by default; permission and exact circle locations remain unspecified.
- Independent homesteads and upland communities have access/habitat explanations. Their absence of national provinces or their altitude is not itself an error.

All 1,279 settlements, 16 required borders, both archipelagos, the uninhabited southern continent, national population totals and culture assignments are preserved. World population remains 30,722,498.

The current audit JSON includes raw review flags as well as corrected geometry checks. Valid exceptions include unclaimed homesteads, the Tessine city-state, Melisor teleportation and underground holds. These flags should not be automatically treated as remaining defects.

Crossing classifications and supply/access explanations are cartographic planning assumptions, not newly discovered canon. Ford passability, bridge capacities and teleport permission are not guaranteed. The terrain is geologically informed procedural geography, not a plate-tectonic or erosion simulation.

Reproduce the checks with scripts/audit_living_geography.py. Current evidence: geography-settlement-audit.json. The correction log is geography-corrections.json.
