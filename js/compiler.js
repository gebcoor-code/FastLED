// Web FastLED: compiler worker (module worker). Loads YoWASP clang (gzipped files from rt/) and SDK,
// compiles projects on request.
//   → { type: 'init' }                                   ← { type: 'progress', done, total } / { type: 'ready', ms } / { type: 'fail', error }
//   → { type: 'compile', id, files, main, board, opt }   ← { type: 'log', id, line } / { type: 'result', id, ok, wasm, log, diagnostics, fixes, ms }
import { compileProject } from './compile-core.js?v=20261028193402';

const RT = new URL('../rt/', import.meta.url);
let clang = null, sdk = null, initP = null;
let progress = { done: 0, total: 0 };

// toolchain asks for llvm*.wasm / llvm-resources.tar: serve .gz next to them, unpacked on fly
// (.gz over 6 MB comes in parts name.p1.gz, name.p2.gz …: version.json "parts" { "llvm.core.wasm.gz": 4 }; joined before unpacking)
const realFetch = globalThis.fetch.bind(globalThis);
async function gzFetch(url, init) {
  const u = new URL(url instanceof Request ? url.url : String(url), RT);
  if (/\.(wasm|tar)$/.test(u.pathname) && u.href.startsWith(RT.href)) {
    const name = u.pathname.replace(/^.*\//, '') + '.gz', n = PARTS[name] || 0;
    const urls = n ? Array.from({ length: n }, (_, i) => u.href + '.p' + (i + 1) + '.gz' + VQ) : [u.href + '.gz' + VQ];
    const rs = await Promise.all(urls.map((x) => realFetch(x, init)));
    rs.forEach((r, i) => { if (!r.ok) throw new Error('Cannot load ' + urls[i].replace(/^.*\/|\?.*$/g, '') + ' (HTTP ' + r.status + ')'); });
    return new Response(gunzipStream(joined(rs.map((r) => r.body))), { headers: { 'content-type': u.pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' } });
  }
  return realFetch(url, init);
}
// bodies one after another, as one stream
function joined(bodies) {
  if (bodies.length === 1) return bodies[0];
  let i = 0, rd = bodies[0].getReader();
  return new ReadableStream({
    async pull(c) {
      for (;;) {
        const x = await rd.read();
        if (!x.done) { c.enqueue(x.value); return; }
        if (++i >= bodies.length) { c.close(); return; }
        rd = bodies[i].getReader();
      }
    },
    cancel(r) { return rd.cancel(r); },
  }, { highWaterMark: 0 });
}
let VQ = '', PARTS = {};
// unpack .gz stream — unless server already did (Content-Encoding: gzip for .gz files): look at magic bytes
function gunzipStream(body) {
  const reader = body.getReader();
  let out = null;
  return new ReadableStream({
    async start() {
      const { done, value } = await reader.read();
      let first = done ? null : value;
      const src = new ReadableStream({
        async pull(c) {
          if (first) { c.enqueue(first); first = null; return; }
          const x = await reader.read();
          if (x.done) c.close(); else c.enqueue(x.value);
        },
        cancel(r) { return reader.cancel(r); },
      }, { highWaterMark: 0 });
      const gz = value && value[0] === 0x1f && value[1] === 0x8b;
      out = (gz ? src.pipeThrough(new DecompressionStream('gzip')) : src).getReader();
    },
    async pull(ctl) {
      const x = await out.read();
      if (x.done) ctl.close(); else ctl.enqueue(x.value);
    },
    cancel(r) { return out && out.cancel(r); },
  });
}

function untar(buf) {
  const root = {}; let o = 0; const td = new TextDecoder();
  while (o + 512 <= buf.length) {
    const h = buf.subarray(o, o + 512); if (!h[0]) break;
    const name = td.decode(h.subarray(0, 100)).replace(/\0[\s\S]*$/, '');
    const size = parseInt(td.decode(h.subarray(124, 136)).replace(/\0[\s\S]*$/, '').trim() || '0', 8);
    const type = h[156];
    o += 512;
    if (type === 48 || type === 0) {
      const parts = name.split('/'); let d = root;
      for (const p of parts.slice(0, -1)) d = d[p] = d[p] || {};
      d[parts[parts.length - 1]] = buf.slice(o, o + size);
    }
    o += Math.ceil(size / 512) * 512;
  }
  return root;
}

async function init() {
  const t0 = performance.now();
  const ver = await realFetch(new URL('version.json?t=' + Date.now(), RT)).then((r) => r.json()).catch(() => ({}));
  VQ = ver.clang ? '?c=' + encodeURIComponent(ver.clang) : '';
  PARTS = ver.parts || {};
  globalThis.fetch = gzFetch; // before bundle is evaluated: it keeps reference to fetch
  const mod = await import('../rt/clang.js' + VQ);
  clang = mod;
  const sdkP = realFetch(new URL('wfl-sdk.tar.gz' + (ver.built ? '?b=' + encodeURIComponent(ver.built) : ''), RT)).then(async (r) => {
    if (!r.ok) throw new Error('Cannot load wfl-sdk.tar.gz (HTTP ' + r.status + ')');
    return untar(new Uint8Array(await new Response(gunzipStream(r.body)).arrayBuffer()));
  });
  // first run downloads and compiles toolchain (about 26 MB, kept by browser cache)
  await clang.runClang(null, {}, {
    fetchProgress: ({ totalLength, doneLength }) => {
      progress = { done: doneLength, total: totalLength };
      postMessage({ type: 'progress', done: doneLength, total: totalLength });
    },
  });
  sdk = await sdkP;
  postMessage({ type: 'ready', ms: Math.round(performance.now() - t0), clang: ver.clang || '' });
}

onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    if (!initP) initP = init().catch((err) => { initP = null; postMessage({ type: 'fail', error: String(err && err.message || err) }); throw err; });
    return;
  }
  if (m.type === 'compile') {
    try {
      if (!initP) initP = init();
      await initP;
      const r = await compileProject(clang, sdk, m.files, m.main, {
        board: m.board, opt: m.opt, warnings: m.warnings, defines: m.defines, profile: m.profile, fixes: m.fixes, pattern: m.pattern, cNames: m.cNames, stdlib: m.stdlib, noPower: m.noPower,
        log: (line) => postMessage({ type: 'log', id: m.id, line }),
      });
      const msg = { type: 'result', id: m.id, ok: r.ok, wasm: r.wasm, log: r.log, diagnostics: r.diagnostics, fixes: r.fixes, ms: Math.round(r.ms), board: r.board, prototypes: r.prototypes.length, profile: r.profile };
      postMessage(msg, r.wasm ? [r.wasm.buffer] : []);
    } catch (err) {
      postMessage({ type: 'result', id: m.id, ok: false, log: String(err && (err.stack || err.message) || err), diagnostics: [], fixes: [], internal: true });
    }
  }
};
