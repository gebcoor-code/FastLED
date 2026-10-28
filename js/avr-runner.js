// Web FastLED: Real CPU timing runner (module worker) — .hex of real build on emulated ATmega328P / ATmega2560 (avr8js), at 16 MHz
// board clock kept to real time (or as fast as page can, when that is less).
//   → { type: 'run', board, hex, elf, funcs, seed, order }   → { type: 'pin', pin, value } / { type: 'analog', pin, value } / { type: 'serial', port, bytes }
//   → { type: 'pause', on } / { type: 'snapshot' } / { type: 'bp', addrs, ranges } / { type: 'step', mode: into | over | out }  (debugger: run gets lines, bps, bpr)
//   ← { type: 'stopped', reason, pc, sp, sreg, regs, ram, frames, ms, cycles }
//   ← { type: 'started' } / { type: 'frame', pin, rgb, count } / { type: 'serial', port, bytes } / { type: 'baud', port, value }
//   ← { type: 'stats', loops, fps, shown, ms, rate } / { type: 'pins', list } / { type: 'snapshot', t } / { type: 'crash', message }
//   ← { type: 'mem', ram, data, bss, heap, heapMax, stack, stackMax, free, freeMin, sp, collide, ms } / { type: 'prof', real, rows, isr, samples }
import { AvrBoard, MHZ } from './avr-run-core.js?v=20261028193402';

const CPM = MHZ * 1000; // cycles per ms
let bd = null, paused = false, base = 0, pBase = 0, ticking = false;

// frames: newest per pin, at most one per 15 ms
const pending = new Map();
let lastPost = 0, shown = 0;
function flushFrames() {
  for (const [pin, f] of pending) { postMessage({ type: 'frame', pin, rgb: f.rgb, count: f.count }, [f.rgb.buffer]); shown++; }
  pending.clear(); lastPost = performance.now();
}
let ser = [], serT = 0;
function flushSerial() {
  if (!ser.length) return;
  const b = Uint8Array.from(ser); ser = [];
  postMessage({ type: 'serial', port: 0, bytes: b }, [b.buffer]); serT = performance.now();
}
let pinSig = '', pinT = 0;
function flushPins(force) {
  if (!force && performance.now() - pinT < 100) return;
  pinT = performance.now();
  const list = bd.pins(), sig = JSON.stringify(list);
  if (sig !== pinSig) { pinSig = sig; postMessage({ type: 'pins', list }); }
}

let statT = 0, statMs = 0, framesAt = 0, shownAt = 0, loopsAt = 0;
function stats() {
  const t = performance.now();
  if (t - statT < 1000) return;
  const dt = (t - statT) / 1000, ms = bd.ms;
  postMessage({ type: 'stats', loops: bd.loopAddr >= 0 ? Math.round((bd.loops - loopsAt) / dt) : -1, fps: Math.round((bd.frames - framesAt) / dt), shown: Math.round((shown - shownAt) / dt), ms: Math.round(ms), rate: paused ? 100 : Math.round((ms - statMs) / (t - statT) * 100) });
  statT = t; statMs = ms; framesAt = bd.frames; shownAt = shown; loopsAt = bd.loops;
}

const chan = new MessageChannel();
chan.port1.onmessage = tick;
function schedule(later) {
  if (ticking || !bd || paused) return;
  ticking = true;
  if (later) setTimeout(tick, later); else chan.port2.postMessage(0);
}
// board time follows real time; slices of 2 ms board time, at most 12 ms of work per tick; when page cannot keep up,
// debt is dropped (board runs as fast as it can, stats.rate < 100)
function tick() {
  ticking = false;
  if (!bd || paused) return;
  const end = performance.now() + 12;
  let target;
  try {
    for (;;) {
      target = base + (performance.now() - pBase) * CPM;
      if (bd.cpu.cycles >= target) break;
      bd.run(Math.min(target, bd.cpu.cycles + 2 * CPM));
      if (bd.dbg && bd.dbg.halted) break;
      if (performance.now() >= end) break;
    }
  } catch (e) { crash(e); return; }
  if (bd.dbg && bd.dbg.halted) { stopped(); return; } // breakpoint / step done: board waits
  if (target - bd.cpu.cycles > 50 * CPM) { base = bd.cpu.cycles; pBase = performance.now(); }
  if (performance.now() - lastPost >= 15) flushFrames();
  if (performance.now() - serT >= 40) flushSerial();
  flushPins(); stats(); memPost(); profPost();
  const ahead = bd.cpu.cycles - (base + (performance.now() - pBase) * CPM);
  schedule(ahead > 0 ? Math.max(1, Math.floor(ahead / CPM)) : 0);
}
// memory (RAM use, stack depth) 4 times a second; profile (share of CPU time per function) twice a second
let memT = 0;
function memPost(force) {
  if (!force && performance.now() - memT < 250) return;
  memT = performance.now();
  postMessage({ type: 'mem', ...bd.memory(), ms: bd.ms });
}
let profT = 0, profN = 0, profS = null, profI = null, vec = null;
function profPost(force) {
  const p = bd.prof; if (!p) return;
  if (!force && performance.now() - profT < 500) return;
  profT = performance.now();
  if (!profS) { profS = new Float64Array(p.self.length); profI = new Float64Array(p.self.length); }
  const dn = p.n - profN; if (!dn) return;
  const rows = []; let isr = 0;
  for (let i = 0; i < p.self.length; i++) {
    const s = p.self[i] - profS[i], c = p.incl[i] - profI[i];
    if (s || c) { rows.push({ id: i + 1, calls: -1, self: s / dn, incl: c / dn, wait: 0 }); if (vec[i]) isr += s / dn; }
  }
  profS.set(p.self); profI.set(p.incl); profN = p.n;
  postMessage({ type: 'prof', real: true, rows, isr, samples: dn });
}
// debugger: board halted — state to page, clock stands until step / continue
function stopped() {
  paused = true;
  bd.latch(); flushFrames(); flushSerial(); flushPins(true); memPost(true);
  const st = bd.state();
  postMessage({ type: 'stopped', ...st }, [st.regs.buffer, st.ram.buffer]);
}
function go() { base = bd.cpu.cycles; pBase = performance.now(); statT = performance.now(); statMs = bd.ms; paused = false; schedule(); }
function crash(e) {
  flushFrames(); flushSerial();
  postMessage({ type: 'crash', message: (e && e.message) || String(e) });
  bd = null;
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'run') {
    try {
      bd = new AvrBoard(m.hex, m.elf, {
        frame: (pin, rgb, count) => { pending.set(pin, { rgb, count }); },
        serial: (b) => { ser.push(b); if (ser.length > 4096) flushSerial(); },
        baud: (v) => postMessage({ type: 'baud', port: 0, value: v }),
        order: m.order, board: m.board,
      });
      if (m.seed) bd.rs = m.seed >>> 0 || 1;
      if (m.lines) { bd.debugSetup(m.lines); bd.setBreakpoints(m.bps || [], m.bpr || []); }
      if (m.funcs && m.funcs.length) { bd.profile(m.funcs); vec = m.funcs.map((f) => /^__vector_\d+$/.test(f.name)); profN = 0; profS = profI = null; }
      for (const p of m.pins || []) bd.setPin(p.pin, p.value);
      for (const a of m.analog || []) bd.setAnalog(a.pin, a.value);
      paused = false; base = 0; pBase = performance.now(); statT = performance.now();
      postMessage({ type: 'started', isolated: true, real: true });
      schedule();
    } catch (err) { crash(err); }
  } else if (!bd) {
    if (m.type === 'snapshot') postMessage({ type: 'snapshot', t: 0, events: [], paused });
  } else if (m.type === 'pin') { bd.setPin(m.pin, m.value); flushPins(true); }
  else if (m.type === 'analog') bd.setAnalog(m.pin, m.value);
  else if (m.type === 'serial') bd.serialIn(m.bytes);
  else if (m.type === 'order') { for (const d of bd.ws.values()) d.order = m.order; bd.io.order = m.order; }
  else if (m.type === 'pause') {
    if (m.on) { if (bd.dbg) { bd.halt('pause'); stopped(); } else { paused = true; bd.latch(); flushFrames(); flushSerial(); flushPins(true); memPost(true); } }
    else { if (bd.dbg) bd.resume(); go(); }
  } else if (m.type === 'bp') { if (bd.dbg) bd.setBreakpoints(m.addrs, m.ranges || []); }
  else if (m.type === 'step') { if (bd.dbg && paused) { bd.startStep(m.mode); go(); } }
  else if (m.type === 'state') { if (paused && bd.dbg) { const st = bd.state(); postMessage({ type: 'stopped', ...st, refresh: true }, [st.regs.buffer, st.ram.buffer]); } } else if (m.type === 'snapshot') postMessage({ type: 'snapshot', t: bd.ms, events: [], paused });
};
