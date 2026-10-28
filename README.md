# Web FastLED

Web IDE and emulator for Arduino + FastLED sketches — Arduino Nano (ATmega328P) and Arduino Mega 2560 (ATmega2560).
Everything runs in browser: editor, compilers, emulator, upload to board. No install, no server-side code.

## Features

- **Editor** (CodeMirror 6): C / C++ highlighting, find / replace, search in all files of project, folding, multi-cursor,
  color themes of Visual Studio Code. Project is `.zip` with sketch (`.ino`, `.h`, `.c`, `.cpp`); Save gives it back
  byte for byte except changed files, in their own encoding and line endings.
- **Emulator**: sketch compiled by clang 21 (YoWASP LLVM for WebAssembly) right in browser and run as WebAssembly in
  real time, with Arduino core and FastLED 3.7.8. LED window: matrix of any size and wiring (GyverMatrix style),
  rebuild with other WIDTH / HEIGHT without editing code, speed 0.1×…10×, 3D view (cylinder, sphere, globe, torus,
  disc, dome), Inputs window (buttons, pots), Serial monitor, profile build.
- **Board binary**: real build with avr-gcc 7.3.0 compiled to WebAssembly — same compiler, flags and steps as
  Arduino IDE (AVR core 1.8.6, LTO); `.hex`, `.eep`, `.elf`, `.hex` / `.bin` with bootloader are byte for byte
  those of IDE. Size report as IDE.
- **Real CPU timing**: `.hex` of real build runs on emulated ATmega328P / ATmega2560 at 16 MHz, instruction by
  instruction (avr8js): delays, interrupts and `FastLED.show()` take exactly as long as on board. LED colors read
  from data pin by pulse widths. Memory tab (RAM, stack, heap high-water marks), CPU profile of board.
- **Debugger** (Real CPU timing): breakpoints, step over / into / out, call stack, registers, RAM.
- **Upload** over USB (Web Serial: Chrome, Edge, Opera, new Firefox): STK500v1 (Nano: Optiboot / Old Bootloader),
  STK500v2 (Mega 2560); Serial monitor of real board.
- **Offline**: site opened once starts without internet (service worker); Options → Offline downloads compilers
  and library in advance.

## License

Web FastLED itself: MIT license, see [LICENSE](LICENSE). Components keep their own licenses (MIT, Apache 2.0,
LGPL 2.1, GPL 3, BSD) — listed in LICENSE and in Options → About → Credits.
