# Campaign workspace

The GM site opens at `#/workspace`. The three primary destinations are Campaign,
Library, and Atlas. Existing note and map links continue to work. The separate
player site and Foundry world retain their existing roles.

## Preparing a session

The campaign desk opens with the current working session. Its shortcuts jump to
notes, scene and NPC selection, encounter planning, or the Foundry download. The
encounter shortcut also opens the planner. The side rail holds the latest played
session, pinned references, recent entries, and expandable party and preparation
lists. Session status comes from the
maintained notes rather than assuming that the highest numbered preparation was
played.

Use **Add to session** on an entry or a library card to collect a reference
packet. Reorder its notes with the up/down buttons; remove a note with an undo
option. The checklist and scratchpad save as they are edited. They are personal
preparation, not changes to the Markdown campaign record.

### Keeping several sessions ready

**Saved sessions** keeps complete editable versions of your preparation in this
browser. Use **Save current prep** to save the title, reference packet, checklist,
scratchpad, NPC selections, map recipe, and encounter, including unfinished token
placements. An identical saved version is reused. Later edits stay in the working
copy until you save another version; earlier saved versions remain unchanged.

Opening a saved plan or starting a new session first saves the current working
preparation. If that save fails, the desk is not replaced. **Duplicate** makes a
separate starting point, while **Archive** hides an older version from the normal
list without deleting it. Pins, recently opened entries, and library layout are
shared desk preferences and do not change when you open a session.

Open **Backups & transfer** beneath the session title to download an
**editable session backup** and continue preparing it on another
device. Import adds a separate saved copy and leaves the current desk unchanged;
open the imported copy when ready. These files contain the map recipe and source
references, not the rendered map image or copies of campaign notes and actor
mechanics. Referenced content remains maintained by the campaign and PF2e system.
Use **Download session package** when you are ready to import content into Foundry.
The editable backup and Foundry import package are different formats.

The older desk-only format is under **Desk settings & older backups**. The
notes-only Foundry export is under **Export only the journal**. Recovery warnings
and recovery downloads remain visible when storage needs attention.

Saved versions live in IndexedDB, separate from the working desk's browser
storage. The library permits 200 records within 8 MiB; editable backup files are
limited to 2 MiB. Writes check the library revision inside a transaction, so an
older tab cannot silently overwrite another tab's saved versions. The interface
reports blocked or failed writes and offers recovery data for an unreadable
library. Switching the working desk also retains a recovery record until all
four existing stores have changed successfully; an interrupted switch is restored
before the desk loads again. Neither saved versions nor backups synchronize
automatically or publish campaign lore.

Session switching and recovery use the browser's Web Locks API to serialize
those operations across tabs. If another tab changes the working preparation,
this tab keeps its complete in-memory copy and stops writing the shared working
stores. Save that copy to the library or download it before reloading. This
avoids combining one tab's notes with another tab's map or encounter.

### Bringing a session into Foundry

The desk's **Session package** combines the reference packet, checklist and
scratchpad, selected NPC sheets, and one optional generated battle map in a
single JSON download. Use **Towers of Saeroth PF2e Content 0.4.0 or newer** in a
PF2e world running **Foundry VTT 14.364 or newer** to import it.

1. Give the session a title and add the campaign entries you need with **Add to
   session**. Their order becomes the journal's page order, after the session
   plan page containing the checklist and scratchpad.
2. Under **Session package**, open **Choose NPCs** and search for the sheets you
   want. Adding an NPC's note to the reference packet and selecting its actor
   sheet are separate choices.
3. For a map, choose **Choose in atlas**, select a landmark, custom POI, or
   settlement, and use **Generate battle map**. Adjust its layout, terrain, size,
   and lighting, then choose **Add to session** and return to the Campaign desk.
   The map card identifies the selected recipe and offers **Remove**. A session
   package contains at most one map.
4. Check **Package contents**, then choose **Download session package**. If the
   browser does not start the download, use the visible **Save session package**
   link. **Cancel export** leaves your preparation intact.
5. In Foundry, open the **Scenes** or **Journals** directory and choose **Import
   Saeroth Session**. Select the downloaded JSON, review the journal pages, map,
   and NPCs, then choose **Import session**.

For the prepared expedition, expand **Start with prepared expedition content**
and choose **Add preparation** for **Session 5 — The Search Camp**. It adds the
session, expedition-site and supply-recovery notes, plus Octavia Sere, Tavian
Calvo, and Renata Vellori with their actor references. Existing notes, NPC
selections, checklist, scratchpad, and a custom session title are retained;
repeating the action does not duplicate references. **Include its map** adds
**Old Survey Quarry — Supply Recovery**. If a map is already selected, this
checkbox starts unchecked; selecting it explicitly replaces that map. The quarry
is a generated encounter site, not a survey of the expedition camp.

The importer creates an unshared journal and, when selected, an inactive,
unshared Scene with the map's background, walls, doors, lighting, and five-foot
grid. An encounter can include explicitly placed opponents, imported as hidden
tokens. Without those placements, drag actors from Actors when preparing play.
Importing never activates the scene, rolls initiative, or starts combat.
The package does not require the local MCP bridge or a Script macro.

Map and journal artwork are embedded in the file and copied into the current
world's `saeroth-sessions` folder during import. NPC selections are references to
maintained Saeroth sheets, not embedded actor data: the importer first reuses a
matching world NPC unchanged, otherwise copies from the live-synced Saeroth
compendium or installed module pack. Existing HP, inventory, ownership, and GM
edits are preserved. Actor portraits and token art come from that source sheet.
If a sheet is missing, use **Sync Saeroth Content** or update the module, then
choose **Refresh preview**. Writing a new lore entry alone does not create a sheet.

Exports stop with a visible error if a selected note or its artwork cannot be
retrieved; no partial package is downloaded. Imports validate the file, native
documents, and artwork before creating content. Importing the same completed
package again keeps the earlier documents unchanged. Its identity comes from
the contents, so downloading it again at a different time does not make a new
copy. Changing the packet creates a separate snapshot, not an update to an
earlier imported journal or scene.

If an import fails, choose **Refresh preview** before retrying. After closing or
reloading Foundry, reopen the importer and select the file again.
**Resume import** is available for a failed claim or after five minutes without
progress; an active import must finish first. Recovery keeps existing documents
and attempts to remove only unchanged documents created by the failed operation.
Artwork uploaded before a failure can remain in `saeroth-sessions`; the error
reports retained content for review. Do not delete earlier working content to
retry a package.

### Planning an encounter

The session package's encounter planner starts with **five level-2 characters**.
Choose the party level, party size, and desired threat, then search the Saeroth
and PF2e creature lists. Set each creature's quantity to see the total budget,
remaining budget, actual threat range, and estimated award for each character.
The actor picker above the planner is still useful for camp staff and other
NPCs who are not opponents; selecting their sheets does not add their XP.

The standard creature list contains 1,705 references from the installed PF2e
8.5.0 Monster Core, Monster Core 2, NPC Core, Bestiaries 1–3, and NPC Gallery.
Only names, levels, traits, footprints, and source references are shipped on
the site. Foundry resolves the actual sheets from its installed system. The
book name distinguishes entries with the same name. Creature levels more than
four above or below the party are marked unbudgeted instead of assigned an
invented XP value. This planner covers creatures and standard proficiency;
it does not calculate hazard XP or Proficiency Without Level encounters.

The calculations deliberately match [Foundry PF2e 8.5's encounter calculator](https://github.com/foundryvtt/pf2e/blob/pf2e-8.5.0/src/scripts/macros/xp/index.ts).
Its Low budget adjustment is 15 XP per character, while the current
[GM Core table on Archives of Nethys](https://2e.aonprd.com/Rules.aspx?ID=2716)
prints 20. The rules profile is recorded in the plan and shown in its help.
Estimated XP awards normalize the total to four characters and round down;
they are not divided among the players and are never granted automatically.
Terrain, tactics, resources, and allies can change the practical difficulty.

To prepare token positions, select a generated map and enable map staging.
Choose an opponent and tap its starting square, or use the labeled row and
column controls. Place every opponent or return to roster-only mode. The
planner rejects overlapping tokens, positions beyond the image, and footprints
crossing movement-blocking walls. Review the artwork for terrain and tactics;
geometry validation does not judge whether a starting position is sensible.
Changing the map clears its positions. The importer checks the real actor's
level and footprint before writing; an edited or outdated sheet must be
reconciled with the plan rather than silently shrunk or replaced.

**Download encounter backup** saves the roster and map recipe for another
device. Restore previews the incoming plan before replacing the local one.
This is separate from the campaign desk backup and does not synchronize devices
automatically. A session export includes the encounter in version 2 of the
package; module 0.4.0 imports its actor sheets, adds a roster journal page, and
stages any selected tokens hidden and unlinked in the inactive scene. Version 1
packages remain supported. Reimporting a completed package does not reset tokens
or existing actor state.

The prepared expedition now includes one Orc Commander and two Orc Veterans:
100 XP, Moderate for five level-2 PCs, with an 80 XP award per character if XP is
used. Its optional encounter selection leaves an existing roster in place unless
replacement is explicitly selected. NPC portraits, notes, and the quarry map
remain separate selections.

### Exporting only the journal

**Export Foundry journal** remains available and downloads a native JournalEntry
JSON file. Create a
new, unshared Journal Entry in Foundry, confirm player ownership is **None**, and
use **Import Data** to import the file. Foundry preserves the destination entry's
permissions when importing, so an already shared journal remains shared. It contains
the scratchpad and checklist, then a page for each complete selected note in
packet order. The journal defaults to no player ownership. The export does not
create actors, alter scenes, or send commands to a running world. Use the session
package workflow above to bring a generated map and selected NPCs with the notes.

Links and artwork in the journal resolve to the website and require a network
connection from Foundry. Export fails with the unavailable note's name if any
selected note cannot be retrieved; it does not silently download a partial
packet. Imported journals are snapshots, not live-synchronized documents.

## Browsing the world

The Library provides category filters, name/type sorting, cards or a compact
list, and full-text campaign search. Images load only for cards being viewed.
Titles, summaries, and thumbnails are derived at build time from maintained
notes; they do not replace or rewrite the notes. Large results are paginated.

Global search (`Ctrl/Cmd+K` or `/` outside an input) searches campaign lore,
atlas places, and PF2e rules. Accents and query-word order are optional. Use the
arrow keys and Enter to open results. The large rules index is fetched only
when needed and shared by concurrent requests. Campaign search covers complete
notes, including statblocks, rather than stopping at 6,000 characters. Rules
search remains by title.

An entry's guide lists its sections and connected entries. The preview buttons
open a reference without losing the current entry or scroll position. The guide
also offers a copyable link and, for maintained campaign notes, **Edit entry**
opens the website editor. On smaller screens, the outline appears in a disclosure
near the title and connected entries appear below the article. Portraits can be
opened at full size.

## Writing and publishing entries

Choose **New entry** in the Library or navigation drawer, or **Edit entry** on
an existing campaign note. Templates cover NPCs, creatures, locations, sessions,
factions, and lore. NPCs can belong to a nation or remain independent; creatures
file under the bestiary. The editor offers Markdown formatting and a sanitized
preview, with properties and existing note paths preserved. A creature's lore
entry does not automatically create a Foundry actor: the maintained PF2e content
workflow still supplies its mechanics and module packaging.

Drafts save on this device as you write. The draft tray reopens multiple works
in progress; Markdown downloads provide a portable copy of the writing. Drafting and previewing
do not require a publishing connection. Browser storage failures are shown and
navigation warns before leaving writing that could not be saved.

Use **Image** to upload a PNG, JPEG, or WebP from this device, preview it, and
write its alt text. The editor prepares one uploaded image per draft; existing
image links remain supported. Source images can be up to 20 MiB, 8192 pixels
per side, and 40 megapixels. The published copy is a static WebP at most 2048
pixels per side and 2 MiB. Camera and location metadata are removed; a color
profile can remain to preserve the image's appearance.

Prepared artwork is saved in this browser alongside its draft. A draft backup
with artwork includes both the writing and image in a JSON file; restoring that
backup recovers both. A Markdown-only download does not include the image.
If browser image storage fails, the editor keeps an in-memory copy and shows a
warning: download the complete backup before closing the tab. A saved draft
whose artwork is missing cannot silently publish without it.

To publish, connect an author account using a fine-grained GitHub token scoped
to **Milec/Towers-of-Saeroth**, with **Contents** and **Pull requests** read/write
permissions. The account must have write access to this repository. The token
stays in memory for the current website tab; it is not saved in browser storage
or included in a draft or backup. Closing or refreshing the tab requires a new
connection. Never put the token in an entry.

**Publish** creates a review branch behind the scenes. Repository verification
must pass before the publishing workflow merges the entry and starts a Pages
deployment. The editor shows publication status and a review link; a merged
entry still needs the deployment to finish before it appears on the live site.
You can continue editing a pending publication. Existing edits compare against
the original repository version and stop for reconciliation if that note has
changed elsewhere. Retrying an interrupted request recovers the pending
publication instead of silently creating duplicates.

The note and uploaded artwork are committed together, so publication cannot
point at a file waiting for a second upload. Artwork filenames include a content
fingerprint and live beside the note. Replacing a staged upload does not
overwrite or remove previously published artwork. Pending publications retain
their image when reopened through a publishing connection on another device.

Only campaign Markdown and its one declared uploaded WebP can be published this
way. New entries also gain a link
in **Campaign Library** so they remain discoverable. The publishing workflow
validates the author, exact files, original note version, image bytes and
fingerprint, Markdown image reference, and passing checks;
it does not accept arbitrary application or workflow changes from this editor.
The normal player-site boundary remains in place.

## Using the atlas

The atlas has four task views, with one visible at a time:

- **Places**: search, selected-place details, custom pins, and the catalogue.
- **Travel**: route planning, hexcrawl, and party position.
- **Layers**: map style, visibility, labels, legend, and downloads.
- **Saved**: saved places, camera views, backups, and custom-pin publication.

On phones, choose a view to reach its controls and use **Back to map** to return
to the map. Switching views preserves selections and travel state. A selected
place also has a compact map card for the actions used most often.

The Places search accepts accents optionally, supports keyboard selection, and
filters campaign POIs, nations, settlements, landmarks, regions, and routes.
Published campaign locations are offered on the atlas landing view.

Select a place to save it, copy its deep link, focus the map, set the party's
location, or use it as a route endpoint. Nearby places use straight-line
distance; the existing journey planner remains the road/trail travel estimator.
The map's party button finds the normal party marker or the active hexcrawl
party.

Saved views store a name, camera position, map style, and layer choices. They do
not replace terrain, borders, populations, routes, custom POIs, or hexcrawl
progress. The existing POI publication and travel workflows remain available.

### Generating a battle map

Select a landmark, custom POI, or settlement and choose **Generate battle map**
in its Places details. The generator loads on demand and opens a focused preview.
It suggests a layout from the place's type and description. An explicitly chosen
custom POI kind takes priority over prose mentions of other locations. These are
generated encounter sites, not additions to campaign canon or precise surveys
of the atlas terrain.

Choose from roads, camps, ruins, caves, shrines, inns, forts, bridges, and towers.
Terrain choices cover forest, mountain, grassland, desert, snow, wetland, and coast.
Maps are 24, 32, or 40 squares across, with 5-foot squares. **Reroll layout** makes
a new arrangement; **Previous** restores a prior choice. Preview grid and
wall/light overlays help inspect the layout and never appear in downloaded art.
The daylight/darkness selection is exported as Foundry lighting; the image itself
remains unlit so Foundry can render dynamic light.

The latest recipe for each place saves in this browser, separately from POI notes.
No existing location, route, party marker, or atlas record is modified. Under
**Seed & portable recipe**, download a small JSON recipe to keep a map or move it
to another device. Open the same POI there before loading the recipe. The seed,
generator version, layout, terrain, and size reproduce the map. Storage failures
are visible, corrupt data is kept for recovery, and reaching the 1,000-layout
limit leaves existing layouts intact.

**Add to session** selects this layout for the Campaign desk's session package.
Only its small recipe is saved; the full-size image is rendered when the package
is downloaded. This action does not add a tab or change the place's geography.
Use the resulting **Open Campaign desk** link to finish choosing notes and NPCs.

**Download map image** exports a gridless PNG at 100 pixels per square.
**Export to Foundry** downloads a self-contained Script Macro JSON, including
WebP artwork, matching walls and doors, windows, terrain blockers, light sources,
and the scene's 5-foot grid. No extra importer module is required.

To use that export in Foundry VTT **14.364 or newer**:

1. As GM, create a new **Script** macro in the Macro Directory.
2. Right-click the new macro and use **Import Data** to load the downloaded JSON.
3. Execute the macro. It uploads the bundled artwork to the current world's
   `saeroth-atlas` folder and adds the scene to the Scenes directory.

The importer verifies the image before creating the scene. It never activates
the scene, places actors, or overwrites an existing scene. Repeating the same
import finds its previous scene and keeps it unchanged. If scene creation fails
after an upload, the error identifies the retained artwork folder; no blank
scene is created. Upload permission is required. Downloads retain visible save
links for mobile browsers.

## Storage and portability

The campaign desk and atlas workspace save in this browser. Each offers a JSON
backup and a validated, merge-only import to move to another device. They do not
automatically synchronize between a phone and a computer. Existing entries are
kept during import; invalid backups cannot replace working state. Unreadable
saved data can be downloaded for recovery. Storage failures are shown rather
than claiming that a change was saved.

Campaign desk backup contains the personal notes it describes. Atlas workspace
backup contains saved place references and camera views, not travel progress or
custom POIs. Existing travel and POI controls manage their own state.

Session-package NPC selections and the chosen map recipe also stay in this
browser, but are stored separately from the desk backup. The current desk backup
does not include those selections. **Saved sessions** combines the editable desk,
NPC selections, map recipe, and encounter into one portable backup. Use that
backup to continue preparation on another device. Download the session package
to take prepared content into Foundry; it is an import snapshot, not a
website-draft backup. The older desk and encounter backup formats remain usable
for their original purposes.
Unreadable selections are preserved for recovery, and storage warnings distinguish
changes kept only in the open tab from changes saved on the device.

The GM website remains publicly served GitHub Pages content; navigation labels
are not access control. No GM material is copied into `players/` by these tools.

## Implementation and checks

- `site/workspace.js` and `workspace.css`: campaign desk, library, storage,
  portable backup, and Foundry journal export.
- `site/session-library.js` and `session-library.css`: saved preparation versions,
  opening, duplication, archiving, and complete editable backups.
- `site/session-library-model.mjs` and `session-library-store.mjs`: bounded session
  data and transactional browser storage with optimistic revision checks.
- `site/session-prep.js`: coordinates the existing desk, NPC, map, and encounter
  stores, with validation and interrupted-switch recovery.
- `site/session-export.js` and `session-export.css`: session-package selection,
  prepared expedition content, embedded artwork, and download.
- `site/session-presets.json`: maintained note, NPC, and map-recipe presets.
- `session-actors.json` (build output): eligible actor references from the module's
  runtime feed; lore-only entries are not offered as actor sheets.
- `foundry-module/scripts/session-package.mjs`: shared, versioned data contract,
  copied into the website build; `session-inbox.mjs` validates and imports it in
  Foundry through the document APIs.
- `site/search.js` and `search.css`: scoped, ranked search and focus handling.
- `site/reader.js` and `reader.css`: entry guide and connected-note previews.
- `site/editor.js` and `editor.css`: authoring, draft recovery, and preview.
- `site/editor-images.js`: image preparation, local artwork storage, and recovery.
- `site/editor-asset.js`: shared image contract for the browser and trusted merge guard.
- `site/publisher.js`: guarded repository publication and conflict detection.
- `.github/workflows/campaign-editor-auto-merge.yml`: verified entry publication.
- `site/sanitize.js` and `site/vendor/`: shared Markdown HTML sanitization.
- `site/shell.css`: shared navigation, responsive layouts, and theme tokens.
- `site/atlas/workbench.js` and `workbench.css`: atlas navigation and saved views.
- `site/atlas/panels.js` and `panels.css`: grouped atlas task navigation.
- `site/atlas/battlemaps.js` and `battlemaps.css`: POI generator, recipes, preview,
  and downloads; the engine and Foundry adapter load only on first use.
- `site/atlas/battlemap-engine.js`: deterministic geometry and Canvas artwork.
- `site/atlas/battlemap-foundry.js`: native v14 scene and embedded-art importer.
- `tools/build_site.py`: complete searchable text and display metadata.

Build with `python tools/build_site.py --no-vault` for iteration and the full
build for release. Existing atlas and website browser checks are retained.
Additional checks in `tools/atlas-tests/` are `workspace.cjs`, `workbench.cjs`,
`search.cjs`, `reader.cjs`, `editor.cjs`, `editor-publisher.cjs`, `publisher.cjs`,
`editor-auto-merge.cjs`, and `panels.cjs`. Publisher tests use a simulated GitHub
service and do not send real credentials or publish fixture notes.
Battle map checks are `battlemap-engine.cjs` (geometry and reachable entrances),
`battlemap-foundry.cjs` (import safety and schema), and `battlemaps.cjs` (browser
generation, storage, downloads, keyboard controls, and responsive layouts).
Native schema checks also run when a local Foundry installation is available;
tests do not write to a world database.
`session-package.cjs` checks the complete browser export, presets, embedded
artwork, stable identities, cancellation, and storage recovery. Run
`node foundry-module/scripts/test-session-inbox.mjs` for the importer's validation,
rollback, duplicate-import, and recovery checks, including native schema checks
when Foundry is installed. These use in-memory documents, not a running world.
`visual-review.cjs` optionally produces screenshots
at phone, tablet, and desktop widths in both themes. Use `ATLAS_TEST_URL` for the
preview URL and `CHROME_PATH` when using an installed browser.

The design prioritizes the connected entries and map navigation found in
[LegendKeeper's atlas](https://www.legendkeeper.com/features-maps/) and the
campaign preparation described by [World Anvil](https://www.worldanvil.com/),
while retaining Saeroth's Markdown sources and Foundry play workflow.
