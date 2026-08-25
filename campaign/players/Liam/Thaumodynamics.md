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
being carried.

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

> No apparatus performs more total Working than the charge its stone made
> available. How fast charge is spent can be changed. The total cannot.

**∫₀ᵀ w(t) dt ≤ Q(0)**

where **w(t)** is the instantaneous rate of useful Working, **T** the moment
the working ends, and **Q(0)** the charge in the stone when it began.

A firelock discharges enormously over a fraction of a second. A lamp gives
almost nothing for a very long time. Both are bounded by the same integral,
and this is the formal statement of what the trade already says in plainer
words: a device works as many times as its stone allows and not once more.

## Second Law: Thaumic Loss

> Nothing is transmitted without loss. Imperfect affinity and circuit
> impedance both cut down the share of spent charge that arrives as useful
> Working.

Charge leaves the stone at a rate **−(dQ/dt)**. Some arrives as Working and
some is wasted, and the two account for all of it:

**−(dQ/dt) = w(t) + ℓ(t)**

The share that arrives is the **conversion efficiency**, which is what the
ratio of Pattern to Impedance has been measuring all along:

**η(t) = P(t) ÷ Z(t)**, with **0 ≤ η ≤ 1**

**w(t) = η(t) · (−dQ/dt)**  and  **ℓ(t) = (1 − η(t)) · (−dQ/dt)**

Waste leaves as heat, light, vibration, backlash, degradation of the stone
itself, or an effect nobody asked for. A badly made lighter that draws ten
units of charge to deliver six has not lost the other four. It has put them
somewhere, and a workshop that cannot say where has a fire hazard rather than
a device. This is the whole reason good circuitry makes a stone last: not
because it draws less, but because less of what it draws goes astray.

**The First Law is a consequence of this one.** Integrate the rate:

**∫₀ᵀ w dt = ∫₀ᵀ η · (−dQ/dt) dt ≤ ∫₀ᵀ (−dQ/dt) dt = Q(0) − Q(T) ≤ Q(0)**

Conservation does not need asserting separately. It falls out of efficiency
never exceeding one.

## Third Law: Impedance

> Every material circuit both opposes and modifies what passes through it, so
> the quality of a Working depends on the material and the geometry together.

**Z > 0**, always, and **Z = f(M, C, τ)**.

Impedance is not a property of a substance the way hardness is. Two devices
cut from identical steel can differ wildly because one engineer carved a far
better circuit, and a superb circuit carved into the wrong material still
performs badly. The τ term matters as much: the same circuit that carries a
ward cleanly may be poor at carrying fire, so impedance has to be quoted
against the working it is meant to carry or it means nothing.

Scholars know impedance can be improved. Nobody has said how far.

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

**The unknown lower bound is not unknown.** Measure P as a fraction of Pmax
and Z as a multiple of an ideal circuit, and the Second Law's requirement that
η ≤ 1 fixes the floor outright:

**Zmin = 1**

A perfect circuit loses nothing. It does not give back more than it was
handed. Anything below that floor would mean an apparatus delivering more
Working than its stone ever held, which the First Law forbids — so either
conservation is wrong or the Third Law's open question was answered the
moment the Second Law was written down. Scholars chasing lower impedance are
chasing a real gain and an entirely bounded one, and none of them have
noticed the bound is already in their own arithmetic.

**Which leaves one direction.** If efficiency caps at one, no circuit and no
gem can raise what a device ultimately delivers past what the stone was
handed, and the stone is handed **Qmax** by the charge rune. A better gem
closes the gap to Qmax. A better circuit closes a different gap entirely, the
one between what the stone gave up and what the device did with it. Neither
of them touches Qmax. Every route to a more powerful device short of a better
charge rune is a route to the same ceiling approached more tidily — which is,
without either academy having framed it that way, an explanation of why
twenty years of extraordinary craftsmanship has produced no device more
powerful than the first ones out of the ground.

---

**GM:** this is the first unified account of magitech anybody in the world has
written, and its author is a player character. Nothing in it is wrong.

Two things it does that are worth playing. It states plainly that Qmax is the
only real ceiling, which the trade has felt for twenty years and never
formalised — an academy that read this would understand at once that the
recovered charge rune is the whole game, and would want to know where the
author thinks a better one might come from. See [[The Nameless Empire]] for
the answer nobody is in a position to give.

And it establishes **Zmin = 1** as a hard floor on ordinary magitech. That is
correct for everything the world can currently build, which makes it a good
measuring stick: a device that appears to clear it is not a better circuit but
evidence of something the theory does not cover. Nothing the party can build
should ever break it. Something recovered intact from a ruin might, and the
author of this treatise is the one person alive equipped to notice.

*See [[Magitech]] for the trade this describes.*
