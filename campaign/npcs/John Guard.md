---
title: John Guard
type: npc
level: 3
role: caravan guard
portrait-prompt: "A weathered human caravan guard in practical road-worn chain mail, holding a steel mace and a broad battered wooden shield, spare rope and a bedroll tied to his pack, watchful expression, wagon canvas and a dusty trade road behind him"
---

![Portrait of John Guard](John%20Guard%20portrait.png)

*John Guard*

John takes the outside watch because he sleeps poorly under a wagon roof. He
knows how to keep a caravan moving, where a wheel will fail, and which stretch
of road leaves too little room to turn a team around. He is not paid to be a
hero; he is paid to make sure someone else reaches the next town.

**Want:** a regular contract that keeps him on one road long enough to know its
dangerous turns.

**Won't:** leave a driver or pack animal behind while there is still a route
forward.

Stat block is a homebrew level 3 guard built from the PF2e creature-building
tables, using the published *Guard* (NPC Core) as its role reference.

```pf2e-stats
# John Guard
## Creature 3

---

==Medium== ==Human== ==Humanoid==

**Perception** +9

**Languages** Common

**Skills** Athletics +11, Intimidation +8, Survival +9, Caravan Lore +9

**Str** +3, **Dex** +1, **Con** +3, **Int** +0, **Wis** +2, **Cha** +0

---

**AC** 19; **Fort** +12, **Ref** +8, **Will** +9; AC 21 while shield is raised

**HP** 45

**Shield Block** `[reaction]` **Trigger** John has his shield raised and would
take damage from a physical attack; **Effect** John uses his shield to block
the attack, reducing the damage by 5 before applying the rest to himself.

---

**Speed** 25 feet

**Melee** `[one-action]` mace +12 (shove), **Damage** 1d6+6 bludgeoning

**Melee** `[one-action]` shield bash +12 (agile), **Damage** 1d4+6 bludgeoning

**Raise Shield** `[one-action]` John raises his shield, gaining a +2
circumstance bonus to AC until the start of his next turn.

**Hold the Line** `[one-action]` (manipulate) **Requirements** John is adjacent
to a wagon, pack animal, or ally; **Effect** John Raises his Shield. Until the
start of his next turn, the chosen adjacent creature gains a +1 circumstance
bonus to AC while it remains adjacent to John.
```
