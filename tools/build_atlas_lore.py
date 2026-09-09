"""Join campaign note paths to the retained atlas IDs; no lore is copied by hand."""
import json
import re
from pathlib import Path
from atlas_additions import apply_additions

ROOT = Path(__file__).resolve().parents[1]

def territory_anchor(svg_path):
    """Place an overview pin inside the largest land polygon, away from shores."""
    rings = []
    for part in re.findall(r'M[^M]+', svg_path):
        nums = list(map(float, re.findall(r'-?\d+(?:\.\d+)?', part)))
        ring = list(zip(nums[::2], nums[1::2]))
        if len(ring) >= 3: rings.append(ring)
    def area(r):
        return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(r,r[1:]+r[:1])))
    ring = max(rings, key=area)
    edges = [edge for polygon in rings for edge in zip(polygon, polygon[1:]+polygon[:1])]
    def score(x,y):
        inside = False
        distance = float('inf')
        for (ax,ay),(bx,by) in edges:
            if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax: inside = not inside
            dx,dy=bx-ax,by-ay
            t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy))) if dx or dy else 0
            distance=min(distance,(x-ax-t*dx)**2+(y-ay-t*dy)**2)
        return distance if inside else -distance
    x0,x1=min(x for x,y in ring),max(x for x,y in ring)
    y0,y1=min(y for x,y in ring),max(y for x,y in ring)
    best=(-float('inf'),x0,y0)
    for _ in range(4):
        dx,dy=(x1-x0)/12,(y1-y0)/12
        for ix in range(13):
            for iy in range(13):
                x,y=x0+ix*dx,y0+iy*dy
                best=max(best,(score(x,y),x,y))
        _,x,y=best
        x0,x1,y0,y1=x-dx,x+dx,y-dy,y+dy
    if best[0] <= 0: raise ValueError('No interior nation anchor')
    return [round(best[1],2),round(best[2],2)]

def normal(value):
    return re.sub(r'[^a-z0-9]', '', value.lower())

def build(out):
    raw = (ROOT / 'site/atlas/data.js').read_text(encoding='utf-8')
    data = apply_additions(json.loads(raw[raw.index('{'):].rstrip().rstrip(';')))
    extra = (ROOT / 'site/atlas/lore-features.js').read_text(encoding='utf-8')
    for key in ('markers', 'notes'):
        match = re.search(r'ATLAS\.' + key + r'\.push\(\.\.\.(\[.*?\])\);', extra)
        if match: data[key].extend(json.loads(match[1]))
    from build_campaign_pois import build as build_campaign_pois
    campaign_pois = build_campaign_pois(ROOT, out)
    custom_paths = {p['notePath'] for p in campaign_pois}
    notes = list((ROOT / 'campaign').rglob('*.md'))
    names = {}
    for p in notes:
        if p.relative_to(ROOT).as_posix() in custom_paths: continue
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
        country = next(c for c in data['countries'] if c['properties']['state'] == s['i'])
        positions[name] = territory_anchor(country['path'])
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
        if p and p.get('i') and not p.get('removed'):
            add('province', p, p.get('fullName', p.get('name', '')), fallback=entries.get(f'nation-{p.get("state")}', {}).get('note'))
    district_source = (ROOT / 'site/atlas/subprovinces-data.js').read_text(encoding='utf-8')
    district_data = json.loads(district_source[district_source.index('{'):].rstrip().rstrip(';'))
    for district in district_data['districts']:
        add('subprovince', district, district['name'], fallback=entries.get(f'nation-{district["state"]}', {}).get('note'))
    for p in campaign_pois:
        key = f'custompoi-{p["id"]}'
        entries[key] = {'name':p['name'],'note':p['notePath'],'direct':True}
        by_note.setdefault(p['notePath'],[]).append(key)
    result = {'entries': entries, 'byNote': by_note, 'unmatched': unmatched}
    (out / 'atlas/lore-index.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    (out / 'nation-positions.json').write_text(json.dumps({'width':3840, 'height':2160, 'nations':positions, 'image':'atlas/political.webp', 'playerImage':'atlas/Saeroth-Political-Travel.png', 'note':'Generated from interior points of the Living Atlas national territories by build_atlas_lore.py.'}), encoding='utf-8')
    print(f'Atlas lore: {len(positions)} nations, {len(by_note)} linked notes; {len(unmatched)} records without a dedicated note or nation fallback')
    return result

if __name__ == '__main__':
    build(ROOT / '_site')
