// coor@, 11.12.25
//experiments with sphere3D to use int8_t, int16_t array instead of float
//works partly, int8_t - not enough accuracy. int16_t, up to /1000 - not enough - ultimately collapses to dot. somehow works from 2000, but geometry is kinda strange.

#define dots 30 //qty of dots to build a 3D sphere
#define precision 2500.0f
byte dotsCount;

#define WIDTH COLS
#define HEIGHT ROWS

bool loadingFlag = true;

int16_t vectors[dots][3];

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ, iter = 0;
float scale3D = 1.0;
float scaleDirection = 0.01;

#define minScale 0.7
#define maxScale 2.0
#define stepDirection 0.01

int8_t translateX(int16_t x_int, int16_t z_int) {
  float x = x_int / precision;
  float z = z_int / precision;
  
  float scaledX = x * scale3D;
  float scaledZ = z * scale3D;
  return (int8_t)(scaledX + WIDTH/2) + (scaledZ * (scaledX / perspective));
}

int8_t translateY(int16_t y_int, int16_t z_int) {
  float y = y_int / precision;
  float z = z_int / precision;
  
  float scaledY = y * scale3D;
  float scaledZ = z * scale3D;
  return (int8_t)(scaledY + HEIGHT/2) + (scaledZ * (scaledY / perspective));
}

void rotateX(int8_t angle) {
  float rad = angle * PI / 180.0f;
  float cosa = cos(rad);
  float sina = sin(rad);
  
  for (byte i = 0; i < dots; i++) {
    float y = vectors[i][1] / precision;
    float z = vectors[i][2] / precision;
    
    float new_y = y * cosa - z * sina;
    float new_z = y * sina + z * cosa;
    
//    new_y = constrain(new_y, -300.0f, 300.0f);
//    new_z = constrain(new_z, -300.0f, 300.0f);
    
    vectors[i][1] = (int16_t)(new_y * precision);
    vectors[i][2] = (int16_t)(new_z * precision);
  }
}

void rotateY(int8_t angle) {
  float rad = angle * PI / 180.0f;
  float cosa = cos(rad);
  float sina = sin(rad);
  
  for (byte i = 0; i < dots; i++) {
    float x = vectors[i][0] / precision;
    float z = vectors[i][2] / precision;
    
    float new_x = x * cosa - z * sina;
    float new_z = x * sina + z * cosa;
    
//    new_x = constrain(new_x, -300.0f, 300.0f);
//    new_z = constrain(new_z, -300.0f, 300.0f);
    
    vectors[i][0] = (int16_t)(new_x * precision);
    vectors[i][2] = (int16_t)(new_z * precision);
  }
}

void rotateZ(int8_t angle) {
  float rad = angle * PI / 180.0f;
  float cosa = cos(rad);
  float sina = sin(rad);
  
  for (byte i = 0; i < dots; i++) {
    float x = vectors[i][0] / precision;
    float y = vectors[i][1] / precision;
    
    float new_x = x * cosa - y * sina;
    float new_y = x * sina + y * cosa;
    
 //   new_x = constrain(new_x, -300.0f, 300.0f);
 //   new_y = constrain(new_y, -300.0f, 300.0f);
    
    vectors[i][0] = (int16_t)(new_x * precision);
    vectors[i][1] = (int16_t)(new_y * precision);
  }
}

// uniform distribution using the golden ratio
void initUniformSpherePoints() {
  const float goldenAngle = PI * (3.0f - sqrt(5.0f));
  
  for (int i = 0; i < dots; i++) {
    float y = 1.0f - (i / ((float)dots - 1.0f)) * 2.0f;
    float radiusAtY = sqrt(1.0f - y * y);
    float theta = goldenAngle * i;
    
    float fx = 10.0f * cos(theta) * radiusAtY;
    float fy = 10.0f * y;
    float fz = 10.0f * sin(theta) * radiusAtY;
    
    vectors[i][0] = (int16_t)(fx * precision);
    vectors[i][1] = (int16_t)(fy * precision);
    vectors[i][2] = (int16_t)(fz * precision);
  }
}

//just white dots
void drawPointsOnly() {
  for (int i = 0; i < dots; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      leds[XY(x, y)] = CRGB(0xFF, 0xFF, 0xFF);
    }
  }
}

// Gradient dots. from white+z to gray-z
void drawOptimalPoints() {
  for (int i = 0; i < dots; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      // Z: -5..5; brightness: 100..255
      
      float normalizedZ = (vectors[i][2] + 5.0) / 10.0; // 0..1
      int brightness = 100 + (int)(155 * normalizedZ); // 100..255
      // int brightness = 100 + (int)(155 * normalizedZ * normalizedZ);
      
      brightness = constrain(brightness, 100, 255);
      leds[XY(x, y)] = CRGB(brightness, brightness, brightness);
    }
  }
}


void ScaleAndRotate(float maxSc, float minSc) {

  if (iter == 0) {
    deltaX = random(7) - 3;    deltaY = random(7) - 3;    deltaZ = random(7) - 3;
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
  rotateX(deltaX);  rotateY(deltaY);  rotateZ(deltaZ);
  iter--;
}

void draw() {

  if (loadingFlag) {
    dotsCount = dots;
    initUniformSpherePoints(); //golden ratio
    loadingFlag = false;
  }
  FastLED.clear();
  drawOptimalPoints();       //white-gray gradient
  ScaleAndRotate(maxScale, minScale);
//  delay(10);
}
