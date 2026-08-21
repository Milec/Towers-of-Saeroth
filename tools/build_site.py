#!/usr/bin/env python3
"""Assemble the static site for GitHub Pages.

Notes are served as raw .md and rendered in the browser, so the build is just
a copy plus two indexes. Nothing is pre-rendered, which keeps the output about
the same size as the repo instead of several times larger.

  --no-vault   omit the 41k-file rules reference (site drops ~192 MB, and the
               campaign notes still work in full)
  --gm         build the GM site: every note in full, nothing withheld, and no
               encrypted bundle. For running locally. Never deploy this.

By default the build is the PLAYER site. GitHub Pages is public below
Enterprise, so the deployed site is readable by anyone with the URL and is
therefore treated as the players' copy: notes are redacted by
tools/player_view.py, GM-only notes are absent from it entirely, and the GM's
own full copies are sealed into gm-vault.json with the passphrase in
GM_PASSPHRASE. No passphrase, no GM material — never plaintext.
"""
import argparse, json, os, re, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gm_crypt
import player_view

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '_site')
FM = re.compile(r'^---\r?\n.*?\r?\n---\r?\n?', re.S)


def collect(rel_root):
    out = []
    base = os.path.join(ROOT, rel_root)
    for dirpath, dirnames, files in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith('.'))
        for f in sorted(files):
            if f.endswith('.md'):
                full = os.path.join(dirpath, f)
                out.append(os.path.relpath(full, ROOT).replace(os.sep, '/'))
    return out


def copy_notes(paths):
    for p in paths:
        dst = os.path.join(OUT, 'content', p)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(ROOT, p), dst)


def write_note(path, text):
    dst = os.path.join(OUT, 'content', path)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, 'w', encoding='utf-8').write(text)


WIKI = re.compile(r'\[\[([^\]|#]+)')
TYPE = re.compile(r'^type:\s*["\']?([\w -]+)', re.M)


def note_type(path):
    """The frontmatter `type:` of a note, for graph colouring."""
    try:
        head = open(os.path.join(ROOT, path), encoding='utf-8').read(600)
    except Exception:
        return ''
    m = FM.match(head)
    if not m:
        return ''
    m2 = TYPE.search(m.group(0))
    return m2.group(1).strip() if m2 else ''


def links_of(path):
    """Outbound wikilink targets, lowercased basenames, deduped."""
    try:
        s = FM.sub('', open(os.path.join(ROOT, path), encoding='utf-8').read())
    except Exception:
        return []
    return sorted({m.split('/')[-1].strip().lower() for m in WIKI.findall(s) if m.strip()})


def analyse(path, limit=6000, abs_path=False):
    """Return (searchable body, outbound wikilink targets).

    Links are captured before markup is stripped — deriving them afterwards is
    impossible, since stripping replaces [[Milani]] with plain 'Milani'.
    """
    try:
        s = open(path if abs_path else os.path.join(ROOT, path), encoding='utf-8').read()
    except Exception:
        return '', []
    s = FM.sub('', s)
    links = sorted({m.split('/')[-1].strip().lower() for m in WIKI.findall(s) if m.strip()})
    s = re.sub(r'```.*?```', ' ', s, flags=re.S)
    s = re.sub(r'\[\[([^\]|]*\|)?([^\]]*)\]\]', r'\2', s)
    s = re.sub(r'[#*_`>|\-]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip().lower()[:limit], links


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-vault', action='store_true',
                    help='skip the rules reference (much smaller, faster deploy)')
    ap.add_argument('--gm', action='store_true',
                    help='build the unredacted GM site for local use — never deploy it')
    args = ap.parse_args()

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    # app shell
    for name in os.listdir(os.path.join(ROOT, 'site')):
        src = os.path.join(ROOT, 'site', name)
        dst = os.path.join(OUT, name)
        shutil.copytree(src, dst) if os.path.isdir(src) else shutil.copyfile(src, dst)

    campaign = collect('campaign')
    vault = [] if args.no_vault else collect('vault')
    copy_notes(vault)

    # Split every campaign note into what a player may read and what only the
    # GM may. `shown` is what lands in content/ and in the public index; `gm`
    # is the full text of anything that was redacted or withheld, and is only
    # ever written out encrypted.
    shown, gm_payload, withheld, redacted_count = [], {}, [], 0
    for p in campaign:
        full = open(os.path.join(ROOT, p), encoding='utf-8').read()
        if args.gm:
            write_note(p, full)
            shown.append(p)
            continue
        player = player_view.redact(p, full)
        if player is None:
            withheld.append(p)
            gm_payload[p] = full
            continue
        write_note(p, player)
        shown.append(p)
        if player.strip() != full.strip():
            redacted_count += 1
            gm_payload[p] = full

    notes = []
    for p in shown:
        body, links = analyse(os.path.join(OUT, 'content', p), abs_path=True)
        notes.append({'p': p, 'body': body, 'l': links, 't': note_type(p)})
    json.dump({'notes': notes},
              open(os.path.join(OUT, 'index-campaign.json'), 'w', encoding='utf-8'),
              separators=(',', ':'))

    # the GM's index has to be sealed too: note bodies are searchable text, and
    # a public search index over GM notes gives the whole thing away
    if not args.gm:
        gm_notes = []
        for p in campaign:
            if p in withheld or p in gm_payload:
                body, links = analyse(os.path.join(ROOT, p), abs_path=True)
                gm_notes.append({'p': p, 'body': body, 'l': links, 't': note_type(p),
                                 'only': p in withheld})
        gm_payload['__index__'] = gm_notes
        crypt_note = gm_crypt.write(OUT, gm_payload, gm_crypt.passphrase())
    json.dump([{'p': p} for p in vault],
              open(os.path.join(OUT, 'index-vault.json'), 'w', encoding='utf-8'),
              separators=(',', ':'))

    # Vault edges live in their own file: ~1M links across 41k notes would
    # several-times the main vault index, and they are only needed when a vault
    # scope is actually graphed. Targets are interned to integers to keep it
    # from ballooning — the same basename recurs thousands of times.
    interned, order, edges = {}, [], []
    for p in vault:
        ids = []
        for t in links_of(p):
            i = interned.get(t)
            if i is None:
                i = interned[t] = len(order)
                order.append(t)
            ids.append(i)
        edges.append(ids)
    json.dump({'names': order, 'links': edges},
              open(os.path.join(OUT, 'index-vault-links.json'), 'w', encoding='utf-8'),
              separators=(',', ':'))
    json.dump(shown, open(os.path.join(OUT, 'precache.json'), 'w', encoding='utf-8'),
              separators=(',', ':'))

    # Pages would otherwise hand the tree to Jekyll, which skips _underscore dirs
    open(os.path.join(OUT, '.nojekyll'), 'w').close()

    total = sum(os.path.getsize(os.path.join(dp, f))
                for dp, _, fs in os.walk(OUT) for f in fs)
    print(('GM BUILD — do not deploy\n' if args.gm else '')
          + f'campaign notes : {len(shown):,}'
          + ('' if args.gm else f'  ({len(withheld)} withheld, {redacted_count} redacted)'))
    print(f'vault notes    : {len(vault):,}' + ('  (skipped)' if args.no_vault else ''))
    print(f'site size      : {total / 1e6:.1f} MB')
    if not args.gm:
        print(f'gm vault       : {crypt_note}')


if __name__ == '__main__':
    sys.exit(main())
