//sparkles. from gyver

#define DENSE 7   
#define BRIGHT_STEP 20

uint16_t getPixelNumber(int8_t x, int8_t y) {
    return (y * LED_COLS + x);}


uint32_t getPixColor(int thisSegm) {
  int thisPixel = thisSegm;
  if (thisPixel < 0 || thisPixel > NUM_LEDS - 1) return 0;
  return (((uint32_t)leds[thisPixel].r << 16) | ((long)leds[thisPixel].g << 8 ) | (long)leds[thisPixel].b);
}

uint32_t getPixColorXY(int8_t x, int8_t y) {
  return getPixColor(getPixelNumber(x, y));
}

void fadePixel(byte i, byte j, byte step) {     // новый фейдер
  int pixelNum = getPixelNumber(i, j);
  if (getPixColor(pixelNum) == 0) return;

  if (leds[pixelNum].r >= 10 || //30
      leds[pixelNum].g >= 10 || //30
      leds[pixelNum].b >= 10) { //30
    leds[pixelNum].fadeToBlackBy(step);
  } else {
    leds[pixelNum] = 0;
  }
}

void fader(byte step) {
  for (byte i = 0; i < LED_COLS; i++) {
    for (byte j = 0; j < LED_ROWS; j++) {
      fadePixel(i, j, step);
    }
  }
}

void draw() {
  
  for (byte i = 0; i < DENSE; i++) {
    byte x = random(0, LED_COLS);
    byte y = random(0, LED_ROWS);
    if (getPixColorXY(x, y) == 0)
      leds[getPixelNumber(x, y)] = CHSV(random(0, 255), 255, 255);
  }
  fader(BRIGHT_STEP);
  delay (100);

}

