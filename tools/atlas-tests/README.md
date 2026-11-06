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

`pnpm run test:editor-images` covers image selection and conversion, preview,
alt text, replacement/removal, draft artwork persistence and recovery, storage
failures, and publication through the editor. The publisher and auto-merge
tests also exercise atomic note/artwork commits, immutable image paths,
pending-revision recovery, and rejection of unsafe or unrelated image changes.

`test:battlemap-engine` checks deterministic tactical geometry, bounds, and
reachable entrances across layouts, terrain, sizes, and seeds.
`test:battlemap-foundry` checks native scene geometry and the embedded-image
importer's failure, retry, and concurrency behavior. When Foundry v14 is installed,
set `FOUNDRY_APP_PATH` to validate against its document classes in memory.
`test:battlemaps` checks the POI generator in Chromium, including image and native
Foundry downloads, portable recipes, local persistence, and phone layouts.
These tests do not import scenes into a running Foundry world.

`pnpm run test:session-package` checks the Campaign desk's one-file session export
through the real browser UI. It selects notes, NPCs, and an atlas-generated map;
validates the downloaded package with the shared Foundry contract; and verifies
that map and journal images are embedded. It also covers stable content identity,
prepared-expedition merging and explicit map replacement, journal-only fallback,
reload persistence, corrupt-storage recovery, quota failures, blocked external
artwork, missing-asset retries, and cancellation/navigation during export. Actor
catalog and preset fixtures keep these checks independent of live campaign edits.
Screenshots cover phone and desktop widths in both themes.

The companion importer checks run from the repository root with
`node foundry-module/scripts/test-session-inbox.mjs`. They exercise permissions,
the data contract, missing actors, native validation, image/upload failures,
existing-world-actor preservation, duplicate imports, lost replies, rollback,
and interrupted or concurrent recovery. When Foundry is installed, set
`FOUNDRY_APP_PATH` to its `resources/app` directory for the native schema check;
the standard Windows installation is detected automatically. Tests instantiate
documents in memory and do not write to a Foundry world database. A real-world
smoke test remains separate from these automated checks.

To regenerate the expedition quarry artwork, run this from the repository root:

```sh
node tools/atlas-tests/render-expedition-map.cjs --output foundry-module/assets/maps/expedition-supply-recovery.webp
```

The helper uses the exported recipe and grid from
`foundry-module/scripts/expedition-recovery-scene.mjs`, renders the maintained
Canvas engine in Playwright, and writes only the requested WebP. An explicit
`--output` path is required; choose a path outside the repository for a preview.
It needs no running website or Foundry world. `CHROME_PATH` selects installed
Chrome as in the browser tests above.

`pnpm run test:visual` is an optional local screenshot pass at 375, 768, and
1440 pixels in both themes. Set `ATLAS_SCREENSHOT_DIR` to keep its images outside
the temporary `_site/` build output.
