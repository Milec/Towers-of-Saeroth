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
    'superlative': (0.0, 8.0, 'superlatives / 1k words'),
    'clipped':   (0.0, 12.0, '% clipped verbless sentences'),
}

# Below this a single dash swamps the rate and the number means nothing. Short
# flavour notes are not badly written, they are just short.
MIN_WORDS = 150

INTENSIFIERS = ['genuinely', 'exactly', 'precisely', 'entirely', 'simply',
                'truly', 'utterly', 'literally', 'absolutely', 'certainly']

# A ranking claim standing in for the thing that happened. "The oldest
# continuous monarchy on the continent" tells a reader where to file the fact;
# "the crown has changed hands only within the same house" tells them the fact.
SUPERLATIVE = re.compile(
    r"\bthe (only|single|oldest|newest|largest|smallest|finest|best|worst|"
    r"richest|poorest|busiest|highest|deepest|longest|shortest|strongest|"
    r"closest|first|last|most \w+|\w+est)\b", re.I)

# Finite verbs, for spotting the clipped fragment. Not a parser — it only has
# to be right often enough to show a note that is chopping rather than writing.
FINITE = set("""is was are were be been am has have had do does did done
can could will would shall should may might must ought needs need
keeps keep kept holds hold held comes come came goes go went gets get got
makes make made takes take took gives give gave says say said tells tell told
runs run ran sits sit sat stands stand stood knows know knew wants want wanted
sells sell sold buys buy bought pays pay paid rules rule ruled lives live lived
answers answer answered belongs belong remains remain stays stay stayed
counts count sends send sent brings bring brought leaves leave left
begins begin began ends end sees see saw thinks think thought calls call
""".split())
INFLECTED = re.compile(r"\b\w{3,}(ed|es)\b")
WORD = re.compile(r"[A-Za-z'-]+")
# Words too common to signal that two sentences were built to the same pattern.
MIRROR_STOP = set("""the a an and or but of to in on at for with by from as
that this it its their his her they he she is was are were not no than then
have has had been being one two all any some more most""".split())

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
        'superlative': per1k(len(SUPERLATIVE.findall(body))),
        'stacked': sum(1 for s in sents if len(SUPERLATIVE.findall(s)) > 1),
        'clipped': 100.0 * sum(1 for s in sents if clipped(s)) / max(len(sents), 1),
        'mirrors': mirrored_pairs(sents),
    }


def clipped(sent):
    """A short sentence with no finite verb in it. One is a beat. A page of them
    is the writer chopping prose into rhythm instead of writing sentences."""
    toks = [w.lower() for w in WORD.findall(sent)]
    if not toks or len(toks) > 10:
        return False
    if any(t in FINITE for t in toks) or INFLECTED.search(sent):
        return False
    return True


def mirrored_pairs(sents):
    """Consecutive short sentences built to the same pattern — "Quivar credits
    the court. Everyone else credits the service." The symmetry is satisfying
    to write and it is the loudest single tell in the whole vault, because
    real speech almost never balances that neatly twice in a row."""
    n = 0
    for a, b in zip(sents, sents[1:]):
        wa = [w.lower() for w in WORD.findall(a)]
        wb = [w.lower() for w in WORD.findall(b)]
        if not (3 <= len(wa) <= 15 and 3 <= len(wb) <= 15):
            continue
        if abs(len(wa) - len(wb)) > 4:
            continue
        if (set(wa) & set(wb)) - MIRROR_STOP:
            n += 1
    return n


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
    if m['mirrors']:
        flags.append('%d mirrored sentence pair(s)' % m['mirrors'])
    if m['stacked']:
        flags.append('%d sentence(s) stacking superlatives' % m['stacked'])
    hot = [w for w, c in m['intensifiers'].items() if c >= 3]
    if hot:
        flags.append('leaning on ' + ', '.join(hot))
    return flags


def report(path, m, verbose):
    flags = verdict(m)
    mark = 'ok  ' if not flags else 'look'
    print('%s %-52s %5dw  dash %4.1f  sup %4.1f  clip %4.1f%%  mirror %d  med %2d'
          % (mark, path[-52:], m['words'], m['em_dash'], m['superlative'],
             m['clipped'], m['mirrors'], m['median']))
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
        print('\n%d notes, %s words — dash %.1f, superlatives %.1f, clipped %.1f%%, '
              'mirrors %d, short %.1f%% (%d worth a look)'
              % (len(rows), format(tot, ','), agg('em_dash'), agg('superlative'),
                 agg('clipped'), sum(m['mirrors'] for _, m in rows), agg('short'),
                 flagged))
    return 0


if __name__ == '__main__':
    sys.exit(main())
