import { INSTANT_FLUSH, STEPS_PER_FRAME, macroYield, nextFrame } from '../interpreter/pacing.js';
import { formatNum } from '../interpreter/scope.js';
import { STOP_SIGNAL } from '../interpreter/signals.js';
import { CH, CW } from '../render/canvas.js';
import { render } from '../render/render.js';
import { paintLine, trailPushIfRoom, trailPushQuiet } from '../render/trail.js';
import { advanceWalk, setMoving, turtle } from './state.js';
import { log } from '../ui/console.js';

// ── Motion ────────────────────────────────────────────────────────────────────
// clipToCanvas(x0,y0,x1,y1): null if (x1,y1) is on the canvas, otherwise the point
// where the straight path from (x0,y0) leaves it. Exact for diagonal paths.
export function clipToCanvas(x0, y0, x1, y1){
  const HW = CW/2, HH = CH/2;
  if(x1 >= -HW && x1 <= HW && y1 >= -HH && y1 <= HH) return null;
  const dx = x1 - x0, dy = y1 - y0;
  let tt = 1;
  if(dx > 0) tt = Math.min(tt, ( HW - x0) / dx); else if(dx < 0) tt = Math.min(tt, (-HW - x0) / dx);
  if(dy > 0) tt = Math.min(tt, ( HH - y0) / dy); else if(dy < 0) tt = Math.min(tt, (-HH - y0) / dy);
  tt = Math.max(0, tt);
  return [x0 + dx * tt, y0 + dy * tt];
}
// ouch(): the turtle reached the canvas edge — end the run (FENCE behaviour).
export function ouch(){
  setMoving(false); render();
  log('OUCH! Turtle went off the canvas.', 'print');
  throw STOP_SIGNAL;
}

// move(dist, rctx): translate turtle by dist along its heading (dist < 0 = backward).
// If the path leaves the canvas, the turtle walks to the edge and the run stops.
//
// Animated mode (speed 0–3): the path is split into ~1.2 sub-steps per pixel and
//   STEPS_PER_FRAME[speed] sub-steps are drawn per animation frame. Sub-steps are
//   painted only; one trail segment is stored for the whole move (or the part
//   walked before STOP).
// Instant mode (speed 4): one segment, no yield; every INSTANT_FLUSH moves the
//   browser gets a macrotask to paint progress.
export async function move(dist, rctx){
  const a = turtle.angle * Math.PI / 180;
  const sx = turtle.x, sy = turtle.y;
  let endX = sx + Math.sin(a) * dist, endY = sy + Math.cos(a) * dist;
  const hit = clipToCanvas(sx, sy, endX, endY);
  if(hit) [endX, endY] = hit;
  const col = turtle.color, w = turtle.width;
  const moved = endX !== sx || endY !== sy;

  if(rctx.speed >= 4){
    if(turtle.pen && moved) trailPushIfRoom(sx, sy, endX, endY, w, col[0], col[1], col[2]);
    turtle.x = endX; turtle.y = endY;
    advanceWalk();
    if(hit) ouch();
    if(++rctx.instantStepCount >= INSTANT_FLUSH){
      rctx.instantStepCount = 0;
      render();
      await macroYield(rctx); // browser paint + CSS tick + STOP clicks
    }
    return;
  }

  const SPF   = STEPS_PER_FRAME[rctx.speed] || 1;
  const steps = Math.max(1, Math.round(Math.hypot(endX - sx, endY - sy) * 1.2)); // 1.2× → smoother diagonals
  const pen   = turtle.pen && moved;
  setMoving(true);
  for(let i = 1; i <= steps && !rctx.stopped; i++){
    const ox = turtle.x, oy = turtle.y;
    if(i === steps){ turtle.x = endX; turtle.y = endY; } // snap last step exactly
    else { turtle.x = sx + (endX - sx) * i / steps; turtle.y = sy + (endY - sy) * i / steps; }
    if(pen) paintLine(ox, oy, turtle.x, turtle.y, w, col[0], col[1], col[2]);
    advanceWalk();
    if(i % SPF === 0 || i === steps){ render(); await nextFrame(rctx); }
  }
  setMoving(false);
  // Store what was actually walked (all of it, or up to where STOP interrupted).
  if(pen && (turtle.x !== sx || turtle.y !== sy)) trailPushQuiet(sx, sy, turtle.x, turtle.y, w, col[0], col[1], col[2]);
  render();
  if(hit && !rctx.stopped) ouch();
}

// rotate(deg, rctx): turn by deg degrees (positive = clockwise, Logo convention).
// Animated: [3,12,48,192][speed] degrees per frame. Instant: single update.
export async function rotate(deg, rctx){
  if(rctx.speed >= 4){ turtle.angle += deg; return; }
  const DPF = [3,12,48,192][rctx.speed] || 3; // degrees per rAF frame
  const steps = Math.max(1, Math.round(Math.abs(deg) / DPF));
  const start = turtle.angle;
  for(let i = 1; i <= steps && !rctx.stopped; i++){
    turtle.angle = start + deg * (i / steps); render(); await nextFrame(rctx);
  }
  if(!rctx.stopped) turtle.angle = start + deg;
  render();
}

// circle(r, rctx): polygon approximation of a circle of radius |r|, turning right.
// Negative r draws the mirror image (walks backward). Steps = max(36, |r|).
// |r| is capped at MAX_CIRCLE_R to avoid accidental multi-minute animations.
const MAX_CIRCLE_R = 2000;
export async function circle(r, rctx){
  if(!isFinite(r)) throw new Error('CIRCLE: radius must be a finite number, got ' + r);
  if(r === 0) return;
  if(Math.abs(r) > MAX_CIRCLE_R){ log('CIRCLE '+formatNum(r)+' radius capped to '+MAX_CIRCLE_R,'info'); r = Math.sign(r) * MAX_CIRCLE_R; }
  const steps = Math.max(36, Math.round(Math.abs(r)));
  const aStep = 360/steps, fwd = 2*Math.PI*r/steps;
  for(let i=0; i<steps && !rctx.stopped; i++){
    await move(fwd, rctx);
    await rotate(aStep, rctx);
  }
}
