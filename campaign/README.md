# Campaign Notes

Your worldbuilding lives here. The layout below is the convention Claude
follows; reorganize freely, the `pf2e-gm` skill doesn't care where things live,
only the `vault/` and `.claude/` paths at the repo root matter to it.

## This folder is the Obsidian vault

Obsidian opens `campaign/`, not the repo root — the full `vault/` is 41,000+
files and far too large to index, especially on mobile. So **every
`[[wikilink]]` in here must resolve inside `campaign/`**. A link like
`[[Setting/Deities/Nethys]]` or `[[Ancestries/Human (Player Core)]]` points
above the vault root and silently resolves to nothing: it looks fine in the
editor and is dead in the graph.

When a note needs a rules reference, copy the flavour into `campaign/` and cite
the source as plain text at the bottom (`` *Full entry: `vault/...`* ``) rather
than linking to it. `world/deities/` and `world/ancestries/` are the pattern.

Wikilinks are resolved **by filename, not path**, so `[[House Dravensk]]` works
from anywhere regardless of how deeply it's nested. Never put a folder path in
a link, and feel free to move notes between folders without updating anything.

## Layout

```
campaign/
├── nations/
│   ├── Nations of the World.md      index of all nations
│   ├── Political Relations.md       who is allied with, trading with, or
│   │                                fighting whom
│   └── <Nation>/
│       ├── <Nation>.md              the nation itself
│       ├── factions/                houses, orders, guilds inside it
│       ├── locations/               its cities, holds, dungeons
│       └── npcs/                    people who belong to it
├── world/                           setting-wide reference, not nation-specific
│   ├── ancestries/                  the peoples: culture and flavour, no rules
│   ├── deities/                     gods actually worshipped here
│   ├── history/                     world timeline, ages, cataclysms
│   ├── languages/
│   └── planes/                      cosmology
├── factions/                        organizations that cross borders —
│                                    mercenary companies, cults, trade leagues
├── npcs/                            unaffiliated or wandering NPCs
├── locations/                       places outside any nation's borders
├── pcs/                             player character summaries
├── sessions/                        session logs and prep, one per session
├── quests/                          plot threads and hooks
└── items/                           artifacts and notable treasure
```

Empty folders are kept in git with a hidden `.gitkeep`; Obsidian ignores
dotfiles, so they show as ordinary empty folders. Prune any you don't want.

**Where does it go?** If it belongs to exactly one nation, it goes in that
nation's folder. If it spans several, it goes in the matching top-level folder.
A faction operating in three nations belongs in `factions/`, not in whichever
one it happens to be headquartered in.

## Note format

See the repo's `CLAUDE.md` for the note format — frontmatter, `[[wikilinks]]`,
one subject per file, and the statblock plugin syntax.
