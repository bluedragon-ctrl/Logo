import { drawBackground, turtleStyle } from './background.ts';
import { CH, CW, DPR, ctx } from './canvas.ts';
import { SPRITE_OFFSET, buildSprite, spr } from './sprite.ts';
import { toCanvas, trailCanvas } from './trail.ts';
import { session } from '../app.ts';
import type { Turtle } from '../interpreter/types.ts';

// ── Render pipeline ───────────────────────────────────────────────────────────
// render() composites three layers every frame via painter's algorithm:
//   1. bgCache     — static background (one drawImage blit, never redrawn)
//   2. trailCanvas — incremental pen strokes (updated by paintSegment / rebuildTrailCanvas)
//   3. sprite      — turtle, only if turtle.visible
//
// spriteCenter(): the sprite is drawn nose-forward; to align the pen dot with
// turtle.{x,y} the sprite's visual centre must be offset SPRITE_OFFSET px ahead
// along the current heading direction before converting to canvas coordinates.
function spriteCenter(turtle: Turtle): [number, number] {
  const a = turtle.angle * Math.PI / 180;
  return [turtle.x + Math.sin(a) * SPRITE_OFFSET, turtle.y + Math.cos(a) * SPRITE_OFFSET];
}
// drawSimpleTurtle: legacy small triangle cursor (turtleStyle === 'triangle').
// Centred at turtle world position (no SPRITE_OFFSET). Pen state shown as a dot.
function drawSimpleTurtle(turtle: Turtle): void {
  const[cx,cy]=toCanvas(turtle.x,turtle.y);
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(turtle.angle*Math.PI/180);
  // triangle: tip 12px forward (+y = north at angle 0, standard Logo convention), base ±7px
  ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(7,6);ctx.lineTo(-7,6);ctx.closePath();
  ctx.fillStyle='#56aa18';ctx.fill();
  ctx.strokeStyle='#1e3a06';ctx.lineWidth=1;ctx.stroke();
  // pen-state indicator dot at centre
  ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);
  ctx.fillStyle=turtle.pen?'#e03030':'#6a4810';ctx.fill();
  ctx.restore();
}
export function render(){
  // Guard: canvas not yet sized (0×0 during initial layout) — drawing would throw
  if(CW===0 || CH===0) return;
  const turtle = session.turtle;
  ctx.setTransform(DPR,0,0,DPR,0,0); // logical units; reset each frame (cheap, and robust to resizes)
  ctx.imageSmoothingEnabled = false; // crisp pixel-art sprite (context state resets on resize)
  drawBackground();
  ctx.drawImage(trailCanvas,0,0,CW,CH); // composite cached trail in one blit
  if(!turtle.visible) return;
  switch(turtleStyle){
    case 'triangle':
      drawSimpleTurtle(turtle);
      break;
    default: { // 'animated'
      buildSprite(session.walkTick,session.isMoving,turtle.pen);
      const[sx,sy]=spriteCenter(turtle),[cx,cy]=toCanvas(sx,sy);
      ctx.save();ctx.translate(cx,cy);ctx.rotate((turtle.angle-90)*Math.PI/180);ctx.drawImage(spr,-spr.width/2,-spr.height/2);ctx.restore();
    }
  }
}
