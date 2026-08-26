---
name: saeroth-prose
description: >-
  House writing voice for the Towers of Saeroth campaign vault — how to make
  worldbuilding prose read as written by a person rather than generated, and as
  fantasy rather than as an encyclopedia entry. Terse over evocative: short
  sentences, plain words, no decorative metaphor. Closer to a study guide than
  a short story. Use this whenever writing or
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

**The target register is a study guide, not a short story.** Short sentences.
Plain words. A fact stated once, not decorated. Reach for a metaphor or a
simile only when a plain sentence genuinely cannot carry the fact — that is
rare, and most drafts reach for one anyway. If a sentence can lose a clause
and keep every fact, cut the clause. If a paragraph can lose a sentence and
keep every fact, cut the sentence.

Three things go wrong, and they are different problems with different fixes:

1. **It reads as generated.** Balanced, complete, hedged, tidy, and no human
   would have bothered to write it that way.
2. **It reads as an encyclopedia.** Accurate, organised, and with no smell,
   no weather, no money, and nobody in it who wants anything.
3. **It reads as decorated rather than dense.** A fact wrapped in an image it
   didn't need. Cut the image and check the fact is still there.

Sections 1 and 2 below deal with the first two. Section 3 is the revision
pass, and it is the part that actually does the work — first drafts are
allowed to be bad, and allowed to be long.

`references/authors.md` covers the same craft in more depth — what Martin,
Tolkien and Sanderson each actually do, and how each move translates to a GM
note. Treat it as a technique to reach for once in a while, on a note that
genuinely needs a scene set, not as the default register. Most notes need
fewer words, not more craft.

---

## 1. Sounding like a person

### The three that give the game away

These are louder than any punctuation habit, and a note can be clean on every
other measure and still be obviously machine-written because of them. All
three come from the same root: the writer optimising the *shape* of the prose
instead of reporting what is true.

**1. Rhetorical symmetry.** Two consecutive sentences built to the same
pattern, usually a matched pair with the same verb.

> Quivar credits the court. Everyone else credits the service.

That is enormously satisfying to write, and real speech almost never balances
that neatly twice running. The fix is not to un-balance the words — it is to
add a third beat that is a different *kind* of sentence, so the pattern never
closes:

> Quivar says that is the work of the court. Most people know better. They
> thank the Service.

Three beats, and the third is an action rather than another opinion. Whenever
a pair falls out symmetrical, add one and break the rhythm.

**Repetition for emphasis is a different thing and is fine.** *It faces east.
Everything about it faces east.* escalates — the second sentence goes further
than the first instead of answering it. What to hunt is the closed pair, where
the second sentence completes a pattern the first set up and the reader can
feel the click. The checker cannot tell these apart, so read what it flags
rather than deleting it.

**2. Stacked superlatives.** A ranking claim standing in for the thing that
actually happened.

> The oldest continuous monarchy on the continent, and the only great power
> never conquered.

Two superlatives in one breath, and neither tells you a single event. Replace
each with what a person could have witnessed:

> The crown has changed hands only within the same house since then, and no
> foreign army has ever held its capital.

Same facts. Now they are history rather than a league table, and a GM can play
either half of it. *The oldest, the only, the largest, the finest, the single
most* — every one is a shortcut past a detail you have not invented yet.

**3. Clipped fragments.** Short verbless sentences used as a rhythm device.
One is a beat. Four on a page is a writer chopping prose to sound weighty:

> c. 900 AR, unbroken since.

versus a sentence that simply does its job:

> Founded around 900 AR.

Register matters here too. `c.` is a catalogue entry; *around* is a person
talking. Prefer the word a GM would actually say aloud at the table.

`scripts/prose_check.py` measures all three — `sup` for superlatives per 1k,
`clip` for the verbless share, `mirror` for symmetrical pairs. The mirror
count is the one to take most seriously; anything above zero is worth reading.

### Headers give it away as fast as sentences

A reader scans headers before they read a word of the body, so a page can be
clean prose under headings that announce a machine wrote it. Four shapes to
avoid, all of which the vault produced in quantity:

| Shape | Example | Why it reads wrong |
| --- | --- | --- |
| `X, and Y` | *The ruins, and what is cut into them* | The same balanced pair as the mirrored sentence, in a heading |
| `X: Y` | *Six years ago: the Delta War* | Label, pause, reveal — the em-dash hinge wearing a colon |
| `What/Why/Who …` | *What is actually known*, *Who is looking* | A question standing in for the subject's name |
| Transition as heading | *Older than that*, *Before all of it* | Names nothing; a reader scanning the page learns no fact from it |

**Name the subject.** *The Two-Crown War. The Delta War. The Red. The ruins.*
A player scanning for when the war was wants to see the war's name, not a
clause about it. Put the date and the twist in the first line of the section,
where somebody is already reading.

The question form is not banned. *What is actually known* earns its place on a
note whose whole point is how little that is, and *Who is inside* is the best
heading on the towers note. The problem was the ratio: 37 question-headers
against 63 plain nouns is not a series of choices, it is a habit. After a pass
it sits at 10% across the vault.

`prose_check.py` reports the share as `hdr`, and it is blunt on purpose —
*Where they come from* is flagged for its first word while naming its subject
perfectly well. Conventional GM-book furniture like *Running this* and *At the
table* is not counted at all, because a human writer reaches for those
constantly.

### The vault's own tics, measured

This voice already exists and is already lopsided. Measured by
`scripts/prose_check.py` across the ~59,000 words of actual prose in
`campaign/` (tables, statblocks and generated rows excluded), against the
target this skill now writes to:

| Move | Whole vault | Nation notes | Target |
| --- | --- | --- | --- |
| Em dash | **13.9 per 1k words** | **23.9** | 2–4 |
| Sentences under 8 words | **7.6%** | ~0% | 25–35% |
| Median sentence | **23 words** | 31–35 | 10–14 |

The vault numbers are the old average, from before this pass — most existing
notes still read that way and are not being rewritten wholesale. New prose,
and any note you revise, should land in the target column instead.

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
- **Metaphor as decoration.** "Fear moved through the hall like a tide" tells
  the reader nothing "everyone was afraid" doesn't. A metaphor earns its place
  only when it's shorter than the literal fact *and* a GM can use it — a name,
  an image the party will repeat back. If neither, cut it and state the fact.
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
8. **Find every metaphor and simile and ask what fact it's standing in for.**
   State that fact instead, in fewer words, and see if anything was lost. It
   usually wasn't.

### One worked example

The fact: *Quivar is old and has never been conquered, and its spies are the
reason.*

**Still obviously machine-written**, even with the em dashes already gone:

> c. 900 AR, unbroken since. The oldest continuous monarchy on the continent,
> and the only great power never conquered. Quivar credits the court. Everyone
> else credits the service.

Four sentences and every one of the three tells is in it: a fragment opener, a
stacked pair of superlatives that describe no event, and a mirrored couplet.

**Human:**

> Founded around 900 AR. The crown has changed hands only within the same
> house since then, and no foreign army has ever held its capital. Quivar says
> that is the work of the court. Most people know better. They thank the
> Service.

Every change is worth naming, because they generalise:

- *the oldest / the only* became **two things that happened** — a crown staying
  in one house, a capital never taken.
- the matched pair became **three unequal beats**, ending on what people
  *do* rather than on a second opinion.
- *c. 900 AR, unbroken since* became **a sentence**.
- *the service* became **the Service** — an institution with a name people at
  court use, which is a whole character's worth of implication for one capital
  letter.
- *Most people know better* is a **judgement**, and somebody is making it.
  Prose with no attitude in it reads as prose with no author.

**Terser still, and this is the target now:**

> Founded around 900 AR. The crown has stayed in one house since, and no
> foreign army has taken the capital. Quivar credits the court. The city
> credits the Service.

Same facts, fewer words, nothing decorative — full sentences throughout, not
fragments standing in for pace. This is what most notes should land on: the
"Human" version above is the floor, not the goal.

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
