#!/usr/bin/env python3
"""Generate the app icons from a single letter in a real serif face.

The icon is a crimson serif S on the app's dark ground. The letterform is
extracted from Liberation Serif (Times metrics) and written out as a path, so
the SVG carries no font dependency and renders identically on a device that
has never heard of Liberation Serif.

    python3 tools/make_icons.py          # rewrites site/icons/*

**This needs two things the rest of the build does not**, and it is the only
script here that does: `fontTools` (pip) to read the glyph outline, and the
Playwright Chromium the browser tests use, to rasterize. That is a step down
from the version this replaced, which drew three towers out of rectangles and
triangles with a hand-rolled PNG encoder and needed nothing at all. Filling
bezier outlines in pure stdlib was not worth writing. The generated files are
committed, so a fresh checkout never has to run this — only a change to the
letter, the colour or the sizes does.

Two shapes come out of it, and the difference matters:

  icon.svg          rounded rect, for the browser tab and the manifest listing
  icon-{180,192,512}.png   full-bleed square, because iOS and Android launchers
                    apply their own mask. Baking a rounded corner into a PNG
                    that then gets rounded again leaves a dark rim.

The letter sits at 54% of the canvas height, which keeps it inside the
maskable safe zone (a circle of 40% radius) with room to spare.
"""
import os, subprocess, sys

LETTER = 'S'
FONT = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'
INK = '#c41e3a'          # crimson
GROUND = '#1b1a18'       # matches the manifest's background_color
SIZE = 512
HEIGHT_FRACTION = 0.54
CORNER = 96

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'site', 'icons')


def glyph_path():
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.boundsPen import BoundsPen
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    name = font.getBestCmap()[ord(LETTER)]
    bounds = BoundsPen(glyphs)
    glyphs[name].draw(bounds)
    x0, y0, x1, y1 = bounds.bounds
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(pen)

    # Glyph space is y-up; SVG is y-down. Scale to the target height, flip,
    # and centre what is actually drawn rather than the advance width.
    scale = SIZE * HEIGHT_FRACTION / (y1 - y0)
    tx = SIZE / 2 - scale * (x0 + x1) / 2
    ty = SIZE / 2 + scale * (y0 + y1) / 2
    return pen.getCommands(), scale, tx, ty


def svg(rounded):
    d, scale, tx, ty = glyph_path()
    ground = (f'<rect width="{SIZE}" height="{SIZE}" rx="{CORNER}" fill="{GROUND}"/>'
              if rounded else f'<rect width="{SIZE}" height="{SIZE}" fill="{GROUND}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" '
            f'role="img" aria-label="Towers of Saeroth">\n'
            f'  {ground}\n'
            f'  <path transform="translate({tx:.2f} {ty:.2f}) scale({scale:.5f} -{scale:.5f})" '
            f'fill="{INK}" d="{d}"/>\n</svg>\n')


def main():
    os.makedirs(ICONS, exist_ok=True)
    open(os.path.join(ICONS, 'icon.svg'), 'w', encoding='utf-8').write(svg(True))

    square = os.path.join(ICONS, '_square.svg')
    open(square, 'w', encoding='utf-8').write(svg(False))
    script = os.path.join(ROOT, 'tools', 'rasterize.js')
    for px in (180, 192, 512):
        out = os.path.join(ICONS, f'icon-{px}.png')
        subprocess.run(['node', script, square, out, str(px)], check=True)
        print(f'icon-{px}.png')
    os.remove(square)
    print('icon.svg')


if __name__ == '__main__':
    sys.exit(main())
