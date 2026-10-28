//next 3d - icosahedron
//coor@, 10.12.25

#define WIDTH COLS
#define HEIGHT ROWS

// Icosahedron
float vectors[12][3] = {
  {0, 8.0, 0},          // 0
  {7.5, 3.0, 0},        // 1
  {2.3, 3.0, 7.2},      // 2
  {-6.1, 3.0, 4.4},     // 3
  {-6.1, 3.0, -4.4},    // 4
  {2.3, 3.0, -7.2},     // 5
  {7.5, -3.0, 0},       // 6
  {2.3, -3.0, 7.2},     // 7
  {-6.1, -3.0, 4.4},    // 8
  {-6.1, -3.0, -4.4},   // 9
  {2.3, -3.0, -7.2},    // 10
  {0, -8.0, 0}          // 11
};

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ, iter = 0;
float scale3D = 1.0;
float scaleDirection = 0.01;

#define IcominScale 0.8
#define IcomaxScale 1.7
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
  for (byte i = 0; i < 12; i++) {
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
  for (byte i = 0; i < 12; i++) {
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
  for (byte i = 0; i < 12; i++) {
    float x = vectors[i][0];
    float y = vectors[i][1];
    vectors[i][0] = x * cosa - y * sina;
    vectors[i][1] = x * sina + y * cosa;
  }
}

bool isTriagFaceVisible(int8_t v1, int8_t v2, int8_t v3) {
  float ax = vectors[v2][0] - vectors[v1][0];
  float ay = vectors[v2][1] - vectors[v1][1];
  float az = vectors[v2][2] - vectors[v1][2];
  
  float bx = vectors[v3][0] - vectors[v1][0];
  float by = vectors[v3][1] - vectors[v1][1];
  float bz = vectors[v3][2] - vectors[v1][2];
  
  float nz = ax * by - ay * bx;

  return (nz < 0);
}

void drawTriangleIfVisible(int8_t v1, int8_t v2, int8_t v3) {
  if (!isTriagFaceVisible(v1, v2, v3)) return;
  
  int8_t x1 = translateX(vectors[v1][0], vectors[v1][2]);
  int8_t y1 = translateY(vectors[v1][1], vectors[v1][2]);
  int8_t x2 = translateX(vectors[v2][0], vectors[v2][2]);
  int8_t y2 = translateY(vectors[v2][1], vectors[v2][2]);
  int8_t x3 = translateX(vectors[v3][0], vectors[v3][2]);
  int8_t y3 = translateY(vectors[v3][1], vectors[v3][2]);
  
  Line(x1, y1, x2, y2);
  Line(x2, y2, x3, y3);
  Line(x3, y3, x1, y1);
}

void drawIcosahedron() {
  // North (5 triangles)
  drawTriangleIfVisible(0, 1, 2);
  drawTriangleIfVisible(0, 2, 3);
  drawTriangleIfVisible(0, 3, 4);
  drawTriangleIfVisible(0, 4, 5);
  drawTriangleIfVisible(0, 5, 1);
  
  // South (5 triangles)
  drawTriangleIfVisible(11, 7, 6);
  drawTriangleIfVisible(11, 8, 7);
  drawTriangleIfVisible(11, 9, 8);
  drawTriangleIfVisible(11, 10, 9);
  drawTriangleIfVisible(11, 6, 10);
  
  // Middle (10 triangles)
  drawTriangleIfVisible(1, 6, 2);
  drawTriangleIfVisible(2, 6, 7);
  drawTriangleIfVisible(2, 7, 3);
  drawTriangleIfVisible(3, 7, 8);
  drawTriangleIfVisible(3, 8, 4);
  drawTriangleIfVisible(4, 8, 9);
  drawTriangleIfVisible(4, 9, 5);
  drawTriangleIfVisible(5, 9, 10);
  drawTriangleIfVisible(5, 10, 1);
  drawTriangleIfVisible(1, 10, 6);
}

void ScaleAndRotate(float maxSc, float minSc, bool rX, bool rY, bool rZ) {

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
  if (rX) rotateX(deltaX);  if (rY) rotateY(deltaY);  if (rZ) rotateZ(deltaZ);
  iter--;
}

void draw() {
  //FastLED.clear();
  fadeToBlackBy (leds,NUM_LEDS, 100);
  drawIcosahedron();
  ScaleAndRotate(IcomaxScale, IcominScale,1,1,1);
  
   //delay(10);
}
