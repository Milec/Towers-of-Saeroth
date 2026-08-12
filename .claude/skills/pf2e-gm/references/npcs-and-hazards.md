# NPCs and hazards

Read this when statting a creature or NPC, reskinning an existing one, or
building a trap or environmental hazard.

## Reskin before you build

The vault holds ~4,700 creatures and ~650 hazards. Almost any NPC a GM needs
already exists at the right level wearing different clothes. Reskinning is
faster than building and cannot go mathematically wrong:

```bash
python3 scripts/lookup.py find --type creature --level 4 --trait humanoid
python3 scripts/lookup.py show "Bestiary/<name>"
```

What is safe to change: name, appearance, description, damage type, trait list,
the flavour of abilities, and which skills are notable.

What to leave alone: AC, HP, saves, attack bonuses, damage dice and DCs. These
are tuned to the level and are what keep the fight feeling right. If you change
one, change it deliberately and know which direction you have pushed it.

A bandit captain, a cult enforcer and a mercenary lieutenant can all be the same
stat block. The players will never know, and the encounter maths stays sound.

## Building from scratch

When nothing fits, build to the level rather than by intuition. Each statistic
has a role, and PF2e's tight maths means small errors are felt:

- **AC and HP** set how long the creature survives. Raising both makes fights
  drag; raise one and lower the other to keep pace while changing texture.
- **Attack bonus and damage** set how threatening it feels. High attack with low
  damage feels relentless; low attack with high damage feels swingy and
  dangerous.
- **Saves** are where a creature's character shows most. A brute with a terrible
  Will save is a different tactical problem from a cunning one with a poor
  Fortitude save. Give every creature at least one clear weak save — it rewards
  players for probing.
- **Perception and stealth** decide who gets the drop on whom, which often
  matters more to how the fight opens than any combat statistic.

Use an existing creature of the same level as a yardstick throughout. Pull two
or three and compare rather than trusting memory.

## Giving a creature identity

A stat block becomes memorable through one or two distinctive things, not
through a long ability list. Prefer:

- a signature action that changes how players position themselves;
- a reaction that punishes an obvious tactic;
- a resistance or weakness that rewards the party for paying attention.

Three well-chosen abilities beat eight. Every extra ability is another thing to
track mid-fight, and complexity spent on a creature that dies in two rounds is
wasted.

## Hazards

Hazards are priced on the same XP scale as creatures, so they can be mixed into
an encounter budget directly — a trap plus two creatures is a legitimate build.

```bash
python3 scripts/lookup.py find --type hazard --level 6
```

Simple hazards fire once and are effectively terrain with teeth. Complex hazards
take turns on initiative and function as a participant in the fight; budget them
like a creature and expect them to shape positioning for the whole encounter.

The most common mistake is a hazard that only taxes hit points. A hazard that
moves characters, blocks a route, or forces a choice contributes far more than
one that deals damage and is forgotten.

## NPCs who are not obstacles

Not every NPC needs a stat block at all. A shopkeeper, a patron or an informant
needs a want, a lever and a voice — statistics only matter if violence is
plausible. When a user asks for a "quest giver", give them motivation and a
complication first, and offer stats only if the encounter might turn.
