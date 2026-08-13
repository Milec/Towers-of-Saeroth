# Campaign Notes

Your worldbuilding lives here. Suggested layout — reorganize freely, the pf2e-gm
skill doesn't care where things live, only the `vault/` and `.claude/` paths at
the repo root matter to it.

- `npcs/` — one file per NPC: identity, wants, stat block reference
- `locations/` — settlements, dungeons, regions
- `factions/<Nation>/` — organizations, their goals and tensions, filed in a
  subfolder per parent nation (e.g. `factions/Vaelic/House Dravensk.md`).
  Factions that genuinely span nations can sit loose at the `factions/` root
- `nations/` — sovereign nations and empires: government, culture, military,
  economy; see [[Nations of the World]] for the full list
- `deities/` — gods actually worshipped in the setting, copied out of `vault/`
  so this folder stands alone as an Obsidian vault; see [[Gods of the World]]
- `ancestries/` — the peoples of the setting: culture, appearance and outlook,
  no mechanics; see [[Peoples of the World]]

## This folder is the Obsidian vault

Obsidian opens `campaign/`, not the repo root — `vault/` is far too large to
index. So **every `[[wikilink]]` in here must resolve inside `campaign/`**. A
link like `[[Setting/Deities/Nethys]]` or `[[Ancestries/Human (Player Core)]]`
points above the vault root and silently resolves to nothing.

When a note needs a rules reference, copy the flavour into `campaign/` and cite
the source as plain text at the bottom (`` *Full entry: `vault/...`* ``) rather
than linking to it.
- `sessions/` — session logs / prep notes, one per session
- `pcs/` — player character summaries, for hooks and continuity

## Note format

See the repo's `CLAUDE.md` for the Obsidian note format Claude follows when
writing here — frontmatter, `[[wikilinks]]`, one subject per file. Open this
repo as an Obsidian vault and `campaign/` and `vault/` link naturally, since
both follow the same convention.
