//color frizzles experiments.double.

#define HEIGHT ROWS
#define WIDTH COLS

void draw() {
  fadeToBlackBy(leds, NUM_LEDS, 70);
  for(byte i=11; i > 0;i--) {
    leds[XY(beatsin8(12+i,0,WIDTH+(random(5)-5)),beatsin8(15-i,0,HEIGHT+(random(5)-5)))]+=CHSV(beatsin8(12,0,255),255,255);
    leds[XY(beatsin8(12+i,0,WIDTH+(random(5)-5))+1,beatsin8(15-i,0,HEIGHT+(random(5)-5)))]+=CHSV(beatsin8(12,0,255),255,255);
    leds[XY(beatsin8(12+i,0,WIDTH+(random(5)-5))-1,beatsin8(15-i,0,HEIGHT+(random(5)-5)))]+=CHSV(beatsin8(12,0,255),255,255);
    leds[XY(beatsin8(12+i,0,WIDTH+(random(5)-5)),beatsin8(15-i,0,HEIGHT+(random(5)-5))+1)]+=CHSV(beatsin8(12,0,255),255,255);
    leds[XY(beatsin8(12+i,0,WIDTH+(random(5)-5)),beatsin8(15-i,0,HEIGHT+(random(5)-5))-1)]+=CHSV(beatsin8(12,0,255),255,255);
  //}
  }
  blur2d(leds,WIDTH,HEIGHT,16);
}