#include <FastLED.h>

#define WIDTH 24
#define HEIGHT 24
#define NUM_LEDS WIDTH * HEIGHT
#define N_LEDS WIDTH * HEIGHT
#define DATA_PIN 6

#ifndef COLOR_ORDER
    #define COLOR_ORDER GRB
#endif

CRGB leds[NUM_LEDS+1];

uint16_t XY( uint8_t x, uint8_t y)
{
  uint16_t i;

    if ((x>WIDTH-1) || (y>HEIGHT-1)) return NUM_LEDS;

    if( y & 0x01) {
      uint8_t reverseX = (WIDTH - 1) - x;
      i = (y * WIDTH) + reverseX;
    } else {
      i = (y * WIDTH) + x;
    }
    return i;
}

void setup() { 
     FastLED.addLeds<WS2812B, DATA_PIN, COLOR_ORDER>(leds, NUM_LEDS+1);  // GRB ordering is typical
     FastLED.setBrightness (255);
     FastLED.setMaxPowerInVoltsAndMilliamps(5, 1000);
}

void loop() {
     draw();
     FastLED.show();
}
