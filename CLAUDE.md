# Towers of Saeroth

Private PF2e worldbuilding vault. `campaign/` is the user's own notes;
`vault/` is the Archives of Nethys reference synced from
[Milec/AON-Scrap](https://github.com/Milec/AON-Scrap); `.claude/skills/pf2e-gm/`
queries that reference for encounters, rules, treasure, shops, and NPCs.

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
- **Factions go in a subfolder per parent nation** —
  `campaign/factions/Vaelic/House Dravensk.md`, not
  `campaign/factions/House Dravensk.md`. Create the nation's subfolder if it
  doesn't exist yet; only genuinely cross-border organizations belong loose at
  the `factions/` root. Keep using short `[[House Dravensk]]` wikilinks
  regardless — Obsidian resolves those by filename, so the subfolder never
  needs to appear in a link.

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

The two plugins use **different, non-interchangeable codes**. Each README
documents its own:

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
- Keep the AON `[[Wikilinks]]` on traits, spells and abilities — they
  survive inside the codeblock and are the point of the vault.

Use `sf2e-stats` instead of `pf2e-stats` only for Starfinder 2e content. For
abbreviated blocks (a one-line NPC blurb) the plugin wants traits as an H3
(`###`) line rather than `==wrapped==`.

### Known mobile viewing quirks

Both plugins are written and tested against desktop; editing happens there
(see below). Viewing on iOS Obsidian, as confirmed against
`campaign/npcs/Garrick Thorne.md`:

- **Action Icons** `` `pf2:N` `` codes render only in **Reading view** — they
  render as nothing (not even the raw code) in Live Preview/editing view on
  mobile. Switch views before assuming a note's icons are broken.
- **PF2e Statblocks** `` `[one-action]` ``-style icons inside a `pf2e-stats`
  codeblock render but visually overlap the text right after them on
  mobile (icon glyph runs into the next word, sometimes eating its first
  letter), even in Reading view. This looks like a font-width/kerning bug
  in the plugin's embedded icon font on iOS, not a syntax mistake — the
  markup matches the plugin's own README example. No upstream issue is
  filed for it and no workaround is confirmed; it's a desktop-view plugin
  used here on a best-effort basis on mobile.

Don't try to "fix" this by changing the authoring syntax — write the
documented forms above regardless of how they render on any given device.
