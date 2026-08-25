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

It also prints one **advisory** line measuring the prose voice, which is not a
check and can never fail the run — see `prose_advisory` at the bottom.
"""
import os
import glob
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CAMPAIGN = os.path.join(REPO, 'campaign')
WORLD_JS = os.path.join(HERE, 'mapgen', 'world.js')
TABLE = os.path.join(CAMPAIGN, 'nations', 'Political Relations.md')
ROUTES = os.path.join(CAMPAIGN, 'world', 'Trade Routes.md')
AGES = os.path.join(CAMPAIGN, 'world', 'history', 'Ages of Saeroth.md')
# Tal Ulad has no founding date on purpose — the herd councils consider the
# question rude — so it is named in prose in The Old Foundations instead.
UNDATED = {'Tal Ulad'}
PLAYER_HISTORY = os.path.join(REPO, 'players', 'History.md')

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


# ------------------------------------------------------------- prose voice
# Advisory only. Nothing here can fail the lint or change the exit code, and
# that is deliberate: a note can sit outside every band and read beautifully,
# so a gate on prose would be a gate on judgement. It prints because the
# numbers are worth having in front of you on every run rather than only when
# somebody remembers to ask for them.
PROSE_SCRIPTS = os.path.join(REPO, '.claude', 'skills', 'saeroth-prose', 'scripts')
PLAYERS = os.path.join(REPO, 'players')
# The ancestry and deity notes are copied verbatim out of the PF2e reference.
# They are Paizo's sentences rather than the vault's voice, and averaging 81 of
# them in moves the number without anybody having written a word.
# campaign/README.md is folder documentation rather than worldbuilding, and the
# skill says in as many words not to apply itself to it. Measured, it lands top
# of the list every run and sends whoever reads this line at the wrong file.
PROSE_SKIP = (os.path.join('world', 'ancestries'), os.path.join('world', 'deities'),
              os.path.join('campaign', 'README.md'))


def prose_advisory():
    """Return two lines about the voice, or None if the skill is not installed.

    The skill is optional — someone can clone this repo and lint it without
    ever loading `.claude/` — so a missing or broken prose_check.py has to
    leave the rest of the lint working.
    """
    if PROSE_SCRIPTS not in sys.path:
        sys.path.insert(0, PROSE_SCRIPTS)
    try:
        import prose_check
    except Exception:
        return None

    rows = []
    for root in (CAMPAIGN, PLAYERS):
        if not os.path.isdir(root):
            continue
        for path in prose_check.walk(root):
            rel = os.path.relpath(path, REPO)
            if any(skip in rel for skip in PROSE_SKIP):
                continue
            try:
                m = prose_check.measure(open(path, encoding='utf-8').read())
            except Exception:
                continue
            if m:
                rows.append((rel, m))
    if not rows:
        return None

    total = sum(m['words'] for _, m in rows)
    avg = lambda k: sum(m[k] * m['words'] for _, m in rows) / total
    mirrors = sum(m['mirrors'] for _, m in rows)
    flagged = [(rel, m) for rel, m in rows if prose_check.verdict(m)]
    worst = max(rows, key=lambda r: (len(prose_check.verdict(r[1])), r[1]['em_dash']))

    head = ('prose   dash %.1f/1k, superlatives %.1f, clipped %.1f%%, '
            'short %.1f%%, %d mirrored pair(s)'
            % (avg('em_dash'), avg('superlative'), avg('clipped'),
               avg('short'), mirrors))
    tail = ('        advisory only — %d of %d notes worth a look%s'
            % (len(flagged), len(rows),
               ', worst ' + worst[0] if flagged else ''))
    return head + '\n' + tail


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


ALIAS_IN_ROW = re.compile(r'\[\[[^\]|]*\|[^\]]*\]\]')


def main():
    quiet = '--quiet' in sys.argv
    problems = []
    by_name = {}
    for path in notes():
        by_name.setdefault(os.path.splitext(os.path.basename(path))[0], []).append(path)

    # 5+6 need a second pass, so collect as we go
    inbound = {os.path.splitext(os.path.basename(p))[0]: 0 for p in notes()}

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
            # 1b. aliased wikilink inside a markdown table row — the pipe
            # ends the cell, so [[Note|Alias]] renders as literal bracket text
            # and the row grows a phantom column. Silent: the link resolves,
            # the build succeeds, and only the rendered page is wrong.
            if line.lstrip().startswith('|') and ALIAS_IN_ROW.search(line):
                problems.append(f'{rel}:{i}: aliased [[link|alias]] inside a table '
                                f'row — the | ends the cell and the link renders as '
                                f'literal text; use the plain [[link]] form here')
            # 2. unresolvable target
            for target in WIKILINK.findall(line):
                target = target.strip()
                if not target or target.startswith(('Setting/', 'Traits/', 'vault/')):
                    continue  # deliberate vault citations
                n_links += 1
                if target not in by_name:
                    problems.append(f'{rel}:{i}: [[{target}]] resolves to no note')
                else:
                    stem_t = target.split('/')[-1]
                    if stem_t != stem and stem_t in inbound:
                        inbound[stem_t] += 1

    # 5. A note nothing links to. It renders, it is in the tree, and it is
    # unreachable from any other note and isolated in the graph — which is the
    # whole point of a vault. campaign/README.md is exempt: it is the site's
    # default route, so it is reachable without a link.
    for path in sorted(notes()):
        stem = os.path.splitext(os.path.basename(path))[0]
        rel = os.path.relpath(path, REPO)
        if rel == os.path.join('campaign', 'README.md'):
            continue
        if inbound.get(stem, 0) == 0:
            problems.append(f'{rel}: nothing links to this note — it is reachable '
                            f'only through the file tree and is isolated in the graph')

    # 6. A note filed under a nation that never links that nation. It reads as
    # the nation's, sits in the nation's folder, and the graph does not join
    # them — so the nation's own web is missing a piece with nothing to show it.
    for path in sorted(notes()):
        rel_c = os.path.relpath(path, CAMPAIGN)
        parts = rel_c.split(os.sep)
        if len(parts) != 4 or parts[0] != 'nations':
            continue
        nation, sub = parts[1], parts[2]
        if sub not in ('factions', 'locations', 'npcs'):
            continue
        if ('[[' + nation) not in open(path, encoding='utf-8').read():
            problems.append(f'{os.path.relpath(path, REPO)}: filed under {nation} '
                            f'but never links [[{nation}]]')

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

    # 5. Trade-route legs between nations with no relationship at all
    #
    # A corridor in Trade Routes.md runs through nations that must, at minimum,
    # KNOW each other — the relations table is where that is recorded. A leg
    # between two nations with no row at all is the silent kind of wrong: the
    # line still draws, the note still reads, and the world quietly claims a
    # caravan runs between two countries that have never been said to meet.
    #
    # Only a MISSING row is an error. A leg worked by rivals or across disputed
    # ground is deliberate — see "The awkward legs" in the note — so anything
    # with a standing on it passes.
    ties = set()
    if os.path.exists(TABLE):
        for line in open(TABLE, encoding='utf-8'):
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if len(cells) < 3:
                continue
            pair = re.findall(r'\[\[([^\]|#]+)', cells[0])
            if len(pair) == 2:
                ties.add(frozenset(x.strip() for x in pair))

    n_legs = 0
    if os.path.exists(ROUTES):
        for line in open(ROUTES, encoding='utf-8'):
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if len(cells) < 4:
                continue
            stops = [x.strip() for x in re.findall(r'\[\[([^\]|#]+)', cells[2])]
            if len(stops) < 2:
                continue
            name = cells[0].replace('*', '').strip()
            for a, b in zip(stops, stops[1:]):
                n_legs += 1
                if frozenset((a, b)) not in ties:
                    problems.append(
                        f'Trade Routes.md: {name} runs {a} -> {b}, but Political '
                        f'Relations.md has no relationship between them at all')

    # The players' history page is drawn as a rail, one stop per section,
    # labelled with the year on the italic line under the heading. The rail
    # says "newest first" and cannot sort — it takes the sections in the order
    # the markdown puts them — so a section filed in the wrong place is a
    # timeline that silently lies, which is how the page ran with 1776 sitting
    # between 2373 and 2370. Sections with no year in their date line (the
    # ongoing ones) are skipped rather than placed.
    if os.path.exists(PLAYER_HISTORY):
        lines = open(PLAYER_HISTORY, encoding='utf-8').read().split('\n')
        prev_year, prev_name = None, None
        for i, line in enumerate(lines):
            if not line.startswith('## '):
                continue
            name = line[3:].strip()
            date = next((l for l in lines[i + 1:i + 4] if l.startswith('*')), '')
            year = re.search(r'\d+', date)
            if not year:
                continue
            year = int(year.group(0))
            if prev_year is not None and year > prev_year:
                problems.append(
                    f'players/History.md: "{name}" ({year}) comes after '
                    f'"{prev_name}" ({prev_year}) — the rail runs newest first '
                    f'and takes the page\'s own order')
            prev_year, prev_name = year, name

    # A nation with no row in the chronology. Ages of Saeroth is the vault's
    # dated spine and the site draws it as a timeline, so a country missing
    # from it fails in the quietest way there is: the note renders, the rail
    # draws, every band is the right width, and one country simply has no past.
    # Seven were missing when this check was written, including two great
    # powers, and nothing anywhere had said so.
    if os.path.exists(AGES):
        ages = open(AGES, encoding='utf-8').read()
        for path in sorted(glob.glob(os.path.join(CAMPAIGN, 'nations', '*', ''))):
            nation = os.path.basename(path.rstrip(os.sep))
            if nation in UNDATED or f'[[{nation}]]' in ages:
                continue
            problems.append(
                f'Ages of Saeroth.md: nothing in the chronology links '
                f'[[{nation}]] — the nation has no dated history at all')

    if not quiet:
        print(f'{len(list(notes()))} notes, {n_links} wikilinks, '
              f'{n_terr} territorial ties, {len(required)} required borders, '
              f'{n_legs} route legs')
        # never allowed to raise or to touch `problems` — see prose_advisory
        try:
            advice = prose_advisory()
        except Exception:
            advice = None
        if advice:
            print(advice)
    if problems:
        print(f'\n{len(problems)} problem(s):', file=sys.stderr)
        for p in problems:
            print(f'  {p}', file=sys.stderr)
        sys.exit(1)
    if not quiet:
        print('all clean')


if __name__ == '__main__':
    main()
