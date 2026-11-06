/* The browser publisher and trusted-main merge guard share this binary contract. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaerothEditorAsset = api;
})(globalThis, function () {
  'use strict';
  const LIMIT_BYTES = 2 * 1024 * 1024, MAX_SIDE = 2048, MIME = 'image/webp';
  const HASH = /^[a-f0-9]{64}$/;
  const fail = message => { throw new Error(message); };
  const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === expected;
  function filename(hash) {
    if (!HASH.test(hash)) fail('Artwork has an invalid content fingerprint.');
    return 'saeroth-art-' + hash + '.webp';
  }
  function assetPath(notePath, hash) {
    if (typeof notePath !== 'string' || !/^campaign\/.+\.md$/.test(notePath) ||
        /[\\%#\[\]\x00-\x1f\x7f<>:"|?*]/.test(notePath) ||
        notePath.split('/').some(part => !part || part.startsWith('.') || /[. ]$/.test(part))) {
      fail('Artwork must be beside its campaign entry.');
    }
    return notePath.slice(0, notePath.lastIndexOf('/') + 1) + filename(hash);
  }
  function validDescriptor(notePath, value) {
    try {
      return !!(keys(value, 'bytes,mime,path,sha256') && value.mime === MIME &&
        Number.isSafeInteger(value.bytes) && value.bytes >= 20 && value.bytes <= LIMIT_BYTES &&
        HASH.test(value.sha256) && value.path === assetPath(notePath, value.sha256));
    } catch (_) { return false; }
  }
  function descriptor(notePath, payload) {
    return {path:assetPath(notePath, payload.sha256), mime:MIME, sha256:payload.sha256, bytes:payload.bytes};
  }
  function decode(data) {
    if (typeof data !== 'string' || !data || data.length > 4 * Math.ceil(LIMIT_BYTES / 3) ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
      fail('Artwork must contain canonical base64 data under 2 MiB.');
    }
    let binary;
    try { binary = atob(data); } catch (_) { fail('Artwork data is not valid base64.'); }
    if (btoa(binary) !== data) fail('Artwork data is not canonical base64.');
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }
  function dimensions(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes.length > LIMIT_BYTES) fail('Artwork must be a WebP image under 2 MiB.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const word = at => String.fromCharCode(...bytes.subarray(at, at + 4));
    const uint24 = at => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
    if (word(0) !== 'RIFF' || word(8) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) fail('Artwork is not a complete WebP container.');
    let position = 12, canvas = null, pixels = null, alpha = false, color = false, flags = 0, chunks = 0;
    while (position < bytes.length) {
      if (++chunks > 8 || position + 8 > bytes.length) fail('Artwork has an invalid WebP chunk table.');
      const kind = word(position), size = view.getUint32(position + 4, true), start = position + 8;
      const end = start + size, next = end + (size & 1);
      if (size < 1 || end > bytes.length || next > bytes.length || ((size & 1) && bytes[end] !== 0)) fail('Artwork has a truncated WebP chunk.');
      if (kind === 'VP8X') {
        if (canvas || pixels || position !== 12 || size !== 10 || (bytes[start] & ~0x30) ||
            bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) fail('Artwork must be a static WebP without embedded metadata.');
        flags = bytes[start];
        canvas = {width:uint24(start + 4) + 1, height:uint24(start + 7) + 1};
      } else if (kind === 'ICCP') {
        // Chrome canvas includes its sRGB profile. Preserve bounded color
        // information while excluding EXIF, XMP and animation payloads.
        if (!canvas || color || alpha || pixels || !(flags & 0x20) || size < 132 || size > 65536 ||
            view.getUint32(start, false) !== size || word(start + 36) !== 'acsp') fail('Artwork has an invalid color profile.');
        color = true;
      } else if (kind === 'ALPH') {
        if (!canvas || alpha || pixels) fail('Artwork has an invalid alpha channel.');
        alpha = true;
      } else if (kind === 'VP8 ') {
        if (pixels || size < 11 || (bytes[start] & 1) ||
            bytes[start + 3] !== 0x9d || bytes[start + 4] !== 1 || bytes[start + 5] !== 0x2a) fail('Artwork has an invalid WebP frame.');
        const partition = (bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16)) >>> 5;
        if (!partition || partition + 10 > size) fail('Artwork has an incomplete WebP frame.');
        pixels = {width:view.getUint16(start + 6, true) & 0x3fff, height:view.getUint16(start + 8, true) & 0x3fff};
      } else if (kind === 'VP8L') {
        if (pixels || alpha || size < 6 || bytes[start] !== 0x2f || (bytes[start + 4] & 0xe0)) fail('Artwork has an invalid lossless WebP frame.');
        pixels = {width:1 + bytes[start + 1] + ((bytes[start + 2] & 0x3f) << 8),
          height:1 + (bytes[start + 2] >> 6) + (bytes[start + 3] << 2) + ((bytes[start + 4] & 0x0f) << 10)};
      } else fail('Artwork must be a static WebP without embedded metadata.');
      position = next;
    }
    if (!pixels || (!!(flags & 0x20) !== color) || (canvas && (canvas.width !== pixels.width || canvas.height !== pixels.height)) ||
        pixels.width < 1 || pixels.height < 1 || pixels.width > MAX_SIDE || pixels.height > MAX_SIDE) {
      fail('Artwork must be at most 2048 pixels on each side.');
    }
    return pixels;
  }
  async function validate(payload) {
    if (!keys(payload, 'bytes,data,mime,sha256') || payload.mime !== MIME || !HASH.test(payload.sha256) ||
        !Number.isSafeInteger(payload.bytes) || payload.bytes < 20 || payload.bytes > LIMIT_BYTES) fail('Artwork metadata is invalid.');
    const bytes = decode(payload.data);
    if (bytes.length !== payload.bytes) fail('Artwork byte count does not match its content.');
    dimensions(bytes);
    const cryptography = globalThis.crypto ?? (typeof require === 'function' ? require('node:crypto').webcrypto : null);
    if (!cryptography?.subtle) fail('A secure browser connection is required to validate artwork.');
    const digest = await cryptography.subtle.digest('SHA-256', bytes);
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== payload.sha256) fail('Artwork content does not match its fingerprint.');
    return {mime:MIME, data:payload.data, sha256:actual, bytes:bytes.length};
  }
  function reference(content, name) {
    if (typeof content !== 'string' || !/^saeroth-art-[a-f0-9]{64}\.webp$/.test(name)) return false;
    const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/<!--[\s\S]*?(?:-->|$)/g, '');
    const image = new RegExp('^ {0,3}!\\[(?:\\\\.|[^\\\\\\]])*\\]\\(' + name.replace('.', '\\.') + '\\)[\\t ]*$');
    let fence = null;
    for (const line of body.split(/\r?\n/)) {
      const marker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(line);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        continue;
      }
      if (!fence && image.test(line)) return true;
    }
    return false;
  }
  return Object.freeze({LIMIT_BYTES, MAX_SIDE, MIME, validate, dimensions, decode, filename, assetPath, descriptor, validDescriptor, reference});
});
