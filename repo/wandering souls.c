//https://editor.soulmatelights.com/gallery/503-wandering-souls
// Matrix size
#define WIDTH LED_COLS
#define HEIGHT LED_ROWS

//// ----------------------------- Wandering souls ------------------------------
//(c)stepko
//There are a lot of settings
//23.10.20
//https://wokwi.com/arduino/projects/287680625593287181
//--Settings------
#define Speed 255
#define Scale 8
#define Run 2 // 0-AllIn1Direction/1-beatsin/2-linear/3-circular
#define lamp 0
#define trace 1 //0-None/1-DimAll/2-Blur2D/3-wings(for Lamp)
#define reseting 10 //reset time in seconds, 0-off
#define subPixel 1 //
#define broad 0 //
//---------------
#define LIGHTERS_AM WIDTH + HEIGHT
struct{
int16_t PosX;
int16_t PosY;
uint16_t SpeedX;
uint16_t SpeedY;
byte SpeedZ;
byte Color;
byte Mass;
} lighter[LIGHTERS_AM];
bool loadingFlag = true;

void wu_pixel(uint32_t x, uint32_t y, CRGB * col) {      //awesome wu_pixel procedure by reddit u/sutaburosu
  // extract the fractional parts and derive their inverses
  uint8_t xx = x & 0xff, yy = y & 0xff, ix = 255 - xx, iy = 255 - yy;
  // calculate the intensities for each affected pixel
  #define WU_WEIGHT(a,b) ((uint8_t) (((a)*(b)+(a)+(b))>>8))
  uint8_t wu[4] = {WU_WEIGHT(ix, iy), WU_WEIGHT(xx, iy),
                   WU_WEIGHT(ix, yy), WU_WEIGHT(xx, yy)};
  // multiply the intensities by the colour, and saturating-add them to the pixels
  for (uint8_t i = 0; i < 4; i++) {
    uint16_t xy = XY((x >> 8) + (i & 1), (y >> 8) + ((i >> 1) & 1));
    leds[xy].r = qadd8(leds[xy].r, col->r * wu[i] >> 8);
    leds[xy].g = qadd8(leds[xy].g, col->g * wu[i] >> 8);
    leds[xy].b = qadd8(leds[xy].b, col->b * wu[i] >> 8);
  }
}

void draw() {
  if (loadingFlag) {
    loadingFlag = false;
    randomSeed(millis());
    for (byte i = 0; i < LIGHTERS_AM; i++) {
      if (Run == 2) {
        lighter[i].SpeedX = random(-10, 10);
        lighter[i].SpeedY = random(-10, 10);
      } else if (Run == 3) {
        lighter[i].SpeedX = random(-10, 10); //angle speed
        lighter[i].SpeedY = random(0, 360); //angle
        lighter[i].Mass = random(5, 10); //vspeed
      } else {
        lighter[i].SpeedX = random(3, 25);
        lighter[i].SpeedY = random(3, 25);
        lighter[i].Mass = random(15, 100);
      }
      lighter[i].SpeedZ = random(3, 25);
      lighter[i].PosX = random(0, WIDTH * 10);
      lighter[i].PosY = random(0, HEIGHT * 10);
      lighter[i].Color = random(0, 9) * 28;
    }
  }
  switch (trace) {
    case 0:
      FastLED.clear();
      break;
    case 1:
      fadeToBlackBy(leds, NUM_LEDS, 50);
      break;
    case 3:
      fadeToBlackBy(leds, NUM_LEDS, 200);
      break;
  }
  
  for (byte i = 0; i < map(Scale, 1, 16, 2, LIGHTERS_AM); i++) {
    lighter[i].Color++;
    switch (Run) {
      case 0:
        lighter[i].PosX += beatsin8(lighter[0].SpeedX * Speed, 0, lighter[i].Mass / 10 * ((HEIGHT + WIDTH) / 8)) - lighter[i].Mass / 10 * ((HEIGHT + WIDTH) / 16);
        lighter[i].PosY += beatsin8(lighter[0].SpeedY * Speed, 0, lighter[i].Mass / 10 * ((HEIGHT + WIDTH) / 8)) - lighter[i].Mass / 10 * ((HEIGHT + WIDTH) / 16);
        break;
      case 1:
        if (broad) {
          lighter[i].PosX = beatsin16(lighter[i].SpeedX / map(Speed, 1, 255, 10, 1), 0, (WIDTH - 1) * 10);
          lighter[i].PosY = beatsin16(lighter[i].SpeedY / map(Speed, 1, 255, 10, 1), 0, (HEIGHT - 1) * 10);
        } else {
          lighter[i].PosX += beatsin16(lighter[i].SpeedX / map(Speed, 1, 255, 10, 1), 0, lighter[i].Mass / 10 * ((HEIGHT + WIDTH) / 8)) - lighter[i].Mass / 10 * ((HEIGHT + WIDTH) / 16);
          lighter[i].PosY += beatsin16(lighter[i].SpeedY / map(Speed, 1, 255, 10, 1), 0, lighter[i].Mass / 10 * ((HEIGHT + WIDTH) / 8)) - lighter[i].Mass / 10 * ((HEIGHT + WIDTH) / 16);
        }
        break;
      case 2:
        lighter[i].PosX += lighter[i].SpeedX / map(Speed, 1, 255, 10, 1);
        lighter[i].PosY += lighter[i].SpeedY / map(Speed, 1, 255, 10, 1);
        break;
      case 3:
        lighter[i].PosX += lighter[i].Mass * cos(radians(lighter[i].SpeedY)) / map(Speed, 1, 255, 10, 1);
        lighter[i].PosY += lighter[i].Mass * sin(radians(lighter[i].SpeedY)) / map(Speed, 1, 255, 10, 1);
        lighter[i].SpeedY += lighter[i].SpeedX / map(Speed, 1, 255, 20, 2);
        break;
    }
    if (broad) {
      if (Run == 3) {
        if (lighter[i].PosY < 0) {
          lighter[i].PosY = 1;
          lighter[i].SpeedY = 360 - lighter[i].SpeedY;
        }
        if (lighter[i].PosX < 0) {
          lighter[i].PosY = 1;
          lighter[i].SpeedY = 180 - lighter[i].SpeedY;
        }
        if (lighter[i].PosY >= (HEIGHT - 1) * 10) {
          lighter[i].PosY = ((HEIGHT - 1) * 10) - 1;
          lighter[i].SpeedY = 360 - lighter[i].SpeedY;
        }
        if (lighter[i].PosX >= (WIDTH - 1) * 10) {
          lighter[i].PosX = ((WIDTH - 1) * 10) - 1;
          lighter[i].SpeedY = 180 - lighter[i].SpeedY;
        }
      } else if (Run == 1) {} else {
        if ((lighter[i].PosX <= 0) || (lighter[i].PosX >= (WIDTH - 1) * 10)) lighter[i].SpeedX = -lighter[i].SpeedX;
        if ((lighter[i].PosY <= 0) || (lighter[i].PosY >= (HEIGHT - 1) * 10)) lighter[i].SpeedY = -lighter[i].SpeedY;
      }
    } else {
      if (lighter[i].PosX < 0) lighter[i].PosX = (WIDTH - 1) * 10;
      if (lighter[i].PosX > (WIDTH - 1) * 10) lighter[i].PosX = 0;
      if (lighter[i].PosY < 0) lighter[i].PosY = (HEIGHT - 1) * 10;
      if (lighter[i].PosY > (HEIGHT - 1) * 10) lighter[i].PosY = 0;
    }
    CRGB color = CHSV((lamp) ? 0 : lighter[i].Color, 255, (trace == 3) ? 128 + random8(2) * 111 : beatsin8(lighter[i].SpeedZ / map(Speed, 1, 255, 10, 1), 128, 255));
    if (subPixel)
      wu_pixel(lighter[i].PosX * 25.6, lighter[i].PosY * 25.6, &color);
    else
      leds[XY(lighter[i].PosX / 10, lighter[i].PosY / 10)] += color;
  }
  if(lamp){
  for(int i=0; i < NUM_LEDS; i++){
    leds[i]=CHSV(50,10,255-leds[i].r);
  }}
  if (reseting > 0) {
    EVERY_N_SECONDS(reseting) {
      randomSeed(millis());
      for (byte i = 0; i < map(Scale, 1, 16, 2, LIGHTERS_AM); i++) {
        if (Run == 2) {
          lighter[i].SpeedX = random(-10, 10);
          lighter[i].SpeedY = random(-10, 10);
        } else if (Run == 3) {
          lighter[i].SpeedX = random(-10, 10);
          lighter[i].SpeedY = random(0, 360);
          lighter[i].Mass = random(5, 10);
        } else {
          lighter[i].SpeedX = random(3, 25);
          lighter[i].SpeedY = random(3, 25);
        }
        lighter[i].SpeedZ = random(3, 25);
        lighter[i].Mass + random(-25, 25);
      }
    }
  }
  if(trace == 2){
    blur2d(leds, LED_COLS, LED_ROWS, 64);
  }
  delay(16);
}