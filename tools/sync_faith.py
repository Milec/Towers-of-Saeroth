"""Re-derive every deity note's Worship bullet from the nations' Faith bullets.

The vault's rule is that a deity and a nation link from both ends: the nation
says who it keeps, the deity says who keeps it. Nations added since the deity
notes were written broke that in one direction only — the nations named the
gods, the gods never heard about it — which is invisible from the nation's side
and only shows up if you read the deity note and wonder where everyone is.
"""
import os, re, collections, sys

CHECK = '--check' in sys.argv

NAT = 'campaign/nations'
DEI = 'campaign/world/deities'

patrons = collections.defaultdict(set)
kept = collections.defaultdict(set)

for d in sorted(os.listdir(NAT)):
    f = os.path.join(NAT, d, d + '.md')
    if not os.path.isfile(f):
        continue
    m = re.search(r'^- \*\*Faith\*\*\s*(.+)$', open(f, encoding='utf-8').read(), re.M)
    if not m:
        continue
    line = m.group(1)
    links = [x.split('|')[0].strip() for x in re.findall(r'\[\[([^\]]+)\]\]', line)]
    if not links:
        continue
    first = links[0]
    head = line.split('[[')[0]
    after = line.split(']]', 1)[1][:40] if ']]' in line else ''
    # "Patron [[X]]" is the common form. Two nations say it differently and mean
    # the same thing: Sarrowmere keeps Pharasma "above all", and the Thornwild
    # keeps the Green Faith "rather than any named patron" — which is a
    # statement about gods, not about whether the tradition is its own.
    is_patron = (re.match(r'\s*Patron\b', head, re.I)
                 or re.match(r'\s*above all', after, re.I)
                 or re.match(r'\s*rather than any named patron', after, re.I))
    for i, g in enumerate(links):
        (patrons if (is_patron and i == 0) else kept)[g].add(d)

changed = []
for fn in sorted(os.listdir(DEI)):
    if not fn.endswith('.md'):
        continue
    p = os.path.join(DEI, fn)
    s = open(p, encoding='utf-8').read()
    god = fn[:-3]
    if god == 'Gods of the World':
        continue
    pa = sorted(patrons.get(god, ()))
    ke = sorted(set(kept.get(god, ())) - set(pa))
    parts = []
    if pa: parts.append('patron of ' + ', '.join('[[%s]]' % n for n in pa))
    if ke: parts.append('also kept in ' + ', '.join('[[%s]]' % n for n in ke))
    bullet = '- **Worship** ' + ('; '.join(parts) if parts else 'no nation keeps this one as a public faith')
    new = re.sub(r'^- \*\*Worship\*\*.*$', lambda _: bullet, s, count=1, flags=re.M)
    fmv = '[' + ', '.join('"%s"' % n for n in pa) + ']'
    new = re.sub(r'^patron_of:.*$', 'patron_of: ' + fmv, new, count=1, flags=re.M)
    if new != s:
        if not CHECK:
            open(p, 'w', encoding='utf-8').write(new)
        changed.append(god)

print('%d deities, %d nations naming one' %
      (len([f for f in os.listdir(DEI) if f.endswith('.md')]) - 1,
       len({n for s in list(patrons.values()) + list(kept.values()) for n in s})))
if not changed:
    print('every deity note agrees with the nations that keep it')
elif CHECK:
    print('\nout of sync: ' + ', '.join(changed))
    print('run: python3 tools/sync_faith.py')
    raise SystemExit(1)
else:
    print('rewrote ' + ', '.join(changed))
