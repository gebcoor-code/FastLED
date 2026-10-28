//05.12.25 coor@. Some experiments with hidden edges

#define WIDTH COLS
#define HEIGHT ROWS

//Cube
double vectors[8][3] = {{5, 5, 5}, { -5, 5, 5}, { -5, -5, 5}, {5, -5, 5}, {5, 5, -5}, { -5, 5, -5}, { -5, -5, -5}, {5, -5, -5}};

//Pyramida without top
/*double vectors[8][3] = {{8, 8, 5}, {-8, 8, 5}, {-8, -8, 5}, {8, -8, 5}, {4, 4, -5}, {-4, 4, -5}, {-4, -4, -5}, {4, -4, -5}};*/



double perspective = 60.0;
int8_t deltaX, deltaY, deltaZ, iter = 0;
double scale3D = 1.0;
double scaleDirection = 0.01;

#define minScale 0.3
#define maxScale 1.4
#define stepDirection 0.01

void Line(int8_t x, int8_t y, int8_t x1, int8_t y1) {

  if ((x < 0 && x1 < 0) || (x >= WIDTH && x1 >= WIDTH) || 
      (y < 0 && y1 < 0) || (y >= HEIGHT && y1 >= HEIGHT)) {
    return;
  }
  
  //Brezenhem
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
    
    if (e2 > -dy) {err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

int8_t translateX(double x, double z) {
  double scaledX = x * scale3D;
  double scaledZ = z * scale3D;
  return (int8_t)((scaledX + WIDTH/2) + (scaledZ * (scaledX / perspective)));
}

int8_t translateY(double y, double z) {
  double scaledY = y * scale3D;
  double scaledZ = z * scale3D;
  return (int8_t)((scaledY + HEIGHT/2) + (scaledZ * (scaledY / perspective)));
}

void rotateX(int8_t angle) {
  double rad = angle * PI / 180;
  double cosa = cos(rad);
  double sina = sin(rad);
  for (byte i = 0; i < 8; i++) {
    double y = vectors[i][1];
    double z = vectors[i][2];
    vectors[i][1] = y * cosa - z * sina;
    vectors[i][2] = y * sina + z * cosa;
  }
}

void rotateY(int8_t angle) {
  double rad = angle * PI / 180;
  double cosa = cos(rad);
  double sina = sin(rad);
  for (byte i = 0; i < 8; i++) {
    double x = vectors[i][0];
    double z = vectors[i][2];
    vectors[i][0] = x * cosa - z * sina;
    vectors[i][2] = x * sina + z * cosa;
  }
}

void rotateZ(int8_t angle) {
  double rad = angle * PI / 180;
  double cosa = cos(rad);
  double sina = sin(rad);
  for (byte i = 0; i < 8; i++) {
    double x = vectors[i][0];
    double y = vectors[i][1];
    vectors[i][0] = x * cosa - y * sina;
    vectors[i][1] = x * sina + y * cosa;
  }
}

// Calculate face normal and check visibility using back-face culling
bool isFaceVisible(int8_t v1, int8_t v2, int8_t v3) {
  // Vectors of two edges of the face
  double edge1[3] = {
    vectors[v2][0] - vectors[v1][0],
    vectors[v2][1] - vectors[v1][1],
    vectors[v2][2] - vectors[v1][2]
  };
  
  double edge2[3] = {
    vectors[v3][0] - vectors[v1][0],
    vectors[v3][1] - vectors[v1][1],
    vectors[v3][2] - vectors[v1][2]
  };
  
  // Cross product = face normal
  double normal[3] = {
    edge1[1] * edge2[2] - edge1[2] * edge2[1],
    edge1[2] * edge2[0] - edge1[0] * edge2[2],
    edge1[0] * edge2[1] - edge1[1] * edge2[0]
  };
  
  // Vector to viewer (camera at 0,0,-inf looking along +Z axis)
  // Simplified: viewer vector = (0, 0, 1) if viewer looks along +Z
  
  // Dot product of normal and viewer vector
  // Viewer vector is approximately (0, 0, 1)
  double dot = normal[2]; // Only Z component matters
  
  // Face is visible if dot > 0 (normal points toward viewer)
  return (dot > 0);
}

// Draw a face only if it's visible
void drawFaceIfVisible(int8_t v1, int8_t v2, int8_t v3, int8_t v4) {
  // Check visibility using first three vertices
  if (isFaceVisible(v1, v2, v3)) {
    Line(translateX(vectors[v1][0], vectors[v1][2]), translateY(vectors[v1][1], vectors[v1][2]),
         translateX(vectors[v2][0], vectors[v2][2]), translateY(vectors[v2][1], vectors[v2][2]));
    
    Line(translateX(vectors[v2][0], vectors[v2][2]), translateY(vectors[v2][1], vectors[v2][2]),
         translateX(vectors[v3][0], vectors[v3][2]), translateY(vectors[v3][1], vectors[v3][2]));
    
    Line(translateX(vectors[v3][0], vectors[v3][2]), translateY(vectors[v3][1], vectors[v3][2]),
         translateX(vectors[v4][0], vectors[v4][2]), translateY(vectors[v4][1], vectors[v4][2]));
    
    Line(translateX(vectors[v4][0], vectors[v4][2]), translateY(vectors[v4][1], vectors[v4][2]),
         translateX(vectors[v1][0], vectors[v1][2]), translateY(vectors[v1][1], vectors[v1][2]));
  }
}

void drawVectors() {
  // Draw only visible faces of the cube
  // Vertex order should be COUNTER-CLOCKWISE when looking FROM INSIDE the cube
  
  // Front face (z = +)
  drawFaceIfVisible(0, 1, 2, 3);
  
  // Back face (z = -) - reverse vertex order
  drawFaceIfVisible(4, 7, 6, 5);
  
  // Top face (y = +)
  drawFaceIfVisible(0, 4, 5, 1);
  
  // Bottom face (y = -) - reverse vertex order!
  drawFaceIfVisible(2, 6, 7, 3);
  
  // Right face (x = +)
  drawFaceIfVisible(0, 3, 7, 4);
  
  // Left face (x = -) - reverse vertex order
  drawFaceIfVisible(1, 5, 6, 2);
}

void draw() {
//  FastLED.clear();
  
  fadeToBlackBy (leds,NUM_LEDS, 120);  
  drawVectors();
  
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
//  delay(10);
}