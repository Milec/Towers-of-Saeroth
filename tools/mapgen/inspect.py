#!/usr/bin/env python3
"""Fail a generated map on the things a person notices by LOOKING at it.

The build already prints every number this reads. The problem was that none of
them ever *failed*, so a map could report "15/15 borders, 27/28 terrain" while
Stoneborn Holds sat 12 degrees inside the arctic and Corvane Republic had slid
21 degrees south into a lobe four times its size. Both were visible at a glance
and neither tripped anything.

    python3 tools/mapgen/inspect.py                 # after a build
    python3 tools/mapgen/inspect.py --profile X.json
    python3 tools/mapgen/inspect.py --quiet         # only failures

Exits non-zero if any check fails, so a sweep can rank on it.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))  # tools/mapgen -> tools -> repo root

# A nation this far from its target latitude is in the wrong climate band, and
# it reads as wrong immediately — the desert is next to the taiga.
LAT_DRIFT = 12
# The map runs 66N to 30S and builds a polar cap at the top. Anything centred
# above this is in or under the ice.
POLAR = 60
# Below this a nation is a smear you cannot put a settlement in.
RUNT = 100
# Above this it has eaten a lobe that was not its own.
FAT = 3.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--profile', default=os.path.join(REPO, 'saeroth2-profile.json'))
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    if not os.path.exists(a.profile):
        print(f'no profile at {a.profile} — run a build first (without SKIP_SAVE)', file=sys.stderr)
        sys.exit(2)

    P = json.load(open(a.profile, encoding='utf-8'))
    land = P.get('land') or {}
    prof = P['prof']
    settled = P['landTotal'] - P['wildTotal']
    weight = P.get('sizes') or {}

    fails, notes = [], []
    for r in prof:
        n, cells, lat = r['nation'], r['cells'], r['lat']
        want = (land.get(n) or {}).get('tlat')

        if lat > POLAR:
            fails.append(f'{n}: centred at {lat:.0f}N — in the polar cap')
        if want is not None and abs(lat - want) > LAT_DRIFT:
            fails.append(f'{n}: {lat:.0f}N, wanted {want}N — {abs(lat-want):.0f} deg out of its climate band')
        if cells < RUNT:
            fails.append(f'{n}: {cells} cells — too small to be a country on the page')
        # an archipelago nation is SUPPOSED to be scattered; that is its claim
        if r.get('islands', 1) > 2 and (P.get('claim') or {}).get(n) != 'islands':
            notes.append(f'{n}: territory spread over {r["islands"]} landmasses')

    # Oversize is measured per CONTINENT: each group is given a fixed slice of
    # the world, and a nation's share is its weight within its own group.
    group = P.get('group') or {}
    if weight:
        gtot = {}
        for r in prof:
            g = group.get(r['nation'], 0)
            gtot[g] = gtot.get(g, 0) + weight.get(r['nation'], 1)
        gcells = {}
        for r in prof:
            g = group.get(r['nation'], 0)
            gcells[g] = gcells.get(g, 0) + r['cells']
        for r in prof:
            n, cells = r['nation'], r['cells']
            g = group.get(n, 0)
            share = gcells[g] * weight.get(n, 1) / (gtot[g] or 1)
            if share and cells / share > FAT:
                fails.append(f'{n}: {cells} cells, {cells/share:.1f}x its share — it has eaten a lobe')

    if not a.quiet:
        print(f'{len(prof)} nations, {settled} settled cells')
        worst = sorted((r for r in prof if (land.get(r['nation']) or {}).get('tlat') is not None),
                       key=lambda r: -abs(r['lat'] - land[r['nation']]['tlat']))[:3]
        print('  worst latitude drift: ' + ', '.join(
            f"{r['nation'].split()[0]} {r['lat']:.0f}/{land[r['nation']]['tlat']}" for r in worst))

    for m in notes:
        print(f'  note: {m}')
    if fails:
        print(f'\n{len(fails)} problem(s) a reader would see:', file=sys.stderr)
        for f in sorted(fails):
            print(f'  {f}', file=sys.stderr)
        sys.exit(1)
    if not a.quiet:
        print('nothing a reader would flag')


if __name__ == '__main__':
    main()
