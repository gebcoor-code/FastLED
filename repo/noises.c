//noise algo with palettes switching, based on array of pointers placed in FL_PROGMEM (doesn't eat RAM).
//two variants - fillNoiseLED è fillNoiseLED_Gyver
//Nov 2024

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

byte palette=0;

const TProgmemRGBPalette16 *pal_arr[] = {
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
  &RubidiumFireColors_p, //17--
  &PotassiumFireColors_p, //18+
  &RedGreenWhite_p, //19
  &RetroC9_p, //20+
  &RedWhite_p, //21+
  &FairyLight_p, //22+
  &Holly_p}; //23+
  
uint8_t countpal = sizeof(pal_arr)/sizeof(TProgmemRGBPalette16 *);

#define WIDTH (COLS)
#define HEIGHT (ROWS)
#define NUM_LEDS (N_LEDS)
bool loadingFlag = true;
//uint8_t Speed = 15;
//uint8_t Scale = 6;   

static uint16_t x;
static uint16_t y;
static uint16_t z;
uint16_t speed = 20;                                  
uint16_t scale = 30;

#define MAX_DIMENSION (max(WIDTH, HEIGHT))
#if (WIDTH > HEIGHT)
  uint8_t noise[WIDTH][WIDTH];
#else 
  uint8_t noise[HEIGHT][HEIGHT];
#endif

//CRGBPalette16 currentPalette(CloudColors_p);
uint8_t colorLoop = 1;
uint8_t ihue = 0;

void drawPixelXY(int8_t x, int8_t y, CRGB color) {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    uint32_t thisPixel = XY(static_cast<uint8_t>(x), static_cast<uint8_t>(y));
    leds[thisPixel] = color;
}

void fillNoiseLED()
{
  uint8_t dataSmoothing = 0;
  if (speed < 50)
  {
    dataSmoothing = 300 - (speed * 4); //300
  }
  for (uint8_t i = 0; i < MAX_DIMENSION; i++)
  {
    float ii = i * 1.01F;
    scale = random8(1.1f,2.5f) * ii;
    int32_t ioffset = scale * i;
    ioffset = ioffset * 1.;  
    ioffset -= 1;
    for (uint8_t j = 0; j < MAX_DIMENSION; j++)
    {
      int32_t joffset = scale * j;
      joffset = joffset + (j)  ;
      uint8_t data = inoise8(x + ioffset , y + joffset, z);
      joffset += 1;
      data = qsub8(data, j+i);
      data = qadd8(data, scale8(data, j));
      data = qmul8(data,1.3);

      if (dataSmoothing)
      {
        uint8_t olddata = noise[i][j];
        uint8_t newdata = scale8( olddata, dataSmoothing) + scale8( data, 255 - dataSmoothing);
        data = newdata;
      }
      noise[i][j] = data;
    }
  }
  z += speed / 2;  
  x += speed / 4;
  y -= speed / 4;

  for (uint8_t i = 0; i < WIDTH; i++)
  {
    for (uint8_t j = 0; j < HEIGHT; j++)
    {
      uint8_t index = noise[j][i];
      uint8_t bri =   noise[i][j];
      if ( colorLoop)
      {
        index += ihue;
      }

      if ( bri > 127 )
      {
        bri = 255;
      }
      else
      {
        bri = dim8_raw( bri * 2);
      }
      CRGB color = ColorFromPalette(*pal_arr[palette], index, bri);      
      drawPixelXY(i, j, color);
    }
  }
  ihue += 1;
}

void fillNoiseLED_Gyver() {
  uint8_t dataSmoothing = 0;
  if ( speed < 50) {
    dataSmoothing = 200 - (speed * 4);
  }
  for (int i = 0; i < MAX_DIMENSION; i++) {
    int ioffset = scale * i;
    for (int j = 0; j < MAX_DIMENSION; j++) {
      int joffset = scale * j;

      uint8_t data = inoise8(x + ioffset, y + joffset, z);

      data = qsub8(data, 16);
      data = qadd8(data, scale8(data, 39));

      if ( dataSmoothing ) {
        uint8_t olddata = noise[i][j];
        uint8_t newdata = scale8( olddata, dataSmoothing) + scale8( data, 256 - dataSmoothing);
        data = newdata;
      }

      noise[i][j] = data;
    }
  }
  z += speed;

  // apply slow drift to X and Y, just for visual variation.
  x += speed / 8;
  y -= speed / 16;

  for (int i = 0; i < WIDTH; i++) {
    for (int j = 0; j < HEIGHT; j++) {
      uint8_t index = noise[j][i];
      uint8_t bri =   noise[i][j];
      // if this palette is a 'loop', add a slowly-changing base value
      if ( colorLoop) {
        index += ihue;
      }
      // brighten up, as the color palette itself often contains the
      // light/dark dynamic range desired
      if ( bri > 127 ) {
        bri = 255;
      } else {
        bri = dim8_raw( bri * 2);
      }
      CRGB color = ColorFromPalette(*pal_arr[palette], index, bri);      
      drawPixelXY(i, j, color);   //leds[getPixelNumber(i, j)] = color;
    }
  }
  ihue += 1;
}

void fillnoise8()
{
  for (uint8_t i = 0; i < MAX_DIMENSION; i++)
  {
    int32_t ioffset = scale * i;
    for (uint8_t j = 0; j < MAX_DIMENSION; j++)
    {
      int32_t joffset = scale * j;
      noise[i][j] = inoise8(x + ioffset, y + joffset, z);
    }
  }
  z += speed;
}

void draw() { 
  if (loadingFlag) {
    loadingFlag=false;
    scale=30; //from 40 to 100 step 10
    speed=10; ////from 1 to 15 step 2
    palette=random(countpal);
  }
  fillNoiseLED();
  //fillNoiseLED_Gyver();

  EVERY_N_MILLISECONDS (5000) {
    palette++;
//    scale=30; //from 20 to 100 step 10
//    speed=15; ////from 1 to 15 step 2    
    if (palette>=countpal)
      palette=0;
  }
}