//new 3d-scrolling string, partly based on Gyver's getFont and Font-array
//17.01.26, coor@
//upd: fixed bitmap font vectorization artifacts
//upd: fixed for dW>9
//upd: fixed some hex-symbols like '2,3,4,M,V'. They have some difficulties to vectorize pixel combinations,forming angles. It was easier to fix bitmaps to avoid these angles.
//upd: JavaScript fork: https://kodomo.fbb.msu.ru/~dudka2007/term2/files/scr.html
//upd: Й fix
const uint8_t fontHEX[][5] PROGMEM = {
  {0x00, 0x00, 0x00, 0x00, 0x00}, //   0x20 32
  {0x00, 0x00, 0x6f, 0x00, 0x00}, // ! 0x21 33
  {0x00, 0x07, 0x00, 0x07, 0x00}, // " 0x22 34
  {0x14, 0x7f, 0x14, 0x7f, 0x14}, // # 0x23 35
  {0x00, 0x07, 0x04, 0x1e, 0x00}, // $ 0x24 36
  {0x23, 0x13, 0x08, 0x64, 0x62}, // % 0x25 37
  {0x36, 0x49, 0x56, 0x20, 0x50}, // & 0x26 38
  {0x00, 0x00, 0x07, 0x00, 0x00}, // ' 0x27 39
  {0x00, 0x1c, 0x22, 0x41, 0x00}, // ( 0x28 40
  {0x00, 0x41, 0x22, 0x1c, 0x00}, // ) 0x29 41
  {0x14, 0x08, 0x3e, 0x08, 0x14}, // * 0x2a 42
  {0x08, 0x08, 0x3e, 0x08, 0x08}, // + 0x2b 43
  {0x00, 0x50, 0x30, 0x00, 0x00}, // , 0x2c 44
  {0x08, 0x08, 0x08, 0x08, 0x08}, // - 0x2d 45
  {0x00, 0x60, 0x60, 0x00, 0x00}, // . 0x2e 46
  {0x20, 0x10, 0x08, 0x04, 0x02}, // / 0x2f 47
  {0x3e, 0x51, 0x49, 0x45, 0x3e}, // 0 0x30 48
  {0x00, 0x42, 0x7f, 0x40, 0x00}, // 1 0x31 49
  {0x62, 0x51, 0x51, 0x49, 0x46}, // 2 0x32 50+
  {0x21, 0x41, 0x45, 0x4b, 0x30}, // 3 0x33 51+
  {0x18, 0x17, 0x10, 0x7f, 0x10}, // 4 0x34 52+
  {0x27, 0x45, 0x45, 0x45, 0x39}, // 5 0x35 53
  {0x3c, 0x4a, 0x49, 0x49, 0x30}, // 6 0x36 54
  {0x01, 0x71, 0x09, 0x05, 0x03}, // 7 0x37 55
  {0x36, 0x49, 0x49, 0x49, 0x36}, // 8 0x38 56
  {0x06, 0x49, 0x49, 0x29, 0x1e}, // 9 0x39 57
  {0x00, 0x36, 0x36, 0x00, 0x00}, // : 0x3a 58
  {0x00, 0x56, 0x36, 0x00, 0x00}, // ; 0x3b 59
  {0x08, 0x14, 0x22, 0x41, 0x00}, // < 0x3c 60
  {0x14, 0x14, 0x14, 0x14, 0x14}, // = 0x3d 61
  {0x00, 0x41, 0x22, 0x14, 0x08}, // > 0x3e 62
  {0x02, 0x01, 0x51, 0x09, 0x06}, // ? 0x3f 63
  {0x3e, 0x41, 0x5d, 0x49, 0x4e}, // @ 0x40 64
  {0x7e, 0x09, 0x09, 0x09, 0x7e}, // A 0x41 65
  {0x7f, 0x49, 0x49, 0x49, 0x36}, // B 0x42 66
  {0x3e, 0x41, 0x41, 0x41, 0x22}, // C 0x43 67
  {0x7f, 0x41, 0x41, 0x41, 0x3e}, // D 0x44 68
  {0x7f, 0x49, 0x49, 0x49, 0x41}, // E 0x45 69
  {0x7f, 0x09, 0x09, 0x09, 0x01}, // F 0x46 70
  {0x3e, 0x41, 0x49, 0x49, 0x7a}, // G 0x47 71
  {0x7f, 0x08, 0x08, 0x08, 0x7f}, // H 0x48 72
  {0x00, 0x41, 0x7f, 0x41, 0x00}, // I 0x49 73
  {0x20, 0x40, 0x41, 0x3f, 0x01}, // J 0x4a 74
  {0x7f, 0x08, 0x14, 0x22, 0x41}, // K 0x4b 75
  {0x7f, 0x40, 0x40, 0x40, 0x40}, // L 0x4c 76
  {0x7f, 0x01, 0x1e, 0x01, 0x7f}, // M 0x4d 77+
  {0x7f, 0x04, 0x08, 0x10, 0x7f}, // N 0x4e 78
  {0x3e, 0x41, 0x41, 0x41, 0x3e}, // O 0x4f 79
  {0x7f, 0x09, 0x09, 0x09, 0x06}, // P 0x50 80
  {0x3e, 0x41, 0x51, 0x21, 0x5e}, // Q 0x51 81
  {0x7f, 0x09, 0x19, 0x29, 0x46}, // R 0x52 82
  {0x46, 0x49, 0x49, 0x49, 0x31}, // S 0x53 83
  {0x01, 0x01, 0x7f, 0x01, 0x01}, // T 0x54 84
  {0x3f, 0x40, 0x40, 0x40, 0x3f}, // U 0x55 85
  {0x1f, 0x20, 0x40, 0x20, 0x1f}, // V 0x56 86+
  {0x3f, 0x40, 0x30, 0x40, 0x3f}, // W 0x57 87
  {0x63, 0x14, 0x08, 0x14, 0x63}, // X 0x58 88
  {0x07, 0x08, 0x70, 0x08, 0x07}, // Y 0x59 89
  {0x61, 0x51, 0x49, 0x45, 0x43}, // Z 0x5a 90
  {0x3c, 0x4a, 0x49, 0x29, 0x1e}, // [ 0x5b 91
  {0x02, 0x04, 0x08, 0x10, 0x20}, // \ 0x5c 92
  {0x00, 0x41, 0x7f, 0x00, 0x00}, // ] 0x5d 93
  {0x04, 0x02, 0x01, 0x02, 0x04}, // ^ 0x5e 94
  {0x40, 0x40, 0x40, 0x40, 0x40}, // _ 0x5f 95
  {0x00, 0x00, 0x03, 0x04, 0x00}, // ` 0x60 96

  {0x7e, 0x09, 0x09, 0x09, 0x7e}, // А 192
  {0x7F, 0x49, 0x49, 0x49, 0x71}, // Б
  {0x7f, 0x49, 0x49, 0x49, 0x36}, // В
  {0x7F, 0x01, 0x01, 0x01, 0x01}, // Г
  {0x60, 0x3E, 0x21, 0x3F, 0x60}, // Д
  {0x7f, 0x49, 0x49, 0x49, 0x41}, // Е
  {0x77, 0x08, 0x7F, 0x08, 0x77}, // Ж+
  {0x22, 0x41, 0x49, 0x49, 0x36}, // З+
  {0x7F, 0x20, 0x10, 0x08, 0x7F}, // И
  {0x7F, 0x20, 0x13, 0x08, 0x7F}, // Й
  {0x7f, 0x08, 0x14, 0x22, 0x41}, // К
  {0x40, 0x3E, 0x01, 0x01, 0x7F}, // Л+
  {0x7f, 0x01, 0x1e, 0x01, 0x7f}, // М+
  {0x7f, 0x08, 0x08, 0x08, 0x7f}, // Н
  {0x3e, 0x41, 0x41, 0x41, 0x3e}, // О
  {0x7F, 0x01, 0x01, 0x01, 0x7F}, // П
  {0x7f, 0x09, 0x09, 0x09, 0x06}, // Р
  {0x3e, 0x41, 0x41, 0x41, 0x22}, // С
  {0x01, 0x01, 0x7f, 0x01, 0x01}, // Т
  {0x07, 0x48, 0x48, 0x48, 0x7F}, // У
  {0x1C, 0x22, 0x7F, 0x22, 0x1C}, // Ф
  {0x63, 0x14, 0x08, 0x14, 0x63}, // Х
  {0x7F, 0x40, 0x40, 0x7F, 0xC0}, // Ц
  {0x07, 0x08, 0x08, 0x08, 0x7F}, // Ч
  {0x7F, 0x40, 0x7F, 0x40, 0x7F}, // Ш
  {0x7F, 0x40, 0x7F, 0x40, 0xFF}, // Щ
  {0x01, 0x7F, 0x48, 0x48, 0x70}, // Ъ
  {0x7F, 0x48, 0x70, 0x00, 0x7F}, // Ы
  {0x00, 0x7F, 0x48, 0x48, 0x70}, // Ь
  {0x22, 0x41, 0x49, 0x49, 0x3E}, // Э
  {0x7F, 0x08, 0x3E, 0x41, 0x3E}, // Ю
  {0x46, 0x29, 0x19, 0x09, 0x7F}, // Я 223
};

bool loadingFlag = true;

#define WIDTH COLS
#define HEIGHT ROWS
#define rotAngle 15

//string vars
#define LET_WIDTH 5       // ширина буквы шрифта
#define dW 9     // ширина окна, pt
#define dH 8    // высота окна, pt
uint16_t bitSub[dH]; //битовая подложка. можно использовать uint32_t, на больших экранах
String text = "FULL-3D БЕГУЩАЯ СТРОКА. МОЖНО КРУТИТЬ ПО ОСЯМ, МАСШТАБИРОВАТЬ И НАТЯГИВАТЬ НА 3D-ПОВЕРХНОСТИ!...  "; 

uint8_t chari = 0; //текущий символ
uint8_t columni = 0;
bool needSpace = false; //так реализовал просветы между символами.

//3D vars
#define dots dW*dH
float vectors[dots][3];

float perspective = 60.0;
int8_t deltaX, deltaY, deltaZ=2, iter = rotAngle;
float scale3D = 1.0;
float scaleDirection = 0.03;
byte dotsCount;
#define stepDirection 0.03

//boolean fullTextFlag = false; //пока без триггера окончания, потом допилю.

int8_t translateX(float x,  float z) {
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
  for (byte i = 0; i < dotsCount; i++) {
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
  for (byte i = 0; i < dotsCount; i++) {
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
  for (byte i = 0; i < dotsCount; i++) {
    float x = vectors[i][0];
    float y = vectors[i][1];
    vectors[i][0] = x * cosa - y * sina;
    vectors[i][1] = x * sina + y * cosa;
  }
}

void ScaleAndRotate_Zonly(float maxSc, float minSc) {

  if (iter == 0) {
  deltaZ *=-1;
    iter = rotAngle*2; //+-rotAngle
  }
  scale3D += scaleDirection;
  if (scale3D >= maxSc) {
    scale3D = maxSc;
    scaleDirection = -stepDirection;
  } else if (scale3D <= minSc) {
    scale3D = minSc;
    scaleDirection = stepDirection;
  }
  rotateZ(deltaZ);
  iter--;
}

uint8_t getFont(uint8_t font, uint8_t row) { //@респект to Gyver. Реально взрыв мозгов тут.
  if ((font>=0x41 && font<=0x5A) || (font>=0xC0 && font<=0xDF)) font &= 0xDF; //set just letters as a capital.
  font = font - '0' + 0x10;   // перевод код символа из таблицы ASCII в номер согласно нумерации массива
  if (font <= 0x5A) return pgm_read_byte(&(fontHEX[font][row]));     // для английских букв и символов
  else if (font >= 0x70 && font <= 0x9F) {
    return pgm_read_byte(&(fontHEX[font - 0x2F][row]));
  } else if (font >= 0x60 && font <= 0x6F) {
    return pgm_read_byte(&(fontHEX[font - 0x0F][row]));
  }
}

void setPixel(uint8_t x, uint8_t y, bool state) {
  if (x >= dW || y >= dH) return;
  if (state) bitSub[y] |= (1 << x);
  else       bitSub[y] &= ~(1 << x);
}

bool getPixel(uint8_t x, uint8_t y) {
  if (x >= dW || y >= dH) return false;
  return (bitSub[y] >> x) & 0x01;
}

void shiftDisplayLeft() {
  for (uint8_t y = 0; y < dH; y++) bitSub[y] >>= 1;
}

void updateScrollingText() {
  shiftDisplayLeft();
  
  if (needSpace) {
    for (uint8_t y = 0; y < dH; y++) bitSub[y] &= ~(1 << (dW - 1));
    needSpace = false;
    return;
  }
  
  while (chari < text.length() && (byte)text[chari] > 0xBF) chari++;
   
  if (chari >= text.length()) {
    chari = 0;
    columni = 0;
    needSpace = true;
    return;
  }
  
  uint8_t charCode = (uint8_t)text[chari];
  uint8_t columnData = getFont(charCode, columni);
  
  for (uint8_t y = 0; y < dH; y++) {
    bitSub[y] &= ~(1 << (dW - 1));
    bool pixel = (columnData >> (dH - 1 - y)) & 0x01;
    if (pixel) bitSub[y] |= (1 << (dW - 1));
  }
  
  if (++columni >= LET_WIDTH) {
    columni = 0;
    chari++;
    needSpace = true;
  }
}

void initSphereVectors(float radius) {
  uint8_t i = 0;
  
  for (uint8_t row = 0; row < dH; row++) {
    for (uint8_t col = 0; col < dW; col++) {
      //инвертируем здесь
      float u = (float)(dW - 1 - col) / (dW - 1);  // 1..0
      float v = (float)(dH - 1 - row) / (dH - 1); // 1..0
      
      //задаем умеренную кривизну, для лучшей читаемости
      float phi = u * PI * 0.9;           // 90% половины сферы (0.6 - меньше искажений)
      float theta = v * PI * 0.4;         // 40% от полюса к полюсу
      
      // Центрируем
      phi += PI * 0.1;  //0.2
      theta += PI * 0.3;
      
      vectors[i][0] = radius * sin(theta) * cos(phi);  // x
      vectors[i][1] = radius * cos(theta);             // y  
      vectors[i][2] = radius * sin(theta) * sin(phi);  // z
      
      // Минимальное масштабирование
      vectors[i][0] *= 1.25;  // X (оптимально для x=24)
      vectors[i][1] *= 0.8;  // Y (оптимально для y=12)
      
      i++;
    }
  }
}

//для проверки, прямой вывод на LED
void renderToLED() {
  for (uint8_t y = 0; y < dH; y++) {
    for (uint8_t x = 0; x < dW; x++) {
      if (getPixel(x, y)) {
        uint8_t ledX = x;
        uint8_t ledY = y;
        
        if (ledX < WIDTH && ledY < HEIGHT) {
          leds[XY(ledX, ledY)] = CRGB::Green;
        }
      }
    }
  }
}

//just white dots
void drawTextDots3D() {
  for (byte i = 0; i < dotsCount; i++) {
    uint8_t dRow = i / dW;
    uint8_t dCol = i % dW;
    //uint8_t dRow = dH - 1 - (i / dW);  // если нужно инвертировать по Y
    //uint8_t dCol = dW - 1 - (i % dW);  //  если нужно инвертировать по X
    
    if (getPixel(dCol, dRow)) {
      int8_t x = translateX(vectors[i][0], vectors[i][2]);
      int8_t y = translateY(vectors[i][1], vectors[i][2]);
      
      if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
        int idx = XY(x, y);
        leds[idx] = CRGB::White;
      }
    }
  }
}

void drawLine(int8_t x1, int8_t y1, int8_t x2, int8_t y2, CRGB color) {
  int8_t dx = abs(x2 - x1);
  int8_t dy = abs(y2 - y1);
  int8_t sx = (x1 < x2) ? 1 : -1;
  int8_t sy = (y1 < y2) ? 1 : -1;
  int8_t err = dx - dy;
  
  while (true) {
    if (x1 >= 0 && x1 < WIDTH && y1 >= 0 && y1 < HEIGHT) {
      int idx = XY(x1, y1);
      leds[idx] = color;
    }
    
    if (x1 == x2 && y1 == y2) break;
    
    int8_t e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y1 += sy;
    }
  }
}

void connectPoints(uint8_t i1, uint8_t i2) {
  int8_t x1 = translateX(vectors[i1][0], vectors[i1][2]);
  int8_t y1 = translateY(vectors[i1][1], vectors[i1][2]);
  int8_t x2 = translateX(vectors[i2][0], vectors[i2][2]);
  int8_t y2 = translateY(vectors[i2][1], vectors[i2][2]);
  drawLine(x1, y1, x2, y2, CRGB::White);
}

void drawText3DConnected() {
  // Соединяем точки, которые были соседями в исходной текстуре. 0 - право-низ, направление инкремента - вверх и влево
  for (byte i = 0; i < dotsCount; i++) {
    uint8_t dRow = i / dW;
    uint8_t dCol = i % dW;
    
    if (!getPixel(dCol, dRow)) continue;
    
    // слева
    if ((dCol < dW - 1) && getPixel(dCol + 1, dRow))
      connectPoints(i, i + 1);
    
    // сверху
    if ((dRow < dH - 1) && getPixel(dCol, dRow + 1))
      connectPoints(i, i + dW);
    
    // слева-сверху, если (x+1,y+1), но !(x,y+1) и !(x+1,y)
    if (dCol < dW - 1 && dRow < dH - 1 && getPixel(dCol + 1, dRow + 1) && !getPixel(dCol,dRow+1) && !getPixel(dCol+1,dRow))
        connectPoints(i, i + dW + 1);
    
    // справа-сверху, если (x-1,y+1), но !(x-1,y) и !(x,y+1)
    if (dCol > 0 && dRow < dH - 1 && getPixel(dCol - 1, dRow + 1) && !getPixel(dCol-1,dRow) && !getPixel(dCol,dRow+1))
        connectPoints(i, i + dW - 1);
  }
}

void draw() {

  if (loadingFlag) {
    dotsCount=dots;
    loadingFlag=false;
    initSphereVectors(5);
  }
  FastLED.clear();
  updateScrollingText();
  //drawTextDots3D();
  drawText3DConnected();
  ScaleAndRotate_Zonly(1.8, 1.1); 
 // renderToLED();
  
  FastLED.show();
  delay(30);
}