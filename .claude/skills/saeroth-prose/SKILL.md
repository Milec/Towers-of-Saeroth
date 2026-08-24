---
name: saeroth-prose
description: >-
  House writing voice for the Towers of Saeroth campaign vault — how to make
  worldbuilding prose read as written by a person rather than generated, and as
  fantasy rather than as an encyclopedia entry, using craft borrowed from George
  R. R. Martin, Tolkien and Brandon Sanderson. Use this whenever writing or
  revising any prose under `campaign/` or `players/` — a nation, NPC, faction,
  location, deity, session prep, history note, hook or read-aloud — and whenever
  the user asks for something to sound better, less generic, less AI, more
  human, more evocative, grittier, more Tolkien-ish, or more like a real fantasy
  setting. Also use it when expanding a stub, rewriting a note that "feels off",
  or drafting anything a player will read aloud at the table. Reach for it even
  when the request is framed as adding lore rather than as a writing task, since
  every note added to the vault is prose someone will read.
---

# The Saeroth voice

Every note in this vault is read by a person at a table, usually on a phone,
usually mid-sentence while three players wait. That is the whole design
constraint. Prose that is *pleasant* and says nothing costs the GM the round.

Two things go wrong, and they are different problems with different fixes:

1. **It reads as generated.** Balanced, complete, hedged, tidy, and no human
   would have bothered to write it that way.
2. **It reads as an encyclopedia.** Accurate, organised, and with no smell,
   no weather, no money, and nobody in it who wants anything.

Sections 1 and 2 below deal with each. Section 3 is the revision pass, and it
is the part that actually does the work — first drafts are allowed to be bad.

Read `references/authors.md` for the craft in depth: what Martin, Tolkien and
Sanderson each actually do, and how each move translates to a GM note rather
than to a novel. Consult it when a note needs a specific technique, when you
are stuck on how to open something, or when a whole class of note (nations,
NPCs, history, read-aloud) needs a pass.

---

## 1. Sounding like a person

### The vault's own tics, measured

This voice already exists and is already lopsided. Measured by
`scripts/prose_check.py` across the ~59,000 words of actual prose in
`campaign/` (tables, statblocks and generated rows excluded):

| Move | Whole vault | Nation notes | Typical prose |
| --- | --- | --- | --- |
| Em dash | **13.9 per 1k words** | **23.9** | 2–4 |
| Sentences under 8 words | **7.6%** | ~0% | 15–25% |
| Median sentence | **23 words** | 31–35 | 14–18 |

One tic, showing up twice. The em dash is doing a specific job — state a fact,
pause, deliver the twist — and because every twist arrives on the same hinge,
a reader four paragraphs in hears it coming and stops being surprised by
what is on the other side. The missing short sentences are the same problem
from the other end: nothing ever lands in four words, so nothing lands hard.

The checker also reports **hinge runs** — consecutive sentences that all use
the move. That catches what a rate cannot: a note can sit at a respectable
average and still have ten hinged sentences in a row somewhere in the middle.
`Drake Rider Order.md` does exactly that.

It is a mirror, not a gate. About half the vault flags, because the tic is the
house style and not a defect in any single note. Use `--top` to rank, fix the
worst, and don't chase the numbers on a note that reads well.

```
python3 .claude/skills/saeroth-prose/scripts/prose_check.py campaign/nations/Quivar/Quivar.md
python3 .claude/skills/saeroth-prose/scripts/prose_check.py campaign/          # whole tree
```

### What to do instead of the hinge

The twist is usually right. The punctuation carrying it is the problem, and
there are at least four other ways to carry it:

- **Full stop.** Two sentences. The second one lands harder for being separate.
- **A short sentence after a long one.** Length contrast does what the dash was
  doing. This is the single most effective fix and the vault barely uses it.
- **Put the twist first** and let the explanation follow flatly.
- **Cut it.** Some twists are the writer enjoying themselves.

Rewrite the same fact four ways and keep the one that does not sound like the
paragraph above it.

### Tells that read as generated

- **Everything balanced.** Three items in every list, every clause weighted
  against another, every paragraph the same length. Real writing is lumpy: a
  nine-word sentence next to a forty-word one, a list of two, a list of five.
- **Summary standing in for a fact.** "Known for its bustling markets" is a
  claim about a place. "Two hundred stalls, and the fish comes in at four" is
  the place. Prefer the number, the price, the hour, the name.
- **Total coverage.** A note that answers every question was written by
  something with no opinion. Leave things out. A gap the GM can fill is worth
  more than a paragraph they have to read past.
- **Intensifier as evidence.** *Genuinely, exactly, precisely, entirely,
  simply, truly.* Each one is asking the reader to believe something the
  sentence has not earned. The vault uses about a hundred of them; most can go.
- **The elevated-neutral register.** No idiom, no slang, no coarseness, nobody
  swearing, no regional turn of phrase. Fantasy prose is allowed to say
  *the fish comes in at four* and it is allowed to say *he was a bastard about
  it.*
- **Adjective stacks.** "Ancient, weathered stone" is one adjective wearing a
  disguise. Pick the better one, or replace both with what the stone *does*.
- **The summarising kicker.** Ending every section by restating it in a
  weightier cadence. Sometimes the last concrete detail is the ending.

### Ordinary human things worth doing on purpose

- Let a sentence be plain when the content is doing the work.
- Use the specific word for the thing — *withers, tithe-barn, coppice, sallet,
  factor, weir* — rather than the general one.
- Let numbers be odd. Seven hundred and forty is a count. A thousand is a
  gesture.
- Contractions in anything a person says or thinks. Not in a charter.
- Let one sentence in a note be funny, or mean, or tired. A voice with no
  attitude reads as no voice.

---

## 2. Sounding like fantasy

The failure here is rarely "not enough magic". It is a world that appears to
have no weather, no economy, no dead, and no yesterday.

**Where does it stand, and what is it like to be there.** Ground, weather,
distance, light, smell. Not a paragraph of scenery — one physical fact that
implies the rest. A tower nobody has weathered. Terraces of vines and lemons.
Fog that hides what is buried.

**Somebody is always speaking.** Almost nothing in a setting is neutral fact.
Who says this? Who would dispute it, and what would they say instead? A single
clause of attribution — *the Cathedral Court holds that…*, *Kesmarch's rangers
call it the wrong game* — converts a fact into a position, and positions are
what a party can push against.

**Money, food, and who carries it.** Where does the grain come from, who is
poor because of it, what does it cost, and who resents the price. This is where
plot lives. A nation with an economy has enemies for reasons.

**The past leans on the present.** One inherited thing per note — a grudge, a
charter, a ruin, a debt, a phrase people still say without knowing why. It does
not need explaining. It needs to be there.

**Name things the way languages do.** Toponyms come from what happened there,
what it looks like, or who owned it. *Harrowgate, Bonemarket, Brightfurrow,
Ambry Ford, Grauthaven.* A name that means nothing in any language is a name
nobody named.

**Leave three things unexplained.** This is Tolkien's engine and it is nearly
free: mention something with confidence and do not gloss it. The Silent Years.
The thing the Cindral wardens twice declined to discuss. Depth is the
*impression* that the world continues past the edge of the note, and the
cheapest way to make it is to refer to something as though the reader should
already know.

**Cost, not power.** A thing that can do anything is boring by the second
mention. What does it cost, who pays, what breaks. Sanderson's actual rule is
about limitations, not systems.

---

## 3. The revision pass

Draft freely; the draft is not the deliverable. Then:

1. **Read it aloud.** Everything a mouth stumbles on is a problem. This finds
   more than any checklist.
2. **Run `scripts/prose_check.py`.** Look at the em-dash and colon rates and
   the short-sentence share. If two of the three are outside the band, the note
   is running one rhythm.
3. **Find the longest sentence and break it.** Then find the shortest and see
   whether it can be shorter.
4. **Delete the best line.** If the note still works, it was decoration. If it
   collapses, it was load-bearing — put it back and cut something else.
5. **Check that a fact is a position.** Anything asserted flatly that somebody
   in the world would dispute should say who says it.
6. **Cut the last sentence of each section.** Roughly half the time it was a
   summary of what the reader just read.
7. **Count what a GM can *use*.** Names, numbers, prices, hooks, people who
   want something. If a paragraph yields none, it is atmosphere — keep at most
   one of those per note.

### One worked example

The fact: *Quivar's spies operate inside the Vaelic Diet.*

**Generated-sounding.** Balanced, hedged, everything explained, one rhythm:

> Quivar maintains an extensive intelligence apparatus that has successfully
> infiltrated the Vaelic Diet — an achievement that reflects both the
> sophistication of its methods and the complacency of its target. It is not
> merely espionage; it is statecraft of the highest order.

**Revised.** The claim gets an owner, the fact gets a price, and the rhythm
varies:

> Quivar's service has been inside the Diet for two generations, mostly by way
> of the wine factors. Vaelic knows. It cannot prove it, and it has started
> feeding the wine factors things on purpose.

Three sentences, 9/4/16 words. Nobody explains that this is clever.

---

## What this is not for

Don't apply it to `tools/`, `site/`, code comments, or commit messages — those
want plain technical English. And don't reach for it in `vault/`, which is a
verbatim rules scrape and must stay verbatim.

Where a note's format is fixed — a statblock, a relations row, a table — the
format wins. `CLAUDE.md` and `campaign/README.md` govern structure; this skill
governs the sentences inside it.

One structural rule worth repeating here because it changes how you write:
**a Political Relations row's first sentence is shown on 28 other notes.**
Write it to stand alone.
