//Octahedron, 2 variants
//coor@, 11.12.25

#define WIDTH COLS
#define HEIGHT ROWS

// Octahedron
float vectors[6][3] = {
  {0, 0, 5},      // 0
  {5, 0, 0},      // 1
  {0, 5, 0},      // 2
  {-5, 0, 0},     // 3
  {0, -5, 0},     // 4
  {0, 0, -5}      // 5
};

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ, iter = 0;
float scale3D = 1.0;
float scaleDirection = 0.01;

#define minScale 0.7
#define maxScale 3
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
  for (byte i = 0; i < 6; i++) {
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
  for (byte i = 0; i < 6; i++) {
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
  for (byte i = 0; i < 6; i++) {
    float x = vectors[i][0];
    float y = vectors[i][1];
    vectors[i][0] = x * cosa - y * sina;
    vectors[i][1] = x * sina + y * cosa;
  }
}

bool isFaceVisible(int8_t v1, int8_t v2, int8_t v3) {
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
  if (!isFaceVisible(v1, v2, v3)) return;
  
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

void drawOctahedron() {
  drawTriangleIfVisible(0, 1, 2);
  drawTriangleIfVisible(0, 2, 3);
  drawTriangleIfVisible(0, 3, 4);
  drawTriangleIfVisible(0, 4, 1);
  drawTriangleIfVisible(5, 2, 1);
  drawTriangleIfVisible(5, 3, 2);
  drawTriangleIfVisible(5, 4, 3);
  drawTriangleIfVisible(5, 1, 4);
}

void drawOctahedronEdges() {
  Line(translateX(vectors[0][0], vectors[0][2]), translateY(vectors[0][1], vectors[0][2]),
       translateX(vectors[1][0], vectors[1][2]), translateY(vectors[1][1], vectors[1][2]));
  Line(translateX(vectors[0][0], vectors[0][2]), translateY(vectors[0][1], vectors[0][2]),
       translateX(vectors[2][0], vectors[2][2]), translateY(vectors[2][1], vectors[2][2]));
  Line(translateX(vectors[0][0], vectors[0][2]), translateY(vectors[0][1], vectors[0][2]),
       translateX(vectors[3][0], vectors[3][2]), translateY(vectors[3][1], vectors[3][2]));
  Line(translateX(vectors[0][0], vectors[0][2]), translateY(vectors[0][1], vectors[0][2]),
       translateX(vectors[4][0], vectors[4][2]), translateY(vectors[4][1], vectors[4][2]));
  
  Line(translateX(vectors[5][0], vectors[5][2]), translateY(vectors[5][1], vectors[5][2]),
       translateX(vectors[1][0], vectors[1][2]), translateY(vectors[1][1], vectors[1][2]));
  Line(translateX(vectors[5][0], vectors[5][2]), translateY(vectors[5][1], vectors[5][2]),
       translateX(vectors[2][0], vectors[2][2]), translateY(vectors[2][1], vectors[2][2]));
  Line(translateX(vectors[5][0], vectors[5][2]), translateY(vectors[5][1], vectors[5][2]),
       translateX(vectors[3][0], vectors[3][2]), translateY(vectors[3][1], vectors[3][2]));
  Line(translateX(vectors[5][0], vectors[5][2]), translateY(vectors[5][1], vectors[5][2]),
       translateX(vectors[4][0], vectors[4][2]), translateY(vectors[4][1], vectors[4][2]));
  
  Line(translateX(vectors[1][0], vectors[1][2]), translateY(vectors[1][1], vectors[1][2]),
       translateX(vectors[2][0], vectors[2][2]), translateY(vectors[2][1], vectors[2][2]));
  Line(translateX(vectors[2][0], vectors[2][2]), translateY(vectors[2][1], vectors[2][2]),
       translateX(vectors[3][0], vectors[3][2]), translateY(vectors[3][1], vectors[3][2]));
  Line(translateX(vectors[3][0], vectors[3][2]), translateY(vectors[3][1], vectors[3][2]),
       translateX(vectors[4][0], vectors[4][2]), translateY(vectors[4][1], vectors[4][2]));
  Line(translateX(vectors[4][0], vectors[4][2]), translateY(vectors[4][1], vectors[4][2]),
       translateX(vectors[1][0], vectors[1][2]), translateY(vectors[1][1], vectors[1][2]));
}

void draw() {
  FastLED.clear();
  
  drawOctahedron();        // just visible edges
  // drawOctahedronEdges(); // all edges
  
  if (iter == 0) {
    deltaX = random(7) - 3;
    deltaY = random(7) - 3;
    deltaZ = random(7) - 3;
    iter = random(250) + 5;
  }
  
  scale3D += scaleDirection;
  if (scale3D >= maxScale) {
    scale3D = maxScale;
    scaleDirection = -stepDirection;
  } else if (scale3D <= minScale) {
    scale3D = minScale;
    scaleDirection = stepDirection;
  }
  
  rotateX(deltaX);
  rotateY(deltaY);
  rotateZ(deltaZ);
  
  iter--;
}