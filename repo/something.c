//experiments with palette array

static const TProgmemRGBPalette16 HolyLightsColors_p FL_PROGMEM = {0xff0000, 0xff4000, 0xff8000, 0xd6c000, 0xffff00, 0xc0ff00, 0x80ff00, 0x40ff00, 0x00ff00, 0x00c040, 0x008080, 0x0040c0, 0x0000ff, 0x4000c0, 0x800080, 0xc00040};
static const TProgmemRGBPalette16 NeonColors_p FL_PROGMEM = {0x00b1d0, 0x0f93ec, 0x3572ff, 0x4157ff, 0x6162ff, 0x686cff, 0x7473ff, 0x8689e5, 0x9e9dc6, 0x9694ac, 0x979b9b, 0x888b8c, 0x767680, 0x596160, 0x6c736f, 0x7b7359};
static const TProgmemRGBPalette16 WaterfallColors_p FL_PROGMEM = {0x000000, 0x060707, 0x101110, 0x151717, 0x1C1D22, 0x242A28, 0x363B3A, 0x313634, 0x505552, 0x6B6C70, 0x98A4A1, 0xC1C2C1, 0xCACECF, 0xCDDEDD, 0xDEDFE0, 0xB2BAB9};
static const TProgmemRGBPalette16 WoodFireColors_p FL_PROGMEM = {CRGB::Black, 0x330e00, 0x661c00, 0x992900, 0xcc3700, CRGB::OrangeRed, 0xff5800, 0xff6b00, 0xff7f00, 0xff9200, CRGB::Orange, 0xffaf00, 0xffb900, 0xffc300, 0xffcd00, CRGB::Gold};
static const TProgmemRGBPalette16 NormalFire_p FL_PROGMEM = {CRGB::Black, 0x330000, 0x660000, 0x990000, 0xcc0000, CRGB::Red, 0xff0c00, 0xff1800, 0xff2400, 0xff3000, 0xff3c00, 0xff4800, 0xff5400, 0xff6000, 0xff6c00, 0xff7800};
static const TProgmemRGBPalette16 NormalFire2_p FL_PROGMEM = {CRGB::Black, 0x560000, 0x6b0000, 0x820000, 0x9a0011, CRGB::FireBrick, 0xc22520, 0xd12a1c, 0xe12f17, 0xf0350f, 0xff3c00, 0xff6400, 0xff8300, 0xffa000, 0xffba00, 0xffd400};
static const TProgmemRGBPalette16 LithiumFireColors_p FL_PROGMEM = {CRGB::Black, 0x240707, 0x470e0e, 0x6b1414, 0x8e1b1b, CRGB::FireBrick, 0xc14244, 0xd16166, 0xe08187, 0xf0a0a9, CRGB::Pink, 0xff9ec0, 0xff7bb5, 0xff59a9, 0xff369e, CRGB::DeepPink};
static const TProgmemRGBPalette16 SodiumFireColors_p FL_PROGMEM = {CRGB::Black, 0x332100, 0x664200, 0x996300, 0xcc8400, CRGB::Orange, 0xffaf00, 0xffb900, 0xffc300, 0xffcd00, CRGB::Gold, 0xf8cd06, 0xf0c30d, 0xe9b913, 0xe1af1a, CRGB::Goldenrod};
static const TProgmemRGBPalette16 CopperFireColors_p FL_PROGMEM = {CRGB::Black, 0x001a00, 0x003300, 0x004d00, 0x006600, CRGB::Green, 0x239909, 0x45b313, 0x68cc1c, 0x8ae626, CRGB::GreenYellow, 0x94f530, 0x7ceb30, 0x63e131, 0x4bd731, CRGB::LimeGreen};
static const TProgmemRGBPalette16 AlcoholFireColors_p FL_PROGMEM = {CRGB::Black, 0x000033, 0x000066, 0x000099, 0x0000cc, CRGB::Blue, 0x0026ff, 0x004cff, 0x0073ff, 0x0099ff, CRGB::DeepSkyBlue, 0x1bc2fe, 0x36c5fd, 0x51c8fc, 0x6ccbfb, CRGB::LightSkyBlue};
static const TProgmemRGBPalette16 RubidiumFireColors_p FL_PROGMEM = {CRGB::Black, 0x0f001a, 0x1e0034, 0x2d004e, 0x3c0068, CRGB::Indigo, CRGB::Indigo, CRGB::Indigo, CRGB::Indigo, CRGB::Indigo, CRGB::Indigo, 0x3c0084, 0x2d0086, 0x1e0087, 0x0f0089, CRGB::DarkBlue};
static const TProgmemRGBPalette16 PotassiumFireColors_p FL_PROGMEM = {CRGB::Black, 0x0f001a, 0x1e0034, 0x2d004e, 0x3c0068, CRGB::Indigo, 0x591694, 0x682da6, 0x7643b7, 0x855ac9, CRGB::MediumPurple, 0xa95ecd, 0xbe4bbe, 0xd439b0, 0xe926a1, CRGB::DeepPink};


// A mostly red palette with green accents and white trim. "CRGB::Gray" is used as white to keep the brightness more uniform.
const TProgmemRGBPalette16 RedGreenWhite_p FL_PROGMEM ={  CRGB::Red, CRGB::Red, CRGB::Red, CRGB::Red,   CRGB::Red, CRGB::Red, CRGB::Red, CRGB::Red,   CRGB::Red, CRGB::Red, CRGB::Gray, CRGB::Gray,   CRGB::Green, CRGB::Green, CRGB::Green, CRGB::Green };

// A mostly (dark) green palette with red berries.
#define Holly_Green 0x00580c
#define Holly_Red   0xB00402
const TProgmemRGBPalette16 Holly_p FL_PROGMEM ={  Holly_Green, Holly_Green, Holly_Green, Holly_Green,   Holly_Green, Holly_Green, Holly_Green, Holly_Green,   Holly_Green, Holly_Green, Holly_Green, Holly_Green,   Holly_Green, Holly_Green, Holly_Green, Holly_Red};

// A red and white striped palette
// "CRGB::Gray" is used as white to keep the brightness more uniform.
const TProgmemRGBPalette16 RedWhite_p FL_PROGMEM ={  CRGB::Red,  CRGB::Red,  CRGB::Gray, CRGB::Gray,   CRGB::Red,  CRGB::Red,  CRGB::Gray, CRGB::Gray,   CRGB::Red,  CRGB::Red,  CRGB::Gray, CRGB::Gray,   CRGB::Red,  CRGB::Red,  CRGB::Gray, CRGB::Gray };

// A pure "fairy light" palette with some brightness variations
#define HALFFAIRY ((CRGB::FairyLight & 0xFEFEFE) / 2)
#define QUARTERFAIRY ((CRGB::FairyLight & 0xFCFCFC) / 4)
const TProgmemRGBPalette16 FairyLight_p FL_PROGMEM ={  CRGB::FairyLight, CRGB::FairyLight, CRGB::FairyLight, CRGB::FairyLight,   HALFFAIRY,        HALFFAIRY,        CRGB::FairyLight, CRGB::FairyLight,   QUARTERFAIRY,     QUARTERFAIRY,     CRGB::FairyLight, CRGB::FairyLight,   CRGB::FairyLight, CRGB::FairyLight, CRGB::FairyLight, CRGB::FairyLight };

// A palette reminiscent of large 'old-school' C9-size tree lights
// in the five classic colors: red, orange, green, blue, and white.
#define C9_Red    0xFF8058
#define C9_Orange 0xFFA842
#define C9_Green  0xFFED92
#define C9_Blue   0xFFFFFF
#define C9_White  0xFFE5BE
const TProgmemRGBPalette16 RetroC9_p FL_PROGMEM ={  C9_Red,    C9_Orange, C9_Red,    C9_Orange,   C9_Orange, C9_Red,    C9_Orange, C9_Red,   C9_Green,  C9_Green,  C9_Green,  C9_Green,   C9_Blue,   C9_Blue,   C9_Blue,   C9_White};

const TProgmemRGBPalette16 *pal_arr[] = {
  &HeatColors_p,
  &PartyColors_p, //0+
  &RainbowColors_p,  //1+
  &RainbowStripeColors_p, //2+
  &CloudColors_p, //3+
  &ForestColors_p, //4+
  &OceanColors_p, //5+
  &LavaColors_p, //6+
  &HolyLightsColors_p, //7+
  &NeonColors_p, //8+
  &WaterfallColors_p, //9+
  &WoodFireColors_p, //10+
  &NormalFire_p, //11+
  &NormalFire2_p, //12+
  &LithiumFireColors_p, //13+
  &SodiumFireColors_p, //14+
  &CopperFireColors_p, //15+
  &AlcoholFireColors_p, //16+
//  &RubidiumFireColors_p, //17--
  &PotassiumFireColors_p, //18+
  &RedGreenWhite_p, //19
  &RetroC9_p, //20+
  &RedWhite_p, //21+
  &FairyLight_p, //22+
  &Holly_p}; //23+
  
uint8_t countpal = sizeof(pal_arr)/sizeof(TProgmemRGBPalette16 *);

void wu_pixel(uint32_t x, uint32_t y, CRGB * col) { //awesome wu_pixel procedure by reddit u/sutaburosu
  // extract the fractional parts and derive their inverses
  uint8_t xx = x & 0xff, yy = y & 0xff, ix = 255 - xx, iy = 255 - yy;
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
    uint16_t xy = XY((x >> 8) + (i & 1), (y >> 8) + ((i >> 1) & 1));
    leds[xy].r = qadd8(leds[xy].r, col -> r * wu[i] >> 8);
    leds[xy].g = qadd8(leds[xy].g, col -> g * wu[i] >> 8);
    leds[xy].b = qadd8(leds[xy].b, col -> b * wu[i] >> 8);
  }
}


// from: https://github.com/FastLED/FastLED/pull/202
CRGB ColorFromPaletteExtended(const CRGBPalette16& pal, uint16_t index, uint8_t brightness, TBlendType blendType) {
  // Extract the four most significant bits of the index as a palette index.
  uint8_t index_4bit = (index >> 12);
  // Calculate the 8-bit offset from the palette index.
  uint8_t offset = (uint8_t)(index >> 4);
  // Get the palette entry from the 4-bit index
  const CRGB* entry = &(pal[0]) + index_4bit;
  uint8_t red1      = entry->red;
  uint8_t green1    = entry->green;
  uint8_t blue1     = entry->blue;

  uint8_t blend = offset && (blendType != NOBLEND);
  if (blend) {
    if (index_4bit == 15) {
      entry = &(pal[0]);
    } else {
      entry++;
    }

    // Calculate the scaling factor and scaled values for the lower palette value.
    uint8_t f1 = 255 - offset;
    red1       = scale8_LEAVING_R1_DIRTY(red1, f1);
    green1     = scale8_LEAVING_R1_DIRTY(green1, f1);
    blue1      = scale8_LEAVING_R1_DIRTY(blue1, f1);

    // Calculate the scaled values for the neighbouring palette value.
    uint8_t red2   = entry->red;
    uint8_t green2 = entry->green;
    uint8_t blue2  = entry->blue;
    red2           = scale8_LEAVING_R1_DIRTY(red2, offset);
    green2         = scale8_LEAVING_R1_DIRTY(green2, offset);
    blue2          = scale8_LEAVING_R1_DIRTY(blue2, offset);
    cleanup_R1();

    // These sums can't overflow, so no qadd8 needed.
    red1 += red2;
    green1 += green2;
    blue1 += blue2;
  }
  if (brightness != 255) {
     //nscale8x3_video(red1, green1, blue1, brightness);
    nscale8x3(red1, green1, blue1, brightness);
  }

  
  return CRGB(red1, green1, blue1);
}

byte palette = 0;

void draw() {

  FastLED.clear();
  float ms                = millis() / 200.f;
  const float kHalfWidth  = COLS / 2;
  const float kHalfHeight = ROWS / 2;

  const float density = 1.1175f + 0.0275f * sinf(ms * 1.09f);
  for (float y = 0; y <= kHalfHeight + 2; y += density)
    for (float x = 0; x <= kHalfWidth + 2; x += density) {
      float hyp = hypotf(x, y) * -3.f;
      float fx  = sinf(ms + hyp / 8.f) * 84.f;
      float fy  = cosf(ms * .78f + hyp / 8.f) * 224.f;
      CRGB col = ColorFromPaletteExtended(CRGBPalette16(*pal_arr[palette]), (ms * 24.f + hyp * 4.f) * 256.f, 255, LINEARBLEND);      
      wu_pixel(256 * (x + kHalfWidth) + fx, 256 * (y + kHalfHeight) + fy, &col);
      if (x) wu_pixel(256 * (-x + kHalfWidth) + fx, 256 * (y + kHalfHeight) + fy, &col);
      if (y) wu_pixel(256 * (x + kHalfWidth) + fx, 256 * (-y + kHalfHeight) + fy, &col);
      if (x && y) wu_pixel(256 * (-x + kHalfWidth) + fx, 256 * (-y + kHalfHeight) + fy, &col);
    }

  EVERY_N_MILLISECONDS (5000) {
    palette++;
    if (palette>=countpal) palette=0;
  }
}
