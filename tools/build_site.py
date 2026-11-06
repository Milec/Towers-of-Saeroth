#!/usr/bin/env python3
"""Assemble the static site for GitHub Pages.

Notes are served as raw .md and rendered in the browser, so the build is just
a copy plus two indexes. Nothing is pre-rendered, which keeps the output about
the same size as the repo instead of several times larger.

  --no-vault   omit the 41k-file rules reference (site drops ~192 MB, and the
               campaign notes still work in full)
"""
import argparse, json, os, re, shutil, sys
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '_site')
FM = re.compile(r'^---\r?\n.*?\r?\n---\r?\n?', re.S)


#: Images referenced from a note live beside it in the repo, so `![](x.jpg)`
#: is correct in Obsidian and on GitHub, and get copied beside it into
#: content/ so the site can resolve the same path from the note's directory.
ASSETS = ('.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif')


def collect_assets(rel_root):
    out = []
    base = os.path.join(ROOT, rel_root)
    for dirpath, dirnames, files in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith('.'))
        for f in sorted(files):
            if f.lower().endswith(ASSETS):
                full = os.path.join(dirpath, f)
                out.append(os.path.relpath(full, ROOT).replace(os.sep, '/'))
    return out


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


def build_session_catalog():
    """Publish actor references, never executable actor data, for session exports."""
    module = Path(ROOT) / 'foundry-module'
    shutil.copyfile(module / 'scripts/session-package.mjs', Path(OUT) / 'session-package.mjs')
    manifest = json.loads((module / 'content/saeroth-creatures.json').read_text(encoding='utf-8'))
    if manifest.get('schema') != 1 or not isinstance(manifest.get('actors'), list):
        raise ValueError('The Saeroth actor feed is not a supported session catalog source.')
    actors, seen = [], set()
    for actor in manifest['actors']:
        flags = actor.get('flags', {})
        source = flags.get('saeroth-pf2e-content', flags.get('saeroth', {}))
        key = source.get('syncKey', source.get('source', ''))
        if not isinstance(key, str) or not key.startswith('campaign/') or not key.endswith('.md'):
            raise ValueError(f'Actor has no campaign source: {actor.get("name")}')
        if '..' in key.split('/') or '\\' in key or not (Path(ROOT) / key).is_file() or key in seen:
            raise ValueError(f'Invalid or duplicate actor source: {key}')
        seen.add(key)
        image = actor.get('img', '')
        parsed = urlsplit(image)
        prefix = '/Milec/Towers-of-Saeroth/main/'
        if parsed.scheme == 'https' and parsed.netloc == 'raw.githubusercontent.com' and parsed.path.startswith(prefix):
            asset = unquote(parsed.path[len(prefix):])
            image = 'content/' + quote(asset, safe='/') if asset.startswith('campaign/') and '..' not in asset.split('/') and (Path(ROOT) / asset).is_file() else ''
        else:
            image = ''
        actors.append({'key': key, 'name': actor['name'], 'level': actor['system']['details']['level']['value'], 'img': image})
    actors.sort(key=lambda actor: actor['name'].casefold())
    (Path(OUT) / 'session-actors.json').write_text(json.dumps({'schema': 1, 'actors': actors}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


#: Tab order and tab labels for the players' page. Anything not listed still
#: ships — it just sorts last under its own filename.
PLAYER_SORT = {'Welcome to Saeroth': 0, 'Character Creation': 1,
               'World Details': 2, 'The Towers': 3, 'History': 4,
               'The Nations': 5, 'Gods, Peoples and the Roads': 6}
PLAYER_ORDER = {'Welcome to Saeroth': 'Welcome',
                'Character Creation': 'Character Creation',
                'World Details': 'World Details',
                'The Towers': 'The Towers', 'History': 'History',
                'The Nations': 'The Nations',
                'Gods, Peoples and the Roads': 'Gods & Roads'}

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


def analyse(path, limit=None):
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
    # Index the complete note, including creature actions. The library shows
    # a separate short summary; truncating the search index hid later sections.
    s = re.sub(r'^```[^\n]*$', ' ', s, flags=re.M)
    s = re.sub(r'\[\[([^\]|]*\|)?([^\]]*)\]\]', r'\2', s)
    s = re.sub(r'[#*_`>|\-]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip().lower()[:limit], links


def card_metadata(path):
    """Small display fields derived from the maintained note, never new lore."""
    raw = Path(ROOT, path).read_text(encoding='utf-8')
    front = FM.match(raw)
    fields = {}
    if front:
        for key in ('title', 'status', 'audience'):
            value = re.search(r'^' + key + r':\s*([^\n\r]+)', front.group(), re.M)
            if value:
                fields[key] = value.group(1).strip().strip('\"\'')
    fields.setdefault('title', Path(path).stem)
    body = FM.sub('', raw)
    # Only use a local existing asset. External URLs and paths outside the
    # campaign are deliberately not promoted into automatically fetched cards.
    for image in re.finditer(r'!\[[^\]]*\]\(<?([^\n)]+?)>?\)', body):
        source = image.group(1).strip().strip('<>')
        from urllib.parse import unquote
        source = unquote(source)
        if re.match(r'^[a-z]+:|^[/\\]', source, re.I):
            continue
        candidate = (Path(ROOT, path).parent / source).resolve()
        campaign_root = Path(ROOT, 'campaign').resolve()
        if candidate.is_relative_to(campaign_root) and candidate.is_file() and candidate.suffix.lower() in ASSETS:
            fields['image'] = 'content/' + candidate.relative_to(Path(ROOT)).as_posix()
            break
    body = re.sub(r'```.*?```', '', body, flags=re.S)
    body = re.sub(r'!\[[^\]]*\]\([^\n]*?\)', '', body)
    for paragraph in re.split(r'\n\s*\n', body):
        paragraph = paragraph.strip()
        if not paragraph or re.match(r'^[#>|*\-]|^\d+\.', paragraph):
            continue
        if paragraph.startswith('_') or '\n|' in paragraph:
            continue
        paragraph = re.sub(r'\[\[([^\]|]*\|)?([^\]]*)\]\]', r'\2', paragraph)
        paragraph = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', paragraph)
        paragraph = re.sub(r'<[^>]+>', '', paragraph)
        paragraph = re.sub(r'[*_`]', '', paragraph)
        paragraph = re.sub(r'\s+', ' ', paragraph).strip()
        if len(paragraph) < 35:
            continue
        fields['summary'] = paragraph if len(paragraph) <= 190 else paragraph[:187].rsplit(' ', 1)[0] + '…'
        break
    return fields


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

    build_session_catalog()

    from build_atlas_lore import build as build_atlas_lore
    build_atlas_lore(Path(OUT))

    # players/ is a separate little site at /players/ — a handful of hand-written
    # documents with their own reader page. It is deliberately NOT part of the
    # vault: nothing links to it, it links to nothing, it has no search, no
    # graph and no service worker, and its documents are written by hand rather
    # than derived from campaign notes. That is the whole point of it — the
    # vault can say anything it likes without the players' copy changing.
    players = sorted(f for f in os.listdir(os.path.join(ROOT, 'players'))
                     if f.endswith('.md')) if os.path.isdir(os.path.join(ROOT, 'players')) else []
    if players:
        pdir = os.path.join(OUT, 'players', 'content')
        os.makedirs(pdir, exist_ok=True)
        for f in players:
            shutil.copyfile(os.path.join(ROOT, 'players', f), os.path.join(pdir, f))
        # and whatever art those documents embed, alongside them
        for f in sorted(os.listdir(os.path.join(ROOT, 'players'))):
            if f.lower().endswith(ASSETS):
                shutil.copyfile(os.path.join(ROOT, 'players', f), os.path.join(pdir, f))
        json.dump([{'file': f, 'title': PLAYER_ORDER.get(f[:-3], f[:-3])} for f in
                   sorted(players, key=lambda f: PLAYER_SORT.get(f[:-3], 99))],
                  open(os.path.join(OUT, 'players', 'pages.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))

    campaign = collect('campaign')
    vault = [] if args.no_vault else collect('vault')

    assets = collect_assets('campaign')
    copy_notes(campaign)
    copy_notes(assets)
    copy_notes(vault)

    notes = []
    for p in campaign:
        body, links = analyse(p)
        notes.append({'p': p, 'body': body, 'l': links, 't': note_type(p), **card_metadata(p)})
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
    # Art embedded in a campaign note is precached with it, or the note goes
    # offline complete except for the picture in the middle of it.
    json.dump(campaign + assets, open(os.path.join(OUT, 'precache.json'), 'w', encoding='utf-8'),
              separators=(',', ':'))

    # Pages would otherwise hand the tree to Jekyll, which skips _underscore dirs
    open(os.path.join(OUT, '.nojekyll'), 'w').close()

    total = sum(os.path.getsize(os.path.join(dp, f))
                for dp, _, fs in os.walk(OUT) for f in fs)
    print(f'campaign notes : {len(campaign):,}' +
          (f'  (+{len(assets)} image{"s" if len(assets) != 1 else ""})' if assets else ''))
    print(f'vault notes    : {len(vault):,}' + ('  (skipped)' if args.no_vault else ''))
    print(f'players page   : {len(players)} documents at /players/')
    print(f'site size      : {total / 1e6:.1f} MB')


if __name__ == '__main__':
    sys.exit(main())
