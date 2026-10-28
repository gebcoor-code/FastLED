// Web FastLED: real AVR build worker (module worker): avr-gcc 7.3 in WebAssembly (rt/avr/), Arduino AVR core 1.8.6, FastLED.
// Tools are downloaded once (browser cache keeps them), SDK is unpacked into in-memory file system.
//   → { type: 'init' }                                         ← { type: 'progress', done, total } / { type: 'ready', ms } / { type: 'fail', error }
//   → { type: 'build', id, files, main, board, cpu, warnings }   ← { type: 'log', id, line } / { type: 'result', id, ok, … }
import { MemFS, Toolchain } from './avr-wasi.js?v=20261028193402';
import { AVR_TOOLS, AVR_ALIAS, buildAvr } from './avr-build.js?v=20261028193402';
import { parseDiagnostics } from './sketch.js?v=20261028193402';

const RT = new URL('../rt/avr/', import.meta.url);
let tc = null, initP = null, man = null;
const lazy = new Set(['cc1']); // C compiler: only for .c files of sketch / libraries

async function gunzip(r) {
  const body = r.body.getReader();
  const first = await body.read();
  const head = first.value || new Uint8Array(0);
  const src = new ReadableStream({
    start(c) { if (head.length) c.enqueue(head); if (first.done) c.close(); },
    async pull(c) { const x = await body.read(); if (x.done) c.close(); else c.enqueue(x.value); },
  });
  const gz = head[0] === 0x1f && head[1] === 0x8b; // server may already unpack .gz (Content-Encoding: gzip)
  return new Uint8Array(await new Response(gz ? src.pipeThrough(new DecompressionStream('gzip')) : src).arrayBuffer());
}
// download with progress over all files
function loader(total) {
  let done = 0;
  return async (file) => {
    const r = await fetch(new URL(file + '?v=' + encodeURIComponent(man.version), RT));
    if (!r.ok) throw new Error('Cannot load ' + file + ' (HTTP ' + r.status + ')');
    const reader = r.body.getReader(), chunks = [];
    for (;;) {
      const x = await reader.read(); if (x.done) break;
      chunks.push(x.value); done += x.value.length;
      postMessage({ type: 'progress', done, total });
    }
    return gunzip(new Response(new Blob(chunks)));
  };
}

async function init() {
  const t0 = performance.now();
  man = await fetch(new URL('avr.json?t=' + Date.now(), RT)).then((r) => { if (!r.ok) throw new Error('Real build runtime is not installed (rt/avr/avr.json: HTTP ' + r.status + ')'); return r.json(); });
  const need = AVR_TOOLS.filter((t) => !lazy.has(t));
  const total = man.sdkSize + need.reduce((s, t) => s + man.tools[t].size, 0);
  const load = loader(total);
  const fs = new MemFS();
  const sdkP = load(man.sdk).then((b) => fs.untar(b));
  const modules = {};
  await Promise.all(need.map(async (t) => { modules[t] = await WebAssembly.compile(await load(man.tools[t].file)); }));
  await sdkP;
  fs.mkdirp('/tmp');
  tc = new Toolchain(fs, modules, AVR_ALIAS);
  postMessage({ type: 'ready', ms: Math.round(performance.now() - t0), version: man.version });
}
// tool that build asked for but is not loaded yet (cc1 for .c files): load it, then build is run again
async function loadMissing() {
  const names = [...(tc.missing || [])].filter((t) => man.tools[t] && !tc.modules[t]);
  tc.missing = new Set();
  if (!names.length) return false;
  postMessage({ type: 'log', line: 'Loading ' + names.join(', ') + '…' });
  const load = loader(names.reduce((s, t) => s + man.tools[t].size, 0));
  for (const t of names) tc.modules[t] = await WebAssembly.compile(await load(man.tools[t].file));
  return true;
}

onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    if (!initP) initP = init().catch((err) => { initP = null; postMessage({ type: 'fail', error: String(err && err.message || err) }); throw err; });
    return;
  }
  if (m.type === 'build') {
    try {
      if (!initP) initP = init();
      await initP;
      const opts = { board: m.board, cpu: m.cpu, warnings: m.warnings, cSketch: m.cSketch, name: m.name, log: (line) => postMessage({ type: 'log', id: m.id, line }) };
      tc.missing = new Set();
      let r = buildAvr(tc, m.files, m.main, opts);
      if (!r.ok && await loadMissing()) r = buildAvr(tc, m.files, m.main, opts);
      const tr = [];
      if (r.elf) tr.push(r.elf.buffer);
      if (r.boot) tr.push(r.boot.bin.buffer);
      r.diagnostics = parseDiagnostics(r.log || '', '/sketch/');
      postMessage({ type: 'result', id: m.id, ...r }, tr);
    } catch (err) {
      postMessage({ type: 'result', id: m.id, ok: false, log: String(err && (err.stack || err.message) || err), internal: true });
    }
  }
};
