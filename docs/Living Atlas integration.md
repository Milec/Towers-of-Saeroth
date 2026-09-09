# Living Atlas integration

The current geological Living Atlas is available at `#/atlas` in the campaign
app. It runs in a same-origin frame under `site/atlas/` to preserve its existing
SVG renderer, globals, keyboard controls, search, journey planner and mobile
layout. No framework or production JavaScript dependency is added.

The integrated view fills the main site surface, hides the duplicate atlas
header, and follows the wiki theme. The players Nations map uses the illustrated
political PNG with relief and roads; all overview pins share the generated
interior territory coordinates.

## Sources of truth

- Campaign Markdown owns lore. `tools/build_atlas_lore.py`, called on every site
  build, resolves note filenames to stable atlas record IDs. Ambiguous matches
  and missing nation notes fail the build. Places without dedicated notes link
  to their nation when known. Unmatched landmarks are listed in the generated
  index; the integration does not invent lore or locations.
- `site/atlas/data.js` owns the current map records; `routing-data.js` owns the
  route graph. Production, population, and diplomacy here remain snapshots.
  The linked campaign notes and existing campaign relationship views provide
  current narrative/diplomatic information. Old embedded nation prose is not
  displayed as a second authoritative version.
- The build regenerates `_site/nation-positions.json` using the current
  3840×2160 atlas and interior points of national territories. Relations and trade views therefore use
  the same background and coordinates as the interactive atlas.
- `atlas-source/Atlas-Revised-Source.map` is the corrected Azgaar data source;
  `geography.npz` and the unlabelled SVGs retain the reshaped geography. The
  original Azgaar download in the viewer is historical and has a different
  land layout. Neither native file alone recreates the reshaped viewer.
- `tools/build_atlas_tiles.py` regenerates regional detail tiles from the SVG
  sources (requires Pillow). Other artwork and renderer modules are maintained
  directly under `site/atlas/`; `ARTWORK.md` documents the art.

## Build and verification

```
python tools/build_site.py --no-vault
python tools/lint_notes.py
python -m http.server 8899 -d _site
```

Development checks require Node with `playwright` and `jsdom` installed; these
are test dependencies only. Install with `npm install` in `tools/atlas-tests`,
then run the package's test scripts. Set `CHROME_PATH` to an installed Chrome
executable or run `npx playwright install chromium` there.

Browser checks cover both themes and phone/desktop navigation from wiki to
atlas and back. `ATLAS_TEST_URL` can select a server under a Pages-style
subdirectory. The regression suite covers population sizing, filters, label
visibility, POI alignment, route planning and regional detail loading.

## Caching and release

The atlas is loaded only when opened. Its large assets and regional tiles are
cached on demand in a versioned cache, rather than included in campaign
precache. Visited regions can be reused offline; this is not a guarantee that
unvisited map regions are available. Missing offline assets return an error
instead of being replaced by the wiki HTML. The players site remains separate.

The integration is live on GitHub Pages. New changes require review before merging
into `main`, which triggers deployment. The separate ChatGPT atlas is unchanged.

Notes use a scope-specific persistent cache. Campaign notes refresh during worker
installation; visited rules remain available across releases. Atlas artwork is
versioned and cached on demand: an update invalidates previous atlas tiles to
avoid mixing editions. Cache quota failures preserve network responses. Only
caches in this deployment's namespace are cleaned; legacy unnamespaced caches
are left alone because other Pages applications may own them.

The renderer's `verification.json` describes the original generated map snapshot,
not the current website build. Current runtime verification lives in the PR checks
and `tools/atlas-tests/`. Rebuild note links and positions with `build_site.py`;
regenerating the legacy Azgaar tools does not regenerate atlas artwork or tiles.

## Territory handouts

Select a nation or province and open Place details. **Hide outside territory**
previews an opaque parchment cover; **Fit territory** includes every component,
including detached islands. **Export PNG handout** always conceals the exterior,
regardless of the preview checkbox. The export is a flattened raster, not an SVG
containing hidden world geometry. Blur alone would still reveal neighboring shapes.

Exports use the selected boundary, current map layers, and settlement name filters.
Settlement captions are fitted inside the territory; labels that cannot fit are
omitted. Roads, relief and settlement artwork remain visible. The overview raster
supplies the background; streamed regional SVG detail tiles are omitted. Exports
are up to 2400 pixels wide, capped at 3000 map pixels tall plus a title strip.
Boundary holes (including unclaimed lakes) and all other exterior areas are covered.
The interactive source remains a GM tool; share the downloaded PNG with players.

A progress message reports artwork loading and raster rendering; the resulting
save link remains available for mobile browsers. Missing artwork stops export
with a retry message. Handout browser tests cover a nation, province and archipelago,
verify painted interiors and sample exterior pixels away from antialiased edges.

The **Sepia parchment palette** toggle beneath the map presets applies to terrain
and political views, including roads and icons. Its setting persists on the device
and is captured for PNG exports; the opaque exterior remains parchment-colored.

Political mode uses subtle light and dark province washes over each nation’s
existing color when Provinces is enabled. Terrain mode retains boundary lines only.
Handout settlement labels avoid settlement artwork and use haloed leader lines
and anchor dots at the stored town coordinates. Capital names are bold; this
keeps nearby places such as Valmont and Tisonville distinct without moving them.


## Administrative districts

The atlas hierarchy is nation → province → district → settlement. All 127 active
provinces contain 2–5 districts (362 total). Search and territory details link
between these tiers; districts have their own boundary toggle, optional names,
capital rings, deep links, and isolated PNG handouts. Capital rings respect the
settlement tier filters. District names appear only with district boundaries.

`tools/build_subprovinces.py` generates committed `subprovinces-data.js` from
terrain-weighted growth across clipped Voronoi cells. It preserves province
outlines, assigns every settlement exactly once, and chooses the most populous
settlement in each district as its capital. Separate islands join the nearest
seed district. District populations allocate existing provincial estimates by
settlement population and rural land area; they do not add world population.
These administrative records are modeled geography, not new campaign canon or
hereditary titles. “District” avoids imposing CK3 title names on every culture.

Fourteen provinces originally contained only one settlement. Following the
user's explicit choice, `tools/build_district_seats.py` adds one 200-person
outpost to each, using existing land road/trail nodes inside the province.
`settlement-additions-data.js` stores these additions separately from the source
snapshot. Their working names derive from the original seats, their cultures
match those seats, and their residents are transferred from existing rural
estimates at both province and nation level. The viewer contains 1,293
settlements; all 1,279 original settlement records and native map files remain
unchanged. No new trade production is invented for the outposts.

Regeneration requires NumPy, SciPy and Shapely 2.1+; regular builds use the
committed artifacts and Python's standard library:

```
python tools/build_district_seats.py
python tools/build_subprovinces.py
python tools/check_subprovinces.py
```

The checker verifies source fingerprints, membership, capital choice, population
accounting and complete province coverage. Feature tests verify each new outpost
can reach its province seat using existing roads/trails without sailing or
cross-country travel. Browser tests cover district navigation, filters, persisted
deep links, and exported handouts.


## Custom points of interest

Open **My points of interest → Add POI**, enter a name, icon and optional notes,
then choose a position on the map and save. Editing also supports moving a
marker; deleting requires confirmation. Keyboard users can pan the map and press
Enter to place at its center, or Escape to cancel placement.

Custom locations are a separate browser-local overlay in
`saeroth-custom-pois-v1` localStorage, not edits to campaign canon or the published
map snapshot. They are searchable and have their own symbol/name layer controls.
They appear in territory PNG handouts when enabled; their notes are not part of
the rendered map. Map presets preserve the custom layer choices.

Export/import JSON backups move locations and notes between devices. Import is
additive: existing IDs are retained, not overwritten; malformed files are
rejected before any write. Limits are 500 POIs, 100 characters per name and 5,000
per note. Browser storage can be cleared or unavailable, so exported backups
are the durable copy. These records do not automatically sync across devices or
publish to other visitors, and custom-location deep links only resolve where
that record has been saved/imported. This feature does not add server storage,
accounts, route-graph nodes or campaign Markdown files.

`tools/atlas-tests/custom-pois.cjs` covers placement, edits, persistence, search,
layer dependencies, backup round trips, invalid imports and failed storage writes.
