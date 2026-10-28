// Web FastLED — UI: projects (zip), editor tabs, themes, options, LED matrix window.
(function () {
  'use strict';
  const VERSION = '0.30.2';
  const BUILD = '20261028193402';
  const $ = (id) => document.getElementById(id);
  const load = (k) => { try { return localStorage.getItem('wfl.' + k); } catch (e) { return null; } };
  const store = (k, v) => { try { localStorage.setItem('wfl.' + k, v); } catch (e) {} };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let toastT = 0;
  function toast(msg, err) {
    const t = $('toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), err ? 4500 : 2600);
  }

  // ---------------------------------------------------------------- boards
  const BOARDS = [
    { id: 'nano', name: 'Arduino Nano', mcu: 'ATmega328P', mhz: 16, flash: 32768, boot: 2048, sram: 2048, eeprom: 1024 },
    { id: 'mega', name: 'Arduino Mega 2560', mcu: 'ATmega2560', mhz: 16, flash: 262144, boot: 8192, sram: 8192, eeprom: 4096 },
  ];
  const kb = (n) => (n >= 1024 ? (n / 1024) + ' KB' : n + ' B');
  let board = BOARDS.find((b) => b.id === load('board')) || BOARDS[0];
  let stripOrder = /^([RGB]{3}|auto)$/.test(load('order') || '') ? load('order') : 'auto'; // color order of strip on wire (Real CPU timing); auto: as sketch's addLeds
  let realOn = load('realcpu') === '1', realRun = false, ui3dRef = null; // Real CPU timing (see setReal); realRun: running sketch is real one
  // debugger (Real CPU timing): line table module, map of running build, last halt state, RAM of halt before it
  let runMsgT = 0, hungNote = false; // last message of runner (hang of WebAssembly sketch)
  let dbgMod = null, lineMap = null, dbgSt = null, dbgPrev = null, dbgMemAddr = 0x100, dbgExec = null;
  // USB: port of board, upload running, Serial monitor link of board (see upload)
  let usbPort = null, upBusy = false, upPct = -1, upMod = null, boardLink = null;
  // real build for board (avr-gcc worker), see avrBuild
  let avr = null, avrState = 'none', avrPct = 0, avrSeq = 0, avrBusy = false, avrLast = null;
  const avrWait = new Map();
  let nanoCpu = load('nanocpu') === 'atmega328old' ? 'atmega328old' : 'atmega328';
  function buildBoards() {
    const box = $('boards'); box.innerHTML = '';
    for (const b of BOARDS) {
      const l = document.createElement('label'); l.className = 'board' + (b === board ? ' on' : '');
      l.innerHTML = `<input type="radio" name="board" value="${b.id}"${b === board ? ' checked' : ''}><b>${esc(b.name)}</b>` +
        `<span>${b.mcu} · ${b.mhz} MHz · Flash ${kb(b.flash)} (${kb(b.flash - b.boot)} for the sketch) · SRAM ${kb(b.sram)} · EEPROM ${kb(b.eeprom)}</span>`;
      l.querySelector('input').onchange = () => setBoard(b);
      box.appendChild(l);
    }
    $('boardsel').value = board.id;
    $('aboutboards').innerHTML = BOARDS.map((b) => `<tr><td>${esc(b.name)}</td><td>${b.mcu}, ${b.mhz} MHz, ${kb(b.flash)} flash, ${kb(b.sram)} SRAM</td></tr>`).join('');
  }
  function setBoard(b) {
    if (b === board) return;
    board = b; store('board', b.id); buildBoards(); statusUI();
    if (running) { stop(); toast('Board changed: ' + b.name + ' — stopped'); } else toast('Board: ' + b.name + ' (' + b.mcu + ')');
    inputsUI();
  }

  // ---------------------------------------------------------------- themes
  const mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const DARK_THEMES = ['dark-plus', 'monokai', 'solarized-dark', 'hc-dark'];
  let themeSel = load('theme') || 'auto';
  const resolveTheme = () => (themeSel === 'auto' ? (mqDark && !mqDark.matches ? 'light-plus' : 'dark-plus') : themeSel);
  function applyTheme() {
    document.documentElement.dataset.theme = resolveTheme();
    $('optheme').value = themeSel;
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--title');
    ledDirty = true;
  }
  if (mqDark) mqDark.addEventListener('change', () => { if (themeSel === 'auto') applyTheme(); });

  // ---------------------------------------------------------------- floating windows (from Web Unreal Speccy)
  const WINS = []; let actWin = null;
  function activateWin(w) {
    if (actWin === w) return;
    if (actWin) actWin.classList.remove('wact');
    actWin = w || null; if (!w) return;
    w.classList.add('wact');
    WINS.splice(WINS.indexOf(w), 1); WINS.push(w);
    WINS.forEach((x, k) => { x.style.zIndex = String(20 + k); });
  }
  const topVisibleWin = () => { for (let k = WINS.length - 1; k >= 0; k--) if (!WINS[k].hidden) return WINS[k]; return null; };
  const winOf = (t) => (t && t.nodeType === 1 ? WINS.find((w) => w.contains(t)) : null) || null;
  document.addEventListener('pointerdown', (e) => activateWin(winOf(e.target)), true);
  document.addEventListener('focusin', (e) => { const w = winOf(e.target); if (w) activateWin(w); }, true);
  const winObs = new MutationObserver((ms) => {
    for (const m of ms) {
      const w = m.target;
      if (!w.hidden) activateWin(w);
      else if (actWin === w) { w.classList.remove('wact'); actWin = null; activateWin(topVisibleWin()); }
    }
  });
  function registerWin(w) {
    if (WINS.includes(w)) return;
    WINS.push(w); winObs.observe(w, { attributes: true, attributeFilter: ['hidden'] });
    if (!w.hidden) activateWin(w);
  }
  // drag by title (mouse or finger), position remembered; double click on title — back to default place
  function floatWin(win, key, defPos) {
    registerWin(win);
    const head = win.querySelector('.fhead');
    let pos = null;
    try { const p = JSON.parse(load(key)); if (p && isFinite(p.x) && isFinite(p.y)) pos = p; } catch (e) {}
    function place() {
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      let { x, y } = pos || defPos();
      x = Math.max(0, Math.min(x, vw - Math.min(win.offsetWidth, 120)));
      y = Math.max(0, Math.min(y, vh - 32));
      win.style.left = x + 'px'; win.style.top = y + 'px';
    }
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, select, input, label')) return;
      const r = win.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      head.setPointerCapture(e.pointerId); e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      pos = { x: e.clientX - drag.dx, y: e.clientY - drag.dy }; place();
    });
    const end = () => { if (!drag) return; drag = null; store(key, JSON.stringify(pos)); };
    head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
    head.addEventListener('dblclick', (e) => { if (e.target.closest('button, select, input, label')) return; pos = null; store(key, ''); place(); });
    window.addEventListener('resize', () => { if (!win.hidden) place(); });
    new MutationObserver(() => { if (!win.hidden) place(); }).observe(win, { attributes: true, attributeFilter: ['hidden'] });
    win.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => { win.hidden = true; }; });
    return { place, setPos(p) { pos = p; store(key, JSON.stringify(pos)); place(); } };
  }
  // resize by edges / corners (.rz[data-rz]); size remembered
  function resizable(win, key, minW, minH, onResize) {
    try { const s = JSON.parse(load(key)); if (s && s.w > 0 && s.h > 0) { win.style.width = s.w + 'px'; win.style.height = s.h + 'px'; } } catch (e) {}
    win.querySelectorAll('.rz').forEach((h) => {
      let st = null;
      h.addEventListener('pointerdown', (e) => {
        const r = win.getBoundingClientRect();
        st = { x: e.clientX, y: e.clientY, r, d: h.dataset.rz, id: e.pointerId };
        h.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation();
      });
      h.addEventListener('pointermove', (e) => {
        if (!st || e.pointerId !== st.id) return;
        const dx = e.clientX - st.x, dy = e.clientY - st.y, d = st.d, r = st.r;
        let { left, top, width, height } = r;
        const mw = typeof minW === 'function' ? minW() : minW, mh = typeof minH === 'function' ? minH() : minH;
        if (d.includes('e')) width = Math.max(mw, r.width + dx);
        if (d.includes('s')) height = Math.max(mh, r.height + dy);
        if (d.includes('w')) { width = Math.max(mw, r.width - dx); left = r.right - width; }
        if (d.includes('n')) { height = Math.max(mh, r.height - dy); top = r.bottom - height; }
        win.style.width = width + 'px'; win.style.height = height + 'px';
        win.style.left = Math.max(0, left) + 'px'; win.style.top = Math.max(0, top) + 'px';
        if (onResize) onResize();
      });
      const end = () => {
        if (!st) return; st = null;
        const r = win.getBoundingClientRect();
        store(key, JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }));
        store(key + 'pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
      };
      h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    });
  }
  const centerPos = (w) => () => ({ x: (document.documentElement.clientWidth - w.offsetWidth) / 2, y: Math.max(40, (window.innerHeight - w.offsetHeight) / 3) });

  // ---------------------------------------------------------------- text files: encoding / line endings
  let cp1251Enc = null;
  function encode1251(text) {
    if (!cp1251Enc) {
      cp1251Enc = new Map();
      const dec = new TextDecoder('windows-1251'), b = new Uint8Array(1);
      for (let i = 128; i < 256; i++) { b[0] = i; cp1251Enc.set(dec.decode(b), i); }
    }
    const out = new Uint8Array(text.length); let bad = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 128) out[i] = c;
      else { const v = cp1251Enc.get(text[i]); if (v === undefined) { out[i] = 63; bad++; } else out[i] = v; }
    }
    return { bytes: out, bad };
  }
  function isBinary(b) {
    const n = Math.min(b.length, 8192);
    for (let i = 0; i < n; i++) if (b[i] === 0) return true;
    return false;
  }
  function decodeText(b) {
    let bom = false, enc = 'utf-8', s;
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) { bom = true; b = b.subarray(3); }
    try { s = new TextDecoder('utf-8', { fatal: true }).decode(b); }
    catch (e) { enc = 'windows-1251'; s = new TextDecoder('windows-1251').decode(b); }
    const crlf = (s.match(/\r\n/g) || []).length, lf = (s.match(/\n/g) || []).length - crlf;
    const eol = crlf > lf ? '\r\n' : '\n';
    return { text: s.replace(/\r\n?/g, '\n'), enc, bom, eol };
  }
  function encodeText(f, text) {
    const t = f.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
    if (f.enc === 'windows-1251') return encode1251(t);
    const u = new TextEncoder().encode(t);
    if (!f.bom) return { bytes: u, bad: 0 };
    const o = new Uint8Array(u.length + 3); o.set([0xEF, 0xBB, 0xBF]); o.set(u, 3);
    return { bytes: o, bad: 0 };
  }

  // ---------------------------------------------------------------- project
  const SRC_EXT = ['ino', 'h', 'hpp', 'hh', 'c', 'cpp', 'cc', 'cxx', 's', 'S'];
  const TEXT_EXT = ['txt', 'md', 'json', 'ini', 'cfg', 'csv', 'properties', 'yml', 'yaml'];
  const extOf = (n) => { const m = /\.([^./\\]+)$/.exec(n); return m ? m[1] : ''; };
  const baseName = (p) => p.replace(/^.*[\\/]/, '');
  let project = null; // { name, prefix, files: [...], active }
  let fileSeq = 0;
  const ed = FLEditor.create($('editor'), { onChange: onEdit, onCursor: cursorUI, onBreakpoint: () => bpSend() });

  function mkFile(path, bytes) {
    const name = baseName(path), ext = extOf(name), lx = ext.toLowerCase();
    const f = { id: 'f' + (++fileSeq), path, name, ext: lx, orig: bytes, kind: 'bin' };
    if (SRC_EXT.includes(ext) || SRC_EXT.includes(lx) || ((TEXT_EXT.includes(lx) || !lx) && !isBinary(bytes))) {
      if (!isBinary(bytes)) {
        Object.assign(f, decodeText(bytes));
        f.kind = SRC_EXT.includes(lx) || ext === 'S' ? 'src' : 'text';
        f.base = f.text; f.mod = false;
      }
    }
    return f;
  }
  function sortFiles(files, projName) {
    const inos = files.filter((f) => f.ext === 'ino');
    const stem = (n) => n.replace(/\.[^.]*$/, '').toLowerCase();
    let main = inos.find((f) => stem(f.name) === (projName || '').toLowerCase()) ||
      inos.find((f) => /\bvoid\s+setup\s*\(/.test(f.text) && /\bvoid\s+loop\s*\(/.test(f.text)) || inos[0] ||
      files.filter((f) => f.ext === 'c').sort((a, b) => a.name.localeCompare(b.name))[0] || null; // .c sketch
    const cmp = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    const src = files.filter((f) => f.kind === 'src' && f !== main).sort(cmp);
    const txt = files.filter((f) => f.kind === 'text').sort(cmp);
    const bin = files.filter((f) => f.kind === 'bin');
    files.forEach((f) => { f.main = f === main; });
    return (main ? [main] : []).concat(src, txt, bin);
  }
  function openProject(name, files, opts) {
    opts = opts || {};
    if (running) stop();
    ed.clear();
    lastBuild = null; ledPin = null; sizeOverride = null; pinCtl.clear(); knownFixes = [];
    setTimeout(ensureCompiler, 400); // compiler loads in background (first time: download of about 26 MB)
    // common folder of all files ("Sketch/Sketch.ino" → prefix "Sketch/")
    let prefix = '';
    const paths = files.map((f) => f.path);
    const m = /^(.*[\\/])/.exec(paths[0] || '');
    if (m && paths.every((p) => p.startsWith(m[1]))) prefix = m[1];
    const folder = prefix.replace(/[\\/]+$/, '').replace(/^.*[\\/]/, '');
    const sorted = sortFiles(files.slice(), folder || name); // marks main .ino
    if (!opts.keepOrder) files = sorted;
    project = { name: name || folder || 'sketch', prefix, files, active: null };
    for (const f of files) if (f.kind !== 'bin') ed.add(f.id, f.text, f.kind === 'src' ? 'c' : 'text');
    $('welcome').hidden = true; $('editor').hidden = false;
    buildTabs(); showDiagnostics([], []); setTimeout(() => { if ($('gsearch').value) runSearch(false); }, 0);
    const act = (opts.active && files.find((f) => f.path === opts.active)) || files.find((f) => f.kind !== 'bin');
    if (act) showFile(act);
    projectUI();
    if (!opts.restored) {
      const n = files.filter((f) => f.kind !== 'bin').length, nb = files.length - n;
      toast(`${project.name}: ${n} file${n === 1 ? '' : 's'}` + (nb ? ` (+${nb} other kept in archive)` : ''));
      if (cSketch() && (cOpts.pattern || cOpts.names)) prepareC().then(() => sketchLayout(true)); else sketchLayout(true);
    }
    saveSession();
  }
  function newSketch() {
    if (!confirmDiscard()) return;
    const text = TEMPLATE.replace(/\n/g, '\r\n');
    const f = mkFile('sketch/sketch.ino', new TextEncoder().encode(text));
    openProject('sketch', [f]);
  }
  function addFiles(list) { // loose .ino / .h files: into open project (new one if none)
    if (!project) { const ino = list.find((x) => x.ext === 'ino') || list.find((x) => x.ext === 'c') || list[0]; openProject(ino ? ino.name.replace(/\.[^.]*$/, '') : 'sketch', list); return; }
    for (const f of list) {
      f.path = project.prefix + f.name;
      const old = project.files.find((x) => x.name.toLowerCase() === f.name.toLowerCase());
      if (old && old.kind !== 'bin') {
        ed.remove(old.id);
        old.text = f.text; old.enc = f.enc; old.eol = f.eol; old.bom = f.bom;
        ed.add(old.id, f.text, old.kind === 'src' ? 'c' : 'text');
        old.mod = old.text !== old.base;
        if (project.active === old) { project.active = null; showFile(old); }
      } else {
        f.base = null; f.mod = true; // not in saved archive yet
        project.files.push(f);
        if (f.kind !== 'bin') ed.add(f.id, f.text, f.kind === 'src' ? 'c' : 'text');
      }
    }
    sortFiles(project.files.slice(), project.name); // main .ino; new files go to end
    buildTabs(); projectUI(); saveSession();
    toast(list.length === 1 ? list[0].name + ' added to project' : list.length + ' files added to project');
  }
  const modified = () => !!project && project.files.some((f) => f.mod);
  function confirmDiscard() {
    if (!modified()) return true;
    // only changes made on loading (.c sketch: names, pattern.c) — nothing of user's to lose
    if (project.files.every((f) => !f.mod || (f.auto != null && f.kind !== 'bin' && ed.text(f.id) === f.auto))) return true;
    return window.confirm('Project "' + project.name + '" has unsaved changes. Discard them?');
  }

  async function loadFiles(fl) {
    fl = Array.from(fl || []); if (!fl.length) return;
    try {
      const zips = fl.filter((f) => /\.zip$/i.test(f.name));
      if (zips.length) {
        if (!confirmDiscard()) return;
        const z = zips[0], b = new Uint8Array(await z.arrayBuffer());
        if (!FLZip.isZip(b)) throw new Error(z.name + ': not ZIP archive');
        const files = [];
        for (const e of FLZip.list(b)) {
          if (/(^|\/)__MACOSX\//.test(e.name) || /(^|\/)\.DS_Store$/.test(e.name)) continue;
          files.push(mkFile(e.name, await FLZip.extract(b, e)));
        }
        if (!files.some((f) => f.kind !== 'bin')) throw new Error(z.name + ': no source files in archive');
        openProject(z.name.replace(/\.zip$/i, ''), files);
        return;
      }
      const list = [];
      for (const f of fl) {
        const x = mkFile(f.name, new Uint8Array(await f.arrayBuffer()));
        if (x.kind === 'bin') { toast(f.name + ': not text file', true); continue; }
        list.push(x);
      }
      // .c sketch file(s) (draw(), no .ino): new project of its own, not addition to open one
      if (list.length && list.every((x) => x.ext === 'c' || x.ext === 'h') && list.some((x) => x.ext === 'c' && /\bdraw\s*\(/.test(x.text))) {
        if (!confirmDiscard()) return;
        const c = list.find((x) => x.ext === 'c');
        project = null; openProject(c.name.replace(/\.c$/i, ''), list); return;
      }
      if (list.length) addFiles(list);
    } catch (e) { toast(String(e.message || e), true); }
  }

  // ---------------------------------------------------------------- Load menu: local file, library (repo/index.json next to index.html)
  // index.json: { "items": [ { "file": "Some.zip", "name": "Some effect", "board": "nano" }, ... ] } or [ "a.zip", "b.c", ... ];
  // file is path inside repo/ (.zip project, .c sketch, .ino), name is what menu shows, board (nano / mega) is optional
  const REPO = 'repo/';
  let libItems = null;
  async function libLoadList() {
    let j = null;
    try { const r = await fetch(REPO + 'index.json', { cache: 'no-cache' }); if (r.ok) j = await r.json(); } catch (e) { j = null; }
    const list = Array.isArray(j) ? j : (j && Array.isArray(j.items) ? j.items : []);
    libItems = [];
    for (const it of list) {
      const file = typeof it === 'string' ? it : it && (it.file || it.url);
      if (!file || typeof file !== 'string') continue;
      const base = file.replace(/^.*\//, '');
      libItems.push({ file, name: (typeof it === 'object' && it.name) || base.replace(/\.[^.]*$/, ''), board: typeof it === 'object' && it.board ? String(it.board).toLowerCase() : '',
        ext: (/\.([^./]+)$/.exec(base) || ['', ''])[1].toLowerCase() });
    }
    libUI();
  }
  function libUI() {
    const box = $('liblist'), q = $('libfilter').value.trim().toLowerCase();
    box.innerHTML = '';
    $('libfilter').hidden = !libItems || libItems.length < 10;
    if (!libItems) { box.innerHTML = '<div class="mnote">Reading…</div>'; return; }
    if (!libItems.length) { box.innerHTML = '<div class="mnote">Library is empty (repo/index.json)</div>'; return; }
    let n = 0;
    for (const it of libItems) {
      if (q && !(it.name + ' ' + it.file).toLowerCase().includes(q)) continue;
      const b = document.createElement('button');
      b.className = 'mi'; b.title = it.file + (it.board ? ' · ' + it.board : '');
      b.innerHTML = '<span class="mn"></span><span class="mt"></span>';
      b.firstChild.textContent = it.name; b.lastChild.textContent = it.ext === 'zip' ? 'ZIP' : it.ext.toUpperCase();
      b.onclick = () => { $('loadpop').hidden = true; libLoad(it); };
      box.appendChild(b); n++;
    }
    if (!n) box.innerHTML = '<div class="mnote">Nothing found</div>';
  }
  async function libLoad(it) {
    const base = it.file.replace(/^.*\//, '');
    if (it.ext !== 'zip' && !confirmDiscard()) return;
    let buf;
    try {
      const r = await fetch(REPO + it.file.split('/').map(encodeURIComponent).join('/'), { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status === 404 ? 'not found (404)' : 'HTTP ' + r.status);
      buf = new Uint8Array(await r.arrayBuffer());
    } catch (e) { toast(base + ': ' + e.message, true); return; }
    const b = BOARDS.find((x) => x.id === it.board);
    if (it.ext === 'zip') {
      const was = project;
      await loadFiles([new File([buf], base)]);
      if (b && project !== was) setBoard(b);
      return;
    }
    const x = mkFile(base, buf);
    if (x.kind === 'bin') { toast(base + ': not text file', true); return; }
    if (b) setBoard(b);
    project = null; openProject(base.replace(/\.[^.]*$/, ''), [x]);
  }
  function loadMenu(anchor) {
    const pop = $('loadpop');
    if (!pop.hidden) { pop.hidden = true; return; }
    libItems = null; $('libfilter').value = ''; libUI();
    popup(pop, anchor || $('loadbtn'));
    libLoadList().then(() => { if (!pop.hidden) popup(pop, anchor || $('loadbtn'), true); });
  }

  async function saveProject() {
    if (!project) return;
    let bad = 0;
    const out = project.files.map((f) => {
      if (f.kind === 'bin' || !f.mod) return { name: f.path, data: f.orig, f };
      const r = encodeText(f, ed.text(f.id)); bad += r.bad;
      return { name: f.path, data: r.bytes, f };
    });
    const blob = await FLZip.create(out.map((x) => ({ name: x.name, data: x.data })));
    download(blob, project.name + '.zip');
    for (const x of out) if (x.f.kind !== 'bin') { x.f.orig = x.data; x.f.base = ed.text(x.f.id); x.f.mod = false; }
    buildTabs(); projectUI(); saveSession();
    toast('Saved ' + project.name + '.zip' + (bad ? ` — ${bad} character(s) not in Windows-1251 written as "?"` : ''), bad > 0);
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // ---------------------------------------------------------------- tabs
  function tabLabel(f) {
    const cls = f.ext === 'ino' ? '' : (['h', 'hpp', 'hh'].includes(f.ext) ? 'h' : (f.kind === 'text' ? 'txt' : 'c'));
    const ext = f.kind === 'text' ? (f.ext || 'txt') : f.ext;
    return `<span class="ext ${cls}">${esc(ext.toUpperCase())}</span><span class="mod">${f.mod ? '*' : ''}</span><span class="nm">${esc(f.name)}</span><span class="tx" title="Remove from project">×</span>`;
  }
  // × on tab: file leaves project (after confirmation); last file closes project — start screen as on first load
  function removeFile(f) {
    if (!project) return;
    const left = project.files.filter((x) => x !== f && x.kind !== 'bin');
    const msg = left.length ? `Remove "${f.name}" from project?` + (f.mod ? ' Unsaved changes will be lost.' : '')
      : `Remove "${f.name}"? The project will be closed. Unsaved changes will be lost.`;
    askOk(msg).then((ok) => { if (ok) doRemove(f, left); });
  }
  // small confirm window of page (OK has focus: Enter confirms, Esc cancels)
  function askOk(msg) {
    return new Promise((res) => {
      const d = $('askwin'); $('askmsg').textContent = msg; d.hidden = false;
      const done = (v) => { d.hidden = true; document.removeEventListener('keydown', key, true); res(v); };
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
      $('askok').onclick = () => done(true); $('askno').onclick = () => done(false);
      document.addEventListener('keydown', key, true);
      setTimeout(() => $('askok').focus(), 0);
    });
  }
  function doRemove(f, left) {
    if (!left.length) { closeProject(); return; }
    if (running) stop();
    const i = project.files.indexOf(f);
    project.files.splice(i, 1); ed.remove(f.id); f.tab = null;
    if (f.main) sortFiles(project.files, project.name); // other file becomes main (order of tabs stays)
    lastBuild = null; knownFixes = [];
    const act = project.active === f ? (left.find((x) => project.files.indexOf(x) >= i) || left[left.length - 1]) : project.active;
    project.active = null;
    buildTabs(); showDiagnostics([], []);
    showFile(act); projectUI(); saveSession();
  }
  function closeProject() {
    if (running) stop();
    ed.clear(); project = null; lastBuild = null; knownFixes = []; sizeOverride = null;
    buildTabs(); showDiagnostics([], []);
    $('welcome').hidden = false; $('editor').hidden = true;
    projectUI(); fileUI(); saveSession();
  }
  let dragTab = null;
  function buildTabs() {
    const box = $('tabs'); box.innerHTML = '';
    if (!project) return;
    for (const f of project.files) {
      if (f.kind === 'bin') continue;
      const t = document.createElement('div');
      t.className = 'tab' + (f === project.active ? ' on' : '') + (f.main ? ' main' : '');
      t.setAttribute('role', 'tab'); t.dataset.id = f.id;
      t.title = `${f.path}\n${f.main ? 'main sketch · ' : ''}${f.enc === 'windows-1251' ? 'Windows-1251' : 'UTF-8' + (f.bom ? ' BOM' : '')} · ${f.eol === '\r\n' ? 'CRLF' : 'LF'} · ${f.orig.length} bytes`;
      t.innerHTML = tabLabel(f);
      t.onclick = (e) => { if (e.target.closest('.tx')) { e.stopPropagation(); removeFile(f); return; } showFile(f); };
      // tabs can be dragged to another place (order is kept in session; build order of .ino stays Arduino's)
      t.draggable = true;
      t.addEventListener('dragstart', (e) => { dragTab = f; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-wfl-tab', f.id); t.classList.add('dragging'); });
      t.addEventListener('dragend', () => { dragTab = null; t.classList.remove('dragging'); box.querySelectorAll('.tab').forEach((x) => x.classList.remove('dropl', 'dropr')); });
      t.addEventListener('dragover', (e) => {
        if (!dragTab || dragTab === f) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        const r = t.getBoundingClientRect(), right = e.clientX > r.left + r.width / 2;
        box.querySelectorAll('.tab').forEach((x) => x.classList.remove('dropl', 'dropr'));
        t.classList.add(right ? 'dropr' : 'dropl');
      });
      t.addEventListener('drop', (e) => {
        if (!dragTab || dragTab === f) return;
        e.preventDefault(); e.stopPropagation();
        const r = t.getBoundingClientRect(), right = e.clientX > r.left + r.width / 2;
        const list = project.files.filter((x) => x !== dragTab);
        list.splice(list.indexOf(f) + (right ? 1 : 0), 0, dragTab);
        project.files = list; dragTab = null;
        buildTabs(); saveSession();
      });
      f.tab = t; box.appendChild(t);
    }
  }
  function showFile(f) {
    if (!project || f.kind === 'bin') return;
    if (project.active === f) { ed.focus(); return; }
    project.active = f;
    for (const x of project.files) if (x.tab) x.tab.classList.toggle('on', x === f);
    ed.show(f.id);
    if (f.tab) f.tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    fileUI(); ed.focus(); saveSessionSoon();
  }
  function onEdit(id) {
    const f = project && project.files.find((x) => x.id === id); if (!f) return;
    const m = f.base == null || ed.text(id) !== f.base;
    if (m !== f.mod) { f.mod = m; if (f.tab) f.tab.querySelector('.mod').textContent = m ? '*' : ''; projectUI(); }
    saveSessionSoon();
  }

  // ---------------------------------------------------------------- status / toolbar state
  function projectUI() {
    const has = !!project;
    $('savebtn').disabled = !has; $('getwh').disabled = !has; $('hexbtn').disabled = !has; $('uploadbtn').disabled = !has || upBusy;
    $('projname').textContent = has ? (modified() ? '● ' : '') + project.name : '';
    document.title = has ? (modified() ? '● ' : '') + project.name + ' — Web FastLED' : 'Web FastLED';
    buildUI();
  }
  function statusUI() {
    const st = $('status');
    st.classList.toggle('empty', !project); st.classList.toggle('run', running);
    $('stboardname').textContent = board.name;
    let rs;
    if (building) rs = compilerState === 'loading' ? `⟳ Loading compiler ${compilerPct}%` : '⟳ Compiling…';
    else if (running && catchUp) rs = `⟳ Catching up ${Math.floor(100 * catchUp.t / (catchUp.to || 1))}% (${fmtTime(catchUp.to)})`;
    else if (running && dbgSt) { const l = dbgSt.loc || dbgSt.frames.map((f, i) => frameLine(f, i)).find(Boolean); rs = `⏸ Stopped (${dbgSt.reason})` + (l ? ` at ${l.file}:${l.line}` : ''); }
    else if (running) rs = (paused ? '⏸ Paused' : '▶ Running') + (!realOn && simSpeed !== 1 ? ' ' + fmtX(simSpeed) : '') + (runStats && !paused ? (runStats.loops >= 0 ? ` · ${runStats.loops} loop/s` : '') + ` · ${runStats.fps} ${runStats.rate != null ? 'frames' : 'show'}/s` + (runStats.rate != null && runStats.rate < 97 ? ` · ${runStats.rate}% speed` : '') : '');
    else rs = project ? '■ Stopped' : 'No project';
    $('strunt').textContent = rs;
    $('stmsg').textContent = upBusy && upPct >= 0 ? `Uploading ${upPct}%` : avrBusy ? (avrState === 'loading' ? `Loading avr-gcc ${avrPct}%` : 'avr-gcc: building…') : !building && compilerState === 'loading' ? `Loading compiler ${compilerPct}%` : '';
    fileUI();
  }
  function fileUI() {
    const f = project && project.active;
    $('sttab').textContent = f ? 'Spaces: ' + edOpts.tabSize : '';
    $('stenc').textContent = f ? (f.enc === 'windows-1251' ? 'Windows 1251' : 'UTF-8' + (f.bom ? ' with BOM' : '')) : '';
    $('steol').textContent = f ? (f.eol === '\r\n' ? 'CRLF' : 'LF') : '';
    $('stlang').textContent = f ? (f.kind === 'src' ? (f.ext === 'ino' ? 'Arduino (C++)' : 'C++') : 'Plain Text') : '';
    if (!f) $('stpos').textContent = '';
  }
  function cursorUI(c) {
    $('stpos').textContent = `Ln ${c.line}, Col ${c.col}` + (c.sel ? ` (${c.sel} selected)` : '');
  }

  // ---------------------------------------------------------------- session (IndexedDB)
  const DB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        let r; try { r = indexedDB.open('webfastled', 1); } catch (e) { rej(e); return; }
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async get(k) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async put(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async del(k) { const db = await this.open(); return new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = res; }); },
  };
  let sessT = 0;
  function saveSessionSoon() { clearTimeout(sessT); sessT = setTimeout(saveSession, 700); }
  function saveSession() {
    clearTimeout(sessT);
    if (!edOpts.keep) return;
    if (!project) { DB.del('session').catch(() => {}); return; }
    const s = {
      v: 1, name: project.name, active: project.active && project.active.path, ordered: true,
      files: project.files.map((f) => ({ path: f.path, orig: f.orig, mod: f.mod, isNew: f.base == null, text: f.kind !== 'bin' && f.mod ? ed.text(f.id) : null })),
    };
    DB.put('session', s).catch(() => {});
  }
  async function restoreSession() {
    if (!edOpts.keep) return false;
    let s; try { s = await DB.get('session'); } catch (e) { return false; }
    if (!s || !s.files || !s.files.length) return false;
    const files = s.files.map((x) => {
      const f = mkFile(x.path, x.orig);
      if (x.isNew) f.base = null;
      if (x.text != null && f.kind !== 'bin') { f.text = x.text; f.mod = true; }
      return f;
    });
    openProject(s.name, files, { restored: true, active: s.active, keepOrder: !!s.ordered });
    projectUI();
    toast('Session restored: ' + s.name + (modified() ? ' (unsaved changes)' : ''));
    return true;
  }

  // ---------------------------------------------------------------- editor options
  const edOpts = Object.assign({ theme: 'auto', font: '', size: 14, tabSize: 2, lineNumbers: true, wrap: false, activeLine: true, whitespace: false, closeBrackets: true, keep: true },
    (() => { try { return JSON.parse(load('editor')) || {}; } catch (e) { return {}; } })());
  function applyEdOpts() {
    const r = document.documentElement.style;
    r.setProperty('--ed-font-size', edOpts.size + 'px');
    if (edOpts.font) r.setProperty('--ed-font', edOpts.font);
    ed.setOptions({ lineNumbers: edOpts.lineNumbers, wrap: edOpts.wrap, tabSize: edOpts.tabSize, whitespace: edOpts.whitespace, closeBrackets: edOpts.closeBrackets, activeLine: edOpts.activeLine });
    ed.refresh(); fileUI();
  }
  function bindOptions() {
    const w = $('options');
    floatWin(w, 'optpos', centerPos(w));
    w.querySelectorAll('.tabs button').forEach((b) => {
      b.onclick = () => {
        w.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
        w.querySelectorAll('.pane').forEach((p) => p.classList.toggle('gone', p.dataset.pane !== b.dataset.tab));
        store('opttab', b.dataset.tab);
      };
    });
    const t = load('opttab'); if (t) { const b = w.querySelector(`.tabs button[data-tab="${t}"]`); if (b) b.click(); }
    const saveO = () => { store('editor', JSON.stringify(edOpts)); applyEdOpts(); };
    $('optheme').onchange = () => { themeSel = $('optheme').value; store('theme', themeSel); applyTheme(); };
    const fs = $('opfont'); if (edOpts.font) fs.value = edOpts.font; if (fs.selectedIndex < 0) fs.selectedIndex = 0;
    fs.onchange = () => { edOpts.font = fs.value; saveO(); };
    const sz = $('opsize'); sz.value = edOpts.size; $('opsizev').textContent = edOpts.size;
    sz.oninput = () => { edOpts.size = +sz.value; $('opsizev').textContent = sz.value; saveO(); };
    $('optab').value = String(edOpts.tabSize); $('optab').onchange = () => { edOpts.tabSize = +$('optab').value; saveO(); };
    const chk = { oplines: 'lineNumbers', opwrap: 'wrap', opact: 'activeLine', opws: 'whitespace', opbr: 'closeBrackets', opauto: 'keep' };
    for (const [id, k] of Object.entries(chk)) {
      $(id).checked = !!edOpts[k];
      $(id).onchange = () => { edOpts[k] = $(id).checked; saveO(); if (k === 'keep') { if (edOpts.keep) saveSession(); else DB.del('session').catch(() => {}); } };
    }
    const os = $('opopt');
    for (const [k, v] of Object.entries(OPTS)) { const o = document.createElement('option'); o.value = k; o.textContent = v; os.appendChild(o); }
    os.value = optLevel;
    os.onchange = () => { optLevel = os.value; store('opt', optLevel); };
    $('opcpat').checked = cOpts.pattern; $('opcpat').onchange = () => { cOpts.pattern = $('opcpat').checked; store('cpattern', cOpts.pattern ? '1' : '0'); };
    setCatch(catchOn); $('opcatch').onchange = () => setCatch($('opcatch').checked); $('catchbtn').onclick = () => setCatch(!catchOn);
    $('oppower').checked = powerOn; $('oppower').onchange = () => { powerOn = $('oppower').checked; store('power', powerOn ? '1' : '0'); };
    $('opsizeload').checked = sizeOnLoad; $('opsizeload').onchange = () => { sizeOnLoad = $('opsizeload').checked; store('sizeload', sizeOnLoad ? '1' : '0'); };
    $('opstdlib').checked = stdlibOn; $('opstdlib').onchange = () => { stdlibOn = $('opstdlib').checked; store('stdlib', stdlibOn ? '1' : '0'); };
    $('opcnames').checked = cOpts.names; $('opcnames').onchange = () => { cOpts.names = $('opcnames').checked; store('cnames', cOpts.names ? '1' : '0'); };
    $('aboutv').textContent = VERSION; $('aboutver').title = BUILD !== 'dev' ? 'build ' + BUILD : 'dev build';
    $('changeslink').onclick = (e) => { e.preventDefault(); showChanges(); };
    $('licenselink').onclick = (e) => { e.preventDefault(); showText('LICENSE', 'License'); };
  }
  function showOptions(tab) {
    const w = $('options');
    if (tab) { const b = w.querySelector(`.tabs button[data-tab="${tab}"]`); if (b) b.click(); }
    w.hidden = false;
    // all tabs have height of Board tab; longer ones scroll
    const body = w.querySelector('.body'), panes = [...w.querySelectorAll('.pane')], cur = panes.find((p) => !p.classList.contains('gone'));
    panes.forEach((p) => p.classList.toggle('gone', p.dataset.pane !== 'board'));
    body.style.height = ''; body.style.height = body.offsetHeight + 'px';
    panes.forEach((p) => p.classList.toggle('gone', p !== cur));
  }

  // ---------------------------------------------------------------- LED matrix window
  const DIRS = { 0: [0, 1], 1: [0, 3], 2: [2, 3], 3: [2, 1] }; // valid STRIP_DIRECTION for each CONNECTION_ANGLE
  const DIRNAME = ['right', 'up', 'left', 'down'];
  const led = Object.assign({ w: 24, h: 12, type: 0, angle: 2, dir: 3, grid: true, gam: 1, coords: false }, (() => { try { return JSON.parse(load('led')) || {}; } catch (e) { return {}; } })());
  delete led.disp;
  if (led.gamv !== 2) { led.gam = 2; led.gamv = 2; } // 0.3.7: default +100%
  if (!(led.gam >= 0 && led.gam <= 3)) led.gam = 2;
  if (!(led.con >= 0 && led.con <= 1)) led.con = 0; // 0.4.3: contrast, default 0%
  delete led.scale;
  let ledBuf = new Uint8Array(0), ledMap = null, ledDirty = true, ledCell = 16, view3d = null;
  const v3on = () => !!(led.v3d && view3d && !realOn); // 3D view shown (not with Real CPU timing)
  let sizeOverride = null; // { w, h, names: [[name, value]...] } — WIDTH / HEIGHT given to build instead of sketch's
  // LED values are linear light (PWM duty); monitor expects sRGB: without conversion dim colors look much darker than on real LEDs
  // Options → LED → Dim colors: 0 = raw values, 1 = linear light → sRGB (LED-like), 2 = +100% (default), 3 = +200%.
  // Curve is applied to brightest channel of pixel; other channels keep their ratio to it in linear light,
  // so lifted dim colors stay saturated (per-channel lift made them greyish). Contrast: power 1 + c of curve's output (dark go darker, full stays full).
  const LUT = new Uint8Array(256);
  const GAIN = new Float32Array(256), ENC = new Uint8Array(4097);
  const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const fromSrgb = (e) => (e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4));
  for (let i = 0; i <= 4096; i++) ENC[i] = Math.round(255 * toSrgb(i / 4096));
  function buildLut(k, con) {
    const gm = 1 + (con || 0);
    for (let v = 0; v < 256; v++) {
      const c = v / 255, srgb = toSrgb(c);
      const q4 = Math.pow(c, 1 / 4), q6 = Math.pow(c, 1 / 6);
      let f = k <= 1 ? c + (srgb - c) * k : k <= 2 ? srgb + (q4 - srgb) * (k - 1) : q4 + (q6 - q4) * (k - 2);
      f = Math.pow(Math.max(0, f), gm);
      LUT[v] = Math.max(0, Math.min(255, Math.round(255 * f)));
      GAIN[v] = v ? fromSrgb(Math.min(1, f)) / c * 4096 / 255 : 0; // channel value × GAIN[max] → index of ENC
    }
  }
  // GyverMatrix getPixelNumber(x, y): y = 0 is bottom row
  function pixelNumber(x, y, L) {
    const W = L.w, H = L.h; let tw = W, tx = x, ty = y;
    const a = L.angle, d = L.dir;
    if (a === 0 && d === 1) { tw = H; tx = y; ty = x; }
    else if (a === 1 && d === 0) { ty = H - y - 1; }
    else if (a === 1 && d === 3) { tw = H; tx = H - y - 1; ty = x; }
    else if (a === 2 && d === 2) { tx = W - x - 1; ty = H - y - 1; }
    else if (a === 2 && d === 3) { tw = H; tx = H - y - 1; ty = W - x - 1; }
    else if (a === 3 && d === 2) { tx = W - x - 1; }
    else if (a === 3 && d === 1) { tw = H; tx = y; ty = W - x - 1; }
    return (ty % 2 === 0 || L.type) ? ty * tw + tx : ty * tw + tw - tx - 1;
  }
  // screen cell → strip index (and matrix x, y for tooltip); view can be turned by 90° steps
  let ledSW = 0, ledSH = 0, ledXY = null;
  function buildMap() {
    const W = led.w, H = led.h, rot = led.rot | 0;
    ledSW = rot % 180 ? H : W; ledSH = rot % 180 ? W : H;
    ledMap = new Int32Array(W * H); ledXY = new Int32Array(W * H);
    for (let row = 0; row < H; row++) for (let x = 0; x < W; x++) {
      let sx = x, sy = row;
      if (rot === 90) { sx = H - 1 - row; sy = x; } else if (rot === 180) { sx = W - 1 - x; sy = H - 1 - row; } else if (rot === 270) { sx = row; sy = W - 1 - x; }
      if (led.flip) sx = ledSW - 1 - sx;
      ledMap[sy * ledSW + sx] = pixelNumber(x, H - 1 - row, led);
      ledXY[sy * ledSW + sx] = x | ((H - 1 - row) << 8);
    }
    ledDirty = true; gridKey = '';
  }
  // "24x12", "24 x 12", "24-12", "24*12", "24х12" (Cyrillic), "2412" → [24, 12]
  function parseSize(s) {
    const t = String(s).trim().replace(/[×хХxX*,;:\/\\-]/g, ' ').trim();
    let w, h;
    if (/^\d+\s+\d+$/.test(t)) [w, h] = t.split(/\s+/).map(Number);
    else if (/^\d+$/.test(t)) {
      if (t.length <= 2) { w = h = +t; }
      else {
        let best = null;
        for (let i = 1; i < t.length; i++) {
          const a = t.slice(0, i), b = t.slice(i);
          if (b[0] === '0') continue;
          const x = +a, y = +b; if (x < 1 || y < 1 || x > 128 || y > 128) continue;
          const score = Math.abs(a.length - b.length) * 10 + Math.abs(Math.log(x / y));
          if (!best || score < best.score) best = { x, y, score };
        }
        if (best) { w = best.x; h = best.y; }
      }
    } else return null;
    if (!(w >= 1 && h >= 1 && w <= 128 && h <= 128)) return null;
    return [w, h];
  }
  function ledUI() {
    const sz = $('ledsize');
    if (document.activeElement !== sz) sz.value = pendingSize ? pendingSize[0] + 'x' + pendingSize[1] : led.w + 'x' + led.h;
    sz.classList.remove('bad');
    sz.title = 'Matrix size: 24x12, 24-12, 2412' + (sizeOverride ? `\nBuild uses WIDTH × HEIGHT = ${sizeOverride.w}×${sizeOverride.h} instead of sketch's` : '');
    $('ledtype').value = String(led.type); $('ledangle').value = String(led.angle);
    const ds = $('leddir'); ds.innerHTML = '';
    if (!DIRS[led.angle].includes(led.dir)) led.dir = DIRS[led.angle][0];
    for (const d of DIRS[led.angle]) { const o = document.createElement('option'); o.value = d; o.textContent = DIRNAME[d][0].toUpperCase() + DIRNAME[d].slice(1); ds.appendChild(o); }
    ds.value = String(led.dir);
    $('ledgrid').checked = !!led.grid;
    $('ledgam').value = String(led.gam); $('ledgamv').textContent = gamName(led.gam); buildLut(led.gam, led.con);
    $('ledcon').value = String(led.con); $('ledconv').textContent = Math.round(led.con * 100) + '%';
    $('ledcoords').checked = !!led.coords;
    $('ledroute').checked = !!led.route;
  }
  const gamName = (k) => (k === 0 ? 'Raw' : k === 1 ? 'LED-like' : k < 1 ? Math.round(k * 100) + '%' : '+' + Math.round((k - 1) * 100) + '%');
  function setLed(p) {
    Object.assign(led, p);
    store('led', JSON.stringify(led)); buildMap(); ledUI(); sizeCanvas();
    ledDirty = true;
  }
  // #defines of sketch: GyverMatrix (WIDTH, HEIGHT, MATRIX_TYPE, CONNECTION_ANGLE, STRIP_DIRECTION) and FastLED XY examples
  const W_NAMES = ['WIDTH', 'MATRIX_WIDTH', 'LED_COLS', 'kMatrixWidth', 'MATRIX_W', 'NUM_COLS'];
  const H_NAMES = ['HEIGHT', 'MATRIX_HEIGHT', 'LED_ROWS', 'kMatrixHeight', 'MATRIX_H', 'NUM_ROWS'];
  function sketchDefs() {
    if (!project) return null;
    const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    let txt = project.files.filter((f) => f.kind === 'src').map((f) => strip(ed.text(f.id))).join('\n');
    if (cSketch()) { // .c sketch: names as build sees them, pattern.c after code (code's own values win)
      if (cOpts.names) txt = cNamesJS(txt);
      if (cOpts.pattern && patternText && !/\bvoid\s+setup\s*\(/.test(txt)) txt += '\n' + strip(patternText);
    }
    const num = (names) => {
      for (const n of names) {
        const m = new RegExp('#\\s*define\\s+' + n + '\\s+\\(?\\s*(\\d+)\\b').exec(txt) ||
          new RegExp('\\b(?:const|constexpr|static)[\\w\\s]*?\\b' + n + '\\s*=\\s*(\\d+)\\b').exec(txt);
        if (m) return { name: n, value: +m[1] };
      }
      return null;
    };
    return { txt, w: num(W_NAMES), h: num(H_NAMES), n: num(['NUM_LEDS']), type: num(['MATRIX_TYPE']), angle: num(['CONNECTION_ANGLE']), dir: num(['STRIP_DIRECTION']) };
  }
  // build gets size LED window shows (restored session, first start): sketch's WIDTH / HEIGHT replaced when they differ
  function ledSizeSync() {
    const d = sketchDefs();
    if (!d || !d.w || !d.h || (d.w.value === led.w && d.h.value === led.h)) return;
    sizeOverride = { w: led.w, h: led.h, names: [[d.w.name, led.w], [d.h.name, led.h]] };
    if (d.n && d.n.value === d.w.value * d.h.value) sizeOverride.names.push(['NUM_LEDS', led.w * led.h]);
    outLine(`Sketch is ${d.w.value}×${d.h.value}; build uses ${led.w}×${led.h} of LED window (Get W×H takes sketch's)`);
    ledUI();
  }
  function sketchLayout(auto) {
    const d = sketchDefs();
    if (auto && d && cSketch() && !d.type && !d.angle && !d.dir) { d.type = { value: 0 }; d.angle = { value: 0 }; d.dir = { value: 0 }; } // XY of pattern.c
    if (!d) { if (!auto) toast('No project'); return false; }
    const w = d.w && d.w.value, h = d.h && d.h.value;
    if (!w || !h || w > 128 || h > 128) { if (!auto) toast('No WIDTH / HEIGHT in sketch', true); return false; }
    const p = { w, h };
    if (auto && !sizeOnLoad) {
      // Options → LED → "W×H from sketch on load" off: LED window keeps its size, build gets it instead of sketch's
      delete p.w; delete p.h;
      if (w !== led.w || h !== led.h) {
        sizeOverride = { w: led.w, h: led.h, names: [[d.w.name, led.w], [d.h.name, led.h]] };
        if (d.n && d.n.value === w * h) sizeOverride.names.push(['NUM_LEDS', led.w * led.h]);
        outLine(`Sketch is ${w}×${h}; build uses ${led.w}×${led.h} of LED window (Get W×H takes sketch's)`);
      }
    }
    if (auto) { // on project load also wiring, once; later it is set in Options → LED
      if (d.type) p.type = d.type.value ? 1 : 0;
      if (d.angle && d.angle.value <= 3) p.angle = d.angle.value;
      if (d.dir && d.dir.value <= 3) p.dir = d.dir.value;
      const serp = /\bkMatrixSerpentineLayout\s*=\s*(true|false)/.exec(d.txt);
      if (serp && !d.angle) { p.angle = 1; p.dir = 0; p.type = serp[1] === 'true' ? 0 : 1; }
      if (!d.type && !d.angle && !d.dir && !serp) {
        // no wiring defines: XY() of sketch tells zigzag (odd rows reversed: y & 1, y % 2) or parallel; start bottom left, to right
        // (wiring of previous project must not stay: picture would look scrambled)
        const xy = /\bXY\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(d.txt);
        p.type = xy && !/&\s*(0x0*)?1\b|%\s*2\b|\bodd\b|serpentine/i.test(xy[1]) ? 1 : 0; p.angle = 0; p.dir = 0;
      }
      if (p.angle != null && p.dir != null && !DIRS[p.angle].includes(p.dir)) { p.angle = 0; p.dir = 0; } // GyverMatrix: "Wrong matrix parameters! Set to default"
    }
    setLed(p);
    if (!auto) toast(`${w}×${h} from sketch`);
    ledUI();
    return true;
  }
  // size from box → WIDTH / HEIGHT of new build (code itself is not changed), then restart
  let pendingSize = null; // [w, h] shown when new build starts running
  async function rebuildWithSize(w, h) {
    const d = sketchDefs();
    if (!d) return;
    if (w == null) { w = led.w; h = led.h; }
    if (!d.w || !d.h) { toast('Sketch has no WIDTH / HEIGHT (#define or const) to replace', true); setLed({ w, h }); return; }
    const prev = sizeOverride;
    sizeOverride = (w === d.w.value && h === d.h.value) ? null : { w, h, names: [[d.w.name, w], [d.h.name, h]] };
    // NUM_LEDS given as plain number equal to WIDTH × HEIGHT of sketch (#define NUM_LEDS 256) follows new size
    if (sizeOverride && d.n && d.n.value === d.w.value * d.h.value) sizeOverride.names.push(['NUM_LEDS', w * h]);
    pendingSize = [w, h];
    ledUI();
    const ok = await restart(true, true);
    if (!ok) { sizeOverride = prev; pendingSize = null; ledUI(); }
  }
  function applyPendingSize() {
    if (!pendingSize) return;
    const [w, h] = pendingSize; pendingSize = null;
    if (w !== led.w || h !== led.h) setLed({ w, h }); else ledUI();
  }
  // LEDs follow window: whole device pixels per LED, at least 1
  function sizeCanvas() {
    const c = $('ledcanvas'), v = $('ledview');
    const dpr = window.devicePixelRatio || 1;
    const vw = v.clientWidth, vh = v.clientHeight; if (!vw || !vh) return;
    const dev = Math.max(1, Math.floor(Math.min(vw * dpr / ledSW, vh * dpr / ledSH)));
    c.width = dev * ledSW; c.height = dev * ledSH;
    c.style.width = (c.width / dpr) + 'px'; c.style.height = (c.height / dpr) + 'px';
    ledCell = dev / dpr; ledDirty = true;
  }
  const ledMinH = () => $('ledwin').querySelector('.ledhead').offsetHeight + (led.v3d ? 60 : Math.ceil(ledSH / (window.devicePixelRatio || 1))) + 2;
  // title bar always fits: window is never narrower than its buttons
  function headMinWidth() {
    const h = $('ledwin').querySelector('.ledhead');
    let w = 0; for (const el of h.children) if (!el.classList.contains('hgap')) w += el.offsetWidth + 2;
    return Math.ceil(w + 14 + 6);
  }
  function fitWin() {
    const w = $('ledwin'); if (w.hidden) return;
    const c = $('ledcanvas'), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const headH = w.querySelector('.ledhead').offsetHeight;
    const minW = headMinWidth();
    w.style.minWidth = minW + 'px';
    // window around matrix at its present LED size (no black margins); narrow matrix keeps width of title bar
    let ww, hh, fig = 0;
    if (v3on()) { // 3D: square view around figure at its present size on screen, zoom becomes 1 (or what still fits)
      fig = Math.max(60, Math.round(view3d.fitSize()));
      ww = Math.min(vw - 4, Math.max(minW, fig + 2));
      hh = Math.min(vh - 8, Math.max(ledMinH(), headH + fig + 2));
    } else {
      ww = Math.min(vw - 4, Math.max(minW, c.offsetWidth + 2));
      hh = Math.min(vh - 8, Math.max(ledMinH(), headH + Math.round(ledCell * ledSH) + 2));
    }
    w.style.width = ww + 'px'; w.style.height = hh + 'px';
    if (fig) { const v = $('ledview'); view3d.setZoom(fig / Math.max(1, Math.min(v.clientWidth, v.clientHeight))); }
    const r = w.getBoundingClientRect();
    let x = r.left, y = r.top;
    if (x + ww > vw) x = Math.max(0, vw - ww); if (y + hh > vh) y = Math.max(0, vh - hh);
    w.style.left = x + 'px'; w.style.top = y + 'px';
    store('ledsz', JSON.stringify({ w: Math.round(ww), h: Math.round(hh) }));
    store('ledszpos', JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
  }
  // one pixel per LED into small canvas, scaled up without smoothing; grid is cached overlay
  const ledSmall = document.createElement('canvas');
  let gridCanvas = null, gridKey = '';
  function drawLed() {
    const c = $('ledcanvas'), g = c.getContext('2d');
    const cs = c.width / (ledSW || 1);
    const gap = led.grid && cs >= 4 ? Math.max(1, Math.round(cs * 0.12)) : 0;
    if (ledSmall.width !== ledSW || ledSmall.height !== ledSH) { ledSmall.width = ledSW; ledSmall.height = ledSH; }
    const sg = ledSmall.getContext('2d');
    const img = sg.createImageData(ledSW, ledSH), d = img.data;
    const n = Math.floor(ledBuf.length / 3), lut = led.gam === 0 ? null : LUT, off = gap ? 22 : 0;
    const v3 = v3on(); let rgba = null;
    if (v3) { rgba = new Uint8Array(ledSW * ledSH * 4); }
    for (let k = 0, o = 0; k < ledMap.length; k++, o += 4) {
      const i = ledMap[k];
      let r = 0, gg = 0, b = 0;
      if (i >= 0 && i < n) {
        r = ledBuf[i * 3]; gg = ledBuf[i * 3 + 1]; b = ledBuf[i * 3 + 2];
        if (lut) { const m = r > gg ? (r > b ? r : b) : (gg > b ? gg : b), q = GAIN[m]; r = ENC[Math.min(4096, Math.round(r * q))]; gg = ENC[Math.min(4096, Math.round(gg * q))]; b = ENC[Math.min(4096, Math.round(b * q))]; }
      }
      if (rgba) { rgba[o] = r; rgba[o + 1] = gg; rgba[o + 2] = b; rgba[o + 3] = 255; }
      if (!(r | gg | b)) r = gg = b = off;
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
    if (v3) { view3d.setImage(rgba, ledSW, ledSH); ledDirty = false; return; } // 3D view draws itself (own animation frame)
    sg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(ledSmall, 0, 0, c.width, c.height);
    if (gap) {
      const key = c.width + 'x' + c.height + ':' + ledSW + 'x' + ledSH + ':' + gap;
      if (key !== gridKey) {
        gridKey = key; gridCanvas = document.createElement('canvas'); gridCanvas.width = c.width; gridCanvas.height = c.height;
        const gc = gridCanvas.getContext('2d'); gc.fillStyle = '#0b0b0b';
        for (let x = 0; x <= ledSW; x++) { const p = Math.round(x * cs); gc.fillRect(p - (gap >> 1), 0, gap, c.height); }
        for (let y = 0; y <= ledSH; y++) { const p = Math.round(y * cs); gc.fillRect(0, p - (gap >> 1), c.width, gap); }
      }
      g.drawImage(gridCanvas, 0, 0);
    }
    if (led.route) drawRoute(g, c, cs);
    ledDirty = false;
  }
  // strip route: line through LED centres in index order (wiring), green dot at leds[0], red at last
  let routeCanvas = null, routeKey = '';
  function drawRoute(g, c, cs) {
    const key = c.width + 'x' + c.height + ':' + ledSW + 'x' + ledSH + ':' + led.type + led.angle + led.dir + (led.rot | 0) + (led.flip ? 'f' : '') + led.w + 'x' + led.h;
    if (key !== routeKey) {
      routeKey = key; routeCanvas = document.createElement('canvas'); routeCanvas.width = c.width; routeCanvas.height = c.height;
      const rc = routeCanvas.getContext('2d'), n = led.w * led.h, pos = new Float32Array(n * 2).fill(-1);
      for (let k = 0; k < ledMap.length; k++) { const i = ledMap[k]; if (i >= 0 && i < n) { pos[i * 2] = (k % ledSW + 0.5) * cs; pos[i * 2 + 1] = (Math.floor(k / ledSW) + 0.5) * cs; } }
      const lw = Math.max(1, cs * 0.14);
      rc.lineJoin = 'round'; rc.lineCap = 'round';
      rc.strokeStyle = 'rgba(0,0,0,.3)'; rc.lineWidth = lw + 2;
      const path = () => { rc.beginPath(); let first = true; for (let i = 0; i < n; i++) { if (pos[i * 2] < 0) { first = true; continue; } if (first) rc.moveTo(pos[i * 2], pos[i * 2 + 1]); else rc.lineTo(pos[i * 2], pos[i * 2 + 1]); first = false; } rc.stroke(); };
      path(); rc.strokeStyle = 'rgba(200,170,70,.38)'; rc.lineWidth = lw; path();
      // arrow heads along the way
      if (cs >= 8) {
        rc.fillStyle = 'rgba(200,170,70,.45)';
        const step = Math.max(1, Math.round(Math.max(led.w, led.h) / 4));
        for (let i = 0; i + 1 < n; i += step) {
          const x0 = pos[i * 2], y0 = pos[i * 2 + 1], x1 = pos[i * 2 + 2], y1 = pos[i * 2 + 3]; if (x0 < 0 || x1 < 0) continue;
          const a = Math.atan2(y1 - y0, x1 - x0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, s = Math.max(4, cs * 0.3);
          rc.beginPath(); rc.moveTo(mx + Math.cos(a) * s, my + Math.sin(a) * s);
          rc.lineTo(mx + Math.cos(a + 2.5) * s, my + Math.sin(a + 2.5) * s); rc.lineTo(mx + Math.cos(a - 2.5) * s, my + Math.sin(a - 2.5) * s); rc.fill();
        }
      }
      const dot = (i, col) => { if (pos[i * 2] < 0) return; rc.beginPath(); rc.arc(pos[i * 2], pos[i * 2 + 1], Math.max(2.5, cs * 0.28), 0, 7); rc.fillStyle = col; rc.fill(); rc.lineWidth = 1; rc.strokeStyle = 'rgba(0,0,0,.5)'; rc.stroke(); };
      dot(n - 1, 'rgba(229,72,77,.6)'); dot(0, 'rgba(61,214,140,.65)');
    }
    g.drawImage(routeCanvas, 0, 0);
  }
  function frame() {
    requestAnimationFrame(frame);
    if (ledDirty && !$('ledwin').hidden) drawLed();
  }
  // small pop-ups under title bar buttons (speed, effects)
  function popup(pop, btn, again) {
    const open = pop.hidden || again;
    document.querySelectorAll('.hpop').forEach((p) => { p.hidden = true; });
    if (!open) return;
    pop.hidden = false;
    const r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    pop.style.left = Math.max(4, Math.min(r.left + r.width / 2 - pop.offsetWidth / 2, vw - pop.offsetWidth - 4)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
  }
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.hpop, #ledspeed, #ledfx, #led3dm, #loadbtn, #hexbtn, #uploadm, #wlib')) document.querySelectorAll('.hpop').forEach((p) => { p.hidden = true; }); }, true);
  const SPEEDS = [0.1, 0.2, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 8, 10];
  let simSpeed = 1, paused = false;
  const fmtX = (v) => String(v) + '×';
  function setSpeed(v) {
    simSpeed = v;
    $('ledspeedv').textContent = v === 1 ? '' : fmtX(v); $('ledspeed').classList.toggle('on', v !== 1 && !realOn);
    $('speedval').textContent = `${fmtX(v)} · ${Math.round(50 * v)} fps`; $('speedrange').value = String(SPEEDS.indexOf(v));
    $('speedticks').querySelectorAll('span').forEach((s) => s.classList.toggle('on', +s.dataset.v === v));
    if (runner && !realRun) runner.postMessage({ type: 'speed', value: v });
    statusUI();
  }
  // Real CPU timing: sketch is real build (avr-gcc) running on emulated ATmega328P / ATmega2560 cycle by cycle (avr-runner.js);
  // off: clang / WebAssembly build, 50 fps × speed. Speed, 3D, size rebuild, profile and catch-up work only when off.
  function setReal(on, init) {
    const was = realOn;
    realOn = !!on; store('realcpu', realOn ? '1' : '0');
    $('realbtn').classList.toggle('on', realOn);
    $('realbtn').title = 'Real CPU timing ' + (realOn ? 'on' : 'off');
    $('ledspeed').disabled = realOn; $('ledrebuild').disabled = realOn; $('catchbtn').disabled = realOn;
    $('profbtn').hidden = realOn;
    $('profnote').innerHTML = realOn ? 'Real CPU timing: share of board CPU time per function, always on (sampled, does not slow sketch). Self — in function itself, Total — with functions it calls. Waiting in <code>delay()</code> is <code>micros()</code> loop. Click row — go to function of sketch.'
      : 'Busy — time function works itself (with library calls), Waits — <code>delay()</code> and <code>FastLED.show()</code> pacing inside it, Total — with called sketch functions. Click row — go to function.';
    memUI(null);
    if (realOn) { $('speedpop').hidden = true; $('pop3d').hidden = true; if (profOn) setProfile(false); }
    if (ui3dRef) ui3dRef();
    setSpeed(1);
    if (!init && was !== realOn) {
      toast('Real CPU timing: ' + (realOn ? 'on' : 'off'));
      if (running) restart(true);
    }
  }
  function setPause(v) {
    if (!running) v = false;
    paused = v;
    $('pausebtn').classList.toggle('paused', paused);
    $('pausebtn').title = paused ? 'Continue (Space)' : 'Pause (Space)';
    if (!paused && dbgSt) dbgResumed();
    if (runner) runner.postMessage({ type: 'pause', on: paused });
    statusUI();
  }
  function bindLed() {
    const w = $('ledwin');
    const fw = floatWin(w, 'ledpos', () => {
      const vw = document.documentElement.clientWidth;
      return { x: Math.max(8, vw - w.offsetWidth - 16), y: 60 };
    });
    resizable(w, 'ledsz', () => headMinWidth(), () => ledMinH(), () => {});
    new ResizeObserver(() => sizeCanvas()).observe($('ledview'));
    try { const p = JSON.parse(load('ledszpos')); if (p && isFinite(p.x)) fw.setPos(p); } catch (e) {}
    new MutationObserver(() => {
      if (!w.hidden) { fw.place(); w.style.minWidth = headMinWidth() + 'px'; }
      else { document.querySelectorAll('.hpop').forEach((p) => { p.hidden = true; }); $('ledtip').hidden = true; if (running) stop(); } // closing window stops sketch
      $('ledbtn').classList.toggle('on', !w.hidden);
    }).observe(w, { attributes: true, attributeFilter: ['hidden'] });
    // size box
    const sz = $('ledsize');
    const apply = () => {
      const p = parseSize(sz.value);
      if (!p) { sz.classList.add('bad'); toast('Size: two numbers, e.g. 24x12', true); sz.value = led.w + 'x' + led.h; setTimeout(() => sz.classList.remove('bad'), 1200); return; }
      sz.value = p[0] + 'x' + p[1];
      // Real CPU timing: sketch is built as it is, size only lays out LEDs read from pin
      if (realOn) { if (p[0] !== led.w || p[1] !== led.h) setLed({ w: p[0], h: p[1] }); return; }
      const cur = sizeOverride ? [sizeOverride.w, sizeOverride.h] : (() => { const d = sketchDefs(); return d && d.w && d.h ? [d.w.value, d.h.value] : [led.w, led.h]; })();
      // matrix of other size than build draws nonsense: new size is shown when new build runs (after catching up)
      if (project && (p[0] !== cur[0] || p[1] !== cur[1] || !running)) rebuildWithSize(p[0], p[1]);
      else if (!project && (p[0] !== led.w || p[1] !== led.h)) setLed({ w: p[0], h: p[1] });
    };
    let escaped = false;
    sz.addEventListener('blur', () => { if (escaped) { escaped = false; return; } apply(); });
    sz.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sz.blur(); } else if (e.key === 'Escape') { escaped = true; sz.value = led.w + 'x' + led.h; sz.blur(); } e.stopPropagation(); });
    sz.addEventListener('focus', () => sz.select());
    $('ledrebuild').onclick = () => rebuildWithSize();
    $('getwh').onclick = () => {
      const d = sketchDefs();
      if (sizeOverride && running && d && d.w && d.h) { rebuildWithSize(d.w.value, d.h.value); return; }
      sizeOverride = null;
      sketchLayout(false); ledUI();
    };
    // speed
    const sr = $('speedrange'), tk = $('speedticks');
    sr.max = String(SPEEDS.length - 1);
    for (const v of [0.1, 0.5, 1, 2, 5, 10]) { const s = document.createElement('span'); s.dataset.v = v; s.textContent = fmtX(v); s.style.marginLeft = s.style.marginRight = '0'; tk.appendChild(s); s.onclick = () => setSpeed(v); }
    // ticks stand under their positions of slider
    tk.style.position = 'relative'; tk.style.height = '14px';
    tk.querySelectorAll('span').forEach((s) => { s.style.position = 'absolute'; s.style.left = `calc(8px + (100% - 16px) * ${SPEEDS.indexOf(+s.dataset.v) / (SPEEDS.length - 1)})`; });
    sr.oninput = () => setSpeed(SPEEDS[+sr.value]);
    $('ledspeed').onclick = () => popup($('speedpop'), $('ledspeed'));
    $('realbtn').onclick = () => setReal(!realOn);
    $('oporder').value = stripOrder;
    $('oporder').onchange = () => { stripOrder = $('oporder').value; store('order', stripOrder); if (runner && realRun) runner.postMessage({ type: 'order', order: wireOrder() }); };
    $('ledspeed').ondblclick = () => { setSpeed(1); $('speedpop').hidden = true; };
    $('ledfit').onclick = () => fitWin();
    // rotate is action (90° each click), not switch: angle is shown as small number, not as highlight
    const rotUI = () => { $('ledrotv').textContent = led.rot ? led.rot + '°' : ''; $('ledrot').title = `Rotate view 90° clockwise (now ${led.rot | 0}°)`; };
    $('ledrot').onclick = () => { setLed({ rot: ((led.rot | 0) + 90) % 360 }); rotUI(); };
    rotUI();
    const flipUI = () => { $('ledflip').classList.toggle('on', !!led.flip); $('ledflip').title = 'Mirror horizontally: ' + (led.flip ? 'on' : 'off'); };
    $('ledflip').onclick = () => { setLed({ flip: !led.flip }); flipUI(); };
    flipUI();
    $('ledroute').onchange = () => setLed({ route: $('ledroute').checked });
    $('ledfx').onclick = () => popup($('fxpop'), $('ledfx'));
    $('ledgrid').onchange = () => setLed({ grid: $('ledgrid').checked });
    // 3D view (led3d.js): matrix on cylinder / sphere, dots or solid
    if (window.Led3D) view3d = window.Led3D($('ledview'));
    const ui3d = () => {
      const on = v3on();
      $('led3d').classList.toggle('on', on); $('led3d').disabled = $('led3dm').disabled = realOn;
      $('ledcanvas').style.visibility = on ? 'hidden' : '';
      document.querySelectorAll('input[name=sh3]').forEach((x) => { x.checked = x.value === (led.shape3 || 'cylinder'); });
      document.querySelectorAll('input[name=md3]').forEach((x) => { x.checked = x.value === (led.mode3 || 'dots'); });
      $('rot3').checked = led.rot3 !== false;
      if (view3d) {
        view3d.set({ shape: led.shape3 || 'cylinder', mode: led.mode3 || 'dots', rotate: led.rot3 !== false, dot: led.dot3 || 1, cylH: led.cyl3 || 1 });
        view3d.show(on && !$('ledwin').hidden);
        if (on && view3d.solidFailed && led.mode3 === 'solid') toast('WebGL is not available: dots are shown', true);
      }
      if (on) $('ledtip').hidden = true;
      ledDirty = true;
    };
    ui3dRef = ui3d;
    $('led3d').onclick = () => { if (!view3d) { toast('3D view is not available', true); return; } setLed({ v3d: !led.v3d }); ui3d(); };
    $('led3dm').onclick = () => popup($('pop3d'), $('led3dm'));
    const set3 = (p, keep) => { setLed(Object.assign({ v3d: true }, p)); ui3d(); if (!keep) $('pop3d').hidden = true; }; // choice made: menu closes
    document.querySelectorAll('input[name=sh3]').forEach((x) => { x.onchange = () => set3({ shape3: x.value }); });
    document.querySelectorAll('input[name=md3]').forEach((x) => { x.onchange = () => set3({ mode3: x.value }); });
    $('rot3').onchange = () => set3({ rot3: $('rot3').checked }, true);
    const opt3 = () => {
      $('led3ds').value = String(led.dot3 || 1); $('led3dsv').textContent = Math.round((led.dot3 || 1) * 100) + '%';
      $('led3dh').value = String(led.cyl3 || 1); $('led3dhv').textContent = Math.round((led.cyl3 || 1) * 100) + '%';
    };
    $('led3ds').oninput = () => { setLed({ dot3: +$('led3ds').value }); opt3(); ui3d(); };
    $('led3ds').ondblclick = () => { setLed({ dot3: 1 }); opt3(); ui3d(); };
    $('led3dh').oninput = () => { setLed({ cyl3: +$('led3dh').value }); opt3(); ui3d(); };
    $('led3dh').ondblclick = () => { setLed({ cyl3: 1 }); opt3(); ui3d(); };
    opt3();
    new MutationObserver(ui3d).observe(w, { attributes: true, attributeFilter: ['hidden'] });
    ui3d();
    $('ledcoords').onchange = () => { setLed({ coords: $('ledcoords').checked }); if (!led.coords) $('ledtip').hidden = true; };
    $('ledinputs').onclick = () => { const iw = $('inwin'); iw.hidden = !iw.hidden; };
    // wiring / display: Options → LED
    $('ledtype').onchange = () => setLed({ type: +$('ledtype').value });
    $('ledangle').onchange = () => { const a = +$('ledangle').value; setLed({ angle: a, dir: DIRS[a].includes(led.dir) ? led.dir : DIRS[a][0] }); };
    $('leddir').onchange = () => setLed({ dir: +$('leddir').value });
    $('ledgam').oninput = () => setLed({ gam: +$('ledgam').value });
    $('ledgam').ondblclick = () => setLed({ gam: 2 });
    $('ledcon').oninput = () => setLed({ con: +$('ledcon').value });
    $('ledcon').ondblclick = () => setLed({ con: 0 });
    // pixel under mouse
    const cv = $('ledcanvas'), tip = $('ledtip');
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(), sx = Math.floor((e.clientX - r.left) / ledCell), sy = Math.floor((e.clientY - r.top) / ledCell);
      if (!led.coords || led.v3d || sx < 0 || sy < 0 || sx >= ledSW || sy >= ledSH) { tip.hidden = true; return; }
      const i = ledMap[sy * ledSW + sx], x = ledXY[sy * ledSW + sx] & 255, y = ledXY[sy * ledSW + sx] >> 8;
      const hex = (v) => (v || 0).toString(16).padStart(2, '0');
      tip.textContent = `x${x} y${y} · leds[${i}]` + (i * 3 + 2 < ledBuf.length ? ` · #${hex(ledBuf[i * 3])}${hex(ledBuf[i * 3 + 1])}${hex(ledBuf[i * 3 + 2])}` : '');
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, document.documentElement.clientWidth - tip.offsetWidth - 4) + 'px';
      tip.style.top = (e.clientY + 16) + 'px';
    });
    cv.addEventListener('pointerleave', () => { tip.hidden = true; });
    buildMap(); ledUI(); sizeCanvas(); setReal(realOn, true);
    const iw = $('inwin');
    floatWin(iw, 'inpos', () => { const r = w.getBoundingClientRect(); return w.hidden ? centerPos(iw)() : { x: Math.max(0, r.left - iw.offsetWidth - 8), y: r.top }; });
    resizable(iw, 'insz', 300, 160);
    new MutationObserver(() => $('ledinputs').classList.toggle('open', !iw.hidden)).observe(iw, { attributes: true, attributeFilter: ['hidden'] });
    inputsUI();
  }
  function toggleLed(v) { const w = $('ledwin'); w.hidden = v === undefined ? !w.hidden : !v; }


  // ---------------------------------------------------------------- .c sketches (Soulmate style): pattern.c from server root, ROWS / COLS → WIDTH / HEIGHT
  const cOpts = { pattern: load('cpattern') !== '0', names: load('cnames') !== '0' };
  let patternText = null;
  function cSketch() { return !!project && !project.files.some((f) => f.ext === 'ino') && project.files.some((f) => f.ext === 'c'); }
  function cNamesJS(t) { return t.replace(/\bLED_COLS\b/g, 'WIDTH').replace(/\bLED_ROWS\b/g, 'HEIGHT').replace(/\bCOLS\b/g, 'WIDTH').replace(/\bROWS\b/g, 'HEIGHT'); }
  // .c sketch just loaded: names and pattern.c go into its text, so editor shows what is compiled (files get * mark)
  async function prepareC() {
    const pr = project;
    if (cOpts.pattern) await loadPattern();
    if (project !== pr) return;
    let sk;
    try { sk = await import('./sketch.js?v=20261028193402'); } catch (e) { outLine('sketch.js cannot be loaded: ' + e.message); return; }
    const cf = pr.files.filter((f) => f.ext === 'c' && f.kind === 'src' && !f.path.slice(pr.prefix.length).includes('/'));
    if (!cf.length) return;
    const codes = {};
    for (const f of cf) { const t = ed.text(f.id).replace(/\r\n?/g, '\n'); codes[f.name] = cOpts.names ? sk.cNames(t) : t; }
    const hasSetup = sk.findFunctions(Object.values(codes).join('\n')).some((x) => x.name === 'setup');
    let notes = [];
    if (cOpts.pattern && patternText && !hasSetup) { const m = sk.insertPattern(patternText, codes); Object.assign(codes, m.codes); notes = m.notes; }
    let n = 0;
    for (const f of cf) {
      const t = codes[f.name];
      if (t === ed.text(f.id)) continue;
      ed.remove(f.id); f.text = t; f.auto = t; ed.add(f.id, t, 'c'); n++;
      f.mod = f.base == null || t !== f.base;
      if (f.tab) f.tab.querySelector('.mod').textContent = f.mod ? '*' : '';
    }
    if (!n) return;
    const act = pr.active || cf[0]; pr.active = null; showFile(act);
    projectUI(); saveSession();
    outLine('.c sketch: ' + (cOpts.names ? 'ROWS / COLS → WIDTH / HEIGHT' : '') + (notes.length || (cOpts.pattern && patternText && !hasSetup) ? (cOpts.names ? '; ' : '') + 'pattern.c inserted' + (notes.length ? ': ' + notes.join('; ') : '') : ''));
  }
  async function loadPattern() {
    try {
      const r = await fetch('pattern.c?t=' + Date.now());
      if (r.ok) patternText = await r.text(); else if (!patternText) outLine('pattern.c not found on server (HTTP ' + r.status + ')');
    } catch (e) { if (!patternText) outLine('pattern.c cannot be loaded: ' + e.message); }
    return patternText;
  }

  // ---------------------------------------------------------------- build (compiler worker) and run (runner worker)
  let compiler = null, compilerState = 'none', compilerPct = 0, compileSeq = 0;
  const compileWait = new Map();
  let runner = null, running = false, building = false, lastBuild = null, runStats = null;
  const OPTS = { '-O0': 'Fast build (-O0)', '-O1': '-O1', '-O2': '-O2', '-Os': '-Os (as Arduino IDE)' };
  let knownFixes = []; // -fpermissive casts of last build: next build of same project applies them right away
  let optLevel = OPTS[load('opt')] ? load('opt') : '-O0';
  let stdlibOn = load('stdlib') === '1';
  let sizeOnLoad = load('sizeload') === '1'; // project load takes WIDTH / HEIGHT of sketch into LED window: off by default
  let powerOn = load('power') === '1'; // power limit of sketch applied, as on real strip: off by default
  let catchOn = load('catchup') === '1'; // catch-up after rebuild: off by default
  function setCatch(v) {
    catchOn = !!v; store('catchup', catchOn ? '1' : '0');
    $('opcatch').checked = catchOn;
    $('catchbtn').classList.toggle('on', catchOn);
    $('catchbtn').title = 'Catch-up: ' + (catchOn ? 'on — after rebuild (size, profile) sketch continues from same moment' : 'off — after rebuild sketch starts from beginning');
  } // C++ standard library (libc++ headers): off as on AVR

  function ensureCompiler() {
    if (compiler) return compiler;
    compilerState = 'loading'; compilerPct = 0;
    try { compiler = new Worker('js/compiler.js?v=20261028193402', { type: 'module' }); }
    catch (e) { compilerState = 'fail'; outLine('Cannot start compiler: ' + e.message); return null; }
    compiler.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        const p = m.total ? Math.floor(m.done * 100 / m.total) : 0;
        if (p !== compilerPct) { compilerPct = p; buildUI(); }
      } else if (m.type === 'ready') {
        compilerState = 'ready'; outLine(`Compiler ready: clang ${m.clang} (WebAssembly), ${(m.ms / 1000).toFixed(1)} s`); buildUI();
      } else if (m.type === 'fail') {
        compilerState = 'fail'; outLine('Compiler failed to load: ' + m.error); buildUI(); toast('Compiler failed to load: ' + m.error, true);
        compiler.terminate(); compiler = null;
        for (const [, res] of compileWait) res({ ok: false, internal: true, log: m.error, diagnostics: [], fixes: [] });
        compileWait.clear();
      } else if (m.type === 'log') {
        outLine(m.line);
      } else if (m.type === 'result') {
        const res = compileWait.get(m.id); compileWait.delete(m.id); if (res) res(m);
      }
    };
    compiler.onerror = (e) => { outLine('Compiler error: ' + (e.message || e)); };
    compiler.postMessage({ type: 'init' });
    buildUI();
    return compiler;
  }
  function projectSources() {
    const files = [];
    for (const f of project.files) {
      const path = f.path.startsWith(project.prefix) ? f.path.slice(project.prefix.length) : f.path;
      if (f.kind === 'bin') files.push({ path, data: f.orig });
      else files.push({ path, text: ed.text(f.id) });
    }
    const main = project.files.find((f) => f.main);
    return { files, main: main ? main.name : null };
  }
  function hashStr(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
  function fileByPath(p) {
    if (!project || !p) return null;
    return project.files.find((f) => f.path === project.prefix + p || f.path === p) || project.files.find((f) => f.name === p.replace(/^.*\//, '')) || null;
  }
  async function build() {
    if (!project) return null;
    if (building) return null;
    if (realOn) return buildReal();
    const src = projectSources();
    const isC = cSketch();
    if (!src.main && !isC) { toast('No .ino file in project', true); return null; }
    if (isC && cOpts.pattern) await loadPattern();
    const cExtra = isC ? { pattern: cOpts.pattern ? patternText : null, cNames: cOpts.names } : {};
    if (!sizeOverride && !pendingSize) ledSizeSync();
    const defines = sizeOverride ? sizeOverride.names.map(([name, value]) => ({ name, value })) : [];
    const key = board.id + optLevel + (stdlibOn ? 'L' : '') + (powerOn ? '' : 'W') + (profOn ? 'P' : '') + JSON.stringify(defines) + (isC ? hashStr(JSON.stringify(cExtra)) : '') + hashStr(JSON.stringify(src.files.map((f) => [f.path, f.text || f.data.length])));
    if (lastBuild && lastBuild.key === key) return lastBuild;
    building = true; buildUI();
    outClear();
    outLine(`${project.name}: ${board.name} (${board.mcu}), ${OPTS[optLevel]}` + (defines.length ? ', ' + defines.map((d) => d.name + ' = ' + d.value).join(', ') : ''));
    if (!ensureCompiler()) { building = false; buildUI(); return null; }
    if (compilerState === 'loading') outLine('Loading compiler (about 26 MB first time, then from browser cache)…');
    const id = ++compileSeq;
    const t0 = performance.now();
    const r = await new Promise((res) => {
      compileWait.set(id, res);
      compiler.postMessage({ type: 'compile', id, files: src.files, main: src.main, board: board.id, opt: optLevel, defines, profile: profOn, fixes: knownFixes, stdlib: stdlibOn, noPower: !powerOn, ...cExtra });
    });
    building = false;
    showDiagnostics(r.diagnostics || [], r.fixes || []);
    if (r.ok) knownFixes = r.fixes || [];
    if (r.log && r.log.trim()) outText(r.log);
    let out = null;
    if (r.ok) {
      try {
        const module = await WebAssembly.compile(r.wasm);
        out = lastBuild = { key, module, size: r.wasm.length, board: board.id, prof: r.profile || null };
        outLine(`Done in ${((performance.now() - t0) / 1000).toFixed(1)} s` + (r.fixes && r.fixes.length ? `, ${r.fixes.length} -fpermissive fix${r.fixes.length > 1 ? 'es' : ''} (see Problems)` : '') + `. Program: ${Math.round(r.wasm.length / 1024)} KB of WebAssembly.`);
      } catch (e) { outLine('Cannot load compiled program: ' + e.message); }
    } else {
      outLine(r.internal ? 'Internal compiler error' : 'Compilation failed.');
      const errs = (r.diagnostics || []).filter((d) => d.severity === 'error');
      showPanel(errs.length ? 'problems' : 'output');
      if (errs[0]) gotoDiag(errs[0]);
      toast(errs.length ? `${errs.length} error${errs.length > 1 ? 's' : ''}: ${errs[0].message}` : 'Compilation failed', true);
    }
    buildUI();
    return out;
  }
  // ---------------------------------------------------------------- real build for board: avr-gcc 7.3 in WebAssembly (avr-worker.js)
  // as Arduino IDE builds (AVR core 1.8.6, FastLED 3.7.8): .hex for USB upload, .elf, .eep, .hex with bootloader
  const AVR_CPUS = { nano: [['atmega328', 'ATmega328P'], ['atmega328old', 'ATmega328P (Old Bootloader)']] };
  const avrCpu = () => (board.id === 'nano' ? nanoCpu : 'atmega2560');
  function ensureAvr() {
    if (avr) return avr;
    avrState = 'loading'; avrPct = 0;
    try { avr = new Worker('js/avr-worker.js?v=20261028193402', { type: 'module' }); }
    catch (e) { avrState = 'fail'; outLine('Cannot start avr-gcc: ' + e.message); return null; }
    avr.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        const p = m.total ? Math.floor(m.done * 100 / m.total) : 0;
        if (p !== avrPct) { avrPct = p; statusUI(); }
      } else if (m.type === 'ready') {
        avrState = 'ready'; outLine(`avr-gcc ready (WebAssembly), ${(m.ms / 1000).toFixed(1)} s`); statusUI();
      } else if (m.type === 'fail') {
        avrState = 'fail'; outLine('avr-gcc failed to load: ' + m.error); toast('avr-gcc failed to load: ' + m.error, true);
        avr.terminate(); avr = null;
        for (const [, res] of avrWait) res({ ok: false, internal: true, log: m.error, diagnostics: [] });
        avrWait.clear(); statusUI();
      } else if (m.type === 'log') outLine(m.line);
      else if (m.type === 'result') { const res = avrWait.get(m.id); avrWait.delete(m.id); if (res) res(m); }
    };
    avr.onerror = (e) => { outLine('avr-gcc error: ' + (e.message || e)); };
    avr.postMessage({ type: 'init' });
    return avr;
  }
  // files as they would be saved (same bytes as Arduino IDE gets: encoding, line ends)
  function avrSources() {
    const files = [];
    for (const f of project.files) {
      const path = f.path.startsWith(project.prefix) ? f.path.slice(project.prefix.length) : f.path;
      files.push({ path, data: f.kind === 'bin' ? f.orig : encodeText(f, ed.text(f.id)).bytes });
    }
    const main = project.files.find((f) => f.main);
    return { files, main: main ? main.name : null };
  }
  async function avrBuild(forRun) {
    if (!project || avrBusy) return null;
    const src = avrSources();
    const isC = cSketch();
    if (!project.files.some((f) => f.ext === 'ino') && !isC) { toast('Real build needs sketch: .ino or .c', true); return null; }
    if (isC && cOpts.pattern) await loadPattern();
    const cSk = isC ? { pattern: cOpts.pattern ? patternText : null, names: cOpts.names } : null;
    const cpu = avrCpu();
    let h = 0x811c9dc5;
    for (const f of src.files) { const s = f.path + '\0'; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } for (const x of f.data) { h ^= x; h = Math.imul(h, 16777619); } }
    const key = board.id + cpu + (h >>> 0).toString(16) + (cSk ? hashStr(JSON.stringify(cSk)) : '');
    if (avrLast && avrLast.key === key) return avrLast;
    avrBusy = true; hexUI();
    outClear(); if (!forRun) showPanel('output');
    outLine(`${project.name}: ${board.name} (${board.mcu}), avr-gcc 7.3.0, Arduino AVR core 1.8.6 — real build` + (forRun ? ' for Real CPU timing' : ''));
    if (!ensureAvr()) { avrBusy = false; hexUI(); return null; }
    if (avrState === 'loading') outLine('Loading avr-gcc (about 16 MB first time, then from browser cache)…');
    const id = ++avrSeq, t0 = performance.now();
    const r = await new Promise((res) => { avrWait.set(id, res); avr.postMessage({ type: 'build', id, files: src.files, main: src.main, board: board.id, cpu, cSketch: cSk, name: project.name }); });
    avrBusy = false;
    showDiagnostics(r.diagnostics || [], []);
    if (r.ok) {
      avrLast = Object.assign(r, { key, project: project.name });
      outLine(`Done in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
    } else {
      avrLast = null;
      // too big: build itself is fine, as IDE 2 says
      const big = r.report && /Sketch too big/.test(r.report) ? 'text' : r.report && /Not enough memory/.test(r.report) ? 'data' : '';
      outLine(r.internal ? 'Internal error of avr-gcc' : big ? `Compilation error: ${big} section exceeds available space in board` : 'Build failed.');
      const errs = (r.diagnostics || []).filter((d) => d.severity === 'error');
      if (errs.length) { showPanel('problems'); gotoDiag(errs[0]); }
      toast(errs.length ? `${errs.length} error${errs.length > 1 ? 's' : ''}: ${errs[0].message}` : (r.report && /too big|Not enough memory/.test(r.report) ? r.report.split('\n').pop() : 'Build failed'), true);
    }
    hexUI();
    return r.ok ? avrLast : null;
  }
  async function avrGet(kind) {
    $('hexpop').hidden = true;
    const r = await avrBuild();
    if (!r || kind === 'build') return;
    const base = r.name; // <sketch>.ino, as IDE names files (.c sketch: project name)
    const txt = (t) => new Blob([t], { type: 'text/plain' });
    const all = { hex: [base + '.hex', txt(r.hex)], boot: [base + '.with_bootloader.hex', txt(r.boot.hex)], elf: [base + '.elf', new Blob([r.elf])], eep: [base + '.eep', txt(r.eep)] };
    if (kind !== 'zip') { download(all[kind][1], all[kind][0]); toast('Saved ' + all[kind][0]); return; }
    const enc = new TextEncoder();
    const list = [[base + '.hex', enc.encode(r.hex)], [base + '.eep', enc.encode(r.eep)], [base + '.elf', r.elf], [base + '.with_bootloader.hex', enc.encode(r.boot.hex)], [base + '.with_bootloader.bin', r.boot.bin]];
    const blob = await FLZip.create(list.map(([name, data]) => ({ name, data })));
    const name = r.project + '.arduino.avr.' + r.board + '.zip'; // as IDE export folder (build/arduino.avr.<board>)
    download(blob, name); toast('Saved ' + name);
  }
  function hexUI() {
    const b = $('hexbtn');
    b.disabled = !project; b.classList.toggle('busy', avrBusy && !upBusy);
    $('uploadbtn').disabled = !project || upBusy; $('uploadm').disabled = false; $('uploadbtn').classList.toggle('busy', upBusy);
    const cpuN = (AVR_CPUS[board.id] || []).find(([v]) => v === nanoCpu);
    $('hexbootn').textContent = 'Download .hex with bootloader' + (cpuN ? ' (' + (nanoCpu === 'atmega328old' ? 'Old Bootloader' : 'Optiboot') + ')' : '');
    $('hexpop').querySelectorAll('button.mi').forEach((x) => { x.disabled = avrBusy; });
    const cur = avrLast && avrLast.key.startsWith(board.id + avrCpu()) ? avrLast : null;
    $('hexinfo').innerHTML = `<b>${esc(board.name)}</b>, avr-gcc 7.3.0` + (cur && cur.size ? `<br>Last build: ${cur.size.flash} bytes flash, ${cur.size.ram} bytes RAM` : '');
    upUI();
    statusUI();
  }
  // Help: English / Russian (button in its title bar); showHelp(sec) opens it at card with data-sec
  let helpLang = load('helplang') === 'ru' ? 'ru' : 'en';
  function setHelpLang(l) {
    const w = $('helpwin'), cur = w.querySelector('.body:not([hidden])');
    // card at top of old language stays at top in new one
    let sec = null, off = 0;
    if (cur) for (const c of cur.querySelectorAll('[data-sec]')) { const d = c.getBoundingClientRect().bottom - cur.getBoundingClientRect().top; if (d > 0) { sec = c.dataset.sec; off = c.getBoundingClientRect().top - cur.getBoundingClientRect().top; break; } }
    helpLang = l; store('helplang', l);
    w.querySelectorAll('.body[data-lang]').forEach((b) => { b.hidden = b.dataset.lang !== l; });
    const nb = w.querySelector(`.body[data-lang="${l}"]`), c = sec && nb.querySelector(`[data-sec="${sec}"]`);
    if (c && !w.hidden) nb.scrollTop += c.getBoundingClientRect().top - nb.getBoundingClientRect().top - off;
    $('helplang').textContent = l === 'en' ? 'EN' : 'RU';
    $('helplang').title = l === 'en' ? 'Русский' : 'English';
    w.querySelector('h2').textContent = l === 'en' ? 'Help' : 'Справка';
  }
  function showHelp(sec) {
    const w = $('helpwin'); w.hidden = false;
    const c = w.querySelector(`.body[data-lang="${helpLang}"] [data-sec="${sec}"]`);
    if (c) { c.scrollIntoView({ block: 'start' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1200); }
  }
  // Upload menu: port (choose / change, release), bootloader of Nano (first tried on upload), help on USB drivers
  function upUI() {
    $('upinfo').innerHTML = `<b>${esc(board.name)}</b>` + ('serial' in navigator ? '' : '<br>Needs Web Serial: Chrome, Edge, Opera or new Firefox on computer');
    $('upgo').disabled = !project || upBusy;
    $('upportn').textContent = usbPort ? 'Port: ' + portName(usbPort) : 'Choose port…';
    $('upportc').hidden = !usbPort; $('uprel').disabled = !usbPort;
    const cpus = AVR_CPUS[board.id], box = $('upcpu');
    box.innerHTML = cpus ? '<div class="mhead">Bootloader</div>' + cpus.map(([v, n]) => `<label class="mrad" title="${v === 'atmega328old' ? 'Older Nano and many clones: 57600 baud' : 'Nano since 2018: 115200 baud'}"><input type="radio" name="avrcpu" value="${v}"${v === nanoCpu ? ' checked' : ''}>${esc(n)}</label>`).join('') : '';
    box.querySelectorAll('input').forEach((i) => { i.onchange = () => { nanoCpu = i.value; store('nanocpu', nanoCpu); hexUI(); }; });
  }
  // Real CPU timing: real build (same as board binary), its .hex runs on emulated board
  async function buildReal() {
    building = true; buildUI();
    const r = await avrBuild(true);
    building = false; buildUI();
    if (!r) return null;
    if (lastBuild && lastBuild.real && lastBuild.key === r.key) return lastBuild;
    if (!dbgMod) dbgMod = await import('./avr-dwarf.js?v=20261028193402');
    return (lastBuild = { key: r.key, real: true, hex: r.hex, elf: r.elf, funcs: r.funcs, lines: r.lines, board: board.id, prof: null, size: r.size });
  }
  // ---------------------------------------------------------------- USB (Web Serial): upload through bootloader as avrdude does,
  // Serial monitor of real board. Port chosen once is remembered (browser keeps permission).
  const VIDS = { 0x1a86: 'CH340', 0x0403: 'FTDI', 0x2341: 'Arduino', 0x2a03: 'Arduino', 0x10c4: 'CP210x', 0x067b: 'PL2303' };
  const PIDS = { '1a86:55d4': 'CH9102', '1a86:7522': 'CH340', '1a86:7523': 'CH340', '1a86:5523': 'CH341', '0403:6001': 'FT232R', '0403:6015': 'FT231X', '10c4:ea60': 'CP2102' };
  const h4 = (v) => (v == null ? '?' : v.toString(16).padStart(4, '0'));
  const portKey = (p) => { const i = p && p.getInfo ? p.getInfo() : {}; return h4(i.usbVendorId) + ':' + h4(i.usbProductId); };
  const portName = (p) => { if (!p) return ''; const i = p.getInfo ? p.getInfo() : {}; return (PIDS[portKey(p)] || VIDS[i.usbVendorId] || 'USB serial') + (i.usbVendorId != null ? ' ' + portKey(p) : ''); };
  // closes what this page has open on port (Serial monitor) and forgets it: other programs can take port, next upload asks again
  async function usbRelease() {
    if (!usbPort) return;
    const p = usbPort;
    await boardDisconnect();
    usbPort = null; store('usbport', '');
    try { if (p.forget) await p.forget(); } catch (e) {}
    toast('Port released: ' + portName(p)); hexUI();
  }
  async function usbPick(force) {
    if (!('serial' in navigator)) { toast('USB needs Web Serial: Chrome, Edge, Opera or new Firefox on computer', true); return null; }
    if (!force && usbPort) return usbPort;
    if (!force) {
      const ports = await navigator.serial.getPorts(), saved = load('usbport');
      const p = ports.find((x) => portKey(x) === saved) || (ports.length === 1 ? ports[0] : null);
      if (p) { usbPort = p; hexUI(); return p; }
    }
    let p;
    try { p = await navigator.serial.requestPort(); } catch (e) { return null; } // dialog cancelled
    if (boardLink && p !== usbPort) await boardDisconnect();
    usbPort = p; store('usbport', portKey(p)); hexUI();
    return p;
  }
  async function usbMod() { if (!upMod) upMod = await import('./avr-upload.js?v=20261028193402'); return upMod; }
  const BOOT_BAUD = { atmega328: 115200, atmega328old: 57600, atmega2560: 115200 };
  async function upload() {
    if (!project || upBusy || avrBusy) return;
    const port = await usbPick(false); // first: chooser needs click that started it
    if (!port) return;
    upBusy = true; hexUI();
    try {
      const U = await usbMod();
      const r = await avrBuild(false);
      if (!r) return;
      showPanel('output');
      const mon = !!boardLink;
      if (mon) await boardDisconnect(true);
      const cpus = board.id === 'nano' ? [nanoCpu, nanoCpu === 'atmega328' ? 'atmega328old' : 'atmega328'] : ['atmega2560'];
      outLine(`Uploading to ${board.name} on ${portName(port)}…`);
      let done = false, err = '';
      for (const cpu of cpus) {
        const baud = BOOT_BAUD[cpu], link = new U.WebSerialLink(port);
        try { await link.open(baud); } catch (e) { err = 'cannot open port: ' + e.message + ' (taken by other program, e.g. serial monitor of Arduino IDE?)'; break; }
        try {
          outLine(`Bootloader at ${baud} baud…`);
          upPct = 0; statusUI();
          done = await U.uploadHex(link, r.hex, board.id, { log: outLine, progress: (what, i, n) => { const p = Math.floor((what === 'Writing' ? i : n + i) * 50 / n); if (p !== upPct) { upPct = p; statusUI(); } } });
        } catch (e) { err = e.message; } finally { await link.close(); }
        if (err) break;
        if (done) {
          if (board.id === 'nano' && cpu !== nanoCpu) { nanoCpu = cpu; store('nanocpu', cpu); outLine(`Board answered at ${baud} baud: bootloader is ${cpu === 'atmega328old' ? 'Old Bootloader' : 'Optiboot'} — chosen in board binary menu.`); }
          break;
        }
        outLine(`No answer at ${baud} baud.`);
      }
      if (done) { outLine('Done: sketch runs on board.'); toast('Uploaded to ' + board.name); }
      else {
        if (!err) err = 'bootloader does not answer';
        outLine('Upload failed: ' + err + '.');
        if (/answer/.test(err)) outLine('Check: board selected (Nano / Mega), USB cable with data lines, port of this board (menu → Choose port…), nothing else holds port.');
        toast('Upload failed: ' + err, true);
      }
      if (mon) await boardConnect();
    } finally { upBusy = false; upPct = -1; hexUI(); }
  }
  // Serial monitor of real board
  const SER_BAUDS = [300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 74880, 115200, 230400, 250000, 500000, 1000000, 2000000];
  async function boardConnect() {
    const port = await usbPick(false); if (!port) return;
    const U = await usbMod(), baud = +$('serbbaud').value || 9600, link = new U.WebSerialLink(port);
    try { await link.open(baud); } catch (e) { toast('Cannot open port: ' + e.message, true); return; }
    link.onData = (b) => serialWrite(b);
    link.onLost = () => { boardLink = null; serialNote('board disconnected'); serUI(); };
    boardLink = link;
    serialNote(`board on ${portName(port)}, ${baud} baud (opening port resets it)`);
    showPanel('serial'); serUI();
  }
  async function boardDisconnect(quiet) {
    const l = boardLink; boardLink = null;
    if (l) { await l.close(); if (!quiet) serialNote('board closed'); }
    serUI();
  }
  function serUI() {
    $('serbconn').classList.toggle('on', !!boardLink);
    $('serbconn').textContent = boardLink ? 'Disconnect board' : 'Connect board';
    $('serinput').placeholder = boardLink ? 'Message to board (Enter to send)' : 'Message to sketch (Enter to send)';
  }
  async function start() {
    if (!project || running || building) return;
    const b = await build();
    if (!b || running) return;
    run(b);
  }
  // cont: { t, events, seed, paused } of previous run — new build catches up to same sketch time replaying inputs
  function run(b, cont) {
    if (runner) runner.terminate();
    pinState.clear(); ledPin = null; inputsUI();
    profBuild = b.prof; profRows = new Map(); profUI(null);
    realRun = !!b.real;
    runMsgT = performance.now(); hungNote = false;
    runner = new Worker(realRun ? 'js/avr-runner.js' : 'js/runner.js', { type: 'module' });
    runner.onmessage = onRunner;
    runner.onerror = (e) => { serialNote('runner error: ' + (e.message || e)); stop(); };
    if (realRun) {
      // what page drives on pins goes to board from start (buttons held, pots)
      const pins = [], analog = [];
      for (const [pin, c] of pinCtl) { if (c.level !== undefined && c.level !== 255) pins.push({ pin, value: c.level }); if (c.analog !== undefined) analog.push({ pin, value: c.analog }); }
      lineMap = dbgMod && b.lines ? new dbgMod.LineMap(b.lines) : null; dbgSt = null; dbgPrev = null;
      // build is sketch as it is: LED window takes its WIDTH / HEIGHT (and wiring), as Get W×H
      if (sizeOverride || !cont) { const d = sketchDefs(); if (d && d.w && d.h && (d.w.value !== led.w || d.h.value !== led.h || sizeOverride)) { sizeOverride = null; pendingSize = null; sketchLayout(false); ledUI(); } }
      runner.postMessage({ type: 'run', board: b.board, hex: b.hex, elf: b.elf, funcs: b.funcs, lines: b.lines, bps: bpAddrs(), bpr: bpRanges(), pins, analog, order: wireOrder() });
      cont = null;
      profBuild = (b.funcs || []).map((f, i) => ({ id: i + 1, name: f.name, sig: funcLabel(f.name), file: f.file, line: f.line }));
      profUI(null); memLast = null; memUI(null);
    } else runner.postMessage({ type: 'run', module: b.module, board: board.id, speed: simSpeed, pace: true, wire: false, profN: b.prof ? b.prof.length : 0, seed: cont ? cont.seed : 0, ff: cont ? { t: cont.t, events: cont.events } : null });
    running = true; runStats = null; paused = false; catchUp = cont && cont.t > 0 ? { t: 0, to: cont.t } : null;
    $('pausebtn').classList.remove('paused');
    if (cont && cont.paused) setPause(true);
    const sz = sizeOverride ? ` (${sizeOverride.names.map((x) => x.join(' = ')).join(', ')})` : '';
    serialNote(cont && cont.t > 0 ? `continued at ${fmtTime(cont.t)}${sz}` : `started ${project.name} on ${board.name}${realRun ? ' (Real CPU timing)' : sz}`);
    if (!catchUp) applyPendingSize();
    else ledBufHold = true; // old frame stays until new build caught up
    if ($('ledwin').hidden) toggleLed(true);
    dbgUI(); buildUI();
  }
  // Reset: same build from start; rebuild = compile again (e.g. with new size) and start
  let ffStart = 0, snapWait = null, catchUp = null, ledBufHold = false, isoWarned = false;
  const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '.' + String(Math.floor(ms % 1000)).padStart(3, '0'); };
  function snapshot() {
    return new Promise((res) => {
      if (!runner) { res(null); return; }
      const t = setTimeout(() => { snapWait = null; res(null); }, 1500);
      snapWait = (m) => { clearTimeout(t); snapWait = null; res(m); };
      runner.postMessage({ type: 'snapshot' });
    });
  }
  // keep: new build is made while old one runs, then it continues from same sketch time (see run)
  async function restart(rebuild, keep) {
    if (building) return false;
    if (!rebuild && lastBuild && running) { serialNote('reset'); run(lastBuild); return true; }
    if (keep && running) {
      const b = await build(); if (!b) return false;
      const snap = running && catchOn ? await snapshot() : null; // catch-up off: new build starts from beginning
      run(b, snap);
      return true;
    }
    if (running) { if (runner) { runner.terminate(); runner = null; } running = false; buildUI(); }
    const b = await build();
    if (b) run(b);
    return !!b;
  }
  function stop() {
    if (runner) { runner.terminate(); runner = null; }
    if (!running) return;
    running = false; runStats = null; paused = false; catchUp = null; ledBufHold = false; applyPendingSize();
    $('pausebtn').classList.remove('paused');
    if (dbgSt) dbgResumed();
    realRun = false; dbgUI();
    ledBuf = new Uint8Array(0); ledDirty = true; $('ledfps').textContent = '';
    serialNote('stopped');
    inputsUI();
    buildUI();
  }
  // WebAssembly sketch that never returns from loop() sends nothing: after 3 s without messages page says so
  setInterval(() => {
    if (!running || realRun || paused || catchUp || building || !runMsgT || performance.now() - runMsgT < 3000) return;
    if (!hungNote) {
      hungNote = true;
      const h = diagList.find((d) => d.hang);
      outLine('Sketch does not respond: setup() / loop() has not returned for 3 s (endless loop?)' + (h ? ` — see ${h.file}:${h.line} (Problems)` : '') + '. Stop or restart it.');
      showPanel('output');
    }
    $('strunt').textContent = '⚠ Not responding (endless loop?)'; $('ledfps').textContent = '—';
  }, 1000);
  function onRunner(e) {
    const m = e.data;
    runMsgT = performance.now(); hungNote = false;
    if (m.type === 'snapshot') { if (snapWait) snapWait(m); return; }
    if (m.type === 'prof') { profUI(m); return; }
    if (m.type === 'mem') { memUI(m); return; }
    if (m.type === 'stopped') { dbgStopped(m); return; }
    if (m.type === 'started' && !m.isolated && !isoWarned) { isoWarned = true; outLine('Page is not cross-origin isolated (no COOP / COEP headers, service worker not active): waits of sketch keep one CPU core busy.'); }
    if (m.type === 'ff') { if (!m.done && !ffStart) ffStart = performance.now(); if (m.done && ffStart) { outLine(`Caught up to ${fmtTime(m.t)} in ${((performance.now() - ffStart) / 1000).toFixed(2)} s`); ffStart = 0; } catchUp = m.done ? null : { t: m.t, to: m.to }; if (m.done) { ledBufHold = false; applyPendingSize(); } buildUI(); return; }
    if (m.type === 'frame') {
      if (ledPin == null) ledPin = m.pin;
      if (m.pin === ledPin && !ledBufHold) { ledBuf = m.rgb; ledDirty = true; }
      const p = pinState.get(m.pin) || { pin: m.pin, mode: -1, out: -1, pwm: -1, read: -1, aread: -1, tone: 0 };
      if (p.leds !== m.count) { p.leds = m.count; pinState.set(m.pin, p); inputsUI(); }
    } else if (m.type === 'serial') {
      serialWrite(m.bytes);
    } else if (m.type === 'stats') {
      runStats = m;
      $('ledfps').textContent = m.fps + ' fps';
      buildUI();
    } else if (m.type === 'pins') {
      for (const p of m.list) pinState.set(p.pin, Object.assign(pinState.get(p.pin) || {}, p));
      inputsUI();
    } else if (m.type === 'baud') {
      $('serbaud').textContent = m.value + ' baud';
    } else if (m.type === 'crash') {
      serialNote('sketch crashed: ' + m.message);
      outLine('Runtime error: ' + m.message);
      toast('Sketch crashed: ' + m.message, true);
      stop();
    }
  }
  let ledPin = null;
  const pinState = new Map(); // pin → { mode, out, pwm, read, aread, tone, leds } of running sketch
  const pinCtl = new Map();   // pin → what page drives: { level: 255 | 0 | 1, analog: -1 | 0..1023 } (kept between runs)
  // Inputs window: one row per pin sketch uses
  function inputsUI() {
    const tb = $('pintable');
    const list = [...pinState.values()].filter((p) => p.mode >= 0 || p.read >= 0 || p.aread >= 0 || p.out >= 0 || p.pwm >= 0 || p.leds).sort((a, b) => a.pin - b.pin);
    $('pinnone').hidden = list.length > 0;
    const has = list.some((p) => p.mode === 0 || p.mode === 2 || p.aread >= 0);
    $('ledinputs').classList.toggle('has', has); $('ledinputs').title = has ? 'Inputs (sketch reads pins: buttons, pots)' : 'Inputs';
    const sig = list.map((p) => [p.pin, p.mode, p.leds ? 1 : 0, p.aread >= 0 ? 1 : 0].join(':')).join(',');
    if (tb.dataset.sig !== sig) { tb.dataset.sig = sig; buildPinRows(tb, list); }
    for (const p of list) { // live values
      const row = tb.querySelector(`tr[data-pin="${p.pin}"]`); if (!row) continue;
      const lv = row.querySelector('.lvl');
      if (lv && p.leds) lv.querySelector('span').textContent = p.leds + ' LEDs';
      else if (lv) {
        let v = null, t = '';
        if (p.mode === 1) { if (p.pwm >= 0) { t = 'PWM ' + p.pwm; v = p.pwm > 0; } else if (p.out >= 0) { v = !!p.out; t = p.out ? 'HIGH' : 'LOW'; } }
        else if (p.read >= 0) { v = !!p.read; t = p.read ? 'HIGH' : 'LOW'; }
        if (p.tone) t = 'tone ' + p.tone + ' Hz';
        lv.classList.toggle('hi', !!v); lv.querySelector('span').textContent = t || '—';
      }
      const av = row.querySelector('.aval'); if (av && p.aread >= 0 && (pinCtl.get(p.pin) || {}).analog === undefined) av.textContent = p.aread;
    }
  }
  function buildPinRows(tb, list) {
    tb.innerHTML = '<tr><th>Pin</th><th>Mode</th><th>State</th><th></th></tr>';
    const send = (msg) => { if (runner) runner.postMessage(msg); };
    for (const p of list) {
      const tr = document.createElement('tr'); tr.dataset.pin = p.pin;
      const mode = p.leds ? 'FastLED data' : p.mode === 2 ? 'INPUT_PULLUP' : p.mode === 0 ? 'INPUT' : p.mode === 1 ? 'OUTPUT' : p.aread >= 0 ? 'analog in' : 'input';
      tr.innerHTML = `<td class="pn">${pinName(p.pin)}</td><td class="md">${mode}</td><td>${p.leds ? `<span class="lvl"><span>${p.leds} LEDs</span></span>` : '<span class="lvl"><i></i><span>—</span></span>'}</td><td><div class="ctl"></div></td>`;
      const ctl = tr.querySelector('.ctl');
      const c = pinCtl.get(p.pin) || {}; pinCtl.set(p.pin, c);
      if (!p.leds && (p.mode === 0 || p.mode === 2 || (p.mode < 0 && p.read >= 0))) {
        const active = p.mode === 2 ? 0 : 1;
        const b = document.createElement('button'); b.className = 'btn pinbtn'; b.textContent = 'Press';
        b.title = (p.mode === 2 ? 'A button to GND: pressed = LOW' : 'A button to 5V: pressed = HIGH') + '. Hold to press; Shift+click — keep pressed.';
        const set = (v) => { c.level = v; send({ type: 'pin', pin: p.pin, value: v }); };
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (e.shiftKey || b.classList.contains('latch')) { const on = !b.classList.contains('latch'); b.classList.toggle('latch', on); b.classList.toggle('on', on); set(on ? active : 255); return; }
          b.classList.add('on'); set(active); if (e.pointerId != null) b.setPointerCapture(e.pointerId);
        });
        const up = () => { if (b.classList.contains('latch')) return; b.classList.remove('on'); set(255); };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
        ctl.appendChild(b);
        if (c.level === active) { b.classList.add('on', 'latch'); send({ type: 'pin', pin: p.pin, value: active }); }
      }
      if (p.aread >= 0) {
        const lab = document.createElement('label'); lab.className = 'chk'; lab.title = 'Unconnected: analogRead gives noise';
        lab.innerHTML = '<input type="checkbox">noise';
        const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 1023; r.value = c.analog >= 0 ? c.analog : 512;
        const o = document.createElement('output'); o.className = 'aval';
        const cb = lab.querySelector('input'); cb.checked = !(c.analog >= 0);
        const upd = () => { c.analog = cb.checked ? undefined : +r.value; o.textContent = cb.checked ? '' : r.value; r.disabled = cb.checked; send({ type: 'analog', pin: p.pin, value: cb.checked ? -1 : +r.value }); };
        r.oninput = () => { cb.checked = false; upd(); }; cb.onchange = upd;
        ctl.append(lab, r, o);
        if (c.analog >= 0) upd(); else { r.disabled = true; o.textContent = ''; }
      }
      tb.appendChild(tr);
    }
  }
  function pinName(p) {
    const a0 = board.id === 'mega' ? 54 : 14;
    return p >= a0 && p < a0 + (board.id === 'mega' ? 16 : 8) ? 'A' + (p - a0) : 'D' + p;
  }
  function buildUI() {
    const rb = $('runbtn'), vb = $('verifybtn');
    rb.classList.toggle('on', running);
    rb.title = running ? 'Stop (F5)' : 'Compile and start (F5)';
    rb.disabled = !project || (building && !running);
    vb.disabled = !project || building || running;
    $('pausebtn').disabled = !running; $('resetbtn').disabled = !running;
    vb.classList.toggle('busy', building);
    statusUI();
  }


  // ---------------------------------------------------------------- search in all files of project (toolbar box → panel Search)
  const gs = { cs: load('gscase') === '1', word: load('gsword') === '1', re: load('gsregex') === '1' };
  let searchT = 0, lastQuery = '';
  function searchRegex(q) {
    let src = gs.re ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (gs.word) src = '\\b(?:' + src + ')\\b';
    try { return new RegExp(src, gs.cs ? 'g' : 'gi'); } catch (e) { return null; }
  }
  function runSearch(show) {
    const q = $('gsearch').value;
    const box = $('searchres');
    lastQuery = q;
    if (!q) { box.innerHTML = ''; $('searchcount').textContent = ''; return; }
    if (show) showPanel('search');
    if (!project) { box.innerHTML = '<div class="snone">No project</div>'; return; }
    const re = searchRegex(q);
    if (!re) { box.innerHTML = '<div class="snone">Bad regular expression</div>'; $('searchcount').textContent = ''; return; }
    const MAX = 3000; let total = 0, files = 0;
    const frag = document.createDocumentFragment();
    for (const f of project.files) {
      if (f.kind === 'bin' || total >= MAX) continue;
      const lines = ed.text(f.id).split('\n');
      const hits = [];
      for (let i = 0; i < lines.length && total < MAX; i++) {
        re.lastIndex = 0; let m; const l = lines[i]; const ms = [];
        while ((m = re.exec(l))) { if (!m[0].length) { re.lastIndex++; continue; } ms.push([m.index, m.index + m[0].length]); }
        if (ms.length) { hits.push({ line: i + 1, text: l, ms }); total += ms.length; }
      }
      if (!hits.length) continue;
      files++;
      const grp = document.createElement('div');
      const head = document.createElement('div'); head.className = 'sfile';
      const n = hits.reduce((a, h) => a + h.ms.length, 0);
      head.innerHTML = `<span class="tw">▾</span>${esc(f.name)}<span class="cnt">${n}</span>`;
      head.onclick = () => { grp.classList.toggle('sfold'); head.querySelector('.tw').textContent = grp.classList.contains('sfold') ? '▸' : '▾'; };
      grp.appendChild(head);
      for (const h of hits) {
        const row = document.createElement('div'); row.className = 'shit';
        // context: trim long lines around first match
        const t = h.text, a0 = Math.max(0, h.ms[0][0] - 40);
        let html = '', pos = a0;
        for (const [a, b] of h.ms) { if (b <= a0) continue; html += esc(t.slice(pos, Math.max(pos, a))) + '<mark>' + esc(t.slice(Math.max(a, pos), b)) + '</mark>'; pos = b; if (pos - a0 > 300) break; }
        html += esc(t.slice(pos, Math.min(t.length, pos + 200)));
        row.innerHTML = `<span class="ln">${h.line}</span><span class="tx">${(a0 ? '…' : '') + html.replace(/^\s+/, '')}</span>`;
        row.onclick = () => { showFile(f); ed.select(h.line, h.ms[0][0], h.ms[0][1]); };
        grp.appendChild(row);
      }
      frag.appendChild(grp);
    }
    box.innerHTML = '';
    if (!total) box.innerHTML = '<div class="snone">No results</div>';
    else { const sum = document.createElement('div'); sum.className = 'snone'; sum.textContent = `${total}${total >= MAX ? '+' : ''} results in ${files} file${files > 1 ? 's' : ''}`; box.appendChild(sum); box.appendChild(frag); }
    $('searchcount').textContent = total ? String(total) + (total >= MAX ? '+' : '') : '';
  }
  function bindSearch() {
    const inp = $('gsearch');
    inp.addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(() => runSearch(true), 250); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchT); runSearch(true); const first = $('searchres').querySelector('.shit'); if (first) first.click(); }
      else if (e.key === 'Escape') { inp.value = ''; runSearch(false); inp.blur(); }
      e.stopPropagation();
    });
    for (const [id, k] of [['gscase', 'cs'], ['gsword', 'word'], ['gsregex', 're']]) {
      const b = $(id); b.classList.toggle('on', gs[k]);
      b.onclick = () => { gs[k] = !gs[k]; b.classList.toggle('on', gs[k]); store(id, gs[k] ? '1' : '0'); if (inp.value) runSearch(true); inp.focus(); };
    }
  }


  // ---------------------------------------------------------------- profile (trace, mode 1): time per sketch function
  let profOn = false, profBuild = null, profRows = new Map(), profSort = load('profsort') || 'self';
  function setProfile(on) {
    profOn = !!on;
    $('profbtn').classList.toggle('on', profOn);
    $('profbtn').textContent = profOn ? 'Profile build: on' : 'Profile build: off';
    if (running) restart(true, true); // new build continues from same moment
    profUI(null);
  }
  function profUI(m) {
    const box = $('proftable');
    if (!profBuild) {
      box.innerHTML = `<div class="snone">${realOn ? 'Real CPU timing: start sketch, CPU time of board per function is collected while it runs.' : profOn ? (running ? 'Rebuilding…' : 'Start sketch: profile build is made on start.') : 'Turn on profile build: each function of .ino files gets timer; sketch runs a bit slower.'}</div>`;
      $('profcount').textContent = ''; return;
    }
    if (!m) { box.innerHTML = '<div class="snone">Collecting…</div>'; return; }
    if (m.real) { profRealUI(m); return; }
    // smooth: keep last values, decay rows that stopped
    for (const r of profRows.values()) { r.calls *= 0.5; r.incl *= 0.5; r.self *= 0.5; r.wait *= 0.5; }
    for (const x of m.rows) profRows.set(x.id, x);
    const byId = new Map(profBuild.map((p) => [p.id, p]));
    const rows = [...profRows.values()].filter((r) => r.calls > 0.05 || r.incl > 0.0005 || r.wait > 0.0005);
    const key = { calls: (r) => r.calls, self: (r) => r.self - r.wait, total: (r) => r.incl, wait: (r) => r.wait }[profSort] || ((r) => r.self);
    rows.sort((a, b) => key(b) - key(a));
    const pct = (v) => (v * 100 < 0.05 ? '' : (v * 100).toFixed(v * 100 < 10 ? 1 : 0) + '%');
    const fmtN = (v) => (v >= 10000 ? Math.round(v / 1000) + 'k' : v >= 100 ? Math.round(v) : v >= 1 ? v.toFixed(1) : v > 0 ? v.toFixed(2) : '');
    const show = byId.get(m.show);
    let html = `<div class="profhead">${show ? `Frames drawn by <b>${esc(show.sig)}</b>` : 'No FastLED.show() yet'}${m.top && byId.get(m.top) ? ` · now in <b>${esc(byId.get(m.top).name)}</b>` : ''}</div>`;
    html += '<table class="prof"><tr>' + [['', 'Function'], ['calls', 'Calls/s'], ['self', 'Busy'], ['wait', 'Waits'], ['total', 'Total'], ['', 'Place']].map(([k, t]) => `<th${k ? ` data-k="${k}" class="sortable${k === profSort ? ' on' : ''}"` : ''}>${t}</th>`).join('') + '</tr>';
    for (const r of rows.slice(0, 200)) {
      const p = byId.get(r.id); if (!p) continue;
      html += `<tr data-id="${r.id}" class="${r.id === m.show ? 'cur' : ''}"><td class="fn">${r.id === m.show ? '▶ ' : ''}${esc(p.sig)}</td><td>${fmtN(r.calls)}</td>` +
        `<td><span class="bar" style="width:${Math.min(100, Math.max(0, (r.self - r.wait) * 100))}%"></span>${pct(Math.max(0, r.self - r.wait))}</td><td>${pct(r.wait)}</td><td>${pct(r.incl)}</td><td class="pl">${esc(p.file)}:${p.line}</td></tr>`;
    }
    html += '</table>';
    box.innerHTML = html;
    $('profcount').textContent = '';
    box.querySelectorAll('th.sortable').forEach((th) => { th.onclick = () => { profSort = th.dataset.k; store('profsort', profSort); profUI({ rows: [], show: m.show, top: m.top }); }; });
    box.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => { const p = byId.get(+tr.dataset.id); const f = p && fileByPath(p.file); if (f) { showFile(f); ed.goto(p.line, 1); } }; });
  }

  // Real CPU timing: share of CPU time per function (PC sampled ~10 000 times a second of board time; Total — with functions
  // it calls, found by return addresses on stack). Waiting in delay() is time too: micros() polling loop.
  function profRealUI(m) {
    const box = $('proftable');
    for (const r of profRows.values()) { r.incl *= 0.5; r.self *= 0.5; }
    for (const x of m.rows) profRows.set(x.id, x);
    const byId = new Map(profBuild.map((p) => [p.id, p]));
    const sum = (re, k) => { let v = 0; for (const r of profRows.values()) { const p = byId.get(r.id); if (p && re.test(p.name)) v = Math.max(v, r[k]); } return v; };
    const rows = [...profRows.values()].filter((r) => r.incl > 0.0005);
    const key = { self: (r) => r.self, total: (r) => r.incl }[profSort] || ((r) => r.self);
    rows.sort((a, b) => key(b) - key(a));
    const pct = (v) => (v * 100 < 0.05 ? '' : (v * 100).toFixed(v * 100 < 10 ? 1 : 0) + '%');
    const del = sum(/^delay(\(|$)/, 'incl'), show = sum(/::showPixels\(/, 'incl');
    let html = `<div class="profhead">CPU time of board · waiting in <b>delay()</b> ${pct(del) || '0%'} · LED data out (<b>showPixels</b>) ${pct(show) || '0%'} · interrupts ${pct(m.isr) || '0%'}</div>`;
    html += '<table class="prof"><tr>' + [['', 'Function'], ['self', 'Self'], ['total', 'Total'], ['', 'Place']].map(([k, t]) => `<th${k ? ` data-k="${k}" class="sortable${k === (profSort === 'total' ? 'total' : 'self') ? ' on' : ''}"` : ''}>${t}</th>`).join('') + '</tr>';
    for (const r of rows.slice(0, 200)) {
      const p = byId.get(r.id); if (!p) continue;
      html += `<tr data-id="${r.id}"><td class="fn">${esc(p.sig)}</td><td><span class="bar" style="width:${Math.min(100, r.self * 100)}%"></span>${pct(r.self)}</td><td>${pct(r.incl)}</td><td class="pl">${p.file ? esc(p.file) + ':' + p.line : ''}</td></tr>`;
    }
    box.innerHTML = html + '</table>';
    box.querySelectorAll('th.sortable').forEach((th) => { th.onclick = () => { profSort = th.dataset.k; store('profsort', profSort); profRealUI({ rows: [], isr: m.isr, real: true }); }; });
    box.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => { const p = byId.get(+tr.dataset.id); const f = p && p.file && fileByPath(p.file); if (f) { showFile(f); ed.goto(p.line, 1); } }; });
  }
  // name for profile: ISR vector by its name, clones of gcc marked
  const VEC328 = ['', 'INT0', 'INT1', 'PCINT0', 'PCINT1', 'PCINT2', 'WDT', 'TIMER2_COMPA', 'TIMER2_COMPB', 'TIMER2_OVF', 'TIMER1_CAPT', 'TIMER1_COMPA', 'TIMER1_COMPB', 'TIMER1_OVF',
    'TIMER0_COMPA', 'TIMER0_COMPB', 'TIMER0_OVF (millis)', 'SPI_STC', 'USART_RX (Serial)', 'USART_UDRE (Serial)', 'USART_TX', 'ADC', 'EE_READY', 'ANALOG_COMP', 'TWI (Wire)', 'SPM_READY'];
  const VEC2560 = ['', 'INT0', 'INT1', 'INT2', 'INT3', 'INT4', 'INT5', 'INT6', 'INT7', 'PCINT0', 'PCINT1', 'PCINT2', 'WDT', 'TIMER2_COMPA', 'TIMER2_COMPB', 'TIMER2_OVF',
    'TIMER1_CAPT', 'TIMER1_COMPA', 'TIMER1_COMPB', 'TIMER1_COMPC', 'TIMER1_OVF', 'TIMER0_COMPA', 'TIMER0_COMPB', 'TIMER0_OVF (millis)', 'SPI_STC', 'USART0_RX (Serial)', 'USART0_UDRE (Serial)', 'USART0_TX',
    'ANALOG_COMP', 'ADC', 'EE_READY', 'TIMER3_CAPT', 'TIMER3_COMPA', 'TIMER3_COMPB', 'TIMER3_COMPC', 'TIMER3_OVF', 'USART1_RX (Serial1)', 'USART1_UDRE (Serial1)', 'USART1_TX', 'TWI (Wire)', 'SPM_READY',
    'TIMER4_CAPT', 'TIMER4_COMPA', 'TIMER4_COMPB', 'TIMER4_COMPC', 'TIMER4_OVF', 'TIMER5_CAPT', 'TIMER5_COMPA', 'TIMER5_COMPB', 'TIMER5_COMPC', 'TIMER5_OVF',
    'USART2_RX (Serial2)', 'USART2_UDRE (Serial2)', 'USART2_TX', 'USART3_RX (Serial3)', 'USART3_UDRE (Serial3)', 'USART3_TX'];
  function funcLabel(n) {
    const v = /^__vector_(\d+)$/.exec(n);
    if (v) return 'ISR ' + ((board.id === 'mega' ? VEC2560 : VEC328)[+v[1]] || v[1]) + ' (' + n + ')';
    return n.replace(/ \[clone \.(constprop|part|isra|lto_priv)\.\d+\]/g, '');
  }

  // color order on wire for Real CPU timing: fixed strip order of Options, or sketch's own (addLeds<…, ORDER>, its #define); FastLED default RGB
  function wireOrder() {
    if (stripOrder !== 'auto') return stripOrder;
    if (!project) return 'GRB';
    const texts = project.files.filter((f) => f.kind !== 'bin').map((f) => ed.text(f.id).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''));
    const all = texts.join('\n'), ORD = /^(RGB|RBG|GRB|GBR|BRG|BGR)$/;
    const m = /\baddLeds\s*<\s*[^,<>]+,\s*[^,<>]+,\s*([A-Za-z_]\w*)\s*>/.exec(all);
    if (!m) { const two = /\baddLeds\s*<\s*(\w+)/.exec(all); return two ? (two[1] === 'NEOPIXEL' ? 'GRB' : 'RGB') : 'GRB'; } // no order given: NEOPIXEL is GRB, others RGB
    let o = m[1];
    for (let k = 0; k < 4 && !ORD.test(o); k++) { const d = new RegExp('^[ \\t]*#[ \\t]*define[ \\t]+' + o + '[ \\t]+(\\w+)', 'm').exec(all); if (!d) break; o = d[1]; }
    return ORD.test(o) ? o : 'GRB';
  }
  // ---------------------------------------------------------------- debugger (Real CPU timing): breakpoints in gutter of editor,
  // halt shows line (arrow, highlight), call stack, registers, RAM; F10 / F11 / Shift+F11 step, F5 / Space continue
  const relPath = (f) => (f.path.startsWith(project.prefix) ? f.path.slice(project.prefix.length) : f.path);
  function bpList() { // [{ f, line, at: line where it stops, ok }]
    const out = [];
    if (!project) return out;
    for (const f of project.files) {
      if (f.kind === 'bin') continue;
      for (const line of ed.breakpoints(f.id)) {
        const b = lineMap ? lineMap.breakAddrs(relPath(f), line) : null;
        out.push({ f, line, at: b && b.addrs.length ? b.line : 0, addrs: b ? b.addrs : [], ranges: b ? b.ranges : [] });
      }
    }
    return out;
  }
  function bpAddrs() { return bpList().flatMap((b) => b.addrs); }
  function bpRanges() { return bpList().flatMap((b) => b.ranges); }
  function bpSend() { if (runner && realRun) runner.postMessage({ type: 'bp', addrs: bpAddrs(), ranges: bpRanges() }); dbgUI(); }
  function funcAt(pc) {
    const fs = lastBuild && lastBuild.funcs; if (!fs) return null;
    let lo = 0, hi = fs.length - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (fs[m].addr <= pc) { k = m; lo = m + 1; } else hi = m - 1; }
    return k >= 0 ? fs[k] : null;
  }
  // frame i > 0 is return address: line of call is just before it
  const frameLine = (f, i) => (lineMap ? lineMap.at(i ? f.pc - 2 : f.pc) : null);
  function dbgStopped(m) {
    if (!m.refresh) { dbgPrev = dbgSt; }
    // stack walk is heuristic: nothing above main() (startup code, old bytes on stack) is shown
    const mi = m.frames.findIndex((f) => { const fn = funcAt(f.pc); return fn && fn.name === 'main'; });
    if (mi >= 0) m.frames = m.frames.slice(0, mi + 1);
    dbgSt = m;
    paused = true; $('pausebtn').classList.add('paused'); $('pausebtn').title = 'Continue (F5, Space)';
    if (!m.refresh) {
      let loc = null;
      if (m.reason === 'breakpoint') { const inR = (rs) => rs.some((r) => { for (let i = 0; i + 1 < r.length; i += 2) if (m.pc >= r[i] && m.pc < r[i + 1]) return true; return false; });
        const b = bpList().find((x) => x.addrs.includes(m.pc)) || bpList().find((x) => inR(x.ranges)); if (b) loc = { file: relPath(b.f), line: b.at }; } // line of breakpoint (call of inlined function: code is in callee)
      m.frames.forEach((f, i) => { if (!loc) { const l = frameLine(f, i); if (l) loc = l; } });
      m.loc = loc;
      dbgMark(loc);
      showPanel('debug');
    }
    dbgUI(); statusUI();
  }
  function dbgMark(loc) {
    if (dbgExec != null) { ed.setExec(dbgExec, null); dbgExec = null; }
    const f = loc && fileByPath(loc.file);
    if (f) { showFile(f); ed.setExec(f.id, loc.line); dbgExec = f.id; }
  }
  function dbgResumed() { dbgSt = null; dbgMark(null); dbgUI(); }
  function dbgStep(mode) { if (!runner || !realRun || !dbgSt) return; dbgResumed(); paused = false; $('pausebtn').classList.remove('paused'); runner.postMessage({ type: 'step', mode }); statusUI(); }
  function dbgUI() {
    const show = realRun && running, halted = show && !!dbgSt;
    for (const id of ['stepover', 'stepin', 'stepout']) { $(id).hidden = !show; $(id).disabled = !halted; }
    const box = $('dbgview'); if (!box) return;
    const bps = bpList();
    let h = '<div class="col"><div class="hd">Breakpoints</div><div class="bps">';
    if (!bps.length) h += '<div class="dim" style="cursor:default">Click line number to set one</div>';
    for (const [i, b] of bps.entries()) {
      const st = !lineMap ? '' : b.at ? (b.at !== b.line ? ` → ${b.at}` : '') : ' (no code)';
      h += `<div data-bp="${i}"><span class="${lineMap && !b.at ? 'off' : ''}">● ${esc(relPath(b.f))}:${b.line}</span><span class="dim">${st}</span><span class="x" data-x="${i}" title="Remove">×</span></div>`;
    }
    h += '</div>';
    if (!realOn) h += '<div class="dim" style="margin-top:6px;max-width:320px">Debugger works in Real CPU timing (chip button): breakpoints stop board there; F10 step over, F11 step into, Shift+F11 step out, F5 / Space continue.</div>';
    h += '</div>';
    if (halted) {
      const m = dbgSt;
      h += '<div class="col"><div class="hd">Call stack · ' + esc(m.reason) + ' · ' + fmtTime(m.ms) + '</div><div class="stack">';
      m.frames.forEach((f, i) => {
        const fn = funcAt(f.pc), l = frameLine(f, i);
        h += `<div data-fr="${i}" class="${i === 0 ? 'cur' : ''}">${esc(fn ? funcLabel(fn.name).replace(/\(.*$/, '()') : '0x' + f.pc.toString(16))} <span class="dim">${l ? esc(l.file) + ':' + l.line : '0x' + f.pc.toString(16)}</span></div>`;
      });
      h += '</div></div>';
      const r = m.regs, pr = dbgPrev && dbgPrev.regs, hx = (v, n = 2) => v.toString(16).toUpperCase().padStart(n, '0');
      const cell = (i) => `<td class="n">r${i}</td><td class="${pr && pr[i] !== r[i] ? 'ch' : ''}">${hx(r[i])}</td>`;
      h += '<div class="col"><div class="hd">Registers</div><table class="regs">';
      for (let i = 0; i < 8; i++) h += `<tr>${cell(i)}${cell(i + 8)}${cell(i + 16)}${cell(i + 24)}</tr>`;
      const w = (lo) => hx(r[lo] | (r[lo + 1] << 8), 4), fl = 'ITHSVNZC'.split('').map((c, i) => ((m.sreg >> (7 - i)) & 1 ? c : c.toLowerCase())).join('');
      h += `<tr><td class="n">X</td><td>${w(26)}</td><td class="n">Y</td><td>${w(28)}</td><td class="n">Z</td><td>${w(30)}</td><td class="n">SP</td><td>${hx(m.sp, 4)}</td></tr>`;
      h += `<tr><td class="n">PC</td><td>${hx(m.pc, 4)}</td><td class="n">SREG</td><td colspan="3">${fl}</td><td class="n">cyc</td><td>${m.cycles}</td></tr></table></div>`;
      // RAM: 16 × 16 bytes from address box; changed since previous halt highlighted
      const base = m.ramStart || 0x100, end = base + m.ram.length, a0 = Math.max(base, Math.min(end - 256, dbgMemAddr & ~15));
      h += `<div class="col"><div class="hd">RAM <input class="memad" id="dbgmemad" value="${hx(a0, 4)}" title="Address (hex), Enter"> <a href="#" data-go="${base}">variables</a> · <a href="#" data-go="${m.sp + 1}">stack</a></div><pre class="mem">`;
      for (let a = a0; a < a0 + 256 && a < end; a += 16) {
        let hexs = '', asc = '';
        for (let k = 0; k < 16; k++) {
          const v = m.ram[a + k - base], ch = dbgPrev && dbgPrev.ram && dbgPrev.ram[a + k - base] !== v;
          hexs += (ch ? `<span class="ch">${hx(v)}</span>` : hx(v)) + (k === 7 ? '  ' : ' ');
          asc += v >= 32 && v < 127 ? esc(String.fromCharCode(v)) : '.';
        }
        h += `<span class="dim">${hx(a, 4)}</span>  ${hexs} ${asc}\n`;
      }
      h += '</pre></div>';
    }
    box.innerHTML = h;
    box.querySelectorAll('[data-bp]').forEach((d) => { d.onclick = (e) => { const b = bps[+d.dataset.bp]; if (e.target.dataset.x != null) { ed.setBreakpoints(b.f.id, ed.breakpoints(b.f.id).filter((l) => l !== b.line)); bpSend(); return; } showFile(b.f); ed.goto(b.at || b.line, 1); }; });
    box.querySelectorAll('[data-fr]').forEach((d) => { d.onclick = () => { const i = +d.dataset.fr, l = frameLine(dbgSt.frames[i], i), f = l && fileByPath(l.file); if (f) { showFile(f); ed.goto(l.line, 1); } }; });
    box.querySelectorAll('[data-go]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); dbgMemAddr = +a.dataset.go; dbgUI(); }; });
    const ma = $('dbgmemad'); if (ma) ma.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { const v = parseInt(ma.value, 16); if (v >= 0) { dbgMemAddr = v; dbgUI(); } } };
  }
  // Real CPU timing: RAM of board — variables, heap, stack, free (high-water marks from painted RAM)
  let memLast = null;
  function memUI(m) {
    const box = $('memview');
    if (m) memLast = m; else m = memLast;
    const b = lastBuild && lastBuild.real ? lastBuild : null;
    if (!m || !realRun) {
      box.innerHTML = '<div class="note">' + (realOn ? 'Start sketch: memory of board is shown while it runs.' : 'Memory of board (variables, heap, stack, free RAM) is tracked in <b>Real CPU timing</b> (chip button in toolbar).') + '</div>';
      $('memdot').hidden = true; return;
    }
    const W = (v) => (v / m.ram * 100).toFixed(2) + '%', B = (v) => v + ' B';
    const heap = Math.max(m.heap, m.heapMax), free = Math.max(0, m.freeMin);
    const seg = (k, v, t) => (v > 0 ? `<span class="k-${k}" style="width:${W(v)}" title="${t}: ${v} B"></span>` : '');
    let h = '';
    if (b && b.size) h += `<div class="hd">Flash ${b.size.flash} of ${b.size.maxFlash} B (${Math.floor(b.size.flash * 100 / b.size.maxFlash)}%)</div><div class="mbar"><span class="k-flash" style="width:${(b.size.flash / b.size.maxFlash * 100).toFixed(2)}%"></span></div>`;
    h += `<div class="hd">RAM ${m.ram} B · board time ${fmtTime(m.ms)}</div><div class="mbar">${seg('data', m.data, 'Initialized variables (.data)')}${seg('bss', m.bss, 'Zeroed variables (.bss)')}${seg('heap', heap, 'Heap (max)')}${seg('free', free, 'Never used')}${seg('stack', m.stackMax, 'Stack (max)')}</div>`;
    const row = (k, name, now, max, note) => `<tr><td>${k ? `<span class="sw k-${k}"></span>` : ''}${name}</td><td class="v">${now}</td><td class="v">${max}</td><td class="note">${note || ''}</td></tr>`;
    h += '<table><tr><td></td><td class="v hd">Now</td><td class="v hd">Max / min</td><td></td></tr>';
    h += row('data', 'Variables (.data + .bss)', B(m.data + m.bss), '', `.data ${m.data} B (initialized, copied from flash), .bss ${m.bss} B`);
    h += row('heap', 'Heap (malloc, new, String)', B(m.heap), B(m.heapMax), '');
    h += row('stack', 'Stack (calls, local variables, interrupts)', B(m.stack), B(m.stackMax), '');
    const low = m.freeMin < 100;
    h += `<tr><td><span class="sw" style="border:1px solid var(--line)"></span>Free between heap and stack</td><td class="v">${B(m.free)}</td><td class="v${low ? ' bad' : ''}">min ${B(Math.max(0, m.freeMin))}</td><td class="note">${low ? 'little reserve: deeper calls or bigger locals can overwrite variables' : ''}</td></tr></table>`;
    if (m.collide >= 0) h += `<div class="bad" style="margin-top:8px">Stack ran into heap / variables at ${fmtTime(m.collide)} of board time: memory is corrupted, sketch may behave oddly or reset.</div>`;
    h += '<div class="note">Max / min are high-water marks since start: free RAM is filled with pattern at reset, stack and heap overwrite it as they grow.</div>';
    box.innerHTML = h;
    const warn = m.collide >= 0 || low;
    if (warn && $('memdot').hidden && m.collide >= 0) toast('Stack ran into variables: see Memory in panel', true);
    $('memdot').hidden = !warn;
  }

  // ---------------------------------------------------------------- bottom panel: Problems / Output / Serial monitor
  let panelTab = load('ptab') || 'output';
  function showPanel(tab, toggle) {
    const p = $('panel');
    if (toggle && !p.hidden && (!tab || tab === panelTab)) { p.hidden = true; store('panel', '0'); panelUI(); return; }
    if (tab) { panelTab = tab; store('ptab', tab); }
    p.hidden = false; store('panel', '1');
    panelUI();
    if (panelTab === 'serial') { const o = $('serialout'); o.scrollTop = o.scrollHeight; }
    if (panelTab === 'output') { const o = $('output'); o.scrollTop = o.scrollHeight; }
  }
  function panelUI() {
    const p = $('panel');
    p.querySelectorAll('.ptabs button').forEach((b) => b.classList.toggle('on', b.dataset.p === panelTab));
    p.querySelectorAll('.ppane').forEach((x) => { x.hidden = x.dataset.p !== panelTab; });
    $('pserial').hidden = panelTab !== 'serial';
    $('panelbtn').classList.toggle('on', !p.hidden);
    ed.refresh();
  }
  const MAXOUT = 400000;
  function outClear() { $('output').textContent = ''; }
  function outText(t) {
    const o = $('output'), stick = o.scrollTop + o.clientHeight >= o.scrollHeight - 4;
    o.textContent += t.endsWith('\n') ? t : t + '\n';
    if (o.textContent.length > MAXOUT) o.textContent = o.textContent.slice(-MAXOUT);
    if (stick) o.scrollTop = o.scrollHeight;
  }
  function outLine(l) { outText(l + '\n'); }
  const serialDec = new TextDecoder();
  let serialText = '', serialT = 0;
  function serialWrite(bytes) {
    serialText += serialDec.decode(bytes, { stream: true }).replace(/\r\n?/g, '\n');
    if (!serialT) serialT = requestAnimationFrame(serialFlush);
  }
  function serialNote(s) { serialText += (serialText.endsWith('\n') || !($('serialout').textContent + serialText) ? '' : '\n') + '— ' + s + ' —\n'; if (!serialT) serialT = requestAnimationFrame(serialFlush); }
  function serialFlush() {
    serialT = 0;
    if (!serialText) return;
    const o = $('serialout'), stick = $('serscroll').checked;
    let t = o.textContent + serialText; serialText = '';
    if (t.length > MAXOUT) t = t.slice(-MAXOUT);
    o.textContent = t;
    if (stick) o.scrollTop = o.scrollHeight;
    if ($('panel').hidden || panelTab !== 'serial') $('pserialdot').hidden = false;
  }
  function sendSerial() {
    const inp = $('serinput'); const v = inp.value + JSON.parse('"' + $('sereol').value + '"');
    if (boardLink) { boardLink.send(new TextEncoder().encode(v)).catch((e) => toast('Board: ' + e.message, true)); inp.value = ''; return; }
    if (!running) { toast('Sketch is not running'); return; }
    runner.postMessage({ type: 'serial', port: 0, bytes: new TextEncoder().encode(v) });
    inp.value = '';
  }
  let diagList = [];
  function showDiagnostics(diags, fixes) {
    // editor marks: per file
    const per = new Map();
    for (const f of (project ? project.files : [])) if (f.kind !== 'bin') per.set(f, []);
    const list = [];
    for (const d0 of diags) {
      let d = d0;
      if (d.severity === 'note' && !/^(candidate|previous|declared|in instantiation)/.test(d.message)) continue;
      // comparison that is always true in loop condition: loop never ends, sketch hangs there (shown even with warnings off)
      if (/^result of comparison of constant .* is always true/.test(d.message)) d = Object.assign({}, d, { message: d.message + ' — loop with this condition never ends, sketch hangs here (counter type too small: e.g. byte i < NUM_LEDS with 256 LEDs or more, as after size rebuild)', hang: true });
      const f = fileByPath(d.file);
      if (f && per.has(f) && d.severity !== 'note') per.get(f).push(d);
      list.push(Object.assign({}, d, { f }));
    }
    for (const fx of fixes) {
      const f = fileByPath(fx.file);
      const d = { file: fx.file, line: fx.line, col: 1, severity: 'warning', message: `-fpermissive: invalid conversion, cast to '${fx.type}' added (g++ of Arduino IDE gives warning here). ${fx.msg}`, f };
      list.push(d); if (f && per.has(f)) per.get(f).push(d);
    }
    for (const [f, l] of per) ed.setDiagnostics(f.id, l);
    diagList = list;
    const hang = list.find((d) => d.hang);
    if (hang) toast(`Sketch can hang: ${hang.file}:${hang.line} — loop counter never reaches its limit (see Problems)`, true);
    const box = $('problems'); box.innerHTML = '';
    let ne = 0, nw = 0;
    for (const d of list) {
      if (d.severity === 'error') ne++; else if (d.severity === 'warning') nw++;
      const row = document.createElement('div');
      row.className = 'prob ' + d.severity;
      row.innerHTML = `<span class="pic">${d.severity === 'error' ? '⊗' : d.severity === 'warning' ? '⚠' : 'ⓘ'}</span><span class="pmsg">${esc(d.message)}</span><span class="ploc">${esc((d.file || '') + (d.line ? ':' + d.line + ':' + d.col : ''))}</span>`;
      row.onclick = () => gotoDiag(d);
      box.appendChild(row);
    }
    if (!list.length) box.innerHTML = '<div class="pnone">No problems have been detected.</div>';
    $('probcount').textContent = ne + nw ? String(ne + nw) : '';
    $('sterr').textContent = ne; $('stwarn').textContent = nw;
  }
  function gotoDiag(d) {
    const f = d.f || fileByPath(d.file);
    if (!f || f.kind === 'bin') return;
    showFile(f);
    ed.goto(d.line, Math.max(1, d.col));
  }
  function bindPanel() {
    const p = $('panel');
    p.querySelectorAll('.ptabs button').forEach((b) => { b.onclick = () => { showPanel(b.dataset.p); if (b.dataset.p === 'serial') $('pserialdot').hidden = true; }; });
    $('pclose').onclick = () => { p.hidden = true; store('panel', '0'); panelUI(); };
    $('pclear').onclick = () => {
      if (panelTab === 'serial') $('serialout').textContent = '';
      else if (panelTab === 'output') outClear();
    };
    $('serinput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendSerial(); } });
    $('sersend').onclick = sendSerial;
    $('serscroll').checked = load('serscroll') !== '0';
    $('serscroll').onchange = () => store('serscroll', $('serscroll').checked ? '1' : '0');
    const eol = load('sereol'); if (eol != null) $('sereol').value = eol;
    $('sereol').onchange = () => store('sereol', $('sereol').value);
    // height: drag top edge
    const h = +load('panelh'); if (h > 60) p.style.height = h + 'px';
    const rz = $('panelrz'); let st = null;
    rz.addEventListener('pointerdown', (e) => { st = { y: e.clientY, h: p.offsetHeight, id: e.pointerId }; rz.setPointerCapture(e.pointerId); e.preventDefault(); });
    rz.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const nh = Math.max(80, Math.min(window.innerHeight - 140, st.h - (e.clientY - st.y)));
      p.style.height = nh + 'px'; ed.refresh();
    });
    const end = () => { if (!st) return; st = null; store('panelh', String(p.offsetHeight)); };
    rz.addEventListener('pointerup', end); rz.addEventListener('pointercancel', end);
    p.hidden = load('panel') !== '1';
    showDiagnostics([], []);
    panelUI();
    $('stprob').onclick = () => showPanel('problems', true);
  }
  // ---------------------------------------------------------------- help
  // text file of site in own window: changes.txt scrolled to end (newest version), its text cannot be selected or copied;
  // LICENSE from top, as any text
  const showChanges = () => showText('changes.txt', 'Changes', true);
  async function showText(file, title, locked) {
    const w = $('chwin'), pre = $('chtext');
    if (!w.dataset.bound) {
      w.dataset.bound = '1';
      floatWin(w, 'chpos', centerPos(w)); resizable(w, 'chsz', 300, 200);
      for (const ev of ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart']) w.addEventListener(ev, (e) => { if (w.classList.contains('locked')) e.preventDefault(); });
    }
    w.querySelector('h2').textContent = title; w.setAttribute('aria-label', title); w.classList.toggle('locked', !!locked);
    w.hidden = false;
    if (pre.dataset.file !== file) {
      pre.dataset.file = file; pre.textContent = '';
      try { const r = await fetch(file + '?v=' + VERSION, { cache: 'no-cache' }); pre.textContent = r.ok ? await r.text() : file + ': HTTP ' + r.status; }
      catch (err) { pre.textContent = file + ': ' + err.message; }
    }
    const b = w.querySelector('.body'); b.scrollTop = locked ? b.scrollHeight : 0;
  }
  function bindHelp() {
    const w = $('helpwin');
    floatWin(w, 'helppos', centerPos(w));
    resizable(w, 'helpsz', 300, 200);
    new MutationObserver(() => $('helpbtn').classList.toggle('on', !w.hidden)).observe(w, { attributes: true, attributeFilter: ['hidden'] });
  }

  // ---------------------------------------------------------------- template
  const TEMPLATE = `// New FastLED sketch: 16x16 zigzag matrix on pin 6
#include <FastLED.h>

#define LED_PIN     6
#define WIDTH       16
#define HEIGHT      16
#define NUM_LEDS    (WIDTH * HEIGHT)
#define BRIGHTNESS  64
#define COLOR_ORDER GRB

#define MATRIX_TYPE      0  // 0 - zigzag, 1 - parallel
#define CONNECTION_ANGLE 0  // 0 - bottom left, 1 - top left, 2 - top right, 3 - bottom right
#define STRIP_DIRECTION  0  // 0 - right, 1 - up, 2 - left, 3 - down

CRGB leds[NUM_LEDS];

uint16_t XY(uint8_t x, uint8_t y) {       // x, y from bottom left corner
  if ((y & 1) == 0 || MATRIX_TYPE) return y * WIDTH + x;
  return y * WIDTH + WIDTH - 1 - x;
}

void setup() {
  FastLED.addLeds<WS2812B, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop() {
  uint8_t t = millis() / 10;
  for (uint8_t y = 0; y < HEIGHT; y++)
    for (uint8_t x = 0; x < WIDTH; x++)
      leds[XY(x, y)] = CHSV(t + x * 8 + y * 8, 255, 255);
  FastLED.show();
  delay(10);
}
`;

  // ---------------------------------------------------------------- wiring
  function bind() {
    $('loadbtn').onclick = () => loadMenu();
    $('hexbtn').onclick = () => { hexUI(); popup($('hexpop'), $('hexbtn')); };
    $('hexpop').querySelectorAll('button.mi').forEach((b) => {
      b.onclick = () => avrGet(b.dataset.get);
    });
    $('uploadbtn').onclick = () => upload();
    $('boardsel').onchange = () => { const b = BOARDS.find((x) => x.id === $('boardsel').value); if (b) setBoard(b); $('boardsel').blur(); };
    dbgUI();
    $('stepover').onclick = () => dbgStep('over'); $('stepin').onclick = () => dbgStep('into'); $('stepout').onclick = () => dbgStep('out');
    $('uploadm').onclick = () => { upUI(); popup($('uppop'), $('uploadm')); };
    $('upgo').onclick = () => { $('uppop').hidden = true; upload(); };
    $('upport').onclick = () => { $('uppop').hidden = true; usbPick(true).then((p) => { if (p) toast('Port: ' + portName(p)); }); };
    $('uprel').onclick = () => { $('uppop').hidden = true; usbRelease(); };
    $('uphelp').onclick = () => { $('uppop').hidden = true; showHelp('usb'); };
    const sb = $('serbbaud'), sbv = +load('serbaud') || 9600;
    sb.innerHTML = SER_BAUDS.map((v) => `<option value="${v}"${v === sbv ? ' selected' : ''}>${v} baud</option>`).join('');
    sb.onchange = async () => { store('serbaud', sb.value); if (boardLink) { await boardDisconnect(true); await boardConnect(); } };
    $('serbconn').onclick = () => (boardLink ? boardDisconnect() : boardConnect());
    if ('serial' in navigator) navigator.serial.addEventListener('disconnect', (e) => { if (e.target === usbPort && boardLink) boardDisconnect(); });
    else $('uploadbtn').title = 'Upload to board over USB: needs Web Serial (Chrome, Edge, Opera or new Firefox on computer)';
    $('wload').onclick = () => $('fileinp').click();
    $('wlib').onclick = () => loadMenu($('wlib'));
    $('ldlocal').onclick = () => { $('loadpop').hidden = true; $('fileinp').click(); };
    $('libfilter').oninput = () => libUI();
    $('libfilter').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') $('loadpop').hidden = true; if (e.key === 'Enter') { const b = $('liblist').querySelector('button'); if (b) b.click(); } };
    $('fileinp').onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };
    $('wnew').onclick = newSketch;
    $('savebtn').onclick = saveProject;
    $('runbtn').onclick = () => (running ? stop() : start());
    $('pausebtn').onclick = () => { if (running) setPause(!paused); };
    $('resetbtn').onclick = () => { if (running) restart(false); };
    $('verifybtn').onclick = () => { if (!running) build().then((b) => { if (b) toast('Compiled: no errors'); }); };
    $('panelbtn').onclick = () => showPanel(null, true);
    $('ledbtn').onclick = () => toggleLed();
    $('optbtn').onclick = () => { if ($('options').hidden) showOptions(); else $('options').hidden = true; };
    $('helpbtn').onclick = () => { const w = $('helpwin'); w.hidden = !w.hidden; };
    $('helplang').onclick = () => setHelpLang(helpLang === 'en' ? 'ru' : 'en');
    setHelpLang(helpLang);
    $('themebtn').onclick = () => { themeSel = DARK_THEMES.includes(resolveTheme()) ? 'light-plus' : 'dark-plus'; store('theme', themeSel); applyTheme(); };
    $('stboard').onclick = () => showOptions('board');
    $('sttab').onclick = () => showOptions('editor');
    new MutationObserver(() => $('optbtn').classList.toggle('on', !$('options').hidden)).observe($('options'), { attributes: true, attributeFilter: ['hidden'] });

    document.addEventListener('keydown', (e) => {
      const k = e.key, ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && !e.altKey && (k === 'o' || k === 'O')) { e.preventDefault(); $('fileinp').click(); }
      else if (ctrl && !e.altKey && (k === 's' || k === 'S')) { e.preventDefault(); saveProject(); }
      else if (ctrl && k === ',') { e.preventDefault(); if ($('options').hidden) showOptions(); else $('options').hidden = true; }
      else if (ctrl && !e.shiftKey && (k === 'h' || k === 'H') && project) { e.preventDefault(); ed.find(); }
      else if (k === 'F5' && dbgSt && !e.shiftKey) { e.preventDefault(); setPause(false); }
      else if (k === 'F5') { e.preventDefault(); if (project) (running ? stop() : start()); }
      else if (k === 'F10') { e.preventDefault(); dbgStep('over'); }
      else if (k === 'F11') { e.preventDefault(); dbgStep(e.shiftKey ? 'out' : 'into'); }
      else if (ctrl && !e.shiftKey && !e.altKey && (k === 'u' || k === 'U')) { e.preventDefault(); if (project) upload(); }
      else if (k === 'F7' || (ctrl && !e.shiftKey && (k === 'r' || k === 'R'))) { e.preventDefault(); if (project && !running) $('verifybtn').click(); }
      else if (ctrl && e.shiftKey && (k === 'f' || k === 'F')) { e.preventDefault(); const g = $('gsearch'); const sel = window.getSelection().toString(); if (sel && !sel.includes('\n')) g.value = sel; g.focus(); g.select(); if (g.value) runSearch(true); }
      else if (ctrl && (k === 'j' || k === 'J')) { e.preventDefault(); showPanel(null, true); }
      else if (ctrl && e.shiftKey && (k === 'm' || k === 'M')) { e.preventDefault(); showPanel('problems'); }
      else if (k === 'F6') { e.preventDefault(); toggleLed(); }
      else if (k === 'F1') { e.preventDefault(); const w = $('helpwin'); w.hidden = !w.hidden; }
      else if (k === ' ' && running && !ctrl && !e.altKey && !e.target.closest('input, textarea, select, button, [contenteditable], .cm-editor')) { e.preventDefault(); setPause(!paused); }
      else if (e.altKey && !ctrl && /^Digit[1-9]$/.test(e.code) && project) {
        const tabs = project.files.filter((f) => f.kind !== 'bin'); const f = tabs[+e.code.slice(5) - 1];
        if (f) { e.preventDefault(); showFile(f); }
      } else if (k === 'Escape' && [...document.querySelectorAll('.hpop')].some((p) => !p.hidden)) {
        document.querySelectorAll('.hpop').forEach((p) => { p.hidden = true; }); e.preventDefault();
      } else if (k === 'Escape' && !e.target.closest('#editor')) {
        const w = topVisibleWin(); if (w) { w.hidden = true; e.preventDefault(); }
      }
    });
    // drag & drop of project / files anywhere on page
    let dragN = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragN++; document.body.classList.add('drag'); });
    document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; document.body.classList.remove('drag'); } });
    document.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragN = 0; document.body.classList.remove('drag'); loadFiles(e.dataTransfer.files); });
    window.addEventListener('beforeunload', (e) => { if (!edOpts.keep && modified()) { e.preventDefault(); e.returnValue = ''; } else saveSession(); });
  }

  // test hooks (headless tests)
  window.WFL = { get view3d() { return view3d; }, get project() { return project; }, ed, led, get ledBuf() { return ledBuf; }, get running() { return running; }, get building() { return building; },
    get compilerState() { return compilerState; }, get runStats() { return runStats; }, get diagnostics() { return diagList; }, get pins() { return pinState; }, runSearch, setProfile, get profRows() { return profRows; }, get profBuild() { return profBuild; }, get paused() { return paused; }, setSpeed, setReal, get realOn() { return realOn; }, setPause, restart, parseSize, fitWin,
    get lineMap() { return lineMap; }, pixelNumber, sketchLayout, start, stop, build, setLed, setBoard: (id) => setBoard(BOARDS.find((b) => b.id === id)), VERSION };

  // ---------------------------------------------------------------- Offline (service worker sw.js): page, scripts, compilers and
  // library kept in browser
  const SW_OK = 'serviceWorker' in navigator && BUILD !== 'dev' && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
  let swErr = '';
  const optOpen = () => !$('options').hidden && !$('options').querySelector('[data-pane="offline"]').classList.contains('gone');
  async function swStart() {
    if (!SW_OK) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (optOpen()) offUI(); }); // took over this page: tab shows it
    try { await navigator.serviceWorker.register('sw.js?v=' + BUILD); swErr = ''; } catch (e) { swErr = /404|fetch|bad http|not found/i.test(e.message) ? 'sw.js not found on server' : 'sw.js: ' + e.message; }
    if (optOpen()) offUI();
  }
  function swAsk(msg) { // → answer of active service worker (null: none)
    return new Promise((res) => {
      const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (!c) { res(null); return; }
      const ch = new MessageChannel(); ch.port1.onmessage = (e) => res(e.data); c.postMessage(msg, [ch.port2]); setTimeout(() => res(null), 3000);
    });
  }
  const offMsg = (t, err) => { $('offstat').textContent = t; $('offstat').hidden = !t; $('offstat').classList.toggle('err', !!err); };
  async function offUI() {
    if (!SW_OK) { offMsg(BUILD === 'dev' ? 'dev build: no offline copy' : 'needs https', true); $('ofmake').disabled = $('ofclear').disabled = true; return; }
    const a = await swAsk({ cmd: 'list' });
    if (!a) { offMsg(swErr || 'offline copy starts after page reload', !!swErr); return; } // not running yet
    const has = (re) => a.urls.some((u) => re.test(u));
    const parts = [has(/\/rt\/wfl-sdk\.tar\.gz$/) && has(/\/rt\/llvm\.core4\.wasm\.gz$/) ? 'compiler' : '', has(/\/rt\/avr\/avr-sdk\.tar\.gz$/) && has(/\/rt\/avr\/lto1\.wasm\.gz$/) ? 'avr-gcc' : '', has(/\/repo\/index\.json$/) ? 'library' : ''].filter(Boolean);
    const files = a.urls.filter((u) => /\/(rt|repo)\/|\/pattern\.c$/i.test(u)).length;
    let est = ''; try { const e = await navigator.storage.estimate(); if (e && e.usage) est = ', ' + (e.usage / 1048576).toFixed(1) + ' MB used'; } catch (e) {}
    offMsg('build ' + a.build + '\n' + files + ' files kept' + (parts.length ? ' (' + parts.join(', ') + ')' : '') + est);
  }
  async function fetchKeep(url) { // through service worker, which keeps copy
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
    if (/text\/html/i.test(r.headers.get('content-type') || '')) throw new Error(url + ': web page instead of file');
    return r.arrayBuffer();
  }
  async function makeOffline() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) { await offUI(); return; }
    $('ofmake').disabled = true;
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
    const jobs = [];
    if ($('of_clang').checked) {
      let parts = {}; try { parts = (await (await fetch('rt/version.json', { cache: 'no-cache' })).json()).parts || {}; } catch (e) {}
      for (const f of ['version.json', 'clang.js', 'llvm-resources.tar.gz', 'llvm.core.wasm.gz', 'llvm.core2.wasm.gz', 'llvm.core3.wasm.gz', 'llvm.core4.wasm.gz', 'wfl-sdk.tar.gz']) {
        if (parts[f]) for (let i = 1; i <= parts[f]; i++) jobs.push('rt/' + f.replace(/\.gz$/, '.p' + i + '.gz')); else jobs.push('rt/' + f);
      }
    }
    if ($('of_avr').checked) {
      jobs.push('rt/avr/avr.json');
      try { const m = await (await fetch('rt/avr/avr.json', { cache: 'no-cache' })).json(); jobs.push('rt/avr/' + m.sdk, ...Object.values(m.tools).map((t) => 'rt/avr/' + t.file)); } catch (e) {}
    }
    if ($('of_repo').checked) {
      jobs.push('pattern.c', 'repo/index.json');
      try { const j = await (await fetch('repo/index.json', { cache: 'no-cache' })).json(); for (const it of (Array.isArray(j) ? j : j.items || [])) { const f = typeof it === 'string' ? it : it.file; if (f) jobs.push('repo/' + f); } } catch (e) {}
    }
    let bad = 0;
    for (const [i, u] of jobs.entries()) {
      offMsg(`Downloading ${i + 1} / ${jobs.length}: ${u}`);
      try { await fetchKeep(u); } catch (e) { bad++; }
    }
    $('ofmake').disabled = false;
    await offUI();
    if (bad) offMsg($('offstat').textContent + `\n${bad} file${bad > 1 ? 's' : ''} could not be downloaded`, true);
  }
  function bindOffline() {
    for (const k of ['clang', 'avr', 'repo']) { const c = $('of_' + k); c.checked = load('of' + k) !== '0'; c.onchange = () => store('of' + k, c.checked ? '1' : '0'); }
    $('ofmake').onclick = makeOffline;
    $('ofclear').onclick = async () => { if (!await askOk('Drop downloaded files of offline copy (compilers, library)? Editor and emulator stay.')) return; await swAsk({ cmd: 'clear' }); offUI(); };
    $('options').querySelector('.tabs button[data-tab="offline"]').addEventListener('click', () => offUI());
    new MutationObserver(() => { if (optOpen()) offUI(); }).observe($('options'), { attributes: true, attributeFilter: ['hidden'] });
  }
  // site answering? HEAD of page (service worker passes it to server), 5 s at most; at start, and with option every 20 s,
  // on network change and when page comes back. Options / Offline: "offline" in LED window, on by default
  let netOff = false;
  async function netProbe() {
    if (!/^https?:$/.test(location.protocol)) return;
    const ac = window.AbortController ? new AbortController() : null, t = ac && setTimeout(() => ac.abort(), 5000);
    let ok = false;
    try { const r = await fetch(location.pathname + '?ping=' + Date.now(), { method: 'HEAD', cache: 'no-store', signal: ac && ac.signal }); ok = r.status > 0; } catch (e) { ok = false; }
    clearTimeout(t);
    netOff = !ok || navigator.onLine === false; netLabel();
  }
  function netLabel() { $('lednet').textContent = netOff && load('offlabel') !== '0' ? 'offline' : ''; }
  function bindNet() {
    $('of_label').checked = load('offlabel') !== '0';
    $('of_label').onchange = () => { store('offlabel', $('of_label').checked ? '1' : '0'); netLabel(); };
    const poll = () => load('offpoll') === '1';
    $('of_poll').checked = poll();
    $('of_poll').onchange = () => { store('offpoll', $('of_poll').checked ? '1' : '0'); if (poll()) netProbe(); };
    window.addEventListener('online', () => { if (poll()) netProbe(); }); window.addEventListener('offline', () => { if (poll()) { netOff = true; netLabel(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && poll()) netProbe(); });
    setInterval(() => { if (!document.hidden && poll()) netProbe(); }, 20000);
    netProbe();
  }
  // home-screen app (iOS) keeps its index.html for long: look for newer build on server; 'reload' fetch also refreshes
  // browser's cached copy, so one reload is enough
  async function checkUpdate() {
    if (BUILD === 'dev' || location.protocol === 'file:') return;
    try {
      const r = await fetch(location.pathname, { cache: 'reload' });
      if (!r.ok) return;
      const m = /<meta name="build" content="([^"]+)"/.exec(await r.text());
      if (!m || m[1] === BUILD) return;
      let tries = 0; try { tries = +sessionStorage.getItem('wfl.upd') || 0; sessionStorage.setItem('wfl.upd', String(tries + 1)); } catch (e) {}
      if (tries >= 2) return; // server / proxy keeps old page: no loop
      saveSession();
      toast('New version — reloading…');
      setTimeout(() => location.reload(), 600);
    } catch (e) {}
  }

  buildBoards(); bindOptions(); bindLed(); bindHelp(); bindPanel(); bindSearch(); bind(); bindOffline(); bindNet();
  $('profbtn').onclick = () => setProfile(!profOn); profUI(null);
  applyTheme(); applyEdOpts(); projectUI();
  requestAnimationFrame(frame);
  restoreSession();
  checkUpdate();
  swStart(); // offline copy (sw.js)
})();
