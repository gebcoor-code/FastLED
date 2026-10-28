#define WIDTH LED_COLS
#define HEIGHT LED_ROWS
#define NUM_LEDS N_LEDS
#define SNOW_DENSE 20

//#define DATA_PIN 6

// Define the array of leds
//CRGB leds[NUM_LEDS];

void snowRoutine() {
  byte rr;
  for (byte x = 0; x < WIDTH; x++) {
    for (byte y = 0; y < HEIGHT - 1; y++) {
      if (leds[XY(x, y + 1)] != CRGB(0x000000)) {
        rr = random(3);
        if ((rr != 1) && (rr != 2)) leds[XY(x, y)] = leds[XY(x, y + 1)];
        if ((rr == 1) && (x < WIDTH - 1)) leds[XY(x + 1, y)] = leds[XY(x, y + 1)];
        if ((rr == 2) && (x > 0)) leds[XY(x - 1, y)] = leds[XY(x, y + 1)];
        leds[XY(x, y + 1)] = CRGB(0x000000);
      }
    }
  }
  
  for (byte x = 0; x < WIDTH; x++) {
    if ((leds[XY(x, HEIGHT - 2)] == CRGB(0x000000)) && (random(0, SNOW_DENSE) == 0))
      leds[XY(x, HEIGHT - 1)] = 0xE0FFFF - 0x101010 * random(0, 10);
    else
      leds[XY(x, HEIGHT - 1)] = CRGB(0x000000);
  }
  
  for (byte x = 0; x < WIDTH; x++) {
    leds[XY(x, 0)] = 0;
  }
  
  //blur2d(leds, WIDTH, HEIGHT, 10);
  //   nscale8(leds, NUM_LEDS, 230);
  fadeToBlackBy(leds, NUM_LEDS, 10);
}

void draw() {
  EVERY_N_MILLISECONDS(100) {
    snowRoutine();
  }
}


/////////////////////////////////////////