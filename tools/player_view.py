#!/usr/bin/env python3
"""What a player is allowed to see, and the code that enforces it.

The site is public. It has always been public — the repository is private, but
GitHub Pages below Enterprise is not, so every note published so far has been
readable by anyone who guessed a URL. This module is what makes a player build
possible: one deployment, two audiences, and the GM half encrypted.

There are two different reasons to withhold something, and conflating them
produces a bad player site:

1. **Nobody in the world knows it.** The Nameless Empire, who burned the
   caravan, what the Lich Emperor is actually chasing. Marked per note with
   `audience: gm` in the frontmatter, or per passage with an Obsidian comment
   block, `%%gm ... %%`, which is invisible in Obsidian too.

2. **Somebody knows it, but not a traveller.** A merchant's daughter out of
   Quivar does not carry the Khaganate's order of battle in her head, or know
   which canton of Sarrowmere is quietly selling what this season. This is not
   secrecy, it is *reach*, and it is handled by note type rather than by hand —
   nobody is going to mark up the same four bullets on twenty-eight nation
   notes correctly, and a policy you can read in one screen is auditable in a
   way that scattered markers never are.

The rule of thumb for the second kind: a player note should read like a
gazetteer entry compiled by somebody who has travelled and listened. What a
country is famous for, where it is, what it sells, who it prays to, who it is
known to be friendly with. Not its troop dispositions and not its current
internal crisis.
"""
import re

# ---------------------------------------------------------------- the policy

#: Frontmatter keys stripped from every player-facing note. `pitch` is the
#: GM's difficulty note on a tower; `visibility` is a marker about the note
#: itself and says out loud that there is something to look for.
GM_FIELDS = {'pitch', 'visibility', 'statblock', 'status', 'party'}

#: Bullets dropped from player-facing notes, by the note's frontmatter `type`.
#:
#: nation — Military is an order of battle; nobody abroad has one. Tension is
#: the nation's live internal crisis, which is by definition not yet public,
#: and is the single most spoiler-dense line on most of these notes.
#: faction/location/npc — Tension and Weakness are the GM's handles on them.
DROP_BULLETS = {
    'nation':   {'Military', 'Tension'},
    'faction':  {'Tension', 'Weakness', 'Goal'},
    'location': {'Tension'},
    'npc':      {'Tension', 'Weakness', 'Want', "Won't", 'Told', 'Supplied',
                 'Left behind', 'If confronted', 'Method', 'Leverage on him',
                 'Tell'},
}

#: Whole note types a player never sees the notes of at all.
DROP_TYPES = {'session'}

#: Relationship standings withheld from players. The relations table defines
#: Covert as "deniable dealings both sides publicly disown", so the table is
#: already telling us which ties are not public knowledge — this needs no
#: second list to drift out of step with the first.
DROP_STANDINGS = {'covert'}

#: Directories no player build ever touches, whatever is in them.
DROP_DIRS = ('campaign/sessions/',)


# ------------------------------------------------------------------- helpers

FM = re.compile(r'^(---\r?\n)(.*?)(\r?\n---\r?\n?)', re.S)
GM_BLOCK = re.compile(r'%%\s*gm\b.*?%%', re.S | re.I)


def frontmatter(text):
    m = FM.match(text)
    return m.group(2) if m else ''


def field(text, key):
    m = re.search(r'^%s:\s*(.+)$' % re.escape(key), frontmatter(text), re.M)
    return m.group(1).strip() if m else None


def is_gm_only(path, text):
    """True if the whole note is GM material and never reaches the player site."""
    if any(path.startswith(d) for d in DROP_DIRS):
        return True
    if (field(text, 'type') or '').lower() in DROP_TYPES:
        return True
    audience = (field(text, 'audience') or '').lower()
    if audience in ('gm', 'gm only', 'gm-only'):
        return True
    # the older marker, used before `audience:` existed
    if (field(text, 'visibility') or '').lower().startswith('gm'):
        return True
    return False


def _strip_fields(text):
    m = FM.match(text)
    if not m:
        return text
    kept = [ln for ln in m.group(2).split('\n')
            if not any(re.match(r'\s*%s:' % re.escape(k), ln) for k in GM_FIELDS)]
    return m.group(1) + '\n'.join(kept) + m.group(3) + text[m.end():]


def _bullet_key(line):
    m = re.match(r'\s*-\s+\*\*([^*]+)\*\*', line)
    return m.group(1).strip() if m else None


def _drop_bullets(text, drop):
    """Remove `- **Key** ...` bullets and any lines indented beneath them."""
    if not drop:
        return text
    out, skipping = [], False
    for line in text.split('\n'):
        key = _bullet_key(line)
        if key is not None:
            skipping = key in drop
            if skipping:
                continue
        elif skipping:
            # a continuation line belongs to the bullet above it
            if line.strip() == '' or re.match(r'\s+\S', line):
                continue
            skipping = False
        out.append(line)
    return '\n'.join(out)


def _drop_standings(text):
    """Drop table rows and Relations sub-bullets whose standing is withheld.

    Covers both shapes the vault keeps the same fact in: the row in
    `Political Relations.md` and the generated bullet on each nation note.
    """
    if not DROP_STANDINGS:
        return text
    out = []
    for line in text.split('\n'):
        m = re.search(r'\*\*(\w+)\*\*', line)
        stripped = line.strip()
        is_row = stripped.startswith('| [[')
        is_tie = re.match(r'\s+- \[\[[^\]]+\]\] — \*\*\w+\*\*', line)
        # the legend row too: explaining a category of relationship and then
        # showing none of it tells a reader exactly what is being kept from them
        is_legend = re.match(r'\|\s*\*\*\w+\*\*\s*\|', stripped)
        if m and (is_row or is_tie or is_legend) and m.group(1).lower() in DROP_STANDINGS:
            continue
        out.append(line)
    return '\n'.join(out)


def redact(path, text):
    """The player-facing version of a note, or None if they see none of it."""
    if is_gm_only(path, text):
        return None
    text = GM_BLOCK.sub('', text)
    text = _strip_fields(text)
    text = _drop_bullets(text, DROP_BULLETS.get((field(text, 'type') or '').lower(), set()))
    text = _drop_standings(text)
    # collapse the blank runs the removals leave behind
    return re.sub(r'\n{3,}', '\n\n', text).rstrip() + '\n'
