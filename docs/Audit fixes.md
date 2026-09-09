# Repository and interface audit fixes

Implemented on `audit/repository` for PR #187. The original audit reports remain
as the record of the reviewed revision; their findings describe that earlier build.
No map coordinates, populations, canonical prose, native map bytes or geographic
artwork were changed.

## Repository findings

| Finding | Resolution |
| --- | --- |
| Late note response overwrites another route | Route generation guards cover note success/error and asynchronous trade-map mounting. Detached relation views discard late enrichment. Player document fetches and map mounts also check their generation. |
| Quota errors discard valid network responses | Cache reads and writes are best-effort helpers, independently tested with open and write failures. |
| Origin-wide cache deletion | Each deployment uses a path-specific Saeroth prefix. Cleanup touches only its obsolete versioned caches; persistent notes retain visited rules. Campaign notes refresh on installation. Atlas art invalidates per release to avoid mixed editions. Legacy unnamespaced caches are intentionally not deleted because ownership is ambiguous. |
| Atlas URL loses the current nation | A validated same-origin frame/host message bridge synchronizes selection URLs and internal back navigation. Selection changes do not remount the frame. Session presentation state restores camera and layers after lore visits. |
| Missing CI gates | A locked Node 24 / pnpm test environment runs lint, relation/faith synchronization, build, atlas feature tests and Chromium regression tests on PRs. Pages deployment depends on that same verification workflow. Repository branch-protection settings are not changed. |
| Machine-specific legacy tooling | Shared Playwright resolution with CHROME_PATH override; repo-relative campaign paths; portable file URLs for PDF rendering. The nine trade corridors parse on Windows. |
| Stale documentation | Shared instructions and integration status now describe the published integration, current tools and release process; nation count is 28. Historical verification is explicitly labeled. Removed provinces no longer receive live lore entries. |

## Interface findings

| Finding | Resolution |
| --- | --- |
| Tiny mobile relationship graph labels | Searchable nation buttons and the full relationship ledger are the default phone view. The optional diagram opens at a readable scrollable width. Instructions no longer overlay its nodes. |
| Disappearing atlas shortcuts | Fixed Map/Journey/Place details navigation sits outside the mobile scrolling area, with active state. |
| Search focus escape | Persistent field label, visible close button, inert background, keyboard focus containment, Escape and opener restoration. |
| Light text on light atlas cards | Theme-paired cards and badges, explicit field and hover text; browser-measured light/dark card contrast remains at least 4.5:1. |
| Missing titles and buried facts | Notes without a body H1 get the frontmatter title. Nation capital, government and geography appear in a compact facts panel. |
| Repository prose as homepage | Task links for atlas, nations, diplomacy, trade, history and search lead the homepage; authoring material is retained in a disclosure. |
| Long introductions before tools | Relationship, trade and timeline tools move below the title; longer notes gain section links. |
| Disconnected search | All/Lore/Places/Rules scopes include atlas records and typed results. Map records without dedicated lore are identified as atlas records. The player reader remains separate. |
| Small touch targets | Header, filter, map zoom and tab controls reach 44px minimum; the header wraps at 320px without horizontal overflow. |
| Mobile trade and player maps | Fit, enlargement and zoom-out controls, nation selectors, selected-corridor framing, and an atlas journey handoff. Corridors are explicitly schematic. Player maps keep player-only content and gain keyboard tab navigation. |
| Atlas deep links/state | The host URL follows the current selection; camera and layer state survive lore visits in the session. |
| Setup before exploration | Campaign graph renders immediately; advanced scope options are hidden initially. Atlas Explore/Political/Travel presets precede collapsed layer and tier settings. |

## Verification

Full build passed with 171 campaign notes, 41,718 vault notes and seven player documents.

Review screenshots: [relationships](ui-ux-evidence/fixed-mobile-relations.png) and [trade](ui-ux-evidence/fixed-mobile-trade.png).

- `tools/lint_notes.py`: 171 notes, 1,684 wikilinks; clean.
- Relations: 119 ties across 28 nations; all notes synchronized.
- Faith: 30 deities; nation/deity records synchronized.
- Atlas feature suite: 1,279 settlements, 468 landmarks, 72,755 route nodes and
  134,900 edges retained; tiers, labels, symbols, routing, sailing restrictions,
  waypoints and controls pass.
- Browser suites cover desktop and 390px mobile, both themes, lore round trips,
  retained map counts, all 28 relation/trade anchors and the 3840×2160 player PNG.
- Audit regressions exercise cache open/write failure, owned cleanup, delayed
  routing, URL selection, modal focus, persistent mobile navigation, relationship
  nation search, fitted trade maps and player-map controls.
- Local Chrome screenshots inspected for home, relations, atlas and trade;
  a 320px viewport has no document overflow.

Lore coverage remains deliberately incomplete: most minor settlements and POIs
have no dedicated campaign note. Nation fallback links are labeled; no lore was
invented to make the coverage metric look complete. Advanced diagram exploration
uses horizontal scrolling after enlargement; the nation picker supplies a readable
mobile alternative. This change does not publish the separate ChatGPT-hosted map.
