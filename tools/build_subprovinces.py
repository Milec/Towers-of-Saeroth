"""Generate terrain-cell districts inside the unchanged province polygons.
Requires numpy, scipy and shapely; normal site builds use the committed result.
"""
import hashlib
import heapq
import json
import math
import re
from pathlib import Path

from atlas_additions import apply_additions, ADDITIONS

import numpy as np
import shapely
from scipy.spatial import cKDTree
from shapely.geometry import MultiPoint, Point, Polygon, box
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site/atlas/subprovinces-data.js'

def read_js(path):
    text = path.read_text(encoding='utf-8')
    return json.loads(text[text.index('{'):text.rfind('}') + 1])

def province_shape(path):
    result = Polygon()
    for part in re.findall(r'M[^M]+', path):
        values = list(map(float, re.findall(r'-?\d+(?:\.\d+)?', part)))
        ring = shapely.make_valid(Polygon(list(zip(values[::2], values[1::2]))))
        result = result.symmetric_difference(ring)
    return shapely.make_valid(result)

def polygon_parts(geometry):
    if geometry.geom_type == 'Polygon':
        if geometry.area > 1e-9:
            yield geometry
    elif hasattr(geometry, 'geoms'):
        for part in geometry.geoms:
            yield from polygon_parts(part)

def svg_path(geometry):
    rings = []
    for polygon in polygon_parts(geometry):
        for ring in [polygon.exterior, *polygon.interiors]:
            rings.append('M' + 'L'.join(f'{x:.6f},{y:.6f}' for x, y in ring.coords) + 'Z')
    return ''.join(rings)

def allocate(total, weights):
    amounts = [total * w / sum(weights) for w in weights]
    values = [math.floor(n) for n in amounts]
    for i in sorted(range(len(values)), key=lambda i: (-(amounts[i]-values[i]), i))[:total-sum(values)]:
        values[i] += 1
    return values

def generate():
    data_path = ROOT / 'site/atlas/data.js'
    data = apply_additions(read_js(data_path))
    geography = np.load(ROOT / 'atlas-source/geography.npz')
    original_points = geography['P']
    elevation = geography['elevation']
    point_tree = cKDTree(original_points)
    points = list(original_points)
    for burg in data['burgs']:
        xy = (burg['x'], burg['y'])
        if point_tree.query(xy)[0] > .03:
            points.append(xy)
    cells = list(shapely.voronoi_polygons(MultiPoint(points), extend_to=box(-10,-10,3850,2170), ordered=True).geoms)
    cell_tree = STRtree(cells)
    burgs = {b['i']: b for b in data['burgs']}
    records, checks = [], []
    for province in data['provinces']:
        if not province or not province.get('i') or province.get('removed'):
            continue
        parent = province_shape(province['path'])
        members = [burgs[i] for i in province['burgs'] if i in burgs]
        assert len(members) >= 2, 'Generate district seats first'
        count = min(5, max(2, round(math.sqrt(len(members)))))
        pieces = []
        for i in cell_tree.query(parent, predicate='intersects'):
            pieces.extend(polygon_parts(cells[i].intersection(parent)))
        centers = np.array([[p.representative_point().x, p.representative_point().y] for p in pieces])
        piece_tree = STRtree(pieces)
        heights = elevation[point_tree.query(centers)[1]]
        graph = [[] for _ in pieces]
        for i, piece in enumerate(pieces):
            for j in piece_tree.query(piece, predicate='intersects'):
                if j <= i or piece.intersection(pieces[j]).length < .001:
                    continue
                distance = np.linalg.norm(centers[i]-centers[j])
                cost = distance * (1 + abs(heights[i]-heights[j])/180 + max(0, heights[i], heights[j])/1200)
                graph[i].append((int(j), float(cost)))
                graph[j].append((i, float(cost)))
        def cell_for(b):
            point = Point(b['x'], b['y'])
            hits = [int(i) for i in piece_tree.query(point, predicate='intersects')]
            if not hits:
                raise ValueError(f"Settlement outside province: {province['i']} / {b['name']}")
            return min(hits)
        member_cells = {b['i']: cell_for(b) for b in members}
        seeds = [max(members, key=lambda b: (b['population'], -b['i']))]
        while len(seeds) < min(count, len(members)):
            candidates = [b for b in members if b not in seeds and member_cells[b['i']] not in [member_cells[s['i']] for s in seeds]]
            if not candidates:
                raise ValueError('Distinct settlement seed cells are required')
            seeds.append(max(candidates, key=lambda b: (min(math.hypot(b['x']-s['x'], b['y']-s['y']) for s in seeds) * (1+math.log1p(b['population'])/12), -b['i'])))
        seed_nodes = [member_cells[b['i']] for b in seeds]
        owners = [-1]*len(pieces)
        distance = [math.inf]*len(pieces)
        queue = []
        for label, i in enumerate(seed_nodes):
            distance[i] = 0
            heapq.heappush(queue, (0, label, i))
        def flood():
            while queue:
                cost, label, i = heapq.heappop(queue)
                if owners[i] != -1:
                    continue
                owners[i] = label
                for j, weight in graph[i]:
                    if owners[j] == -1 and cost+weight < distance[j]:
                        distance[j] = cost+weight
                        heapq.heappush(queue, (cost+weight, label, j))
        flood()
        # Detached islands remain attached to the nearest district seed; no sea geometry is added.
        while -1 in owners:
            unassigned = [i for i, owner in enumerate(owners) if owner == -1]
            i, label = min(((i, label) for i in unassigned for label in range(count)), key=lambda pair: np.linalg.norm(centers[pair[0]]-centers[seed_nodes[pair[1]]]))
            distance[i] = 0
            heapq.heappush(queue, (0, label, i))
            flood()
        shapes = [shapely.union_all([p for p, owner in zip(pieces, owners) if owner == label]).intersection(parent) for label in range(count)]
        groups = [[b for b in members if owners[member_cells[b['i']]] == label] for label in range(count)]
        if any(not group for group in groups) and len(members) >= 2:
            raise ValueError(f"Empty populated district in {province['fullName']}")
        areas = [shape.area for shape in shapes]
        population = round((province['rural']+province['urban'])*250)
        urban = [sum(b['population'] for b in group) for group in groups]
        rural = max(0, population - sum(urban)*250)
        weights = [urban[i]*250+rural*areas[i]/sum(areas) for i in range(count)]
        populations = allocate(population, weights)
        union = shapely.union_all(shapes)
        error = parent.symmetric_difference(union).area
        overlap = sum(areas)-union.area
        if error > .01 or overlap > .01:
            raise ValueError(f'Coverage failure: {province["i"]}: {error}, {overlap}')
        for label, (shape, group) in enumerate(zip(shapes, groups)):
            capital = max(group or members, key=lambda b:(b['population'],-b['i']))
            external = not group
            name = capital['name'] + (' Hinterland' if external else ' District')
            point = shape.representative_point()
            records.append({'i':province['i']*10+label+1, 'name':name, 'fullName':name, 'province':province['i'], 'state':province['state'], 'capital':capital['i'], 'externalSeat':external, 'burgs':[b['i'] for b in group], 'population':populations[label], 'area':round(shape.area,4), 'bounds':[round(n,4) for n in shape.bounds], 'pole':[round(point.x,4),round(point.y,4)], 'path':svg_path(shape), 'components':len(list(polygon_parts(shape)))})
        checks.append({'province':province['i'], 'districts':count, 'settlements':len(members), 'coverageError':round(error,8), 'overlapArea':round(overlap,8)})
    return {'schemaVersion':1, 'geographySHA256':hashlib.sha256((ROOT/'atlas-source/geography.npz').read_bytes()).hexdigest(), 'sourceSHA256':hashlib.sha256(data_path.read_bytes()).hexdigest(), 'method':'Terrain-weighted growth over clipped Voronoi cells; settlement seeds; detached islands assigned to nearest district seed.', 'singleSeatPolicy':'added-settlements', 'additionsSHA256':hashlib.sha256(ADDITIONS.read_text(encoding='utf-8').encode('utf-8')).hexdigest(), 'districts':records, 'checks':checks}

if __name__ == '__main__':
    result = generate()
    OUT.write_text('window.ATLAS_SUBPROVINCES='+json.dumps(result,separators=(',',':'),ensure_ascii=False)+';\n',encoding='utf-8')
    print(f"Generated {len(result['districts'])} districts in {len(result['checks'])} provinces")
