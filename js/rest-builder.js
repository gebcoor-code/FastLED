// REST API kit: the link builder — a panel of rows (a checkbox: the key goes into the link; its control), the link it
// makes, Copy and Open. From the REST API link window of Web Unreal Speccy. Needs rest.js. MIT License.
//
// RestBuilder.create(host, {
//   rows: [
//     { key: 'model', label: 'model', type: 'select', options: [['pentagon', 'Pentagon 128'], ...], on: true },
//     { key: 'speed', type: 'select', options: [['1', '3.5 MHz'], ['2', '7 MHz']] },
//     { key: 'fdd',   type: 'file', list: () => [['trd/game.trd', 'Game'], ...], prefix: [['a', 'A:'], ['b', 'B:']] },
//     { key: 'mute',  type: 'flag', title: 'sound off' },
//   ],
//   extra(q, val, on): more pairs or rules (q: [[key, value]], val(key), on(key)); return a note to show, or ''
//   current(): { key: value, ... } — the state of the running app (button "Current")
// }) → { el, update(), set(values), link() }
(function () {
  'use strict';
  function create(host, cfg) {
    const R = window.RestLink, el = document.createElement('div'), ctl = {}, chk = {}, pre = {};
    el.className = 'rb';
    const tbl = document.createElement('div'); tbl.className = 'rb-rows'; el.appendChild(tbl);
    const opt = (sel, list) => { sel.innerHTML = ''; for (const [v, n] of list) { const o = document.createElement('option'); o.value = v; o.textContent = n; sel.appendChild(o); } };
    for (const r of cfg.rows) {
      const row = document.createElement('label'); row.className = 'rb-row';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!r.on; chk[r.key] = c;
      const name = document.createElement('span'); name.className = 'rb-key'; name.textContent = r.label || r.key;
      row.append(c, name);
      if (r.title) row.title = r.title;
      if (r.prefix) { const p = document.createElement('select'); opt(p, r.prefix); pre[r.key] = p; row.appendChild(p); }
      let x = null;
      if (r.type === 'select') { x = document.createElement('select'); opt(x, r.options); if (r.value) x.value = r.value; }
      else if (r.type === 'file' || r.type === 'text') {
        x = document.createElement('input'); x.type = 'text'; x.placeholder = r.placeholder || (r.type === 'file' ? 'path, URL or brw:name' : '');
        if (r.list) { const dl = document.createElement('datalist'); dl.id = 'rb_' + r.key + '_' + Math.random().toString(36).slice(2, 7); x.setAttribute('list', dl.id); row.appendChild(dl); r._dl = dl; }
      }
      if (x) { ctl[r.key] = x; row.appendChild(x); x.addEventListener('input', () => { if (r.type !== 'flag') c.checked = true; update(); }); }
      c.addEventListener('change', update);
      if (pre[r.key]) pre[r.key].addEventListener('change', update);
      tbl.appendChild(row);
    }
    const out = document.createElement('input'); out.className = 'rb-out'; out.readOnly = true;
    const note = document.createElement('div'); note.className = 'rb-note';
    const bar = document.createElement('div'); bar.className = 'rb-bar';
    const bt = (t, f) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = f; bar.appendChild(b); return b; };
    if (cfg.current) bt('Current', () => api.set(cfg.current()));
    bt('Copy', async () => { try { await navigator.clipboard.writeText(out.value); } catch (e) { out.select(); document.execCommand('copy'); } });
    bt('Open', () => window.open(out.value, '_blank', 'noopener'));
    el.append(out, note, bar);
    host.appendChild(el);

    const on = (k) => !!(chk[k] && chk[k].checked);
    const val = (k) => (ctl[k] ? ctl[k].value.trim() : '');
    function update() {
      for (const r of cfg.rows) if (r._dl && r.list) opt(r._dl, r.list());
      const q = [];
      for (const r of cfg.rows) {
        if (!on(r.key) || r.manual) continue;
        if (r.type === 'flag') q.push([r.key, true]);
        else if (val(r.key)) q.push([r.key, (pre[r.key] ? pre[r.key].value + ':' : '') + val(r.key)]);
      }
      const n = cfg.extra ? cfg.extra(q, val, on) || '' : '';
      out.value = R.build(q, cfg.base);
      const brw = /[=:]brw:/i.test(out.value) ? 'brw: files are in this browser only: the link works here, not on another device' : '';
      note.textContent = [n, brw].filter(Boolean).join('; ');
    }
    const api = {
      el, update, link: () => out.value,
      set(v) { for (const [k, x] of Object.entries(v || {})) { if (!chk[k]) continue; chk[k].checked = x !== false && x !== undefined; if (ctl[k] && typeof x !== 'boolean') { const s = String(x), m = pre[k] && /^([a-z0-9]+):(?!\/\/)(.*)$/i.exec(s); if (m && [...pre[k].options].some((o) => o.value === m[1])) { pre[k].value = m[1]; ctl[k].value = m[2]; } else ctl[k].value = s; } } update(); },
    };
    update();
    return api;
  }
  window.RestBuilder = { create };
})();
