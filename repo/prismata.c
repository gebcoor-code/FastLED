// https://editor.soulmatelights.com/gallery/1110-prismata
// video is here: https://www.youtube.com/watch?v=5UEgOOK4EUU&t=777s

struct ModeType
{
  uint8_t Brightness = 255U; // not used here
  uint8_t Speed = 30U;       // 1-255
  uint8_t Scale = 8;         // 1-100 is palette
};

//#define USE_RANDOM_SETS_IN_APP  // soulmatelights restart randomizer every time
/*// shift of randomizer
  uint8_t blablabla1 = random8();
  uint8_t blablabla2 = random8();
  uint8_t blablabla3 = random8();
  uint8_t blablabla4 = random8();
  uint8_t blablabla5 = random8();
  uint8_t blablabla6 = random8();
  uint8_t blablabla7 = random8();
  uint8_t blablabla8 = random8();
//  uint8_t blablabla9 = random8();
*/

// ROWS: number of rows
// COLS: number of columns
// N_LEDS: total number of LEDs (LED_COLS * LED_ROWS)
#define WIDTH (COLS)
#define HEIGHT (ROWS)
#define NUM_LEDS (N_LEDS)
bool loadingFlag = true;
uint8_t selectedSettings = 1;
ModeType modes[1];
uint8_t currentMode = 0;
#define EFF_MATRIX 16U

// несколько общих переменных и буферов, которые могут использоваться в любом эффекте
uint8_t hue, hue2;                                 // постепенный сдвиг оттенка или какой-нибудь другой цикличный счётчик
uint8_t deltaHue, deltaHue2;                       // ещё пара таких же, когда нужно много
uint8_t step;                                      // какой-нибудь счётчик кадров или последовательностей операций
uint8_t pcnt;                                      // какой-то счётчик какого-то прогресса
uint8_t deltaValue;                                // просто повторно используемая переменная
float speedfactor;                                 // регулятор скорости в эффектах реального времени
float emitterX, emitterY;                          // какие-то динамичные координаты
CRGB ledsbuff[NUM_LEDS];                           // копия массива leds[] целиком
#define NUM_LAYERSMAX 2
uint8_t noise3d[NUM_LAYERSMAX][WIDTH][HEIGHT];     // двухслойная маска или хранилище свойств в размер всей матрицы
uint8_t line[WIDTH];                               // свойство пикселей в размер строки матрицы
uint8_t shiftHue[HEIGHT];                          // свойство пикселей в размер столбца матрицы
uint8_t shiftValue[HEIGHT];                        // свойство пикселей в размер столбца матрицы ещё одно
uint16_t ff_x, ff_y, ff_z;                         // большие счётчики
//массивы состояния объектов, которые могут использоваться в любом эффекте
#define trackingOBJECT_MAX_COUNT                         (100U)  // максимальное количество отслеживаемых объектов (очень влияет на расход памяти)
float   trackingObjectPosX[trackingOBJECT_MAX_COUNT];
float   trackingObjectPosY[trackingOBJECT_MAX_COUNT];
float   trackingObjectSpeedX[trackingOBJECT_MAX_COUNT];
float   trackingObjectSpeedY[trackingOBJECT_MAX_COUNT];
float   trackingObjectShift[trackingOBJECT_MAX_COUNT];
uint8_t trackingObjectHue[trackingOBJECT_MAX_COUNT];
uint8_t trackingObjectState[trackingOBJECT_MAX_COUNT];
bool    trackingObjectIsShift[trackingOBJECT_MAX_COUNT];
#define enlargedOBJECT_MAX_COUNT                     (WIDTH * 2) // максимальное количество сложных отслеживаемых объектов (меньше, чем trackingOBJECT_MAX_COUNT)
uint8_t enlargedObjectNUM;                                       // используемое в эффекте количество объектов
long    enlargedObjectTime[enlargedOBJECT_MAX_COUNT];

//константы размера матрицы вычисляется только здесь и не меняется в эффектах
const uint8_t CENTER_X_MINOR =  (WIDTH / 2) -  ((WIDTH - 1) & 0x01); // центр матрицы по ИКСУ, сдвинутый в меньшую сторону, если ширина чётная
const uint8_t CENTER_Y_MINOR = (HEIGHT / 2) - ((HEIGHT - 1) & 0x01); // центр матрицы по ИГРЕКУ, сдвинутый в меньшую сторону, если высота чётная
const uint8_t CENTER_X_MAJOR =   WIDTH / 2  + (WIDTH % 2);           // центр матрицы по ИКСУ, сдвинутый в большую сторону, если ширина чётная
const uint8_t CENTER_Y_MAJOR =  HEIGHT / 2  + (HEIGHT % 2);          // центр матрицы по ИГРЕКУ, сдвинутый в большую сторону, если высота чётная

// стандартные функции библиотеки LEDraw от @Palpalych (для адаптаций его эффектов)
void blurScreen(fract8 blur_amount, CRGB *LEDarray = leds)
{
  blur2d(LEDarray, WIDTH, HEIGHT, blur_amount);
}

void dimAll(uint8_t value, CRGB *LEDarray = leds) {
  //for (uint16_t i = 0; i < NUM_LEDS; i++) {
  //  leds[i].nscale8(value); //fadeToBlackBy
  //}
  // теперь короткий вариант
  nscale8(LEDarray, NUM_LEDS, value);
  //fadeToBlackBy(LEDarray, NUM_LEDS, 255U - value); // эквивалент  
}

// функция получения цвета пикселя по его номеру
uint32_t getPixColor(uint32_t thisSegm)
{
  uint32_t thisPixel = thisSegm;// * SEGMENTS;
  if (thisPixel > NUM_LEDS - 1) return 0;
  return (((uint32_t)leds[thisPixel].r << 16) | ((uint32_t)leds[thisPixel].g << 8 ) | (uint32_t)leds[thisPixel].b); // а почему не просто return (leds[thisPixel])?
}

// функция получения цвета пикселя в матрице по его координатам
uint32_t getPixColorXY(uint8_t x, uint8_t y)
{
  return getPixColor(XY(x, y));
}

// функция отрисовки точки по координатам X Y
void drawPixelXY(int8_t x, int8_t y, CRGB color)
{
  if (x < 0 || x > (WIDTH - 1) || y < 0 || y > (HEIGHT - 1)) return;
  uint32_t thisPixel = XY((uint8_t)x, (uint8_t)y);// * SEGMENTS;
  //for (uint8_t i = 0; i < SEGMENTS; i++)
  //{
    leds[thisPixel] = color;
  //}
}

//по мотивам
//https://gist.github.com/sutaburosu/32a203c2efa2bb584f4b846a91066583
void drawPixelXYF(float x, float y, CRGB color) //, uint8_t darklevel = 0U)
{
//  if (x<0 || y<0) return; //не похоже, чтобы отрицательные значения хоть как-нибудь учитывались тут // зато с этой строчкой пропадает нижний ряд
  // extract the fractional parts and derive their inverses
  uint8_t xx = (x - (int)x) * 255, yy = (y - (int)y) * 255, ix = 255 - xx, iy = 255 - yy;
  // calculate the intensities for each affected pixel
  #define WU_WEIGHT(a,b) ((uint8_t) (((a)*(b)+(a)+(b))>>8))
  uint8_t wu[4] = {WU_WEIGHT(ix, iy), WU_WEIGHT(xx, iy),
                   WU_WEIGHT(ix, yy), WU_WEIGHT(xx, yy)};
  // multiply the intensities by the colour, and saturating-add them to the pixels
  for (uint8_t i = 0; i < 4; i++) {
    int16_t xn = x + (i & 1), yn = y + ((i >> 1) & 1);
    CRGB clr = getPixColorXY(xn, yn);
    clr.r = qadd8(clr.r, (color.r * wu[i]) >> 8);
    clr.g = qadd8(clr.g, (color.g * wu[i]) >> 8);
    clr.b = qadd8(clr.b, (color.b * wu[i]) >> 8);
//if (darklevel) drawPixelXY(xn, yn, makeDarker(clr, darklevel));
//else
    drawPixelXY(xn, yn, clr);
  }
}

// палитра для типа реалистичного водопада (если ползунок Масштаб выставить на 100)
extern const TProgmemRGBPalette16 WaterfallColors_p FL_PROGMEM = {0x000000, 0x060707, 0x101110, 0x151717, 0x1C1D22, 0x242A28, 0x363B3A, 0x313634, 0x505552, 0x6B6C70, 0x98A4A1, 0xC1C2C1, 0xCACECF, 0xCDDEDD, 0xDEDFE0, 0xB2BAB9};

// добавлено изменение текущей палитры (используется во многих эффектах ниже для бегунка Масштаб)
const TProgmemRGBPalette16 *palette_arr[] = {
    &PartyColors_p,
    &OceanColors_p, 
    &LavaColors_p, 
    &HeatColors_p, 
    &WaterfallColors_p, 
    &CloudColors_p, 
    &ForestColors_p, 
    &RainbowColors_p, 
    &RainbowStripeColors_p};
const TProgmemRGBPalette16 *curPalette = palette_arr[0];
void setCurrentPalette(){
      if (modes[currentMode].Scale > 100U) modes[currentMode].Scale = 100U; // чтобы не было проблем при прошивке без очистки памяти
      curPalette = palette_arr[(uint8_t)(modes[currentMode].Scale/100.0F*((sizeof(palette_arr)/sizeof(TProgmemRGBPalette16 *))-0.01F))];
}
// при таком количестве палитр (9шт) каждый диапазон Масштаба (от 1 до 100) можно разбить на участки по 11 значений
// значения от 0 до 10 = ((modes[currentMode].Scale - 1U) % 11U)
// значения от 1 до 11 = ((modes[currentMode].Scale - 1U) % 11U + 1U)
// а 100е значение Масштаба можно использовать для белого цвета


// дополнительные палитры для пламени
// для записи в PROGMEM преобразовывал из 4 цветов в 16 на сайте https://colordesigner.io/gradient-generator, но не уверен, что это эквивалент CRGBPalette16()
// значения цветовых констант тут: https://github.com/FastLED/FastLED/wiki/Pixel-reference
extern const TProgmemRGBPalette16 WoodFireColors_p FL_PROGMEM = {CRGB::Black, 0x330e00, 0x661c00, 0x992900, 0xcc3700, CRGB::OrangeRed, 0xff5800, 0xff6b00, 0xff7f00, 0xff9200, CRGB::Orange, 0xffaf00, 0xffb900, 0xffc300, 0xffcd00, CRGB::Gold};             //* Orange
extern const TProgmemRGBPalette16 NormalFire_p FL_PROGMEM = {CRGB::Black, 0x330000, 0x660000, 0x990000, 0xcc0000, CRGB::Red, 0xff0c00, 0xff1800, 0xff2400, 0xff3000, 0xff3c00, 0xff4800, 0xff5400, 0xff6000, 0xff6c00, 0xff7800};                             // пытаюсь сделать что-то более приличное
extern const TProgmemRGBPalette16 NormalFire2_p FL_PROGMEM = {CRGB::Black, 0x560000, 0x6b0000, 0x820000, 0x9a0011, CRGB::FireBrick, 0xc22520, 0xd12a1c, 0xe12f17, 0xf0350f, 0xff3c00, 0xff6400, 0xff8300, 0xffa000, 0xffba00, 0xffd400};                      // пытаюсь сделать что-то более приличное
extern const TProgmemRGBPalette16 LithiumFireColors_p FL_PROGMEM = {CRGB::Black, 0x240707, 0x470e0e, 0x6b1414, 0x8e1b1b, CRGB::FireBrick, 0xc14244, 0xd16166, 0xe08187, 0xf0a0a9, CRGB::Pink, 0xff9ec0, 0xff7bb5, 0xff59a9, 0xff369e, CRGB::DeepPink};        //* Red
extern const TProgmemRGBPalette16 SodiumFireColors_p FL_PROGMEM = {CRGB::Black, 0x332100, 0x664200, 0x996300, 0xcc8400, CRGB::Orange, 0xffaf00, 0xffb900, 0xffc300, 0xffcd00, CRGB::Gold, 0xf8cd06, 0xf0c30d, 0xe9b913, 0xe1af1a, CRGB::Goldenrod};           //* Yellow
extern const TProgmemRGBPalette16 CopperFireColors_p FL_PROGMEM = {CRGB::Black, 0x001a00, 0x003300, 0x004d00, 0x006600, CRGB::Green, 0x239909, 0x45b313, 0x68cc1c, 0x8ae626, CRGB::GreenYellow, 0x94f530, 0x7ceb30, 0x63e131, 0x4bd731, CRGB::LimeGreen};     //* Green
extern const TProgmemRGBPalette16 AlcoholFireColors_p FL_PROGMEM = {CRGB::Black, 0x000033, 0x000066, 0x000099, 0x0000cc, CRGB::Blue, 0x0026ff, 0x004cff, 0x0073ff, 0x0099ff, CRGB::DeepSkyBlue, 0x1bc2fe, 0x36c5fd, 0x51c8fc, 0x6ccbfb, CRGB::LightSkyBlue};  //* Blue
extern const TProgmemRGBPalette16 RubidiumFireColors_p FL_PROGMEM = {CRGB::Black, 0x0f001a, 0x1e0034, 0x2d004e, 0x3c0068, CRGB::Indigo, CRGB::Indigo, CRGB::Indigo, CRGB::Indigo, CRGB::Indigo, CRGB::Indigo, 0x3c0084, 0x2d0086, 0x1e0087, 0x0f0089, CRGB::DarkBlue};        //* Indigo
extern const TProgmemRGBPalette16 PotassiumFireColors_p FL_PROGMEM = {CRGB::Black, 0x0f001a, 0x1e0034, 0x2d004e, 0x3c0068, CRGB::Indigo, 0x591694, 0x682da6, 0x7643b7, 0x855ac9, CRGB::MediumPurple, 0xa95ecd, 0xbe4bbe, 0xd439b0, 0xe926a1, CRGB::DeepPink}; //* Violet
const TProgmemRGBPalette16 *firePalettes[] = {
//    &HeatColors_p, // эта палитра уже есть в основном наборе. если в эффекте подключены оба набора палитр, тогда копия не нужна
    &WoodFireColors_p,
    &NormalFire_p,
    &NormalFire2_p,
    &LithiumFireColors_p,
    &SodiumFireColors_p,
    &CopperFireColors_p,
    &AlcoholFireColors_p,
    &RubidiumFireColors_p,
    &PotassiumFireColors_p};


uint8_t myScale8(uint8_t x) { // даёт масштабировать каждые 8 градаций (от 0 до 7) бегунка Масштаб в значения от 0 до 255 по типа синусоиде
  uint8_t x8 = x % 8U;
  uint8_t x4 = x8 % 4U;
  if (x4 == 0U)
    if (x8 == 0U)       return 0U;
    else                return 255U;
  else if (x8 < 4U)     return (1U   + x4 * 72U); // всего 7шт по 36U + 3U лишних = 255U (чтобы восхождение по синусоиде не было зеркально спуску)
//else
                        return (253U - x4 * 72U); // 253U = 255U - 2U
}
#if defined(USE_RANDOM_SETS_IN_APP) || defined(RANDOM_SETTINGS_IN_CYCLE_MODE)
void setModeSettings(uint8_t Scale = 0U, uint8_t Speed = 0U){
  modes[currentMode].Scale = Scale;
  modes[currentMode].Speed = Speed;
  selectedSettings = 0U;
  #ifdef USE_BLYNK
    updateRemoteBlynkParams();
  #endif
}
#endif //#if defined(USE_RANDOM_SETS_IN_APP) || defined(RANDOM_SETTINGS_IN_CYCLE_MODE)




// ============= ЭФФЕКТ ПРИЗМАТА ===============
// Prismata Loading Animation
// https://github.com/pixelmatix/aurora/blob/master/PatternPendulumWave.h
// Адаптация от (c) SottNick

//void PrismataRoutine() {
void draw() {
  if (loadingFlag)
  {
    loadingFlag = false;
    #if defined(USE_RANDOM_SETS_IN_APP) || defined(RANDOM_SETTINGS_IN_CYCLE_MODE)
      if (selectedSettings){
        setModeSettings(1U+random8(100U), 35U+random8(100U));
      }
    #endif //#if defined(USE_RANDOM_SETS_IN_APP) || defined(RANDOM_SETTINGS_IN_CYCLE_MODE)

    setCurrentPalette();

  } 
  
//  EVERY_N_MILLIS(33) { маловата задержочка
    hue++; // используем переменную сдвига оттенка из функций радуги, чтобы не занимать память
//  }
  blurScreen(20); // @Palpalych посоветовал делать размытие
  dimAll(255U - (modes[currentMode].Scale - 1U) % 11U * 3U);

  for (uint8_t x = 0; x < WIDTH; x++)
  {
    //uint8_t y = beatsin8(x + 1, 0, HEIGHT-1); // это я попытался распотрошить данную функцию до исходного кода и вставить в неё регулятор скорости
    // вместо 28 в оригинале было 280, умножения на .Speed не было, а вместо >>17 было (<<8)>>24. короче, оригинальная скорость достигается при бегунке .Speed=20
    uint8_t beat = (GET_MILLIS() * (accum88(x + 1)) * 28 * modes[currentMode].Speed) >> 17;
    uint8_t y = scale8(sin8(beat), HEIGHT-1);
    //и получилось!!!
    
    drawPixelXY(x, y, ColorFromPalette(*curPalette, x * 7 + hue));
  }
}