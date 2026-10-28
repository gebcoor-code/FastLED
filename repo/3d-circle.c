//Circles3D, 3- XY, XZ, YZ
//coor@, 11.12.25

#define dots 24

byte dotsCount=dots;

#define WIDTH COLS
#define HEIGHT ROWS

bool firstStart = true;

// two circles in XY and XZ
float vectors[36][3] = {
  // XY
  {5.0, 0.0, 0.0},      // 0
  {4.33, 2.5, 0.0},     // 1
  {2.5, 4.33, 0.0},     // 2
  {0.0, 5.0, 0.0},      // 3
  {-2.5, 4.33, 0.0},    // 4
  {-4.33, 2.5, 0.0},    // 5
  {-5.0, 0.0, 0.0},     // 6
  {-4.33, -2.5, 0.0},   // 7
  {-2.5, -4.33, 0.0},   // 8
  {0.0, -5.0, 0.0},     // 9
  {2.5, -4.33, 0.0},    // 10
  {4.33, -2.5, 0.0},    // 11
  
  // XZ
  {5.0, 0.0, 0.0},      // 12
  {4.33, 0.0, 2.5},     // 13
  {2.5, 0.0, 4.33},     // 14
  {0.0, 0.0, 5.0},      // 15
  {-2.5, 0.0, 4.33},    // 16
  {-4.33, 0.0, 2.5},    // 17
  {-5.0, 0.0, 0.0},     // 18
  {-4.33, 0.0, -2.5},   // 19
  {-2.5, 0.0, -4.33},   // 20
  {0.0, 0.0, -5.0},     // 21
  {2.5, 0.0, -4.33},    // 22
  {4.33, 0.0, -2.5},    // 23
  
  // YZ
  {0.0, 5.0, 0.0},      // 24
  {0.0, 4.33, 2.5},     // 25
  {0.0, 2.5, 4.33},     // 26
  {0.0, 0.0, 5.0},      // 27
  {0.0, -2.5, 4.33},    // 28
  {0.0, -4.33, 2.5},    // 29
  {0.0, -5.0, 0.0},     // 30
  {0.0, -4.33, -2.5},   // 31
  {0.0, -2.5, -4.33},   // 32
  {0.0, 0.0, -5.0},     // 33
  {0.0, 2.5, -4.33},    // 34
  {0.0, 4.33, -2.5}     // 35
};

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ, iter = 0;
float scale3D = 1.0;
float scaleDirection = 0.01;

#define minScale 0.8
#define maxScale 2.7
#define stepDirection 0.01

void Line(int8_t x, int8_t y, int8_t x1, int8_t y1) {
  if ((x < 0 && x1 < 0) || (x >= WIDTH && x1 >= WIDTH) || 
      (y < 0 && y1 < 0) || (y >= HEIGHT && y1 >= HEIGHT)) {
    return;
  }
  
  int8_t dx = abs(x1 - x);
  int8_t dy = abs(y1 - y);
  int8_t sx = (x < x1) ? 1 : -1;
  int8_t sy = (y < y1) ? 1 : -1;
  int8_t err = dx - dy;
  
  while (true) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      leds[XY((uint8_t)x, (uint8_t)y)] = CRGB(0xFF, 0xFF, 0xFF);
    }
    
    if (x == x1 && y == y1) break;
    
    int8_t e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

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
  for (byte i = 0; i < dots; i++) {
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
  for (byte i = 0; i < dots; i++) {
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
  for (byte i = 0; i < dots; i++) {
    float x = vectors[i][0];
    float y = vectors[i][1];
    vectors[i][0] = x * cosa - y * sina;
    vectors[i][1] = x * sina + y * cosa;
  }
}

//Circle
void drawCircle() {
  for (int i = 0; i < dots; i++) {
    int next = (i + 1) % dots;
    
    int8_t x1 = translateX(vectors[i][0], vectors[i][2]);
    int8_t y1 = translateY(vectors[i][1], vectors[i][2]);
    int8_t x2 = translateX(vectors[next][0], vectors[next][2]);
    int8_t y2 = translateY(vectors[next][1], vectors[next][2]);
    
    Line(x1, y1, x2, y2);
  }
}

//Points only
void drawPointsOnly() {
  for (int i = 0; i < dots; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    leds[XY(x, y)] = CRGB(0xFF, 0xFF, 0xFF);
  }
}

//White to red 3step gradient
//White to red 3step gradient
void drawWhiteToRedGradient() {
  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      float z = vectors[i][2];
      int idx = XY(x,y);
//4 levels
      CRGB new_color = 
        (z > 0)  ? CRGB(255, 255, 255) :    //Close: White
        (z > -2)    ? CRGB(128,0,0) :       //Red1                         
        (z > -4) ? CRGB(96,0,0) :         //Red2
                     CRGB(80,0,0);          //Red3

      if (new_color > leds[idx]) leds[idx] = new_color;      
    }
  }
}

// gradient with light color
void drawTintedPoints() {
  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      byte brightness = 120 + (int8_t)(vectors[i][2] * 25);  
//      brightness = constrain(brightness, 100, 255);     
      
      byte red = brightness;
      byte green = brightness;
      byte blue = brightness;
      
      int8_t redTint = (int8_t)(vectors[i][0] * 10);   // X affects on red
      int8_t greenTint = (int8_t)(vectors[i][1] * 10); // Y affects on green
      
      red = constrain(red + redTint, 0, 255);
      green = constrain(green + greenTint, 0, 255);
      blue = constrain(blue - redTint/3 - greenTint/3, 0, 255);
      
      if (vectors[i][2] > 1) { // very close dots
        red = constrain(red + 70, 0, 255);
        green = constrain(green + 70, 0, 255);
        blue = constrain(blue + 70, 0, 255);
      }
      
      leds[XY(x, y)] += CRGB(red, green, blue);
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
  
  if (firstStart) {
//...
    firstStart=false;
  }
  FastLED.clear();
 // fadeToBlackBy (leds,NUM_LEDS, 100);

  drawCircle();              
//   drawPointsOnly();
// drawWhiteToRedGradient();       
 //drawTintedPoints();
  
  ScaleAndRotate(2.7,0.9,1,1,1,-5,7);
  
  //delay(10);
}
