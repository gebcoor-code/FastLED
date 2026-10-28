//https://editor.soulmatelights.com/gallery/2875-adjustive-graph-recreation
// типа график мелкий
// This is simple recreation of adjustive graph presentation
// @st3p40(aka stepko) ( Feb 2025 )

#define MIN_BORDER 0 //minimum
#define MAX_BORDER maximum // UINT32_MAX

uint32_t line_high [LED_COLS];

void draw() {
  uint32_t maximum = 0;
  uint32_t minimum = UINT32_MAX;

  static uint32_t t;
  t+= 16;

  FastLED.clear();

  for( uint8_t x = 0 ; x < LED_COLS ; x++){
    line_high[x] = inoise16(((x << 5) + t) << 8, (t >> 3) + x); //some ahh noise function for testing 
  }

  for( uint8_t x = 0 ; x < LED_COLS ; x++){
    if (maximum < line_high[x]) {
      maximum = line_high[x];
    }

    if (minimum > line_high[x]) {
      minimum = line_high[x];
    }
  }

  for( uint8_t x = 0 ; x < LED_COLS ; x++ ){
    uint16_t raw_y = map(line_high[x], MIN_BORDER, MAX_BORDER, 0, LED_ROWS << 8);
    uint8_t led_y = raw_y >> 8;
    uint8_t point_y = raw_y % 256;
    uint8_t x_hue = x + (t >> 2);
    for( uint8_t y = 0; y < led_y; y++){
      leds[XY(x, y)] = CHSV(x_hue,  map(y, 0, led_y, 255, 0), map(y, 0, led_y, 0, 255));
    }
    leds[XY(x, led_y)] = CHSV(x_hue, 0, point_y); // "sub-pixel"
  }
}