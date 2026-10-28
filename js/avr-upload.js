// Web FastLED: upload of .hex to board through its bootloader, as avrdude does it for Arduino IDE:
// STK500v1 ("arduino": Nano — Optiboot 115200 / old ATmegaBOOT 57600), STK500v2 ("wiring": Mega 2560, 115200).
// Link: serial port (Web Serial in page, emulated board in tests) with reset by DTR / RTS.
import { parseHex } from './avr-build.js?v=20261028193402';

export class UploadError extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Byte link over Web Serial port (SerialPort of navigator.serial)
export class WebSerialLink {
  constructor(port) { this.port = port; this.buf = []; this.waiters = []; this.reader = null; this.writer = null; this.closed = true; this.onData = null; this.onLost = null; }
  async open(baud) {
    await this.port.open({ baudRate: baud, bufferSize: 4096 });
    this.closed = false; this.buf = [];
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.pump = (async () => {
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (this.onData) this.onData(value); // monitor: bytes go straight on
          else { for (const b of value) this.buf.push(b); this.wake(); }
        }
      } catch (e) { /* port closed or lost */ }
      if (!this.closed && this.onLost) this.onLost();
    })();
  }
  wake() { const w = this.waiters; this.waiters = []; for (const f of w) f(); }
  async close() {
    if (this.closed) return;
    this.closed = true;
    try { await this.reader.cancel(); } catch (e) {}
    try { this.reader.releaseLock(); } catch (e) {}
    try { this.writer.releaseLock(); } catch (e) {}
    try { await this.pump; } catch (e) {}
    try { await this.port.close(); } catch (e) {}
    this.wake();
  }
  async signals(dtr, rts) { await this.port.setSignals({ dataTerminalReady: dtr, requestToSend: rts }); }
  async send(bytes) { await this.writer.write(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)); }
  drain() { this.buf = []; }
  // n bytes or UploadError after timeout (ms)
  async recv(n, timeout) {
    const end = performance.now() + timeout;
    while (this.buf.length < n) {
      const left = end - performance.now();
      if (left <= 0 || this.closed) throw new UploadError('timeout');
      await new Promise((r) => { this.waiters.push(r); setTimeout(r, Math.min(left, 50)); });
    }
    return Uint8Array.from(this.buf.splice(0, n));
  }
}

// flash image of .hex padded to whole pages (0xFF)
export function flashImage(hex, page) {
  const segs = parseHex(hex);
  const end = segs.reduce((m, s) => Math.max(m, s.addr + s.data.length), 0);
  const img = new Uint8Array(Math.ceil(end / page) * page).fill(0xff);
  for (const s of segs) img.set(s.data, s.addr);
  return img;
}

// ---------------------------------------------------------------- STK500v1 (Optiboot, ATmegaBOOT)
const OK = [0x14, 0x10];
async function v1(link, cmd, n = 0, timeout = 500) {
  await link.send([...cmd, 0x20]);
  const r = await link.recv(n + 2, timeout);
  if (r[0] !== 0x14 || r[n + 1] !== 0x10) throw new UploadError('bootloader answered ' + [...r].map((x) => x.toString(16).padStart(2, '0')).join(' '));
  return r.subarray(1, n + 1);
}
async function syncV1(link, tries = 10) {
  for (let i = 0; i < tries; i++) {
    link.drain();
    await link.send([0x30, 0x20]);
    try {
      const r = await link.recv(2, 500);
      if (r[0] === OK[0] && r[1] === OK[1]) {
        // bootloader that was busy at start (Optiboot flashes LED) answers earlier tries late: read those answers away
        for (;;) { try { await link.recv(2, 150); } catch (e) { if (e instanceof UploadError) break; throw e; } }
        return true;
      }
    } catch (e) { if (!(e instanceof UploadError)) throw e; }
  }
  return false;
}
async function uploadV1(link, img, o) {
  const sig = await v1(link, [0x75], 3);
  o.log(`Device signature: ${hexs(sig)}`);
  if (o.signature && !same(sig, o.signature)) throw new UploadError(`wrong device: signature ${hexs(sig)}, expected ${hexs(o.signature)} (other board selected?)`);
  await v1(link, [0x50]); // enter programming mode
  const P = o.page, n = img.length / P;
  for (let i = 0; i < n; i++) {
    const a = i * P / 2; // word address
    await v1(link, [0x55, a & 255, a >> 8]);
    await v1(link, [0x64, P >> 8, P & 255, 0x46, ...img.subarray(i * P, (i + 1) * P)], 0, 1000);
    o.progress('Writing', i + 1, n);
  }
  for (let i = 0; i < n; i++) {
    const a = i * P / 2;
    await v1(link, [0x55, a & 255, a >> 8]);
    const d = await v1(link, [0x74, P >> 8, P & 255, 0x46], P, 1000);
    const at = firstDiff(d, img.subarray(i * P, (i + 1) * P));
    if (at >= 0) throw new UploadError(`verification failed at 0x${(i * P + at).toString(16)}`);
    o.progress('Verifying', i + 1, n);
  }
  await v1(link, [0x51]); // leave programming mode: bootloader starts sketch
}

// ---------------------------------------------------------------- STK500v2 (stk500boot_v2 of Mega 2560)
let seqV2 = 0;
async function v2(link, body, timeout = 1000) {
  const s = seqV2 = (seqV2 + 1) & 255;
  const m = [0x1b, s, body.length >> 8, body.length & 255, 0x0e, ...body];
  let x = 0; for (const b of m) x ^= b;
  await link.send([...m, x]);
  const h = await link.recv(5, timeout);
  if (h[0] !== 0x1b || h[4] !== 0x0e) throw new UploadError('bad answer of bootloader');
  const len = (h[2] << 8) | h[3];
  const r = await link.recv(len + 1, timeout);
  let c = 0; for (const b of h) c ^= b; for (const b of r) c ^= b;
  if (c !== 0) throw new UploadError('checksum error');
  if (h[1] !== s) throw new UploadError('answer out of sequence');
  if (r[0] !== body[0] || r[1] !== 0) throw new UploadError(`command 0x${body[0].toString(16)} failed (status 0x${r[1].toString(16)})`);
  return r.subarray(0, len);
}
async function syncV2(link, tries = 6) {
  for (let i = 0; i < tries; i++) {
    link.drain();
    try { const r = await v2(link, [0x01], 400); return String.fromCharCode(...r.subarray(3, 3 + r[2])); } catch (e) { if (!(e instanceof UploadError)) throw e; }
  }
  return null;
}
async function uploadV2(link, img, o) {
  await v2(link, [0x10, 200, 100, 25, 32, 0, 0x53, 3, 0xac, 0x53, 0, 0]); // enter programming mode
  const sig = [];
  for (let i = 0; i < 3; i++) sig.push((await v2(link, [0x1b, 4, 0x30, 0, i, 0]))[2]);
  o.log(`Device signature: ${hexs(sig)}`);
  if (o.signature && !same(sig, o.signature)) throw new UploadError(`wrong device: signature ${hexs(sig)}, expected ${hexs(o.signature)} (other board selected?)`);
  const P = o.page, n = img.length / P;
  const load = (byteAddr) => { const a = (byteAddr >>> 1) | 0x80000000; return v2(link, [0x06, (a >>> 24) & 255, (a >>> 16) & 255, (a >>> 8) & 255, a & 255]); };
  await load(0);
  for (let i = 0; i < n; i++) {
    await v2(link, [0x13, P >> 8, P & 255, 0xc1, 10, 0x40, 0x4c, 0x20, 0, 0, ...img.subarray(i * P, (i + 1) * P)], 2000);
    o.progress('Writing', i + 1, n);
  }
  await load(0);
  for (let i = 0; i < n; i++) {
    const r = await v2(link, [0x14, P >> 8, P & 255, 0x20], 2000);
    const at = firstDiff(r.subarray(2, 2 + P), img.subarray(i * P, (i + 1) * P));
    if (at >= 0) throw new UploadError(`verification failed at 0x${(i * P + at).toString(16)}`);
    o.progress('Verifying', i + 1, n);
  }
  await v2(link, [0x11, 1, 1]); // leave programming mode
}

const hexs = (a) => [...a].map((x) => x.toString(16).padStart(2, '0')).join(' ');
const same = (a, b) => a.length === b.length && [...a].every((x, i) => x === b[i]);
function firstDiff(a, b) { for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return i; return -1; }

export const UPLOAD = {
  nano: { protocol: 'stk500v1', page: 128, signature: [0x1e, 0x95, 0x0f], flash: 30720 },
  mega: { protocol: 'stk500v2', page: 256, signature: [0x1e, 0x98, 0x01], flash: 253952 },
};

// reset board (DTR / RTS pulse, as auto-reset of Arduino) and talk to its bootloader.
// link: opened at given baud by caller; returns false when bootloader did not answer (other speed?)
export async function uploadHex(link, hex, board, opts = {}) {
  const o = { log: () => {}, progress: () => {}, ...opts, ...UPLOAD[board] };
  const img = flashImage(hex, o.page);
  if (img.length > o.flash) throw new UploadError(`sketch is ${img.length} bytes, board takes ${o.flash}`);
  await link.signals(false, false); await sleep(250);
  await link.signals(true, true); await sleep(50);
  link.drain();
  const t0 = performance.now();
  if (o.protocol === 'stk500v1') {
    if (!(await syncV1(link))) return false;
    await uploadV1(link, img, o);
  } else {
    const id = await syncV2(link);
    if (id == null) return false;
    o.log('Bootloader: ' + id);
    await uploadV2(link, img, o);
  }
  o.log(`${img.length} bytes written and verified in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return true;
}
