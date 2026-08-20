#!/usr/bin/env python3
"""Squeeze the relations-web backdrop down to something a phone can hold offline.

`map_backdrop.js` writes a 3600x2150 PNG straight out of the renderer, which is
several megabytes. The whole campaign site is under a megabyte, and the service
worker precaches all of it, so shipping that PNG as-is would multiply what a
returning visitor downloads.

The backdrop is a soft-edged political map sitting behind a web of lines, so it
does not need pixel fidelity — it needs to read as a shape. Downscaling to 1800
wide and encoding as JPEG holds that at a fraction of the size.

    python3 tools/shrink_backdrop.py
"""
import json
import os
import sys

from PIL import Image

SRC = os.environ.get('SRC', 'site/map/saeroth-political.png')
DST = os.environ.get('DST', 'site/map/saeroth-political.jpg')
WIDTH = int(os.environ.get('WIDTH', 1800))
QUALITY = int(os.environ.get('QUALITY', 72))
POS = os.environ.get('POS', 'site/nation-positions.json')


def main() -> int:
    if not os.path.exists(SRC):
        print(f'{SRC} not found — run tools/map_backdrop.js first', file=sys.stderr)
        return 2
    im = Image.open(SRC).convert('RGB')
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    im.save(DST, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    before = os.path.getsize(SRC) / 1048576
    after = os.path.getsize(DST) / 1048576
    print(f'{SRC} {before:.1f} MB -> {DST} {after:.2f} MB  ({im.width}x{im.height}, q{QUALITY})')

    # map_backdrop.js names the PNG it just wrote; this step is what decides
    # which file actually ships, so it owns the pointer too. Forgetting this
    # leaves the page asking for a .png that has been deleted.
    if os.path.exists(POS):
        with open(POS, encoding='utf-8') as fh:
            pos = json.load(fh)
        pos['image'] = 'map/' + os.path.basename(DST)
        with open(POS, 'w', encoding='utf-8') as fh:
            json.dump(pos, fh, indent=1)
            fh.write('\n')
        print(f'{POS} now points at {pos["image"]}')

    # the PNG is a build artifact; only the JPEG ships
    os.remove(SRC)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
