//https://editor.soulmatelights.com/gallery/922-spectrum

// This is a copy taken from: https://editor.soulmatelights.com/gallery/904-vu-meter

DEFINE_GRADIENT_PALETTE( purple_gp ) {
  0,   0, 212, 255,   //blue
255, 179,   0, 255 }; //purple

DEFINE_GRADIENT_PALETTE( rainbowsherbet_gp ) {
    0,  87,255, 65,
    1, 255, 33,  4,
   43, 255, 68, 25,
   86, 255,  7, 25,
  127, 255, 82,103,
  170, 255,255,242,
  209,  42,255, 22,
  255,  87,255, 65
};

DEFINE_GRADIENT_PALETTE( redyellow_gp ) {
  0,   200, 200,  200,   //white
 64,   255, 218,    0,   //yellow
128,   231,   0,    0,   //red
192,   255, 218,    0,   //yellow
255,   200, 200,  200 }; //white

DEFINE_GRADIENT_PALETTE( Colorfull_gp ) {
    0,  22,121,174,
    1,  10, 85,  5,
   25,  29,109, 18,
   60,  59,138, 42,
   93,  83, 99, 52,
  106, 110, 66, 64,
  109, 123, 49, 65,
  113, 139, 35, 66,
  116, 192,117, 98,
  124, 255,255,137,
  168, 100,180,155,
  255,  22,121,174
};

// VU-meter
#define WIDTH LED_COLS
#define HEIGHT LED_ROWS

#define SAMPLES           256U          // Must be a power of 8
#define NUM_BANDS       WIDTH
#define TOP            (HEIGHT - 1)                // Don't allow the bars to go offscreen
#define BAR_WIDTH      (WIDTH  / (NUM_BANDS - 1))  // If width >= 8 light 1 LED width per bar, >= 16 light 2 LEDs width bar etc

bool firstLoad = true;
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
    CRGBPalette16 gradPal[4] = { 
    purple_gp,    rainbowsherbet_gp, 
    redyellow_gp, Colorfull_gp
    };

    uint8_t calcArray = 1; // уменьшение частоты пересчета массива
    uint8_t colorTimer = 0;
    // Sampling and FFT stuff
    float peak[NUM_BANDS];              // The length of these arrays must be >= NUM_BANDS
    float oldBarHeights[NUM_BANDS];
    float bandValues[NUM_BANDS];

    float samp_freq;
    double last_freq = 0;
    uint8_t last_min_peak, last_max_peak;
    float maxVal;
    float threshold;
    byte tickCounter;
    byte colorType;

    float amplitude = 1.0;
    int effId = 0;
    bool type = 0;
    bool colorShifting = false;
    void horizontalColoredBars(uint8_t band, float barHeight, uint8_t type = 0, uint8_t colorShift = 0);
    void paletteBars(uint8_t band, float barHeight, CRGBPalette16& palette, uint8_t colorShift = 0);
    void verticalColoredBars(uint8_t band, float barHeight, uint8_t type = 0, uint8_t colorShift = 0);
    void centerBars(uint8_t band, float barHeight, CRGBPalette16& palette, uint8_t colorShift = 0);
    void whitePeak(uint8_t band);
    void outrunPeak(uint8_t band, CRGBPalette16& palette, uint8_t colorShift = 0);
    void waterfall(uint8_t band, uint8_t barHeight);

public:
    bool run();
    void load();
    String setDynCtrl();
};

/* -------------- эффект "VU-Meter"
    (c) G6EJD, https://www.youtube.com/watch?v=OStljy_sUVg&t=0s
    reworked by s-marley https://github.com/s-marley/ESP32_FFT_VU
    adopted for FireLamp_jeeUI by kostyamat, kDn
    reworked and updated (c) kostyamat 24.04.2021
*/
String EffectVU::setDynCtrl() {
 
  amplitude = 0.5; // 0.025 - 0.5
  threshold = 0; // 0-50
 // effId = 1; // 0-5
       EVERY_N_SECONDS(10) {
    //if (autoChangePatterns) effId = (effId + 1) % 6;
    effId = (effId + 1) % 5;
  }
  colorType = 0; // 0-4

    colorTimer = 0; // 0 - 255
    if (!colorTimer) colorShifting = true;
    else colorShifting = false;

  type = true;
  return String();
}

void EffectVU::load() {
#ifdef MIC_EFFECTS
  setMicAnalyseDivider(0); // disable the auto-work of the microphone, because here everything is analyzed separately, i.e. no need to do the same job twice
#endif
  //memset(oldBarHeights,0,sizeof(oldBarHeights));
  for(uint16_t i=0; i<sizeof(oldBarHeights)/(sizeof(*oldBarHeights));i++)
   // oldBarHeights[i]=0.0f;
  for(uint16_t i=0; i<sizeof(bandValues)/(sizeof(*bandValues));i++)
    bandValues[i]=0.0f;
}

bool EffectVU::run() {
#ifdef MIC_EFFECTS
  setMicAnalyseDivider(0); // disable the auto-work of the microphone, because here everything is analyzed separately, i.e. no need to do the same job twice
#endif
  // I'll leave myself a reminder of how it all works https://community.alexgyver.ru/threads/wifi-lampa-budilnik-proshivka-firelamp_jeeui-gpl.2739/post-85649
  //bool ready = false;
  tickCounter++;
#ifdef MIC_EFFECTS
  if(isMicOn()){ // this block is slow, the call to fill the array will be especially load
    //EVERY_N_MILLIS(100){ // the calculation is heavy, so it is advisable not to pull it more often 10 times per second, better less often
    if (!(tickCounter%3)) {
      bool withAnalyse = !(++calcArray%3);
      MICWORKER *mw = new MICWORKER(getMicScale(),getMicNoise(), withAnalyse);

      if(mw!=nullptr){
        samp_freq = mw->process(getMicNoiseRdcLevel()); // sampling rate
        last_min_peak = mw->getMinPeak();
        last_max_peak = mw->getMaxPeak()*2;
        // for(uint16_t i=0; i<sizeof(bandValues)/(sizeof(*bandValues));i++)
        //   bandValues[i]=0.0f;
        if(withAnalyse){
          maxVal=mw->fillSizeScaledArray(bandValues,NUM_BANDS);
          last_freq=mw->getFreq();
          //ready = true; // calculation is ready. We will print it in the next iteration of the effect. Output immediately == long iteration cycle of the effect.
          calcArray=1;
        }
        samp_freq = samp_freq; last_min_peak=last_min_peak; last_freq=last_freq; // push warnings
        delete mw;
      }
    }
    if (!(tickCounter%3)) return false; // we will not force the poor controller to also display information in the same cycle as the calculations. This cuts the FPS. But without new calculations - FPS is just spam.
  } else 
  #endif
  {
    EVERY_N_MILLIS(random(50,300)) {
    //if (!(tickCounter%random(5,17))) {
      last_max_peak=random(0,HEIGHT);
      maxVal = random(0,last_max_peak);
      for (uint16_t i = 0; i < (sizeof(bandValues) / sizeof(float)); i++) {
        bandValues[i] = random(2)? random(0, HEIGHT) : bandValues[i];
      }
     // last_freq = random(100,20000);
    }
  }

  float _scale = (maxVal==0? 0 : last_max_peak/maxVal) * amplitude;

  FastLED.clear();

  // Process the FFT data into bar heights
  for (byte band = 0; band < NUM_BANDS; band++) {

    // Scale the bars for the display
    float barHeight = bandValues[band] * _scale > threshold ? (bandValues[band] * _scale) : 0.;
    if (barHeight > TOP) barHeight = TOP;

    // Small amount of averaging between frames
    barHeight = ((oldBarHeights[band] * 1) + barHeight) / 2;

    // Move peak up
    if (barHeight > peak[band]) {
      peak[band] = min((float)TOP, barHeight);
    }

    // Draw bars
    switch (effId) {
      case 0:
        horizontalColoredBars(band, barHeight, colorType, colorTimer);
        break;
      case 1:
        outrunPeak(band, gradPal[colorType], colorTimer);
        break;
      case 2:
        paletteBars(band, barHeight, gradPal[colorType], colorTimer);
        break;
      case 3:
        centerBars(band, barHeight, gradPal[colorType], colorTimer);
        break;
      case 4:
        verticalColoredBars(band, barHeight, colorType, colorTimer);
        break;
      //case 5:
       // horizontalColoredBars(band, barHeight);
        //waterfall(band,  barHeight);
      //  break;
    }


    if(type) 
      switch (effId)
      {
      case 1:
      case 3:
        /* code */
        break;      
      default:
        whitePeak(band);
        break;
      }

    // Save oldBarHeights for averaging later
    oldBarHeights[band] = barHeight;
  }

  // Decay peak
 // EVERY_N_MILLISECONDS(EFFECTS_RUN_TIMER +1) {
    for (byte band = 0; band < NUM_BANDS; band++)
      if (peak[band] > 0) peak[band] -= 0.25*speedFactorVertical;
    //colorTimer++;
  //}

  // Used in some of the patterns
if (colorShifting) {
  //EVERY_N_MILLISECONDS(EFFECTS_RUN_TIMER*4) {
    colorTimer++;
  //}
}
/*
  EVERY_N_SECONDS(10) {
    if (autoChangePatterns) effId = (effId + 1) % 6;
   // effId = (effId + 1) % 6;
  }
*/
  return true;
}

// PATTERNS BELOW //

void EffectVU::horizontalColoredBars(uint8_t band, float barHeight, uint8_t type, uint8_t colorShift) {
  uint8_t xStart = BAR_WIDTH * band;
  colorShift--;
  for (uint8_t x = xStart; x < xStart + BAR_WIDTH; x++) {
    for (float y = TOP; y >= (float)TOP - barHeight; y-= 0.5) {
      switch (type) {
      case 0: // “олько цвет по высоте
        drawPixelXYF(x, (float)TOP - y, CHSV(band * (232 / NUM_BANDS) + colorShift, 255, 255));
        break;
      case 1: // ÷вет и насыщенность
        drawPixelXYF(x, (float)TOP - y, CHSV(band * (240 / NUM_BANDS) + colorShift, 256/TOP * y, 255));
        break;
      case 2: // ÷вет и €ркость
        drawPixelXYF(x, (float)TOP - y, CHSV(band * (240 / NUM_BANDS) + colorShift, 255, 255 - constrain(256/TOP * y, 0, 200)));
        break;
      case 3: // ÷вет, насыщенность и €ркость
        drawPixelXYF(x, (float)TOP - y, CHSV(band * (240 / NUM_BANDS) + colorShift, 256/TOP * y, 255 - constrain(256/TOP * y, 0, 200)));
        break;
      }
    }
  }
}

void EffectVU::paletteBars(uint8_t band, float barHeight, CRGBPalette16& palette, uint8_t colorShift) {
  colorShift--;
  uint8_t xStart = BAR_WIDTH * band;
  for (uint8_t x = xStart; x < xStart + BAR_WIDTH; x++) {
    for (float y = TOP; y >= (float)TOP - barHeight; y-= 0.5) {
      drawPixelXYF(x, (float)TOP - y, ColorFromPalette(palette, y * (255 / (barHeight + 1)) + colorShift));
    }
  }
}

void EffectVU::verticalColoredBars(uint8_t band, float barHeight, uint8_t type, uint8_t colorShift) {
  colorShift--;
  uint8_t xStart = BAR_WIDTH * band;
  for (uint8_t x = xStart; x < xStart + BAR_WIDTH; x++) {
    for (float y = TOP; y >= (float)TOP - barHeight; y-= 0.5) {
      switch (type) {
      case 0: // Only color by height
        drawPixelXYF(x, TOP - y, CHSV(y * (255 / HEIGHT) + colorShift, 255, 255));
        break;
      case 1: // Color and saturation
        drawPixelXYF(x, TOP - y, CHSV(y * (255 / HEIGHT) + colorShift, 256/TOP * y, 255));
        break;
      case 2: // Color and brightness
        drawPixelXYF(x, TOP - y, CHSV(y * (255 / HEIGHT) + colorShift, 255, 255 - constrain(256/TOP * y, 0, 200)));
        break;
      case 3: // Color, saturation and brightness
        drawPixelXYF(x, TOP - y, CHSV(y * (255 / HEIGHT) + colorShift, 256/TOP * y, 255 - constrain(256/TOP * y, 0, 200)));
        break;
      }

    }
  }
}

void EffectVU::centerBars(uint8_t band, float barHeight, CRGBPalette16& palette, uint8_t colorShift) {
  colorShift--;
  uint8_t xStart = BAR_WIDTH * band;
  for (uint8_t x = xStart; x < xStart + BAR_WIDTH; x++) {
    if ((int)barHeight % 2 == 0) barHeight--;
    float yStart = (((float)HEIGHT - barHeight) / 2 );
    for (float y = yStart; y <= (yStart + barHeight); y+= 0.25) {
      uint8_t colorIndex = constrain((y - yStart) * (255 / barHeight), 0, 255);
      drawPixelXYF(x, y, ColorFromPalette(palette, colorIndex + colorShift));
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

void EffectVU::outrunPeak(uint8_t band, CRGBPalette16& palette, uint8_t colorShift) {
  colorShift--;
  uint8_t xStart = BAR_WIDTH * band;
  float peakHeight = (float)TOP - peak[band] - 1;
  for (uint8_t x = xStart; x < xStart + BAR_WIDTH; x++) {
    drawPixelXYF(x, (float)TOP - peakHeight, type ? ColorFromPalette(palette, peakHeight * (255 / HEIGHT) + colorShift) : CHSV(colorShift, 255, 255));
  }
}

EffectVU eff;

void draw() {
  
  if (firstLoad) {
    eff.setDynCtrl();    
    eff.load();
 
  }
  eff.run();
  FastLED.delay(32);
}