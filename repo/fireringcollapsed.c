//basesed on https://editor.soulmatelights.com/gallery/1096-fire-ring
//Fire ring
//rgb led matrix demo
//Yaroslaw Turbin 12-06-2021
//https://twitter.com/ldir_ko
//https://vk.com/ldirko
//https://www.youtube.com/c/ldirldir
//https://www.reddit.com/user/ldirko/

//collapsing effect added. 04.12.25 @coor

byte buff[(COLS+2)*(ROWS+2)];

DEFINE_GRADIENT_PALETTE(firepal) { // define fire palette
  0,  0,  0,  0, //black
  50, 0,0,0,
  64,  255,  0,  0, // red
  100,  255,  255,  0, //yellow
  255,  255,  255,  255, // white
};

// collapsing vars
uint32_t lastCollapseTime = 0;
uint32_t collapseInterval = 3000 + random(1000); // 3-4 sec
bool collapsing = false;
uint16_t collapseProgress = 0;
const uint16_t collapseDuration = 1000; // duration
const uint16_t collapsePhaseDuration = collapseDuration / 3; // 3 equal phases

uint16_t buffXY (byte x, byte y){
  return (y*(COLS+2)+x);
}

void fadecenter(){
  uint16_t sum;
  for (byte x = 1; x < COLS+1; x++) {
    for (byte y = 1; y < ROWS+1; y++) {
      sum = buff [buffXY(x,y)]; 
      sum += buff [buffXY(x+1,y)]; 
      sum += buff [buffXY(x-1,y)];
      sum += buff [buffXY(x,y+1)]; 
      sum += buff [buffXY(x,y-1)];
      sum /=5;
      buff [buffXY(x,y)]=sum;
    }
  }
}

void fadeup(){
  uint16_t sum;
  for (byte x = 1; x < COLS+1; x++) {
    for (byte y = 0; y < ROWS+1; y++) {
      sum =  buff [buffXY(x,y)]; 
      sum += buff [buffXY(x-1,y+1)];
      sum += buff [buffXY(x,y+1)];
      sum += buff [buffXY(x+1,y+1)];
      sum /=4;
      buff [buffXY(x,y)]=sum;
    }
  }
}

void sinballs() {
  byte bright = 230;  
  
  byte t1 = millis() / 10;
  byte t2 = sin8(t1)/2;
  
  // coll vars
  float scale = 1.0;
  float centerX = COLS / 2.0;
  float centerY = ROWS / 2.0;
  
  if (collapsing) {
    float collapsePhase;
    
    if (collapseProgress < collapsePhaseDuration) {
      // 1: smooth collapsing
      collapsePhase = 1.0 - (float(collapseProgress) / collapsePhaseDuration);
      scale = 0.15 + 0.85 * collapsePhase; // size of collapsed ring
    } 
    else if (collapseProgress < collapsePhaseDuration * 2) {
      // 2: pause in collapsed
      scale = 0.15; 
    }
    else {
      // 3: back to full size
      collapsePhase = float(collapseProgress - collapsePhaseDuration * 2) / collapsePhaseDuration;
      scale = 0.15 + 0.85 * collapsePhase;
    }
  }
  
  for (uint16_t i = 0; i < 11; i++) {
    // base coords 
    float rawX = sin8(t1 + i * 24) * (COLS) / 255.0;  //0..COLS
    float rawY = sin8(t2 + i * 24) * (ROWS) / 255.0;  //0..ROWS
    
    // scale them
    if (scale != 1.0) {
      rawX = centerX + (rawX - centerX) * scale;
      rawY = centerY + (rawY - centerY) * scale;
    }
    
    rawX = constrain(rawX, 0.0, COLS-1.0);
    rawY = constrain(rawY, 0.0, ROWS-1.0);
    
    byte x = byte(rawX);
    byte y = byte(rawY);
    
    buff[buffXY(x+1, y+1)] = bright;
  }
}

void updateCollapseEffect() {
  uint32_t currentTime = millis();
  
  if (currentTime - lastCollapseTime > collapseInterval) {
    collapsing = true;
    collapseProgress = 0;
    lastCollapseTime = currentTime;
    collapseInterval = 3000 + random(1000); // new time to collapse
  }
  
  if (collapsing) {
    collapseProgress += 30;
    
    if (collapseProgress >= collapseDuration) {
      collapsing = false;
      collapseProgress = 0;
    }
  }
}

void toLeds (){
  CRGBPalette256 myPal = firepal;
  
  uint16_t buffIndex = 1;
  for (int y = 0; y < ROWS; y++) {
    for (int x = 0; x < COLS; x++) {
      int index = XY(x, (ROWS-1)-y);
      leds[index] = ColorFromPalette(myPal, buff[buffIndex], 255);
      buffIndex++;
    }
    buffIndex+=2; 
  } 
}

void draw() {
  sinballs();
  fadeup();
  toLeds();
  
  updateCollapseEffect();
  
  delay(30);
}