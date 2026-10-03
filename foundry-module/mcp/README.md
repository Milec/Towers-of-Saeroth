# Foundry MCP bridge

This bridge lets an MCP client communicate with an **open Foundry world**
through an active GM browser client. It deliberately does not expose a Foundry
HTTP endpoint or listen beyond `127.0.0.1`.

## Setup

The companion relay requires Node.js 24 or later.

1. Generate a long random token. In PowerShell:

   ```powershell
   [guid]::NewGuid().ToString('N')
   ```

2. In Foundry, enable **Towers of Saeroth PF2e Content**, then open
   **Configure Settings → Module Settings**. Enable **Local MCP bridge**, paste
   the token into **Local MCP bridge token**, and leave the port at `32123`
   unless you need a different local port. Reload the world after saving.

   These settings belong to this browser, not the shared world. Configure only
   the GM browser on the same computer as the relay. Do not share that browser
   profile with untrusted users. When upgrading from the original bridge, it
   clears the old world token and disables the bridge in that GM browser. Use
   a **new** random token in both places; never reuse the formerly shared token.

3. Configure your MCP client to launch the bridge. Its working directory can
   be anywhere; the command must point at the installed module's `mcp` folder.
   On Windows, an example command configuration is:

   ```json
   {
     "command": "node",
     "args": ["C:\\path\\to\\FoundryVTT\\Data\\modules\\saeroth-pf2e-content\\mcp\\server.mjs"],
     "env": {
       "FOUNDRY_MCP_TOKEN": "paste-the-same-token-here",
       "FOUNDRY_MCP_PORT": "32123"
     }
   }
   ```

Keep Foundry open in that world with a GM account active. The MCP process will
report that no GM client is connected until it receives the module connection.

## Available tools

- `foundry_status` — confirm the connected world, Foundry version, PF2e system,
  and GM user.
- `foundry_list_documents`, `foundry_search_documents`, and
  `foundry_get_document` — inspect actors, items, scenes, journal entries, and
  roll tables.
- `foundry_create_document` and `foundry_update_document` — create or update
  those document types with Foundry's native document APIs.
- `foundry_build_scene` — create a ready-to-play v14 Scene from one native
  Scene source, including its levels/background art, walls and doors, lights,
  tiles, drawings, notes, sounds, regions, and tokens. Set `activate: true`
  only when the finished scene should immediately become the active scene.
  Tokens use a singular `level` ID (walls/lights use `levels`). Omitted token
  floors default to the scene's initial level; encounter and loot placement
  also use this default rather than the Actor prototype's default floor.
  Explicit token floors must exist in the target scene.
- `foundry_preview_scene` — validate that same Scene source without writing
  anything. Checks collection shapes/IDs, assets, coordinates, wall and other
  level references, world Actor references and bounds, then validates a transient
  Scene against the installed Foundry/system schema. Asset checks time out after
  five seconds; an unverifiable asset fails validation. Build runs the same
  validation before writing. This is not a rendered visual preview or a guarantee
  that other modules' creation hooks will accept the scene.
- `foundry_setup_encounter` — place NPC or creature participants, create an
  active Combat encounter, and optionally roll initiative. Set
  `rollInitiative: true` and `startCombat: true` to roll and then begin round 1, including normal
  combat-start effects. Both options default to false so staging does not start
  combat unexpectedly.
- `foundry_create_location_note` — create a Journal Entry and its linked map
  pin directly from campaign location text.
- `foundry_place_loot` — create a chest, merchant stock, loose item, or
  treasure parcel as a PF2e Loot Actor with real inventory and a scene token.
- `foundry_publish_to_compendium` — copy an approved Actor, Item, Scene,
  Journal Entry, or Roll Table into a compatible compendium without restart.
- `foundry_import_asset` — copy a supported image or audio file into
  `Data/assets/mcp`; `foundry_assign_asset` can then make it a portrait, token
  texture, or level background.
- `foundry_undo_operation` — undo an MCP creation or update while the same GM
  client remains connected. The bridge retains only the latest 50 operations.
  Updates restore only changed fields, including removing newly added fields;
  later unrelated edits are preserved. Editing a touched field, or editing a
  created document, causes undo to refuse the conflict before making changes.
  Generic document updates reject embedded collections and ID/statistic changes;
  use dedicated tools for creating collections or assigning level backgrounds.
- `foundry_activate_scene` — activate a Scene.
- `foundry_delete_document` — delete a document only when the caller supplies
  `confirm: true`.

The module only connects to a loopback relay after a GM enables it in that
world. The relay requires the same token on both sides, accepts one GM client,
and does not provide arbitrary macro or shell execution. A second GM connection
is rejected rather than displacing the first. Disabling the bridge disconnects
it immediately. Closing the MCP client's input shuts down the relay and releases
its port. The relay negotiates MCP `2025-06-18`; list/search structured results
are objects with a `results` array.

Multi-step creation failures trigger reverse-order cleanup. If cleanup itself
fails, the error includes remaining UUIDs and a recovery `operationId`; resolve
the error and call undo with that ID. Calls are serialized in the GM browser.
If a call times out or disconnects, its outcome may be unknown: inspect the
world before retrying, because an in-flight Foundry write cannot be cancelled.

Undo covers recorded documents/fields, not chat messages, combat-triggered
effects on other documents, time advancement, scene activation, imported files,
or explicit deletions. It is not a world snapshot. Close/reload loses its history.

## Asset intake

Set `FOUNDRY_MCP_ASSET_SOURCE_ROOT` to one approved folder before launching
the MCP server. `foundry_import_asset` accepts paths relative to that folder
only; it rejects absolute paths and paths escaping the configured root. It then
resolves symlinks and Windows junctions and rejects sources or destinations that
escape their approved roots. It copies supported images or audio to Foundry's local `Data/assets/mcp` directory
and returns a Foundry-ready asset path. This prevents general MCP calls from
reading arbitrary local files.

## Regression tests

Run `node --test foundry-module/scripts/test-foundry-mcp.mjs` from the repository
root. These tests cover document workflow doubles and a real relay subprocess
with disposable filesystem fixtures, including Windows junction escapes and
shutdown with a connected WebSocket. They do not operate on a live world.
Optionally set `FOUNDRY_API_ROOT` to the installed Foundry `resources/app` folder
to use its real merge helper and field operators in the undo tests. A disposable
live-world integration test is still required before claiming end-to-end support.
