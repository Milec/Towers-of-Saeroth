# Live integration verification — 2026-10-03

Environment: Foundry VTT 14.367, PF2e 8.5.0, authenticated local GM bridge.
Temporary documents were identified with `[MCP TEST 20261003]`. Tests used
inactive scenes; the existing active scene and encounter were not changed.

## Verified through the running bridge

- World status, document listing, search, and retrieval.
- Non-writing scene preview; malformed levels, missing assets, bad schema,
  missing actors, and invalid token floors are rejected.
- Scene creation with level background art, a door wall, light, and NPC tokens.
- Default and explicit upper-floor token assignment on a two-level scene.
- Loot actors, embedded inventory cloned from an Item UUID, and loot tokens.
- Journal entry creation and its linked scene note.
- Reversible document edits, removing newly added fields on undo, and rejecting
  embedded-collection edits or same-document conflicts.
- Portrait, prototype-token texture, and level-background assignment and undo.
- Asset intake into the approved Foundry asset directory.
- Actor publication to the Saeroth compendium and undo of that publication.
- Encounter preflight rejects invalid participants before creating tokens.
- Reconnection after client reload without changing the saved bridge token.

Live testing caught a v14 floor mismatch: tokens use `level`, not `levels`,
and a live Scene's `initialLevel` getter returns a Level document rather than
an ID. The bridge now selects and validates the appropriate ID. Four regression
tests cover these cases. All 25 tests passed both portably and with Foundry's
installed merge helper and field operators.

## Limits and cleanup

- Initiative rolls and combat start were tested with document doubles only;
  they were not invoked in the live world to avoid disturbing its encounter.
- Scene data was inspected; visual rendering of the test scene was not tested.
- Scene undo conservatively refused after subsequent embedded-document changes,
  even when those changes were undone. Test scenes were explicitly deleted;
  conflict checks were not weakened to ignore third-party module changes.
- All temporary world documents and the test compendium entry were removed.
  Final search returned no test documents. The copied test image was removed
  from Foundry's asset directory. No campaign assets were deleted.
- Undo history is session-local and is lost on client reload. Imported asset
  files and effects outside recorded documents are not covered by undo.
