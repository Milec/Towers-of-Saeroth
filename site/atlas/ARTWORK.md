# Painted atlas artwork

Created with the built-in image generator. The final source sprite sheet is `assets/painted-atlas.png`. Inkscape exports each cell to its own transparent `assets/painted-00.png` through `painted-23.png` file, used directly by SVG image symbols. The original generated PNG is retained. Inkscape rendered a chroma-key SVG once into `assets/painted-atlas-transparent.png`, the RGBA sheet used by the map; no per-icon background filters run on the phone. The initial transparent-background request returned a baked checkerboard, so the built-in generator replaced that background with magenta. The functional danger skull, crowns, anchors and trade badges remain vector symbols.

Highforge is shown as a mountain hold, with its surface gate at the relocated capital. Its province, population, name and culture are retained; its coastal port flag is removed and a mountain road links it to the existing network.

## Prompts

Final combined-sheet prompt (the earlier three-sheet request failed with a service error):

Create ONE production sprite atlas for a beautiful hand-painted fantasy world map. Actual transparent alpha background, no paper, white, checkerboard pattern, labels or frames. EXACT regular invisible grid of SIX columns and FOUR rows, 24 independent centered illustrations, generous 12% empty margins within every cell, no overlapping cells. Landscape 3:2 composition, high resolution. All sprites in fine engraved ink with rich restrained watercolor, realistic miniature structures, elevated oblique perspective and light from upper left. ROW 1 left to right: rugged connected snowy alpine mountain range; alternate weathered rocky mountain range; rolling foothills; dense broadleaf grove; dense pine grove; tropical palm grove. ROW 2: sand dunes; wetland reeds and pools; rustic village of three cottages; larger market town; walled city with keep; sprawling metropolis with walls and spires. ROW 3: magnificent DWARVEN MOUNTAIN HOLD embedded in rock with great stone gate and forge chimney (no harbor); coastal port settlement with docks; active volcano with glowing crater and lava; mighty stone fortress; winding pass between rocky cliffs; ancient ruined stone buildings. ROW 4: mine portal in rocks; ornate woodland shrine; waterfall with turquoise pool; lighthouse on rocky outcrop; timber wayside inn; cave mouth in rocks. A coherent premium fantasy cartographic asset set, muted grey stone, sage/forest green vegetation, warm ochre and russet/slate rooftops, delicate dark outlines, varied intricate silhouettes, readable at small sizes, no simplistic triangles or flat pictograms. Each entire subject must fit inside its own square cell. Preserve actual transparency.

Background correction: preserve all 24 sprites, dimensions and positions; replace the baked checkerboard with flat #FF00FF magenta for rendering-time transparency masking.

terrain

A production sprite sheet for a beautiful interactive high fantasy world atlas. EXACT 3 columns by 3 rows, nine equally sized square cells, perfectly regular invisible grid, generous empty transparent gutters and no overlap between cells. Read left to right, top to bottom: 1 long rugged alpine mountain RANGE with many connected asymmetric peaks and snowy crags; 2 a different weathered mountain RANGE with narrow ridges; 3 rolling foothills; 4 dense broadleaf woodland grove; 5 dense conifer woodland grove; 6 tropical palm jungle grove; 7 sweeping sand dunes; 8 wetland reeds and pools; 9 ice-covered glacial ridge. Each entire object centered inside its own cell with at least 12 percent empty margins. Style: sophisticated hand-painted fantasy cartography, delicate etched ink, watercolor washes, realistic natural structure, warm grey rock, sage and pine green foliage, subdued ochre. Oblique elevated view, light upper left, consistent scale. Not simple triangles, not flat pictograms, not game UI buttons. No text, no lettering, no borders, no circles or bases. ACTUAL TRANSPARENT alpha background, no paper, no white, no checkerboard drawn into image. Output square high resolution sprite atlas.

settlements

Production sprite sheet for a hand-painted fantasy world map, EXACT 3 columns by 2 rows, six equally sized square cells in a regular invisible grid. Overall image 3:2 landscape. Read left to right, top to bottom: 1 tiny rustic village of three timber cottages; 2 a market town with several timber and stone houses and a modest tower; 3 a walled city with many slate-roofed buildings and a keep; 4 a grand metropolis with dense varied buildings, outer walls and cathedral spires; 5 a monumental DWARVEN MOUNTAIN CAPITAL, fortress halls embedded in rugged rock with a great stone gate, forge chimney and switchback approach, no sea or harbor; 6 a coastal port town with docks and two tiny moored sailing vessels. Each object centered in its own cell, entirely contained with generous 12 percent empty margins. Consistent elevated oblique view, detailed pen and watercolor fantasy cartography, cream limestone, dark timber, muted terracotta and slate roofs, realistic architectural massing, delicate fine dark ink edges, readable silhouette. These should look like beautiful miniature architectural illustrations, not flat icons. No text or lettering, no circles, no UI badges, no tile base, no background landscape outside the compact subject. ACTUAL TRANSPARENT alpha background with no white paper and no baked checkerboard. High resolution.

landmarks

Production sprite sheet for a richly illustrated fantasy atlas. EXACT 4 columns by 3 rows, 12 equally sized square cells in a regular invisible grid. Overall image 4:3 landscape. Left to right top to bottom: 1 active volcanic massif with glowing crater, lava and restrained smoke; 2 formidable stone fortress; 3 a winding mountain pass between two rugged cliffs; 4 crumbling ancient stone ruins; 5 mine entrance cut into rocky hillside with timber supports; 6 forest shrine with a small ornate roof; 7 waterfall spilling into a turquoise pool; 8 tall lighthouse on a rocky outcrop; 9 inviting timber wayside inn; 10 dark cave in limestone rocks; 11 ominous animal skull with weathered horns, hazard marker; 12 slender mysterious ornate ancient tower. Each subject completely contained centered in its cell, at least 12 percent transparent margins, no overlap. Cohesive hand-painted fantasy cartography, fine engraved ink details with watercolor washes, realistic materials, oblique aerial miniatures, muted stone greys, sage green, ochre and slate, small warm red accents. Sophisticated detailed illustrations with legible silhouettes, not flat vector pictograms. No text, no frames, no discs, no tile bases. ACTUAL TRANSPARENT alpha background, not white, not parchment, no baked checkerboard. High resolution.


## Current display treatment

`assets/blended-00.png` through `blended-23.png` are the current map symbols. `scripts/blend_atlas_icons.py` writes the SVG treatments; Inkscape bakes the palette, edge cleanup and bottom fade. The original painted sprites are retained as source assets.


## September 8: progressive cartography artwork
Built-in image generation, one image per icon; then a built-in edit replaced the simulated checkerboard with flat magenta. Inkscape removes that key and applies the existing muted palette. Individual transparent PNG assets are assets/detail-bridge.png, assets/detail-pass.png and assets/detail-harbor.png. Original pixels are preserved in the sibling -source.png files.

### Generation prompts
**bridge**

Create one isolated fantasy atlas map icon, hand painted ink-and-watercolor with fine etched lines, matching an antique geographic map. Muted olive gray vegetation, warm gray limestone, weathered brown details, soft natural edges. Elevated three-quarter cartographic view. No text, border, badge, labels or backdrop. True transparent RGBA background, NOT checkerboard. Center the entire icon with generous empty margin, compact readable silhouette, very subtle ground contact fading to transparency. Subject: an old three-arch stone bridge, running diagonally from bottom left to top right, tiny moss accents, open arches. Only the bridge; no river painted beneath it.

**pass**

Create one isolated fantasy atlas map icon, hand painted ink-and-watercolor with fine etched lines, matching an antique geographic map. Muted olive gray vegetation, warm gray limestone, weathered brown details, soft natural edges. Elevated three-quarter cartographic view. No text, border, badge, labels or backdrop. True transparent RGBA background, NOT checkerboard. Center the entire icon with generous empty margin, compact readable silhouette, very subtle ground contact fading to transparency. Subject: a narrow winding mountain trail through a saddle between two weathered rocky ridges, small snow caps and two tiny pines, naturally tapered foothills. No fort or buildings.

**harbor**

Create one isolated fantasy atlas map icon, hand painted ink-and-watercolor with fine etched lines, matching an antique geographic map. Muted olive gray vegetation, warm gray limestone, weathered brown details, soft natural edges. Elevated three-quarter cartographic view. No text, border, badge, labels or backdrop. True transparent RGBA background, NOT checkerboard. Center the entire icon with generous empty margin, compact readable silhouette, very subtle ground contact fading to transparency. Subject: a small medieval harbor entrance with two curved stone breakwaters and a squat beacon tower, one tiny brown sailboat nestled between the jetties. No ocean or large patch of water painted beneath it.

### Background edit
Preserve subject and canvas; replace every background/checkerboard pixel with perfectly flat pure magenta #FF00FF, including open arches and gaps between harbor elements. No background shadow, texture or vignette.


## Road-aligned mountain pass
Generated replacement asset: detail-pass-aligned.png. Prompt requested top-down ink/watercolor stone ridges above/below a horizontal central ochre trail, transparent background, no text or frames. Generated image included a checkerboard, so a second built-in edit replaced that background with pure magenta while preserving the artwork. The existing Inkscape chroma-key/palette filter creates the transparent production PNG. PNG metadata unsupported by Inkscape was stripped without altering pixel data. Original generated source retained outside the project and keyed source retained as detail-pass-aligned-source.png. Rotates against actual road tangents with a measured center anchor; original pass sprite retained.
