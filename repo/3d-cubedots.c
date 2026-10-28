//cube3D from dots 
// coor@, 14.12.25

#define dots 26 //qty of dots to build a 3D cube 3*3*3 without central point
byte dotsCount; //rotate funcs can be used to work with something other

#define WIDTH COLS
#define HEIGHT ROWS

bool loadingFlag = true;

float vectors[dots][3];

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ, iter = 0;
float scale3D = 1.0;
float scaleDirection = 0.01;

#define minScale 0.5
#define maxScale 2.2
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

void initCube26() {
  int pointIndex = 0;
  
  int8_t coords[] = {-4, 0, 4};
  
  for (int8_t x = 0; x < 3; x++) {
    for (int8_t y = 0; y < 3; y++) {
      for (int8_t z = 0; z < 3; z++) {
        if (!(x == 1 && y == 1 && z == 1)) {
          vectors[pointIndex][0] = coords[x];
          vectors[pointIndex][1] = coords[y];
          vectors[pointIndex][2] = coords[z];
          pointIndex++;
        }
      }
    }
  }
}

//just white dots
void drawPointsOnly() {
  for (byte i = 0; i < dotsCount; i++) {
    int8_t x = translateX(vectors[i][0], vectors[i][2]);
    int8_t y = translateY(vectors[i][1], vectors[i][2]);
    
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      leds[XY(x, y)] = CRGB(0xFF, 0xFF, 0xFF);
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
      
      int8_t redTint = (int8_t)(vectors[i][0] * 6);   // X affects on red
      int8_t greenTint = (int8_t)(vectors[i][1] * 6); // Y affects on green
      
      red = constrain(red + redTint, 0, 255);
      green = constrain(green + greenTint, 0, 255);
      blue = constrain(blue - redTint/3 - greenTint/3, 0, 255);
      
      if (vectors[i][2] > 2) { // very close dots
        red = constrain(red + 30, 0, 255);
        green = constrain(green + 30, 0, 255);
        blue = constrain(blue + 30, 0, 255);
      }
      
      leds[XY(x, y)] += CRGB(red, green, blue);
    }
  }
}

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
        (z > 0)  ? CRGB(255, 255, 255) : //Close: White
        (z > -1) ? CRGB(128,0,0) :       //Red1                         
        (z > -4) ? CRGB(96,0,0) :        //Red2
                   CRGB(80,0,0);         //Red3

      if (new_color > leds[idx]) leds[idx] = new_color;      
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
    dotsCount = 26;
    initCube26();
    loadingFlag = false;
  }
  
  FastLED.clear();
  //fadeToBlackBy (leds,NUM_LEDS, 150);
  
// drawPointsOnly();           //white dots
  //  drawTintedPoints();          // colored gradient
    drawWhiteToRedGradient();   //red-white grad
    ScaleAndRotate(1.8, 0.5,1,1,1,-3,7);
  
  delay(20);
}
