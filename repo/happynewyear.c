int hueOffset = 0;
int offset = 0;
int letterHeight = 4;
int rowHeight = 5;
int letterWidth = 5;

void draw() {

 byte cool3[][72] = { //happy new year
   {1,0,0,1,0, 0,1,1,0,0, 1,1,1,0,0, 1,1,1,0,0, 1,0,0,0,1, 0,0,0,0,0, 1,0,0,1,0, 1,1,1,1,0, 1,0,0,1,0, 0,0,0,0,0, 0,1,0,1,0, 1,1,1,1,0, 0,1,1,0,0, 1,1,1,0,0, 0,0},
   {1,1,1,1,0, 1,0,0,1,0, 1,0,0,1,0, 1,0,0,1,0, 0,1,0,1,0, 0,0,0,0,0, 1,1,0,1,0, 1,1,1,0,0, 1,0,0,1,0, 0,0,0,0,0, 0,1,0,1,0, 1,1,1,0,0, 1,0,0,1,0, 1,0,0,1,0, 0,0},
   {1,0,0,1,0, 1,1,1,1,0, 1,1,1,0,0, 1,1,1,0,0, 0,0,1,0,0, 0,0,0,0,0, 1,0,1,1,0, 1,0,0,0,0, 1,1,1,1,0, 0,0,0,0,0, 0,0,1,0,0, 1,0,0,0,0, 1,1,1,1,0, 1,1,1,0,0, 0,0},
   {1,0,0,1,0, 1,0,0,1,0, 1,0,0,0,0, 1,0,0,0,0, 0,0,1,0,0, 0,0,0,0,0, 1,0,0,1,0, 1,1,1,1,0, 0,1,1,0,0, 0,0,0,0,0, 0,0,1,0,0, 1,1,1,1,0, 1,0,0,1,0, 1,0,0,1,0, 0,0}};

  // int offset = beatsin16(5, 0, 30);
  EVERY_N_MILLISECONDS(200) {
    offset++;
  }
  int yoffset = 0; // beatsin16(6, 10, 20);

  hueOffset += 1;

  for (uint16_t x = 0; x < COLS; x++) {
    for (uint16_t y = 0; y < ROWS; y++) {
      uint16_t i = XY(x, y);
      int letterX = x + offset;
      int letterY = y + yoffset;
      byte pixel = cool3[3 - letterY % rowHeight][letterX % 72];  //72

      int brightness = pixel ? 255 : 0;

      if (letterY % rowHeight == letterHeight) brightness = 0;
      
      int hue = (x + offset) * letterWidth + (y + offset) * letterHeight;
      leds[i] = CHSV(hue + hueOffset, 255, brightness);
    }
  }
}

