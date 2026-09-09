"""Compile campaign-owned POI frontmatter into a shared atlas overlay."""
import hashlib
import json
import re
from pathlib import Path

KINDS={'encounter','tower','camp','ruin','cave','shrine','fort','inn','other'}

def extract(root):
    records=[]
    for path in sorted((root/'campaign').rglob('*.md')):
        raw=path.read_bytes()
        text=raw.decode('utf-8').replace('\r\n','\n')
        parts=re.match(r'\A---\n(.*?)\n---\n(.*)\Z',text,re.S)
        if not parts:continue
        match=re.search(r'^atlas_poi: (.+)$',parts[1],re.M)
        if not match:continue
        record=json.loads(match[1]);name=record.get('name','');i=record.get('id')
        if not isinstance(i,int) or isinstance(i,bool) or not 0<i<2**53 or not isinstance(name,str) or not name.strip() or len(name)>100 or record.get('kind') not in KINDS:
            raise ValueError(f'Invalid POI metadata: {path}')
        for key,limit in [('x',3840),('y',2160)]:
            value=record.get(key)
            if isinstance(value,bool) or not isinstance(value,(int,float)) or not 0<=value<=limit:raise ValueError(f'Invalid POI coordinate: {path}')
        body=parts[2].removeprefix('\n').removesuffix('\n')
        if len(body)>5000:raise ValueError(f'POI notes exceed 5000 characters: {path}')
        records.append({**{k:record[k] for k in ('id','name','kind','x','y')},'notes':body,
                        'notePath':path.relative_to(root).as_posix(),
                        'noteSHA':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()})
    if len(records)>500:raise ValueError('Shared POIs exceed the 500-location limit')
    if len({p['id'] for p in records})!=len(records):raise ValueError('Duplicate campaign POI IDs')
    return records

def build(root,out):
    records=extract(root)
    (out/'atlas/campaign-pois.json').write_text(json.dumps({'version':1,'pois':records},ensure_ascii=False),encoding='utf-8')
    return records
