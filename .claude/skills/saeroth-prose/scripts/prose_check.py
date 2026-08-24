#!/usr/bin/env python3
"""Measure a note's prose against the Saeroth voice's known tics.

This is a mirror, not a gate. Every number here can be "wrong" in a note that
reads beautifully — a charter SHOULD be long-sentenced, a statblock has no
prose at all. What it is good for is catching the thing you cannot hear in your
own draft: that the whole note is running one rhythm.

The two headline rates both measure the same rhetorical move — state a fact,
pause on punctuation, deliver the twist. It is a good move. It is the vault's
only move, at roughly four times a comfortable rate, and once a reader hears
the hinge coming the twist stops landing.

Usage:
    prose_check.py campaign/nations/Quivar/Quivar.md
    prose_check.py campaign/            # every note under a directory
    prose_check.py campaign/ --top 15   # worst offenders first
"""
import argparse
import os
import re
import sys

# Bands are advisory. Low end of "comfortable" for published prose, widened a
# little because GM notes are denser than novels.
# Set against the vault's own distribution rather than against a style guide,
# so the flags mean "unusual even for here". At these thresholds about a third
# of notes get looked at; tighter and everything flags, which is the same as
# nothing flagging.
BANDS = {
    'em_dash':   (0.0, 18.0, 'em dashes / 1k words'),
    'colon':     (0.0, 8.0,  'colon-then-explanation / 1k words'),
    'short':     (5.0, 100.0, '% sentences under 8 words'),
    'median':    (0.0, 30.0, 'median sentence length'),
}

# Below this a single dash swamps the rate and the number means nothing. Short
# flavour notes are not badly written, they are just short.
MIN_WORDS = 150

INTENSIFIERS = ['genuinely', 'exactly', 'precisely', 'entirely', 'simply',
                'truly', 'utterly', 'literally', 'absolutely', 'certainly']

FENCE = re.compile(r'^\s*```')
FRONTMATTER = re.compile(r'^---\r?\n.*?\r?\n---\r?\n', re.S)
# A tie written by sync_relations.py: "    - [[Nation]] — **Standing**: gist".
# The dash and the colon in these are generated punctuation, one per tie, and
# counting them buries the rate for the prose a writer can actually change —
# a nation with twelve ties starts twelve dashes in the hole.
GENERATED_TIE = re.compile(r'^\s*-\s*\[\[[^\]]+\]\]\s*—\s*\*\*\w+\*\*')
RELATIONS_LEAD = re.compile(r'^\s*-\s*\*\*Relations\*\*')


def prose_of(text):
    """Everything a reader reads as sentences: no frontmatter, no code fences,
    no tables, no bullet labels. Tables and statblocks are structure, and
    counting them would flag every nation note for punctuation it never used."""
    text = FRONTMATTER.sub('', text)
    out, fenced = [], False
    for line in text.split('\n'):
        if FENCE.match(line):
            fenced = not fenced
            continue
        if fenced:
            continue
        s = line.strip()
        if s.startswith('|') or s.startswith('#') or s.startswith('>'):
            continue
        if GENERATED_TIE.match(line) or RELATIONS_LEAD.match(line):
            continue
        s = re.sub(r'^[-*+]\s+', '', s)          # bullet marker
        # A bullet's bold field label, and the dash that separates it from its
        # value when there is one. `- **Marked Rider** — one feat` is a glossary
        # entry, not a sentence with an aside in it, and counting that dash
        # penalises exactly the notes that are most usefully organised.
        s = re.sub(r'^\*\*[^*]+\*\*\s*[—–-]?\s*', '', s)
        out.append(s)
    body = '\n'.join(out)
    body = re.sub(r'`[^`]*`', '', body)                       # inline code
    body = re.sub(r'\[\[([^\]|#\n]+)(\|([^\]]+))?\]\]', lambda m: m.group(3) or m.group(1), body)
    body = re.sub(r'https?://\S+', '', body)
    return body


def measure(text):
    body = prose_of(text)
    words = re.findall(r"\b[\w'-]+\b", body)
    n = len(words)
    if n < MIN_WORDS:
        return None
    sents = [s.strip() for s in re.split(r'(?<=[.!?])\s+', body) if len(s.strip()) > 12]
    lens = sorted(len(s.split()) for s in sents) or [0]
    per1k = lambda c: 1000.0 * c / n
    return {
        'words': n,
        'sentences': len(sents),
        'em_dash': per1k(body.count('—')),
        # a colon followed by lowercase is the explanation move; ": Grain" in a
        # generated relations line is not
        'colon': per1k(len(re.findall(r':\s+[a-z]', body))),
        'short': 100.0 * sum(1 for x in lens if x < 8) / max(len(lens), 1),
        'median': lens[len(lens) // 2],
        'longest': lens[-1],
        'intensifiers': {w: len(re.findall(r'\b%s\b' % w, body, re.I)) for w in INTENSIFIERS},
        'hinge_runs': longest_hinge_run(sents),
    }


def longest_hinge_run(sents):
    """Consecutive sentences that all use the hinge. Three in a row is audible
    even when the per-1k rate looks fine, which is why the rate alone is not
    enough."""
    best = run = 0
    for s in sents:
        if '—' in s or re.search(r':\s+[a-z]', s):
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best


def verdict(m):
    flags = []
    for key, (lo, hi, label) in BANDS.items():
        # Rhythm needs enough sentences to have a rhythm. A note that is mostly
        # structure — a profile of eleven bullet values, a table with a lead-in
        # — has no short-sentence share worth reporting, and judging it on one
        # produces a flag on every such note, which is the same as no flag.
        if key in ('short', 'median') and m['sentences'] < 8:
            continue
        v = m[key]
        if v < lo:
            flags.append('%s low (%.1f)' % (label, v))
        elif v > hi:
            flags.append('%s high (%.1f)' % (label, v))
    if m['hinge_runs'] >= 3:
        flags.append('%d hinged sentences in a row' % m['hinge_runs'])
    hot = [w for w, c in m['intensifiers'].items() if c >= 3]
    if hot:
        flags.append('leaning on ' + ', '.join(hot))
    return flags


def report(path, m, verbose):
    flags = verdict(m)
    mark = 'ok  ' if not flags else 'look'
    print('%s %-58s %5dw  dash %4.1f  colon %4.1f  short %4.1f%%  med %2d'
          % (mark, path[-58:], m['words'], m['em_dash'], m['colon'], m['short'], m['median']))
    if flags and verbose:
        for f in flags:
            print('       · ' + f)


def walk(target):
    if os.path.isfile(target):
        yield target
        return
    for root, _, files in os.walk(target):
        for f in sorted(files):
            if f.endswith('.md'):
                yield os.path.join(root, f)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--top', type=int, default=0,
                    help='show only the N notes furthest outside the bands')
    ap.add_argument('-q', '--quiet', action='store_true', help='flagged notes only')
    args = ap.parse_args()

    rows = []
    for target in args.paths:
        for p in walk(target):
            try:
                m = measure(open(p, encoding='utf-8').read())
            except OSError as e:
                print('skip %s (%s)' % (p, e), file=sys.stderr)
                continue
            if m:
                rows.append((p, m))

    if not rows:
        print('nothing with enough prose to measure')
        return 0

    if args.top:
        rows.sort(key=lambda r: -len(verdict(r[1])))
        rows = rows[:args.top]

    flagged = 0
    for p, m in rows:
        f = verdict(m)
        if f:
            flagged += 1
        if f or not args.quiet:
            report(p, m, verbose=True)

    if len(rows) > 1:
        tot = sum(m['words'] for _, m in rows)
        agg = lambda k: sum(m[k] * m['words'] for _, m in rows) / tot
        print('\n%d notes, %s words — dash %.1f, colon %.1f, short %.1f%% '
              '(%d worth a look)'
              % (len(rows), format(tot, ','), agg('em_dash'), agg('colon'),
                 agg('short'), flagged))
    return 0


if __name__ == '__main__':
    sys.exit(main())
