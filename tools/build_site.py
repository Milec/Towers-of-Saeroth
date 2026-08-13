#!/usr/bin/env python3
"""Assemble the static site for GitHub Pages.

Notes are served as raw .md and rendered in the browser, so the build is just
a copy plus two indexes. Nothing is pre-rendered, which keeps the output about
the same size as the repo instead of several times larger.

  --no-vault   omit the 41k-file rules reference (site drops ~192 MB, and the
               campaign notes still work in full)
"""
import argparse, json, os, re, shutil, sys

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


def analyse(path, limit=6000):
    """Return (searchable body, outbound wikilink targets).

    Links are captured before markup is stripped — deriving them afterwards is
    impossible, since stripping replaces [[Milani]] with plain 'Milani'.
    """
    try:
        s = open(os.path.join(ROOT, path), encoding='utf-8').read()
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

    copy_notes(campaign)
    copy_notes(vault)

    notes = []
    for p in campaign:
        body, links = analyse(p)
        notes.append({'p': p, 'body': body, 'l': links, 't': note_type(p)})
    json.dump({'notes': notes},
              open(os.path.join(OUT, 'index-campaign.json'), 'w', encoding='utf-8'),
              separators=(',', ':'))
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
    json.dump(campaign, open(os.path.join(OUT, 'precache.json'), 'w', encoding='utf-8'),
              separators=(',', ':'))

    # Pages would otherwise hand the tree to Jekyll, which skips _underscore dirs
    open(os.path.join(OUT, '.nojekyll'), 'w').close()

    total = sum(os.path.getsize(os.path.join(dp, f))
                for dp, _, fs in os.walk(OUT) for f in fs)
    print(f'campaign notes : {len(campaign):,}')
    print(f'vault notes    : {len(vault):,}' + ('  (skipped)' if args.no_vault else ''))
    print(f'site size      : {total / 1e6:.1f} MB')


if __name__ == '__main__':
    sys.exit(main())
