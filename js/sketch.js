// Web FastLED: boards, compiler flags and Arduino sketch preprocessor (.ino → .cpp with prototypes).
// ES module: used by compiler worker (compiler.js) and by build / test scripts in node.

export const BOARDS = {
  nano: { id: 'nano', name: 'Arduino Nano', mcu: 'ATmega328P', defines: ['-DARDUINO_AVR_NANO', '-D__AVR_ATmega328P__'], flash: 32768, boot: 2048, sram: 2048, eeprom: 1024 },
  mega: { id: 'mega', name: 'Arduino Mega 2560', mcu: 'ATmega2560', defines: ['-DARDUINO_AVR_MEGA2560', '-D__AVR_ATmega2560__'], flash: 262144, boot: 8192, sram: 8192, eeprom: 4096 },
};

export const ALWAYS_WARN = ['-Wtautological-constant-out-of-range-compare'];
// sdk: directory with include/ and lib/ (SDK tar is unpacked there)
export function compileFlags(board, { sdk = '', lang = 'c++', opt = '-O2', warnings = false, stdlib = false } = {}) {
  const f = ['--target=wasm32-wasip1', opt, '-ffunction-sections', '-fdata-sections',
    '-DARDUINO=10819', '-DARDUINO_ARCH_AVR', '-DF_CPU=16000000L', '-DFASTLED_STUB_IMPL', '-DWEB_FASTLED=1', ...board.defines,
    '-I' + sdk + 'include/core', '-I' + sdk + 'include/FastLED', '-fno-exceptions',
    '-fdiagnostics-print-source-range-info', '-Wno-c++11-narrowing', '-Wno-register', '-Wno-error=implicit-function-declaration', '-Wno-error=int-conversion', '-Wno-error=incompatible-pointer-types'];
  // -nostdinc++ (default): as on AVR there is no C++ library; <math.h> is C header (float sqrt(float) of sketch does not clash with libc++ overloads)
  if (lang === 'c++') f.push('-x', 'c++', '-std=gnu++14', '-fno-rtti', '-fno-threadsafe-statics', ...(stdlib ? [] : ['-nostdinc++']));
  else f.push('-x', 'c', '-std=gnu11');
  // warnings off: all but those that mean sketch hangs or breaks (loop counter that can never reach its limit:
  // for (byte i = 0; i < NUM_LEDS; i++) with NUM_LEDS ≥ 256, e.g. after size rebuild)
  if (!warnings) f.push('-Wno-everything', ...ALWAYS_WARN);
  return f;
}
export function linkFlags(board, { sdk = '' } = {}) {
  return ['--target=wasm32-wasip1', '-mexec-model=reactor', '-L' + sdk + 'lib', '-lfastled', '-lcore-' + board.id,
    '-Wl,-u,wfl_setup', '-Wl,-u,wfl_loop', '-Wl,--gc-sections', '-Wl,-z,stack-size=262144'];
}

// ---------------------------------------------------------------- preprocessor
// blank comments, strings and char literals (newlines kept) so that braces / parentheses can be counted
export function blankCode(s) {
  const o = s.split('');
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') { o[i] = ' '; i++; } }
    else if (c === '/' && d === '*') { o[i] = o[i + 1] = ' '; i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] !== '\n') o[i] = ' '; i++; } if (i < n) { o[i] = o[i + 1] = ' '; i += 2; } }
    else if (c === 'R' && d === '"' && !/[\w]/.test(s[i - 1] || '')) { // raw string R"x( ... )x"
      const m = /^R"([^(\s]*)\(/.exec(s.slice(i, i + 20));
      if (m) { const end = s.indexOf(')' + m[1] + '"', i); const e = end < 0 ? n : end + m[1].length + 2; for (let k = i + 1; k < e - 1; k++) if (s[k] !== '\n') o[k] = ' '; i = e; }
      else i++;
    }
    else if (c === '"' || (c === "'" && !/[0-9a-fA-F]/.test(s[i - 1] || ''))) { // ' after digit: C++14 digit separator
      const q = c; i++;
      while (i < n && s[i] !== q && s[i] !== '\n') { if (s[i] === '\\') { o[i] = ' '; i++; } if (i < n && s[i] !== '\n') o[i] = ' '; i++; }
      i++;
    } else i++;
  }
  return o.join('');
}
// blank preprocessor lines (with continuations)
function blankPreproc(s) {
  return s.replace(/^[ \t]*#(?:[^\n\\]|\\[\s\S])*$/gm, (m) => m.replace(/[^\n]/g, ' '));
}

const NOT_TYPES = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'return', 'case', 'new', 'delete', 'sizeof', 'throw', 'goto']);
// top-level function definitions: { start (offset of header), header, name }
export function findFunctions(code) {
  const b = blankPreproc(blankCode(code));
  const out = [];
  let depth = 0, stmt = 0; // stmt: start of current top-level statement
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === '{') {
      if (depth === 0) {
        const head = b.slice(stmt, i);
        const f = parseHeader(head);
        if (f) {
          const lead = head.length - head.trimStart().length;
          out.push({ start: stmt + lead, brace: i, header: f.header, name: f.name });
        }
      }
      depth++;
    } else if (c === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) stmt = i + 1;
    } else if (c === ';' && depth === 0) stmt = i + 1;
  }
  return out;
}
function parseHeader(head) {
  let h = head.replace(/\s+/g, ' ').trim();
  if (!h || !h.endsWith(')') && !/\)\s*(const|noexcept|override)?\s*$/.test(h)) return null;
  // parameter list: last balanced (...) group
  let end = h.lastIndexOf(')'), depth = 0, open = -1;
  for (let i = end; i >= 0; i--) { if (h[i] === ')') depth++; else if (h[i] === '(') { depth--; if (depth === 0) { open = i; break; } } }
  if (open < 0) return null;
  const before = h.slice(0, open).trim(), params = h.slice(open + 1, end), after = h.slice(end + 1).trim();
  if (after && !/^(const|noexcept)$/.test(after)) return null;
  if (/=/.test(before) || /=/.test(params)) return null; // initialisers / default arguments
  if (/[{}]/.test(h)) return null;
  const m = /([A-Za-z_]\w*)\s*$/.exec(before);
  if (!m) return null;
  const name = m[1], type = before.slice(0, m.index).trim();
  if (!type || NOT_TYPES.has(name)) return null;
  if (/(^|\s)(struct|class|union|enum|namespace|typedef|template|using|operator)\b/.test(before) || /::/.test(before) || /[<>]/.test(before)) return null;
  if (/^extern\s*$/.test(type) || /^(return|else|case)\b/.test(type)) return null;
  if (!/^[\w\s\*&:,<>]+$/.test(type)) return null;
  if (/(^|\s)(if|while|for|switch)$/.test(type)) return null;
  return { header: h, name };
}

// Arduino sketch → one .cpp: main .ino first, other .ino files alphabetically,
// `#include <Arduino.h>` and prototypes of all functions before first function definition.
// files: [{ name, text }] (only .ino); returns { code, prototypes }
export function preprocessSketch(inos, mainName, dir = '/sketch/', opts = {}) {
  const main = inos.find((f) => f.name === mainName) || inos[0];
  const rest = inos.filter((f) => f !== main).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const order = opts.ordered ? inos : [main, ...rest];
  // one text with #line markers; remember where each file starts (line index in joined text)
  const parts = [], starts = [];
  let line = 0;
  for (const f of order) {
    const t = f.text.replace(/\r\n?/g, '\n');
    const hdr = `#line 1 "${dir}${f.display || f.name}"`;
    starts.push({ line: line + 1, file: f.display || f.name });
    parts.push(hdr, t.endsWith('\n') ? t.slice(0, -1) : t);
    line += 1 + t.split('\n').length - (t.endsWith('\n') ? 1 : 0);
  }
  let code = parts.join('\n') + '\n';
  const fns = findFunctions(code);
  const where = (off) => { // offset in joined text → file, line
    const li = code.slice(0, off).split('\n').length - 1;
    let st = starts[0]; for (const x of starts) if (x.line <= li) st = x;
    return { file: st.file, line: li - st.line + 1 };
  };
  // profile build: each function gets scope object right after its "{" (same line, so line numbers stay)
  const prof = [];
  if (opts.profile) {
    for (const f of fns) {
      if (/\bconstexpr\b/.test(f.header)) continue;
      const w = where(f.start), params = f.header.slice(f.header.indexOf('(', f.header.lastIndexOf(f.name)));
      prof.push({ id: prof.length + 1, name: f.name, sig: f.name + params.replace(/\s+/g, ' '), file: w.file, line: w.line, brace: f.brace });
    }
    for (let k = prof.length - 1; k >= 0; k--) {
      const b = prof[k].brace;
      code = code.slice(0, b + 1) + ` wfl_prof_scope_t wfl_prof_s_(${prof[k].id});` + code.slice(b + 1);
    }
    prof.forEach((p) => { delete p.brace; });
  }
  const protos = [];
  const seen = new Set();
  for (const f of fns) {
    const p = f.header.replace(/\s*\)\s*$/, ')') + ';';
    if (seen.has(p)) continue;
    seen.add(p); protos.push(p);
  }
  if (fns.length) {
    // insert at start of line of first function header
    const at = code.lastIndexOf('\n', fns[0].start - 1) + 1;
    const lineIdx = code.slice(0, at).split('\n').length - 1; // 0-based line in joined text
    let st = starts[0];
    for (const s of starts) if (s.line <= lineIdx) st = s;
    const origLine = lineIdx - st.line + 1;
    code = code.slice(0, at) + '#line 1 "' + dir + 'prototypes"\n' + protos.join('\n') + '\n' + `#line ${origLine} "${dir}${st.file}"\n` + code.slice(at);
  }
  const pre = opts.profile ? PROF_HEAD : '';
  return { code: '#include <Arduino.h>\n' + pre + code, prototypes: protos, order: order.map((f) => f.name), profile: prof };
}

// clang diagnostics → [{ file, line, col, severity, message, text }]
export function parseDiagnostics(text, dir = '/sketch/') {
  const out = [];
  const re = /^(.*?):(\d+):(\d+):((?:\{\d+:\d+-\d+:\d+\})*):? (error|warning|note|fatal error): (.*)$/;
  for (const l of text.split('\n')) {
    const m = re.exec(l);
    if (m) {
      let file = m[1];
      if (file.startsWith(dir)) file = file.slice(dir.length);
      const ranges = [];
      m[4].replace(/\{(\d+):(\d+)-(\d+):(\d+)\}/g, (x, a, b, c, d) => { ranges.push([+a, +b, +c, +d]); return x; });
      // range lines are physical (#line of preprocessed sketch does not apply to them): moved to line of diagnostic
      if (ranges.length) {
        const c = +m[3], base = ranges.find((r) => r[0] === r[2] && r[1] <= c && c <= r[3]) || ranges[0], dl = +m[2] - base[0];
        for (const r of ranges) { r[0] += dl; r[2] += dl; }
      }
      out.push({ file, line: +m[2], col: +m[3], ranges, severity: m[5] === 'fatal error' ? 'error' : m[5], message: m[6], text: l.replace(m[4], '') });
    }
  }
  return out;
}

// g++ -fpermissive (Arduino IDE uses it) turns some conversion errors into warnings; clang has no such switch.
// For these errors cast to target type is put around expression and file is compiled again.
const PERMISSIVE = [
  /^assigning to '([^']+)'(?: \(aka '[^']*'\))? from '[^']+'(?: \(aka '[^']*'\))? discards qualifiers/,
  /^assigning to '([^']+)'(?: \(aka '[^']*'\))? from incompatible type/,
  /^incompatible (?:integer to pointer|pointer to integer) conversion assigning to '([^']+)'/,
  /^cannot initialize a (?:variable|return object|member subobject) of type '([^']+)'(?: \(aka '[^']*'\))? with an? (?:lvalue|rvalue) of type/,
];
// diags of one compile; texts: { file: text }. Returns [{ file, line, type }] (texts changed in place)
export function permissiveFixes(diags, texts) {
  const fixes = [];
  const byFile = {};
  let errors = 0, fixable = 0;
  for (const d of diags) {
    if (d.severity !== 'error') continue;
    errors++;
    if (!(d.file in texts) || !d.ranges.length) continue;
    let type = null;
    for (const re of PERMISSIVE) { const m = re.exec(d.message); if (m) { type = m[1]; break; } }
    if (!type || /[()]\s*$|\(lambda|\(anonymous|\(unnamed/.test(type)) continue;
    const r = d.ranges[d.ranges.length - 1];
    if (r[0] !== r[2]) continue;
    (byFile[d.file] = byFile[d.file] || []).push({ line: d.line, c0: r[1], c1: r[3], type, msg: d.message }); // range lines are physical (no #line), columns are fine
    fixable++;
  }
  if (fixable < errors) return fixes; // other errors too: report them as they are, without another round
  for (const [file, list] of Object.entries(byFile)) {
    const lines = texts[file].split('\n');
    list.sort((a, b) => b.line - a.line || b.c0 - a.c0);
    for (const f of list) {
      const l = lines[f.line - 1]; if (l == null) continue;
      const a = byteToChar(l, f.c0 - 1), b = byteToChar(l, f.c1 - 1);
      if (a < 0 || b <= a) continue;
      lines[f.line - 1] = l.slice(0, a) + '((' + f.type + ')(' + l.slice(a, b) + '))' + l.slice(b);
      fixes.push({ file, line: f.line, type: f.type, msg: f.msg, before: l, after: lines[f.line - 1] });
    }
    texts[file] = lines.join('\n');
  }
  return fixes;
}
function byteToChar(line, bytes) {
  let b = 0;
  for (let i = 0; i < line.length; i++) {
    if (b >= bytes) return i;
    const c = line.codePointAt(i);
    b += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (c >= 0x10000) i++;
  }
  return b >= bytes ? line.length : -1;
}

// profile build: sketch functions call these (scope object: exit on every return)
const PROF_HEAD = 'extern "C" void wfl_prof_enter(int); extern "C" void wfl_prof_exit(int); ' +
  'struct wfl_prof_scope_t { int i; wfl_prof_scope_t(int x) : i(x) { wfl_prof_enter(x); } ~wfl_prof_scope_t() { wfl_prof_exit(i); } };\n';
// time per function: calls, total (with called functions), self; stack of sketch functions only
export const PROF_C = `#define WFL_IMPORT(n) __attribute__((import_module("wfl"), import_name(n)))
#define WFL_EXPORT(n) __attribute__((export_name(n)))
WFL_IMPORT("prof_now") double wfl_prof_now(void);
#define N 4096
#define S 512
static unsigned calls[N];
static double incl[N], self_[N];
static struct { int id; double t0, child; } st[S];
static int sp;
void wfl_prof_enter(int id) {
  if (sp < S) { st[sp].id = id; st[sp].t0 = wfl_prof_now(); st[sp].child = 0; }
  sp++;
  if ((unsigned)id < N) calls[id]++;
}
void wfl_prof_exit(int id) {
  if (sp <= 0) return;
  sp--;
  if (sp < S) {
    double dt = wfl_prof_now() - st[sp].t0;
    if ((unsigned)id < N) { incl[id] += dt; self_[id] += dt - st[sp].child; }
    if (sp > 0 && sp - 1 < S) st[sp - 1].child += dt;
  }
}
WFL_EXPORT("wfl_prof_calls") unsigned *wfl_prof_calls(void) { return calls; }
WFL_EXPORT("wfl_prof_incl") double *wfl_prof_incl(void) { return incl; }
WFL_EXPORT("wfl_prof_self") double *wfl_prof_self(void) { return self_; }
WFL_EXPORT("wfl_prof_top") int wfl_prof_top(void) { return sp > 0 && sp <= S ? st[sp - 1].id : 0; }
`;

// ---------------------------------------------------------------- .c sketches (Soulmate style: draw() only, LED_COLS / LED_ROWS ...)
// ROWS / COLS / LED_ROWS / LED_COLS → WIDTH / HEIGHT; defines that became self-referential (#define WIDTH (WIDTH)) are commented
export function cNames(text) {
  let t = text.replace(/\bLED_COLS\b/g, 'WIDTH').replace(/\bLED_ROWS\b/g, 'HEIGHT').replace(/\bCOLS\b/g, 'WIDTH').replace(/\bROWS\b/g, 'HEIGHT');
  t = t.replace(/^([ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+\(?[ \t]*\2[ \t]*\)?[ \t]*(\/\/.*)?)$/gm, '// $1 // (same name after WIDTH / HEIGHT replacement)');
  return t;
}
// top-level items of C++ text: preprocessor lines, declarations, function definitions (offsets in text)
function topItems(text) {
  const b = blankCode(text), items = [];
  let i = 0;
  const n = b.length;
  while (i < n) {
    while (i < n && /\s/.test(b[i])) i++;
    if (i >= n) break;
    if (b[i] === '#') {
      let e = i; for (;;) { const nl = b.indexOf('\n', e); if (nl < 0) { e = n; break; } if (text[nl - 1] === '\\') { e = nl + 1; continue; } e = nl; break; }
      const m = /^#\s*define\s+(\w+)/.exec(text.slice(i, e));
      items.push({ kind: 'pp', name: m ? m[1] : null, start: i, end: e });
      i = e; continue;
    }
    const st = i; let depth = 0, braced = false, end = -1;
    for (; i < n; i++) {
      const c = b[i];
      if (c === '{') { if (depth === 0 && !braced) braced = i; depth++; }
      else if (c === '}') { depth--; if (depth === 0) { // function body or struct / class / initializer
        const head = b.slice(st, braced);
        if (parseHeader(head)) { end = i + 1; items.push({ kind: 'func', name: parseHeader(head).name, start: st, end }); i++; break; }
      } }
      else if (c === ';' && depth === 0) { end = i + 1; break; }
    }
    if (end < 0) { if (i >= n) break; continue; }
    const last = items[items.length - 1];
    if (!last || last.start !== st) {
      const d = b.slice(st, end).split('=')[0].replace(/\{[\s\S]*$/, '');
      const m = /([A-Za-z_]\w*)\s*(\[[^\]]*\]\s*)*(\([^)]*\)\s*)?;?\s*$/.exec(d);
      items.push({ kind: 'decl', name: m ? m[1] : null, start: st, end });
    }
    i = end;
  }
  return items;
}
function topLevelText(text) { // blanked code with contents of braces removed
  const b = blankCode(text).split(''); let d = 0;
  for (let i = 0; i < b.length; i++) { const c = b[i]; if (c === '}') d--; if (d > 0 && c !== '\n') b[i] = ' '; if (c === '{') d++; }
  return b.join('');
}
// pattern + code: pattern items that code already has are commented out (macro of code is moved up in place of pattern's);
// head = pattern without its functions (line numbers kept), tail = only functions (go after code)
export function mergePattern(pattern, codes) {
  const pat = pattern.replace(/\r\n?/g, '\n');
  const all = Object.values(codes).join('\n');
  const blankAll = blankCode(all);
  const macros = new Map();
  for (const [file, t] of Object.entries(codes)) {
    const re = /^[ \t]*#[ \t]*define[ \t]+(\w+).*$/gm; let m;
    const bl = blankCode(t);
    while ((m = re.exec(bl))) if (!macros.has(m[1])) macros.set(m[1], { file, line: t.slice(0, m.index).split('\n').length, text: t.slice(m.index, m.index + m[0].length) });
  }
  const funcs = new Set(findFunctions(all).map((f) => f.name));
  const top = topLevelText(all);
  const hasVar = (nm) => new RegExp('\\b[A-Za-z_][\\w:<>]*[\\s*&]+' + nm + '\\s*(\\[|=|;|,)').test(top);
  const lines = pat.split('\n');
  const lineOf = (off) => pat.slice(0, off).split('\n').length - 1;
  const head = lines.slice(), tail = lines.map(() => ''), moved = lines.map(() => false);
  const notes = [], codeEdits = [];
  const comment = (a, b, why) => { for (let k = a; k <= b; k++) head[k] = '// ' + lines[k]; notes.push(`pattern.c:${a + 1}: ${why}`); };
  for (const it of topItems(pat)) {
    const a = lineOf(it.start), b = lineOf(Math.max(it.start, it.end - 1));
    if (it.kind === 'pp' && it.name && macros.has(it.name)) {
      const mc = macros.get(it.name);
      head[a] = mc.text.trim() + ` // from ${mc.file}:${mc.line} (instead of pattern: ${lines[a].trim()})`;
      for (let k = a + 1; k <= b; k++) head[k] = '// ' + lines[k];
      codeEdits.push(mc); notes.push(`pattern.c:${a + 1}: ${it.name} of ${mc.file} used`);
    } else if (it.kind === 'func') {
      if (funcs.has(it.name)) comment(a, b, `${it.name}() is in sketch`);
      else for (let k = a; k <= b; k++) { tail[k] = lines[k]; head[k] = ''; moved[k] = true; }
    } else if (it.kind === 'decl' && it.name && (hasVar(it.name) || macros.has(it.name))) comment(a, b, `${it.name} is in sketch`);
  }
  // sketch's own copies of moved macros are commented (they come earlier now, from pattern's place)
  const out = {};
  for (const [file, t] of Object.entries(codes)) {
    const ls = t.split('\n');
    for (const e of codeEdits) if (e.file === file) ls[e.line - 1] = '// ' + ls[e.line - 1] + ' // (moved to pattern place)';
    out[file] = ls.join('\n');
  }
  void blankAll;
  return { head: head.join('\n'), tail: tail.join('\n'), codes: out, notes, headLines: head.filter((x, k) => !moved[k]), tailLines: tail.map((x, k) => (moved[k] ? x : null)) };
}
// pattern put into sketch text itself (editor shows it): head at top of first file, functions at end of last
export function insertPattern(pattern, codes) {
  const names = Object.keys(codes).sort();
  const m = mergePattern(pattern, codes);
  const squeeze = (ls) => { const o = []; for (const l of ls) if (l.trim() || (o.length && o[o.length - 1].trim())) o.push(l); while (o.length && !o[o.length - 1].trim()) o.pop(); return o; };
  const head = squeeze(m.headLines);
  const tail = []; let gap = false;
  for (const l of m.tailLines) { if (l === null) { gap = true; continue; } if (gap && tail.length) tail.push(''); gap = false; tail.push(l); }
  const out = { ...m.codes };
  const first = names[0], last = names[names.length - 1];
  out[first] = ['// ===== pattern.c: start =====', ...head, '// ===== pattern.c: end of head, sketch code below =====', '', out[first].replace(/\s+$/, '')].join('\n') + '\n';
  out[last] = out[last].replace(/\s+$/, '') + '\n\n' + ['// ===== pattern.c: functions =====', ...squeeze(tail)].join('\n') + '\n';
  return { codes: out, notes: m.notes };
}
