"""Fast invariants for the committed district artifact; no geometry dependencies."""
from atlas_additions import apply_additions, ADDITIONS
import collections
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(name):
    s=(ROOT/name).read_text(encoding='utf-8')
    return json.loads(s[s.index('{'):s.rfind('}')+1])
def check():
    original=read('site/atlas/data.js')
    d=apply_additions(read('site/atlas/data.js'));generated=read('site/atlas/subprovinces-data.js')
    assert d['burgs'][:len(original['burgs'])]==original['burgs'], 'Original settlements changed'
    additions=read('site/atlas/settlement-additions-data.js')['burgs']
    assert len(additions)==14 and all(b['population']==.8 for b in additions)
    for kind in ('provinces','states'):
        for before,after in zip(original[kind],d[kind]):
            if not before or not before.get('i') or before.get('removed'):continue
            assert before.get('path')==after.get('path')
            assert abs(before['rural']+before['urban']-after['rural']-after['urban'])<1e-7
    assert len(d['burgs'])==len({b['i'] for b in d['burgs']})
    assert generated['geographySHA256']==hashlib.sha256((ROOT/'atlas-source/geography.npz').read_bytes()).hexdigest()
    assert generated['sourceSHA256']==hashlib.sha256((ROOT/'site/atlas/data.js').read_bytes()).hexdigest(),'Regenerate stale districts'
    assert generated['additionsSHA256']==hashlib.sha256(ADDITIONS.read_text(encoding='utf-8').encode('utf-8')).hexdigest()
    provinces={p['i']:p for p in d['provinces'] if p and p.get('i') and not p.get('removed')}
    burgs={b['i']:b for b in d['burgs']};by_parent=collections.defaultdict(list);assigned=[]
    ids=[r['i'] for r in generated['districts']];assert len(ids)==len(set(ids))
    for district in generated['districts']:
        parent=provinces[district['province']];by_parent[parent['i']].append(district)
        assert district['state']==parent['state']
        assert set(district['burgs'])<=set(parent['burgs'])
        assert district['population']>=0 and district['area']>0 and district['path'].startswith('M')
        assert district['burgs']
        capital=max(district['burgs'],key=lambda i:(burgs[i]['population'],-i))
        assert district['capital']==capital and not district['externalSeat']
        assigned+=district['burgs']
    for i,p in provinces.items():
        children=by_parent[i]
        assert 2<=len(children)<=5
        assert sorted(b for c in children for b in c['burgs'])==sorted(p['burgs'])
        assert sum(c['population'] for c in children)==round((p['rural']+p['urban'])*250)
    assert len(assigned)==len(set(assigned))
    for c in generated['checks']:assert c['coverageError']<=.01 and c['overlapArea']<=.01
    print(f"{len(generated['districts'])} districts; {len([p for p in by_parent.values() if p])} subdivided provinces; capitals, memberships, populations and source fingerprint verified")

def check_geometry():
    from build_subprovinces import province_shape, polygon_parts, Point
    import shapely
    d=apply_additions(read('site/atlas/data.js'));generated=read('site/atlas/subprovinces-data.js')
    parents={p['i']:province_shape(p['path']) for p in d['provinces'] if p and p.get('i') and not p.get('removed')}
    burgs={b['i']:b for b in d['burgs']};children=collections.defaultdict(list)
    for district in generated['districts']:
        shape=province_shape(district['path']);parent=parents[district['province']]
        children[district['province']].append(shape)
        for i in district['burgs']:
            assert shape.buffer(.0001).covers(Point(burgs[i]['x'],burgs[i]['y'])), (district['name'],i)
        assert shape.difference(parent).area<.001
        for part in polygon_parts(parent):
            assert len([p for p in polygon_parts(shape.intersection(part)) if p.area>.1])<=1, district['name']
    for i,shapes in children.items():
        union=shapely.union_all(shapes)
        assert parents[i].symmetric_difference(union).area<.01
        assert sum(s.area for s in shapes)-union.area<.01
    print('Serialized geometry verified: internal settlements, full coverage, no overlaps or disconnected mainland districts')

if __name__=='__main__':
    check()
    import sys
    if '--geometry' in sys.argv:check_geometry()
