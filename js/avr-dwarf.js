// Web FastLED: debug information of AVR .elf for debugger — DWARF line table (.debug_line, versions 2…4):
// program address ↔ source file and line. ES module: build worker, page, node tests.

function sections(elf) {
  const dv = new DataView(elf.buffer, elf.byteOffset, elf.byteLength);
  const shoff = dv.getUint32(32, true), shentsize = dv.getUint16(46, true), shnum = dv.getUint16(48, true), shstrndx = dv.getUint16(50, true);
  const sh = (i) => { const o = shoff + i * shentsize; return { name: dv.getUint32(o, true), offset: dv.getUint32(o + 16, true), size: dv.getUint32(o + 20, true) }; };
  const strs = sh(shstrndx), out = {};
  for (let i = 0; i < shnum; i++) {
    const s = sh(i); let e = strs.offset + s.name, n = '';
    while (elf[e]) n += String.fromCharCode(elf[e++]);
    out[n] = s;
  }
  return out;
}

// rows: [{ addr (bytes), file (path), line, stmt }] sorted by address; end of sequence rows have line 0
export function lineTable(elf, units) {
  const rows = [];
  if (!elf || elf.length < 52 || elf[0] !== 0x7f) return rows;
  const sec = sections(elf)['.debug_line'];
  if (!sec) return rows;
  const b = elf, dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = sec.offset; const end = sec.offset + sec.size;
  const u8 = () => b[p++], u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; }, u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };
  const uleb = () => { let r = 0, s = 0, x; do { x = b[p++]; r += (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80); return r; };
  const sleb = () => { let r = 0, s = 0, x; do { x = b[p++]; r += (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80); if (x & 0x40) r -= 2 ** s; return r; };
  const cstr = () => { let s = ''; while (b[p]) s += String.fromCharCode(b[p++]); p++; return s; };
  while (p + 4 <= end) {
    const unitOff = p - sec.offset;
    const len = u32(), unitEnd = p + len;
    if (len === 0xffffffff || unitEnd > end) break; // 64-bit DWARF not used on AVR
    const ver = u16(), hlen = u32(), progStart = p + hlen;
    const minInst = u8(); if (ver >= 4) u8(); // max ops per instruction
    const defStmt = u8(), lineBase = (u8() << 24) >> 24, lineRange = u8(), opBase = u8();
    const stdLen = []; for (let i = 1; i < opBase; i++) stdLen[i] = u8();
    const dirs = ['']; for (;;) { const d = cstr(); if (!d) break; dirs.push(d); }
    const files = [null];
    const file = (name, dir) => (name.startsWith('/') || /^[A-Za-z]:/.test(name) || !dirs[dir] ? name : dirs[dir] + '/' + name);
    for (;;) { const n = cstr(); if (!n) break; const d = uleb(); uleb(); uleb(); files.push(file(n, d)); }
    if (units) units.set(unitOff, files);
    p = progStart;
    let addr = 0, fi = 1, line = 1, stmt = !!defStmt;
    const row = () => rows.push({ addr, file: files[fi] || '', line, stmt });
    while (p < unitEnd) {
      const op = u8();
      if (op >= opBase) {
        const a = op - opBase;
        addr += Math.floor(a / lineRange) * minInst; line += lineBase + (a % lineRange); row();
      } else if (op === 0) {
        const n = uleb(), at = p, sub = u8();
        if (sub === 1) { rows.push({ addr, file: files[fi] || '', line: 0, stmt: false }); addr = 0; fi = 1; line = 1; stmt = !!defStmt; }
        else if (sub === 2) addr = u32();
        else if (sub === 3) { const nm = cstr(); const d = uleb(); uleb(); uleb(); files.push(file(nm, d)); }
        p = at + n;
      } else if (op === 1) row();
      else if (op === 2) addr += uleb() * minInst;
      else if (op === 3) line += sleb();
      else if (op === 4) fi = uleb();
      else if (op === 5) uleb();
      else if (op === 6) stmt = !stmt;
      else if (op === 7) { /* basic block */ }
      else if (op === 8) addr += Math.floor((255 - opBase) / lineRange) * minInst;
      else if (op === 9) addr += u16();
      else { for (let i = 0; i < (stdLen[op] || 0); i++) uleb(); }
    }
    p = unitEnd;
  }
  rows.sort((x, y) => x.addr - y.addr || (x.line === 0 ? -1 : 0) - (y.line === 0 ? -1 : 0));
  return rows;
}

// Call sites of inlined functions (DW_TAG_inlined_subroutine of .debug_info, DWARF 2…4): { file, line, addr } —
// line of call has no code of its own when callee is inlined (LTO), breakpoint there goes to entry of inlined copy;
// ranges [[start, end), …] of copy too: loop rotated by optimizer jumps back into copy past its entry
export function inlineCalls(elf, units) {
  const out = [];
  if (!elf || elf.length < 52 || elf[0] !== 0x7f) return out;
  const S = sections(elf), info = S['.debug_info'], abbr = S['.debug_abbrev'], rng = S['.debug_ranges'];
  if (!info || !abbr) return out;
  const b = elf, dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const uleb = () => { let r = 0, s = 0, x; do { x = b[p++]; r += (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80); return r; };
  const sleb = () => { let r = 0, s = 0, x; do { x = b[p++]; r += (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80); if (x & 0x40) r -= 2 ** s; return r; };
  const abbrevs = new Map();
  const abbrevTable = (off) => {
    if (abbrevs.has(off)) return abbrevs.get(off);
    const t = new Map(); const save = p; p = abbr.offset + off;
    for (;;) {
      const code = uleb(); if (!code) break;
      const tag = uleb(), ch = b[p++], attrs = [];
      for (;;) { const n = uleb(), f = uleb(); if (!n && !f) break; attrs.push([n, f]); }
      t.set(code, { tag, ch, attrs });
    }
    p = save; abbrevs.set(off, t); return t;
  };
  p = info.offset; const end = info.offset + info.size;
  while (p + 11 <= end) {
    const len = dv.getUint32(p, true), cuEnd = p + 4 + len; p += 4;
    if (len === 0xffffffff || cuEnd > end) break;
    const ver = dv.getUint16(p, true); p += 2;
    if (ver < 2 || ver > 4) { p = cuEnd; continue; }
    const aoff = dv.getUint32(p, true); p += 4; const asz = b[p++];
    const tab = abbrevTable(aoff);
    let files = null, base = 0;
    while (p < cuEnd) {
      const code = uleb(); if (!code) continue;
      const a = tab.get(code); if (!a) break;
      const v = {}, fm = {};
      for (const [name, form0] of a.attrs) {
        let form = form0, val;
        if (form === 0x16) form = uleb();
        switch (form) {
          case 0x01: val = asz === 4 ? dv.getUint32(p, true) : dv.getUint16(p, true); p += asz; break;
          case 0x03: { const n = dv.getUint16(p, true); p += 2 + n; break; }
          case 0x04: { const n = dv.getUint32(p, true); p += 4 + n; break; }
          case 0x05: val = dv.getUint16(p, true); p += 2; break;
          case 0x06: case 0x17: val = dv.getUint32(p, true); p += 4; break;
          case 0x07: case 0x14: case 0x20: p += 8; break;
          case 0x08: while (b[p]) p++; p++; break;
          case 0x09: case 0x18: { const n = uleb(); p += n; break; }
          case 0x0a: { const n = b[p++]; p += n; break; }
          case 0x0b: case 0x11: val = b[p++]; break;
          case 0x0c: val = b[p++]; break;
          case 0x0d: val = sleb(); break;
          case 0x0e: case 0x13: val = dv.getUint32(p, true); p += 4; break;
          case 0x0f: case 0x15: val = uleb(); break;
          case 0x10: p += ver === 2 ? asz : 4; break;
          case 0x12: val = dv.getUint16(p, true); p += 2; break;
          case 0x19: val = 1; break;
          default: p = cuEnd; break;
        }
        v[name] = val; fm[name] = form;
      }
      if (a.tag === 0x11) { files = units && v[0x10] != null ? units.get(v[0x10]) : null; base = v[0x11] || 0; } // compile unit
      else if (a.tag === 0x1d && files && v[0x58] != null && v[0x59]) { // inlined subroutine
        const ranges = [];
        if (v[0x11] != null && v[0x12] != null) ranges.push([v[0x11], fm[0x12] === 0x01 ? v[0x12] : v[0x11] + v[0x12]]); // low_pc, high_pc (address or length)
        else if (v[0x55] != null && rng) { // DW_AT_ranges
          let q = rng.offset + v[0x55], bs = base;
          for (; q + 8 <= rng.offset + rng.size; q += 8) {
            const s0 = dv.getUint32(q, true), e0 = dv.getUint32(q + 4, true);
            if (!s0 && !e0) break;
            if (s0 === 0xffffffff) { bs = e0; continue; }
            if (e0 > s0) ranges.push([bs + s0, bs + e0]);
          }
        }
        const addr = v[0x52] != null ? v[0x52] : ranges.length ? ranges[0][0] : null;
        if (addr != null && files[v[0x58]]) out.push({ file: files[v[0x58]], line: v[0x59], addr, ranges });
      }
    }
    p = cuEnd;
  }
  return out;
}

// Lines of sketch files only (files under prefix, as #line of preprocessed sketch names them):
// { files: [path without prefix], rows: Int32Array [addr, file, line, stmt, …], calls: Int32Array [entry, file, line, first range, ranges, …],
// ranges: Int32Array [start, end, …] } — small enough to post to workers
export function sketchLines(elf, prefixes = ['/sketch/', '/build/sketch/']) {
  const files = [], idx = new Map(), out = [], units = new Map();
  const fileIdx = (path) => {
    const pre = prefixes.find((x) => path.startsWith(x)); if (!pre) return -1;
    const n = path.slice(pre.length); let f = idx.get(n); if (f === undefined) { f = files.length; files.push(n); idx.set(n, f); } return f;
  };
  for (const r of lineTable(elf, units)) {
    let f = -1;
    const pre = r.line ? prefixes.find((x) => r.file.startsWith(x)) : null;
    if (pre) {
      const n = r.file.slice(pre.length);
      f = idx.get(n); if (f === undefined) { f = files.length; files.push(n); idx.set(n, f); }
    }
    // rows at same address (inlined code: sketch line and library line): sketch one is kept
    const n = out.length;
    if (n && out[n - 4] === r.addr) { if (f >= 0 || out[n - 3] < 0) { out[n - 3] = f; out[n - 2] = f < 0 ? 0 : r.line; out[n - 1] = r.stmt ? 1 : 0; } continue; }
    out.push(r.addr, f, f < 0 ? 0 : r.line, r.stmt ? 1 : 0);
  }
  const calls = [], ranges = [];
  for (const c of inlineCalls(elf, units)) {
    const f = fileIdx(c.file); if (f < 0) continue;
    calls.push(c.addr, f, c.line, ranges.length / 2, c.ranges.length);
    for (const [a, e] of c.ranges) ranges.push(a, e);
  }
  return { files, rows: Int32Array.from(out), calls: Int32Array.from(calls), ranges: Int32Array.from(ranges) };
}

// lookups on sketchLines() result
export class LineMap {
  constructor({ files, rows, calls, ranges }) {
    this.files = files; this.rows = rows; this.n = rows.length / 4; this.calls = calls || new Int32Array(0); this.ranges = ranges || new Int32Array(0);
  }
  // { file, line } of byte address (row at or before it), null when not sketch code
  at(addr) {
    const r = this.rows; let lo = 0, hi = this.n - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (r[m * 4] <= addr) { k = m; lo = m + 1; } else hi = m - 1; }
    if (k < 0 || r[k * 4 + 1] < 0) return null;
    return { file: this.files[r[k * 4 + 1]], line: r[k * 4 + 2] };
  }
  // per program word: id of sketch line (file << 16 | line) or -1: debugger checks it every instruction
  wordIndex(words) {
    const out = new Int32Array(words).fill(-1), r = this.rows;
    for (let k = 0; k < this.n; k++) {
      const a = r[k * 4] >> 1, e = k + 1 < this.n ? Math.min(words, r[(k + 1) * 4] >> 1) : a;
      const v = r[k * 4 + 1] < 0 ? -1 : (r[k * 4 + 1] << 16) | r[k * 4 + 2];
      for (let w = a; w < e; w++) out[w] = v;
    }
    return out;
  }
  // byte addresses where breakpoint on line of file stops: start of each run of statement rows of that line;
  // line without code moves to next one with code (as gdb does); returns { line, addrs, ranges: [[start, end, …] per inlined
  // copy called on that line] — board stops also when it comes into copy from outside (not by return) }
  breakAddrs(file, line) {
    const f = this.files.indexOf(file); if (f < 0) return { line, addrs: [], ranges: [] };
    const r = this.rows, c = this.calls;
    for (let ln = line; ln < line + 30; ln++) {
      const addrs = [], ranges = [];
      // call on this line of function that was inlined: entry of each inlined copy
      for (let k = 0; k + 4 < c.length; k += 5) {
        if (c[k + 1] !== f || c[k + 2] !== ln) continue;
        addrs.push(c[k]);
        const g = [];
        for (let i = c[k + 3]; i < c[k + 3] + c[k + 4]; i++) g.push(this.ranges[i * 2], this.ranges[i * 2 + 1]);
        if (g.length) ranges.push(g);
      }
      for (let k = 0; k < this.n; k++) {
        if (r[k * 4 + 1] !== f || r[k * 4 + 2] !== ln || !r[k * 4 + 3]) continue;
        const prevSame = k > 0 && r[(k - 1) * 4 + 1] === f && r[(k - 1) * 4 + 2] === ln;
        if (!prevSame) addrs.push(r[k * 4]);
      }
      if (addrs.length) return { line: ln, addrs: [...new Set(addrs)], ranges };
    }
    return { line, addrs: [], ranges: [] };
  }
}
