# Campaign authoring reference

Read `AGENTS.md` for shared repository rules. This reference covers statblocks
and redacted handouts when those tasks apply.

## The exemplar player's handout

`tools/make_handout.py` builds a PDF per entry in `HANDOUTS` — Isaiah's
`Exemplar handout.pdf` and `Sanguinor handout.pdf`, Liam's and Ellie's — out of
notes in that player's own folder, cutting the GM-only parts and rendering what
is left through the site's own vendored `marked.js`, so a table in the handout
looks like the same table on the site. Each entry names its own `foot`, the
line printed under every section, because the exemplar's *you cannot repeat any
of this* reads as nonsense on a nation handout. The PDF is committed and is
**not** copied into `_site/` — `build_site.py` only takes `.md` and images, and
this one is for one player rather than for the public site.

The cutting is the point, so it is loud in both directions. Every removal is
named in `DOCS` — whole `##` sections, the preamble above the first heading,
single paragraphs matched on their opening words, and phrases rewritten
because they only make sense inside the vault — and a name that no longer
matches anything **exits non-zero** rather than passing quietly. Then the
rendered text is scanned against `FORBIDDEN`, and a single hit deletes the
output and refuses to ship. So renaming a heading in either note breaks the
handout build; it cannot silently leak the floor of the setting into a
player's hands.

Rerun it after editing either note. Inspect the script requirements and use the available Playwright browser;
do not assume a preinstalled runtime.

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
