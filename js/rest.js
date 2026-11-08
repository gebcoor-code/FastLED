// REST API kit: start a web app (an emulator, a player, a tool) in a given state from its URL.
//   index.html?model=pentagon&fdd=a:trd/game.trd&run=game&hidemenu=1   (or the same after #)
// From Web Unreal Speccy (web/app.js: linkParams, linkModel, linkApply, raBuild). No dependencies; a plain script:
// window.RestLink. MIT License.
(function () {
  'use strict';

  // ---------------------------------------------------------------- values
  // yes(v): a flag is on unless it is 0 / no / off / false (a bare key, ?mute, is on)
  const yes = (v) => v !== undefined && v !== null && !/^(0|no|off|false)$/i.test(String(v));
  // folders on the site are lower case ("TRD/Game.trd" → "trd/Game.trd"); a URL with a scheme (or //host) stays as it is
  const lowDir = (u) => (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u) ? u : u.replace(/^(.*\/)/, (d) => d.toLowerCase()));
  // the file name of a URL (decoded), for messages and file systems
  function urlName(u) {
    try { const p = new URL(u, location.href).pathname; return decodeURIComponent(p.slice(p.lastIndexOf('/') + 1)) || 'download'; } catch (e) { return 'download'; }
  }
  // a path of the link as an absolute URL: relative to the page; "/x" from the site root; another site as it is
  const resolve = (u) => new URL(lowDir(String(u).trim()), location.href).href;
  // encode a value for the link but keep it readable (/ : | stay)
  const enc = (v) => encodeURIComponent(v).replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%7C/gi, '|');

  // ---------------------------------------------------------------- parse
  // schema: {
  //   keys:    { name: { alias: ['other', ...], kind: 'flag' | 'text' | 'file' | 'enum', values: {...} } }  (optional)
  //   put(out, key, value): own rules for a key (fdd=a:path → out.a), return true when handled             (optional)
  // }
  // Keys are case-insensitive; values keep their case (file names). A key given twice: the last one wins, unless
  // put() collects them (fdd=a:x&fdd=b:y). Returns a plain object { key: value }.
  function parse(schema, href) {
    schema = schema || {};
    const alias = {};
    for (const [k, d] of Object.entries(schema.keys || {})) { alias[k.toLowerCase()] = k; for (const a of d.alias || []) alias[a.toLowerCase()] = k; }
    const out = {};
    const u = new URL(href || location.href);
    const add = (q) => {
      for (const [k0, v] of new URLSearchParams(q)) {
        const k = alias[k0.toLowerCase()] || k0.toLowerCase();
        if (schema.put && schema.put(out, k, v)) continue;
        out[k] = v;
      }
    };
    add(u.search);
    if (u.hash.length > 1 && u.hash.includes('=')) add(u.hash.slice(1)); // index.html#model=sam: no reload on a page that is open
    return out;
  }

  // an enum value by its aliases: pick(link.model, { pentagon: 'PENTAGON', p128: 'PENTAGON' }, ids) — case, spaces, - and _ ignored
  function pick(v, aliases, ids) {
    if (v === undefined) return undefined;
    const n = String(v).toLowerCase().replace(/[\s_-]/g, '');
    return (aliases && aliases[n]) || (ids || []).find((k) => k.toLowerCase() === String(v).toLowerCase());
  }

  // ---------------------------------------------------------------- files
  // fetch a file of the link. brw:NAME — a file of this browser's storage (IndexedDB etc.): opts.brw(name) → bytes or null.
  // Errors in words a visitor understands (CORS, 404) for the "Link: name: why" message.
  async function fetchFile(u, opts) {
    opts = opts || {};
    if (/^brw:/i.test(u)) {
      let name = u.slice(4); try { name = decodeURIComponent(name); } catch (e) {}
      const d = opts.brw ? await opts.brw(name).catch(() => null) : null;
      if (!d) throw new Error('not in this browser\'s storage');
      return d instanceof Uint8Array ? d : new Uint8Array(d);
    }
    let r;
    try { r = await fetch(resolve(u), { cache: 'no-cache' }); } catch (e) { throw new Error('cannot reach the server (network, CORS or https→http)'); }
    if (!r.ok) throw new Error(r.status === 404 ? 'not found (404)' : 'HTTP ' + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }

  // ---------------------------------------------------------------- apply
  // The link is applied in phases, each a list of steps { key, run(value, link) } taken in order when the key is there:
  //   before: before the app starts (machine / model, ROM: only its files are downloaded)
  //   after:  the app is up (clock, sound, keyboard, look: for this visit only, not stored)
  //   media:  files (disks, cards, tapes): fetched and mounted, each error reported and the rest go on
  //   run:    what starts (autorun, run=, a command)
  // A step that throws reports "Link: <value>: <why>" through opts.error and the next step goes on.
  async function apply(link, phase, steps, opts) {
    opts = opts || {};
    for (const s of steps) {
      const has = Array.isArray(s.key) ? s.key.some((k) => link[k] !== undefined) : s.key === '*' || link[s.key] !== undefined;
      if (!has) continue;
      try { await s.run(Array.isArray(s.key) ? undefined : link[s.key], link); }
      catch (e) { (opts.error || console.warn)('Link: ' + (s.key === '*' ? phase : (link[s.key] ? urlName(link[s.key]) : s.key)) + ': ' + (e && e.message || e)); }
    }
  }

  // ---------------------------------------------------------------- build
  // build a link from [[key, value], ...]; a value of true is key=1, false / undefined / '' are left out
  function build(pairs, base) {
    const q = [];
    for (const [k, v] of pairs) {
      if (v === undefined || v === null || v === false || v === '') continue;
      q.push(v === true ? k + '=1' : k + '=' + enc(String(v)));
    }
    return (base || location.href.replace(/[?#].*$/, '')) + (q.length ? '?' + q.join('&') : '');
  }

  window.RestLink = { yes, lowDir, urlName, resolve, enc, parse, pick, fetchFile, apply, build };
})();
