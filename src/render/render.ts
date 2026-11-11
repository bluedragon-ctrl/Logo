import { drawBackground, turtleStyle } from './background.ts';
import { CH, CW, DPR, ctx } from './canvas.ts';
import { drawTurtleSprite } from './sprite.ts';
import { toCanvas, trailCanvas } from './trail.ts';
import { session } from '../app.ts';
import type { Turtle } from '../interpreter/types.ts';

// ── Render pipeline ───────────────────────────────────────────────────────────
// render() composites three layers every frame via painter's algorithm:
//   1. background  — flat fill (drawBackground)
//   2. trailCanvas — incremental pen strokes (updated by paintSegment / rebuildTrailCanvas)
//   3. turtle      — only if turtle.visible; both styles are centred on the pen point

// drawSimpleTurtle: small triangle cursor (turtleStyle === 'triangle'), centred at
// the turtle's position. Pen state shown as a dot (red = down, white = up).
function drawSimpleTurtle(turtle: Turtle): void {
  const[cx,cy]=toCanvas(turtle.x,turtle.y);
  ctx.save();
  ctx.translate(cx,cy);
  ctx.rotate(turtle.angle*Math.PI/180);
  // triangle: tip 12px forward (+y = north at angle 0, standard Logo convention), base ±7px
  ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(7,6);ctx.lineTo(-7,6);ctx.closePath();
  ctx.fillStyle='#3b7dd8';ctx.fill();
  ctx.strokeStyle='#1f4a85';ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.stroke();
  // pen-state indicator dot at centre
  ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);
  ctx.fillStyle=turtle.pen?'#e0393b':'#ffffff';ctx.fill();
  ctx.strokeStyle=turtle.pen?'#ffffff':'#1f4a85';ctx.lineWidth=1;ctx.stroke();
  ctx.restore();
}
export function render(){
  // Guard: canvas not yet sized (0×0 during initial layout) — drawing would throw
  if(CW===0 || CH===0) return;
  const turtle = session.turtle;
  ctx.setTransform(DPR,0,0,DPR,0,0); // logical units; reset each frame (cheap, and robust to resizes)
  ctx.imageSmoothingEnabled = false; // the trail layer is blitted 1:1 — keep it crisp (context state resets on resize)
  drawBackground();
  ctx.drawImage(trailCanvas,0,0,CW,CH); // composite cached trail in one blit
  if(!turtle.visible) return;
  switch(turtleStyle){
    case 'triangle':
      drawSimpleTurtle(turtle);
      break;
    default: { // 'turtle'
      const[cx,cy]=toCanvas(turtle.x,turtle.y);
      drawTurtleSprite(ctx,cx,cy,turtle,session.walkTick,session.isMoving);
    }
  }
}
