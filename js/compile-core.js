// Web FastLED: compile Arduino project (sketch .ino + .h/.c/.cpp) with YoWASP clang into wasm module.
// ES module shared by compiler worker (compiler.js) and node tests.
import { BOARDS, compileFlags, linkFlags, preprocessSketch, parseDiagnostics, permissiveFixes, PROF_C, cNames, mergePattern, findFunctions, blankCode } from './sketch.js?v=20261028193402';
const blankForSearch = (t) => blankCode(t); // comments / strings blanked, offsets kept

// same in LLVM IR (for -O1 / -O2 / -Os): fptoui → fptosi to i64 + trunc
export function avrFloatCastsIR(ir) {
  let n = 0;
  return ir.replace(/^(\s*)(%[-\w.$]+) = fptoui (float|double) ([^,\n]+?) to (i8|i16|i32)(.*)$/gm, (m, ind, name, ty, val, to, rest) => {
    const t = '%wflc.' + (++n);
    return `${ind}${t} = fptosi ${ty} ${val} to i64\n${ind}${name} = trunc i64 ${t} to ${to}${rest}`;
  });
}
// float → unsigned integer as avr-gcc does it: through signed conversion, so -64.0 → (uint8_t)192, not 0.
// wasm saturates negative values to 0 (i32.trunc_sat_f32_u / _f64_u): rMap angles of GyverMatrix (Lotus ...) broke on that.
// The linked module is walked instruction by instruction and these two opcodes become their signed twins
// (same length, so nothing moves). Only float values ≥ 2^31 going to uint32_t differ from AVR then (they saturate).
// Returns number of patched casts, or -1 when the code has an instruction this walker does not know (module stays as is).
export function avrFloatCasts(wasm) {
  const b = wasm;
  let p = 8, n = 0;
  const u = () => { let r = 0, s = 0, x; do { x = b[p++]; r |= (x & 0x7f) << s; s += 7; } while (x & 0x80); return r >>> 0; };
  const skipLeb = () => { while (b[p++] & 0x80); };
  const patches = [];
  while (p < b.length) {
    const id = b[p++], size = u(), end = p + size;
    if (id !== 10) { p = end; continue; }
    const count = u();
    for (let f = 0; f < count; f++) {
      const bsize = u(), bend = p + bsize;
      const nl = u(); for (let k = 0; k < nl; k++) { skipLeb(); p++; }
      while (p < bend) {
        const op = b[p++];
        if (op === 0x02 || op === 0x03 || op === 0x04) { const t = b[p]; if (t === 0x40 || (t >= 0x6f && t <= 0x7f)) p++; else skipLeb(); }
        else if (op === 0x0c || op === 0x0d || op === 0x10 || (op >= 0x20 && op <= 0x26) || op === 0xd2 || op === 0x12) skipLeb();
        else if (op === 0x0e) { const c = u(); for (let k = 0; k <= c; k++) skipLeb(); }
        else if (op === 0x11 || op === 0x13) { skipLeb(); skipLeb(); }
        else if (op === 0x1c) { const c = u(); p += c; }
        else if (op >= 0x28 && op <= 0x3e) { const a = u(); if (a & 0x40) skipLeb(); skipLeb(); }
        else if (op === 0x3f || op === 0x40) skipLeb();
        else if (op === 0x41 || op === 0x42) skipLeb();
        else if (op === 0x43) p += 4;
        else if (op === 0x44) p += 8;
        else if (op === 0xd0) p++;
        else if (op === 0xfc) {
          const at = p, sub = u();
          if ((sub === 1 || sub === 3) && p === at + 1) patches.push(at);
          else if (sub === 8) { skipLeb(); skipLeb(); }
          else if (sub === 9 || sub === 13 || (sub >= 15 && sub <= 17)) skipLeb();
          else if (sub === 10 || sub === 12 || sub === 14) { skipLeb(); skipLeb(); }
          else if (sub === 11) skipLeb();
          else if (sub > 17) return -1;
        }
        else if (op === 0x00 || op === 0x01 || op === 0x05 || op === 0x0b || op === 0x0f || op === 0x1a || op === 0x1b || (op >= 0x45 && op <= 0xc4) || op === 0xd1) { /* no immediates */ }
        else return -1;
      }
      if (p !== bend) return -1;
    }
    p = end;
  }
  for (const at of patches) { b[at] -= 1; n++; } // 1 → 0 (f32_s), 3 → 2 (f64_s)
  return n;
}

// same in LLVM bitcode (for -O0, no optimizer behind it): every fptoui cast becomes fptosi, in place.
// Done before code generation, so narrow results (uint8_t / uint16_t) are wrapped and zero-extended as usual:
// (uint16_t)-5.0 → 65531, as avr-gcc gives, not 0xFFFFFFFB that callee takes as "already 16 bit" (r-plamia: inoise8 → out of bounds).
// Bitstream is walked (blocks, abbreviations, records); cast opcode field keeps its width (3 → 4).
// Returns number of patched casts, or -1 when bitcode is not understood (left as is).
export function avrFloatCastsBC(bc) {
  const b = bc;
  if (b.length < 8 || b[0] !== 0x42 || b[1] !== 0x43 || b[2] !== 0xc0 || b[3] !== 0xde) return -1;
  let pos = 32; const total = b.length * 8;
  const read = (n) => { let v = 0; for (let i = 0; i < n; i++, pos++) { if (pos >= total) throw 0; if (b[pos >> 3] & (1 << (pos & 7))) v += 2 ** i; } return v; };
  const vbr = (n) => { let v = 0, sh = 0; for (;;) { const x = read(n), hi = 2 ** (n - 1); v += (x % hi) * 2 ** sh; sh += n - 1; if (x < hi) return v; } };
  const align = () => { pos = (pos + 31) & ~31; };
  const blockInfo = new Map(); // block id → abbrevs
  const patches = [];
  const readAbbrev = () => {
    const n = vbr(5), ops = [];
    for (let i = 0; i < n; i++) {
      if (read(1)) { ops.push({ lit: vbr(8) }); continue; }
      const e = read(3);
      if (e === 1 || e === 2) { const w = vbr(5); ops.push(w === 0 ? { lit: 0 } : { e, w }); } else ops.push({ e });
    }
    return ops;
  };
  // fields of one record: [{ v, at, w, enc }] (at = bit position of scalar field)
  const readScalar = (op) => {
    if (op.lit !== undefined) return { v: op.lit, at: -1 };
    const at = pos;
    if (op.e === 1) return { v: read(op.w), at, w: op.w, enc: 'f' };
    if (op.e === 2) return { v: vbr(op.w), at, w: op.w, enc: 'v' };
    if (op.e === 4) return { v: read(6), at: -1 };
    throw 0;
  };
  const readRecord = (id, abbrevs) => {
    if (id === 3) {
      const code = vbr(6), n = vbr(6), f = [];
      for (let i = 0; i < n; i++) { const at = pos, v = vbr(6); f.push({ v, at, w: 6, enc: 'v' }); }
      return { code, f };
    }
    const ab = abbrevs[id - 4]; if (!ab) throw 0;
    const vals = [];
    for (let i = 0; i < ab.length; i++) {
      const op = ab[i];
      if (op.e === 3) { const n = vbr(6), el = ab[++i]; for (let k = 0; k < n; k++) vals.push(readScalar(el)); }
      else if (op.e === 5) { const n = vbr(6); align(); pos += n * 8; align(); }
      else vals.push(readScalar(op));
    }
    return { code: vals[0].v, f: vals.slice(1) };
  };
  const block = (bid, width, endPos) => {
    const abbrevs = (blockInfo.get(bid) || []).slice();
    let curBI = -1;
    while (pos < endPos) {
      const id = read(width);
      if (id === 0) { align(); return; }
      if (id === 1) {
        const sub = vbr(8), w = vbr(4); align(); const len = read(32), end = pos + len * 32;
        if (sub === 0 || sub === 8 || sub === 12) block(sub, w, end); // blockinfo, module, function
        pos = end; continue;
      }
      if (id === 2) { const ab = readAbbrev(); if (bid === 0) { if (!blockInfo.has(curBI)) blockInfo.set(curBI, []); blockInfo.get(curBI).push(ab); } else abbrevs.push(ab); continue; }
      const r = readRecord(id, abbrevs);
      if (bid === 0 && r.code === 1) curBI = r.f[0].v;
      if (bid === 12 && r.code === 3 && r.f.length >= 3) { // INST_CAST [opval, (ty), destty, castopc, (flags)]
        const c = r.f.length === 3 || r.f.length === 4 ? r.f[r.f.length - 1] : null;
        if (c && c.v === 3 && c.at >= 0) patches.push(c);
      }
    }
  };
  try { block(-1, 2, total); } catch (e) { if (e !== 0) throw e; return -1; }
  for (const c of patches) { // 3 → 4: same width (VBR6 without continuation or fixed field)
    for (let i = 0; i < c.w; i++) { const p = c.at + i, bit = (4 >> i) & 1; if (bit) b[p >> 3] |= 1 << (p & 7); else b[p >> 3] &= ~(1 << (p & 7)); }
  }
  return patches.length;
}

const SRC = /\.(ino|h|hh|hpp|c|cc|cpp|cxx)$/i;

// clang: { runClang } of @yowasp/clang; sdk: tree { include: {...}, lib: {...} }
// files: [{ path (relative to sketch folder), text, data }]; main: name of main .ino
// opts: { board: 'nano' | 'mega', opt: '-O2', warnings: false, log(line), fetchProgress }
export async function compileProject(clang, sdk, files, main, opts = {}) {
  const board = BOARDS[opts.board] || BOARDS.nano;
  const t0 = now();
  const enc = new TextEncoder();
  const texts = {}, raw = {}, changed = new Set();
  for (const f of files) {
    if (SRC.test(f.path) && f.text != null) texts[f.path] = f.text.replace(/\r\n?/g, '\n');
    raw[f.path] = f.data || enc.encode(f.text || '');
  }
  let inoNames = Object.keys(texts).filter((p) => /\.ino$/i.test(p) && !p.includes('/'));
  // .c sketch (no .ino): its .c files are sketch (C++ as .ino), ROWS / COLS → WIDTH / HEIGHT, pattern.c gives what is missing
  const cFiles = inoNames.length ? [] : Object.keys(texts).filter((p) => /\.c$/i.test(p) && !p.includes('/')).sort();
  let order = null;
  if (cFiles.length) {
    if (opts.cNames !== false) for (const p of cFiles) texts[p] = cNames(texts[p]);
    order = cFiles.map((n) => ({ name: n }));
    const hasSetup = findFunctions(cFiles.map((p) => texts[p]).join('\n')).some((f) => f.name === 'setup');
    if (opts.pattern && !hasSetup) {
      const m = mergePattern(opts.pattern, Object.fromEntries(cFiles.map((p) => [p, texts[p]])));
      Object.assign(texts, m.codes);
      texts['__pattern_head'] = m.head; texts['__pattern_tail'] = m.tail;
      order = [{ name: '__pattern_head', display: 'pattern.c' }, ...order, { name: '__pattern_tail', display: 'pattern.c' }];
      if (opts.log) { opts.log('pattern.c added' + (m.notes.length ? ': ' + m.notes.join('; ') : '')); }
    }
    inoNames = order.map((o) => o.name);
  }
  if (!inoNames.length) throw new Error('No .ino (or .c sketch) file in project');
  // values that replace #define NAME <number> / const ... NAME = <number> for this build only (LED size of page)
  // power limit of sketch (FastLED.setMaxPowerInVoltsAndMilliamps / InMilliWatts): FastLED lowers brightness of whole frame
  // when estimated current is over limit — as on real strip; opts.noPower drops these calls (arguments stay, as (void)(...))
  {
    const re = /\b[A-Za-z_]\w*\s*\.\s*setMaxPowerIn(?:VoltsAndMilliamps|MilliWatts)\s*\(/g;
    let calls = 0;
    for (const p of Object.keys(texts)) {
      if (p.includes('/') && !p.startsWith('__pattern')) continue;
      const t = blankForSearch(texts[p]);
      const hits = []; let m; re.lastIndex = 0;
      while ((m = re.exec(t))) hits.push(m);
      if (!hits.length) continue;
      calls += hits.length;
      if (opts.noPower) {
        let s = texts[p];
        for (let k = hits.length - 1; k >= 0; k--) s = s.slice(0, hits[k].index) + '(void)(' + s.slice(hits[k].index + hits[k][0].length);
        texts[p] = s; if (!/\.ino$/i.test(p)) changed.add(p);
      }
    }
    if (calls && opts.log) opts.log(opts.noPower ? `Power limit of sketch ignored (${calls} call${calls > 1 ? 's' : ''} of setMaxPower…; Options → Build)`
      : 'Power limit: sketch calls setMaxPower…, so FastLED dims whole frame when many LEDs are lit, as on real strip (Options → Build)');
  }
  for (const d of opts.defines || []) {
    const n = String(d.name).replace(/[^\w]/g, ''), v = String(d.value | 0);
    if (!n) continue;
    const re1 = new RegExp('^([ \\t]*#[ \\t]*define[ \\t]+' + n + '[ \\t]+)\\(?[ \\t]*\\d+(?:[ \\t]*\\))?', 'gm');
    const re2 = new RegExp('(\\b(?:const|constexpr|static)\\b[^;=\\n]*\\b' + n + '\\s*=\\s*)\\d+', 'g');
    for (const p of Object.keys(texts)) {
      const t = texts[p].replace(re1, '$1' + v).replace(re2, '$1' + v);
      if (t !== texts[p]) { texts[p] = t; if (!/\.ino$/i.test(p)) changed.add(p); if (opts.log) opts.log(`${p.replace(/^__pattern_(head|tail)$/, 'pattern.c')}: ${n} = ${v} (for this build)`); }
    }
  }

  const units0 = [];
  for (const p of Object.keys(raw)) {
    const top = !p.includes('/') || p.startsWith('src/');
    if (top && /\.(cpp|cc|cxx)$/i.test(p)) units0.push({ src: 'sketch/' + p, lang: 'c++' });
    else if (top && /\.c$/i.test(p) && !cFiles.includes(p)) units0.push({ src: 'sketch/' + p, lang: 'c' });
  }
  let log = '', allLog = '';
  const io = { stdout: (b) => { if (b) log += dec(b); }, stderr: (b) => { if (b) log += dec(b); }, fetchProgress: opts.fetchProgress || (() => {}) };
  const fixes = [];
  // fixes of previous build of same project: applied at once, so that build does not need failing round first
  for (const f of opts.fixes || []) {
    const t = texts[f.file]; if (t == null || f.before == null) continue;
    const lines = t.split('\n');
    if (lines[f.line - 1] !== f.before) continue;
    lines[f.line - 1] = f.after; texts[f.file] = lines.join('\n');
    if (!/\.ino$/i.test(f.file)) changed.add(f.file);
    fixes.push(f);
  }
  if (fixes.length && opts.log) opts.log(`-fpermissive: ${fixes.length} cast${fixes.length > 1 ? 's' : ''} of previous build applied`);
  let result = null, pre = null;
  for (let round = 0; round < 5 && !result; round++) {
    const sketch = {};
    const put = (p, data) => {
      const parts = p.split('/'); let d = sketch;
      for (const x of parts.slice(0, -1)) d = d[x] = d[x] || {};
      d[parts[parts.length - 1]] = data;
    };
    for (const p of Object.keys(raw)) if (!/\.ino$/i.test(p) || p.includes('/')) put(p, changed.has(p) ? enc.encode(texts[p]) : raw[p]);
    pre = order
      ? preprocessSketch(order.map((o) => ({ name: o.name, display: o.display, text: texts[o.name] })), null, '/sketch/', { profile: !!opts.profile, ordered: true })
      : preprocessSketch(inoNames.map((n) => ({ name: n, text: texts[n] })), main, '/sketch/', { profile: !!opts.profile });
    if (opts.profile) put('__wfl_prof.c', enc.encode(PROF_C));
    const mainName = pre.order[0];
    put(mainName + '.cpp', enc.encode(pre.code));
    const tree = { include: sdk.include, lib: sdk.lib, sketch, out: {} };
    const units = [{ src: 'sketch/' + mainName + '.cpp', lang: 'c++' }, ...units0];
    if (opts.profile) units.push({ src: 'sketch/__wfl_prof.c', lang: 'c' });
    const objs = [], times = [];
    let ok = true;
    log = '';
    for (let i = 0; i < units.length; i++) {
      const u = units[i], o = 'out/u' + i + '.o';
      if (opts.log) opts.log((round ? 'Compiling again ' : 'Compiling ') + (i === 0 && cFiles.length ? cFiles.join(', ') + (order.length > cFiles.length ? ' + pattern.c' : '')
        : u.src.replace(/^sketch\//, '').replace(/\.ino\.cpp$/, '.ino') + (i === 0 && inoNames.length > 1 ? ` (+${inoNames.length - 1} .ino)` : '')));
      const t = now();
      try {
        const opt = opts.opt || '-O2';
        if (opt === '-O0' && opts.swapCasts) { // old way: opcodes swapped in linked module (narrow types are not masked then)
          const r = await clang.runClang(['clang++', ...compileFlags(board, { lang: u.lang, opt, warnings: !!opts.warnings, stdlib: !!opts.stdlib }), '-Isketch', '-c', u.src, '-o', o], tree, io);
          tree.out['u' + i + '.o'] = r.out['u' + i + '.o'];
        } else if (opt === '-O0') {
          // bitcode (written at once, unlike text IR) with fptoui → fptosi, then code generation
          const parts = [], bcn = 'u' + i + '.bc';
          const io2 = Object.assign({}, io, { stdout: (x) => { if (x) parts.push(x); } });
          await clang.runClang(['clang++', ...compileFlags(board, { lang: u.lang, opt, warnings: !!opts.warnings, stdlib: !!opts.stdlib }), '-Isketch', '-emit-llvm', '-c', u.src, '-o', '-'], tree, io2);
          let len = 0; for (const x of parts) len += x.length;
          const buf = new Uint8Array(len); len = 0; for (const x of parts) { buf.set(x, len); len += x.length; }
          const n = avrFloatCastsBC(buf);
          if (opts.timing) opts.log('  BC ' + Math.round(now() - t) + ' ms, ' + parts.length + ' chunks, ' + buf.length + ' bytes, ' + n + ' casts');
          if (n < 0 && opts.log) opts.log('Float → unsigned casts left as in wasm (bitcode not understood)');
          tree.out[bcn] = buf;
          const r2 = await clang.runClang(['clang++', '--target=wasm32-wasip1', opt, '-ffunction-sections', '-fdata-sections', '-w', '-x', 'ir', '-c', 'out/' + bcn, '-o', o], tree, io);
          tree.out['u' + i + '.o'] = r2.out['u' + i + '.o'];
          delete tree.out[bcn];
          if (opts.timing) opts.log('  obj ' + Math.round(now() - t) + ' ms');
        } else {
          // optimizer relies on float → unsigned result range, so opcodes cannot be swapped after it: casts are fixed in LLVM IR
          // (IR goes to stdout: writing big file into virtual file system in small pieces is very slow)
          const parts = [], ll = 'u' + i + '.ll';
          const io2 = Object.assign({}, io, { stdout: (x) => { if (x) parts.push(x); } });
          await clang.runClang(['clang++', ...compileFlags(board, { lang: u.lang, opt, warnings: !!opts.warnings, stdlib: !!opts.stdlib }), '-Isketch', '-S', '-emit-llvm', u.src, '-o', '-'], tree, io2);
          if (opts.timing) opts.log('  IR ' + Math.round(now() - t) + ' ms, ' + parts.length + ' chunks');
          let len = 0; for (const x of parts) len += x.length;
          const buf = new Uint8Array(len); len = 0; for (const x of parts) { buf.set(x, len); len += x.length; }
          tree.out[ll] = new TextEncoder().encode(avrFloatCastsIR(new TextDecoder().decode(buf)));
          const r2 = await clang.runClang(['clang++', '--target=wasm32-wasip1', opt, '-ffunction-sections', '-fdata-sections', '-w', '-x', 'ir', '-c', 'out/' + ll, '-o', o], tree, io);
          if (opts.timing) opts.log('  obj ' + Math.round(now() - t) + ' ms, IR ' + len + ' bytes');
          tree.out['u' + i + '.o'] = r2.out['u' + i + '.o'];
          delete tree.out[ll];
        }
        objs.push(o);
      } catch (e) {
        if (e && e.code !== undefined) ok = false; else throw e;
      }
      times.push(now() - t);
    }
    const diags = parseDiagnostics(log);
    if (!ok) {
      const fx = permissiveFixes(diags, texts);
      if (fx.length) {
        for (const f of fx) { fixes.push(f); if (!/\.ino$/i.test(f.file)) changed.add(f.file); if (opts.log) opts.log(`${f.file}:${f.line}: -fpermissive: cast to '${f.type}' added`); }
        allLog += log;
        continue;
      }
      result = { ok: false, wasm: null, log, diagnostics: diags, times };
      break;
    }
    if (opts.log) opts.log('Linking');
    try {
      const r = await clang.runClang(['clang++', ...objs, ...linkFlags(board), '-o', 'out/sketch.wasm'], tree, io);
      const wasm = r.out['sketch.wasm'];
      if ((opts.opt || '-O2') === '-O0' && opts.swapCasts) {
        const casts = avrFloatCasts(wasm);
        if (casts < 0 && opts.log) opts.log('Float → unsigned casts left as in wasm (unknown instruction)');
      }
      result = { ok: true, wasm, log, diagnostics: parseDiagnostics(log), times };
    } catch (e) {
      if (e && e.code !== undefined) result = { ok: false, wasm: null, log, diagnostics: parseDiagnostics(log), times };
      else throw e;
    }
  }
  if (!result) result = { ok: false, wasm: null, log, diagnostics: parseDiagnostics(log), times: [] };
  return Object.assign(result, { ms: now() - t0, fixes, prototypes: pre ? pre.prototypes : [], profile: opts.profile && pre ? pre.profile : null, order: pre ? pre.order : [], board: board.id });
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const td = new TextDecoder();
const dec = (b) => td.decode(b, { stream: true });
