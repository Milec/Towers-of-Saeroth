# Towers of Saeroth PF2e Content

This module is generated from the campaign's own Markdown notes. It publishes
homebrew creatures and NPCs as a native Foundry VTT PF2e Actor compendium. The
initial build discovers five existing campaign statblocks, including Skinwright,
The Cream Man, Wenzel Grauth, Garrick Thorne, and Ashwin Devaraj.

## Source format

An eligible note lives beneath `campaign/`, has frontmatter with `type: creature`
or `type: npc`, and contains a `pf2e-stats` fenced block. The campaign note stays
the editable source of truth; the generated LevelDB pack is an output.

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
melee strikes, action entries, and spellcasting entries. Official spells are
copied from the installed PF2e system; a spell that is absent there becomes a
clearly marked placeholder while its source statblock remains in the actor's
public notes. Commit the generated pack with the source-note changes so a
GitHub release can ship an installable module zip.
