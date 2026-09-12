# Towers of Saeroth PF2e Content

This module is generated from the campaign's own Markdown notes. It publishes
homebrew creatures and NPCs as a native Foundry VTT PF2e Actor compendium, and
player ancestries as a native PF2e Item compendium. The
initial build discovers five existing campaign statblocks, including Skinwright,
The Cream Man, Wenzel Grauth, Garrick Thorne, and Ashwin Devaraj.

## Source format

An eligible NPC lives in `campaign/npcs/`; an NPC owned by a nation lives in
`campaign/nations/<Nation>/npcs/`; and a creature lives in
`campaign/world/bestiary/`. It has frontmatter with `type: creature` or
`type: npc`, and contains a `pf2e-stats` fenced block. The campaign note stays
the editable source of truth; the generated LevelDB pack is an output. The first
Markdown image in an eligible note is copied into `assets/actors/` and used as
both the Actor portrait and its prototype token texture. Their generated paths
are module-qualified, so portraits load from the compendium as well as after an
actor is dragged into a scene.

An eligible `type: ancestry` note is generated into the **Saeroth Ancestries**
compendium. Sanguinor reads its mechanics directly from Isaiah's campaign note;
its core ancestry values are native Foundry fields, while its custom hunger and
Red Thirst rules remain formatted text for the player and GM to apply.

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
