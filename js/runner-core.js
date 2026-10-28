// Web FastLED: runs compiled sketch (wasm32-wasip1 reactor) — "wfl" imports (Arduino core) and small WASI.
// ES module shared by runner worker (runner.js) and node tests.
// host: { now() → ms, sleep(us), led(pin, Uint8Array rgb, count), serial(port, Uint8Array), stdout(Uint8Array),
//         pins: Uint8Array (digital levels read by digitalRead), analog(pin) → 0..1023, serialIn(port) → array queue, onPin(pin, mode, value) }
export class Exit extends Error { constructor(code) { super('exit ' + code); this.code = code; } }

export function instantiate(module, host) {
  let mem = null;
  const u8 = () => new Uint8Array(mem.buffer);
  const dv = () => new DataView(mem.buffer);
  const pinMode = new Uint8Array(128), pinOut = new Uint8Array(128);
  const rnd = host.rand || Math.random; // seeded by runner: replay of run gives same noise
  const wfl = {
    millis: () => Math.floor(host.now()) >>> 0,
    micros: () => Math.floor(host.now() * 1000) >>> 0,
    delay_us: (us) => { if (us > 0) host.sleep(us); },
    led: (pin, ptr, count, bitNs) => {
      host.led(pin, u8().slice(ptr, ptr + count * 3), count);
      if (host.frameWait) host.frameWait(count, bitNs); // frame pacing of page (LED data time)
    },
    serial_write: (port, ptr, n) => host.serial(port, u8().slice(ptr, ptr + n)),
    serial_begin: (port, baud) => { if (host.serialBegin) host.serialBegin(port, baud >>> 0); },
    serial_avail: (port) => { const q = host.serialIn && host.serialIn(port); return q ? q.length : 0; },
    serial_read: (port, peek) => { const q = host.serialIn && host.serialIn(port); if (!q || !q.length) return -1; return peek ? q[0] : q.shift(); },
    pin_mode: (pin, mode) => { pinMode[pin & 127] = mode; if (host.onPin) host.onPin(pin, 'mode', mode); },
    digital_write: (pin, v) => { pinOut[pin & 127] = v ? 1 : 0; if (host.onPin) host.onPin(pin, 'write', v ? 1 : 0); },
    digital_read: (pin) => {
      pin &= 127;
      let v;
      if (pinMode[pin] === 1) v = pinOut[pin];
      else {
        const ext = host.pins ? host.pins[pin] : 255; // 0 / 1 driven from outside, 255 = not connected
        v = ext === 0 || ext === 1 ? ext : pinMode[pin] === 2 ? 1 : (rnd() < 0.5 ? 0 : 1); // pull-up / floating input
      }
      if (host.onPin) host.onPin(pin, 'read', v);
      return v;
    },
    analog_read: (pin) => {
      const v = host.analog ? host.analog(pin) : (rnd() * 1024) | 0;
      if (host.onPin) host.onPin(pin, 'aread', v);
      return v;
    },
    analog_write: (pin, v) => { if (host.onPin) host.onPin(pin, 'pwm', v); },
    prof_now: () => performance.now(),
    tone: (pin, f, d) => { if (host.onPin) host.onPin(pin, 'tone', f, d); },
  };
  const ENOSYS = 52, EBADF = 8;
  const wasi = {
    fd_write: (fd, iovs, iovsLen, nwritten) => {
      const d = dv(); let n = 0;
      for (let i = 0; i < iovsLen; i++) {
        const p = d.getUint32(iovs + i * 8, true), l = d.getUint32(iovs + i * 8 + 4, true);
        if ((fd === 1 || fd === 2) && host.stdout) host.stdout(u8().slice(p, p + l));
        n += l;
      }
      d.setUint32(nwritten, n, true); return 0;
    },
    proc_exit: (code) => { throw new Exit(code); },
    clock_time_get: (id, prec, out) => { dv().setBigUint64(out, BigInt(Math.floor(host.now() * 1e6)), true); return 0; },
    clock_res_get: (id, out) => { dv().setBigUint64(out, 1000n, true); return 0; },
    random_get: (p, l) => { const a = u8(); for (let i = 0; i < l; i++) a[p + i] = (rnd() * 256) | 0; return 0; },
    environ_sizes_get: (c, s) => { dv().setUint32(c, 0, true); dv().setUint32(s, 0, true); return 0; },
    environ_get: () => 0,
    args_sizes_get: (c, s) => { dv().setUint32(c, 0, true); dv().setUint32(s, 0, true); return 0; },
    args_get: () => 0,
    fd_fdstat_get: (fd, p) => { if (fd > 2) return EBADF; const d = dv(); d.setUint8(p, 2); d.setUint16(p + 2, 0, true); d.setBigUint64(p + 8, 0n, true); d.setBigUint64(p + 16, 0n, true); return 0; },
    fd_close: () => 0,
    fd_seek: () => ENOSYS,
    fd_prestat_get: () => EBADF,
    sched_yield: () => 0,
  };
  const imports = { wfl: {}, wasi_snapshot_preview1: {} };
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.kind !== 'function') continue;
    const tbl = imp.module === 'wfl' ? wfl : imp.module === 'wasi_snapshot_preview1' ? wasi : null;
    if (!imports[imp.module]) imports[imp.module] = {};
    imports[imp.module][imp.name] = (tbl && tbl[imp.name]) || (() => { if (imp.module === 'wasi_snapshot_preview1') return ENOSYS; throw new Error('missing import ' + imp.module + '.' + imp.name); });
  }
  const inst = new WebAssembly.Instance(module, imports);
  mem = inst.exports.memory;
  if (inst.exports._initialize) inst.exports._initialize();
  return {
    exports: inst.exports,
    memory: mem,
    setup: () => inst.exports.wfl_setup(),
    loop: () => inst.exports.wfl_loop(),
    pinMode, pinOut,
  };
}
