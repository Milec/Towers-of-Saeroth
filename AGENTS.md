# Towers of Saeroth — shared agent instructions

These instructions apply to Codex, Claude, and other repository agents.
`CLAUDE.md` points here; keep project-wide guidance in this file. Explicit user
instructions take precedence over repository defaults.

## Scope and working style

- Work on a feature branch and open a pull request. Do not merge or deploy
  unless the user has authorized that action. Opening a PR is not permission
  to merge it. The atlas integration is live; new changes stay on their review branch until authorized.
- Check `.github/workflows/pages.yml` before release: relevant pushes to
  `main` deploy GitHub Pages. Leave the separate live ChatGPT atlas unchanged
  unless the user requests changes to that deployment.
- Read only the files needed for the task. Query the rules index rather than
  loading the entire vault, map data, or previous generated artifacts into
  context. Batch related lookups and reuse an existing preview server.
- Distinguish campaign canon, modeled atlas data, and proposed additions.
  Preserve established names, populations, IDs, borders and geography during
  presentation work. Investigate the cause before adding corrective passes.

## Shared skills

Read a skill only when its task applies:

- [pf2e-gm](.claude/skills/pf2e-gm/SKILL.md): PF2e rules lookup, encounters,
  treasure and NPC statistics using the local rules vault.
- [saeroth-prose](.claude/skills/saeroth-prose/SKILL.md): writing or revising
  campaign and player-facing prose. Does not apply to technical documentation,
  UI code, commits, or copied rules in `vault/`.

Claude discovers the canonical skills in `.claude/skills/`. Codex discovers
the small entrypoints in `.agents/skills/`, which load those same canonical
files. Keep scripts and references beside their canonical skill; do not copy
them into both trees. Existing script paths remain valid on both hosts. Use
the available Python 3 executable (`python` or `python3`); do not assume Linux
paths, a preinstalled browser, or a particular global Node installation.

## Sources and architecture

- `campaign/`: maintained campaign canon; `vault/`: copied Archives of Nethys
  reference. Do not rewrite the rules scrape as campaign lore.
- `site/index.html`, `app.js`, `styles.css`: plain-JavaScript wiki/PWA.
  `tools/build_site.py` builds `_site/`, copies raw Markdown, and generates
  indexes. This is an assembly step, not a framework bundle.
- New interactive features belong in `site/` and its navigation unless the
  user requests a standalone artifact. Hash note routes look like
  `#/campaign/nations/Dalstan/Dalstan.md`; use `resolveTarget` for wikilinks.
- `site/atlas/`: maintained Living Atlas renderer, artwork and map records.
  `#/atlas` mounts it through `atlas-host.js` in an isolated same-origin frame.
  Keep wiki and atlas globals separate. `campaign.js` connects selections to
  campaign notes without copying their prose into the renderer.
- `tools/build_atlas_lore.py` rebuilds note links and the **3840×2160** interior nation
  coordinates from the current atlas during every site build. Never replace
  these with the older static map coordinates or scale those old coordinates.
- `atlas-source/` retains the corrected native map, reshaped geography and SVG
  backgrounds. Native Azgaar downloads are retained reference artifacts; the
  retired generator is available in Git history only. Use the maintained
  workflows in [tools/README.md](tools/README.md). Frontier lint constraints
  live in `tools/data/required-borders.json`.
- Read [Living Atlas integration](docs/Living%20Atlas%20integration.md) before
  changing map data or tile generation. Atlas production, population and
  diplomacy are retained snapshots; lore changes do not automatically alter
  the route graph, economy or geography.

## Map and UI invariants

- Keep the southern continent uninhabited; Thurion and Aquoniti are
  archipelagos. Vaelic and Thesal share the mountain frontier at Pilgrim's
  Pass/Stair. Highforge belongs inland in the mountains. Check campaign notes
  and the stored geography before making further territorial changes.
- Label groups render above icons. A disabled component must not leave its
  labels visible. Preserve settlement tier filters, population sizing, major
  landmark prominence, route-aligned bridges/passes and zoom-dependent detail.
- Geography changes require checking route continuity, settlement placement,
  border constraints and regional tiles. Appearance-only work must not move
  map records or change populations. Native `.map` files preserve their bytes.
- Wiki theme additions use tokens in light, explicit dark and automatic dark
  blocks. The atlas has its own illustrated palette and stylesheet.
- Measure touch hit areas in screen pixels. Preserve keyboard navigation,
  visible exits, phone layouts and safe-area handling. Use `--topbar-h`
  instead of guessing the wiki header height.
- The graph renders on demand: call `needsDraw()` after camera changes and
  use `markInteracting()` during panning. Preserve overlay exits and stacking.
- Bump `site/sw.js`'s `VERSION` when preparing changed site/content for release.
  Cache atlas assets and tiles on demand; do not precache the entire atlas or
  rules vault. Missing offline images/scripts must not receive wiki HTML.

## Campaign authoring and synchronization

- Read `campaign/README.md` for filing conventions, and the prose skill before
  editing campaign/player prose. One subject per file; frontmatter includes
  `title` and `type`; filenames match titles. Nation-owned notes live beneath
  that nation's folder. Link a new note from a relevant existing note.
- Use short `[[Wikilinks]]` to campaign notes, never split across lines. Avoid
  aliased wikilinks inside Markdown table cells, where `|` splits the cell.
  Do not link campaign prose into the rules vault. Keep index notes focused on
  their immediate subjects rather than adding redundant links everywhere.
- Political Relations is authoritative for diplomatic prose. After editing
  its table, run `python tools/sync_relations.py`, then `--check`. Each row's
  first sentence must stand alone because nation notes display that gist.
- Nation Faith bullets own worship data. After changing them, run
  `python tools/sync_faith.py`, then `--check`.
- For statblocks/action syntax and handout constraints, read
  [Campaign authoring reference](docs/Campaign%20authoring%20reference.md).
- `players/` is deliberately separate, hand-written player material; the
  service worker bypasses its subtree. Never automatically copy campaign GM
  information into it. The main Pages site is not an access-control boundary.
  Browser print exports the displayed note including GM sections; redacted
  handouts use `tools/make_handout.py` and its removal checks.

## Verification

- Campaign prose: `python tools/lint_notes.py` plus the prose checker for
  changed notes. Prose metrics are advisory, not quotas or grounds to invent
  facts. Run relevant sync checks after relationship/faith changes.
- Site changes: `python tools/build_site.py --no-vault` for iteration; use the
  full build for changes affecting vault indexing or final integration checks.
  Wait for the build to finish before testing against `_site/`.
- Atlas changes: install locked test dependencies with `pnpm install --frozen-lockfile` in `tools/atlas-tests/`, then run
  `pnpm run test:features`. Serve `_site/` on one available local port and run
  `pnpm test` there for browser checks. `ATLAS_TEST_URL` selects the server;
  `CHROME_PATH` selects installed Chrome, or install Playwright Chromium.
- For changed UI behavior inspect desktop and phone layouts, both wiki themes,
  and browser errors. Reuse the server and stop it when finished. Do not claim
  real-browser verification if only structural tests ran.
- Do not rerun expensive rendering/browser checks for instruction-only or
  wording-only edits. Run changed scripts and check affected paths instead.
- Report what passed and any remaining limitation; do not infer that a clean
  build proves geography, privacy, or runtime behavior.
