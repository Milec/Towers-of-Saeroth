# Encounter design

Read this when tuning difficulty, designing terrain, or working out why an
encounter that looked correct on paper went wrong at the table.

## The budget is a floor, not a forecast

`encounter.py` gets the XP right, and XP is the least interesting thing about a
fight. Two encounters at an identical budget can differ enormously:

| Shape | Plays like |
|---|---|
| One creature at party level +3 or +4 | A boss. Dangerous burst damage, but the party's action economy grinds it down. Vulnerable to being stun-locked. |
| Two creatures at +0 to +1 | The most reliably tense shape. Neither side dominates the action economy. |
| Four or more at −2 or lower | A swarm. Individually trivial, but flanking and sheer volume of attacks add up fast. |

A lone boss is the shape most likely to disappoint, because one failed save
against an incapacitation effect can end it on round one. If the user wants a
climactic solo fight, suggest supporting minions, lair actions or terrain to
spread its action economy.

## Level gaps matter more than XP

A creature four levels above the party hits far more often and is hit far less —
the maths compounds across attack rolls, saves and AC simultaneously. Treat
party level +4 as the ceiling for anything the party is expected to beat by
fighting, and party level −4 as the floor below which a creature stops
meaningfully contributing.

When a user asks for something "really hard", reach for a severe or extreme
budget with a good shape before reaching for a higher-level creature.

## Difficulty levers that are not XP

Suggest these before inflating the budget:

- **Terrain.** Difficult terrain, elevation, cover and hazards change a fight
  more cheaply than extra hit points. A lower budget on interesting ground
  usually beats a higher budget in an empty room.
- **Objectives.** "Survive four rounds", "stop the ritual", "protect the
  merchant" reshape play without touching the numbers.
- **Starting conditions.** Ambushes, poor lighting, split parties and denied
  preparation all raise real difficulty while leaving the XP untouched.
- **Reinforcements.** Arriving on round three converts a moderate encounter into
  a severe one, and lets you read the table before committing.

## Reading the party

Budgets assume a party of roughly equal capability with a balanced spread of
roles. Adjust when that does not hold:

- No dedicated healer: treat one step up in threat.
- Strong area damage against a swarm shape: the encounter will land softer than
  the budget suggests.
- A single very optimised character: the spread widens; aim for shapes with
  multiple targets so one character cannot trivialise the fight alone.

## The attrition arc

PF2e assumes resources deplete across a day. A severe encounter opening the day
is very different from the same encounter as the fourth fight. When a user is
planning a dungeon or a session, ask what came before, and mention that a
moderate encounter late in a depleted day can be more dangerous than a severe
one at full strength.

## After the fact

If a fight went badly, the useful diagnostic questions are usually about shape
rather than budget: how many creatures, what the level spread was, whether the
party was ambushed, and whether one effect ended the fight early. Ask those
before recommending a change to the numbers.
