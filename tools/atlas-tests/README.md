# Website regression checks

Use Node 24 and pnpm 11.19.0. In this directory run
`pnpm install --frozen-lockfile`, then `pnpm exec playwright install chromium`.
An installed Chrome can instead be selected with `CHROME_PATH`.

Build with `python tools/build_site.py --no-vault` from the repository root and
serve `_site` on port 8899. Run `pnpm test`, `pnpm run test:audits`, and
`pnpm run test:features`. Set `ATLAS_TEST_URL` for another preview URL.
Browser tests capture runtime errors on every page they open.

Legacy render tools resolve the same Playwright installation (or NODE_PATH)
through `tools/browser.js`. They do not require an /opt installation.
The PR workflow runs these checks; Pages runs them before deployment.

`pnpm run test:handouts` checks PNG export and outside-territory redaction.

`pnpm run test:workspace` checks the campaign desk, portable backups, and native
Foundry journal downloads. `test:workbench` checks atlas saved places/views,
search and recovery. `test:search` covers grouped search, keyboard navigation,
lazy rules loading, retries, and phone/landscape layouts. `test:reader` covers
connected-note previews, outlines, focus, and navigation. `test:panels` checks
the four atlas task views, preserved travel state, and mobile return-to-map.
`test:editor` covers in-site authoring, preview, and draft recovery.
`test:editor-publisher` connects the actual editor and publishing client to a
simulated GitHub service in Chromium. `test:publisher` and `test:editor-publish`
check publication conflicts, recovery, and the auto-merge workflow guards.
These run in CI without publishing real notes or using real credentials.

`test:battlemap-engine` checks deterministic tactical geometry, bounds, and
reachable entrances across layouts, terrain, sizes, and seeds.
`test:battlemap-foundry` checks native scene geometry and the embedded-image
importer's failure, retry, and concurrency behavior. When Foundry v14 is installed,
set `FOUNDRY_APP_PATH` to validate against its document classes in memory.
`test:battlemaps` checks the POI generator in Chromium, including image and native
Foundry downloads, portable recipes, local persistence, and phone layouts.
These tests do not import scenes into a running Foundry world.

`pnpm run test:visual` is an optional local screenshot pass at 375, 768, and
1440 pixels in both themes. Set `ATLAS_SCREENSHOT_DIR` to keep its images outside
the temporary `_site/` build output.
