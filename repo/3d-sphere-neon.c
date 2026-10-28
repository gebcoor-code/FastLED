//sphere3D, Neon fork
// coor@, 12.01.26

#define dots 72 //qty of dots to build a 3D figure
byte dotsCount; 

#define WIDTH COLS
#define HEIGHT ROWS

bool loadingFlag = true;

float vectors[dots][3];

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ;
byte iter = 0;

float scale3D = 1.0;
float scaleDirection = 0.01;

#define minScale 0.9
#define maxScale 2.7
#define stepDirection 0.01

int8_t translateX(float x, float z) {
  float scaledX = x * scale3D;
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

//almost the same, moves a bit upper and lower dots
void initUniformSpherePoints2() {
  const float goldenAngle = PI * (3.0 - sqrt(5.0));
  const float offset = 2.0 / dotsCount;
  
  for (byte i = 0; i < dotsCount; i++) {
    float y = (i * offset) - 1.0 + (offset * 0.5);  // y от -1 до 1
    float radiusAtY = sqrt(1.0 - y * y);
    float theta = goldenAngle * i;
    
    vectors[i][0] = 5.0 * cos(theta) * radiusAtY;
    vectors[i][1] = 5.0 * y;
    vectors[i][2] = 5.0 * sin(theta) * radiusAtY;
  }
}

//spirale
void initSphereSpirale() {
  const float radius = 5.0;
  const int turns = 6;
  
  for (byte i = 0; i < dotsCount; i++) {
    float t = i / ((float)dotsCount - 1.0);
    float z = 1.0 - 2.0 * t;
    float r = sqrt(1.0 - z * z);  //x? + y? + z? = 1
    float phi = turns * 2.0 * PI * t;
    
    //to dec coords
    vectors[i][0] = radius * r * cos(phi);
    vectors[i][1] = radius * z;
    vectors[i][2] = radius * r * sin(phi);
  }
}

//uniform dots (kind of Fibonacci)
void initSphereSpiraleUniform(const byte turns) {
  const float radius = 5.0;
  const float offset = 2.0 / dotsCount;
  const float increment = turns * 2.0 * PI * offset;
  
  for (byte i = 0; i < dotsCount; i++) {
    float y = 1.0 - (i * offset);
    
    if (i == 0) y = 0.999;
    else if (i == dotsCount-1) y = -0.999;
    float r = sqrt(1.0 - y*y);
    float phi = i * increment;
    
    vectors[i][0] = radius * r * cos(phi);
    vectors[i][1] = radius * y;
    vectors[i][2] = radius * r * sin(phi);
  }
}

void drawNeon() {
  static uint8_t hue_offset = 0;
  hue_offset += 3;
  
  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      float z = vectors[i][2];
      int idx = XY(x,y);
      
      uint8_t hue = (x * 15 + y * 10 + hue_offset) % 255;
      
      if (z > -1) leds[idx] = CHSV(hue, 255, 255);
      else        leds[idx] = blend(leds[idx], CHSV(hue, 200, 140), 200);
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
      if (z > -1) {
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

byte aaa=5;

void draw() {

  if (loadingFlag) {
    dotsCount = dots;
    initSphereSpiraleUniform(7); //uniform Fibonacci
    loadingFlag = false;
    
  }
  
  FastLED.clear();
  //drawNeon(); //simple Neon
  drawNeonSparkles();   //neon with sparkles
  ScaleAndRotate(2.7, 1.1, 1,1,1,-5,7);

  EVERY_N_MILLISECONDS(10000) {

    byte aa = random(4);
    if (aa!=aaa) {
      switch (aa) {
        case 0:
          initSphereSpiraleUniform(6);
          break;
        case 1: 
          initUniformSpherePoints2();
          break;
        case 2:
          initSphereSpiraleUniform(7);
          break;
        case 3:
          initSphereSpirale();
          break;
      }
      aaa=aa;
    }

  }

  //delay(10);
}
