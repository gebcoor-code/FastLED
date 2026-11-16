// Web Unreal Speccy: offline copy (service worker). Registered by the page as sw.js?v=<build>.
// The emulator itself (page, scripts, wasm, ini…) is kept per build; files of the site (ROMs, disks, HDD / SD images, lists)
// are kept once fetched (and by Options / System / Offline: Make offline). The network first, the copy when it fails or is
// slow; a file of this build (?v=<build>) straight from the copy; the site down (no answer a moment ago): the copies at once.
'use strict';
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const NET_WAIT = 1500; // ms the site has to answer before the kept copy is used
const DOWN_FOR = 30000; // the site did not answer: for this long the copies come at once (no wait for each file)
let downUntil = 0;
const SCOPE = new URL(self.registration.scope).pathname; // copies in other folders of the site keep their own caches
const CORE = 'ue-core:' + SCOPE + ':' + BUILD, FILES = 'ue-files:' + SCOPE;
const SHELL = ['./', 'index.html', 'changes.zip', 'LICENSE', 'icon.png', 'apple-touch-icon.png',
  'js/js.zip',
  'unreal/unreal.zip', 'unreal/unreal.wasm', 'unreal/sjasm.zip', 'unreal/unreal.ini', 'unreal/boot6.$b', 'unreal/CMOS', 'unreal/sos.l'];
const NEED = ['index.html', 'js/js.zip', 'unreal/unreal.ini', 'unreal/boot6.$b']; // and unreal.zip or unreal.wasm

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    // one by one: a missing optional file (icon, sos.l) must not stop the rest; the ones the emulator cannot start
    // without must all be there, else this build is not installed (the copy of the build before stays as it was)
    const got = new Set();
    await Promise.all(SHELL.map(async (u) => { try { const r = await fetch(new Request(u.replace(/\$/g, '%24'), { cache: 'reload' })); if (r.ok) { await c.put(u.replace(/\$/g, '%24'), r); got.add(u); } } catch (err) {} }));
    if (!NEED.every((u) => got.has(u)) || !(got.has('unreal/unreal.zip') || got.has('unreal/unreal.wasm'))) { await caches.delete(CORE); throw new Error('offline copy: files missing'); }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('ue-core:' + SCOPE + ':') && k !== CORE) await caches.delete(k); // older builds
    await self.clients.claim();
  })());
});

const inScope = (u) => u.origin === self.location.origin && u.pathname.startsWith(SCOPE);
const isFile = (p) => /^(rom|trd|hdd|sd)\//i.test(p) || /\.json$/i.test(p);
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || !inScope(u) || req.headers.has('range')) return;
  const rel = decodeURIComponent(u.pathname.slice(SCOPE.length));
  e.respondWith((async () => {
    const store = isFile(rel) ? FILES : CORE;
    // the copy of this build only (not of an older build or another copy of the site: caches.match looks into all of them)
    const copy = async () => { const c = await caches.open(store), core = store === CORE ? c : await caches.open(CORE);
      return (await c.match(u.origin + u.pathname, { ignoreSearch: true })) ||
        (req.mode === 'navigate' ? (await core.match(new URL('index.html', self.registration.scope).href, { ignoreSearch: true })) || (await core.match(self.registration.scope, { ignoreSearch: true })) : null); };
    const mine = u.searchParams.get('v') === BUILD; // a file of this very build: it does not change
    // a file of another build (the page of a newer one while this worker still runs): the copy here is of this build, and
    // mixed with that page it breaks it; the network only, as long as it takes (the page tries again when it fails)
    if (u.searchParams.has('v') && !mine) return fetch(req).catch(() => Response.error());
    const have = await copy();
    if (have && (mine || self.navigator.onLine === false || Date.now() < downUntil)) return have;
    if (!have && store === FILES && Date.now() < downUntil) return Response.error(); // the site down and no copy of a site file: fails at once (was: waited for ever); the page's own files are always asked for
    const net = fetch(req).then((r) => {
      downUntil = 0;
      // the page's own files and the site's files: refreshed copy (a 404 or an HTML error page is not kept)
      // the copy is cloned at once: later (after caches.open) the page may be reading the body already, and clone() throws
      if (r.ok && !(isFile(rel) && /text\/html/i.test(r.headers.get('content-type') || '') && !/\.html?$/i.test(rel))) {
        const keep = r.clone();
        caches.open(store).then((c) => c.put(u.origin + u.pathname, keep)).catch(() => {});
      }
      return r;
    });
    // a site that does not answer (a network that drops the packets silently: fetch would wait for the browser's own
    // timeout, a black screen on the phone): with a copy at hand, the copy after NET_WAIT ms; the network keeps going
    // and refreshes the copy if it answers later. No copy: the network as long as it takes
    if (!have) { try { return await net; } catch (err) { downUntil = Date.now() + DOWN_FOR; return Response.error(); } }
    const late = new Promise((res) => setTimeout(() => res('late'), NET_WAIT));
    try {
      const r = await Promise.race([net, late]);
      if (r !== 'late') return r;
      net.catch(() => { downUntil = Date.now() + DOWN_FOR; }); // slow: this one from the copy; the site is taken for down only when it fails
      return have;
    } catch (err) { downUntil = Date.now() + DOWN_FOR; return have; } // offline: the copy (the build's ?v= does not matter; the page itself for any navigation)
  })());
});
// the page asks: how much is kept, or to drop the files
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
