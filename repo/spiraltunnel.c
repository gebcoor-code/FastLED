// Spiral Tunnel
// coor@, 16.06.26

#define TUNNEL_R     0.50f   // радиус тоннел€ (дол€ от ширины матрицы)
#define FLY_SPEED    0.0003f // скорость полЄта (z-декремент на мс) //0.0008
#define CAM_SPEED    0.6f    // скорость движени€ точки схода
#define SPIRAL       1.5f    // кривизна спирали (оборотов на пролЄт) //0.5
#define COLOR_MODE   0       // 0 = монохром, 1 = цветной
#define MAX_P        40      // кол-во частиц

static float   pz  [MAX_P];
static float   pang[MAX_P];
static float   prad[MAX_P];
static uint8_t phue[MAX_P];

#define N_WAVES 4
static float wxA[N_WAVES], wxT[N_WAVES], wxP[N_WAVES];
static float wyA[N_WAVES], wyT[N_WAVES], wyP[N_WAVES];

static bool     loaded = false;
static uint32_t lastMs = 0;

void resetDot(uint8_t i, bool zRand) {
  pz[i]   = zRand ? (float)random(1000) / 1000.f
                  : 0.85f + (float)random(150) / 1000.f;
  pang[i] = (float)random(1000) / 1000.f * TWO_PI;
  prad[i] = 0.7f + (float)random(600) / 1000.f;
  phue[i] = random8();
}

float vpX(float t) {
  float v = COLS * 0.5f;
  for (uint8_t i = 0; i < N_WAVES; i++)
    v += wxA[i] * sinf(t / wxT[i] + wxP[i]);
  return v;
}

float vpY(float t) {
  float v = ROWS * 0.5f;
  for (uint8_t i = 0; i < N_WAVES; i++)
    v += wyA[i] * sinf(t / wyT[i] + wyP[i]);
  return v;
}

void draw() {
  if (!loaded) {
    randomSeed(millis());

    float sumAx = 0, sumAy = 0;
    for (uint8_t i = 0; i < N_WAVES; i++) {
      wxA[i] = 0.10f + (float)random(200) / 1000.f;
      wxT[i] = 0.3f  + (float)random(50)  / 10.f;
      wxP[i] = (float)random(1000) / 1000.f * TWO_PI;
      wyA[i] = 0.10f + (float)random(200) / 1000.f;
      wyT[i] = 0.3f  + (float)random(50)  / 10.f;
      wyP[i] = (float)random(1000) / 1000.f * TWO_PI;
      sumAx += wxA[i];
      sumAy += wyA[i];
    }
    float scX = COLS * 0.10f / sumAx;
    float scY = ROWS * 0.10f / sumAy;
    for (uint8_t i = 0; i < N_WAVES; i++) {
      wxA[i] *= scX;
      wyA[i] *= scY;
    }

    for (uint8_t i = 0; i < MAX_P; i++) resetDot(i, true);
    lastMs = millis();
    loaded = true;
  }

  uint32_t now = millis();
  float dt = (float)(now - lastMs);
  lastMs = now;

  static float t = 0;
  t += dt * 0.001f * CAM_SPEED;

  float cx = vpX(t);
  float cy = vpY(t);

  fadeToBlackBy(leds, NUM_LEDS, 40);

  for (uint8_t i = 0; i < MAX_P; i++) {
    pz[i] -= FLY_SPEED * dt;
    if (pz[i] <= 0.005f) { resetDot(i, false); continue; }

    float ang   = pang[i] + SPIRAL * TWO_PI * (1.0f - pz[i]);
    float scale = 1.0f / pz[i];
    float r     = prad[i] * TUNNEL_R;

    float sx = cx + cosf(ang) * r * scale * COLS * 0.5f;
    float sy = cy + sinf(ang) * r * scale * ROWS * 0.5f;

    int16_t ix = (int16_t)(sx + 0.5f);
    int16_t iy = (int16_t)(sy + 0.5f);

    if (ix < 0 || ix >= COLS || iy < 0 || iy >= ROWS) {
      resetDot(i, false);
      continue;
    }

float depth = 1.0f - pz[i];

    // экранный радиус точки от центра в пиксел€х
    float screenR = sqrtf((sx - cx)*(sx - cx) + (sy - cy)*(sy - cy));

    // максимальный радиус который влезает в экран от текущего центра
    float maxR = fminf(
      fminf(cx, COLS - cx),
      fminf(cy, ROWS - cy)
    );

    // нормированное рассто€ние от кромки экрана: 0=центр, 1=край
    // инвертируем: точки у кра€ экрана (они же дальние по z - крупный scale) €рче
    float edgeFactor = (maxR > 0.5f) ? fminf(1.0f, screenR / maxR) : 0.0f;

    // €ркость: минимум у центра экрана (точки далеко, мелкие),
    // максимум у кра€ (точки близко, лет€т мимо нас)
    uint8_t bright = 30 + (uint8_t)(225.0f * edgeFactor);

#if COLOR_MODE
    leds[XY(ix, iy)] += CHSV(phue[i], 255, bright);
#else
    leds[XY(ix, iy)] += CHSV(0, 0, bright);
#endif
  }
}