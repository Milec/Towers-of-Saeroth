# Towers of Saeroth

PF2e worldbuilding vault, readable as a website and installable as an app.

- `campaign/` — the worldbuilding: nations, factions, NPCs, deities, ancestries
- `vault/` — the full Archives of Nethys reference (41,700+ notes), from
  [Milec/AON-Scrap](https://github.com/Milec/AON-Scrap)
- `site/` — the web app that browses both (see below)
- `tools/` — the static-site build, and `sync_relations.py`, which pushes the
  Political Relations table out to all 21 nation notes so the two can't drift
- `.claude/skills/pf2e-gm/` — a Claude Code skill that queries the reference:
  encounter building, rules lookup, treasure, shops, NPC stat blocks

## The web app

Every push to `main` deploys the whole repo to GitHub Pages as a browsable,
installable site — no Obsidian download needed:
**<https://milec.github.io/Towers-of-Saeroth/>**

- **Wikilinks work**, resolved by filename the way Obsidian does, including
  `[[Note|alias]]` and `[[Note#heading]]`.
- **Both PF2e Obsidian plugins are reimplemented natively**: ` ```pf2e-stats `
  blocks render as proper statblocks with coloured trait pills, and action
  costs render in both syntaxes — `` `[one-action]` `` inside statblocks and
  `` `pf2:1` `` in prose. The icons are inline SVG rather than an icon font, so
  they don't overlap adjacent text on iOS the way the Obsidian plugin does.
- **Installable PWA.** All of `campaign/` is precached, so the worldbuilding
  works fully offline; the 41k-note rules vault is fetched on demand and any
  page you've opened stays cached.
- **Graph view** like Obsidian's, with a twist: you pick which folders to
  include *before* it renders, with live node and link counts. The full vault
  is 41,718 notes and 457,000 links — unrenderable as one graph — so the vault
  is opt-in folder by folder.
- **Notes can render as something other than prose.** A `view:` field in a
  note's frontmatter picks a custom view: `view: relations` redraws
  *Political Relations* as an interactive web of the nations — filter by
  standing, tap a nation for its ledger, drag to untangle, tap through to its
  note. It parses the note's own markdown table, so the table stays the single
  source of truth and a new row becomes a new edge with no code change.
- **The whole vault is browsable** in the file tree, which loads lazily: only
  the folder you expand is put in the DOM.
- Full-text search across `campaign/`, title search across `vault/`, backlinks,
  and a light/dark theme.

Build it locally with `python3 tools/build_site.py && python3 -m http.server -d _site`.
Pass `--no-vault` to skip the rules reference for a much faster build.

Open this repo in Claude Code (mobile, desktop, or web) and the skill loads
automatically — ask for encounters, rules answers, treasure, or NPCs in plain
language, no commands needed.

See `vault/LICENSE-AND-ATTRIBUTION.md` for the reference material's licensing.
