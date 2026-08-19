# Towers of Saeroth

Private PF2e worldbuilding vault. `campaign/` is the user's own notes;
`vault/` is the Archives of Nethys reference synced from
[Milec/AON-Scrap](https://github.com/Milec/AON-Scrap); `.claude/skills/pf2e-gm/`
queries that reference for encounters, rules, treasure, shops, and NPCs.

## This repo publishes a website — read this before building anything visual

`site/` is a self-contained PWA that renders the whole vault, and
`.github/workflows/pages.yml` deploys it to **GitHub Pages** on every push to
`main` touching `campaign/`, `vault/`, `site/` or the build script. It is live
at <https://milec.github.io/Towers-of-Saeroth/>, and the user has it installed
to their phone's home screen.

**So anything visual, interactive, or presentational belongs in `site/`** — not
in a standalone HTML file, and not in a published Claude artifact. A chart, a
map, a timeline, a relationship web, a random-table roller: all of it goes into
the app, where it inherits the parchment theme, the router, offline caching,
and links to the notes it describes. An artifact is a dead end by comparison —
separate URL, no wikilinks, no offline, and stale the moment a note changes.
Only reach for one if the user explicitly asks for something outside the site.

How the app is put together:

- `site/index.html` + `app.js` + `styles.css` — no framework, no build step and
  no dependencies beyond a vendored `marked.min.js`. Plain, unbundled JS.
- `tools/build_site.py` assembles `_site/`: it copies `site/`, copies the notes
  to `_site/content/` as **raw markdown**, and writes the search and link
  indexes. Nothing is pre-rendered — the browser parses the markdown, which is
  what keeps the deployed site about the same size as the repo.
- Notes are addressed by hash route: `#/campaign/nations/Dalstan/Dalstan.md`.
  Use `resolveTarget(name)` to turn a bare note name into its path rather than
  hardcoding one; it resolves by filename the way Obsidian does.
- Theme is entirely CSS custom properties on `:root`, declared three times
  over: bare `:root` (light), `:root[data-theme="dark"]`, and
  `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`. Add a
  new colour as a token in **all three** blocks, never as a literal in a rule.
- Bump `VERSION` in `site/sw.js` when the app shell changes, or returning
  visitors keep serving the cached one.
- The graph view draws **on demand**, not on a permanent `requestAnimationFrame`
  loop: `tick()` runs only while the layout is still settling, and everything
  else calls `needsDraw()`. Any new interaction that moves the camera or changes
  what is drawn has to call it, or the canvas will simply not update. Panning a
  vault-scale graph also drops to sampled edges via `markInteracting()`, because
  a full redraw at 457,000 edges is ~200ms; that flag restores itself on a
  timer, so never set `graph.interacting` directly.
- The graph is a full-screen overlay at `z-index: 40`, so anything that must
  appear over it needs to clear that: the sidebar and its scrim sit at 50/48,
  and the tree gets `.over` so the menu button behaves the same at every width.
  Keep at least one exit from the graph visible on the canvas itself — the
  options panel auto-collapses on a phone, taking its own close button with it.
- Never hardcode the topbar's height. Installed to an iOS home screen it grows
  by `env(safe-area-inset-top)`; `--topbar-h` is remeasured from the live
  element by `syncTopbarHeight()`, and the sidebar, scrim and graph overlay are
  all positioned from it.

**Lint the notes before committing.** `tools/lint_notes.py` checks only the
conventions that fail *silently* — where the build succeeds, the site renders,
and the note simply says something untrue:

```
python3 tools/lint_notes.py       # exits non-zero on any problem
```

It catches wikilinks split across a line break (**not** a broken link — not a
link at all, and invisible to every other check), wikilinks resolving to no
note, a filename that has drifted from its own title, and a **Territorial** tie
between nations `tools/mapgen/world.js` never requires a border for. That last
one is how Thurigypt was found sitting on the wrong continent from the nations
its own notes tie it to.

**Test in a real browser before committing.** There is no test suite, and a
silent JS error just leaves a blank note body:

```
python3 tools/build_site.py --no-vault      # skips the 41k-note reference
python3 -m http.server 8899 -d _site
```

Then drive it with Playwright — Chromium is preinstalled, and the module lives
at `/opt/node22/lib/node_modules/playwright`. Watch the console for errors and
check both themes plus a phone-sized viewport. `window.__g` (graph view) and
`window.__rel` (relations web) are exposed for exactly this.

### Rendering a note as something other than prose

A note opts into a custom view with a `view:` field in its frontmatter, which
`route()` dispatches on: `view: relations` on
`campaign/nations/Political Relations.md` turns that note's markdown table into
an interactive force-directed web of the nations.

The rule that makes this worth doing: **the markdown stays the single source of
truth.** The view parses the note's *own table* instead of carrying a second
copy of the data, so the note still reads correctly in Obsidian and on GitHub,
and adding a row to the table adds an edge to the web with no code change.
Follow that pattern for any new view — never duplicate campaign data into JS.

## Changing the political relations

The diplomacy exists in three places at once, and **all three move together or
the vault starts lying about itself**:

1. the table in `campaign/nations/Political Relations.md`,
2. the **Relations** bullet on each of the 28 `campaign/nations/<Nation>/<Nation>.md` notes,
3. the relations web on the site, which is drawn from that table.

The table is the source of truth. Its own first line claims the relationships
are "drawn from the Relations bullet on each nation's own note", which is only
true if the notes actually agree with it — so never hand-edit a nation's
Relations bullet, and never add a row to the table and stop there.

**The workflow, every time:**

```
# 1. edit the table in campaign/nations/Political Relations.md
# 2. push it out to all 28 nation notes
python3 tools/sync_relations.py

# 3. rebuild and look at the web in a real browser
python3 tools/build_site.py --no-vault && python3 -m http.server 8899 -d _site
```

`sync_relations.py` rewrites every nation's Relations bullet from the table,
and refuses to run if the table is malformed: an unknown standing, a duplicate
pair, a nation with no folder, a nation related to itself. The unknown-standing
check matters most because that failure is otherwise **silent** — the view
skips rows whose standing it doesn't recognise, so the tie would just quietly
vanish from the web. `--check` verifies without writing and exits non-zero on
drift, which is the fast way to confirm nothing has slipped.

**Then actually look at the graph.** Density is not free: going from 32 ties to
69 made the springs overwhelm repulsion and nodes started overlapping. Load the
note, and check `window.__rel` — if

```js
// smallest gap between any two node edges; must stay comfortably positive
Math.min(...__rel.nodes.flatMap((a,i) => __rel.nodes.slice(i+1).map(b =>
  Math.hypot(a.x-b.x, a.y-b.y) - a.r - b.r)))
```

is near zero or negative, retune `RSIM`/`REST` in `app.js` rather than shipping
a knot. Check the standing filters still isolate cleanly, and check a
phone-sized viewport.

**Adding a new standing** touches four places, and missing any one of them
breaks it quietly: `STANDINGS`, `DASH`, `STROKE` and `REST` in `site/app.js`;
the `--rel-*` token in **all three** `:root` blocks plus the `.rel-edge.s-*`
and `.rel-tag.s-*` rules in `site/styles.css`; the legend table in the note;
and the new colour needs validating rather than eyeballing — eight standings is
far past what hue alone separates, which is why dash pattern and stroke weight
carry the identity and colour is only the last cue.

## Pull request workflow

Claude pushes changes on a feature branch and opens a PR rather than
committing straight to `main` — but the user shouldn't have to ask for a
merge every time. GitHub's own auto-merge is not available here (private
repo on a plan that doesn't include it — the "Allow auto-merge" repo
setting is permanently greyed out), so don't bother calling
`enable_pr_auto_merge` or waiting on it.

Instead: **immediately after opening a PR here, merge it directly** (squash)
without waiting for the user to say "merge it." The repo has no CI and no
required reviewers, so there's nothing a real auto-merge would have waited
on anyway — a direct merge right after opening achieves the same "it just
landed" result. This applies to every PR going forward, not just ones for
worldbuilding notes.

## Writing worldbuilding notes

Whenever you create or edit a note under `campaign/`, write it as
Obsidian-flavoured markdown, matching the convention already used throughout
`vault/`. **The site is what actually reads these notes** — it renders the raw
markdown, so what you write is what it shows — and the format stays
Obsidian-flavoured because that is what `vault/` uses and what still opens
correctly on GitHub:

- **One subject per file.** An NPC, a location, a faction — not a folder of
  prose covering several.
- **YAML frontmatter at the top**, at minimum `title` and `type` (`npc`,
  `location`, `faction`, `session`, `pc`), plus whatever structured fields are
  actually known — a stat block reference, a level, a settlement's region, a
  faction's goal. Skip fields with nothing to say rather than leaving them
  blank.
- **`[[Wikilinks]]`** for every cross-reference between campaign notes — an
  NPC to their faction, a faction to its nation, a nation to its patron
  deity. A plain prose mention doesn't link back to anything; a wikilink
  does, which is the whole point of a vault.
- **Never let a `[[wikilink]]` wrap across a line break.** Wikilinks are
  tokenised within a single line, so `[[Thornwild\nConfederation]]`
  is not a broken link — it is not a link at all, and renders as literal
  bracketed text. It shows up in no broken-link check because nothing ever
  parsed it. When reflowing a paragraph to 80 columns, break *before* the link
  rather than inside it.
- **An index note links to what it indexes, and nothing else.**
  `Gods of the World.md` links the gods; `Peoples of the World.md` links the
  ancestries; `Nations of the World.md` links the nations. When such a table
  has a second column — which nations worship this god, where this ancestry is
  found — **write those as plain text, not wikilinks.** They are already linked
  from both ends (the deity note's Worship bullet and the nation's Faith
  bullet), so linking them again adds no reachable information and wires the
  index into half the vault: those two tables alone were 40 duplicate edges,
  and made the two indexes the busiest nodes in the graph by a wide margin.
  The general rule is that a hub should be one hop from its subjects, not one
  hop from everything its subjects mention.
- **Don't link into `vault/` from a campaign note.** The site *will* resolve
  `[[Setting/Deities/Sarenrae]]` — `resolveTarget` tries the `vault/` root
  after `campaign/` — so this is a convention, not a broken link. It is still
  the convention: such a link drags the 41,000-note index into a page that
  didn't need it, puts campaign notes one hop from a 457,000-link graph, and
  is dead in Obsidian, which opens `campaign/` as its root and cannot see
  above it. Instead: copy the flavour into `campaign/` (see
  `campaign/world/deities/` and `campaign/world/ancestries/` for the pattern),
  link that local note, and cite the rules source as plain text at the bottom —
  `` *Full entry: `vault/Ancestries/Kholo.md` — Player Core 2 pg. 16* ``.
  Campaign notes keep short filenames with no source suffix (`Human.md`, not
  `Human (Player Core).md`).
- **A short body**, not a wall of text: a paragraph or two, then bullet facts.
  Long narrative belongs in `sessions/`, not baked into an NPC or location
  note.
- **Filenames match the title** (`Harbormaster Corwin Ledd.md`, not
  `npc_corrupt_harbormaster_final.md`), so wikilinks stay short and readable.
- **Anything belonging to one nation lives in that nation's folder.** The
  layout is nation-first: `campaign/nations/<Nation>/` holds the nation note
  itself plus `factions/`, `locations/` and `npcs/` subfolders — so
  `campaign/nations/Vaelic Principality/factions/House Dravensk.md`. Only
  things that genuinely span nations go in the top-level `campaign/factions/`,
  `npcs/` or `locations/`; setting-wide reference (deities, ancestries,
  planes, world history) goes under `campaign/world/`. Create the folders if
  they don't exist. **`campaign/README.md` has the full tree — read it before
  adding a new kind of note.**
- Wikilinks resolve **by filename, not path**, so keep them short
  (`[[House Dravensk]]`) no matter how deeply nested the note is. Never put a
  folder path in a link, and don't update links when moving notes.

The aim is a note that's actually usable at the table and that the site's
graph view renders as a real web of connections — not a document dump.

See `campaign/README.md` for the suggested folder layout.

## The world map

`campaign/Saeroth.map` is the world of Saeroth as an Azgaar Fantasy Map
Generator file — 28 nations laid out to match the notes, not rolled at random.
It is **generated**, not hand-drawn: `tools/mapgen/` builds it, and
`tools/mapgen/world.js` is the campaign's own facts as data (each nation's
latitude, climate, size weight, required borders, capital name from its note,
and trade specialties from its Economic Specialties bullet).

**So when a nation note changes, the map does not follow on its own.** Edit
`world.js` to match, rebuild, and check the diagnostics — the same way
`sync_relations.py` keeps the diplomacy from drifting.

`docs/azgaar-map-generation.md` is the manual for all of this: how to drive
Azgaar from a script, its pipeline order, and the traps. Read it before
touching `forge.js` — several of its rules look arbitrary and are not, and the
doc records which plausible-sounding fixes have already been tried and failed.
`tools/mapgen/README.md` covers running it and reading the output.

Two things worth knowing before changing anything there:

- **Sweep seeds, don't tune parameters.** Most remaining defects are
  seed-dependent. Rank a dozen seeds on continent coherence first — every other
  metric is per-nation, and a country stranded alone on an island scores
  perfectly on all of them.
- **Don't add a correction pass without checking what created the problem.**
  Three passes once existed only to repair damage from a single line capping
  territory growth; deleting that line deleted all three and improved the map.

## Formatting statblocks

Two community-plugin syntaxes are used whenever a note contains a creature or
NPC statblock (a built NPC, a reskinned monster, a boss write-up) — not just
links to one. **The site implements both natively**, so these render wherever
the notes are read; the plugin links below are the syntax reference:

- **[PF2e Statblocks](https://github.com/pixley/pf2e-statblock-for-obsidian)**
  — wrap the whole statblock in a `pf2e-stats` codeblock:

  ````
  ```pf2e-stats
  # Meret Duskveil
  ## Creature 8

  ---

  ==Unique== ==Medium== ==Human== ==Humanoid==

  **Perception** +16

  **Skills** Acrobatics +17, Stealth +19, Thievery +15

  ---

  **AC** 26; **Fort** +12, **Ref** +19, **Will** +14

  **HP** 130

  **Nimble Dodge** `[reaction]` **Trigger** Meret is targeted with an attack
  by a creature they can see; **Effect** +2 circumstance bonus to AC.

  ---

  **Speed** 25 feet

  **Melee** `[one-action]` rapier +20 (deadly d8, finesse, magical),
  **Damage** 1d6+9 piercing

  **Warp Path** `[one-action]` ([[Traits/Teleportation]]) **Requirements**
  Veiled; **Effect** Teleports up to 30 feet, then Strikes.
  ```
  ````

  Name is an H1 (`#`), the level/type line is an H2 (`##`), traits are
  wrapped in `==double equals==`. `---` breaks the block into its
  conventional sections. Two consecutive line breaks reset indentation; tab
  indentation nests content under the line above.

- **[Pathfinder 2E Action Icons](https://github.com/thiagocoutinhor/pf2-action-icons)**
  — inline action costs in ordinary note prose (tactics write-ups, session
  notes, a location's description of a trap), as inline code:
  `` `pf2:1` `` (action), `` `pf2:2` `` (two actions), `` `pf2:3` ``
  (three actions), `` `pf2:0` `` (free action), `` `pf2:r` `` (reaction).

### Which action syntax where

The two syntaxes use **different, non-interchangeable codes**, and the site
implements them separately just as the plugins do:

| Context | Syntax |
| --- | --- |
| Inside a `pf2e-stats` codeblock | `` `[one-action]` ``, `` `[two-actions]` ``, `` `[three-actions]` ``, `` `[free-action]` ``, `` `[reaction]` `` |
| Ordinary note prose, outside a statblock | `` `pf2:1` ``, `` `pf2:2` ``, `` `pf2:3` ``, `` `pf2:0` ``, `` `pf2:r` `` |

Both require the backticks — bare `[one-action]` renders as literal text.

### Pulling creatures out of `vault/`

`vault/` is a raw Archives of Nethys scrape and uses **neither** plugin's
syntax: it writes action costs as prose ("two actions", "single action") and
emits bare, un-backticked `[one-action]` in Strike lines. The `pf2e-gm` skill
scripts echo that same raw formatting. So a creature copied out of `vault/`
or off a `brief`/`show`/`npc.py` call is *not* already formatted — converting
it is the job:

- Wrap the block in `pf2e-stats`, name to H1, `## Creature 8` to H2.
- Convert the trait list to `==Medium== ==Human== ==Humanoid==`.
- Replace every prose action cost and bare `[one-action]` with the
  backticked `` `[one-action]` `` form.
- Tab-indent degrees of success (`**Critical Success**`, `**Success**`, …)
  beneath their ability.
- **Strip the AON `[[Wikilinks]]` on traits, spells and abilities to plain
  text.** They point into `vault/` (see the wikilink rule above), and a
  statblock is the last place that should be dragging in the rules index on
  every trait. Weapon
  traits read fine unlinked — `(sweep, versatile P)` — which is how AON
  prints them anyway. Only link out to a note that exists inside
  `campaign/`.

Use `sf2e-stats` instead of `pf2e-stats` only for Starfinder 2e content. For
abbreviated blocks (a one-line NPC blurb) the plugin wants traits as an H3
(`###`) line rather than `==wrapped==`.

### Rendering

The site renders both syntaxes as inline SVG rather than an icon font, which
fixes the one real problem the Obsidian plugins have: on iOS their embedded font
overlaps the word after each action glyph, sometimes eating its first letter.
Nothing about the authoring syntax changes — write the documented forms above
and they render correctly everywhere the notes are read.

If a note is also opened in Obsidian, both plugins must be installed there, and
the `` `pf2:N` `` codes only render in Reading view on mobile. That is an
Obsidian limitation, not a reason to write the markup differently.
