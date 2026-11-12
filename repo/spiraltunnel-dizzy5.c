// Spiral Tunnel, idea from Dizzy5 ZX-Spectrum intro (https://www.zxby.org/unreal/?model=atm710&a=trd/Dizzy%205%20(CM)%20(1991).zip&autorun=1&press=0)
// coor@, 17.10.26


#define INNER_R      0.4f  // радиус круга (доля от половины меньшей стороны)
#define DEPTH_SPEED  0.78f   // пролётов в секунду
#define ROT_SPEED    0.78f   // оборотов в секунду
#define DIR_MS       3000    // смена направления, мс
#define CAM_SPEED    0.0f    // скорость движения центра (пикс/сек)
#define COLOR_MODE   1       // 0 = монохром, 1 = цветной
#define FADE         200     // затухание следа (255 = без следа; 40 = длинный след)
#define MAX_P        64      // кол-во точек
#define PERSP_B      70.8f   // кривизна перспективы

static uint8_t  pdep[MAX_P];           // глубина точки (старший байт 0..255 = 0..1)

static bool     loaded = false;
static uint32_t lastMs = 0, dirMs = 0;
static uint16_t gD = 0, gA = 0;         // общий сдвиг: глубина и угол (8.8 и 0..65535 = оборот)
static float    accD = 0, accA = 0;     // дробные остатки сдвига
static int8_t   dirD = 1, dirA = 0;     // текущее направление

static float cx, cy, cvx, cvy;

// 8 направлений (глубина, угол)
static const int8_t DIRS[8][2] = { {1,0}, {1,1}, {1,-1}, {-1,0}, {-1,1}, {-1,-1}, {0,1}, {0,-1} };

static void newDir() {
  uint8_t k = random(8);
  dirD = DIRS[k][0];
  dirA = DIRS[k][1];
}

void draw() {
  if (!loaded) {
    randomSeed(millis());

    cx  = COLS * 0.5f;
    cy  = ROWS * 0.5f;
    float angle = (float)random(1000) / 1000.f * TWO_PI;
    cvx = CAM_SPEED * cosf(angle);
    cvy = CAM_SPEED * sinf(angle);

    for (uint8_t i = 0; i < MAX_P; i++) pdep[i] = random(256);
    dirD = 1; dirA = 0;                 // начало: просто вылет из круга
    lastMs = dirMs = millis();
    loaded = true;
  }

  uint32_t now = millis();
  float    dt  = (float)(now - lastMs) * 0.001f;
  if (dt > 0.1f) dt = 0.1f;
  lastMs = now;

  if (now - dirMs >= DIR_MS) { dirMs = now; newDir(); }

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

  // общий сдвиг всех точек
  accD += dirD * DEPTH_SPEED * 65536.f * dt;
  accA += dirA * ROT_SPEED   * 65536.f * dt;
  int32_t sD = (int32_t)accD; accD -= sD; gD += (uint16_t)sD;
  int32_t sA = (int32_t)accA; accA -= sA; gA += (uint16_t)sA;

  float maxR = fminf(fminf(cx, COLS - cx), fminf(cy, ROWS - cy));      // до ближнего края (яркость)
  float rMin = INNER_R * fminf(COLS, ROWS) * 0.5f;                       // постоянный: радиусы не "дышат"

  fadeToBlackBy(leds, NUM_LEDS, FADE);

  for (uint8_t i = 0; i < MAX_P; i++) {
    uint16_t base = (uint16_t)(((uint32_t)i << 16) / MAX_P);           // свой угол точки
    uint16_t a16  = base + gA;
    uint16_t d16  = ((uint16_t)pdep[i] << 8) + gD;                     // глубина по кругу
    float    t    = d16 * (1.0f / 65536.f);
    float    r    = rMin * PERSP_B / (PERSP_B - 64.0f * t);            // перспектива (таблица Dizzy)

    float sx = cx + r * (cos16(a16) * (1.0f / 32768.f));
    float sy = cy + r * (sin16(a16) * (1.0f / 32768.f));

    int16_t ix = (int16_t)(sx + 0.5f);
    int16_t iy = (int16_t)(sy + 0.5f);
    if (ix < 0 || ix >= COLS || iy < 0 || iy >= ROWS) continue;         // за краем: просто не видна

    float edgeFactor = (maxR > 0.5f) ? fminf(1.0f, r / maxR) : 1.0f;
    uint8_t bright = 30 + (uint8_t)(225.0f * edgeFactor);

#if COLOR_MODE
    uint8_t hue = (uint8_t)(base >> 8) + (uint8_t)(d16 >> 10);
    leds[XY(ix, iy)] += CHSV(hue, 255, bright);
//    leds[XY(ix, iy)] += ColorFromPalette(LavaColors_p, hue, bright);
#else
    leds[XY(ix, iy)] += CHSV(0, 0, bright);
#endif
  }
}   
