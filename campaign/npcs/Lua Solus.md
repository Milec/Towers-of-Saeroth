---
title: Lua Solus
type: npc
level: 12
role: half-elf princess and moon priestess
portrait-prompt: "Lua Solus, an adult half-elf princess and priestess of the moon, with subtly pointed ears, warm olive skin, expressive gray eyes and long silver-white hair braided back from her face. She wears a delicate silver crescent circlet, layered ivory and muted midnight-blue priestly robes, and a weathered silver clasp. She holds a slender crescent-topped ceremonial staff beside her shoulder. Calm, watchful and compassionate, with the bearing of someone accustomed to royal audiences; waist-up portrait against faint moonlit stone arches and a subdued night sky. Her face and circlet remain clearly visible in a token crop."
---

![Portrait of Lua Solus](Lua%20Solus%20portrait.png)

*Half-elf princess and priestess of the moon*

Lua keeps a chair beside the temple door for anyone who cannot stand through an audience. She listens there before taking petitions to court, recording names and promises in a small book she carries beneath her robes. When a courtier interrupts someone asking for help, she asks the petitioner to finish.

**Want:** secure a royal guarantee of sanctuary for those seeking shelter at her temple.

**Won't:** surrender a person under her protection merely to settle a political dispute.

**Placement:** her kingdom, royal house and patron deity are left open for the GM. These personality details are proposed campaign lore.

## At the table

Lua opens with heroism if she has warning, then stays within 30 feet of those she is protecting. She uses healing and Moonlit Intercession to keep allies standing, and Moonlight Ray against a dangerous single foe. Crescent Flare buys space when enemies close in. She accepts surrender and pursues an escape route before risking the lives of bystanders.

Homebrew statistics use the level 12 spellcaster benchmarks in GM Core: moderate AC, low HP and Fortitude, high Will and spell DC. Royal status grants no additional combat bonuses.

```pf2e-stats
# Lua Solus
## Creature 12
---
==Unique== ==Medium== ==Elf== ==Human== ==Humanoid==
**Perception** +22; low-light vision
**Languages** Common, Elven, Empyrean
**Skills** Diplomacy +25, Medicine +22, Religion +25, Society +22, Court Lore +22
**Str** +2, **Dex** +3, **Con** +3, **Int** +4, **Wis** +7, **Cha** +5
**Items** ceremonial staff, crescent holy symbol, priestly robes, royal signet
---
**AC** 32; **Fort** +19, **Ref** +22, **Will** +25
**HP** 160

**Moonlit Intercession** `[reaction]` (divine) **Trigger** An ally within 30 feet whom Lua can see would take damage from an attack; **Effect** Lua wraps the ally in silver light, granting resistance 12 to all damage against the triggering attack only. Apply this resistance to each damage type separately, using only the highest applicable resistance to each type. This does not protect Lua herself.

---
**Speed** 25 feet

**Melee** `[one-action]` ceremonial staff +20 (two-hand d8), **Damage** 3d6+10 bludgeoning

**Divine Prepared Spells** DC 32, attack +24; **6th** heal, spirit blast, moonlight ray; **5th** breath of life, dispel magic, sending; **4th** divine wrath, unfettered movement, spiritual armament; **3rd** heroism, clear mind, blindness; **2nd** resist energy, see the unseen, sound body; **1st** bless, sanctuary, fear; **Cantrips (6th)** divine lance, guidance, light, shield, stabilize

**Crescent Flare** `[two-actions]` (cold, concentrate, divine, light, manipulate) **Frequency** once per 10 minutes; **Effect** Lua releases freezing moonlight in a 30-foot cone. Creatures in the area take 8d6 cold damage (**basic Reflex** DC 32). A creature that fails its save is also dazzled for 1 round (or 1 minute on a critical failure). The dazzled effect has the visual trait. Lua cannot exclude allies from the cone.

**Lunar Benediction** `[one-action]` (concentrate, divine, healing, vitality) **Frequency** once per day; **Effect** Lua touches herself or one willing living creature within her reach. The target regains [[/r 6d8+24]] Hit Points. This is a vitality healing effect and does not restore Hit Points to a creature with void healing.
```

*Rules reference: GM Core creature-building tables; official spells use their PF2e rules. Custom abilities are homebrew. Apply the reaction's temporary resistance and custom ability durations manually; Foundry provides the embedded rolls and condition links.*
