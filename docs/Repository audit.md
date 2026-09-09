# Repository audit

Implementation follow-up: [Audit fixes](Audit%20fixes.md) records the corrections and regression checks for PR #187. The findings below describe the original audited revision.

Audited published commit `82db15aead71ce4b1853758814053631ac0253ca`.
Scope: application, Living Atlas, player site, campaign consistency, build and
release workflow, shared agent guidance, and supporting tools. The PF2e vault
contents were excluded from manual review. This is a code and behavior audit,
not a penetration test or a complete scientific validation of world geography.

## Result

The campaign and current map records passed the checks below. Seven actionable
issues remain, chiefly in navigation, offline behavior and release safeguards.
No critical defect was demonstrated. The reported atlas text-contrast issue
was reproduced from the stylesheet and fixed in this audit branch; the other
findings are recommendations, not changes made silently during review.

## Fixed: light text on pale atlas cards

The integrated dark theme changed the inherited foreground while `.stat` and
`.pill` retained their hardcoded light backgrounds. Both now use paired theme
colors. Placeholder text, tier explanations and hover/selected controls were
also adjusted. The browser suite now checks actual computed contrast on nation
statistics and biome badges at desktop and mobile sizes in both themes; all
tested cards meet a 4.5:1 minimum. Journey summaries reuse the same `.stat`
component. This is targeted contrast coverage, not a claim that every pixel
and every state has been accessibility-certified.

Files: `site/atlas/style.css`, `site/sw.js`,
`tools/atlas-tests/browser.cjs`. Publication requires merging this branch.

## Findings, ordered by recommended repair priority

### 1. P2 — an old note request can overwrite a newer route

**Evidence:** `site/app.js:329–385` awaits `fetchNote(target)` and then writes
to the shared content element without checking whether that route is still
current. In a real Chrome test, delaying Dalstan's note, navigating to
`#/atlas`, and releasing the delayed request removed the atlas and displayed
Dalstan while the URL still read `#/atlas`.

**Impact:** slow networks and fast navigation can show the wrong content or
make the map disappear. The error handler can also overwrite newer content.

**Fix:** give each navigation a generation ID or abort controller; check it
before all asynchronous success/error DOM writes and custom-view mounting.
Add a deliberately delayed-request browser regression.

### 2. P2 — a full browser cache turns successful downloads into failures

**Evidence:** `site/sw.js:76–87` puts `fetch()` and `await cache.put()` in one
try/catch. A deterministic worker test supplied a successful HTTP 200 response
and made `cache.put()` throw `QuotaExceededError`. The worker returned HTTP
503, "Atlas asset unavailable offline", instead of the downloaded content.

**Impact:** images, scripts or tiles can disappear despite a working network,
especially on storage-constrained phones. Failure to open the cache is also
outside the network fallback.

**Fix:** make cache access best-effort and independent of delivering a valid
network response. Test cache-open and cache-write failures separately.

### 3. P2 — cache cleanup is not scoped to this application

**Evidence:** `site/sw.js:33–38` deletes every origin cache whose name does not
end with this app's current version. A worker test seeded `other-app-cache`,
`atlas-v119` and `shell-v120`; activation deleted the first two. CacheStorage
is shared by origin, not partitioned by service-worker path.

**Impact:** another app under the same GitHub Pages host can lose offline data.
This application's visited rules and regions also disappear on each version
bump; the README's promise that previously opened pages stay cached needs
qualification or an explicit migration policy.

**Fix:** use a repository-specific cache prefix, remove only owned caches,
and define which visited content survives updates. Test unrelated cache names.

### 4. P2 — the page URL does not follow atlas selections

**Evidence:** `site/atlas/app.js:54` updates history inside the iframe;
`site/atlas-host.js` provides no selection-to-parent synchronization. Opening
`#/atlas#nation-3`, selecting Quivar, and reloading showed Vaelic again.
The inner URL was `#nation-8`, but the shareable parent URL stayed on nation 3.

**Impact:** copying a link, refreshing, or reopening the installed app can
return to the wrong place. Map navigation and the wiki's back trail diverge.

**Fix:** add a narrowly validated selection event between the atlas and host,
update the parent fragment without remounting the map, and test copied URLs,
refresh and back/forward behavior. Decide separately whether camera/filter
state should be encoded or saved locally.

### 5. P2 — deployment does not run the available quality checks

**Evidence:** `.github/workflows/pages.yml` runs the site assembly and deploys
on relevant pushes to main. It runs neither note/synchronization checks nor
the atlas/browser tests, and there is no pull-request validation workflow.
The existing build can pass even when findings 1–4 are present.

**Impact:** a merged change can publish broken behavior or inconsistent lore
without a failed check. Manual testing is the only current safeguard.

**Fix:** add PR validation for note lint/synchronization, build, feature tests
and focused browser tests. Make required checks a repository-setting decision;
do not assume creating a workflow alone enforces branch protection. Record a
test dependency lockfile and supported Node version for reproducibility.

### 6. P2 — legacy map/export tools still depend on another machine

**Evidence:** `tools/mapgen/app.js:19`, `tools/rasterize.js:3`, and
`tools/topdf.js:3` require Playwright from `/opt/node22/...`.
`tools/mapgen/journeys.js:43`, `build.js:93` and `verify.js:11` use
`/home/user/Towers-of-Saeroth/...`. Calling `readCorridors()` on this checkout
failed with ENOENT for `C:\home\user\Towers-of-Saeroth\campaign\world\Trade Routes.md`.

**Impact:** documented legacy Azgaar and export workflows cannot be used
unchanged on Windows or a differently located Linux checkout. The current
Living Atlas site build is unaffected.

**Fix:** resolve repo files from module locations, declare local dependencies,
and share configurable browser discovery. Keep legacy versus current-map
workflows explicitly separated; do not regenerate the living map through the
legacy toolchain as an incidental repair.

### 7. P3 — guidance and audit artifacts still contradict the live state

**Evidence:** `AGENTS.md:11` says the integration is unpublished;
`docs/Living Atlas integration.md:62` says the branch is for review;
`README.md:10` says 21 nation notes although there are 28.
`site/atlas/verification.json:63` says browser QA was not completed, despite
the browser checks that now run. Legacy renderer comments still describe the
old map-backdrop pipeline rather than the current build-time coordinates.

**Impact:** future agents can select obsolete workflows or mistake historical
verification results for checks of current code.

**Fix:** remove transient release status from permanent instructions, mark
historical reports with their source revision, and generate current counts
and test results rather than treating handwritten flags as live verification.

## Coverage gaps and maintenance observations

- Lore linking is partial by design: all 28 nations resolve directly, but
  only one of 1,279 settlements has a direct note match; 1,263 fall back to
  nation lore and 15 unclaimed settlements have no link. Of 468 POIs, one
  resolves directly, one has an explicit source-note fallback, and 466 have
  no note. Do not describe this as full landmark-level campaign integration.
- The link builder includes three removed provinces (130 province records in
  its index versus 127 active provinces). Filter removed records before
  extending province navigation or advertising the generated index as active
  map coverage.
- The browser suite captures runtime errors on its first two pages, but not
  the later relations/trade/player page. Clicking the theme button twice was
  not itself a visual or contrast assertion; this branch adds targeted card
  contrast checks, while broader theme/state coverage remains useful.
- The current map data, routing graph, static exports, and legacy native maps
  are separate retained artifacts. The site build is reproducible from those
  committed inputs, but is not a complete generator of updated geography,
  trade models or static illustrated exports from campaign prose.
- Tracked files outside the PF2e vault total roughly 202 MB: about 98 MB is
  site content and 83 MB is editable atlas source. These are real assets,
  not all junk. Cleanup should use reference/derivation checks before removing
  artwork or native maps. Regional loading limits initial transfer, not total
  repository or offline-cache size.
- Main campaign content is publicly served. The separate players site is a
  presentation boundary, not authentication. That is the documented project
  choice, not a newly discovered security boundary failure.

## Checks that passed

- Campaign lint: 171 notes and 1,684 wikilinks; all checked conventions clean.
- Political synchronization: 119 ties across 28 nations match their notes.
- Faith synchronization: 30 deity notes agree with nation faith declarations.
- Campaign-only build; no manual reading of the PF2e source corpus.
- Existing feature regression: settlement/POI sizing, layers, labels, artwork
  alignment, route graph, sailing restrictions, waypoints and regional tiles.
- Real Chrome at phone and desktop dimensions: wiki/atlas/lore round trips,
  full-width layout, relation/trade node coordinates, player PNG dimensions,
  and the new light/dark card-contrast checks.
- Stored geography against current map records: zero settlements on water,
  zero settlement state/cell ownership mismatches, and finite settlement and
  route coordinates. Highforge is on a land cell and marked underground.
- 28 capital names checked against nation notes: the apparent Tal Ulad
  difference is the documented moving seasonal seat, not an automatic rename.
- A limited tracked-text credential-pattern scan found no high-confidence
  GitHub token/private-key matches. This does not establish absence of every
  secret type or replace a dedicated secret scanner.

Recommended next pass: navigation race, cache fallback/isolation, selection
URL synchronization, then CI and portable tooling. Preserve the passing map
records while fixing these application-level issues.
