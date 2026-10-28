// Web FastLED: runner worker (module worker) — runs compiled sketch on clock that can be paused, sped up and fast-forwarded.
//   → { type: 'run', module, speed, pace, seed, ff: { t, events } }   ff: catch up to sketch time t replaying events (inputs) on the way
//   → { type: 'pin', pin, value }               digital level driven from page: 0 / 1, 255 = released
//   → { type: 'analog', pin, value }            analogRead value 0..1023, -1 = noise (floating input)
//   → { type: 'serial', port, bytes }           Serial monitor input
//   → { type: 'pause', on } / { type: 'speed', value } / { type: 'pace', on } / { type: 'snapshot' }
//   ← { type: 'frame', pin, rgb, count } / { type: 'serial', port, bytes } / { type: 'stats', ... } / { type: 'pins', list } / { type: 'baud', port, value }
//   ← { type: 'snapshot', t, seed, events } / { type: 'ff', done, t, to } / { type: 'crash', message } / { type: 'started' }
// Stop = page terminates worker.
import { instantiate, Exit } from './runner-core.js?v=20261028193402';

const pins = new Uint8Array(128).fill(255);
const analogVals = new Int16Array(128).fill(-1);
const rx = [[], [], [], []];
let rt = null;
// LED data time off: FastLED.show() waits so that frames come every FRAME_MS of sketch time (50 fps at 1×; speed scales clock: 5…500 fps);
// on (wire): show() takes as long as data on real strip, speed 1×
const FRAME_MS = 20;
let pace = false, wire = false, lastShow = -1;
function frameWait(count, bitNs) {
  if (wire) { sleep(count * 24 * (bitNs > 0 ? bitNs : 1250) / 1000 + 50); return; } // LED data time: data on wire (30 us per WS2812 LED) + latch
  if (!pace) return;
  const t = vnow();
  if (lastShow >= 0 && lastShow + FRAME_MS > t) sleep((lastShow + FRAME_MS - t) * 1000);
  lastShow = vnow();
}

// seeded noise (floating inputs, analogRead, random_get): same seed → same run
let seed = 1, rs = 1;
const rand = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; };

// inputs as they come, in sketch time: replayed when new build catches up to same moment
const events = [];
let replay = [], replayAt = 0;
function apply(m) {
  if (m.type === 'pin') pins[m.pin & 127] = m.value;
  else if (m.type === 'analog') analogVals[m.pin & 127] = m.value;
  else if (m.type === 'serial') for (const b of m.bytes) rx[m.port & 3].push(b);
}
function replayDue() { while (replayAt < replay.length && replay[replayAt].t <= vnow()) { const e = replay[replayAt++]; events.push(e); apply(e.m); } }

// sketch clock (ms): runs at `speed` × real time, stands still while paused; while catching up (ff) it moves only by sleeps
let speed = 1, paused = false, vBase = 0, pBase = 0, ff = null, vff = 0, ffT0 = 0;
// catching up: skipped waits + computing time × FF_K (sketch without delays still gets through minutes in seconds)
const FF_K = 25;
const vnow = () => (ff ? vff + (performance.now() - ffT0) * FF_K : paused ? vBase : vBase + (performance.now() - pBase) * speed);
function clockNow() { if (ff) vff += 0.002; return vnow(); } // millis() polling loops move on while catching up
function setClock(sp, pa) { vBase = vnow(); pBase = performance.now(); speed = sp; paused = pa; }
function endFF() {
  vBase = vnow(); pBase = performance.now(); ff = null;
  if (prof) { const mem = rt.memory.buffer, n = prof.n; prof.c.set(new Uint32Array(mem, prof.pc, n + 1)); prof.i.set(new Float64Array(mem, prof.pi, n + 1)); prof.s.set(new Float64Array(mem, prof.ps, n + 1)); prof.wait.clear(); prof.t = performance.now(); }
  postMessage({ type: 'ff', done: true, t: vBase });
  flushFrames(true);
}

// waiting: Atomics.wait when page is cross-origin isolated (no CPU load), busy loop otherwise
const sab = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated ? new Int32Array(new SharedArrayBuffer(4)) : null;
// profile build: time per sketch function; waits (delay, LED data time) are counted for function that waits
let prof = null; // { calls, incl, self (views), wait: Map id → ms, prev: {...}, t, showFn }
function profTop() { return prof ? rt.exports.wfl_prof_top() : 0; }
function sleep(us) {
  if (prof && !ff) { const id = profTop(), t0 = performance.now(); sleepReal(us); prof.wait.set(id, (prof.wait.get(id) || 0) + performance.now() - t0); return; }
  sleepReal(us);
}
function sleepReal(us) {
  if (ff) { vff += us / 1000; replayDue(); if (vnow() >= ff.to) endFF(); return; }
  if (us >= 15000 || performance.now() - lastPost >= 15) flushFrames();
  if (us >= 15000 || performance.now() - serialT > 40) flushSerial();
  const end = vnow() + us / 1000; // in sketch time
  for (;;) {
    const left = (end - vnow()) / speed; // real ms
    if (left <= 0) break;
    if (sab && left > 1.5) Atomics.wait(sab, 0, 0, Math.min(left - 1, 50));
  }
}

// frames: at most one per 15 ms per pin goes to page; newest one always does (flush before waiting / between ticks)
const pending = new Map();
let lastPost = 0, frames = 0, shows = 0;
function led(pin, rgb, count) {
  shows++;
  if (prof) prof.showFn = profTop();
  pending.set(pin, { rgb, count });
  if (!ff && performance.now() - lastPost >= 15) flushFrames();
}
function flushFrames(force) {
  if (!pending.size || (ff && !force)) return;
  for (const [pin, f] of pending) { postMessage({ type: 'frame', pin, rgb: f.rgb, count: f.count }, [f.rgb.buffer]); frames++; }
  pending.clear(); lastPost = performance.now();
}
let serialBuf = [], serialT = 0;
function serial(port, bytes) {
  serialBuf.push({ port, bytes });
  if (performance.now() - serialT > 40 || serialBuf.length > 200) flushSerial();
}
function flushSerial() {
  if (!serialBuf.length) return;
  const byPort = new Map();
  for (const s of serialBuf) { const a = byPort.get(s.port) || []; a.push(s.bytes); byPort.set(s.port, a); }
  for (const [port, list] of byPort) {
    let n = 0; for (const b of list) n += b.length;
    const out = new Uint8Array(n); let o = 0; for (const b of list) { out.set(b, o); o += b.length; }
    postMessage({ type: 'serial', port, bytes: out }, [out.buffer]);
  }
  serialBuf = []; serialT = performance.now();
}
// pins sketch uses: mode, output level / PWM, last digitalRead / analogRead
const pinInfo = new Map(), pinDirty = new Set();
let pinT = 0;
function onPin(pin, kind, value) {
  let p = pinInfo.get(pin);
  if (!p) { p = { pin, mode: -1, out: -1, pwm: -1, read: -1, aread: -1, tone: 0 }; pinInfo.set(pin, p); }
  let ch = false;
  if (kind === 'mode') { ch = p.mode !== value; p.mode = value; }
  else if (kind === 'write') { ch = p.out !== value || p.pwm >= 0; p.out = value; p.pwm = -1; }
  else if (kind === 'pwm') { ch = p.pwm !== value; p.pwm = value; }
  else if (kind === 'read') { ch = p.read !== value; p.read = value; }
  else if (kind === 'aread') { ch = p.aread < 0 || Math.abs(p.aread - value) > 3; if (ch) p.aread = value; }
  else if (kind === 'tone') { ch = p.tone !== value; p.tone = value; }
  if (ch) pinDirty.add(pin);
}
function flushPins() {
  if (!pinDirty.size) return;
  if (performance.now() - pinT < 50) return;
  postMessage({ type: 'pins', list: [...pinDirty].map((p) => pinInfo.get(p)) });
  pinDirty.clear(); pinT = performance.now();
}
function flush() { flushFrames(); flushSerial(); flushPins(); }
let stdoutBuf = '';
const td = new TextDecoder();

let loops = 0, statT = 0, loopsAt = 0, framesAt = 0, showsAt = 0, ticking = false;
const chan = new MessageChannel();
chan.port1.onmessage = tick;
function schedule() { if (!ticking && rt && (!paused || ff)) { ticking = true; chan.port2.postMessage(0); } }
function tick() {
  ticking = false;
  if (!rt || (paused && !ff)) return;
  const end = performance.now() + (ff ? 40 : 12);
  try {
    do { if (ff) replayDue(); rt.loop(); loops++; if (ff && vnow() >= ff.to) endFF(); } while (performance.now() < end && (!paused || ff));
  } catch (e) { crash(e); return; }
  if (ff) postMessage({ type: 'ff', done: false, t: vnow(), to: ff.to });
  flush();
  if (prof && !ff) profPost();
  const t = performance.now();
  if (!ff && t - statT >= 1000) {
    const dt = (t - statT) / 1000;
    postMessage({ type: 'stats', loops: Math.round((loops - loopsAt) / dt), fps: Math.round((shows - showsAt) / dt), shown: Math.round((frames - framesAt) / dt), ms: Math.round(vnow()) });
    statT = t; loopsAt = loops; framesAt = frames; showsAt = shows;
  }
  schedule(); // next batch after messages that came in meanwhile (pins, serial input, pause)
}
function profPost() {
  const t = performance.now();
  if (t - prof.t < 500) return;
  const mem = rt.memory.buffer, n = prof.n;
  const calls = new Uint32Array(mem, prof.pc, n + 1), incl = new Float64Array(mem, prof.pi, n + 1), self = new Float64Array(mem, prof.ps, n + 1);
  const dt = t - prof.t, rows = [];
  for (let id = 1; id <= n; id++) {
    const c = calls[id] - prof.c[id], inc = incl[id] - prof.i[id], sf = self[id] - prof.s[id], w = prof.wait.get(id) || 0;
    if (c || inc > 0 || w) rows.push({ id, calls: c * 1000 / dt, incl: inc / dt, self: sf / dt, wait: w / dt });
    prof.c[id] = calls[id]; prof.i[id] = incl[id]; prof.s[id] = self[id];
  }
  prof.wait.clear(); prof.t = t;
  postMessage({ type: 'prof', rows, show: prof.showFn, top: profTop() });
}
function crash(e) {
  flush();
  const msg = e instanceof Exit ? 'Sketch called exit(' + e.code + ')' : (e && e.message) || String(e);
  postMessage({ type: 'crash', message: msg, stack: e && e.stack ? String(e.stack) : '' });
  rt = null;
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'run') {
    try {
      speed = m.speed > 0 ? m.speed : 1; paused = false; vBase = 0; pBase = performance.now();
      pace = !!m.pace; wire = !!m.wire; lastShow = -1;
      seed = (m.seed >>> 0) || ((Math.random() * 0xffffffff) >>> 0) || 1; rs = seed;
      if (m.ff && m.ff.t > 0) { ff = { to: m.ff.t }; vff = 0; ffT0 = performance.now(); replay = m.ff.events || []; replayAt = 0; }
      rt = instantiate(m.module, {
        now: clockNow, sleep, led, serial, onPin, rand,
        frameWait,
        stdout: (b) => { stdoutBuf += td.decode(b, { stream: true }); let i; while ((i = stdoutBuf.indexOf('\n')) >= 0) { serial(0, new TextEncoder().encode(stdoutBuf.slice(0, i + 1))); stdoutBuf = stdoutBuf.slice(i + 1); } },
        pins,
        analog: (pin) => (analogVals[pin & 127] >= 0 ? analogVals[pin & 127] : (rand() * 1024) | 0),
        serialIn: (port) => rx[port & 3],
        serialBegin: (port, baud) => postMessage({ type: 'baud', port, value: baud }),
      });
      postMessage({ type: 'started', isolated: !!sab, seed });
      prof = null;
      if (rt.exports.wfl_prof_calls && m.profN > 0) {
        const n = Math.min(m.profN, 4095);
        prof = { n, pc: rt.exports.wfl_prof_calls(), pi: rt.exports.wfl_prof_incl(), ps: rt.exports.wfl_prof_self(),
          c: new Float64Array(n + 1), i: new Float64Array(n + 1), s: new Float64Array(n + 1), wait: new Map(), t: performance.now(), showFn: 0 };
      }
      statT = performance.now();
      if (ff) replayDue();
      rt.setup();
      pinT = 0; flush();
      schedule();
    } catch (err) { crash(err); }
  } else if (m.type === 'pin' || m.type === 'analog' || m.type === 'serial') {
    events.push({ t: vnow(), m }); apply(m);
  } else if (m.type === 'pause') {
    if (ff) { paused = !!m.on; return; }
    setClock(speed, !!m.on);
    if (!paused) { statT = performance.now(); loopsAt = loops; showsAt = shows; framesAt = frames; schedule(); }
    else flush();
  } else if (m.type === 'speed') {
    if (ff) speed = m.value > 0 ? m.value : 1; else setClock(m.value > 0 ? m.value : 1, paused);
  } else if (m.type === 'pace') {
    pace = !!m.on; wire = !!m.wire; lastShow = -1;
  } else if (m.type === 'snapshot') {
    postMessage({ type: 'snapshot', t: vnow(), seed, events: events.slice(), paused });
  }
};
