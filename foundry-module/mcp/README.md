# Foundry MCP bridge

This bridge lets an MCP client communicate with an **open Foundry world**
through an active GM browser client. It deliberately does not expose a Foundry
HTTP endpoint or listen beyond `127.0.0.1`.

## Setup

1. Generate a long random token. In PowerShell:

   ```powershell
   [guid]::NewGuid().ToString('N')
   ```

2. In Foundry, enable **Towers of Saeroth PF2e Content**, then open
   **Configure Settings → Module Settings**. Enable **Local MCP bridge**, paste
   the token into **Local MCP bridge token**, and leave the port at `32123`
   unless you need a different local port. Reload the world after saving.

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
- `foundry_activate_scene` — activate a Scene.
- `foundry_delete_document` — delete a document only when the caller supplies
  `confirm: true`.

The module only connects to a loopback relay after a GM enables it in that
world. The relay requires the same token on both sides, accepts one GM client,
and does not provide arbitrary macro or shell execution.
