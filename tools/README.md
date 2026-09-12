# Maintained tools

Run commands from the repository root. See [Living Atlas integration](../docs/Living%20Atlas%20integration.md) for atlas sources and invariants.

| Purpose | Tools |
| --- | --- |
| Static website | `build_site.py` (`--no-vault` for a quick campaign/atlas build) |
| Atlas lore, positions and terrain tiles | `build_atlas_lore.py`, `build_atlas_tiles.py` |
| Districts and seats | `build_subprovinces.py`, `build_district_seats.py`, `check_subprovinces.py` |
| Shared POIs and campaign notes | `atlas_additions.py`, `build_campaign_pois.py`, `test_campaign_pois.py` |
| Campaign consistency | `lint_notes.py`, `sync_relations.py`, `sync_faith.py` |
| Handout and PDF export | `make_handout.py`, `topdf.js` |
| Website icons | `make_icons.py`, `rasterize.js` |
| Browser runtime and atlas tests | `browser.js`, [atlas-tests/README.md](atlas-tests/README.md) |

`data/required-borders.json` retains the 16 frontier constraints used by the campaign linter. These describe required relationships, not computed atlas adjacency. Update them when frontier lore intentionally changes; missing or malformed data fails validation.

The old Azgaar generator, brief exporter, backdrop renderer and downsampling script are retired. Their code and generation guide remain available in Git history before this cleanup. They do not generate the current Living Atlas.

Keep `atlas-source/` and the native map downloads: they are source/reference assets, not obsolete tools. Nation positions are built into `_site/nation-positions.json` from current atlas territories, rather than committed as a stale duplicate in `site/`.
