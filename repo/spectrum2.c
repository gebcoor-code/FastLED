/* -------------- ύττεκς "VU-Meter"
    (c) G6EJD, https://www.youtube.com/watch?v=OStljy_sUVg&t=0s
    reworked by s-marley https://github.com/s-marley/ESP32_FFT_VU
    adopted for FireLamp_jeeUI by kostyamat, kDn
    reworked and updated (c) kostyamat 24.04.2021
*/

//simplified to get just one effect by coor@ 03.12.25

// VU-meter
#define WIDTH LED_COLS
#define HEIGHT LED_ROWS

#define SAMPLES           256U          // Must be a power of 8
#define NUM_BANDS       WIDTH
#define TOP            (HEIGHT - 1)                // Don't allow the bars to go offscreen
#define BAR_WIDTH      (WIDTH  / (NUM_BANDS - 1))  // If width >= 8 light 1 LED width per bar, >= 16 light 2 LEDs width bar etc

bool loadingFlag = true;
const float speedFactorVertical = (float)HEIGHT / 16;

void drawPixelXYF(float x, float y, CRGB color) {
  // if (x < 0 || y < 0 || x > ((float)WIDTH - 1) || y > ((float)HEIGHT - 1)) return;
  uint8_t xx = (x - (int) x) * 255, yy = (y - (int) y) * 255, ix = 255 - xx, iy = 255 - yy;
  // calculate the intensities for each affected pixel
  #define WU_WEIGHT(a, b)((uint8_t)(((a) * (b) + (a) + (b)) >> 8))
  uint8_t wu[4] = {
    WU_WEIGHT(ix, iy),
    WU_WEIGHT(xx, iy),
    WU_WEIGHT(ix, yy),
    WU_WEIGHT(xx, yy)
  };
  // multiply the intensities by the colour, and saturating-add them to the pixels
  for (uint8_t i = 0; i < 4; i++) {
    int16_t xn = x + (i & 1), yn = y + ((i >> 1) & 1);
    CRGB clr = leds[XY(xn, yn)];
    clr.r = qadd8(clr.r, (color.r * wu[i]) >> 8);
    clr.g = qadd8(clr.g, (color.g * wu[i]) >> 8);
    clr.b = qadd8(clr.b, (color.b * wu[i]) >> 8);
    leds[XY(xn, yn)] = clr;
  }
}

class EffectVU {
private:
    byte colorShift = 255;
    // Sampling and FFT stuff
    float peak[NUM_BANDS];              // The length of these arrays must be >= NUM_BANDS
    float oldBarHeights[NUM_BANDS];
    float bandValues[NUM_BANDS];

    uint8_t last_max_peak;
    float maxVal;
    float amplitude = 0.4; // 0.025 - 0.5
    void horizontalColoredBars(uint8_t band, float barHeight);
    void whitePeak(uint8_t band);

public:
    bool run();
    void load();
};

void EffectVU::load() {
  for(uint16_t i=0; i<sizeof(oldBarHeights)/(sizeof(*oldBarHeights));i++)
  for(uint16_t i=0; i<sizeof(bandValues)/(sizeof(*bandValues));i++)
    bandValues[i]=0.0f;
}

bool EffectVU::run() {
  
  EVERY_N_MILLIS(random(50,100)) { //here the dynamics of VU is set. was (50,300)
    last_max_peak=random(0,HEIGHT);
    maxVal = random(0,last_max_peak);
    for (uint16_t i = 0; i < (sizeof(bandValues) / sizeof(float)); i++) {
      bandValues[i] = random(2)? random(0, HEIGHT) : bandValues[i];
    }
  }

  float _scale = (maxVal==0? 0 : last_max_peak/maxVal) * amplitude;

  FastLED.clear();

  // Process the FFT data into bar heights
  for (byte band = 0; band < NUM_BANDS; band++) {

    // Scale the bars for the display
    float barHeight = bandValues[band] * _scale > 0/*threshold*/ ? (bandValues[band] * _scale) : 0.;
    if (barHeight > TOP) barHeight = TOP;

    // Small amount of averaging between frames
    barHeight = ((oldBarHeights[band] * 1) + barHeight) / 2;

    // Move peak up
    if (barHeight > peak[band]) {
      peak[band] = min((float)TOP, barHeight);
    }
    
    horizontalColoredBars(band, barHeight);
    whitePeak(band);

    // Save oldBarHeights for averaging later
    oldBarHeights[band] = barHeight;
  }

  // Decay peak
    for (byte band = 0; band < NUM_BANDS; band++)
      if (peak[band] > 0) peak[band] -= 0.25 * speedFactorVertical;
  return true;
}

void EffectVU::horizontalColoredBars(uint8_t band, float barHeight) {
  uint8_t xStart = BAR_WIDTH * band;
  
  EVERY_N_MILLIS(10) colorShift--;
  
  for (uint8_t x = xStart; x < xStart + BAR_WIDTH; x++) {
    for (float y = TOP; y >= (float)TOP - barHeight; y-= 0.5) {
        // Just color by height
        drawPixelXYF(x, (float)TOP - y, CHSV(band * (232 / NUM_BANDS) + colorShift, 255, 255));
//        drawPixelXYF(x, (float)TOP - y, ColorFromPalette(LavaColors_p, band * (232 / NUM_BANDS) + colorShift));
    }
  }
}

void EffectVU::whitePeak(uint8_t band) {
  uint8_t xStart = BAR_WIDTH * band;
  float peakHeight = (float)TOP - peak[band] - 1;
  for (uint8_t x = xStart; x < xStart + BAR_WIDTH; x++) {
    drawPixelXYF(x, (float)TOP - peakHeight, CHSV(0,0,255));
  }
}

EffectVU eff;

void draw() {
  
  if (loadingFlag) {
    eff.load();
    loadingFlag = false;
  }
  eff.run();
  delay(16);  // ~60fps
}