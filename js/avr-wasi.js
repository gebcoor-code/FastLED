// Web FastLED: WASI runtime for avr-gcc toolchain compiled to WebAssembly (avr-gcc / avr-g++ driver, cc1, cc1plus,
// collect2, lto-wrapper, lto1, as, ld, ar, objcopy, size). All tools share one in-memory file system. A tool starts
// another one (driver → cc1plus → as …, ld → LTO plugin → lto-wrapper → lto1) through import wfl.spawn: child runs
// synchronously, with its stdin / stdout / stderr on descriptors of parent. ES module: compiler worker and node tests.

const E = { SUCCESS: 0, BADF: 8, EXIST: 20, INVAL: 28, ISDIR: 31, NOENT: 44, NOSYS: 52, NOTDIR: 54, NOTEMPTY: 55, SPIPE: 70 };
const FT = { UNKNOWN: 0, CHAR: 2, DIR: 3, FILE: 4 };
const RIGHTS_ALL = 0x1fffffffn;
let inoSeq = 1;
class Exit { constructor(code) { this.code = code; } }

// ---------------------------------------------------------------- in-memory file system
export class MemFS {
  constructor() { this.root = this.mkdirNode(null); }
  mkdirNode(parent) { const d = { t: 'd', e: new Map(), ino: inoSeq++, mtime: Date.now() }; d.parent = parent || d; return d; }
  mkfileNode(data) { const b = data ? new Uint8Array(data) : new Uint8Array(0); return { t: 'f', d: b, n: b.length, ino: inoSeq++, mtime: Date.now() }; }
  parts(path) { return String(path).split('/').filter((x) => x && x !== '.'); }
  // walk from dir node; create: 'dir' makes missing dirs (all), 'parent' makes missing parents
  lookup(path, from, create) {
    let cur = from || this.root;
    const ps = this.parts(path);
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (cur.t !== 'd') return null;
      if (p === '..') { cur = cur.parent; continue; }
      let nx = cur.e.get(p);
      if (!nx) {
        if (create === 'dir' || (create === 'parent' && i < ps.length - 1)) { nx = this.mkdirNode(cur); cur.e.set(p, nx); }
        else return null;
      }
      cur = nx;
    }
    return cur;
  }
  mkdirp(path) { return this.lookup(path, this.root, 'dir'); }
  writeFile(path, data) {
    const ps = this.parts(path), name = ps.pop(), dir = this.lookup(ps.join('/'), this.root, 'dir');
    const f = this.mkfileNode(typeof data === 'string' ? new TextEncoder().encode(data) : data);
    dir.e.set(name, f); return f;
  }
  readFile(path) { const n = this.lookup(path); return n && n.t === 'f' ? n.d.subarray(0, n.n) : null; }
  readText(path) { const b = this.readFile(path); return b ? new TextDecoder().decode(b) : null; }
  exists(path) { return !!this.lookup(path); }
  remove(path) { const ps = this.parts(path), name = ps.pop(), dir = this.lookup(ps.join('/')); if (dir && dir.t === 'd') dir.e.delete(name); }
  // tar archive (ustar, as made by tar -c) unpacked under prefix
  untar(buf, prefix = '') {
    const td = new TextDecoder(); let o = 0, longName = null;
    while (o + 512 <= buf.length) {
      const h = buf.subarray(o, o + 512); if (!h[0]) break;
      const str = (a, b) => td.decode(h.subarray(a, b)).replace(/\0[\s\S]*$/, '');
      let name = str(0, 100); const pre = str(345, 500); if (pre) name = pre + '/' + name;
      const size = parseInt(str(124, 136).trim() || '0', 8), type = String.fromCharCode(h[156] || 48);
      o += 512;
      if (longName) { name = longName; longName = null; }
      if (type === 'L') longName = td.decode(buf.subarray(o, o + size)).replace(/\0[\s\S]*$/, '');
      else if (type === '5') this.mkdirp(prefix + '/' + name);
      else if (type === '0' || type === '7') this.writeFile(prefix + '/' + name, buf.slice(o, o + size));
      o += Math.ceil(size / 512) * 512;
    }
  }
}

// ---------------------------------------------------------------- processes
export class Toolchain {
  // modules: { name: WebAssembly.Module } — name is basename of program (cc1plus, as, ld, …); alias maps other names
  constructor(fs, modules, alias = {}) { this.fs = fs; this.modules = modules; this.alias = alias; this.depth = 0; this.log = null; }
  moduleFor(prog) {
    const b = String(prog).replace(/^.*\//, '');
    return this.modules[this.alias[b] || b] || null;
  }
  // stdio: [h0, h1, h2], handle = { sink(bytes) } or open file handle of parent; returns exit code
  run(prog, argv, env = {}, stdio) {
    const mod = this.moduleFor(prog);
    if (!mod) { const b = String(prog).replace(/^.*\//, ''); (this.missing ||= new Set()).add(this.alias[b] || b); return -1; }
    const envList = Array.isArray(env) ? env : Object.entries(env).map(([k, v]) => k + '=' + v);
    const p = new Proc(this, argv, envList, stdio);
    if (this.log) this.log(`${'  '.repeat(this.depth)}${argv.join(' ')}`);
    this.depth++;
    try { return p.start(mod); } finally { this.depth--; }
  }
}

const sink = (fn) => ({ t: 'sink', sink: fn });

class Proc {
  constructor(tc, argv, env, stdio) {
    this.tc = tc; this.fs = tc.fs; this.argv = argv; this.env = env;
    const def = (k) => sink((b) => { if (k === 1 && tc.stdout) tc.stdout(b); else if (tc.stderr) tc.stderr(b); });
    this.fds = [stdio && stdio[0] || sink(() => {}), stdio && stdio[1] || def(1), stdio && stdio[2] || def(2), { t: 'pre', node: this.fs.root, name: '/' }];
    this.mem = null;
  }
  start(mod) {
    let w = this.wasi();
    if (this.tc.strace) { const name = this.argv[0], o = w; w = {}; for (const k in o) w[k] = (...a) => { const r = o[k](...a); this.tc.strace(name, k, a, r); return r; }; }
    const inst = new WebAssembly.Instance(mod, { wasi_snapshot_preview1: w, wfl: { spawn: (...a) => this.spawn(...a) } });
    this.memory = inst.exports.memory;
    try { inst.exports._start(); return 0; } catch (e) { if (e instanceof Exit) return e.code; throw e; }
  }
  get dv() { return new DataView(this.memory.buffer); }
  get u8() { return new Uint8Array(this.memory.buffer); }
  cstr(p) { const m = this.u8; let e = p; while (m[e]) e++; return new TextDecoder().decode(m.subarray(p, e)); }
  str(p, len) { return new TextDecoder().decode(this.u8.subarray(p, p + len)); }
  cstrArray(p) { const out = []; if (!p) return out; const dv = this.dv; for (;; p += 4) { const s = dv.getUint32(p, true); if (!s) break; out.push(this.cstr(s)); } return out; }
  // child process: argv / env from this memory, stdio = these descriptors
  spawn(progP, argvP, envP, inFd, outFd, errFd) {
    const prog = this.cstr(progP), argv = this.cstrArray(argvP), env = this.cstrArray(envP);
    const h = (fd) => this.fds[fd] || null;
    try { return this.tc.run(prog, argv, env, [h(inFd), h(outFd), h(errFd)]); } catch (e) { if (this.tc.trace) console.error(e.stack); if (this.tc.stderr) this.tc.stderr(new TextEncoder().encode(`${prog}: ${e && e.message || e}\n`)); return 70; }
  }
  newFd(h) { let fd = 4; while (this.fds[fd]) fd++; this.fds[fd] = h; return fd; }
  dirOf(fd) { const h = this.fds[fd]; return h && (h.t === 'pre' || h.t === 'dir') ? h.node : null; }
  stat(dv, at, node) {
    dv.setBigUint64(at, 1n, true); dv.setBigUint64(at + 8, BigInt(node.ino || 0), true);
    dv.setUint8(at + 16, node.t === 'd' ? FT.DIR : node.t === 'f' ? FT.FILE : FT.CHAR);
    dv.setBigUint64(at + 24, 1n, true); dv.setBigUint64(at + 32, BigInt(node.t === 'f' ? node.n : 0), true);
    const t = BigInt(node.mtime || 0) * 1000000n;
    dv.setBigUint64(at + 40, t, true); dv.setBigUint64(at + 48, t, true); dv.setBigUint64(at + 56, t, true);
  }
  grow(f, need) { if (need <= f.d.length) return; const nb = new Uint8Array(Math.max(need, f.d.length * 2, 4096)); nb.set(f.d.subarray(0, f.n)); f.d = nb; }
  wasi() {
    const self = this;
    const iovs = (p, n) => { const dv = self.dv, out = []; for (let i = 0; i < n; i++) out.push([dv.getUint32(p + i * 8, true), dv.getUint32(p + i * 8 + 4, true)]); return out; };
    const read = (h, list, at) => {
      if (h.t === 'sink') return 0;
      let pos = at == null ? h.pos : at, total = 0; const f = h.node, m = self.u8;
      for (const [buf, len] of list) { const k = Math.max(0, Math.min(len, f.n - pos)); m.set(f.d.subarray(pos, pos + k), buf); pos += k; total += k; if (k < len) break; }
      if (at == null) h.pos = pos;
      return total;
    };
    const write = (h, list, at) => {
      const m = self.u8; let total = 0;
      if (h.t === 'sink') { for (const [buf, len] of list) { h.sink(m.slice(buf, buf + len)); total += len; } return total; }
      const f = h.node; let pos = at != null ? at : h.append ? f.n : h.pos;
      for (const [buf, len] of list) { self.grow(f, pos + len); f.d.set(m.subarray(buf, buf + len), pos); pos += len; total += len; if (pos > f.n) f.n = pos; }
      if (at == null) h.pos = pos;
      f.mtime = Date.now();
      return total;
    };
    const resolve = (dirFd, pP, pL) => { const d = self.dirOf(dirFd); return d ? { d, path: self.str(pP, pL) } : null; };
    const splitLast = (path) => { const ps = self.fs.parts(path); const name = ps.pop(); return { dir: ps.join('/'), name }; };
    return {
      args_sizes_get(cP, sP) { const dv = self.dv, enc = self.argv.map((a) => new TextEncoder().encode(a)); dv.setUint32(cP, enc.length, true); dv.setUint32(sP, enc.reduce((s, a) => s + a.length + 1, 0), true); return 0; },
      args_get(aP, bP) { const dv = self.dv, m = self.u8; for (const a of self.argv) { const e = new TextEncoder().encode(a); dv.setUint32(aP, bP, true); aP += 4; m.set(e, bP); m[bP + e.length] = 0; bP += e.length + 1; } return 0; },
      environ_sizes_get(cP, sP) { const dv = self.dv, enc = self.env.map((a) => new TextEncoder().encode(a)); dv.setUint32(cP, enc.length, true); dv.setUint32(sP, enc.reduce((s, a) => s + a.length + 1, 0), true); return 0; },
      environ_get(aP, bP) { const dv = self.dv, m = self.u8; for (const a of self.env) { const e = new TextEncoder().encode(a); dv.setUint32(aP, bP, true); aP += 4; m.set(e, bP); m[bP + e.length] = 0; bP += e.length + 1; } return 0; },
      clock_time_get(id, prec, tP) { self.dv.setBigUint64(tP, BigInt(Math.round((id === 0 ? Date.now() : performance.now()) * 1e6)), true); return 0; },
      proc_exit(code) { throw new Exit(code); },
      fd_close(fd) { if (!self.fds[fd]) return E.BADF; if (fd > 3) delete self.fds[fd]; return 0; },
      fd_fdstat_get(fd, p) {
        const h = self.fds[fd]; if (!h) return E.BADF; const dv = self.dv;
        dv.setUint8(p, h.t === 'sink' ? FT.CHAR : h.t === 'file' ? FT.FILE : FT.DIR); dv.setUint16(p + 2, h.append ? 1 : 0, true);
        dv.setBigUint64(p + 8, RIGHTS_ALL, true); dv.setBigUint64(p + 16, RIGHTS_ALL, true); return 0;
      },
      fd_fdstat_set_flags(fd, fl) { const h = self.fds[fd]; if (!h) return E.BADF; h.append = !!(fl & 1); return 0; },
      fd_filestat_get(fd, p) { const h = self.fds[fd]; if (!h) return E.BADF; self.stat(self.dv, p, h.node || { t: 'c' }); return 0; },
      fd_prestat_get(fd, p) { const h = self.fds[fd]; if (!h || h.t !== 'pre') return E.BADF; const dv = self.dv; dv.setUint8(p, 0); dv.setUint32(p + 4, h.name.length, true); return 0; },
      fd_prestat_dir_name(fd, p, len) { const h = self.fds[fd]; if (!h || h.t !== 'pre') return E.BADF; self.u8.set(new TextEncoder().encode(h.name).subarray(0, len), p); return 0; },
      fd_read(fd, iP, iL, nP) { const h = self.fds[fd]; if (!h || h.t === 'dir' || h.t === 'pre') return E.BADF; self.dv.setUint32(nP, read(h, iovs(iP, iL)), true); return 0; },
      fd_pread(fd, iP, iL, off, nP) { const h = self.fds[fd]; if (!h || h.t !== 'file') return E.BADF; self.dv.setUint32(nP, read(h, iovs(iP, iL), Number(off)), true); return 0; },
      fd_write(fd, iP, iL, nP) { const h = self.fds[fd]; if (!h || h.t === 'dir' || h.t === 'pre') return E.BADF; self.dv.setUint32(nP, write(h, iovs(iP, iL)), true); return 0; },
      fd_seek(fd, off, wh, nP) {
        const h = self.fds[fd]; if (!h) return E.BADF; if (h.t !== 'file') return E.SPIPE;
        const o = Number(off), np = wh === 0 ? o : wh === 1 ? h.pos + o : h.node.n + o; if (np < 0) return E.INVAL;
        h.pos = np; self.dv.setBigUint64(nP, BigInt(np), true); return 0;
      },
      fd_tell(fd, nP) { const h = self.fds[fd]; if (!h || h.t !== 'file') return E.BADF; self.dv.setBigUint64(nP, BigInt(h.pos), true); return 0; },
      fd_readdir(fd, buf, len, cookie, usedP) {
        const h = self.fds[fd]; if (!h || (h.t !== 'dir' && h.t !== 'pre')) return E.BADF;
        const d = h.node, ents = [['.', d], ['..', d.parent], ...d.e.entries()];
        const dv = self.dv, m = self.u8; let o = 0;
        for (let i = Number(cookie); i < ents.length; i++) {
          const [name, n] = ents[i], nb = new TextEncoder().encode(name), hdr = new Uint8Array(24), hv = new DataView(hdr.buffer);
          hv.setBigUint64(0, BigInt(i + 1), true); hv.setBigUint64(8, BigInt(n.ino || 0), true); hv.setUint32(16, nb.length, true); hv.setUint8(20, n.t === 'd' ? FT.DIR : FT.FILE);
          const all = new Uint8Array(24 + nb.length); all.set(hdr); all.set(nb, 24);
          const k = Math.min(all.length, len - o); m.set(all.subarray(0, k), buf + o); o += k;
          if (o >= len) break;
        }
        dv.setUint32(usedP, o, true); return 0;
      },
      path_open(dirFd, dirflags, pP, pL, oflags, rb, ri, fdflags, fdP) {
        const r = resolve(dirFd, pP, pL); if (!r) return E.BADF;
        let n = self.fs.lookup(r.path, r.d);
        if (n && (oflags & 4)) return E.EXIST;
        if (!n) {
          if (!(oflags & 1)) return E.NOENT;
          const { dir, name } = splitLast(r.path), pd = self.fs.lookup(dir, r.d);
          if (!pd) return E.NOENT; if (pd.t !== 'd') return E.NOTDIR;
          n = self.fs.mkfileNode(); pd.e.set(name, n);
        }
        if ((oflags & 2) && n.t !== 'd') return E.NOTDIR;
        if (n.t === 'd') { self.dv.setUint32(fdP, self.newFd({ t: 'dir', node: n }), true); return 0; }
        if (oflags & 8) { n.n = 0; n.mtime = Date.now(); }
        self.dv.setUint32(fdP, self.newFd({ t: 'file', node: n, pos: 0, append: !!(fdflags & 1) }), true); return 0;
      },
      path_filestat_get(dirFd, fl, pP, pL, bP) { const r = resolve(dirFd, pP, pL); if (!r) return E.BADF; const n = self.fs.lookup(r.path, r.d); if (!n) return E.NOENT; self.stat(self.dv, bP, n); return 0; },
      path_filestat_set_times() { return 0; },
      path_create_directory(dirFd, pP, pL) {
        const r = resolve(dirFd, pP, pL); if (!r) return E.BADF; if (self.fs.lookup(r.path, r.d)) return E.EXIST;
        const { dir, name } = splitLast(r.path), pd = self.fs.lookup(dir, r.d); if (!pd) return E.NOENT; if (pd.t !== 'd') return E.NOTDIR;
        pd.e.set(name, self.fs.mkdirNode(pd)); return 0;
      },
      path_readlink() { return E.INVAL; },
      path_unlink_file(dirFd, pP, pL) { const r = resolve(dirFd, pP, pL); if (!r) return E.BADF; const { dir, name } = splitLast(r.path), pd = self.fs.lookup(dir, r.d); const n = pd && pd.e.get(name); if (!n) return E.NOENT; if (n.t === 'd') return E.ISDIR; pd.e.delete(name); return 0; },
      path_remove_directory(dirFd, pP, pL) { const r = resolve(dirFd, pP, pL); if (!r) return E.BADF; const { dir, name } = splitLast(r.path), pd = self.fs.lookup(dir, r.d); const n = pd && pd.e.get(name); if (!n) return E.NOENT; if (n.t !== 'd') return E.NOTDIR; if (n.e.size) return E.NOTEMPTY; pd.e.delete(name); return 0; },
      path_rename(fd1, p1, l1, fd2, p2, l2) {
        const a = resolve(fd1, p1, l1), b = resolve(fd2, p2, l2); if (!a || !b) return E.BADF;
        const s = splitLast(a.path), t = splitLast(b.path), sd = self.fs.lookup(s.dir, a.d), td = self.fs.lookup(t.dir, b.d);
        const n = sd && sd.e.get(s.name); if (!n || !td) return E.NOENT; sd.e.delete(s.name); td.e.set(t.name, n); if (n.t === 'd') n.parent = td; return 0;
      },
    };
  }
}
