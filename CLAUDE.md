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

## Formatting statblocks

Two community plugins are installed and should be used whenever a note
contains a creature/NPC statblock (a built NPC, a reskinned monster, a boss
write-up, etc.) — not just linked to one:

- **[PF2e Statblocks](https://github.com/pixley/pf2e-statblock-for-obsidian)**
  — wrap the whole statblock in a `pf2e-stats` codeblock:

  ````
  ```pf2e-stats
  # Creature Name
  ## Creature 8
  ==Medium== ==Human== ==Humanoid==

  **Perception** +16
  ...
  ---
  **AC** 26  **Fort** +12  **Ref** +19  **Will** +14  **HP** 130
  ...
  ```
  ````

  Name is an H1 (`#`), the level/type line is an H2 (`##`), traits are
  wrapped in `==double equals==` on their own line right after. A `---` draws
  the divider before defenses/offense. Double line breaks reset indentation;
  use tab-indentation to nest content under a header.

- **[Pathfinder 2E Action Icons](https://github.com/thiagocoutinhor/pf2-action-icons)**
  — inline action costs anywhere in a note (ability names, prose, tactics
  write-ups) using backtick codeblocks:
  `` `pf2:1` `` (single action), `` `pf2:2` `` (two actions),
  `` `pf2:3` `` (three actions), `` `pf2:0` `` (free action), `` `pf2:r` ``
  (reaction). Use these instead of writing "two actions" or drawing the
  action glyphs as text.

Statblocks in `vault/` already use both conventions — match that formatting
rather than plain markdown headers/bold text when writing a creature into
`campaign/`.
