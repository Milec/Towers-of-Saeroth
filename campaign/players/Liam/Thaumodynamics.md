---
title: Thaumodynamics
type: reference
status: A working treatise. No academy has seen it and neither would like it
covers: Four laws, and what the bench equation turns out to be shorthand for
---

Twenty years of [[Magitech]] and nobody has written down what the trade is
actually doing. [[Melisor Magocracy]] has theorists who will not go near a
bench and [[Silicar]] has benchwrights who will not go near a theory, and
between the two of them the field has accumulated a great deal of practice
and no account of itself. What follows is an attempt at one. It is not
published, it would embarrass both academies if it were, and the name for
the study is the author's own coinage.

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
in the stone when it began.

A firelock empties a stone over a fraction of a second. A lamp takes months
about it. Both are bounded by the same integral, and this is the formal
statement of what the trade already says in plainer words: a device works as
many times as its stone allows and not once more.

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
| **a(t)** | Ambient draw | Field the circuit couples in on its own account, which the stone never held |
| **η(t)** | Transfer | The net of all three, as a multiple of what the stone gave up |

Net it out and the ratio of Pattern to Impedance is what has been measuring
the whole business all along:

**η(t) = P(t) ÷ Z(t)**, and **w(t) = η(t) · (−dQ/dt)**

**η < 1** is a circuit losing more than it couples, which is nearly every
circuit anybody currently makes. **η > 1** is a circuit that gives back more
than the stone handed it, and it is not getting that from nowhere — it is
getting it from the field, along the channel the property rune opened, and it
cannot open that channel without the stone's flow to hold it open.

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
single alloy. It is the open question of the field, and the reason the answer
matters is that every unit of gain is worth more than a better gem.

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

---

**GM:** this is the first unified account of magitech anybody in the world has
written, and its author is a player character. Nothing in it is wrong.

**The gain claim is the live one.** Everybody in the trade believes the
recovered charge rune is the whole ceiling. This treatise says it is one of
two ceilings and the other has never been tested, which is either the most
valuable page in the world or a good way to be robbed. Melisor's instinct
would be to bury the page and hire the man. Silicar would want to build it by
Thursday. Neither reaction is safe for whoever is holding the paper.

**Gain is a dial you control, and it has a failure mode rather than a cap.**
Anything the party builds above unity should cost something concrete: a
circuit that cracks after a fight, a stone that empties in one evening instead
of a season, a working that arrives somewhere nobody aimed it. Never rule that
a gain device simply doesn't work. Let it work, spectacularly, and then let
the housing pay. That is the interesting version and it is also what the
Third Law actually says.

Ruin-recovered circuits are where the real numbers live. The empire ran rail
and railguns on this and did not do it at η just under one, so a fragment
pulled intact out of the ground is the party's first sight of what the floor
really is — and the author of this treatise is the one person alive equipped
to recognise what he is looking at. See [[The Nameless Empire]].

*See [[Magitech]] for the trade this describes.*
