// Web FastLED: AVR board emulation for Real CPU timing (avr8js core): ATmega328P (Nano) or ATmega2560 (Mega) running
// .hex of real build, cycle by cycle at 16 MHz. WS2812 data is read from port pins by pulse widths (as strip does), USART0 is Serial,
// pins and ADC take inputs of page. ES module: avr-runner.js worker and node tests.
import {
  CPU, avrInstruction, AVRTimer, timer0Config, timer1Config, timer2Config, AVRUSART, usart0Config,
  AVRIOPort, portAConfig, portBConfig, portCConfig, portDConfig, portEConfig, portFConfig, portGConfig, portHConfig, portJConfig, portKConfig, portLConfig,
  AVRADC, adcConfig, ADCMuxInputType, ADCReference, AVREEPROM, EEPROMMemoryBackend, eepromConfig,
  AVRClock, clockConfig, AVRWatchdog, watchdogConfig, AVRSPI, spiConfig, AVRTWI, twiConfig,
} from './avr8.js?v=20261028193402';
import { parseHex } from './avr-build.js?v=20261028193402';
import { LineMap } from './avr-dwarf.js?v=20261028193402';

export const MHZ = 16;
const PAINT = 0xa5;
const F = MHZ * 1e6;

// ELF32 symbols: name → { addr (bytes; RAM ones 0x800000 + address), size, type }: loop() counter, memory symbols, debugger
export function elfSymbols(elf) {
  const out = new Map();
  if (!elf || elf.length < 52 || elf[0] !== 0x7f || elf[1] !== 0x45) return out;
  const dv = new DataView(elf.buffer, elf.byteOffset, elf.byteLength);
  const shoff = dv.getUint32(32, true), shentsize = dv.getUint16(46, true), shnum = dv.getUint16(48, true);
  const sec = (i) => { const o = shoff + i * shentsize; return { type: dv.getUint32(o + 4, true), offset: dv.getUint32(o + 16, true), size: dv.getUint32(o + 20, true), link: dv.getUint32(o + 24, true), entsize: dv.getUint32(o + 36, true) }; };
  for (let i = 0; i < shnum; i++) {
    const s = sec(i); if (s.type !== 2) continue; // SHT_SYMTAB
    const str = sec(s.link);
    for (let o = s.offset; o + 16 <= s.offset + s.size; o += 16) {
      const nameOff = dv.getUint32(o, true), value = dv.getUint32(o + 4, true), size = dv.getUint32(o + 8, true), info = elf[o + 12];
      const type = info & 15; // 0 no type (linker script symbols), 1 object, 2 function
      if (type > 2 || !nameOff) continue;
      let e = str.offset + nameOff, name = '';
      while (elf[e]) name += String.fromCharCode(elf[e++]);
      if (!out.has(name) || type === 2) out.set(name, { addr: value, size, type });
    }
  }
  return out;
}

// ---------------------------------------------------------------- boards
// pins: Arduino pin → [port, bit]; pwm: pin → [TCCRnA address, COM bit, OCR address]; a0: first analog pin;
// vec: words of vector table (ISR detection in debugger); ram: first SRAM address; sram: avr8js data size above registers
const NANO = {
  id: 'nano', flash: 0x8000, sram: 2048, ram: 0x100, a0: 14, analog: 8, vec: 26 * 2, eeprom: 1024,
  pins: [...[0, 1, 2, 3, 4, 5, 6, 7].map((b) => ['D', b]), ...[0, 1, 2, 3, 4, 5].map((b) => ['B', b]), ...[0, 1, 2, 3, 4, 5].map((b) => ['C', b])],
  pwm: { 3: [0xb0, 5, 0xb4], 5: [0x44, 5, 0x48], 6: [0x44, 7, 0x47], 9: [0x80, 7, 0x88], 10: [0x80, 5, 0x8a], 11: [0xb0, 7, 0xb3] },
  ports: { B: portBConfig, C: portCConfig, D: portDConfig },
  timers: [timer0Config, timer1Config, timer2Config],
  usarts: [usart0Config], adc: adcConfig, wdt: watchdogConfig, ee: eepromConfig, spi: spiConfig, twi: twiConfig,
};
// ATmega2560: interrupt vectors (word address = number * 2), I/O registers as datasheet; pins as variants/mega/pins_arduino.h
const t16 = { OCFC: 8, OCIEC: 8 };
const megaTimer = (n, base, tifr, timsk, v, pa, pb, pc, ext) => ({
  ...timer1Config, ...t16, captureInterrupt: v, compAInterrupt: v + 2, compBInterrupt: v + 4, compCInterrupt: v + 6, ovfInterrupt: v + 8,
  TIFR: tifr, TIMSK: timsk, TCCRA: base, TCCRB: base + 1, TCCRC: base + 2, TCNT: base + 4, ICR: base + 6, OCRA: base + 8, OCRB: base + 10, OCRC: base + 12,
  compPortA: pa[0].PORT, compPinA: pa[1], compPortB: pb[0].PORT, compPinB: pb[1], compPortC: pc[0].PORT, compPinC: pc[1], externalClockPort: ext[0].PORT, externalClockPin: ext[1],
});
const pinChange = (n, mask, v) => ({ PCIE: n, PCICR: 0x68, PCIFR: 0x3b, PCMSK: mask, pinChangeInterrupt: v, mask: 0xff, offset: 0 });
const extInt = (i) => ({ EICR: i < 4 ? 0x69 : 0x6a, EIMSK: 0x3d, EIFR: 0x3c, index: i, iscOffset: (i & 3) * 2, interrupt: 2 + i * 2 });
const megaChannels = { 0x1e: { type: ADCMuxInputType.Constant, voltage: 1.1 }, 0x1f: { type: ADCMuxInputType.Constant, voltage: 0 } };
for (let i = 0; i < 8; i++) { megaChannels[i] = { type: ADCMuxInputType.SingleEnded, channel: i }; megaChannels[0x20 + i] = { type: ADCMuxInputType.SingleEnded, channel: 8 + i }; }
const MEGA_PORTS = {
  A: portAConfig, B: { ...portBConfig, pinChange: pinChange(0, 0x6b, 0x12) }, C: portCConfig,
  D: { ...portDConfig, externalInterrupts: [extInt(0), extInt(1), extInt(2), extInt(3)] },
  E: { ...portEConfig, externalInterrupts: [null, null, null, null, extInt(4), extInt(5), extInt(6), extInt(7)] },
  F: portFConfig, G: portGConfig, H: portHConfig, J: portJConfig, K: { ...portKConfig, pinChange: pinChange(2, 0x6d, 0x16) }, L: portLConfig,
};
const P = MEGA_PORTS;
const MEGA = {
  id: 'mega', flash: 0x40000, sram: 0x2100, ram: 0x200, a0: 54, analog: 16, vec: 57 * 2, eeprom: 4096,
  pins: [['E', 0], ['E', 1], ['E', 4], ['E', 5], ['G', 5], ['E', 3], ['H', 3], ['H', 4], ['H', 5], ['H', 6], ['B', 4], ['B', 5], ['B', 6], ['B', 7],
    ['J', 1], ['J', 0], ['H', 1], ['H', 0], ['D', 3], ['D', 2], ['D', 1], ['D', 0],
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((b) => ['A', b]), ...[7, 6, 5, 4, 3, 2, 1, 0].map((b) => ['C', b]),
    ['D', 7], ['G', 2], ['G', 1], ['G', 0], ...[7, 6, 5, 4, 3, 2, 1, 0].map((b) => ['L', b]), ['B', 3], ['B', 2], ['B', 1], ['B', 0],
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((b) => ['F', b]), ...[0, 1, 2, 3, 4, 5, 6, 7].map((b) => ['K', b])],
  pwm: {
    2: [0x90, 5, 0x9a], 3: [0x90, 3, 0x9c], 4: [0x44, 5, 0x48], 5: [0x90, 7, 0x98], 6: [0xa0, 7, 0xa8], 7: [0xa0, 5, 0xaa], 8: [0xa0, 3, 0xac],
    9: [0xb0, 5, 0xb4], 10: [0xb0, 7, 0xb3], 11: [0x80, 7, 0x88], 12: [0x80, 5, 0x8a], 13: [0x44, 7, 0x47],
    44: [0x120, 3, 0x12c], 45: [0x120, 5, 0x12a], 46: [0x120, 7, 0x128],
  },
  ports: MEGA_PORTS,
  timers: [
    { ...timer0Config, compAInterrupt: 0x2a, compBInterrupt: 0x2c, ovfInterrupt: 0x2e, compPortA: P.B.PORT, compPinA: 7, compPortB: P.G.PORT, compPinB: 5, externalClockPort: P.D.PORT, externalClockPin: 7 },
    { ...timer1Config, ...t16, captureInterrupt: 0x20, compAInterrupt: 0x22, compBInterrupt: 0x24, compCInterrupt: 0x26, ovfInterrupt: 0x28, OCRC: 0x8c,
      compPortA: P.B.PORT, compPinA: 5, compPortB: P.B.PORT, compPinB: 6, compPortC: P.B.PORT, compPinC: 7, externalClockPort: P.D.PORT, externalClockPin: 6 },
    { ...timer2Config, compAInterrupt: 0x1a, compBInterrupt: 0x1c, ovfInterrupt: 0x1e, compPortA: P.B.PORT, compPinA: 4, compPortB: P.H.PORT, compPinB: 6 },
    megaTimer(3, 0x90, 0x38, 0x71, 0x3e, [P.E, 3], [P.E, 4], [P.E, 5], [P.E, 6]),
    megaTimer(4, 0xa0, 0x39, 0x72, 0x52, [P.H, 3], [P.H, 4], [P.H, 5], [P.H, 7]),
    megaTimer(5, 0x120, 0x3a, 0x73, 0x5c, [P.L, 3], [P.L, 4], [P.L, 5], [P.L, 2]),
  ],
  usarts: [
    { ...usart0Config, rxCompleteInterrupt: 0x32, dataRegisterEmptyInterrupt: 0x34, txCompleteInterrupt: 0x36 },
    ...[[0xc8, 0x48], [0xd0, 0x66], [0x130, 0x6c]].map(([r, v]) => ({ rxCompleteInterrupt: v, dataRegisterEmptyInterrupt: v + 2, txCompleteInterrupt: v + 4, UCSRA: r, UCSRB: r + 1, UCSRC: r + 2, UBRRL: r + 4, UBRRH: r + 5, UDR: r + 6 })),
  ],
  adc: { ...adcConfig, adcInterrupt: 0x3a, numChannels: 16, muxInputMask: 0x3f, muxChannels: megaChannels, adcReferences: [ADCReference.AREF, ADCReference.AVCC, ADCReference.Internal1V1, ADCReference.Internal2V56] },
  wdt: { ...watchdogConfig, watchdogInterrupt: 0x18 }, ee: { ...eepromConfig, eepromReadyInterrupt: 0x3c },
  spi: { ...spiConfig, spiInterrupt: 0x30 }, twi: { ...twiConfig, twiInterrupt: 0x4e },
};
export const BOARDS = { nano: NANO, mega: MEGA };

// WS2812 on one pin: high pulse 4..6 cycles = 0, 10..14 = 1 (FastLED: 250 / 875 ns of 1250 ns at 16 MHz);
// low longer than RESET cycles (or long high) ends frame
const BIT1 = 8.5 * MHZ / 16, LONG_HIGH = 3 * MHZ, RESET = 40 * MHZ;
class Ws2812 {
  constructor(pin, onFrame, order) { this.pin = pin; this.onFrame = onFrame; this.order = order || 'GRB'; this.bytes = []; this.cur = 0; this.nbits = 0; this.rise = -1; this.fall = -1; this.high = false; }
  edge(level, t) {
    if (level) {
      if (this.fall >= 0 && t - this.fall > RESET) this.end();
      this.rise = t; this.high = true;
    } else if (this.high) {
      this.high = false; this.fall = t;
      const w = t - this.rise;
      if (w > LONG_HIGH) { this.drop(); return; }
      this.cur = (this.cur << 1) | (w > BIT1 ? 1 : 0);
      if (++this.nbits === 8) { this.bytes.push(this.cur); this.cur = 0; this.nbits = 0; }
    }
  }
  // called now and then: frame ends after latch time without new bits
  check(t) { if (!this.high && this.fall >= 0 && t - this.fall > RESET && (this.bytes.length || this.nbits)) this.end(); }
  drop() { this.bytes = []; this.cur = 0; this.nbits = 0; this.fall = -1; }
  end() {
    const n = Math.floor(this.bytes.length / 3);
    if (n >= 1) {
      // strip's own color order on wire (WS2812B: GRB) → RGB
      const rgb = new Uint8Array(n * 3), b = this.bytes, o = this.order, ir = o.indexOf('R'), ig = o.indexOf('G'), ib = o.indexOf('B');
      for (let i = 0; i < n; i++) { rgb[i * 3] = b[i * 3 + ir]; rgb[i * 3 + 1] = b[i * 3 + ig]; rgb[i * 3 + 2] = b[i * 3 + ib]; }
      this.onFrame(this.pin, rgb, n);
    }
    this.drop();
  }
}

export class AvrBoard {
  // hex: text of .hex; elf: bytes (optional); io: { frame(pin, rgb, count), serial(bytes), baud(value), order: color order of strip on wire,
  // board: 'nano' (default) / 'mega' }
  constructor(hex, elf, io = {}) {
    this.io = io;
    const B = this.board = BOARDS[io.board] || NANO, PINS = this.pinMap = B.pins;
    const prog = new Uint8Array(B.flash);
    for (const s of parseHex(hex)) prog.set(s.data.subarray(0, Math.max(0, Math.min(s.data.length, prog.length - s.addr))), s.addr);
    this.progMem = new Uint16Array(prog.buffer);
    const cpu = this.cpu = new CPU(this.progMem, B.sram);
    this.timers = B.timers.map((c) => new AVRTimer(cpu, c));
    this.clock = new AVRClock(cpu, F, clockConfig);
    this.wdt = new AVRWatchdog(cpu, B.wdt, this.clock);
    this.eeprom = new AVREEPROM(cpu, new EEPROMMemoryBackend(B.eeprom), B.ee);
    this.spi = new AVRSPI(cpu, B.spi, F);
    this.twi = new AVRTWI(cpu, B.twi, F);
    // Serial = USART0 (monitor); Mega Serial1..3 run too (output dropped), so sketches using them do not wait forever
    this.usarts = B.usarts.map((c) => new AVRUSART(cpu, c, F));
    this.usart = this.usarts[0];
    this.ucsra = B.usarts[0].UCSRA;
    this.usart.onByteTransmit = (b) => { if (this.io.serial) this.io.serial(b); };
    this.usart.onConfigurationChange = () => { if (this.io.baud) this.io.baud(this.usart.baudRate); };
    this.rx = [];
    this.ports = {};
    for (const [n, c] of Object.entries(B.ports)) this.ports[n] = new AVRIOPort(cpu, c);
    this.adc = new AVRADC(cpu, B.adc);
    this.analog = new Int16Array(B.analog).fill(-1); // page values 0..1023, -1 = floating (noise)
    this.aread = new Int16Array(B.analog).fill(-1);   // channels sketch has read (last value)
    const adcRead = this.adc.onADCRead;
    this.adc.onADCRead = (input) => {
      const ch = input && input.channel;
      if (ch != null && ch < B.analog) {
        const v = this.analog[ch] >= 0 ? this.analog[ch] : (this.rand() * 1024) | 0;
        this.adc.channelValues[ch] = v * 5 / 1023;
        this.aread[ch] = v;
      }
      adcRead(input);
    };
    this.drive = new Uint8Array(PINS.length + B.analog).fill(255); // digital level driven by page per Arduino pin: 0 / 1, 255 = released
    // WS2812 decoders on every output bit
    this.ws = new Map(); this.frames = 0;
    const onFrame = (pin, rgb, n) => { this.frames++; if (this.io.frame) this.io.frame(pin, rgb, n); };
    for (const [name, port] of Object.entries(this.ports)) {
      const pinsOf = [];
      PINS.forEach(([p, b], i) => { if (p === name) pinsOf[b] = i; });
      port.addListener((value, old) => {
        const ch = value ^ old, t = cpu.cycles;
        if (!ch) return;
        for (let b = 0; b < 8; b++) {
          if (!(ch & (1 << b)) || pinsOf[b] == null) continue;
          const pin = pinsOf[b];
          let d = this.ws.get(pin); if (!d) { d = new Ws2812(pin, onFrame, this.io.order); this.ws.set(pin, d); }
          d.edge(value & (1 << b), t);
        }
      });
    }
    // released pins follow pull-up at once: PORT / DDR writes change level that input reads
    this.pull = {};
    for (const [name, port] of Object.entries(this.ports)) {
      const cfg = port.portConfig, own = [];
      PINS.forEach(([p], pin) => { if (p === name) own.push(pin); });
      this.pull[name] = 0;
      for (const a of [cfg.PORT, cfg.DDR]) {
        const hook = cpu.writeHooks[a];
        cpu.writeHooks[a] = (...args) => {
          const r = hook(...args), pu = cpu.data[cfg.PORT] & ~cpu.data[cfg.DDR];
          if (pu !== this.pull[name]) { this.pull[name] = pu; for (const pin of own) if (this.drive[pin] === 255) this.applyPin(pin); }
          return r;
        };
      }
    }
    // loop() entry, when it is function of its own (LTO usually puts it into main)
    const sy = elfSymbols(elf);
    this.fnSy = [...sy.values()].filter((v) => v.type === 2 && v.size && v.addr < B.flash).sort((a, b) => a.addr - b.addr);
    this.loopAddr = sy.has('loop') && sy.get('loop').type === 2 ? sy.get('loop').addr >> 1 : -1;
    // memory: free RAM above heap is painted, stack that grows down overwrites paint (lowest overwritten byte = deepest stack)
    const ram = (n) => (sy.has(n) ? sy.get(n).addr & 0xffff : -1);
    this.mem = { start: B.ram, end: B.sram + 0xff, dataStart: ram('__data_start'), dataEnd: ram('__data_end'), bssEnd: ram('__bss_end'), heapStart: ram('__heap_start'), brkval: ram('__brkval'), heapMax: 0, collide: -1 };
    if (this.mem.heapStart < 0) this.mem.heapStart = this.mem.bssEnd >= 0 ? this.mem.bssEnd : B.ram;
    cpu.data.fill(PAINT, this.mem.heapStart, this.mem.end + 1);
    this.heapTop = this.mem.heapStart;
    this.loops = 0;
    this.rs = 0x9e3779b9;
  }
  // board halted (debugger, pause): line stays low, strip latches data it got — frame goes to page now, not on resume
  latch() { for (const d of this.ws.values()) if (!d.high && d.bytes.length) d.end(); }
  rand() { let x = this.rs; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rs = x >>> 0; return this.rs / 4294967296; }
  get ms() { return this.cpu.cycles / (MHZ * 1000); }
  // runs until cycle count reaches `to`
  run(to) {
    const cpu = this.cpu, loopAddr = this.loopAddr;
    while (cpu.cycles < to) {
      const stop = Math.min(to, cpu.cycles + 1500 + ((this.rs = (this.rs * 1103515245 + 12345) >>> 0) >>> 24)); // ~100 us slices: serial input, end of LED frames, profile sample
      if (this.dbg && (this.dbg.on || this.dbg.step)) { if (this.runDebug(stop)) return; }
      else if (loopAddr >= 0) {
        while (cpu.cycles < stop) { if (cpu.pc === loopAddr) this.loops++; avrInstruction(cpu); cpu.tick(); }
      } else {
        while (cpu.cycles < stop) { avrInstruction(cpu); cpu.tick(); }
      }
      if (this.rx.length && !(cpu.data[this.ucsra] & 0x80) && this.usart.writeByte(this.rx[0])) this.rx.shift(); // UCSR0A.RXC clear: next byte goes on wire
      for (const d of this.ws.values()) d.check(cpu.cycles);
      if (this.prof) this.sample();
      if (cpu.SP < this.heapTop && this.mem.collide < 0) this.mem.collide = this.ms; // stack ran into heap / variables
    }
  }
  // ---------------------------------------------------------------- debugger
  // lines: sketchLines() of build. Breakpoints are byte addresses; halt stops run(), state goes to page.
  debugSetup(lines) {
    const words = this.progMem.length;
    this.lines = new LineMap(lines);
    this.dbg = { line: this.lines.wordIndex(words), bp: new Uint8Array(words), on: false, step: null, skip: -1, halted: null };
  }
  // addrs: byte addresses; ranges: [[start, end, …] (bytes) per inlined copy]: also stop where caller's own jumps / branches go
  // into copy (loop rotated by optimizer: entry of copy runs once, then loop jumps back into it past entry)
  setBreakpoints(addrs, ranges = []) {
    const d = this.dbg; if (!d) return;
    d.bp.fill(0);
    for (const a of addrs) if ((a >> 1) < d.bp.length) d.bp[a >> 1] = 1;
    for (const g of ranges) for (const w of this.jumpsInto(g)) d.bp[w] = 1;
    d.on = addrs.length > 0;
  }
  // words inside ranges g (bytes [start, end, …]) that RJMP / JMP / BRxx of function holding them jump to from outside g
  jumpsInto(g) {
    const pm = this.progMem, out = new Set(), inG = (w) => { for (let i = 0; i + 1 < g.length; i += 2) if (w * 2 >= g[i] && w * 2 < g[i + 1]) return true; return false; };
    const fn = this.fnSy.filter((f) => f.addr <= g[0]).pop();
    if (!fn || g[0] >= fn.addr + fn.size) return out;
    for (let w = fn.addr >> 1, e = Math.min(pm.length, (fn.addr + fn.size) >> 1); w < e; w++) {
      const op = pm[w]; let t = -1;
      if ((op & 0xfe0c) === 0x940c || (op & 0xfe0f) === 0x9000 || (op & 0xfe0f) === 0x9200) { // JMP / CALL, LDS, STS: 2 words
        if ((op & 0xfe0e) === 0x940c) t = pm[w + 1] | ((op & 1) << 16) | ((op & 0x1f0) << 13);
        if (t >= 0 && !inG(w) && inG(t)) out.add(t);
        w++; continue;
      }
      if ((op & 0xf000) === 0xc000) t = w + 1 + ((op & 0x800) ? (op & 0xfff) - 0x1000 : op & 0xfff); // RJMP
      else if ((op & 0xf800) === 0xf000 || (op & 0xf800) === 0xf400) t = w + 1 + (((op >> 3) & 0x40) ? ((op >> 3) & 0x7f) - 0x80 : (op >> 3) & 0x7f); // BRBS / BRBC
      if (t >= 0 && !inG(w) && inG(t)) out.add(t);
    }
    return out;
  }
  // into: next sketch line; over: next line in same or calling function; out: back in caller
  startStep(mode) {
    const d = this.dbg, cpu = this.cpu; if (!d) return;
    const s = { mode, line: d.line[cpu.pc], sp: cpu.SP, isr: -1, ret: -1, retSp: 0 };
    if (mode === 'out') { const f = this.callStack(); if (f.length > 1) { s.ret = f[1].pc >> 1; s.retSp = f[1].sp; } else s.mode = 'over'; }
    d.step = s; d.skip = cpu.pc; d.halted = null;
  }
  resume() { const d = this.dbg; if (!d) return; d.step = null; d.skip = this.cpu.pc; d.halted = null; }
  halt(reason) { const d = this.dbg; if (!d) return; d.step = null; d.halted = { reason }; }
  runDebug(stop) {
    const cpu = this.cpu, d = this.dbg, bp = d.bp, line = d.line, vec = this.board.vec;
    while (cpu.cycles < stop) {
      const pc = cpu.pc;
      if (bp[pc] && pc !== d.skip) { this.halt('breakpoint'); return true; }
      d.skip = -1;
      avrInstruction(cpu); cpu.tick();
      const s = d.step; if (!s) continue;
      // interrupt taken during step (PC at vector table): its code is passed over
      if (cpu.pc < vec && s.isr < 0) { s.isr = cpu.SP; continue; }
      if (s.isr >= 0) { if (cpu.SP <= s.isr) continue; s.isr = -1; }
      const id = line[cpu.pc];
      if (s.mode === 'out') { if (cpu.pc === s.ret && cpu.SP >= s.retSp) { this.halt('step'); return true; } continue; }
      if (id < 0 || id === s.line) continue;
      if (s.mode === 'into' || cpu.SP >= s.sp) { this.halt('step'); return true; }
    }
    return false;
  }
  // return address on stack at a (word address, high byte first: 2 bytes, 3 on 2560), when it follows CALL / RCALL / ICALL / EICALL; else -1
  retAt(a) {
    const d = this.cpu.data, pm = this.progMem;
    const r = this.cpu.pc22Bits ? (d[a] << 16) | (d[a + 1] << 8) | d[a + 2] : (d[a] << 8) | d[a + 1];
    if (r < 2 || r >= pm.length) return -1;
    const op2 = pm[r - 2], op1 = pm[r - 1];
    return (op2 & 0xfe0e) === 0x940e || (op1 & 0xf000) === 0xd000 || op1 === 0x9509 || op1 === 0x9519 ? r : -1;
  }
  // call stack: current PC, then return addresses on stack, with stack address of each (SP after return)
  callStack() {
    const cpu = this.cpu, n = cpu.pc22Bits ? 3 : 2, out = [{ pc: cpu.pc * 2, sp: cpu.SP }];
    for (let a = cpu.SP + 1; a + n - 1 <= this.mem.end && out.length < 32; a++) {
      const r = this.retAt(a); if (r < 0) continue;
      out.push({ pc: r * 2, sp: a + n - 1 }); a += n - 1;
    }
    return out;
  }
  // state for debugger panel: registers, SREG, SP, PC, stack frames, SRAM (ramStart…RAMEND)
  state() {
    const cpu = this.cpu, d = cpu.data;
    return { pc: cpu.pc * 2, sp: cpu.SP, sreg: d[0x5f], regs: d.slice(0, 32), ram: d.slice(this.mem.start, this.mem.end + 1), ramStart: this.mem.start, ms: this.ms, cycles: cpu.cycles, frames: this.callStack(), reason: this.dbg && this.dbg.halted ? this.dbg.halted.reason : 'pause' };
  }
  // ---------------------------------------------------------------- memory
  // { ram, data, bss, heap, heapMax, stack, stackMax, free, freeMin, sp, collide (board ms or -1) }
  memory() {
    const m = this.mem, d = this.cpu.data;
    let brk = m.brkval >= 0 ? d[m.brkval] | (d[m.brkval + 1] << 8) : 0;
    if (!brk) brk = m.heapStart;
    this.heapTop = brk;
    // high-water marks from paint: heap grows up from heapStart (freed blocks stay written), stack grows down
    let hw = m.heapStart;
    while (hw <= m.end && d[hw] !== PAINT) hw++;
    m.heapMax = Math.max(m.heapMax, brk - m.heapStart, hw - m.heapStart);
    let low = Math.max(brk, hw);
    while (low <= m.end && d[low] === PAINT) low++; // first byte stack has written
    const sp = this.cpu.SP;
    return {
      ram: m.end + 1 - m.start, data: m.dataEnd - m.dataStart, bss: m.bssEnd - m.dataEnd, heap: brk - m.heapStart, heapMax: m.heapMax,
      stack: m.end - sp, stackMax: m.end + 1 - low, free: sp + 1 - brk, freeMin: low - Math.max(brk, hw), sp, collide: m.collide,
    };
  }
  // ---------------------------------------------------------------- profiler: PC sampled every ~100 us of board time,
  // return addresses on stack (after CALL / RCALL / ICALL) give functions it was called from
  // funcs: [{ addr, size, name, … }] sorted by address (from build: nm -C -n)
  profile(funcs) {
    const words = this.progMem.length, idx = new Int32Array(words).fill(-1);
    funcs.forEach((f, i) => {
      const a = f.addr >> 1, next = i + 1 < funcs.length ? funcs[i + 1].addr >> 1 : words;
      const e = Math.min(words, f.size ? a + ((f.size + 1) >> 1) : next);
      for (let w = a; w < e; w++) idx[w] = i;
    });
    this.prof = { idx, self: new Float64Array(funcs.length), incl: new Float64Array(funcs.length), n: 0, seen: new Int32Array(funcs.length).fill(-1) };
  }
  sample() {
    const p = this.prof, cpu = this.cpu, n = ++p.n, w = cpu.pc22Bits ? 3 : 2;
    const f = p.idx[cpu.pc] ?? -1;
    if (f >= 0) { p.self[f]++; p.incl[f]++; p.seen[f] = n; }
    for (let a = cpu.SP + 1; a + w - 1 <= this.mem.end; a++) {
      const r = this.retAt(a); if (r < 0) continue;
      const g = p.idx[r - 1]; // caller
      if (g >= 0 && p.seen[g] !== n) { p.incl[g]++; p.seen[g] = n; }
      a += w - 1;
    }
  }
  serialIn(bytes) { for (const b of bytes) this.rx.push(b); }
  setAnalog(pin, v) { const B = this.board, ch = pin >= B.a0 ? pin - B.a0 : pin; if (ch >= 0 && ch < B.analog) this.analog[ch] = v; }
  setPin(pin, v) { if (pin >= 0 && pin < this.pinMap.length) { this.drive[pin] = v; this.applyPin(pin); } }
  applyPin(pin) {
    const [p, b] = this.pinMap[pin], port = this.ports[p], cfg = port.portConfig, data = this.cpu.data;
    const v = this.drive[pin];
    // released: input with pull-up reads high, without it low
    port.setPin(b, v === 255 ? !!(data[cfg.PORT] & (1 << b)) && !(data[cfg.DDR] & (1 << b)) : !!v);
  }
  // state of pins sketch has used, for Inputs window: [{ pin, mode, out, pwm, read, aread }]
  // (pin counts as used once its DDR or PORT bit was set: output, INPUT_PULLUP; or analog channel was read)
  pins() {
    const data = this.cpu.data, out = [];
    this.used ||= new Set();
    const B = this.board;
    this.pinMap.forEach(([p, b], pin) => {
      const cfg = this.ports[p].portConfig, m = 1 << b;
      const ddr = data[cfg.DDR] & m, port = data[cfg.PORT] & m;
      if (this.drive[pin] === 255) this.applyPin(pin); // pull-up may have changed
      const mode = ddr ? 1 : port ? 2 : 0;
      let pwm = -1;
      const pw = B.pwm[pin];
      if (pw && ddr && (data[pw[0]] & (1 << pw[1]))) pwm = data[pw[2]];
      const aread = pin >= B.a0 && pin - B.a0 < B.analog ? this.aread[pin - B.a0] : -1;
      if (ddr || port) this.used.add(pin);
      if (this.used.has(pin) || aread >= 0 || this.drive[pin] !== 255) out.push({ pin, mode, out: ddr ? (port ? 1 : 0) : -1, pwm, read: ddr ? -1 : (data[cfg.PIN] & m ? 1 : 0), aread });
    });
    for (let ch = this.pinMap.length - B.a0; ch < B.analog; ch++) if (this.aread[ch] >= 0) out.push({ pin: B.a0 + ch, mode: 0, out: -1, pwm: -1, read: -1, aread: this.aread[ch] });
    return out;
  }
}
