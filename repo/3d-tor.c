//Tor-3D dots-based, 2 sides, twist=1. Mobius realisation
//coor@, 20.04.26

#define WIDTH COLS
#define HEIGHT ROWS

bool loadingFlag = true;

#define dots 72
float vectors[dots][3];

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ, iter = 0;
float scale3D = 1.0;
float scaleDirection = 0.01;
byte dotsCount; //used to limit dots array in every func

#define stepDirection 0.01

#define HEXTOR_SEG    36      //
#define HEXTOR_SIDES  2       //
#define HEXTOR_DOTS   72      // = SEG * SIDES

#define HEXTOR_R      3.5f    // R-tor
#define HEXTOR_r      1.5f    // r-tor
#define HEXTOR_TWIST  1.0f    

void Line_color(int8_t x, int8_t y, int8_t x1, int8_t y1, const CRGB &color) {
  if ((x < 0 && x1 < 0) || (x >= WIDTH && x1 >= WIDTH) || 
      (y < 0 && y1 < 0) || (y >= HEIGHT && y1 >= HEIGHT)) {
    return;
  }
  
  // get current brigthness as sum
  int currentBrightness = color.r + color.g + color.b;
  
  int8_t dx = abs(x1 - x);
  int8_t dy = abs(y1 - y);
  int8_t sx = (x < x1) ? 1 : -1;
  int8_t sy = (y < y1) ? 1 : -1;
  int8_t err = dx - dy;
  
  while (true) {
    if (x >= 0 && x <= WIDTH-1 && y >= 0 && y <= HEIGHT-1) {
      //check up existing color
      CRGB existingColor = leds[XY(x, y)];
      int existingBrightness = existingColor.r + existingColor.g + existingColor.b;
      
      // draw only if empty or it is brighter
      if (existingBrightness == 0 || currentBrightness > existingBrightness) {
        leds[XY(x, y)] = color;
      }
    }
    
    if (x == x1 && y == y1) break;
    
    int8_t e2 = 2 * err;
    if (-dy < e2) {
      err -= dy;
      x += sx;
    }
    if (dx > e2) {
      err += dx;
      y += sy;
    }
  }
}

int8_t translateX(float x,  float z) {

#if (FixScaleX == 1)  //North needs ScaleX correction
  float scaledX = x * scale3D * 1.2;
#else
  float scaledX = x * scale3D;
#endif

  float scaledZ = z * scale3D;
  return (int8_t)((scaledX + WIDTH/2) + (scaledZ * (scaledX / perspective)));
}

int8_t translateY(float y, float z) {
  float scaledY = y * scale3D;
  float scaledZ = z * scale3D;
  return (int8_t)((scaledY + HEIGHT/2) + (scaledZ * (scaledY / perspective)));
}

void rotateX(int8_t angle) {
  float rad = angle * PI / 180;
  float cosa = cos(rad);
  float sina = sin(rad);
  for (byte i = 0; i < dotsCount; i++) {
    float y = vectors[i][1];
    float z = vectors[i][2];
    vectors[i][1] = y * cosa - z * sina;
    vectors[i][2] = y * sina + z * cosa;
  }
}

void rotateY(int8_t angle) {
  float rad = angle * PI / 180;
  float cosa = cos(rad);
  float sina = sin(rad);
  for (byte i = 0; i < dotsCount; i++) {
    float x = vectors[i][0];
    float z = vectors[i][2];
    vectors[i][0] = x * cosa - z * sina;
    vectors[i][2] = x * sina + z * cosa;
  }
}

void rotateZ(int8_t angle) {
  float rad = angle * PI / 180;
  float cosa = cos(rad);
  float sina = sin(rad);
  for (byte i = 0; i < dotsCount; i++) {
    float x = vectors[i][0];
    float y = vectors[i][1];
    vectors[i][0] = x * cosa - y * sina;
    vectors[i][1] = x * sina + y * cosa;
  }
}

void ScaleAndRotate(float maxSc, float minSc, bool rX, bool rY, bool rZ, int8_t deltaAngle, int8_t maxAngle) {

  if (iter == 0) {
    deltaX = random(maxAngle) + deltaAngle;    deltaY = random(maxAngle) + deltaAngle;    deltaZ = random(maxAngle) + deltaAngle; //было исходно random(7)-3; теперь r(5)+2
//    if (deltaX==0) deltaX=1; if (deltaY==0) deltaY=1; if (deltaZ==0) deltaZ=1;
    if (abs(deltaX)<2) deltaX=2; if (abs(deltaY)<2) deltaY=2; if (abs(deltaZ)<2) deltaZ=2;
    iter = random(250) + 5;
  }
  scale3D += scaleDirection;
  if (scale3D >= maxSc) {
    scale3D = maxSc;
    scaleDirection = -stepDirection;
  } else if (scale3D <= minSc) {
    scale3D = minSc;
    scaleDirection = stepDirection;
  }
  if (rX) rotateX(deltaX);  if (rY) rotateY(deltaY);  if (rZ) rotateZ(deltaZ);
  iter--;
}

void initHextorPoints() {
  const float pi2 = 2.0f * PI;
  byte idx = 0;
  for (byte i = 0; i < HEXTOR_SEG; i++) {
    float a  = (float)i / HEXTOR_SEG * pi2;          // угол вдоль тора
    float tw = a * HEXTOR_TWIST;                      // скручивание
    for (byte j = 0; j < HEXTOR_SIDES; j++) {
      float b  = (float)j / HEXTOR_SIDES * pi2 + tw; // угол в сечении
      float cr = HEXTOR_r * cos(b);
      float sr = HEXTOR_r * sin(b);
      vectors[idx][0] = (HEXTOR_R + cr) * cos(a);    // x
      vectors[idx][1] = sr;                            // y
      vectors[idx][2] = (HEXTOR_R + cr) * sin(a);    // z
      idx++;
    }
  }
}

CRGB hexGradColor1;
CRGB hexGradColor2;

void drawHextorGradient() {
  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);

    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      float z   = vectors[i][2];                       
      float t   = (z + 8.0f) / 10.0f;                 //5.0f -grad middle
      t         = constrain(t, 0.0f, 1.0f);

      // lerp between color2 (t=0, z=-5) and color1 (t=1, z=+5)
      CRGB col = blend(hexGradColor2, hexGradColor1, (uint8_t)(t * 255));

      int idx = XY(x, y);
      if (col > leds[idx]) leds[idx] = col;
    }
  }
}

static uint16_t hexNeonSpeed = 0;

void drawHextorNeon() {
  hexNeonSpeed += 3;

  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);

    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      float z   = vectors[i][2];
      int   idx = XY(x, y);

      byte  seg  = i / HEXTOR_SIDES;
      uint8_t h  = (uint8_t)((uint16_t)(seg * 255 / HEXTOR_SEG) + hexNeonSpeed) ;

      uint8_t pulse = (uint8_t)(128 + 127 * sin((hexNeonSpeed * 0.04f) + i * 0.4f));

      if (z > -2.0f) {
        uint8_t val = map(pulse, 0, 255, 180, 255);
        CRGB base  = CHSV(h, 255, val);

        byte j = i % HEXTOR_SIDES;
        bool outer = (j == 0);
        if (outer && random8(100) < 18) {
          leds[idx] = CRGB::White;
        } else {
          if (base > leds[idx]) leds[idx] = base;
        }

        uint8_t haloVal = (val * 3) >> 3; 
        CRGB halo = CHSV(h, 200, haloVal);
        if (x > 0)       leds[XY(x-1, y)] = blend(leds[XY(x-1, y)], halo, 180);
        if (x < WIDTH-1) leds[XY(x+1, y)] = blend(leds[XY(x+1, y)], halo, 180);
        if (y > 0)       leds[XY(x, y-1)] = blend(leds[XY(x, y-1)], halo, 180);
        if (y < HEIGHT-1)leds[XY(x, y+1)] = blend(leds[XY(x, y+1)], halo, 180);

      } else {
        uint8_t dimVal = map(pulse, 0, 255, 30, 90);
        CRGB dim = CHSV((uint8_t)(h + 128), 220, dimVal);
        leds[idx] = blend(leds[idx], dim, 160);
      }
    }
  }
}

void drawNeonSparkles() {
  static uint8_t hue_offset = 0;
  hue_offset += 5;
  
  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      float z = vectors[i][2];
      int idx = XY(x,y);
      uint8_t hue = (x*5 + y*5 + hue_offset) % 255;
      if (z > -10) {
        CRGB base_color = CHSV(hue, 255, 255);

        if (random8(100) < 20) leds[idx] = CRGB::White;
        else                   leds[idx] = base_color;
        
        if (x > 0) leds[XY(x-1, y)] = blend(leds[XY(x-1, y)], CHSV(hue, 230, 200), 200);
        if (x < WIDTH-1) leds[XY(x+1, y)] = blend(leds[XY(x+1, y)], CHSV(hue, 230, 200), 200);
        if (y > 0) leds[XY(x, y-1)] = blend(leds[XY(x, y-1)], CHSV(hue, 230, 200), 200);
        if (y < HEIGHT-1) leds[XY(x, y+1)] = blend(leds[XY(x, y+1)], CHSV(hue, 230, 200), 200);      
      } else leds[idx] = blend(leds[idx], CHSV(hue, 200, 100), 200);
    }
  }
}


//White to red gradient
void drawWhiteToRedGradient() {
  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      float z = vectors[i][2];
      int idx = XY(x,y);

//4 levels
      CRGB new_color = 
        (z > 0)     ? CRGB(255, 255, 255) :    //Close: White
        (z > -1)    ? CRGB(128,0,0) :          //Red1                         
        (z > -2)    ? CRGB(96,0,0) :           //Red2
        (z > -3)    ? CRGB(80,0,0):            //Red3
                      CRGB(60,0,0);            //Red4

      if (new_color > leds[idx]) leds[idx] = new_color;      

    }
  }
}

void draw() {

bool type = false;

  if (loadingFlag) {
    loadingFlag  = false;
    dotsCount    = HEXTOR_DOTS;    // 72
    hexNeonSpeed = 0;
    initHextorPoints();
  }

  hexGradColor1 = CRGB(255, 255, 255);
  hexGradColor2 = CRGB(200, 20, 100);

  FastLED.clear();

  if (!type) drawHextorGradient(); //drawWhiteToRedGradient();
  else       drawNeonSparkles();//drawHextorNeon();

  ScaleAndRotate(2.5f, 1.5f, true, true, true, -4, 6);
}
