#!/usr/bin/env python3
"""Sync every nation's Relations bullet from the Political Relations table.

The table in `campaign/nations/Political Relations.md` is the single source of
truth for diplomacy. That note says so in its own first line — "drawn from the
Relations bullet on each nation's own note" — which is only honest if the two
actually agree, and keeping 20+ notes in step with 79 rows by hand does not
survive contact with a real edit.

So: edit the table, run this, and every nation note is rewritten to match.
Nothing is duplicated — this reads the markdown and writes markdown back.

    python3 tools/sync_relations.py            # rewrite the nation notes
    python3 tools/sync_relations.py --check    # verify only, exit 1 on drift

It also cross-checks the table against the standings `site/app.js` knows how to
draw. That check exists because the failure is silent: the relations view skips
any row whose standing it does not recognise, so a new standing added to the
table but not to the app would simply disappear from the web with no error.
"""
import argparse
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
NATIONS = os.path.join(REPO, 'campaign', 'nations')
TABLE_NOTE = os.path.join(NATIONS, 'Political Relations.md')
APP_JS = os.path.join(REPO, 'site', 'app.js')

WIKILINK = re.compile(r'\[\[([^\]|#]+)[^\]]*\]\]')
# Rows read `| [[A]] ↔ [[B]] | **Standing** | prose |`; anything that is not two
# wikilinks plus a standing is skipped, which is what keeps the note's own
# legend table (| Label | Means |) out of the data.
SEPARATOR = re.compile(r'^\|[\s:|-]+\|$')


def die(msg):
    print(f'error: {msg}', file=sys.stderr)
    sys.exit(1)


def app_standings():
    """The standings site/app.js can actually render, in its display order."""
    src = open(APP_JS, encoding='utf-8').read()
    m = re.search(r'const STANDINGS = \[(.*?)\];', src, re.S)
    if not m:
        die('could not find STANDINGS in site/app.js')
    pairs = re.findall(r"\['([a-z]+)',\s*'([^']+)'\]", m.group(1))
    if not pairs:
        die('STANDINGS in site/app.js parsed as empty')
    return [label for _key, label in pairs]


def parse_rows(text):
    """Every relationship row in the note, in file order."""
    rows = []
    for line in text.split('\n'):
        line = line.strip()
        if not line.startswith('|') or SEPARATOR.match(line):
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        if len(cells) < 2:
            continue
        pair = [n.strip() for n in WIKILINK.findall(cells[0])]
        if len(pair) != 2:
            continue
        standing = cells[1].replace('*', '').strip()
        detail = cells[2] if len(cells) > 2 else ''
        rows.append((pair[0], pair[1], standing, detail))
    return rows


def nation_dirs():
    return sorted(d for d in os.listdir(NATIONS)
                  if os.path.isdir(os.path.join(NATIONS, d)))


def validate(rows, standings, folders):
    problems = []
    known = set(standings)
    seen = {}
    for a, b, s, _ in rows:
        if s not in known:
            problems.append(f'standing "{s}" ({a} ↔ {b}) is not one site/app.js '
                            f'can draw — the web would silently drop this row')
        if a == b:
            problems.append(f'{a} is related to itself')
        key = tuple(sorted((a, b)))
        if key in seen:
            problems.append(f'duplicate pair {key[0]} ↔ {key[1]}')
        seen[key] = True
        for n in (a, b):
            if n not in folders:
                problems.append(f'no nation folder for "{n}"')
    return problems


def bullet(nation, rows, standings):
    order = {s: i for i, s in enumerate(standings)}
    mine = []
    for a, b, s, d in rows:
        if a == nation:
            mine.append((s, b, d))
        elif b == nation:
            mine.append((s, a, d))
    mine.sort(key=lambda x: (order.get(x[0], 99), x[1]))
    out = ['- **Relations**']
    for s, other, d in mine:
        out.append(f'    - [[{other}]] — **{s}**: {d}' if d
                   else f'    - [[{other}]] — **{s}**')
    return '\n'.join(out)


# The Relations bullet runs to the next top-level bullet or end of file.
BULLET_RE = re.compile(r'^- \*\*Relations\*\*.*?(?=\n^- \*\*|\Z)', re.M | re.S)


def sync(rows, standings, folders, check_only):
    drifted, missing = [], []
    for nation in folders:
        path = os.path.join(NATIONS, nation, nation + '.md')
        if not os.path.exists(path):
            missing.append(nation)
            continue
        src = open(path, encoding='utf-8').read()
        want = bullet(nation, rows, standings)
        if not BULLET_RE.search(src):
            # No bullet yet — append one rather than silently skipping the note.
            new = src.rstrip() + '\n' + want + '\n'
        else:
            new = BULLET_RE.sub(lambda _: want + '\n', src, count=1).rstrip() + '\n'
        if new != src:
            drifted.append(nation)
            if not check_only:
                open(path, 'w', encoding='utf-8').write(new)
    return drifted, missing


def report(rows, standings, folders):
    by_standing = defaultdict(int)
    degree = defaultdict(int)
    warm_by = defaultdict(int)
    warm = {'Allied', 'Friendly', 'Trade'}
    for a, b, s, _ in rows:
        by_standing[s] += 1
        degree[a] += 1
        degree[b] += 1
        if s in warm:
            warm_by[a] += 1
            warm_by[b] += 1

    print(f'{len(rows)} ties across {len(folders)} nations')
    print('  ' + '  '.join(f'{s} {by_standing[s]}' for s in standings if by_standing[s]))
    if degree:
        print('  degree min %d / max %d / avg %.1f' % (
            min(degree.values()), max(degree.values()),
            sum(degree.values()) / len(degree)))

    # Health notes — not errors. A nation may be isolated on purpose (Lazarian
    # has no warm tie by design); these are here so the choice stays deliberate.
    thin = sorted(n for n in folders if degree[n] < 3)
    cold = sorted(n for n in folders if degree[n] and not warm_by[n])
    if thin:
        print('  note: fewer than 3 ties — ' + ', '.join(thin))
    if cold:
        print('  note: no warm tie at all — ' + ', '.join(cold))
    if len(rows) > 95:
        print('  note: the relations web may need its layout retuned at this '
              'density — check minGap in a browser (see CLAUDE.md)')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true',
                    help='report drift without writing; exit 1 if any note is stale')
    args = ap.parse_args()

    standings = app_standings()
    folders = nation_dirs()
    rows = parse_rows(open(TABLE_NOTE, encoding='utf-8').read())
    if not rows:
        die(f'no relationship rows found in {os.path.relpath(TABLE_NOTE, REPO)}')

    problems = validate(rows, standings, folders)
    if problems:
        for p in problems:
            print(f'error: {p}', file=sys.stderr)
        sys.exit(1)

    drifted, missing = sync(rows, standings, folders, args.check)
    report(rows, standings, folders)

    for n in missing:
        print(f'warning: no note at {n}/{n}.md', file=sys.stderr)

    if args.check:
        if drifted:
            print('\nout of sync with the table: ' + ', '.join(drifted), file=sys.stderr)
            print('run: python3 tools/sync_relations.py', file=sys.stderr)
            sys.exit(1)
        print('\nall nation notes match the table')
    elif drifted:
        print('\nrewrote ' + ', '.join(drifted))
    else:
        print('\nnation notes already matched the table')


if __name__ == '__main__':
    main()
