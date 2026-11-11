import { context2d } from '../util.ts';
// SPRITE_SIZE: off-screen sprite canvas dimensions in pixels (square).
// SPRITE_OFFSET: Logo (x,y) is the pen-tip position; the sprite is drawn
//   nose-forward so its visual centre must be shifted SPRITE_OFFSET px ahead
//   along the heading direction to align the pen dot with the logical position.
//   Measured empirically from the sprite geometry in buildSprite().
const SPRITE_SIZE   = 64;
export const SPRITE_OFFSET = 18.8;

// ── Sprite colour palette ─────────────────────────────────────────────────────
// All greens/browns; kept as short constants for density in the drawing helpers.
// Naming convention — prefix letter = region, suffix = brightness index:
//   SK/S0–S5  shell (K = darkest outline → S5 = brightest highlight)
//   LK/L0–L3  legs and head
//   EW/EP     eye white / eye pupil
//   B0/B1     belly plate (plastron) dark / mid
const SK='#0f1f04',S0='#1e3a06',S1='#2e580a',S2='#3e7810',S3='#56aa18',S4='#74d428',S5='#a0f040';
const LK='#142808',L0='#1e3c0a',L1='#2e5c10',L2='#48901c',L3='#6ab82a';
const EW='#f0f0e0',EP='#111100';  // eye white, eye pupil
const B0='#6a4810',B1='#a07828'; // belly dark / belly mid

// ── Sprite drawing helpers ────────────────────────────────────────────────────
// Each helper draws one body part into context c, centred on the current
// transform origin. All coordinates are relative to that origin so buildSprite()
// can position parts by translating/rotating before calling them.
function drawShell(c: CanvasRenderingContext2D): void {
  const R=13;
  c.beginPath();c.ellipse(0,0,R+2,R+2,0,0,Math.PI*2);c.fillStyle=SK;c.fill();
  c.beginPath();c.ellipse(0,0,R,R,0,0,Math.PI*2);c.fillStyle=S1;c.fill();
  const g=c.createRadialGradient(-3,-3,1,0,0,R);
  g.addColorStop(0,S5);g.addColorStop(0.2,S4);g.addColorStop(0.5,S3);g.addColorStop(0.75,S2);g.addColorStop(1,S0);
  c.beginPath();c.ellipse(0,0,R,R,0,0,Math.PI*2);c.fillStyle=g;c.fill();
  c.strokeStyle=SK;c.lineWidth=1;c.globalAlpha=0.55;
  const cp=4.5;
  c.beginPath();
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2-Math.PI/6;if(i===0) c.moveTo(Math.cos(a)*cp,Math.sin(a)*cp); else c.lineTo(Math.cos(a)*cp,Math.sin(a)*cp);}
  c.closePath();c.stroke();
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2-Math.PI/6;c.beginPath();c.moveTo(Math.cos(a)*cp,Math.sin(a)*cp);c.lineTo(Math.cos(a)*(R-1),Math.sin(a)*(R-1));c.stroke();}
  for(let ring=0;ring<2;ring++){const ri=[cp+3.5,cp+7.5][ring];for(let i=0;i<6;i++){const a0=i/6*Math.PI*2-Math.PI/6,a1=(i+1)/6*Math.PI*2-Math.PI/6;c.beginPath();c.arc(0,0,ri,a0,a1);c.stroke();}}
  c.globalAlpha=1;
  c.beginPath();c.arc(0,0,R-1,Math.PI*1.1,Math.PI*1.75);c.strokeStyle=S5;c.lineWidth=1.5;c.globalAlpha=0.5;c.stroke();c.globalAlpha=1;
}

// drawLeg: three-layer ellipse (dark outline → base colour → specular highlight).
// cx,cy = centre offset from the transform origin; w,h = bounding box.
function drawLeg(c: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  c.beginPath();c.ellipse(cx,cy,w/2+1,h/2+1,0,0,Math.PI*2);c.fillStyle=LK;c.fill();
  c.beginPath();c.ellipse(cx,cy,w/2,h/2,0,0,Math.PI*2);c.fillStyle=L1;c.fill();
  c.beginPath();c.ellipse(cx-w*.1,cy-h*.1,w/2*.75,h/2*.75,0,0,Math.PI*2);c.fillStyle=L3;c.fill();
  c.beginPath();c.ellipse(cx-w*.22,cy-h*.22,w/2*.3,h/2*.3,0,0,Math.PI*2);c.fillStyle='#ccff88';c.globalAlpha=0.45;c.fill();c.globalAlpha=1;
}

// drawHead: radial-gradient circle with two elliptical eyes.
// eyeOpen: vertical scale of the eye ellipse — 1 = fully open, ~0 = closed.
//   The blink animation in buildSprite drives this value via a slow sine wave.
function drawHead(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, eyeOpen: number): void {  // eyeOpen: 0 (closed) … 1 (open)
  c.beginPath();c.arc(cx,cy,r+1.2,0,Math.PI*2);c.fillStyle=LK;c.fill(); // 1.2px dark outline border
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=L1;c.fill();
  const hg=c.createRadialGradient(cx-r*.3,cy-r*.3,r*.1,cx,cy,r);
  hg.addColorStop(0,L3);hg.addColorStop(0.6,L2);hg.addColorStop(1,L0);
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=hg;c.fill();
  const eox=r*.35,eoy=-r*.2,er=r*.28,pr=er*.55;
  for(const ex of[-eox,eox]){
    c.beginPath();c.ellipse(cx+ex,cy+eoy,er,er*eyeOpen,0,0,Math.PI*2);c.fillStyle=EW;c.fill();
    c.beginPath();c.ellipse(cx+ex+er*.15,cy+eoy,pr,pr*eyeOpen,0,0,Math.PI*2);c.fillStyle=EP;c.fill();
    c.beginPath();c.arc(cx+ex-er*.1,cy+eoy-er*.2,er*.22,0,Math.PI*2);c.fillStyle='#fff';c.globalAlpha=0.8;c.fill();c.globalAlpha=1;
  }
}

// drawBelly: concentric ellipses approximate the plastron (turtle belly plate).
function drawBelly(c: CanvasRenderingContext2D): void {
  c.beginPath();c.ellipse(0,0,15,15,0,0,Math.PI*2);c.fillStyle='#2a1a04';c.fill();
  c.beginPath();c.ellipse(0,0,14,14,0,0,Math.PI*2);c.fillStyle=B1;c.fill();
  c.beginPath();c.ellipse(0,0,13,13,0,0,Math.PI*2);c.fillStyle=B0;c.fill();
}

export const spr=document.createElement('canvas');
spr.width=SPRITE_SIZE;spr.height=SPRITE_SIZE;
const sc=context2d(spr);
sc.imageSmoothingEnabled=true;

// buildSprite(tick, moving, penDown): render the turtle into the off-screen spr canvas.
// A three-tuple cache guard (_lastSpriteTick/Moving/Pen) skips redraws when all
// inputs are unchanged — avoids redundant canvas work on stationary frames.
//
// Parameters
//   tick    integer, wraps at 0xFFFF; drives all animation via sin(tick * k)
//   moving  true while FD/BK runs; false freezes leg swing and extends blink window
//   penDown true → red glowing dot at tail tip; false → brown stub
//
// Draw order (back-to-front, painter's algorithm):
//   rear legs → belly → shell → tail stub / pen dot → head
//
// Animation values derived from tick:
//   swing    sin(tick * 0.32)  leg ±displacement; 0 when !moving
//   headExt  1.5 + sin(...)    head bobs 1px while walking, retracts when still
//   blink    sin(tick * 0.05)  period ≈ 125 ticks; fires eye-close when > 0.92
//   eyeOpen  dips to 0.15 during blink peak, 1 otherwise (ignored while moving)
//   pulse    sin(tick * 0.18)  pen-dot glow radius / alpha oscillation
let _lastSpriteTick=-1, _lastSpriteMoving: boolean | null = null, _lastSpritePen: boolean | null = null;
export function buildSprite(tick: number, moving: boolean, penDown: boolean): void {
  if(tick===_lastSpriteTick && moving===_lastSpriteMoving && penDown===_lastSpritePen) return;
  _lastSpriteTick=tick; _lastSpriteMoving=moving; _lastSpritePen=penDown;
  sc.clearRect(0,0,spr.width,spr.height);
  sc.save();sc.translate(SPRITE_SIZE/2,SPRITE_SIZE/2);
  const swing   = moving ? Math.sin(tick * 0.32) : 0;          // leg swing ±1, ~2 steps/cycle
  const headExt = moving ? 1.5 + Math.sin(tick * 0.32) : 1.5; // head bobs ±1px when walking
  const blink   = Math.sin(tick * 0.05);                       // slow wave, peaks every ~125 ticks
  const eyeOpen = moving ? 1 : (blink > 0.92 ? Math.max(0.15, 1 - (blink - 0.92) * 30) : 1);
  // Four legs in opposite-phase pairs (FL+RR swing together, FR+RL opposite).
  // x-factor 1.2 < y-factor 1.5: asymmetric swing produces a diagonal waddle
  // rather than a pure lateral rock — reads as a more natural gait.
  drawLeg(sc,-9+swing*1.2,-9+swing*1.5,7,7); // front-left
  drawLeg(sc, 9-swing*1.2,-9-swing*1.5,7,7); // front-right (opposite phase)
  drawLeg(sc,-9-swing*1.2, 9+swing*1.5,7,7); // rear-left  (opposite to front)
  drawLeg(sc, 9+swing*1.2, 9-swing*1.5,7,7); // rear-right
  drawBelly(sc);drawShell(sc);
  const tailX=-14-headExt*0.5;
  drawLeg(sc,tailX,0,4.5,4.5);
  const dotX=tailX-3.8;
  if(penDown){
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.18); // glow pulse: 0→1 at ~35 ticks/cycle
    sc.beginPath();sc.arc(dotX,0,3.5+pulse*1.2,0,Math.PI*2);sc.fillStyle=`rgba(255,40,0,${0.15+pulse*0.2})`;sc.fill(); // glow halo: radius 3.5–4.7, alpha 0.15–0.35
    sc.beginPath();sc.arc(dotX,0,2.2,0,Math.PI*2);sc.fillStyle='#f20';sc.fill();
    sc.beginPath();sc.arc(dotX-0.5,-0.6,0.7,0,Math.PI*2);sc.fillStyle='rgba(255,200,200,.9)';sc.fill();
  } else {
    sc.beginPath();sc.arc(dotX,0,2.2,0,Math.PI*2);sc.fillStyle='#5a3010';sc.fill();
    sc.beginPath();sc.arc(dotX,0,1.3,0,Math.PI*2);sc.fillStyle='#8a5828';sc.fill();
    sc.beginPath();sc.arc(dotX-0.4,-0.4,0.5,0,Math.PI*2);sc.fillStyle='rgba(200,160,100,.6)';sc.fill();
  }
  drawHead(sc,13+headExt,0,4.5,eyeOpen);
  sc.restore();
}
