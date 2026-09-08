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

This branch is for review. No ChatGPT hosting configuration, credentials,
runtime installations or generated publication archives are imported. The
existing live ChatGPT atlas is unchanged. Merging to `main` would trigger the
repository's existing GitHub Pages deployment; do not merge until approved.
