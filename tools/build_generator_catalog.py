#!/usr/bin/env python3
"""Compile priced PF2e equipment metadata from the pinned public source archive.

Usage: python3 tools/build_generator_catalog.py PF2E_SOURCE_TAR_GZ
The archive is https://github.com/foundryvtt/pf2e/tree/pf2e-8.5.0.
Only metadata and native compendium IDs are published, never executable code.
"""
import json
import re
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build(archive):
    items, coins = [], {}
    with tarfile.open(archive) as source:
        for member in source:
            if '/packs/pf2e/equipment/' not in member.name or not member.name.endswith('.json'):
                continue
            if not member.name.startswith('pf2e-pf2e-8.5.0/'):
                raise ValueError('Use the pinned pf2e-8.5.0 source archive.')
            item = json.load(source.extractfile(member))
            if not isinstance(item, dict) or not isinstance(item.get('_id'), str):
                continue
            system = item.get('system', {})
            price = system.get('price', {})
            amount = price.get('value', {})
            if not isinstance(amount, dict):
                continue
            cp = sum(amount.get(k, 0)*v for k, v in [('cp', 1), ('sp', 10), ('gp', 100), ('pp', 1000)])
            uuid = f'Compendium.pf2e.equipment-srd.Item.{item["_id"]}'
            if system.get('category') == 'coin':
                for denomination in ['cp', 'sp', 'gp', 'pp']:
                    if amount.get(denomination) == 1:
                        coins[denomination] = uuid
                continue
            if item.get('type') not in ['ammo', 'armor', 'backpack', 'consumable', 'equipment', 'shield', 'treasure', 'weapon'] or cp <= 0:
                continue
            level = system.get('level', {}).get('value', 0)
            if not isinstance(level, int) or not 0 <= level <= 30:
                continue
            items.append({'id': item['_id'], 'name': item['name'], 'uuid': uuid,
                          'level': level, 'type': item['type'], 'priceCp': cp,
                          'pricePer': max(1, price.get('per', 1)),
                          'rarity': system.get('traits', {}).get('rarity', 'common'),
                          'traits': system.get('traits', {}).get('value', []),
                          'book': system.get('publication', {}).get('title', '')})
    assert all(k in coins for k in ['cp', 'sp', 'gp', 'pp']), 'Native coin references missing'
    budgets = {}
    for line in (ROOT/'vault/Rules/Treasure by Level (GM Core).md').read_text().splitlines():
        cells = [x.strip() for x in line.strip().strip('|').split('|')]
        if len(cells) == 6 and cells[0].isdigit():
            money = lambda cell: int(re.sub(r'[^0-9]', '', cell))*100
            budgets[cells[0]] = {'totalCp':money(cells[1]), 'currencyCp':money(cells[4]), 'extraCurrencyCp':money(cells[5])}
    assert len(budgets) == 20 and len(items) > 3000
    output = {'schema':1, 'system':{'id':'pf2e','version':'8.5.0'},
              'source':'https://github.com/foundryvtt/pf2e/tree/pf2e-8.5.0/packs/pf2e/equipment',
              'treasureSource':'https://2e.aonprd.com/Rules.aspx?ID=2656',
              'coins':coins, 'budgets':budgets, 'items':sorted(items,key=lambda x:(x['name'],x['id']))}
    (ROOT/'site/generator-items.json').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
    print(f'{len(items)} priced native items; 20 treasure budgets; four coin denominations.')

if __name__ == '__main__':
    build(sys.argv[1])
