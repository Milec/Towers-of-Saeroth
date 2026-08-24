# Campaign Notes

Your worldbuilding lives here — 28 nations, their factions and people, plus the
setting-wide reference under `world/`. The layout below is the convention
Claude follows; reorganize freely, the `pf2e-gm` skill doesn't care where things
live, only the `vault/` and `.claude/` paths at the repo root matter to it.

## Start here

The four indexes and the two notes everything else hangs off:

- [[Nations of the World]] — all 28, oldest founding first
- [[Political Relations]] — who is allied with, trading with or fighting whom
- [[Peoples of the World]] — the ancestries
- [[Gods of the World]] — the pantheon, and who keeps which god
- [[Ages of Saeroth]] — the dated timeline, and the calendar it is counted in
- [[The Towers]] — the campaign premise

## How these notes are read

**Through the website**, not Obsidian: <https://milec.github.io/Towers-of-Saeroth/>

Every push to `main` rebuilds and deploys it, and it installs to a phone home
screen as an app. It renders this folder directly from the markdown — nothing is
pre-rendered — so what you write here is what the site shows on the next push.
It also does several things Obsidian can't:

- both PF2e statblock plugins are reimplemented natively, with inline SVG icons
  that don't overlap the following word the way the Obsidian font does on iOS
- a note can render as something other than prose (see **Custom views** below)
- the graph is opt-in folder by folder, so the 41k-note rules vault is
  browsable without trying to draw 457,000 links at once
- it works offline, and there is nothing to install and no vault to sync

Obsidian still opens this folder if you want it — the conventions below keep
both readers happy — but the site is the one to design for.

## Wikilinks

`[[Wikilinks]]` resolve **by filename, not path**, so `[[House Dravensk]]`
works from anywhere no matter how deeply it's nested. Never put a folder path
in a link, and move notes between folders freely without updating anything.

**Never let a link wrap across a line break.** Links are tokenised within a
single line, so `[[Thornwild\nConfederation]]` is not a broken link — it is not
a link at all, and renders as literal bracketed text. It shows up in no
broken-link check, because nothing ever parsed it. When reflowing a paragraph,
break *before* the link rather than inside it.

**An index note links to what it indexes, and nothing else.** Where such a
table has a second column — which nations worship this god, where this ancestry
is found — write those as plain text. They are already linked from both ends,
so linking them again adds no reachable information and wires the index into
half the vault.

### Linking into `vault/`

The site *does* resolve a link like `[[Setting/Deities/Nethys]]` into the rules
vault. It is still not the convention here, for three reasons: it drags the
41,000-note index into a page that didn't need it, it puts campaign notes one
hop from a 457,000-link graph, and those links are dead in Obsidian, which opens
`campaign/` as its root and cannot see above it.

So: copy the flavour into `campaign/` and cite the source as plain text at the
bottom — `` *Full entry: `vault/Ancestries/Kholo.md` — Player Core 2 pg. 16* ``.
`world/deities/` and `world/ancestries/` are the pattern. Campaign notes keep
short filenames with no source suffix (`Human.md`, not `Human (Player Core).md`).

## Layout

```
campaign/
├── nations/
│   ├── Nations of the World.md      index of all nations
│   ├── Political Relations.md       who is allied with, trading with, or
│   │                                fighting whom — renders as a web, see below
│   └── <Nation>/
│       ├── <Nation>.md              the nation itself
│       ├── factions/                houses, orders, guilds inside it
│       ├── locations/               its cities, holds, dungeons
│       └── npcs/                    people who belong to it
├── world/                           setting-wide reference, not nation-specific
│   ├── The Towers.md                the campaign premise; indexes known towers
│   ├── Trade Routes.md              the nine corridors, drawn on the world map
│   ├── ancestries/                  the peoples: culture and flavour, no rules
│   ├── deities/                     gods actually worshipped here
│   ├── history/                     world timeline, ages, cataclysms
│   ├── languages/
│   └── planes/                      cosmology
├── factions/                        organizations that cross borders —
│                                    mercenary companies, cults, trade leagues
├── npcs/                            unaffiliated or wandering NPCs
├── locations/                       places outside any nation's borders
├── players/                         one folder per player: the character
│   └── <Player>/                    summary plus whatever else is theirs
├── sessions/                        session logs and prep, one per session
├── quests/                          plot threads and hooks
└── items/                           artifacts and notable treasure
```

Empty folders are kept in git with a hidden `.gitkeep`. The site's file tree is
built from `.md` files alone, so **an empty folder simply doesn't appear there**
— it costs nothing to leave in place, and shows up the moment it has a note.

**Where does it go?** If it belongs to exactly one nation, it goes in that
nation's folder. If it spans several, it goes in the matching top-level folder.
A faction operating in three nations belongs in `factions/`, not in whichever
one it happens to be headquartered in.

**A `players/<Player>/` folder is the exception to all of that.** It is filed
by who needs the note rather than by what the note is about. The character
summary lives there (`type: pc`), and so does anything else that in practice
belongs to that one player: `players/Isaiah/` holds `Exemplars.md` and
`Dreams of the Dead God.md` because Isaiah is the only person at the table who
will ever open either of them. Wikilinks resolve by filename, so moving a note
in or out of one breaks nothing.

**Towers** follow the same rule and are marked `tower: true` in their
frontmatter so they can be found regardless of where they sit. One inside a
nation's borders or its charted waters goes in that nation's `locations/`; one
on disputed or unclaimed ground goes in the top-level `locations/`.

## Custom views

A `view:` field in a note's frontmatter makes the site render it as something
other than prose. `view: relations` on `nations/Political Relations.md` turns
that note's own markdown table into an interactive force-directed web of the
nations — filter by standing, tap a nation for its ledger, drag to untangle.

`view: nation` is on all 28 nation notes: the profile bullets render as one
uniform two-column table and the ties as a table with coloured standing tags.
Keep writing them as `- **Field** value` bullets — that is what the view reads,
and a bullet is the only safe place for a value containing `[[Human|Humans]]`,
whose pipe would end a real table cell.

The rule that makes this worth doing: **the markdown stays the single source of
truth.** The view parses the note's *own* table rather than carrying a second
copy of the data, so the note still reads correctly here and on GitHub, and
adding a row adds an edge with no code change.

## Changing the political relations

The diplomacy exists in three places at once, and all three move together or
the notes start lying about each other:

1. the table in `nations/Political Relations.md` — **the source of truth**,
2. the **Relations** bullet on each of the 28 `nations/<Nation>/<Nation>.md` notes,
3. the relations web on the site, drawn from that table.

The nation note gets the **gist** — one line per tie: the standing and the
row's lead sentence, `…` where there was more, and a link to the full entry.
So write each table row's first sentence to stand on its own; it is what all
28 nation notes will show.

Never hand-edit a nation's Relations bullet, and never add a row to the table
and stop there. From the repo root:

```sh
# 1. edit the table in campaign/nations/Political Relations.md
python3 tools/sync_relations.py            # 2. push it out to all 28 nations
python3 tools/sync_relations.py --check    #    verify; non-zero on drift
python3 tools/lint_notes.py                #    the silent-failure checks
python3 tools/build_site.py --no-vault     # 3. rebuild and look at the web
python3 -m http.server 8899 -d _site
```

`sync_relations.py` refuses to run on a malformed table — an unknown standing, a
duplicate pair, a nation with no folder, a nation related to itself. The
unknown-standing check matters most: the view skips rows whose standing it
doesn't recognise, so the tie would quietly vanish from the web with no error.

## How the prose is meant to sound

There is a skill for it: `.claude/skills/saeroth-prose`. Claude is told to
invoke it before writing anything here, because the whole vault is dictated
and the voice drifts toward a generated one otherwise. It carries the four
habits to avoid — mirrored sentence pairs, stacked superlatives, clipped
fragments, and the em-dash hinge — with craft borrowed from Martin, Tolkien
and Sanderson, and a script that measures a note against all four:

```sh
python3 .claude/skills/saeroth-prose/scripts/prose_check.py campaign/ --top 10
```

`tools/lint_notes.py` prints the same numbers as one advisory line on every
run, so there is nothing to remember. That line can never fail the lint — the
bands are a mirror, and plenty of good notes sit outside them.

## Note format

See the repo's `CLAUDE.md` for the note format — frontmatter, one subject per
file, filenames matching titles, and the statblock and action-icon syntax.
