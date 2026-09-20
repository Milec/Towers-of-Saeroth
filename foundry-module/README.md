# Towers of Saeroth PF2e Content

This module is generated from the campaign's own Markdown notes. It publishes
homebrew creatures and NPCs as a native Foundry VTT PF2e Actor compendium, and
player ancestries as a native PF2e Item compendium. The
initial build discovers five existing campaign statblocks, including Skinwright,
The Cream Man, Wenzel Grauth, Garrick Thorne, and Ashwin Devaraj.

## Battle maps

**Saeroth Battle Maps** contains **Berruel Caravan — Roadside Ambush**, a
Foundry v14 Scene for Session 1. Import it from that compendium into Scenes.
The generated gridless image is included at
`modules/saeroth-pf2e-content/assets/maps/berruel-caravan-ambush.png`.
A standalone importable scene JSON is also supplied in
`content/scenes/berruel-caravan-ambush.json` (requires the installed module for art).

- 32 x 32 squares, 5 feet per square, 160 x 160 feet. The original raster is
  fitted to a 3200px square canvas; this does not increase its image detail.
- Three open-top wagons with movement-blocking sides; the short east side of
  each is an openable tailgate. Low sides do not block vision or lantern light.
- Two boulder outlines block movement, sight and light. Shallow ditch, crossings,
  brush and road exits remain traversable; adjudicate cover and terrain manually.
- Three warm animated lanterns: 20ft bright / 40ft dim. Dim global light and
  mild dusk darkness keep the open battlefield readable. Token vision is on.
- No actors or encounter spoilers are baked into the map or preplaced.
  Wagon artwork is part of the background, not movable tiles. If a wagon moves
  during play, adjudicate its position or use a separate tile and move its walls
  and light; this scene does not automate vehicle movement, fire, or terrain costs.

Build with `node foundry-module/scripts/build-scenes.mjs` after setting
`FOUNDRY_NODE_MODULES` as below. This writes only the scene pack and scene JSON;
the creature builder does not erase it. Run `node foundry-module/scripts/test-caravan-scene.mjs`.
The creature live-sync button does not import Scenes. Module installation and
scene import are separate steps; existing world scenes are not overwritten.

## Creature source format

An eligible NPC lives in `campaign/npcs/`; an NPC owned by a nation lives in
`campaign/nations/<Nation>/npcs/`; and a creature lives in
`campaign/world/bestiary/`. It has frontmatter with `type: creature` or
`type: npc`, and contains a `pf2e-stats` fenced block. The campaign note stays
the editable source of truth; the generated LevelDB pack is an output. The first
Markdown image in an eligible note is copied into `assets/actors/` and used as
both the Actor portrait and its prototype token texture. Their generated paths
are module-qualified, so portraits load from the compendium as well as after an
actor is dragged into a scene. An optional `token-image` frontmatter field
overrides only the prototype token, leaving the sheet portrait unchanged.
Use a percent-encoded path relative to the note, such as
`token-image: "Kindled%20Shambler%20token.png"`. Both images are packaged locally
and receive separate URLs in the runtime-sync feed. Older notes without this
field keep their existing portrait-as-token behavior.

### Stamped tokens

For new complete creature/NPC requests, create the full portrait first, then run
`node foundry-module/scripts/token-request.mjs "campaign/path/Creature Name.md"`.
Use its edit prompt and source portrait to produce a separate circular token:
dark iron ring, subtle aged-brass edge, readable face and identifying equipment,
and transparent corners. The approved local finishing step is
`python foundry-module/scripts/stamp-token.py INPUT OUTPUT --crop LEFT TOP RIGHT BOTTOM`.
It accepts a portrait or framed draft, stamps the same iron/brass rim, and saves
a 512px RGBA PNG with verified clear corners. Pillow is required. Choose a crop
that keeps the face and identifying equipment readable, inspect the result,
and retain the source. Existing outputs require explicit `--force` to replace.
Keep the full portrait as the note's first Markdown
image and add the helper's `token-image` field. Inspect both art and actual alpha
before packaging; a painted checkerboard is not transparency. Do not silently
replace older portraits or restamp unrelated creatures.

An eligible `type: ancestry` note is generated into the **Saeroth Ancestries**
compendium. Sanguinor reads its mechanics directly from Isaiah's campaign note;
its core ancestry values are native Foundry fields. A **Fed / Unfed** tracker
appears in the Actions tab of a Sanguinor character sheet and keeps the linked
effects synchronized. **Red Thirst** applies its melee damage, Intimidation,
and Will modifiers natively when combat begins while the tracker is Unfed.

## Portrait workflow

For a newly created creature or NPC, add a concise `portrait-prompt` field to
its frontmatter. Use the portrait-request helper to produce the standardized
prompt and intended output filename:

```powershell
node foundry-module/scripts/portrait-request.mjs "campaign/npcs/New NPC.md"
```

Generate that request with Codex ImageGen, save the selected PNG next to the
source note using the reported filename, and insert the reported Markdown image
line in the note. The default art direction is hand-inked dark fantasy: strong
black contour lines, cross-hatching, muted earth tones, expressive stylized
faces, and a charcoal-and-parchment atmosphere. `--check` scans all eligible
notes and returns a nonzero exit code while any portraits are ready to generate. A build refuses a note that has
`portrait-prompt` but no Markdown image, preventing a source change from being
published without its requested token art. The normal build then copies the
image into `assets/actors/` and references it from the Actor and token
automatically; no image URL or API key is needed.

## Build

Run the builder from the repository root after installing Foundry VTT. It needs
Foundry's bundled `classic-level` package to write the native compendium pack.
It also reads the installed PF2e system's `spells` pack so official spells retain
their current Foundry data. Set `FOUNDRY_DATA_DIR` only if the Foundry user-data
directory is somewhere other than `%LOCALAPPDATA%\\FoundryVTT\\Data`.

```powershell
$env:FOUNDRY_NODE_MODULES = "$env:LOCALAPPDATA\Programs\Foundry Virtual Tabletop\resources\app\node_modules"
node foundry-module/scripts/build-packs.mjs
```

The script validates frontmatter and the core PF2e stat lines before replacing
only `foundry-module/packs/saeroth-actors`. It builds NPC actor statistics,
melee strikes, action entries, and spellcasting entries. Action descriptions
turn common statblock mechanics into PF2e inline check, damage, Escape, and
template controls, as well as links to the standard PF2e conditions named in
an ability's text. Official spells are
copied from the installed PF2e system; a spell that is absent there becomes a
clearly marked placeholder while its source statblock remains in the actor's
public notes. Commit the generated pack with the source-note changes so a
GitHub release can ship an installable module zip.

If Foundry is running, its spell compendium is locked. In that case the builder
preserves official spell documents from the existing Saeroth pack while it
rebuilds the actors.
