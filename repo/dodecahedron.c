//dodecahedron
//20.04.26, coor@


#define WIDTH  COLS
#define HEIGHT ROWS

#define DODE_NZ_MAX 100.0f

float vectors[20][3] = {
  {-4.62f, -4.62f, -4.62f},  //  0
  {-4.62f, -4.62f,  4.62f},  //  1
  {-4.62f,  4.62f, -4.62f},  //  2
  {-4.62f,  4.62f,  4.62f},  //  3
  { 4.62f, -4.62f, -4.62f},  //  4
  { 4.62f, -4.62f,  4.62f},  //  5
  { 4.62f,  4.62f, -4.62f},  //  6
  { 4.62f,  4.62f,  4.62f},  //  7
  { 0.00f, -7.47f, -2.85f},  //  8
  {-2.85f,  0.00f, -7.47f},  //  9
  {-7.47f, -2.85f,  0.00f},  // 10
  { 0.00f, -7.47f,  2.85f},  // 11
  {-2.85f,  0.00f,  7.47f},  // 12
  {-7.47f,  2.85f,  0.00f},  // 13
  { 0.00f,  7.47f, -2.85f},  // 14
  { 2.85f,  0.00f, -7.47f},  // 15
  { 7.47f, -2.85f,  0.00f},  // 16
  { 0.00f,  7.47f,  2.85f},  // 17
  { 2.85f,  0.00f,  7.47f},  // 18
  { 7.47f,  2.85f,  0.00f},  // 19
};

const int8_t dodeFaces[12][5] = {
  { 0,  9, 15,  4,  8},  //  0
  { 0,  8, 11,  1, 10},  //  1
  { 0, 10, 13,  2,  9},  //  2
  { 1, 12,  3, 13, 10},  //  3
  { 1, 11,  5, 18, 12},  //  4
  { 2, 14,  6, 15,  9},  //  5
  { 2, 13,  3, 17, 14},  //  6
  { 3, 12, 18,  7, 17},  //  7
  { 4, 16,  5, 11,  8},  //  8
  { 4, 15,  6, 19, 16},  //  9
  { 5, 16, 19,  7, 18},  // 10
  { 6, 14, 17,  7, 19},  // 11
};

float     perspective    = 60.0f;
int8_t    deltaX, deltaY, deltaZ, iter = 0;
float     scale3D        = 1.0f;
float     scaleDirection = 0.01f;

#define DodeMinScale   0.8f
#define DodeMaxScale   1.7f
#define stepDirection 0.01f

void Line(int8_t x, int8_t y, int8_t x1, int8_t y1, uint8_t bright) {
  if ((x < 0 && x1 < 0) || (x >= WIDTH  && x1 >= WIDTH) ||
      (y < 0 && y1 < 0) || (y >= HEIGHT && y1 >= HEIGHT)) return;

  CRGB col = CRGB(bright, bright, bright);

  int8_t dx = abs(x1 - x);
  int8_t dy = abs(y1 - y);
  int8_t sx = (x < x1) ? 1 : -1;
  int8_t sy = (y < y1) ? 1 : -1;
  int8_t err = dx - dy;

  while (true) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      uint16_t idx = XY((uint8_t)x, (uint8_t)y);
      if (col > leds[idx]) leds[idx] = col;
    }
    if (x == x1 && y == y1) break;
    int8_t e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
}

int8_t translateX(float x, float z) {
  float scaledX = x * scale3D;
  float scaledZ = z * scale3D;
  return (int8_t)((scaledX + WIDTH / 2) + (scaledZ * (scaledX / perspective)));
}

int8_t translateY(float y, float z) {
  float scaledY = y * scale3D;
  float scaledZ = z * scale3D;
  return (int8_t)((scaledY + HEIGHT / 2) + (scaledZ * (scaledY / perspective)));
}

void rotateX(int8_t angle) {
  float rad = angle * PI / 180.0f;
  float ca = cos(rad), sa = sin(rad);
  for (byte i = 0; i < 20; i++) {
    float y = vectors[i][1], z = vectors[i][2];
    vectors[i][1] = y * ca - z * sa;
    vectors[i][2] = y * sa + z * ca;
  }
}

void rotateY(int8_t angle) {
  float rad = angle * PI / 180.0f;
  float ca = cos(rad), sa = sin(rad);
  for (byte i = 0; i < 20; i++) {
    float x = vectors[i][0], z = vectors[i][2];
    vectors[i][0] = x * ca - z * sa;
    vectors[i][2] = x * sa + z * ca;
  }
}

void rotateZ(int8_t angle) {
  float rad = angle * PI / 180.0f;
  float ca = cos(rad), sa = sin(rad);
  for (byte i = 0; i < 20; i++) {
    float x = vectors[i][0], y = vectors[i][1];
    vectors[i][0] = x * ca - y * sa;
    vectors[i][1] = x * sa + y * ca;
  }
}

bool pentFaceBrightness(const int8_t f[5], uint8_t &bright) {
  float nz = 0;
  for (byte k = 0; k < 5; k++) {
    byte a = f[k], b = f[(k + 1) % 5];
    nz += (vectors[a][0] - vectors[b][0]) * (vectors[a][1] + vectors[b][1]);
  }
  if (nz >= 0) return false;
  float b = (-nz / DODE_NZ_MAX) * 255.0f;
  bright = (uint8_t)(b > 255.0f ? 255 : b);
  return true;
}

void drawPentIfVisible(const int8_t f[5]) {
  uint8_t bright;
  if (!pentFaceBrightness(f, bright)) return;

  int8_t px[5], py[5];
  for (byte k = 0; k < 5; k++) {
    px[k] = translateX(vectors[f[k]][0], vectors[f[k]][2]);
    py[k] = translateY(vectors[f[k]][1], vectors[f[k]][2]);
  }
  for (byte k = 0; k < 5; k++) {
    Line(px[k], py[k], px[(k + 1) % 5], py[(k + 1) % 5], bright);
  }
}

void drawDodecahedron() {
  for (byte f = 0; f < 12; f++) {
    drawPentIfVisible(dodeFaces[f]);
  }
}

void ScaleAndRotate(float maxSc, float minSc, bool rX, bool rY, bool rZ) {
  if (iter == 0) {
    deltaX = random(7) - 3;
    deltaY = random(7) - 3;
    deltaZ = random(7) - 3;
    iter   = random(250) + 5;
  }
  scale3D += scaleDirection;
  if      (scale3D >= maxSc) { scale3D = maxSc; scaleDirection = -stepDirection; }
  else if (scale3D <= minSc) { scale3D = minSc; scaleDirection =  stepDirection; }
  if (rX) rotateX(deltaX);
  if (rY) rotateY(deltaY);
  if (rZ) rotateZ(deltaZ);
  iter--;
}

void draw() {
  FastLED.clear();
  drawDodecahedron();
  ScaleAndRotate(DodeMaxScale, DodeMinScale, 1, 1, 1);
}
