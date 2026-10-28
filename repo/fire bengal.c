//https://editor.soulmatelights.com/gallery/576-bengal-fire
//// -----------------------------  Bengal Fire(Particle sys) ------------------------------
//(c)stepko
//07.02.21
#define WIDTH LED_COLS
#define HEIGHT LED_ROWS

#define SPARKS_AM WIDTH + HEIGHT
#define GenPosVar 0
float FADE_KOEF = .5;
float SpeedK = .98;
float SpeedDecX = .01;
float SpeedDecY = 0;
#define Bounce 0
#define GravityX 0
#define GravityY 1

int sparksPos[2][SPARKS_AM];
float sparksSpeed[2][SPARKS_AM];
float sparksFade[SPARKS_AM];
float sparksSat[SPARKS_AM];
byte sparksColor[SPARKS_AM];

int genPos[2];
int gravityPos[2];
static byte period = 10;
bool run = true;

bool loadingFlag = true;
void reg(byte id) {
  sparksPos[0][id] = genPos[0];
  sparksPos[1][id] = genPos[1];
  sparksSpeed[0][id] = random(-10, 10);
  sparksSpeed[1][id] = random(-5, 20);
  sparksSat[id] = 10;
  sparksFade[id] = 255;
  sparksColor[id] = random();
}

void phisics(byte id) {
  if (SpeedK) {
    if (GravityX) {
      if (gravityPos[0] < sparksPos[0][id])
        sparksSpeed[0][id] -= SpeedK;
      else
        sparksSpeed[0][id] += SpeedK;
    }
    if (GravityY) {
      if (gravityPos[1] < sparksPos[1][id])
        sparksSpeed[1][id] -= SpeedK;
      else
        sparksSpeed[1][id] += SpeedK;
    }
  }
  sparksFade[id] -= (255. / (float)((HEIGHT + WIDTH) * FADE_KOEF));
  sparksSat[id] += (255. / (float)((WIDTH + WIDTH) * (FADE_KOEF - 0.2)));
  if (SpeedDecX || sparksSpeed[0][id]) {
    if (sparksSpeed[0][id] > 0)
      sparksSpeed[0][id] -= SpeedDecX;
    else
      sparksSpeed[0][id] += SpeedDecX;
    if (abs(sparksSpeed[0][id]) <= SpeedDecX)
      sparksSpeed[0][id] = 0;
  }
  if (SpeedDecY || sparksSpeed[1][id]) {
    if (sparksSpeed[1][id] > 0)
      sparksSpeed[1][id] -= SpeedDecY;
    else
      sparksSpeed[1][id] += SpeedDecY;
    if (abs(sparksSpeed[1][id]) <= SpeedDecY)
      sparksSpeed[1][id] = 0;
  }
  if (Bounce) { if (sparksPos[0][id] < 0 || sparksPos[0][id] >= WIDTH * 10) sparksSpeed[0][id] = -sparksSpeed[0][id]; if (sparksPos[1][id] < 0) sparksSpeed[1][id] = -sparksSpeed[1][id]; }
    sparksPos[0][id] += sparksSpeed[0][id];
    sparksPos[1][id] += sparksSpeed[1][id];
}

void wu_pixel(uint32_t x, uint32_t y, CRGB * col) { //awesome wu_pixel procedure by reddit u/sutaburosu
  // extract the fractional parts and derive their inverses
  uint8_t xx = x & 0xff, yy = y & 0xff, ix = 255 - xx, iy = 255 - yy;
  // calculate the intensities for each affected pixel
  #define WU_WEIGHT(a, b)((uint8_t)(((a) * (b) + (a) + (b)) >> 8))
  uint8_t wu[4] = {
    WU_WEIGHT(ix, iy),
    WU_WEIGHT(xx, iy),
    WU_WEIGHT(ix, yy),
    WU_WEIGHT(xx, yy)
  };
  // multiply the intensities by the colour, and saturating-add them to the pixels
  for (uint8_t i = 0; i < 4; i++) {
    uint16_t xy = XY((x >> 8) + (i & 1), (y >> 8) + ((i >> 1) & 1));
    leds[xy].r = qadd8(leds[xy].r, col -> r * wu[i] >> 8);
    leds[xy].g = qadd8(leds[xy].g, col -> g * wu[i] >> 8);
    leds[xy].b = qadd8(leds[xy].b, col -> b * wu[i] >> 8);
  }
}

void render(byte id, CRGB Col) {
  if (loadingFlag) {
    for (byte i = 0; i < SPARKS_AM; i++) {
      reg(i);
      for (byte a = 0; a < i; a++) {
        phisics(a);
      }
    }
    loadingFlag = false;
  }
  phisics(id);
  if (sparksPos[1][id] < ((HEIGHT - 1) * 10) and sparksPos[1][id] >= 0)
    if (sparksPos[0][id] < ((WIDTH - 1) * 10) and sparksPos[0][id] >= 0) {
      CRGB color = Col;
      wu_pixel(sparksPos[0][id] * 25.6, sparksPos[1][id] * 25.6, & color);
    }
}

void setGenPos(int x, int y) {
  genPos[0] = x;
  genPos[1] = y;
}

void setGravityPos(int x, int y) {
  gravityPos[0] = x;
  gravityPos[1] = y;
}

void setRegenRule(byte id, bool b) {
  if (b) reg(id);
}

void draw() {
  fadeToBlackBy(leds, NUM_LEDS, beatsin8(5, 20, 100));
  if(GenPosVar){
  setGenPos(beatsin16(10, 0, WIDTH * 10), beatsin16(10, 0, HEIGHT * 10, 0, 16384));}
  else{ setGenPos(WIDTH * 5, HEIGHT * 5);}
  setGravityPos(0, 0);
  for (byte i = 0; i < SPARKS_AM; i++) {
    setRegenRule(i,(sparksPos[0][i] <= 0 || sparksPos[0][i] >= (WIDTH - 1) * 10 || sparksPos[1][i] < 0) ? 1 : 0);
    render(i, CHSV(sparksColor[i], constrain(sparksSat[i], 5, 255), constrain(sparksFade[i], 32, 255)));
      EVERY_N_SECONDS(period) {
    for (byte i = 0; i < SPARKS_AM; i++) reg(i);
    period = random(10, 60);
  }
  }
  delay(16);
}