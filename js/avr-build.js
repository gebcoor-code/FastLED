// Web FastLED: real AVR build of Arduino project with avr-gcc 7.3 in WebAssembly (avr-wasi.js), as Arduino IDE does it
// (AVR core 1.8.6, same flags and steps): .ino → .ino.cpp, compile, link with LTO, .hex / .eep / .elf / with_bootloader.
// ES module: AVR build worker (avr-worker.js) and node tests.
//
// File system (SDK tar unpacked at /):
//   /avr/…                      toolchain: gcc lib (include, device-specs, libgcc), avr-libc, ldscripts
//   /ard/cores/arduino, /ard/variants/<v>, /ard/bootloaders/…, /ard/libraries/<Lib>/…   Arduino AVR core 1.8.6 + FastLED
//   /ard/pre/<board>/core.a, /ard/pre/<board>/<Lib>/*.o      precompiled core and libraries (LTO objects)
import { preprocessSketch, cNames, mergePattern, findFunctions } from './sketch.js?v=20261028193402';
import { sketchLines } from './avr-dwarf.js?v=20261028193402';

export const AVR_BOARDS = {
  nano: {
    id: 'nano', name: 'Arduino Nano', mcu: 'atmega328p', variant: 'eightanaloginputs', board: 'AVR_NANO', fqbn: 'arduino.avr.nano',
    flash: 30720, ram: 2048, eeprom: 1024,
    cpus: {
      atmega328: { name: 'ATmega328P', boot: 'optiboot/optiboot_atmega328.hex', protocol: 'arduino', speed: 115200 },
      atmega328old: { name: 'ATmega328P (Old Bootloader)', boot: 'atmega/ATmegaBOOT_168_atmega328.hex', protocol: 'arduino', speed: 57600 },
    },
    cpu: 'atmega328',
  },
  mega: {
    id: 'mega', name: 'Arduino Mega 2560', mcu: 'atmega2560', variant: 'mega', board: 'AVR_MEGA2560', fqbn: 'arduino.avr.mega',
    flash: 253952, ram: 8192, eeprom: 4096,
    cpus: { atmega2560: { name: 'ATmega2560 (Mega 2560)', boot: 'stk500v2/stk500boot_v2_mega2560.hex', protocol: 'wiring', speed: 115200 } },
    cpu: 'atmega2560',
  },
};

// platform.txt of AVR core 1.8.6 (compiler.warning_flags = -w: "Compiler warnings: None")
export function avrFlags(b, warnings = false) {
  const w = warnings ? ['-Wall', '-Wextra'] : ['-w'];
  const defs = ['-mmcu=' + b.mcu, '-DF_CPU=16000000L', '-DARDUINO=10607', '-DARDUINO_' + b.board, '-DARDUINO_ARCH_AVR'];
  return {
    cpp: ['avr-g++', '-c', '-g', '-Os', ...w, '-std=gnu++11', '-fpermissive', '-fno-exceptions', '-ffunction-sections', '-fdata-sections', '-fno-threadsafe-statics', '-Wno-error=narrowing', '-flto', ...defs],
    c: ['avr-gcc', '-c', '-g', '-Os', ...w, '-std=gnu11', '-ffunction-sections', '-fdata-sections', '-flto', '-fno-fat-lto-objects', ...defs],
    S: ['avr-gcc', '-c', '-g', '-x', 'assembler-with-cpp', '-flto', ...defs],
    link: ['avr-gcc', ...w, '-Os', '-g', '-flto', '-fuse-linker-plugin', '-Wl,--gc-sections', '-mmcu=' + b.mcu],
    ar: ['avr-gcc-ar', 'rcs', '--plugin', '/avr/libexec/gcc/avr/7.3.0/liblto_plugin.so'],
  };
}
// WFL_QSORT: qsort of host gcc was built for. Order of equal elements in gcc's sorts changes register allocation and
// code: Arduino IDE on Windows (mingw build, msvcrt.dll quicksort) — msvc; Linux (glibc merge sort) — glibc
export const ENV = { PATH: '/avr/bin', TMPDIR: '/tmp', HOME: '/tmp', WFL_QSORT: 'msvc' };
// wasm modules (rt/avr/<name>.wasm.gz) and names programs call them by; cc1 only for .c files
export const AVR_TOOLS = ['xgcc', 'xg++', 'cc1plus', 'cc1', 'collect2', 'lto-wrapper', 'lto1', 'as', 'ld', 'ar', 'objcopy', 'size', 'nm'];
export const AVR_ALIAS = {
  'avr-gcc': 'xgcc', 'avr-g++': 'xg++', 'avr-c++': 'xg++', gcc: 'xgcc', 'g++': 'xg++', 'avr-gcc-ar': 'ar', 'avr-ar': 'ar',
  'avr-objcopy': 'objcopy', 'avr-size': 'size', 'avr-nm': 'nm', 'as-new': 'as', 'ld-new': 'ld', 'ld.bfd': 'ld', 'nm-new': 'nm',
};

// ---------------------------------------------------------------- Intel HEX
// records → segments [{ addr, data }] (sorted, contiguous parts joined)
export function parseHex(text) {
  const segs = []; let base = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim(); if (!l.startsWith(':')) continue;
    const b = []; for (let i = 1; i + 1 < l.length; i += 2) b.push(parseInt(l.slice(i, i + 2), 16));
    const n = b[0], a = (b[1] << 8) | b[2], t = b[3], d = b.slice(4, 4 + n);
    if (t === 0) segs.push({ addr: base + a, data: Uint8Array.from(d) });
    else if (t === 2) base = ((d[0] << 8) | d[1]) * 16;
    else if (t === 4) base = ((d[0] << 8) | d[1]) * 65536;
    else if (t === 1) break;
  }
  return joinSegs(segs);
}
function joinSegs(list) {
  const s = list.filter((x) => x.data.length).sort((a, b) => a.addr - b.addr), out = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x.addr <= last.addr + last.data.length) {
      const end = Math.max(last.addr + last.data.length, x.addr + x.data.length), d = new Uint8Array(end - last.addr);
      d.set(last.data); d.set(x.data, x.addr - last.addr); last.data = d;
    } else out.push({ addr: x.addr, data: x.data });
  }
  return out;
}
const rec = (n, a, t, d) => {
  const b = [n, (a >> 8) & 255, a & 255, t, ...d]; let s = 0; for (const x of b) s += x;
  return ':' + [...b, (-s) & 255].map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('');
};
// as arduino-cli writes merged hex: extended linear address records, 16 bytes per line from segment start, "\n"
export function dumpHex(segs) {
  const out = []; let hi = -1;
  for (const s of segs) {
    let i = 0;
    while (i < s.data.length) {
      const a = s.addr + i;
      if ((a >>> 16) !== hi) { hi = a >>> 16; out.push(rec(2, 0, 4, [(hi >> 8) & 255, hi & 255])); }
      const n = Math.min(16, s.data.length - i, 0x10000 - (a & 0xffff));
      out.push(rec(n, a & 0xffff, 0, s.data.subarray(i, i + n)));
      i += n;
    }
  }
  out.push(':00000001FF');
  return out.join('\n') + '\n';
}
// flash image from address 0 to end of last segment, gaps 0xFF
export function hexToBin(segs) {
  const end = segs.reduce((m, s) => Math.max(m, s.addr + s.data.length), 0), b = new Uint8Array(end).fill(0xff);
  for (const s of segs) b.set(s.data, s.addr);
  return b;
}
export function withBootloader(hex, bootHex) {
  const segs = joinSegs([...parseHex(hex), ...parseHex(bootHex)]);
  return { hex: dumpHex(segs), bin: hexToBin(segs) };
}

// ---------------------------------------------------------------- libraries
// as Arduino builder finds them: source is preprocessed (gcc -E); for "fatal error: X.h: No such file" library with X.h
// is added to include paths and source is preprocessed again. Includes in #if branches that are not taken do not count.
function listFiles(fs, dir, rec = true, pre = '') {
  const n = fs.lookup(dir); if (!n || n.t !== 'd') return [];
  const out = [];
  for (const [name, x] of [...n.e.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (x.t === 'd') { if (rec) out.push(...listFiles(fs, dir + '/' + name, rec, pre + name + '/')); }
    else out.push(pre + name);
  }
  return out;
}
// libraries in /ard/libraries: { name, dir, src (include path), sources (relative to src; old format: root + utility/) }
export function libraryIndex(fs) {
  const libs = [], root = fs.lookup('/ard/libraries');
  if (!root) return libs;
  for (const name of [...root.e.keys()].sort()) {
    const dir = '/ard/libraries/' + name, hasSrc = !!fs.lookup(dir + '/src'), src = hasSrc ? dir + '/src' : dir;
    const sources = (hasSrc ? listFiles(fs, src) : listFiles(fs, src, false).concat(listFiles(fs, dir + '/utility').map((f) => 'utility/' + f)))
      .filter((f) => /\.(c|cpp|S)$/.test(f));
    libs.push({ name, dir, src, sources, utility: !hasSrc && !!fs.lookup(dir + '/utility') });
  }
  return libs;
}
export function libraryFor(fs, index, header) {
  const has = index.filter((l) => { const n = fs.lookup(l.src + '/' + header); return n && n.t === 'f'; });
  return has.find((l) => l.name + '.h' === header) || has[0] || null;
}
const langOf = (f) => (/\.S$/.test(f) ? 'S' : /\.c$/i.test(f) ? 'c' : 'cpp');

// ---------------------------------------------------------------- build
const latin1 = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
// files: [{ path, text | data }] of project (sketch folder); main: .ino file name. opts: { board, cpu, warnings, log(line) }
// returns { ok, log, name, hex, eep, elf, boot: { hex, bin }, size: { flash, ram, eeprom, maxFlash, maxRam }, report, ms }
export function buildAvr(tc, files, main, opts = {}) {
  const t0 = Date.now();
  const b = AVR_BOARDS[opts.board] || AVR_BOARDS.nano, cpu = b.cpus[opts.cpu] || b.cpus[b.cpu];
  const F = avrFlags(b, opts.warnings), fs = tc.fs;
  const dec = new TextDecoder();
  let log = '';
  const say = (s) => { log += s + '\n'; if (opts.log) opts.log(s); };
  const oldOut = tc.stdout, oldErr = tc.stderr;
  let out = '';
  let err = '';
  tc.stdout = (x) => { out += dec.decode(x); }; tc.stderr = (x) => { err += dec.decode(x); };
  // runs tool; its stderr goes to log (quiet: kept in err only)
  const run = (argv, quiet) => {
    out = ''; err = '';
    const r = tc.run('/avr/bin/' + argv[0], argv, opts.qsort ? { ...ENV, WFL_QSORT: opts.qsort } : ENV);
    if (opts.trace) say('$ ' + argv.join(' ') + ' → ' + r);
    if (!quiet && err) { log += err; if (opts.log) for (const l of err.replace(/\n$/, '').split('\n')) opts.log(l); }
    return r;
  };
  const fail = (msg) => { if (msg) say(msg); tc.stdout = oldOut; tc.stderr = oldErr; return { ok: false, log, ms: Date.now() - t0 }; };
  try {
    // fresh build tree; project in /sketch (as copy of sketch folder that IDE builds in)
    for (const d of ['/sketch', '/build', '/tmp']) fs.remove(d);
    fs.mkdirp('/tmp'); fs.mkdirp('/build/sketch'); fs.mkdirp('/build/libraries');
    const texts = {};
    for (const f of files) {
      const data = f.data || new TextEncoder().encode(f.text || '');
      fs.writeFile('/sketch/' + f.path, data);
      // bytes as they are (UTF-8, cp1251 …): text is latin1 view of file, .ino.cpp written back byte for byte
      if (/\.(ino|pde|h|hpp|c|cpp|cc|S)$/i.test(f.path)) texts[f.path] = latin1(data);
    }
    const top = (re) => Object.keys(texts).filter((p) => re.test(p) && !p.includes('/'));
    const byteOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // as arduino-cli: byte order of names (upper case first)
    let inos = top(/\.(ino|pde)$/i), cFiles = [], mainName, name, pre;
    if (inos.length) {
      // main .ino first, others after it in byte order of names
      mainName = inos.includes(main) ? main : inos[0];
      const order = [mainName, ...inos.filter((n) => n !== mainName).sort(byteOrder)];
      pre = preprocessSketch(order.map((n) => ({ name: n, text: texts[n] })), mainName, '/sketch/', { ordered: true });
      name = mainName;
    } else {
      // .c sketch (no .ino): its .c files are sketch, as in emulator (COLS / ROWS → WIDTH / HEIGHT, pattern.c gives setup / loop)
      cFiles = top(/\.c$/i).sort(byteOrder);
      if (!cFiles.length) return fail('No .ino (or .c sketch) file in project');
      const c = opts.cSketch || {};
      if (c.names !== false) for (const p of cFiles) texts[p] = cNames(texts[p]);
      let order = cFiles.map((n) => ({ name: n }));
      const hasSetup = findFunctions(cFiles.map((p) => texts[p]).join('\n')).some((f) => f.name === 'setup');
      if (c.pattern && !hasSetup) {
        const m = mergePattern(latin1(new TextEncoder().encode(c.pattern)), Object.fromEntries(cFiles.map((p) => [p, texts[p]])));
        Object.assign(texts, m.codes); texts.__pattern_head = m.head; texts.__pattern_tail = m.tail;
        order = [{ name: '__pattern_head', display: 'pattern.c' }, ...order, { name: '__pattern_tail', display: 'pattern.c' }];
        say('pattern.c added' + (m.notes.length ? ': ' + m.notes.join('; ') : ''));
      }
      pre = preprocessSketch(order.map((o) => ({ name: o.name, display: o.display, text: texts[o.name] })), null, '/sketch/', { ordered: true });
      mainName = (opts.name || cFiles[0].replace(/\.c$/i, '')) + '.ino';
      name = opts.name || cFiles[0].replace(/\.c$/i, '');
    }
    const sketchCpp = '/build/sketch/' + mainName + '.cpp';
    fs.writeFile(sketchCpp, Uint8Array.from(pre.code, (c) => c.charCodeAt(0) & 255));
    // other sketch sources (top level and src/) copied next to .ino.cpp, as IDE does
    const units = [{ src: sketchCpp, lang: 'cpp', obj: sketchCpp + '.o' }];
    for (const p of Object.keys(texts).sort()) {
      if (/\.(ino|pde)$/i.test(p) || cFiles.includes(p) || p.startsWith('__pattern') || (p.includes('/') && !p.startsWith('src/'))) continue;
      fs.writeFile('/build/sketch/' + p, fs.readFile('/sketch/' + p));
      const m = p.match(/\.(cpp|cc|c|S)$/i); if (!m) continue;
      units.push({ src: '/build/sketch/' + p, lang: m[1] === 'S' ? 'S' : m[1].toLowerCase() === 'c' ? 'c' : 'cpp', obj: '/build/sketch/' + p + '.o' });
    }
    const index = libraryIndex(fs), libs = [];
    const inc = ['-I/ard/cores/arduino', '-I/ard/variants/' + b.variant];
    const addLib = (l) => {
      if (libs.includes(l)) return true;
      const at = libs.length;
      libs.push(l); inc.push('-I' + l.src);
      // precompiled library: libraries it uses are known (deps file), else its sources are scanned too
      const deps = fs.readText('/ard/pre/' + b.id + '/' + l.name + '.deps');
      if (deps != null) { for (const n of deps.split('\n').filter(Boolean)) { const d = index.find((x) => x.name === n); if (d && !addLib(d)) return false; } }
      else for (const f of l.sources) if (!scan(l.src + '/' + f, langOf(f))) return false;
      l.found = libs.slice(at + 1).map((x) => x.name);
      return true;
    };
    const scan = (file, lang) => {
      if (lang === 'S') return true;
      for (let k = 0; k < 64; k++) {
        if (!run([...F[lang], ...inc, '-E', file, '-o', '/tmp/preproc.out'], true)) return true;
        const m = err.match(/fatal error: ([^\n]+?): No such file or directory/);
        const l = m && libraryFor(fs, index, m[1].trim());
        if (!l || libs.includes(l)) { log += err; if (opts.log) for (const x of err.replace(/\n$/, '').split('\n')) opts.log(x); return false; }
        if (!addLib(l)) return false;
      }
      return false;
    };
    for (const u of units) if (!scan(u.src, u.lang)) return fail('Compilation error: ' + u.src.replace('/build/sketch/', ''));
    say('Board: ' + b.name + (Object.keys(b.cpus).length > 1 ? ', ' + cpu.name : '') + (libs.length ? '; libraries: ' + libs.map((l) => l.name).join(', ') : ''));
    const compile = (u) => run([...F[u.lang], ...inc, u.src, '-o', u.obj]);
    for (const u of units) if (compile(u)) return fail('Compilation error: ' + u.src.replace('/build/sketch/', ''));
    // libraries: precompiled for board, or compiled now (kept in /cache for next builds of session)
    const libObjs = [];
    for (const l of libs) {
      const preDir = '/ard/pre/' + b.id + '/' + l.name;
      if (fs.lookup(preDir)) { for (const f of listFiles(fs, preDir)) libObjs.push(preDir + '/' + f); continue; }
      const cdir = '/cache/' + b.id + '/' + l.name;
      if (!fs.lookup(cdir + '/.done')) {
        say('Compiling library ' + l.name);
        fs.mkdirp(cdir);
        for (const f of l.sources) {
          const obj = cdir + '/' + f.replace(/\//g, '_') + '.o';
          if (run([...F[langOf(f)], ...inc, ...(l.utility ? ['-I' + l.dir + '/utility'] : []), l.src + '/' + f, '-o', obj])) return fail('Compilation error in library ' + l.name);
        }
        fs.writeFile(cdir + '.deps', (l.found || []).join('\n'));
        fs.writeFile(cdir + '/.done', '');
      }
      for (const f of listFiles(fs, cdir)) if (f.endsWith('.o')) libObjs.push(cdir + '/' + f);
    }
    // core: precompiled archive (or compiled now)
    let core = '/ard/pre/' + b.id + '/core.a';
    if (!fs.lookup(core)) {
      core = '/cache/' + b.id + '/core.a';
      if (!fs.lookup(core)) {
        say('Compiling core');
        const objs = [];
        fs.mkdirp('/cache/' + b.id + '/core');
        for (const f of listFiles(fs, '/ard/cores/arduino', false)) {
          const m = f.match(/\.(cpp|c|S)$/); if (!m) continue;
          const obj = '/cache/' + b.id + '/core/' + f + '.o';
          if (run([...F[m[1] === 'S' ? 'S' : m[1] === 'c' ? 'c' : 'cpp'], '-I/ard/cores/arduino', '-I/ard/variants/' + b.variant, '/ard/cores/arduino/' + f, '-o', obj])) return fail('Compilation error in core');
          objs.push(obj);
        }
        if (run([...F.ar, core, ...objs])) return fail('Cannot make core.a');
      }
    }
    const elf = '/build/' + mainName + '.elf';
    if (run([...F.link, '-o', elf, ...units.map((u) => u.obj), ...libObjs, core, '-L/build', '-lm'])) return fail('Link error');
    run(['avr-objcopy', '-O', 'ihex', '-j', '.eeprom', '--set-section-flags=.eeprom=alloc,load', '--no-change-warnings', '--change-section-lma', '.eeprom=0', elf, '/build/' + mainName + '.eep']);
    if (run(['avr-objcopy', '-O', 'ihex', '-R', '.eeprom', elf, '/build/' + mainName + '.hex'])) return fail('objcopy failed');
    // functions of program (demangled), with place in sketch when it is sketch's own: for profiler and debugger
    const funcs = [];
    if (!run(['avr-nm', '-C', '-n', '-S', '--defined-only', elf], true)) {
      const where = new Map();
      for (const [p, t] of Object.entries(texts)) {
        if (p.startsWith('__pattern') || !/\.(ino|pde|c|cpp|cc|h|hpp)$/i.test(p)) continue;
        let line = 1, at = 0;
        for (const f of findFunctions(t)) { for (; at < f.start; at++) if (t.charCodeAt(at) === 10) line++; if (!where.has(f.name)) where.set(f.name, { file: p, line }); }
      }
      for (const l of out.split('\n')) {
        const m = l.match(/^([0-9a-f]+) (?:([0-9a-f]+) )?([TtWw]) (.+)$/); if (!m) continue;
        const addr = parseInt(m[1], 16); if (addr >= 0x800000 || /^(L_\d+|\.L.*)$/.test(m[4])) continue; // labels of inline asm belong to function
        const name = m[4], base = name.replace(/\(.*$/, '').replace(/^.*::/, '').replace(/\.(constprop|part|isra|lto_priv)\.\d+.*$/, '').replace(/^.* /, '');
        const w = where.get(base);
        funcs.push({ addr, size: m[2] ? parseInt(m[2], 16) : 0, name, file: w ? w.file : '', line: w ? w.line : 0 });
      }
    }
    run(['avr-size', '-A', elf]);
    const sec = (re) => out.split('\n').reduce((s, l) => { const m = l.match(re); return m ? s + +m[1] : s; }, 0);
    const size = {
      flash: sec(/^(?:\.text|\.data|\.bootloader)\s+(\d+)/), ram: sec(/^(?:\.data|\.bss|\.noinit)\s+(\d+)/), eeprom: sec(/^(?:\.eeprom)\s+(\d+)/),
      maxFlash: b.flash, maxRam: b.ram,
    };
    const pct = (a, m) => Math.floor(a * 100 / m);
    let report = `Sketch uses ${size.flash} bytes (${pct(size.flash, b.flash)}%) of program storage space. Maximum is ${b.flash} bytes.\n`
      + `Global variables use ${size.ram} bytes (${pct(size.ram, b.ram)}%) of dynamic memory, leaving ${b.ram - size.ram} bytes for local variables. Maximum is ${b.ram} bytes.`;
    let ok = true;
    if (size.flash > b.flash) { report += '\nSketch too big; see https://support.arduino.cc/hc/en-us/articles/360013825179 for tips on reducing it.'; ok = false; }
    if (size.ram > b.ram) { report += '\nNot enough memory; see https://support.arduino.cc/hc/en-us/articles/360013825179 for tips on reducing your footprint.'; ok = false; }
    else if (size.ram * 100 > b.ram * 75) report += '\nLow memory available, stability problems may occur.';
    say(report);
    const hex = fs.readText('/build/' + mainName + '.hex');
    const bootHex = fs.readText('/ard/bootloaders/' + cpu.boot);
    tc.stdout = oldOut; tc.stderr = oldErr;
    return {
      ok, log, name, hex, eep: fs.readText('/build/' + mainName + '.eep'), elf: fs.readFile(elf).slice(), funcs, lines: sketchLines(fs.readFile(elf)),
      boot: bootHex ? withBootloader(hex, bootHex) : null, size, report, board: b.id, cpu: opts.cpu || b.cpu, ms: Date.now() - t0,
    };
  } catch (e) {
    return fail('Internal error: ' + (e && e.stack || e));
  }
}
