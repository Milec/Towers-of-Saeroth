# Atlas usability pass

## Findings and changes

- Place information was beneath the long control stack. Selected details now
  follow the search and presets, with quick links to route planning, hexcrawl
  and map options. On desktop, selecting a record returns the sidebar to its top.
- Journey and travel settings were expanded on first load. They start closed;
  explicit navigation and the existing Start here / Travel here actions open them.
  A restored unfinished journey reopens automatically.
- Mobile navigation omitted hexcrawl. A dedicated shortcut now opens it, alongside
  Map, Journey and Place details. Navigation uses immediate scrolling, visible
  focus, and scroll margins for the sticky bar.
- Choosing a hex gave no instruction on the map itself. A cancellable on-map
  prompt now shows while choosing; mobile selection returns to the action controls.
- Hex coordinates dominated the everyday flow. They are now an optional disclosure
  with paired inputs. Travel speed is available within hexcrawl and synchronized
  with the journey planner. Terrain choices and saved data retain their meanings.
- Invalid journey names produced only a general message. Invalid fields are now
  marked and the first error receives focus. Route calculation exposes busy state
  and disables its submit button while running.
- The hex renderer replaced all geometry and status text on every camera update.
  Grid bounds and trail geometry are now cached separately. Repeated unchanged
  camera updates preserve those DOM nodes; panning does not rebuild the trail or
  reannounce unchanged progress. Disabled hexcrawl skips camera redraws entirely.
- The 761–800 px layout mixed desktop columns with phone navigation. The column
  transition now matches the navigation breakpoint. Form text remains at least
  16 px, and primary controls retain touch-sized hit areas. The phone map uses
  less vertical space at world scale while retaining a 300 px minimum height.

## Verification and limits

The dedicated usability browser suite covers shortcuts, initial disclosure,
validation focus, synchronized travel mode, map cancellation, unchanged-render
node identity, narrow-phone/landscape/desktop layouts and light/dark themes.
The existing atlas, hexcrawl, wiki navigation, cache and journey tests cover the
surrounding behavior. Performance assertions concern avoided DOM reconstruction,
not a claimed end-to-end frame-rate or load-time improvement.

This pass does not alter geography, campaign lore, route costs, map records,
or cross-device storage. Routing still computes on the main thread; moving it
to a worker would be a separate performance project. No automatic encounter
or terrain-detection rules were added.
