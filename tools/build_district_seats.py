"""Create the authorized small seats for provinces with only one existing burg.

Select existing land road/trail nodes inside the province, prioritizing separation
from existing settlements. No roads, original settlements or borders are moved.
Requires the same geometry dependencies as build_subprovinces.py.
"""
import json
import math
from build_subprovinces import ROOT, read_js, province_shape, Point

def generate():
    data = read_js(ROOT / 'site/atlas/data.js')
    network = read_js(ROOT / 'site/atlas/routing-data.js')
    burgs = {b['i']: b for b in data['burgs']}
    road_nodes = sorted({i for a,b,kind,route in network['edges']
                         if kind in ('roads','trails') for i in (a,b)})
    seats = []
    for province in data['provinces']:
        if not province or not province.get('i') or province.get('removed') or len(province['burgs']) != 1:
            continue
        shape = province_shape(province['path'])
        old = burgs[province['burgs'][0]]
        candidates = [i for i in road_nodes if network['nodes'][i][4]
                      and network['nodes'][i][2] == province['state']
                      and shape.contains(Point(network['nodes'][i][:2]))
                      and math.dist(network['nodes'][i][:2], [old['x'],old['y']]) > 5]
        assert candidates, f"No suitable existing route in {province['fullName']}"
        def suitability(i):
            node = network['nodes'][i]
            separation = min(math.dist(node[:2], [b['x'], b['y']]) for b in data['burgs'])
            return separation / (1 + max(0, node[3]-55)/30), -i
        cell = max(candidates, key=suitability)
        x,y,state,height,land = network['nodes'][cell]
        seats.append(dict(i=max(burgs)+len(seats)+1, name=old['name']+' Outpost',
                          x=x,y=y,cell=cell,state=state,province=province['i'],
                          culture=old['culture'],population=.8,capital=0,port=0,
                          type='Generic',habitat='Surface settlement',feature=old.get('feature',0),
                          removed=False,citadel=0,walls=0,temple=0,market=0,
                          production=[],modeledDistrictSeat=True))
    out = {'schemaVersion':1,'residentsPerSeat':200,
           'provenance':'User-authorized modeled district seats; residents reclassified from existing rural estimates. Names are atlas working names, not campaign canon. Locations use existing land road/trail nodes.',
           'burgs':seats}
    (ROOT/'site/atlas/settlement-additions-data.js').write_text(
        'window.ATLAS_ADDITIONS='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    print(f'Generated {len(seats)} small seats on existing routes')

if __name__ == '__main__':
    generate()
