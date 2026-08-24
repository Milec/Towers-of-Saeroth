#!/usr/bin/env python3
"""Build the exemplar player's handout PDF from the notes themselves.

    python3 tools/make_handout.py

The two notes it reads are GM notes that happen to contain a lot of material
the player should have. Rather than keeping a second, player-safe copy of that
prose — which would go stale the first time a note is edited — this cuts the
GM-only sections out of the real notes and renders what is left.

**The cutting is the whole point of this script, so it is loud.** Sections are
named explicitly, a named section that has gone missing is an error rather
than a silent pass, and the finished HTML is scanned for a list of things that
must never reach a player. Any hit refuses to write the file. A rename in a
note can therefore break the build; it cannot quietly leak the setting's floor.

Rendering goes through the site's own vendored marked.js in the browser that
is already here for the tests, so a table in the handout looks like the same
table on the site.
"""
import html
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'campaign', 'players', 'Isaiah')
OUT = os.path.join(SRC, 'Exemplar handout.pdf')

#: What to keep, per note. Every cut is named, and every name must still match
#: something in the note, so a heading that gets renamed breaks this script
#: rather than quietly shipping the section it was meant to remove.
#:
#:   drop_sections  ## headings to remove entirely
#:   drop_from      remove everything from this marker to the end
#:   drop_lead      remove the note's preamble, the part above the first ##
#:   drop_paras     remove single paragraphs, matched on their opening words
#:   subs           rewrite a phrase that only makes sense inside the vault
#:   lead           the handout's own opening, where the note's addresses the GM
DOCS = [
    {
        'file': 'Exemplars.md',
        'title': 'Exemplars',
        'drop_sections': [],
        # The GM footer is the last thing in the note, fenced off by a rule.
        'drop_from': '**GM:** the explanation is',
        'drop_lead': False,
        'drop_paras': [],
        'subs': [
            # Points at the second half of this handout, by a name the player
            # has no reason to have heard.
            ('[[Dreams of the Dead God]] is the table for rolling them at a table.',
             'What arrives is overleaf.'),
        ],
        'lead': None,
    },
    {
        'file': 'Dreams of the Dead God.md',
        'title': 'The dreams',
        # "When to roll" is the GM's trigger list and names where the pull
        # comes from; "Running it" carries two of the setting's answers.
        'drop_sections': ['When to roll', 'Running it'],
        'drop_from': None,
        # The note opens by telling the GM what the dreams are.
        'drop_lead': True,
        'drop_paras': [
            'Read to the player alone',
            'The five below the line',
        ],
        'subs': [
            # Its two paragraphs were GM instructions and are gone, which
            # leaves a heading sitting directly on top of the ten it labels,
            # under a page already titled the same thing.
            ('## The dreams', ''),
        ],
        # This is the only prose in the handout that is not in a note.
        'lead': (
            "Once your spark is focused the dreams start, and there is no "
            "record of an exemplar to whom they did not. You do not choose "
            "which one arrives. On a night one comes, roll, and then save "
            "against it: a good dream is something you are trying to hold on "
            "to, and a bad one is something you are trying to get clear of."
            "\n\nNothing in any of them can be repeated. You already know "
            "that part.\n"
        ),
    },
]

#: Nothing on this list may appear in the rendered handout. These are the
#: names and phrases that give away what the dreams actually are, plus the
#: obvious markers of GM prose. Checked case-insensitively against the text.
FORBIDDEN = [
    'god sundering', 'nameless empire', 'sorcerer-king', 'murdered god',
    'the dead god', 'dead god', 'twelve kings', 'twelve of them',
    'unattended', 'gm:', 'gm tool', 'gm only', 'gm secret',
    'read to the player', 'the killing was like', 'roll twice and take',
]

ACTION_SVG = {
    'r': '<svg class="pf2" viewBox="0 0 24 24" aria-label="reaction">'
         '<path d="M20 12a8 8 0 1 1-2.7-6" fill="none" stroke="currentColor" '
         'stroke-width="3.2" stroke-linecap="round"/>'
         '<path d="M20 3.2V10h-6.6z"/></svg>',
}

FM = re.compile(r'^---\r?\n.*?\r?\n---\r?\n?', re.S)
WIKI = re.compile(r'\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]')
PF2 = re.compile(r'`pf2:([0-3r])`')


def drop_paragraph(body, opener, where):
    """Remove the one paragraph that starts with these words."""
    paras = re.split(r'\n\s*\n', body)
    hit = [i for i, p in enumerate(paras) if p.lstrip().startswith(opener)]
    if len(hit) != 1:
        sys.exit(f'{where}: expected exactly one paragraph opening {opener!r}, '
                 f'found {len(hit)}. Fix the list before shipping a handout.')
    del paras[hit[0]]
    return '\n\n'.join(paras)


def substitute(body, old, new, where):
    """Replace a phrase, tolerating however the note happens to be wrapped."""
    pattern = re.compile(r'\s+'.join(re.escape(w) for w in old.split()))
    body, n = pattern.subn(new, body, count=1)
    if not n:
        sys.exit(f'{where}: could not find {old!r} to rewrite. '
                 'Reworded? Fix the list before shipping a handout.')
    return body


def sections(body):
    """Split a note body into (heading_text_or_None, chunk) in order."""
    out, name, buf = [], None, []
    for line in body.split('\n'):
        m = re.match(r'^##\s+(.*?)\s*$', line)
        if m:
            out.append((name, '\n'.join(buf)))
            name, buf = m.group(1), [line]
        else:
            buf.append(line)
    out.append((name, '\n'.join(buf)))
    return out


def prepare(doc):
    raw = open(os.path.join(SRC, doc['file']), encoding='utf-8').read()
    body = FM.sub('', raw, count=1)

    if doc['drop_from']:
        i = body.find(doc['drop_from'])
        if i < 0:
            sys.exit(f"{doc['file']}: cut marker {doc['drop_from']!r} is gone. "
                     "Check what happened to it before shipping a handout.")
        body = body[:i].rstrip().rstrip('-').rstrip()

    kept, seen = [], set()
    for name, chunk in sections(body):
        if name is None and doc['drop_lead']:
            # Keep the note's own H1; drop the GM-facing paragraphs under it.
            kept.append(chunk.split('\n')[0])
            continue
        if name in doc['drop_sections']:
            seen.add(name)
            continue
        kept.append(chunk)
    missing = [s for s in doc['drop_sections'] if s not in seen]
    if missing:
        sys.exit(f"{doc['file']}: section(s) {missing} were supposed to be cut "
                 "and are not in the note. Renamed? Fix the list before shipping.")

    body = '\n'.join(kept)
    for opener in doc['drop_paras']:
        body = drop_paragraph(body, opener, doc['file'])
    for old, new in doc['subs']:
        body = substitute(body, old, new, doc['file'])

    # The first heading becomes the document title, so drop it from the body.
    body = re.sub(r'^#\s+.*?\n', '', body, count=1)
    if doc['lead']:
        body = doc['lead'] + '\n' + body

    body = WIKI.sub(lambda m: m.group(2) or m.group(1), body)
    body = PF2.sub(lambda m: ACTION_SVG.get(m.group(1), ''), body)
    return body.strip()


CSS = """
@page { size: A4; margin: 18mm 16mm 16mm; }
* { box-sizing: border-box; }
body {
  margin: 0; background: #fdfaf2; color: #241f1a;
  font: 10.6pt/1.5 "Liberation Serif", Georgia, serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.doc { page-break-after: always; }
.doc:last-child { page-break-after: auto; }
h1 {
  font-size: 22pt; margin: 0 0 2pt; letter-spacing: .01em;
  border-bottom: 2px solid #8a1c2b; padding-bottom: 5pt;
}
.sub { color: #7a6f61; font-size: 8.6pt; letter-spacing: .09em;
       text-transform: uppercase; margin: 0 0 14pt; }
h2 { font-size: 13.5pt; margin: 15pt 0 4pt; color: #8a1c2b;
     page-break-after: avoid; }
h3 { font-size: 11.4pt; margin: 12pt 0 3pt; page-break-after: avoid; }
p, li { orphans: 2; widows: 2; }
p { margin: 0 0 7pt; }
ul { margin: 0 0 7pt; padding-left: 16pt; }
li { margin-bottom: 3pt; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0 10pt;
        font-size: 9.6pt; page-break-inside: avoid; }
th, td { border: .6pt solid #cbbfa8; padding: 4pt 6pt; text-align: left;
         vertical-align: top; }
th { background: #f0e8d6; }
td:first-child { white-space: nowrap; }
em { font-style: italic; }
hr { border: 0; border-top: .6pt solid #cbbfa8; margin: 12pt 0; }
svg.pf2 { height: .95em; width: auto; vertical-align: -.11em; fill: currentColor; }
.foot { margin-top: 16pt; padding-top: 6pt; border-top: .6pt solid #cbbfa8;
        color: #7a6f61; font-size: 8.4pt; font-style: italic; }
"""


def main():
    parts = []
    for doc in DOCS:
        parts.append({'title': doc['title'], 'md': prepare(doc)})

    payload = ''.join(
        f'<section class="doc" data-title="{html.escape(p["title"])}">'
        f'<script type="text/markdown">{p["md"]}</script></section>'
        for p in parts)

    page = (
        '<!doctype html><meta charset="utf-8"><style>' + CSS + '</style>'
        '<body><div id="root">' + payload + '</div>'
        '<script src="MARKED"></script><script>'
        'for (const s of document.querySelectorAll("section.doc")) {'
        '  const md = s.querySelector("script").textContent;'
        '  s.innerHTML = "<h1>" + s.dataset.title + "</h1>"'
        '    + "<p class=\\"sub\\">Towers of Saeroth &middot; player handout</p>"'
        '    + marked.parse(md)'
        '    + "<p class=\\"foot\\">You cannot repeat any of this. Not to the '
        'party, not on paper, not in stone.</p>";'
        '}</script></body>')

    tmp = os.path.join(ROOT, '_handout.html')
    page = page.replace('MARKED', 'site/marked.min.js')
    open(tmp, 'w', encoding='utf-8').write(page)
    try:
        subprocess.run(['node', os.path.join(ROOT, 'tools', 'topdf.js'), tmp, OUT],
                       check=True, cwd=ROOT)
        text = subprocess.run(
            ['node', os.path.join(ROOT, 'tools', 'topdf.js'), tmp, '--text'],
            check=True, cwd=ROOT, capture_output=True, text=True).stdout.lower()
    finally:
        os.remove(tmp)

    hits = sorted({w for w in FORBIDDEN if w in text})
    if hits:
        os.path.exists(OUT) and os.remove(OUT)
        sys.exit('REFUSING TO SHIP. The rendered handout contains: '
                 + ', '.join(repr(h) for h in hits))

    print(f'{os.path.relpath(OUT, ROOT)}  ({os.path.getsize(OUT) / 1024:.0f} KB)')
    print(f'redaction check: clean against {len(FORBIDDEN)} forbidden phrases')


if __name__ == '__main__':
    sys.exit(main())
