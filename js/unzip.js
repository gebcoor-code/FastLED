// Minimal ZIP reader / writer (stored + deflate) using browser's (De)CompressionStream.
(function (root) {
  'use strict';

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function isZip(b) { return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B && (b[2] === 3 || b[2] === 5) ; }

  // returns [{name, size, method, offset, csize}]
  function list(b) {
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
      if (u32(b, i) === 0x06054B50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP: central directory not found');
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);
    const out = [];
    for (let n = 0; n < count; n++) {
      if (u32(b, p) !== 0x02014B50) throw new Error('ZIP: corrupted directory');
      const flags = u16(b, p + 8), method = u16(b, p + 10);
      const csize = u32(b, p + 20), size = u32(b, p + 24);
      const nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32);
      const offset = u32(b, p + 42);
      const raw = b.subarray(p + 46, p + 46 + nlen);
      let name;
      try { name = new TextDecoder((flags & 0x800) ? 'utf-8' : 'ibm866').decode(raw); }
      catch (e) { name = String.fromCharCode.apply(null, raw); }
      if (!name.endsWith('/')) out.push({ name, size, csize, method, offset, encrypted: !!(flags & 1) });
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }

  async function extract(b, e) {
    if (e.encrypted) throw new Error('ZIP: encrypted archive');
    if (u32(b, e.offset) !== 0x04034B50) throw new Error('ZIP: corrupted file header');
    const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
    const data = b.subarray(start, start + e.csize);
    if (e.method === 0) return data.slice();
    if (e.method !== 8) throw new Error('ZIP: unsupported compression method ' + e.method);
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack ZIP');
    const ds = new DecompressionStream('deflate-raw');
    const res = new Response(new Blob([data]).stream().pipeThrough(ds));
    return new Uint8Array(await res.arrayBuffer());
  }

  let crcT = null;
  function crc32(d) {
    if (!crcT) { crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // files: [{ name, data: Uint8Array }] → ZIP (deflate when browser can, stored otherwise)
  async function create(files) {
    const parts = [], cen = []; let off = 0;
    const p16 = (a, o, v) => { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; };
    const p32 = (a, o, v) => { p16(a, o, v & 0xFFFF); p16(a, o + 2, v >>> 16); };
    for (const f of files) {
      const name = new TextEncoder().encode(f.name), crc = crc32(f.data);
      let body = f.data, method = 0;
      if (typeof CompressionStream !== 'undefined') {
        const z = new Uint8Array(await new Response(new Blob([f.data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
        if (z.length < f.data.length) { body = z; method = 8; }
      }
      const h = new Uint8Array(30 + name.length);
      p32(h, 0, 0x04034B50); p16(h, 4, 20); p16(h, 6, 0x800); p16(h, 8, method); p16(h, 12, 0x21);
      p32(h, 14, crc); p32(h, 18, body.length); p32(h, 22, f.data.length); p16(h, 26, name.length); h.set(name, 30);
      const c = new Uint8Array(46 + name.length);
      p32(c, 0, 0x02014B50); p16(c, 4, 20); p16(c, 6, 20); p16(c, 8, 0x800); p16(c, 10, method); p16(c, 14, 0x21);
      p32(c, 16, crc); p32(c, 20, body.length); p32(c, 24, f.data.length); p16(c, 28, name.length); p32(c, 42, off); c.set(name, 46);
      parts.push(h, body); cen.push(c); off += h.length + body.length;
    }
    const csz = cen.reduce((n, c) => n + c.length, 0), e = new Uint8Array(22);
    p32(e, 0, 0x06054B50); p16(e, 8, files.length); p16(e, 10, files.length); p32(e, 12, csz); p32(e, 16, off);
    return new Blob([...parts, ...cen, e], { type: 'application/zip' });
  }

  const api = { isZip, list, extract, create, crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FLZip = api;
})(typeof self !== 'undefined' ? self : this);
