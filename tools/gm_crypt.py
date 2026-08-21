#!/usr/bin/env python3
"""Encrypt the GM half of the site so it can sit on a public URL.

The site is served from GitHub Pages, which is public below Enterprise. Rather
than run two deployments, the GM material ships as ciphertext alongside the
player material and is decrypted in the browser after a passphrase is entered
once. Players get a site with no GM notes in it at all — not hidden, not
styled away, simply absent from the index and the tree. What is present is a
few hundred kilobytes of AES-GCM that means nothing without the key.

  AES-256-GCM, key from PBKDF2-HMAC-SHA256 over the passphrase.
  One random 16-byte salt per build, one random 12-byte IV per file.

The passphrase comes from the GM_PASSPHRASE environment variable — a GitHub
Actions secret in CI. **If it is not set, the GM material is dropped entirely
rather than shipped in the clear.** That failure direction is deliberate: a
build that quietly published the plaintext because a secret was missing is
exactly the accident this module exists to prevent.

Verified interoperable with the browser's WebCrypto in tools/test_gm_crypt.py.
"""
import base64
import hashlib
import json
import os
import secrets

ITERATIONS = 250_000
KEY_BYTES = 32
SALT_BYTES = 16
IV_BYTES = 12

# Two providers, because neither is reliably present. pycryptodome is the one
# that installs cleanly everywhere; pyca/cryptography is what a CI runner tends
# to have already. BaseException on purpose: pyo3 raises PanicException, which
# does NOT inherit from Exception, and a broken rust binding would otherwise
# take the whole build down at import.
_seal = None
try:                                                     # pragma: no cover
    from Crypto.Cipher import AES as _AES

    def _seal(key, iv, data):
        ct, tag = _AES.new(key, _AES.MODE_GCM, nonce=iv).encrypt_and_digest(data)
        return ct + tag
except BaseException:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM as _AESGCM

        def _seal(key, iv, data):
            return _AESGCM(key).encrypt(iv, data, None)
    except BaseException:
        _seal = None

HAVE_AESGCM = _seal is not None


def passphrase():
    """The build passphrase, or None — in which case no GM material ships."""
    p = os.environ.get('GM_PASSPHRASE', '').strip()
    return p or None


class Vault:
    """Encrypts strings under one salt, and reports what the browser needs."""

    def __init__(self, phrase):
        self.salt = secrets.token_bytes(SALT_BYTES)
        self.key = hashlib.pbkdf2_hmac('sha256', phrase.encode('utf-8'),
                                       self.salt, ITERATIONS, KEY_BYTES)

    def seal(self, text):
        """base64(iv || ciphertext||tag), which is what the client expects."""
        iv = secrets.token_bytes(IV_BYTES)
        blob = _seal(self.key, iv, text.encode('utf-8'))
        return base64.b64encode(iv + blob).decode('ascii')

    def manifest(self, extra=None):
        m = {
            'alg': 'AES-GCM',
            'kdf': 'PBKDF2-SHA256',
            'iterations': ITERATIONS,
            'salt': base64.b64encode(self.salt).decode('ascii'),
            # a known plaintext, so the client can tell a wrong passphrase from
            # a corrupt file instead of failing somewhere further along
            'check': self.seal('saeroth'),
        }
        if extra:
            m.update(extra)
        return m


def write(out_dir, payload, phrase):
    """Write the encrypted GM bundle. Returns a note about what happened.

    `payload` is {path: full_markdown} plus an 'index' entry; everything in it
    is sealed into one file, because a per-note file listing would leak the
    names of the GM notes even while their contents stayed shut.
    """
    path = os.path.join(out_dir, 'gm-vault.json')
    if not phrase:
        # no key, no ciphertext, and no plaintext either
        json.dump({'locked': False, 'empty': True}, open(path, 'w'), separators=(',', ':'))
        return 'no GM_PASSPHRASE set — GM material omitted entirely'
    if not HAVE_AESGCM:                                   # pragma: no cover
        json.dump({'locked': False, 'empty': True}, open(path, 'w'), separators=(',', ':'))
        return 'no AES available (pip install pycryptodome) — GM material omitted entirely'
    v = Vault(phrase)
    bundle = v.manifest({'locked': True, 'data': v.seal(json.dumps(payload, separators=(',', ':')))})
    json.dump(bundle, open(path, 'w'), separators=(',', ':'))
    kb = os.path.getsize(path) / 1024
    return f'GM material sealed: {len(payload)} entries, {kb:.0f} KB of ciphertext'
