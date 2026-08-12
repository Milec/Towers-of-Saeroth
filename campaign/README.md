# Campaign Notes

Your worldbuilding lives here. Suggested layout — reorganize freely, the pf2e-gm
skill doesn't care where things live, only the `vault/` and `.claude/` paths at
the repo root matter to it.

- `npcs/` — one file per NPC: identity, wants, stat block reference
- `locations/` — settlements, dungeons, regions
- `factions/` — organizations, their goals and tensions
- `sessions/` — session logs / prep notes, one per session
- `pcs/` — player character summaries, for hooks and continuity

## Note format

Whenever Claude creates or edits worldbuilding content here, it writes notes as
Obsidian-flavoured markdown, matching the convention already used in `vault/`:

- **One subject per file.** An NPC, a location, a faction — not a folder of
  prose covering several.
- **YAML frontmatter at the top**, at minimum `title` and `type` (`npc`,
  `location`, `faction`, `session`, `pc`), plus whatever structured fields
  are actually known — a stat block reference, a level, a settlement's region,
  a faction's goal. Skip fields with nothing to say rather than leaving them
  blank.
- **`[[Wikilinks]]`** for every cross-reference — to other campaign notes and to
  `vault/` entries alike (e.g. `[[Bestiary/Fence]]` when an NPC is statted as a
  published creature, `[[Setting/Deities/Sarenrae]]` for a cleric's patron).
  Plain prose mentions don't link back to anything; wikilinks do, which is the
  whole point of a vault.
- **A short body**, not a wall of text: a paragraph or two, then bullet facts.
  Long narrative belongs in `sessions/`, not baked into an NPC or location note.
- **Filenames match the title** (`Harbormaster Corwin Ledd.md`, not
  `npc_corrupt_harbormaster_final.md`), so wikilinks stay short and readable.

The aim is a note that's actually usable at the table and that Obsidian's graph
view renders as a real web of connections — not a document dump. Open this repo
as an Obsidian vault and `campaign/` and `vault/` link naturally, since both
follow the same convention.
