"""Apply explicitly modeled district seats without rewriting the source snapshot."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADDITIONS = ROOT / 'site/atlas/settlement-additions-data.js'

def apply_additions(data):
    raw = ADDITIONS.read_text(encoding='utf-8')
    additions = json.loads(raw[raw.index('{'):raw.rfind('}')+1])
    for b in additions['burgs']:
        assert not any(old['i'] == b['i'] for old in data['burgs'])
        data['burgs'].append(b)
        p = next(p for p in data['provinces'] if p and p.get('i') == b['province'])
        s = next(s for s in data['states'] if s and s.get('i') == b['state'])
        p['burgs'].append(b['i'])
        s['burgs'] += 1
        for territory in (p, s):
            assert territory['rural'] >= b['population']
            territory['rural'] -= b['population']
            territory['urban'] += b['population']
    return data
