"""Verify note → shared overlay parsing without touching real campaign records."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from build_campaign_pois import extract

class CampaignPOITest(unittest.TestCase):
    def test_notes_and_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=root/'campaign/world/locations';folder.mkdir(parents=True)
            record={'id':123,'name':'Tower --- East','kind':'tower','x':120.5,'y':99}
            raw=('---\ntitle: Tower East\ntype: location\natlas_poi: '+json.dumps(record)+'\n---\n\nA guarded tower.\n\nUpdated on GitHub.\n').encode()
            path=folder/'Tower East.md';path.write_bytes(raw)
            result=extract(root)
            self.assertEqual(result[0]['name'],record['name'])
            self.assertEqual(result[0]['notes'],'A guarded tower.\n\nUpdated on GitHub.')
            self.assertEqual(result[0]['noteSHA'],hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest())
            (folder/'Duplicate.md').write_bytes(raw)
            with self.assertRaisesRegex(ValueError,'Duplicate'):extract(root)

    def test_invalid_coordinates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'campaign').mkdir()
            (root/'campaign/Bad.md').write_text('---\natlas_poi: '+json.dumps({'id':1,'name':'Bad','kind':'camp','x':9000,'y':2})+'\n---\n',encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'coordinate'):extract(root)

if __name__=='__main__':unittest.main()
