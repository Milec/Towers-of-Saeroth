"""Join campaign note paths to the retained atlas IDs; no lore is copied by hand."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def normal(value):
    return re.sub(r'[^a-z0-9]', '', value.lower())

def build(out):
    raw = (ROOT / 'site/atlas/data.js').read_text(encoding='utf-8')
    data = json.loads(raw[raw.index('{'):].rstrip().rstrip(';'))
    extra = (ROOT / 'site/atlas/lore-features.js').read_text(encoding='utf-8')
    for key in ('markers', 'notes'):
        match = re.search(r'ATLAS\.' + key + r'\.push\(\.\.\.(\[.*?\])\);', extra)
        if match: data[key].extend(json.loads(match[1]))
    notes = list((ROOT / 'campaign').rglob('*.md'))
    names = {}
    for p in notes:
        names.setdefault(normal(p.stem), []).append(p.relative_to(ROOT).as_posix())
    entries, by_note, unmatched = {}, {}, []
    def add(kind, obj, name, aliases=(), fallback=None):
        matches = set()
        for candidate in [name, *aliases]:
            matches.update(names.get(normal(candidate), []))
        key = f'{kind}-{obj["i"]}'
        if len(matches) > 1:
            raise ValueError(f'Ambiguous atlas note: {key}: {sorted(matches)}')
        path = next(iter(matches), fallback)
        entries[key] = {'name': name, 'note': path, 'direct': bool(matches)}
        if path and matches:
            by_note.setdefault(path, []).append(key)
        elif not path:
            unmatched.append(key)
        return path
    positions = {}
    for s in data['states']:
        if not s.get('i') or s.get('removed'): continue
        name = s['fullName']
        path = add('nation', s, name)
        if not path: raise ValueError(f'Nation has no campaign note: {name}')
        b = next(b for b in data['burgs'] if b['i'] == s['capital'])
        positions[name] = [b['x'], b['y']]
    for b in data['burgs']:
        nation = entries.get(f'nation-{b.get("state")}', {}).get('note')
        aliases = [b['previousName']] if b.get('previousName') else []
        add('burg', b, b['name'], aliases, nation)
    marker_notes = {n['id']: n for n in data['notes']}
    for m in data['markers']:
        name = marker_notes.get(f'marker{m["i"]}', {}).get('name', m['type'])
        source = m.get('loreSource', '').split('/blob/main/')[-1]
        fallback = source if source.startswith('campaign/') and (ROOT / source).is_file() else None
        add('poi', m, name, name.split(' / '), fallback)
        if fallback and f'poi-{m["i"]}' not in by_note.get(fallback, []):
            by_note.setdefault(fallback, []).append(f'poi-{m["i"]}')
    for p in data['provinces']:
        if p and p.get('i'):
            add('province', p, p.get('fullName', p.get('name', '')), fallback=entries.get(f'nation-{p.get("state")}', {}).get('note'))
    result = {'entries': entries, 'byNote': by_note, 'unmatched': unmatched}
    (out / 'atlas/lore-index.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    (out / 'nation-positions.json').write_text(json.dumps({'width':3840, 'height':2160, 'nations':positions, 'image':'atlas/political.webp', 'note':'Generated from Living Atlas capital coordinates by build_atlas_lore.py.'}), encoding='utf-8')
    print(f'Atlas lore: {len(positions)} nations, {len(by_note)} linked notes; {len(unmatched)} records without a dedicated note or nation fallback')
    return result

if __name__ == '__main__':
    build(ROOT / '_site')
