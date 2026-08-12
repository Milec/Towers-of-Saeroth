# Towers of Saeroth

Private PF2e worldbuilding vault. `campaign/` is the user's own notes;
`vault/` is the Archives of Nethys reference synced from
[Milec/AON-Scrap](https://github.com/Milec/AON-Scrap); `.claude/skills/pf2e-gm/`
queries that reference for encounters, rules, treasure, shops, and NPCs.

## Writing worldbuilding notes

Whenever you create or edit a note under `campaign/`, write it as
Obsidian-flavoured markdown, matching the convention already used throughout
`vault/`:

- **One subject per file.** An NPC, a location, a faction — not a folder of
  prose covering several.
- **YAML frontmatter at the top**, at minimum `title` and `type` (`npc`,
  `location`, `faction`, `session`, `pc`), plus whatever structured fields are
  actually known — a stat block reference, a level, a settlement's region, a
  faction's goal. Skip fields with nothing to say rather than leaving them
  blank.
- **`[[Wikilinks]]`** for every cross-reference — to other campaign notes and
  to `vault/` entries alike (e.g. `[[Bestiary/Fence]]` when an NPC is statted
  as a published creature, `[[Setting/Deities/Sarenrae]]` for a cleric's
  patron). A plain prose mention doesn't link back to anything; a wikilink
  does, which is the whole point of a vault.
- **A short body**, not a wall of text: a paragraph or two, then bullet facts.
  Long narrative belongs in `sessions/`, not baked into an NPC or location
  note.
- **Filenames match the title** (`Harbormaster Corwin Ledd.md`, not
  `npc_corrupt_harbormaster_final.md`), so wikilinks stay short and readable.

The aim is a note that's actually usable at the table and that Obsidian's
graph view renders as a real web of connections — not a document dump.

See `campaign/README.md` for the suggested folder layout.
