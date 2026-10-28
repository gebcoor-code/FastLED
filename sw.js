// Web FastLED: service worker. Registered by page as sw.js?v=<build>.
// 1. Cross-origin isolation: COOP / COEP added to every response of site (servers without mod_headers / .htaccess,
//    static hosting): running sketch then waits in delay() without loading CPU (Atomics.wait).
// 2. Offline copy: page and scripts are kept per build; files of site (rt/: compilers, repo/: library, pattern.c) are
//    kept once fetched (and by Options / Offline: Make offline). Always network first, copy when it fails.
'use strict';
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const NET_WAIT = 4000; // ms site has to answer before kept copy is used
const SCOPE = new URL(self.registration.scope).pathname; // copies in other folders of site keep their own caches
const CORE = 'wfl-core:' + SCOPE + ':' + BUILD, FILES = 'wfl-files:' + SCOPE;
const SHELL = ['./', 'index.html', 'changes.txt', 'LICENSE', 'icon.png', 'apple-touch-icon.png',
  'js/app.js', 'js/led3d.js', 'js/editor.js', 'js/unzip.js', 'js/sketch.js', 'js/compile-core.js', 'js/runner-core.js', 'js/compiler.js', 'js/runner.js',
  'js/avr-wasi.js', 'js/avr-build.js', 'js/avr-worker.js', 'js/avr8.js', 'js/avr-run-core.js', 'js/avr-runner.js', 'js/avr-upload.js', 'js/avr-dwarf.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    // one by one: missing optional file (icon) must not stop the rest
    await Promise.all(SHELL.map(async (u) => { try { const r = await fetch(new Request(u, { cache: 'reload' })); if (r.ok) await c.put(new URL(u, self.registration.scope).href, r); } catch (err) {} }));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('wfl-core:' + SCOPE + ':') && k !== CORE) await caches.delete(k); // older builds
    await self.clients.claim();
  })());
});

// COOP / COEP / CORP on response (also on kept copy)
function isolated(res) {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
const inScope = (u) => u.origin === self.location.origin && u.pathname.startsWith(SCOPE);
const isFile = (p) => /^(rt|repo)\//i.test(p) || /^pattern\.c$/i.test(p) || /\.json$/i.test(p);
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  if (u.origin !== self.location.origin) return; // only own files
  if (req.method !== 'GET' || !inScope(u) || req.headers.has('range')) { e.respondWith(fetch(req).then(isolated)); return; } // HEAD (connection check) etc.: server only
  const rel = decodeURIComponent(u.pathname.slice(SCOPE.length));
  e.respondWith((async () => {
    const store = isFile(rel) ? FILES : CORE;
    const copy = async () => (await caches.match(u.origin + u.pathname, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? (await caches.match(new URL('index.html', self.registration.scope).href, { ignoreSearch: true })) || (await caches.match(self.registration.scope, { ignoreSearch: true })) : null);
    const net = fetch(req).then((r) => {
      // page's own files and files of site: refreshed copy (404 or HTML error page of host is not kept)
      if (r.ok && !(/text\/html/i.test(r.headers.get('content-type') || '') && !/(^|\/)$|\.html?$/i.test(rel))) {
        const keep = r.clone(); // now: body of r is read by page right after
        caches.open(store).then((c) => c.put(u.origin + u.pathname, keep)).catch(() => {});
      }
      return r;
    });
    // site that does not answer (network that drops packets silently: fetch would wait for browser's own timeout):
    // with copy at hand, copy after NET_WAIT ms; network keeps going and refreshes copy if it answers later.
    // No copy: network as long as it takes
    const have = await copy();
    if (!have) { try { return isolated(await net); } catch (err) { return Response.error(); } }
    const late = new Promise((res) => setTimeout(() => res('late'), NET_WAIT));
    try {
      const r = await Promise.race([net, late]);
      if (r !== 'late') return isolated(r);
      net.catch(() => {});
      return isolated(have);
    } catch (err) { return isolated(have); } // offline: copy (build's ?v= does not matter; page itself for any navigation)
  })());
});
// page asks: what is kept, or to drop files of site
self.addEventListener('message', (e) => {
  const d = e.data || {}, port = e.ports && e.ports[0];
  (async () => {
    if (d.cmd === 'list') {
      const out = [];
      for (const name of [CORE, FILES]) { const c = await caches.open(name); for (const r of await c.keys()) out.push(r.url); }
      port && port.postMessage({ build: BUILD, urls: out });
    } else if (d.cmd === 'clear') { await caches.delete(FILES); port && port.postMessage({ ok: true }); }
  })();
});
