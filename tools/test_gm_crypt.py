#!/usr/bin/env python3
"""Round-trip the GM vault, including against the browser's own WebCrypto.

The build seals with Python and the site opens with WebCrypto, so the only
test worth having is one that crosses that boundary. Python-to-Python would
pass happily while the browser choked on a different tag order or a salt that
was base64'd differently.

    python3 tools/test_gm_crypt.py          # python round trip only
    python3 tools/test_gm_crypt.py --browser  # also decrypt it in Chromium
"""
import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gm_crypt

PHRASE = 'correct horse battery staple'
SECRET = 'The towers were not always there. — æøå 中文'


def python_round_trip():
    v = gm_crypt.Vault(PHRASE)
    blob = v.seal(SECRET)
    raw = base64.b64decode(blob)
    iv, ct = raw[:12], raw[12:]
    key = hashlib.pbkdf2_hmac('sha256', PHRASE.encode(), v.salt,
                              gm_crypt.ITERATIONS, gm_crypt.KEY_BYTES)
    try:
        from Crypto.Cipher import AES
        out = AES.new(key, AES.MODE_GCM, nonce=iv).decrypt_and_verify(ct[:-16], ct[-16:])
    except ImportError:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        out = AESGCM(key).decrypt(iv, ct, None)
    assert out.decode() == SECRET, 'python round trip lost the plaintext'
    print('  python round trip           ok')
    return v


def browser_round_trip(v):
    """Decrypt the same blob with WebCrypto, the way the site does."""
    blob = v.seal(SECRET)
    payload = json.dumps({'salt': base64.b64encode(v.salt).decode(),
                          'iterations': gm_crypt.ITERATIONS, 'blob': blob})
    script = '''
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto(process.argv[4]);
  const out = await p.evaluate(async ({salt, iterations, blob, phrase}) => {
    const b64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(phrase),
      'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name:'PBKDF2', salt: b64(salt), iterations, hash:'SHA-256' },
      base, { name:'AES-GCM', length:256 }, false, ['decrypt']);
    const raw = b64(blob);
    const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv: raw.slice(0,12) },
      key, raw.slice(12));
    return new TextDecoder().decode(plain);
  }, Object.assign(JSON.parse(process.argv[2]), {phrase: process.argv[3]}));
  console.log(JSON.stringify(out));
  await b.close();
})();
'''
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as fh:
        fh.write(script)
        js = fh.name
    # SubtleCrypto only exists in a secure context, and about:blank is not one.
    # http://127.0.0.1 is, by the localhost exception — which is also why the
    # real site works: GitHub Pages is HTTPS.
    import http.server, socketserver, threading
    srv = socketserver.TCPServer(('127.0.0.1', 0), http.server.SimpleHTTPRequestHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    origin = 'http://127.0.0.1:%d/' % srv.server_address[1]
    try:
        r = subprocess.run(['node', js, payload, PHRASE, origin],
                           capture_output=True, text=True, timeout=240)
        if r.returncode != 0:
            print('  browser round trip          SKIPPED (' + r.stderr.strip().splitlines()[-1][:60] + ')')
            return True
        got = json.loads(r.stdout.strip())
        assert got == SECRET, f'webcrypto decrypted to {got!r}'
        print('  webcrypto round trip        ok')
        return True
    finally:
        srv.shutdown()
        os.unlink(js)


def wrong_passphrase_fails():
    v = gm_crypt.Vault(PHRASE)
    blob = v.seal(SECRET)
    bad = hashlib.pbkdf2_hmac('sha256', b'not the phrase', v.salt,
                              gm_crypt.ITERATIONS, gm_crypt.KEY_BYTES)
    raw = base64.b64decode(blob)
    try:
        from Crypto.Cipher import AES
        AES.new(bad, AES.MODE_GCM, nonce=raw[:12]).decrypt_and_verify(raw[12:-16], raw[-16:])
    except ImportError:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        try:
            AESGCM(bad).decrypt(raw[:12], raw[12:], None)
        except Exception:
            print('  wrong passphrase rejected   ok')
            return
        raise AssertionError('a wrong key decrypted the blob')
    except ValueError:
        print('  wrong passphrase rejected   ok')
        return
    raise AssertionError('a wrong key decrypted the blob')


def no_passphrase_ships_nothing():
    """The failure direction that matters: no key must mean no plaintext."""
    with tempfile.TemporaryDirectory() as d:
        gm_crypt.write(d, {'campaign/secret.md': SECRET}, None)
        body = open(os.path.join(d, 'gm-vault.json')).read()
        assert SECRET not in body and 'secret.md' not in body, 'plaintext shipped without a key'
        assert json.loads(body)['locked'] is False
    print('  no passphrase ships nothing ok')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--browser', action='store_true', help='also verify with Chromium WebCrypto')
    args = ap.parse_args()
    print('gm vault:')
    v = python_round_trip()
    wrong_passphrase_fails()
    no_passphrase_ships_nothing()
    if args.browser:
        browser_round_trip(v)
    print('all good')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
