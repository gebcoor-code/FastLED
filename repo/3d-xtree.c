//spirale - Christmas tree 3D
//At first it was just a spirale 3d, but then I decided to make a Christmas tree.
// coor@, 17.12.25

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

#define minScale 1.0
#define maxScale 3.0
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

//3d-Spirale
void initSpirale() {
  const float spiralSpeed = 5.0;
  const float height = 10.0;
  const float startRadius = 0.1;
  const float endRadius = 4.0;
  const float radiusGrowthPower = 1.0;
  
  for (byte i = 0; i < dotsCount; i++) {
    float t = i / ((float)dotsCount - 1.0);
    
    float theta = spiralSpeed * 2.0 * PI * t;
    
    float r = startRadius + (endRadius - startRadius) * pow(t, radiusGrowthPower);
    
    float h = height * (t - 0.5);
    
    vectors[i][0] = r * cos(theta);
    vectors[i][1] = h;
    vectors[i][2] = r * sin(theta);
  }
}

//Green gradient - christmas tree
void GreenGradient() {
  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);

    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {

      float z = vectors[i][2];
      int idx = XY(x, y);
      
      CRGB pixel_color =
        (z > 2)  ? CRGB(0, 230, 0) :
        (z > 0)  ? CRGB(0, 200, 0) :
        (z > -1) ? CRGB(0, 180, 0) : 
        (z > -2) ? CRGB(0, 150, 0) :         
        (z > -3) ? CRGB(0, 110, 0) :         
                   CRGB(0, 80, 0);      

    // Random white sparkles
    if (random(3) == 2 && z>=0)   pixel_color = CRGB(255, 255, 255); 
   
    // red top
    if (i >= 0 && i <= 8) pixel_color = CRGB(255, 0, 0); 
    
    if (leds[idx] < pixel_color) leds[idx] = pixel_color;
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

void draw() {

  if (loadingFlag) {
    dotsCount = dots;
    initSpirale(); //spirale
    loadingFlag = false;
    
  }
  
  FastLED.clear();
  //fadeToBlackBy (leds,NUM_LEDS, 150);
  
  GreenGradient();   //Green gradient - Christmas Tree
  ScaleAndRotate(3.0, 1.0, 1,1,1,-5,7);
  
  //delay(10);
}
