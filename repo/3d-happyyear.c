//spherical predefined 'HAPPY YEAR!'
// coor@, 21.12.25

#define dots 72 //qty of dots
byte dotsCount;

#define WIDTH COLS
#define HEIGHT ROWS
#define rotAngle 15

bool loadingFlag = true;

float vectors[][3] = {
    // H (x: 0, 4) 0°, 28.57°
    {5.00, 1.00, 0.00}, {5.00, -2.00, 0.00}, {4.39, 1.00, -2.39}, {4.39, -2.00, -2.39}, {5.00, -0.50, 0.00}, {4.39, -0.50, -2.39},
    
    // A (x: 5, 9) 35.71°, 64.29°
    {4.06, 1.00, -2.91}, {2.91, 1.00, -4.06}, {4.06, 1.00, -2.91}, {4.06, -2.00, -2.91}, {2.91, 1.00, -4.06}, {2.91, -2.00, -4.06},
    {4.06, -0.50, -2.91}, {2.91, -0.50, -4.06},
    
    // P (x: 10, 14) 71.43°, 100.00°
    {1.59, 1.00, -4.75}, {0.00, 1.00, -5.00}, {1.59, 1.00, -4.75}, {1.59, -2.00, -4.75}, {0.00, 1.00, -5.00}, {0.00, -0.50, -5.00},
    {1.59, -0.50, -4.75}, {0.00, -0.50, -5.00},
    
    // P (x: 15, 19) 107.14°, 135.71°
    {-1.44, 1.00, -4.79}, {-2.91, 1.00, -4.06}, {-1.44, 1.00, -4.79}, {-1.44, -2.00, -4.79}, {-2.91, 1.00, -4.06}, {-2.91, -0.50, -4.06},
    {-1.44, -0.50, -4.79}, {-2.91, -0.50, -4.06},
    
    // Y (x: 20, 24) 142.86°, 171.43°
    {-3.68, 1.00, -3.53}, {-4.39, -0.50, -2.39}, {-4.75, 1.00, -1.59}, {-4.39, -0.50, -2.39}, {-4.39, -0.50, -2.39}, {-4.39, -2.00, -2.39},
    
    // Y (x: 28, 32) 200.00°, 228.57°
    {-4.70, 1.00, 1.71}, {-4.95, -0.50, 0.86}, {-5.00, 1.00, 0.00}, {-4.95, -0.50, 0.86}, {-4.95, -0.50, 0.86}, {-4.95, -2.00, 0.86},
    
    // E (x: 33, 37) 235.71°, 264.29°
    {-4.06, 1.00, 2.91}, {-4.06, -2.00, 2.91}, {-4.06, 1.00, 2.91}, {-2.91, 1.00, 4.06}, {-4.06, -0.50, 2.91}, {-2.91, -0.50, 4.06},
    {-4.06, -2.00, 2.91}, {-2.91, -2.00, 4.06},
    
    // A (x: 38, 42) 271.43°, 300.00°
    {-2.29, 1.00, 4.54}, {-1.00, 1.00, 4.90}, {-2.29, 1.00, 4.54}, {-2.29, -2.00, 4.54}, {-1.00, 1.00, 4.90}, {-1.00, -2.00, 4.90},
    {-2.29, -0.50, 4.54}, {-1.00, -0.50, 4.90},
    
    // R (x: 43, 47) 307.14°, 335.71°
    {0.00, 1.00, 5.00}, {1.59, 1.00, 4.75}, {0.00, 1.00, 5.00}, {0.00, -2.00, 5.00}, {1.59, 1.00, 4.75}, {1.59, -0.50, 4.75},
    {0.00, -0.50, 5.00}, {1.59, -0.50, 4.75}, {0.80, -0.50, 4.94}, {1.59, -2.00, 4.75},
    
    // ! (x: 48) 342.86°
    {3.37, 1.00, 3.75}, {3.37, -0.50, 3.75}, {3.37, -2.00, 3.75}, {3.37, -2.00, 3.75}
};

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ=2, iter = 0, iterZ = rotAngle;
float scale3D = 1.0;
float scaleDirection = 0.01;

#define minScale 1.7
#define maxScale 2.7
#define stepDirection 0.01

//draws lines with brighter dots always on the top
void Line_color(int8_t x, int8_t y, int8_t x1, int8_t y1, CRGB color) {
  if ((x < 0 && x1 < 0) || (x >= WIDTH && x1 >= WIDTH) || 
      (y < 0 && y1 < 0) || (y >= HEIGHT && y1 >= HEIGHT)) {
    return;  }
  
  int8_t dx = abs(x1 - x);
  int8_t dy = abs(y1 - y);
  int8_t sx = (x < x1) ? 1 : -1;
  int8_t sy = (y < y1) ? 1 : -1;
  int8_t err = dx - dy;
  
  while (true) {
    // draw only if it in screen or empty or it is brighter
    if (x >= 0 && x <= WIDTH-1 && y >= 0 && y <= HEIGHT-1 && (leds[XY(x, y)] == (CRGB)(0) || color > leds[XY(x, y)]))
        leds[XY(x, y)] = color;
    
    if (x == x1 && y == y1) break;
    
    int8_t e2 = 2 * err;
    if (-dy < e2) { err -= dy;  x += sx; }
    if (dx > e2) {  err += dx;  y += sy; }
  }
}

/*CRGB getColorForZ(float z) {
  if (z >= 0) return CRGB(0xFF, 0xFF, 0xFF);     // White
//  if (z >= -2) return CRGB(0x80, 0x00, 0x00);   // Red
//  if (z >= -4) return CRGB(0x60, 0x00, 0x00);   // Dark-red
  return CRGB(0x40, 0x00, 0x00);               // Bordo
}*/

void drawLineWithClipping(int8_t x1, int8_t y1, float z1, int8_t x2, int8_t y2, float z2) {

  if (z1 >= 0 && z2 >= 0) { Line_color(x1, y1, x2, y2, CRGB(0xFF, 0xFF, 0xFF));  return; } //Just White
  if (z1 < 0 && z2 < 0) { Line_color(x1, y1, x2, y2, CRGB(0x60, 0x00, 0x00)); return; } //Just Red
  
  float t = -z2 / (z1 - z2); // if z = 0
  
  // interpolate
  int8_t x_mid = x1 + (int8_t)(t * (x2 - x1));
  int8_t y_mid = y1 + (int8_t)(t * (y2 - y1));
  
  // draw with diff.colors
  Line_color(x1, y1, x_mid, y_mid, CRGB(0xFF, 0xFF, 0xFF)); // White (z>=0)
  Line_color(x_mid, y_mid, x2, y2, CRGB(0x80, 0x00, 0x00));   // Red (z<0)  
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

void drawTextGrad() {
  int totalLines = dotsCount / 2; 
  
  for(byte line = 0; line < totalLines; line++) {
    byte startIdx = line * 2;
    byte endIdx = line * 2 + 1;
    
    float* p1 = vectors[startIdx];
    float* p2 = vectors[endIdx];
    
    float z1_draw = (p1[2] < 0) ? -p1[2] : p1[2];
    float z2_draw = (p2[2] < 0) ? -p2[2] : p2[2];
    
    // min, avoiding zero div
    if (z1_draw < 0.01f) z1_draw = 0.01f;
    if (z2_draw < 0.01f) z2_draw = 0.01f;
    
    int8_t sx1 = translateX(p1[0], z1_draw);
    int8_t sy1 = translateY(p1[1], z1_draw);
    int8_t sx2 = translateX(p2[0], z2_draw);
    int8_t sy2 = translateY(p2[1], z2_draw);
    
    // Check whether line even partly on the screen
    if ((sx1 < 0 && sx2 < 0) || (sx1 >= WIDTH && sx2 >= WIDTH) ||
        (sy1 < 0 && sy2 < 0) || (sy1 >= HEIGHT && sy2 >= HEIGHT)) {
      continue; // out of screen
    }
    
    drawLineWithClipping(sx1, sy1, p1[2], sx2, sy2, p2[2]);
  }
}

void ScaleAndRotate(float maxSc, float minSc, bool rX, bool rY, bool rZ, int8_t deltaAngle, int8_t maxAngle) {

  if (iter == 0) {
    deltaX = random(maxAngle) + deltaAngle;    deltaY = random(maxAngle) + deltaAngle;  /*  deltaZ = random(maxAngle) + deltaAngle*/; 
//    if (deltaX==0) deltaX=1; if (deltaY==0) deltaY=1; if (deltaZ==0) deltaZ=1;
    if (abs(deltaX)<2) deltaX=2; if (abs(deltaY)<2) deltaY=2; /*if (abs(deltaZ)<2) deltaZ=2;*/
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
  if (rX) rotateX(deltaX);  if (rY) rotateY(deltaY); /* if (rZ) rotateZ(deltaZ);*/
  iter--;
}

void Rotate_Zonly() {

  if (iterZ == 0) {
    deltaZ *=-1;
    iterZ = rotAngle*2; //+-rotAngle
  }
  rotateZ(deltaZ);
  iterZ--;
}


void draw() {

  if (loadingFlag) {
    dotsCount = dots;
    loadingFlag = false;
  }
  
  FastLED.clear();
  //fadeToBlackBy (leds,NUM_LEDS, 100);
  
  drawTextGrad();
  ScaleAndRotate(3.0, 1.9,0,1,0,1,4);
  Rotate_Zonly();
  //delay(10);
}


/// source letters and numbers with Z=0
/*float vectors[][3] = {
    // H
    {-9,5,0},{-9,1,0}, {-7,5,0},{-7,1,0}, {-9,3,0},{-7,3,0},
    // A
    {-5,5,0},{-3,5,0}, {-5,5,0},{-5,1,0}, {-3,5,0},{-3,1,0}, {-5,3,0},{-3,3,0},
    // P
    {-1,5,0},{1,5,0}, {-1,5,0},{-1,1,0}, {1,5,0},{1,3,0}, {-1,3,0},{1,3,0},
    // P
    {3,5,0},{5,5,0}, {3,5,0},{3,1,0}, {5,5,0},{5,3,0}, {3,3,0},{5,3,0},
    // Y
    {7,5,0},{7,4,0}, {9,5,0},{9,4,0}, {8,3,0},{8,1,0},
    // 2
    {-8,-1,0},{-6,-1,0}, {-6,-1,0},{-8,-5,0}, {-8,-5,0},{-6,-5,0},
    // 0
    {-4,-1,0},{-2,-1,0}, {-2,-1,0},{-2,-5,0}, {-2,-5,0},{-4,-5,0}, {-4,-5,0},{-4,-1,0},
    // 2
    {0,-1,0},{2,-1,0}, {2,-1,0},{0,-5,0}, {0,-5,0},{2,-5,0},
    // 6
    {4,-1,0},{6,-1,0}, {4,-1,0},{4,-5,0}, {4,-5,0},{6,-5,0}, {6,-3,0},{6,-5,0}, {4,-3,0},{6,-3,0},
    // !
    {9,-1,0},{9,-3,0}, {9,-5,0},{9,-5,0}
};*/

/*//YEAR. can be placed instead 2026 above. (72 dots in that case)
  // Y
  {-8, -1, 0}, {-8, -2, 0},  {-6, -1, 0}, {-6, -2, 0},  {-7, -3, 0}, {-7, -5, 0},
  // E
  {-4, -1, 0}, {-4, -5, 0},  {-4, -1, 0}, {-2, -1, 0},  {-4, -3, 0}, {-2, -3, 0},  {-4, -5, 0}, {-2, -5, 0},
  // A
  {0, -1, 0}, {2, -1, 0},  {0, -1, 0}, {0, -5, 0},  {2, -1, 0}, {2, -5, 0},  {0, -3, 0}, {2, -3, 0},
  // R
  {4, -1, 0}, {6, -1, 0},  {4, -1, 0}, {4, -5, 0},  {6, -1, 0}, {6, -3, 0},  {4, -3, 0}, {6, -3, 0},  {5, -4, 0}, {6, -5, 0},
*/