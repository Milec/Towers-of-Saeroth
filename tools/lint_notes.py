#!/usr/bin/env python3
"""Check campaign/ for the conventions that fail SILENTLY.

Every check here exists because the failure produces no error anywhere: the
site renders, the build succeeds, and the note just quietly says something
untrue. They are cheap to run and were each written after the mistake was
actually made.

    python3 tools/lint_notes.py           # report; exit 1 if anything is wrong
    python3 tools/lint_notes.py --quiet   # only print problems

1. **Wikilinks split across a line break.** `[[Thornwild\\nConfederation]]` is
   not a broken link, it is *not a link at all* — wikilinks tokenise within a
   single line, so it renders as literal bracketed text and shows up in no
   broken-link check, because nothing ever parsed it. This is the one that has
   actually bitten twice.
2. **Wikilinks that resolve to nothing.** The site draws these greyed out, so
   you only find them by opening the page they are on.
3. **Filename vs title drift.** Wikilinks resolve by FILENAME; the title is
   what a reader sees. When they disagree, links and prose disagree.
4. **Territorial ties with no required border.** A land dispute between two
   nations that never share a frontier on the generated map is a claim the map
   contradicts — unless the row says so outright, which several deliberately do.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CAMPAIGN = os.path.join(REPO, 'campaign')
WORLD_JS = os.path.join(HERE, 'mapgen', 'world.js')
TABLE = os.path.join(CAMPAIGN, 'nations', 'Political Relations.md')

WIKILINK = re.compile(r'\[\[([^\]\n|#]+)')
# a line that opens [[ after its last ]] and never closes it
UNCLOSED = re.compile(r'\[\[(?:(?!\]\]).)*$')
NO_FRONTIER = re.compile(r'share no frontier|no shared border|rather than over a shared border'
                         r'|ridden across other people|never held', re.I)
# A wikilink inside a code span is being QUOTED, not used — campaign/README.md
# documents this very syntax, and those examples are not links.
CODE_SPAN = re.compile(r'`[^`]*`')
FENCE = re.compile(r'^\s*```')


def strip_code(line):
    return CODE_SPAN.sub('', line)


def notes():
    for root, _dirs, files in os.walk(CAMPAIGN):
        for f in files:
            if f.endswith('.md'):
                yield os.path.join(root, f)


def title_of(text):
    m = re.match(r'^---\n(.*?)\n---', text, re.S)
    if not m:
        return None
    t = re.search(r'^title:\s*(.*)$', m.group(1), re.M)
    return t.group(1).strip().strip('"\'') if t else None


def main():
    quiet = '--quiet' in sys.argv
    problems = []
    by_name = {}
    for path in notes():
        by_name.setdefault(os.path.splitext(os.path.basename(path))[0], []).append(path)

    n_links = 0
    for path in sorted(notes()):
        rel = os.path.relpath(path, REPO)
        text = open(path, encoding='utf-8').read()

        # 3. filename vs title
        stem = os.path.splitext(os.path.basename(path))[0]
        title = title_of(text)
        if title and title != stem:
            problems.append(f'{rel}: title "{title}" does not match filename "{stem}" '
                            f'— wikilinks resolve by filename, so the two must agree')

        in_fence = False
        for i, raw in enumerate(text.split('\n'), 1):
            if FENCE.match(raw):
                in_fence = not in_fence
                continue
            if in_fence:
                continue          # statblocks quote AON syntax verbatim
            line = strip_code(raw)
            # 1. split wikilink — the silent one
            if UNCLOSED.search(line):
                problems.append(f'{rel}:{i}: wikilink opens and never closes on this line — '
                                f'if it wraps to the next line it is not a link at all: '
                                f'{raw.strip()[-60:]!r}')
            # 2. unresolvable target
            for target in WIKILINK.findall(line):
                target = target.strip()
                if not target or target.startswith(('Setting/', 'Traits/', 'vault/')):
                    continue  # deliberate vault citations
                n_links += 1
                if target not in by_name:
                    problems.append(f'{rel}:{i}: [[{target}]] resolves to no note')

    # 4. Territorial ties with no required border on the generated map
    required = set()
    if os.path.exists(WORLD_JS):
        js = open(WORLD_JS, encoding='utf-8').read()
        block = re.search(r'const BORDERS = \[(.*?)\n\];', js, re.S)
        if block:
            for line in block.group(1).split('\n'):
                if line.strip().startswith('//'):
                    continue  # deliberately disabled, with a reason above it
                m = re.search(r"\['([^']+)',\s*'([^']+)'\]", line)
                if m:
                    required.add(frozenset(m.groups()))

    n_terr = 0
    if os.path.exists(TABLE):
        for line in open(TABLE, encoding='utf-8'):
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if len(cells) < 3:
                continue
            pair = re.findall(r'\[\[([^\]|#]+)', cells[0])
            if len(pair) != 2 or cells[1].replace('*', '').strip() != 'Territorial':
                continue
            n_terr += 1
            a, b = (p.strip() for p in pair)
            if frozenset((a, b)) not in required and not NO_FRONTIER.search(cells[2]):
                problems.append(
                    f'Political Relations.md: {a} <-> {b} is Territorial but world.js does not '
                    f'require a border, and the row does not say they share no frontier')

    if not quiet:
        print(f'{len(list(notes()))} notes, {n_links} wikilinks, '
              f'{n_terr} territorial ties, {len(required)} required borders')
    if problems:
        print(f'\n{len(problems)} problem(s):', file=sys.stderr)
        for p in problems:
            print(f'  {p}', file=sys.stderr)
        sys.exit(1)
    if not quiet:
        print('all clean')


if __name__ == '__main__':
    main()
