//'HAPPY 2026!' (or 'YEAR') in 3D.
// coor@, 13.12.25
//upd. just '2026' but with spherical distortion in Z and Y a bit

#define dots 30 //qty of dots
byte dotsCount;

#define WIDTH COLS
#define HEIGHT ROWS

bool loadingFlag = true;

//2026! spherical
float vectors[][3] = {
    // 2
    {-8.4, 2.2, -1.828}, {-5.7, 2.2, 0.424},
    {-5.7, 2.2, 0.424}, {-8.4, -2.2, -1.828},
    {-8.4, -2.2, -1.828}, {-5.7, -2.2, 0.424},
    
    // 0
    {-3.9, 2.2, 1.842}, {-1.8, 2.2, 2.552},
    {-1.8, 2.2, 2.552}, {-1.8, -2.2, 2.552},
    {-1.8, -2.2, 2.552}, {-3.9, -2.2, 1.842},
    {-3.9, -2.2, 1.842}, {-3.9, 2.2, 1.842},
    
    // 2
    {0.3, 2.2, 2.917}, {2.4, 2.2, 2.552},
    {2.4, 2.2, 2.552}, {0.3, -2.2, 2.917},
    {0.3, -2.2, 2.917}, {2.4, -2.2, 2.552},
    
    // 6
    {4.2, 2.2, 1.842}, {6.3, 2.2, 0.424},
    {4.2, 2.2, 1.842}, {4.2, -2.2, 1.842},
    {4.2, -2.2, 1.842}, {6.3, -2.2, 0.424},
    {6.3, 0.0, 0.424}, {6.3, -2.2, 0.424},
    {4.2, 0.0, 1.842}, {6.3, 0.0, 0.424}
};

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ, iter = 0;
float scale3D = 1.0;
float scaleDirection = 0.01;

#define minScale 1.5
#define maxScale 2.0
#define stepDirection 0.01

void Line(int x, int y, int x1, int y1) {

  if ((x < 0 && x1 < 0) || (x >= WIDTH && x1 >= WIDTH) || 
      (y < 0 && y1 < 0) || (y >= HEIGHT && y1 >= HEIGHT)) {
    return;
  }
  
  //Brezenhem
  int dx = abs(x1 - x);
  int dy = abs(y1 - y);
  int sx = (x < x1) ? 1 : -1;
  int sy = (y < y1) ? 1 : -1;
  int err = dx - dy;
  
  while (true) {
    if (x >= 0 && x <= WIDTH-1 && y >= 0 && y <= HEIGHT-1) {
      leds[XY(x, y)] = CRGB(0xFF, 0xFF, 0xFF);
    }
    
    if (x == x1 && y == y1) break;
    
    int e2 = 2 * err;
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


void drawText() {
  int totalLines = dotsCount/2; 
  
  for(byte line = 0; line < totalLines; line++) {
    byte startIdx = line * 2;
    byte endIdx = line * 2 + 1;
    
    int8_t x1 = translateX(vectors[startIdx][0], vectors[startIdx][2]);
    int8_t y1 = translateY(vectors[startIdx][1], vectors[startIdx][2]);
    int8_t x2 = translateX(vectors[endIdx][0], vectors[endIdx][2]);
    int8_t y2 = translateY(vectors[endIdx][1], vectors[endIdx][2]);
    
    Line(x1, y1, x2, y2);
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

    loadingFlag = false;
    
  //  rotateX(20);
  //  rotateY(30);
  }
  
  FastLED.clear();
  //fadeToBlackBy (leds,NUM_LEDS, 100);
  
  drawText();

  ScaleAndRotate(2.0,1.5,1,1,1,-3,7);
  
  delay(10);
}


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
};
*/
/* YEAR. can be placed instead 2026 above. (72 dots in that case)
  // Y
  {-8, -1, 0}, {-8, -2, 0},  {-6, -1, 0}, {-6, -2, 0},  {-7, -3, 0}, {-7, -5, 0},
  // E
  {-4, -1, 0}, {-4, -5, 0},  {-4, -1, 0}, {-2, -1, 0},  {-4, -3, 0}, {-2, -3, 0},  {-4, -5, 0}, {-2, -5, 0},
  // A
  {0, -1, 0}, {2, -1, 0},  {0, -1, 0}, {0, -5, 0},  {2, -1, 0}, {2, -5, 0},  {0, -3, 0}, {2, -3, 0},
  // R
  {4, -1, 0}, {6, -1, 0},  {4, -1, 0}, {4, -5, 0},  {6, -1, 0}, {6, -3, 0},  {4, -3, 0}, {6, -3, 0},  {5, -4, 0}, {6, -5, 0},
*/