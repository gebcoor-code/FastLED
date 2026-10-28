//DNA-spirale, Neon. Better in 32*32
//may be it would be interesting to connect pairs with lines
// coor@, 15.02.26

#define dots 36 //qty of dots to build a 3D figure
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

//DNA-spirale
void initDNASpirale() {
  const float radius = 5.0;        
  const float height = 20.0;        
  const int turns = 1;              
  
  float circumference = 2.0 * PI * radius;
  float spiralLength = sqrt(pow(circumference * turns, 2) + pow(height, 2));
  
  int pointsPerChain = dotsCount / 2;
  
  for (byte chain = 0; chain < 2; chain++) {
    float phaseShift = (chain == 0) ? 0.0 : PI;
    
    for (int i = 0; i < pointsPerChain; i++) {
      float arcLength = (float)i / (pointsPerChain - 1) * spiralLength;
      float t = arcLength / spiralLength;
      float z = height * (t - 0.5); // от -height/2 до height/2
      float angle = (t * turns * 2.0 * PI) + phaseShift;
      
      float x = radius * cos(angle);
      float y = radius * sin(angle);
      
      int index = chain * pointsPerChain + i;
      
      vectors[index][0] = x;
      vectors[index][1] = y;
      vectors[index][2] = z;
    }
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

void drawNeonSparkles_withoutZ() {
  static uint8_t hue_offset = 0;
  hue_offset += 5;
  
  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      float z = vectors[i][2];
      int idx = XY(x,y);
      uint8_t hue = (x*5 + y*5 + hue_offset) % 255;
        CRGB base_color = CHSV(hue, 255, 255);

        if (random8(100) < 20) leds[idx] = CRGB::White;
        else                   leds[idx] = base_color;
        
        if (x > 0) leds[XY(x-1, y)] = blend(leds[XY(x-1, y)], CHSV(hue, 230, 200), 200);
        if (x < WIDTH-1) leds[XY(x+1, y)] = blend(leds[XY(x+1, y)], CHSV(hue, 230, 200), 200);
        if (y > 0) leds[XY(x, y-1)] = blend(leds[XY(x, y-1)], CHSV(hue, 230, 200), 200);
        if (y < HEIGHT-1) leds[XY(x, y+1)] = blend(leds[XY(x, y+1)], CHSV(hue, 230, 200), 200);      
    }
  }
}

void ScaleAndRotate(float maxSc, float minSc, bool rX, bool rY, bool rZ, int8_t deltaAngle, int8_t maxAngle) {

  if (iter == 0) {
    deltaX = random(maxAngle) + deltaAngle;    deltaY = random(maxAngle) + deltaAngle;    deltaZ = random(maxAngle) + deltaAngle; //было исходно random(7)-3; теперь r(5)+2
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

void draw() {

  if (loadingFlag) {
    dotsCount = dots;
    initDNASpirale();
    loadingFlag = false;
    
  }
  
  FastLED.clear();
  //drawNeon(); //simple Neon
  drawNeonSparkles_withoutZ();   //neon with sparkles
  ScaleAndRotate(1.8, 1.1, 1,1,1,-5,7);
  //delay(10);
}
