---
title: Thaumodynamics
type: reference
author: A player character's own work — unpublished, unreviewed, and not the world's settled account of anything
status: Working notes. The early laws are well tested; the last of it is one man's reasoning
covers: Four laws, and what the bench equation turns out to be shorthand for
---

Twenty years of [[Magitech]] and nobody has written down what the trade is
actually doing, for two reasons that have nothing to do with the work being
hard.

The first is that most of the world holds the whole field to be a waste of
effort. Anything a magitech device does, a competent practitioner can just
*do* — faster, without a gem, and without waiting a season on a guild order.
Set beside a working, a device that takes four craftsmen and a rare stone to
light a room looks like an elaborate way of avoiding a cantrip, and that is
roughly what a chair at Thelemar will tell you if you raise it at dinner. The
second is that the two bodies who took it up anyway split it down the middle:
[[Melisor Magocracy]] has theorists who will not go near a bench,
[[Silicar]] has benchwrights who will not go near a theory, and between them
the field has accumulated a great deal of practice and no account of itself.

What follows is an attempt at one. It is not published, it has never been
read by anyone qualified to argue with it, and the name for the study is the
author's own coinage. The first three laws rest on work that can be repeated
by anyone with a bench. The last of it rests on one measurement, taken once,
which is said plainly where it arises.

## The fundamental bench equation

**W = Q · P ÷ Z**

Chalked over every bench in Brightfurrow, usually by somebody who could not
derive it. It estimates the useful Working a single-stone apparatus produces
across one full cycle:

| Term | Name | What it is |
| --- | --- | --- |
| **W** | Working | The useful magical effect the apparatus actually delivers |
| **Q** | Charge | Thaumic potential the stone's charge rune makes available |
| **P** | Pattern | How well the property rune shapes that charge into the effect wanted |
| **Z** | Impedance | The opposition the material circuit puts up as patterned charge passes through it |

So **W = f(Q, P, Z)**, and each of the three has a law governing it.

**Charge** is set by the charge rune, which fixes the ceiling, and by the gem,
which decides how near the ceiling a given stone comes: **0 ≤ Q ≤ Qmax**. Every
charge rune anybody has recovered gives the same Qmax, which is the whole of
why the trade is stuck where it is.

**Pattern** operates on whatever charge is available, giving the product
**Q · P**. It is an effectiveness, not an identity — *which* property a rune
expresses comes from the rune, and P says only how much of that property
survives the cutting.

**Impedance** depends on the housing rather than the stone:
**Z = f(M, C, τ)**, for material, circuit geometry, and the kind of Working
being carried. The three are set out under the Third Law below.

## Zeroth Law: Thaumic Affinity

> A pattern expresses itself only in proportion to its affinity with the stone
> it is cut into.

**0 ≤ P ≤ Pmax**

It is numbered zeroth because the other three laws all use P and none of them
can say what P is. A property rune is not equally effective in every gem; its
geometry has to agree with the crystal it is cut into. Fire agrees with ruby.
A ward, or open air, agrees with diamond. Earth wants peridot. Fire cut into a
gem with no affinity for it gives a weak effect or an unstable one, and a
perfect pairing approaches Pmax without ever passing it.

This is why particular stones became associated with particular workings, and
why that association is not a convention anybody chose.

## First Law: Conservation of Charge

> A stone gives up no more charge than it was given. How fast it is spent can
> be changed. The total cannot.

**∫₀ᵀ (−dQ/dt) dt ≤ Q(0)**

where **t** is time, **T** the moment the working ends, and **Q(0)** the charge
in the stone when it began. **T** is the end of the *stone*, not of one use:
almost nothing is spent in a single working.

A strike-stone gives up a little at each click and will go on clicking for
years. A lamp bleeds steadily and is done in a season or two of evenings.
Between them they cover the whole range the trade currently builds for, and
both are bounded by the same integral. This is the formal statement of what
the trade already says in plainer words: a device works as many times as its
stone allows and not once more.

**Nothing is built to empty a stone at one stroke, and the reason is price
rather than physics.** The law permits it. A stone costs more than any single
working is worth, so every device in the trade is designed to spread its draw
across as many uses as the housing will survive, and a workshop that proposed
otherwise would be asked who was expected to pay for it. Worth remembering
before assuming the shape of present devices is telling you something about
what devices can be.

**Read what this law does not say.** It bounds the charge a stone can
surrender. It says nothing about the Working that charge produces, and those
are not the same quantity. Most of the trade runs the two together and gets
away with it, because on a circuit that loses — which is nearly all of
them — the difference never shows. It shows under the Third Law.

## Second Law: Thaumic Transfer

> What arrives as Working is what the pattern shaped and the circuit carried,
> less everything spilled on the way and plus whatever the circuit was good
> enough to draw in alongside it.

Charge leaves the stone at a rate **−(dQ/dt)**. Some of it arrives as the
effect the device was built for. Some is spilled. And a circuit carved well
enough couples the channel to the same ambient field the charge rune pulls
from, so that a third quantity arrives which the stone never supplied:

**−(dQ/dt) + a(t) = w(t) + ℓ(t)**

| Term | Name | What it is |
| --- | --- | --- |
| **w(t)** | Working rate | Arriving, at that instant, as the effect the device was built for |
| **ℓ(t)** | Loss | Spent at that instant and arriving as anything else |
| **a(t)** | Ambient draw | Field the circuit couples in on its own account, which the stone never held. *Inferred, never measured — see below* |
| **η(t)** | Transfer | The net of all three, as a multiple of what the stone gave up |

Net it out and the ratio of Pattern to Impedance is what has been measuring
the whole business all along:

**η(t) = P(t) ÷ Z(t)**, and **w(t) = η(t) · (−dQ/dt)**

**η < 1** is a circuit losing more than it couples, which is nearly every
circuit anybody currently makes. **η > 1** is a circuit that gives back more
than the stone handed it, and it is not getting that from nowhere — it is
getting it from the field, along the channel the property rune opened, and it
cannot open that channel without the stone's flow to hold it open.

**The ambient term is the weakest thing in these pages, and it should be said
here rather than buried.** Nobody has measured a(t). No instrument the author
owns will show ambient field at all, and it may be that none can. It is in
the equation because on one occasion a circuit returned more than its stone
could account for, and something has to balance that page. Ambient coupling
is the least strange explanation available. Least strange is not the same as
correct, and if a(t) turns out to be something else entirely, everything
below the First Law will need rewriting and nothing above it will.

Waste leaves as heat, light, vibration, backlash, degradation of the stone
itself, or an effect nobody asked for. A badly made lighter that draws ten
units of charge to deliver six has not lost the other four. It has put them
somewhere, and a workshop that cannot say where has a fire hazard rather than
a device. This is the whole reason good circuitry makes a stone last: not
because it draws less, but because less of what it draws goes astray.

## Third Law: Impedance

> Every material circuit opposes, modifies, and — carved well enough —
> amplifies what passes through it. The quality of a Working therefore depends
> on the material and the geometry together, and no circuit can be driven past
> what its own material will bear.

**Z > 0**, always, and **Z = f(M, C, τ)**.

| Term | Name | What it is |
| --- | --- | --- |
| **M** | Material | What the housing is made of: the alloy blend or the wood, its purity, its grain |
| **C** | Circuit | The geometry of the carving — its path, corners, depth and workmanship |
| **τ** | Working type | Which kind of Working is being carried, a circuit fit for one being no guarantee for another |

Impedance is not a property of a substance the way hardness is. Two devices
cut from identical steel can differ wildly because one engineer carved a far
better circuit, and a superb circuit carved into the wrong material still
performs badly. The τ term matters as much: the same circuit that carries a
ward cleanly may be poor at carrying fire, so impedance has to be quoted
against the working it is meant to carry or it means nothing.

None of the three is fixed while a device runs, either. Heat changes what a
material will carry, and a circuit that cracks is a circuit recut by
accident, so a Z measured on a cold bench is a Z measured under conditions
the device will not stay in.

**Impedance below Pattern is gain.** Drive Z under P and the device returns
more Working than the stone gave up, which sounds like the First Law being
broken and is not: the surplus is ambient field, and the stone is still
emptying at exactly the rate the First Law allows. Charge is conserved.
Working never was, and anyone who assumes otherwise will conclude that gain
is impossible and stop looking for it.

**This rests on one bench, one afternoon.** A silver-lead circuit of the
author's own carving, seated with a middling ruby, delivered a burn that no
honest accounting of that stone could pay for, and did it four times before
the carving split. It has not been repeated. Two later circuits cut to the
same pattern in the same alloy sat obediently below unity and are sitting
there yet. Nothing rules out a fouled measurement, a better stone than it was
graded, or an error in the notes taken that day.

So: gain is what the laws permit and what one afternoon appeared to show.
That is a good deal less than a demonstrated fact, and it is why these pages
have not been shown to anyone. A claim of this size wants a second circuit
behind it.

**But every circuit has a floor it cannot be driven under.** Call it **Zmin**,
and understand it as a breaking point rather than a limit approached:

**Z > Zmin(M, C)**

Below that value the circuit is holding a coupling wider than its own
material can carry, and it does not quietly stop improving. It fails. The
carving cracks along its own tracks, or the stone goes at once instead of
over months, or the working arrives somewhere nobody aimed it. A device built
at gain is a device built nearer its own destruction, and the better the
material the nearer you may safely go.

Zmin is not one number. It belongs to the material and the carving together,
it moves with heat and with damage, and nobody has mapped it for so much as a
single alloy. It is the open question of the field, and the answer matters for
a reason that has nothing to do with power. The stone is the expensive part of
every device ever sold. A circuit at gain takes more Working out of the same
stone, so gain is not merely the road to a stronger device — it is the only
road anyone has to a cheaper one, and cheap is what the field would need
before the rest of the world stopped calling it a waste of a workshop.

## What the laws already answer

Three things fall out that the bench does not have the vocabulary to notice.

**The bench equation is not a simplification.** It is exact, under conditions
worth naming. Hold P and Z steady through the cycle and run the stone to
exhaustion, and the integral collapses:

**W = ∫₀ᵀ η · (−dQ/dt) dt = (P ÷ Z) · [Q(0) − Q(T)] = Q(0) · P ÷ Z**

So the chalked version is the full theory in the case a bench usually cares
about, with **Q** meaning **Q(0)**, a fresh stone. It fails in two situations
and both are worth knowing. On a partly spent stone the bracket is
**Q(0) − Q(T)** and not Q(0). And on a device whose circuit heats or damages
as it runs, Z drifts mid-working and cannot be pulled out of the integral —
which means the shorthand is least reliable exactly where impedance is
already worst. A workshop that trusts the chalk is trusting it hardest on the
devices it should trust it least on.

**The floor is not where the trade assumes it is.** Ask any guildmaster how
good a circuit could get and the answer, if you can get one, stops at
break-even: a circuit that wastes nothing, on the reasoning that a device
returning more than it was handed would be outrunning its own stone. That
reasoning takes Working for the conserved quantity, and it is not.
Conservation binds charge. A circuit at gain does not refill the stone, does
not slow its emptying, and does not violate anything — it opens a wider
channel onto the field, and the stone pays for holding it open.

The real floor is **Zmin(M, C)**, a breaking point rather than a ceiling,
different for every material and carving, and unmapped. That is a worse
answer and a truer one.

**Which leaves two roads rather than one.** Everything a device finally
delivers comes out of what the stone was handed, **Qmax**, multiplied by what
the circuit does with it. A better gem closes the gap to Qmax. A better
circuit multiplies whatever crosses it, and there is no reason in any of the
four laws why that multiplier stops at one.

Twenty years of craft has produced no device more powerful than the first ones
out of the ground, and the trade reads that as proof it is stuck behind the
charge rune. It is not proof of anything of the kind. Present circuits sit a
little under unity — twenty years has carried the field from badly lossy to
nearly break-even, which is real work and is not the same as gain. The road
past Qmax was never closed. Nobody has walked it, because nobody has written
down that it is there.

## What is settled and what is not

These pages are not of one weight throughout, and it would be dishonest to
bind them as though they were.

| | Standing |
| --- | --- |
| **Zeroth Law**, affinity | Settled. Cut one rune into six gems and five of them will tell you so before the week is out |
| **First Law**, conservation of charge | Settled. Every stone anyone has ever run dry says it |
| **The bench equation as an estimate** | Settled by use. The whole trade runs on it and the whole trade is not wrong |
| **The bench equation as exact** | A derivation, not an observation. Sound if the Second Law is sound |
| **Third Law**, that M, C and τ govern impedance | Settled, and Silicar's tables are better evidence for it than anything here |
| **The ambient term a(t)** | Inferred. Never measured, possibly not measurable |
| **Gain, η > 1** | One circuit, one afternoon, unrepeated |
| **Zmin as a breaking point** | Extrapolated from circuits that failed under load. The floor itself has never been approached on purpose |

The author's position is that the top half is not seriously in doubt, that
the bottom half is worth a career, and that anyone who reads the bottom half
first and the top half not at all will get himself hurt.

**GM:** this is a player character's private theory, not the world's account
of anything. It is the most complete magitech theory in existence, which says
more about how little competition it has than about the man who wrote it.

**Why nobody beat him to it.** The field is held in contempt. A practitioner
can do most of what a device does by simply doing it, so magitech reads to
the world as an expensive way to avoid learning a cantrip — which means the
people with the most reason to build one are the people who cannot cast, and
those are the people no academy is listening to. Add that Melisor and
Silicar each hold half the picture and neither will sit at the other's bench,
and twenty years of nobody writing this down stops being surprising. He is
not the cleverest person who could have done this. He is the one who was
standing in the right place and did not know it was beneath him.

**How correct it is, is yours to decide.** The note grades its own claims and
the grading is honest, so use it as the dial. The three settled laws should
hold. Below that line every claim is a lever:

- **The ambient term.** If a(t) is real, gain works as written. If it is
  something else — a property of that one ruby, a thinness in the world since
  the towers came, something the empire left in the ground — then the theory
  is right about the arithmetic and wrong about the cause, which is the most
  interesting failure available and does not cost him his competence.
- **The one afternoon.** That result can be genuine, a fouled measurement, or
  genuine for a reason he has not guessed. All three are playable and none of
  them need deciding until somebody tries to repeat it on screen.
- **Zmin.** Nobody has approached the floor deliberately. What happens there
  is entirely open.

**When gain is on the table, let it work and make the housing pay.** A circuit
that cracks after a fight, a stone emptied in one evening instead of a season,
a working that arrives somewhere nobody aimed it. Never rule that a gain
device fails to function — that is the boring version and it is not
what the Third Law says.

**What it is worth.** The trade believes the charge rune is the whole ceiling.
These pages say it is one of two and the other has never been tested. Melisor's
instinct would be to bury the page and hire the man; Silicar would want to
build it by Thursday. Neither reaction is safe for whoever is holding the
paper, and neither academy would credit where it came from.

Ruin-recovered circuits are where the real numbers live. The empire ran rail
and railguns on this and did not do it at η just under one, so a fragment
pulled intact out of the ground is the party's first sight of what the floor
really is — and the author of this treatise is the one person alive equipped
to recognise what he is looking at. See [[The Nameless Empire]].

**Backstory hooks, for the player rather than the GM.** The theory needs its
author to have had three things the world does not hand out together: time at
a Silicar bench or its equivalent, enough rune theory to read a property cut,
and a reason to care about intensity rather than endurance — which a
gunslinger has and a lamp-maker does not. Any story that supplies those three
earns the document. Whether he was thrown out of somewhere, apprenticed to
somebody who died, or too stubborn to be told the field was worthless
is his to say.

*See [[Magitech]] for the trade this describes.*
