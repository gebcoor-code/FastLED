// Spiral Tunnel, RAM optimized v4
// coor@, 16.06.26

#define TUNNEL_R     0.30f   // радиус тоннеля (доля от ширины матрицы)
#define FLY_SPEED    0.0003f // скорость полёта (z-декремент на мс)
#define CAM_SPEED    1.5f    // скорость движения центра (пикс/сек)
#define SPIRAL       1.5f    // кривизна спирали (оборотов на пролёт)
#define COLOR_MODE   1       // 0 = монохром, 1 = цветной
#define MAX_P        80      // кол-во частиц

static uint16_t pz  [MAX_P];
static uint8_t  pang[MAX_P];

static bool     loaded = false;
static uint32_t lastMs = 0;

static float cx, cy, cvx, cvy;

#define FSIN(a) ((sin8(a) - 128) * (1.0f / 128.f))
#define FCOS(a) ((cos8(a) - 128) * (1.0f / 128.f))

void resetDot(uint8_t i, bool zRand) {
  pz[i]   = zRand ? (uint16_t)(5 + random(996))
                  : (uint16_t)(850 + random(150));
  pang[i] = (uint8_t)random(256);
}

void draw() {
  if (!loaded) {
    randomSeed(millis());

    cx  = COLS * 0.5f;
    cy  = ROWS * 0.5f;
    float angle = (float)random(1000) / 1000.f * TWO_PI;
    cvx = CAM_SPEED * cosf(angle);
    cvy = CAM_SPEED * sinf(angle);

    for (uint8_t i = 0; i < MAX_P; i++) resetDot(i, true);
    lastMs = millis();
    loaded = true;
  }

  uint32_t now = millis();
  float    dt  = (float)(now - lastMs) * 0.001f;
  lastMs = now;

// центр движется внутри границ [COL/2, ROW/2]+-20%
  const float xMin = COLS * 0.5f * 0.8f;
  const float xMax = COLS * 0.5f * 1.2f;
  const float yMin = ROWS * 0.5f * 0.8f;
  const float yMax = ROWS * 0.5f * 1.2f;

  cx += cvx * dt;
  cy += cvy * dt;

  if (cx <= xMin) { cx = xMin; cvx =  fabsf(cvx); }
  if (cx >= xMax) { cx = xMax; cvx = -fabsf(cvx); }
  if (cy <= yMin) { cy = yMin; cvy =  fabsf(cvy); }
  if (cy >= yMax) { cy = yMax; cvy = -fabsf(cvy); }

  float maxR = fminf(fminf(cx, COLS - cx), fminf(cy, ROWS - cy));

  fadeToBlackBy(leds, NUM_LEDS, 40);

  uint16_t dec = (uint16_t)(FLY_SPEED * dt * 1000000.f + 0.5f);

  for (uint8_t i = 0; i < MAX_P; i++) {
    if (pz[i] <= dec + 5) { resetDot(i, false); continue; }
    pz[i] -= dec;

    float   z    = pz[i] * 0.001f;
    float   invZ = 1.0f / z;
    uint8_t angU = pang[i] + (uint8_t)(SPIRAL * 256.f * (1.0f - z));

    float sx = cx + FCOS(angU) * TUNNEL_R * invZ * COLS * 0.5f;
    float sy = cy + FSIN(angU) * TUNNEL_R * invZ * ROWS * 0.5f;

    int16_t ix = (int16_t)(sx + 0.5f);
    int16_t iy = (int16_t)(sy + 0.5f);

    if (ix < 0 || ix >= COLS || iy < 0 || iy >= ROWS) {
      resetDot(i, false);
      continue;
    }

    float dxS = sx - cx, dyS = sy - cy;
    float edgeFactor = (maxR > 0.5f)
      ? fminf(1.0f, sqrtf(dxS*dxS + dyS*dyS) / maxR)
      : 0.0f;
    uint8_t bright = 30 + (uint8_t)(225.0f * edgeFactor);

#if COLOR_MODE
    uint8_t hue = pang[i] + (uint8_t)(pz[i] >> 2);
    leds[XY(ix, iy)] += CHSV(hue, 255, bright);
//    leds[XY(ix, iy)] += ColorFromPalette(LavaColors_p, hue, bright);
#else
    leds[XY(ix, iy)] += CHSV(0, 0, bright);
#endif
  }
}