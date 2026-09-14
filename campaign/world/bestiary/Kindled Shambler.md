---
title: Kindled Shambler
type: creature
level: 0
portrait-prompt: "A recently raised muddy human zombie in ragged caravan travel clothes, leather straps holding glass alchemical fire flasks beneath its exposed ribs, a slow-burning fuse with a small ember glow, lurching with empty hands out of a roadside drainage ditch. Unsettling undead face, restrained non-graphic decay, no excessive gore. Show head through knees with the flask harness clearly visible."
---

![Portrait of Kindled Shambler](Kindled%20Shambler%20portrait.png)

A leather harness holds glass fire-cases beneath the corpse's ribs. A cord burns
against the straps as it climbs out of the ditch and walks toward the wagons.

Homebrew for [[Session 01 — The Berruel Consignment]]: the ordinary
[[Zombie Shambler]] statistics, with Death Throes added. Count it as level 0
for that encounter; do not apply an elite adjustment on top.

```pf2e-stats
# Kindled Shambler
## Creature 0

---

==Medium== ==Mindless== ==Undead== ==Unholy== ==Zombie==

**Perception** +0; darkvision

**Skills** Athletics +7

**Str** +3, **Dex** -2, **Con** +2, **Int** -5, **Wis** +0, **Cha** -2

**Slow** The shambler is permanently slowed 1 and can't use reactions. It normally has two actions each turn.

---

**AC** 12; **Fort** +6, **Ref** +0, **Will** +2

**HP** 20; void healing; **Immunities** bleed, death effects, disease, mental, paralyzed, poison, unconscious; **Weaknesses** slashing 5, vitality 5

**Death Throes** (fire) **Trigger** The shambler is destroyed; **Effect** The fire-case explodes in a 5-foot burst, dealing 1d8 fire damage with a **basic Reflex** DC 15 save. A creature that fails or critically fails also takes @Damage[1[persistent,fire]]{1 persistent fire damage}. Flammable objects in the burst, including wagon timber, tarpaulins, and dry stores, catch fire. This happens automatically, not as a reaction.

---

**Speed** 25 feet

**Melee** `[one-action]` fist +7 (unarmed), **Damage** 1d6+3 bludgeoning plus Grab

**Melee** `[one-action]` jaws (Zombie Bite only) +7 (unarmed), **Damage** 1d8+3 piercing

**Grab** `[one-action]` **Requirements** The shambler's last action was a successful fist Strike, or it has a creature grabbed or restrained with its hands; **Effect** After the Strike, attempt to Grapple that target using Athletics +7 against its Fortitude DC. This attempt neither applies nor counts toward the multiple attack penalty. Alternatively, automatically extend a creature's existing grab or restraint with that hand until the end of the shambler's next turn.

**Zombie Bite** `[one-action]` **Requirements** The target is grabbed or restrained; **Effect** Make the jaws Strike against the target: +7 to hit, 1d8+3 piercing damage. Use the jaws Strike buttons; this action is the Strike, not an extra action before it.
```

The ordinary statistics come from Zombie Shambler, *Monster Core*, page 356.
Death Throes is a campaign ability, not the rules for throwing alchemist's fire.
Resolve its explosion and burning scenery manually using the sheet's buttons.
The session permits dousing the harness; the GM decides whether the fire-case
can still ignite after that intervention.
