//updated 05.12.25 coor@. now it also moves along Z. Line func refactored a bit. it allows to work with lines out of the screen.

#define WIDTH COLS
#define HEIGHT ROWS

//Cube
float vectors[8][3] = {{5, 5, 5}, { -5, 5, 5}, { -5, -5, 5}, {5, -5, 5}, {5, 5, -5}, { -5, 5, -5}, { -5, -5, -5}, {5, -5, -5}};

//Pyramida
//float vectors[8][3] = {{0, 0, 5},{0, 0, 5},{0, 0, 5},{0, 0, 5},{5, 5, -5},{-5, 5, -5},{-5, -5, -5},{5, -5, -5}};


float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ, iter = 0;
float scale3D = 1.0;
float scaleDirection = 0.01;

#define minScale 0.6
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
    if (x >= 0 && x <= WIDTH-1 && y >= 0 && y <= HEIGHT-1) {
      leds[XY(x, y)] = CRGB(0xFF, 0xFF, 0xFF);
    }
    
    if (x == x1 && y == y1) break;
    
    int8_t e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

int8_t translateX(float x, float z) {
  float scaledX = x * scale3D;
  float scaledZ = z * scale3D;
  return (int8_t)((scaledX + COLS/2) + (scaledZ * (scaledX / perspective)));
}

int8_t translateY(float y, float z) {
  float scaledY = y * scale3D;
  float scaledZ = z * scale3D;
  return (int8_t)((scaledY + ROWS/2) + (scaledZ * (scaledY / perspective)));
}

void rotateX(int8_t angle) {
  float rad = angle * PI / 180;
  float cosa = cos(rad);
  float sina = sin(rad);
  for (byte i = 0; i < 8; i++) {
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
  for (int8_t i = 0; i < 8; i++) {
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
  for (byte i = 0; i < 8; i++) {
    float x = vectors[i][0];
    float y = vectors[i][1];
    vectors[i][0] = x * cosa - y * sina;
    vectors[i][1] = x * sina + y * cosa;
  }
}

void drawVectors() {
  Line(translateX(vectors[0][0], vectors[0][2]), translateY(vectors[0][1], vectors[0][2]), 
       translateX(vectors[1][0], vectors[1][2]), translateY(vectors[1][1], vectors[1][2]));
  Line(translateX(vectors[1][0], vectors[1][2]), translateY(vectors[1][1], vectors[1][2]), 
       translateX(vectors[2][0], vectors[2][2]), translateY(vectors[2][1], vectors[2][2]));
  Line(translateX(vectors[2][0], vectors[2][2]), translateY(vectors[2][1], vectors[2][2]), 
       translateX(vectors[3][0], vectors[3][2]), translateY(vectors[3][1], vectors[3][2]));
  Line(translateX(vectors[3][0], vectors[3][2]), translateY(vectors[3][1], vectors[3][2]), 
       translateX(vectors[0][0], vectors[0][2]), translateY(vectors[0][1], vectors[0][2]));
  
  Line(translateX(vectors[4][0], vectors[4][2]), translateY(vectors[4][1], vectors[4][2]), 
       translateX(vectors[5][0], vectors[5][2]), translateY(vectors[5][1], vectors[5][2]));
  Line(translateX(vectors[5][0], vectors[5][2]), translateY(vectors[5][1], vectors[5][2]), 
       translateX(vectors[6][0], vectors[6][2]), translateY(vectors[6][1], vectors[6][2]));
  Line(translateX(vectors[6][0], vectors[6][2]), translateY(vectors[6][1], vectors[6][2]), 
       translateX(vectors[7][0], vectors[7][2]), translateY(vectors[7][1], vectors[7][2]));
  Line(translateX(vectors[7][0], vectors[7][2]), translateY(vectors[7][1], vectors[7][2]), 
       translateX(vectors[4][0], vectors[4][2]), translateY(vectors[4][1], vectors[4][2]));
  
  Line(translateX(vectors[0][0], vectors[0][2]), translateY(vectors[0][1], vectors[0][2]), 
       translateX(vectors[4][0], vectors[4][2]), translateY(vectors[4][1], vectors[4][2]));
  Line(translateX(vectors[1][0], vectors[1][2]), translateY(vectors[1][1], vectors[1][2]), 
       translateX(vectors[5][0], vectors[5][2]), translateY(vectors[5][1], vectors[5][2]));
  Line(translateX(vectors[2][0], vectors[2][2]), translateY(vectors[2][1], vectors[2][2]), 
       translateX(vectors[6][0], vectors[6][2]), translateY(vectors[6][1], vectors[6][2]));
  Line(translateX(vectors[3][0], vectors[3][2]), translateY(vectors[3][1], vectors[3][2]), 
       translateX(vectors[7][0], vectors[7][2]), translateY(vectors[7][1], vectors[7][2]));
}

void draw() {
  //FastLED.clear();
  fadeToBlackBy (leds,NUM_LEDS, 150);
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
  delay(20);
}