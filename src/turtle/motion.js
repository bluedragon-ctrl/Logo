import { INSTANT_FLUSH, STEPS_PER_FRAME, macroYield, nextFrame } from '../interpreter/pacing.js';
import { formatNum } from '../interpreter/scope.js';
import { STOP_SIGNAL } from '../interpreter/signals.js';
import { trailPushIfRoom, trailPushQuiet } from './drawing.js';

// ── Motion ────────────────────────────────────────────────────────────────────
// clipToCanvas(x0,y0,x1,y1, w,h): null if (x1,y1) is on a w×h canvas centred on the
// origin, otherwise the point where the straight path from (x0,y0) leaves it.
// Exact for diagonal paths.
export function clipToCanvas(x0, y0, x1, y1, w, h){
  const HW = w/2, HH = h/2;
  if(x1 >= -HW && x1 <= HW && y1 >= -HH && y1 <= HH) return null;
  const dx = x1 - x0, dy = y1 - y0;
  let tt = 1;
  if(dx > 0) tt = Math.min(tt, ( HW - x0) / dx); else if(dx < 0) tt = Math.min(tt, (-HW - x0) / dx);
  if(dy > 0) tt = Math.min(tt, ( HH - y0) / dy); else if(dy < 0) tt = Math.min(tt, (-HH - y0) / dy);
  tt = Math.max(0, tt);
  return [x0 + dx * tt, y0 + dy * tt];
}
// clipForRun(rctx, x0,y0,x1,y1): clipToCanvas against the current canvas size.
export function clipForRun(rctx, x0, y0, x1, y1){
  const { w, h } = rctx.io.canvasSize();
  return clipToCanvas(x0, y0, x1, y1, w, h);
}
// advanceWalk(session): step the sprite animation counter (16-bit wrap avoids
// float precision loss over long programs).
function advanceWalk(session){ session.walkTick = (session.walkTick + 1) & 0xFFFF; }

// ouch(rctx): the turtle reached the canvas edge — end the run (FENCE behaviour).
export function ouch(rctx){
  rctx.session.isMoving = false; rctx.io.render();
  rctx.io.log('OUCH! Turtle went off the canvas.', 'print');
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
  const { session, io } = rctx, turtle = session.turtle;
  const a = turtle.angle * Math.PI / 180;
  const sx = turtle.x, sy = turtle.y;
  let endX = sx + Math.sin(a) * dist, endY = sy + Math.cos(a) * dist;
  const hit = clipForRun(rctx, sx, sy, endX, endY);
  if(hit) [endX, endY] = hit;
  const col = turtle.color, w = turtle.width;
  const moved = endX !== sx || endY !== sy;

  if(rctx.speed >= 4){
    if(turtle.pen && moved) trailPushIfRoom(rctx, sx, sy, endX, endY, w, col[0], col[1], col[2]);
    turtle.x = endX; turtle.y = endY;
    advanceWalk(session);
    if(hit) ouch(rctx);
    if(++rctx.instantStepCount >= INSTANT_FLUSH){
      rctx.instantStepCount = 0;
      io.render();
      await macroYield(rctx); // browser paint + CSS tick + STOP clicks
    }
    return;
  }

  const SPF   = STEPS_PER_FRAME[rctx.speed] || 1;
  const steps = Math.max(1, Math.round(Math.hypot(endX - sx, endY - sy) * 1.2)); // 1.2× → smoother diagonals
  const pen   = turtle.pen && moved;
  session.isMoving = true;
  for(let i = 1; i <= steps && !rctx.stopped; i++){
    const ox = turtle.x, oy = turtle.y;
    if(i === steps){ turtle.x = endX; turtle.y = endY; } // snap last step exactly
    else { turtle.x = sx + (endX - sx) * i / steps; turtle.y = sy + (endY - sy) * i / steps; }
    if(pen) io.paintLine(ox, oy, turtle.x, turtle.y, w, col[0], col[1], col[2]);
    advanceWalk(session);
    if(i % SPF === 0 || i === steps){ io.render(); await nextFrame(rctx); }
  }
  session.isMoving = false;
  // Store what was actually walked (all of it, or up to where STOP interrupted).
  if(pen && (turtle.x !== sx || turtle.y !== sy)) trailPushQuiet(rctx, sx, sy, turtle.x, turtle.y, w, col[0], col[1], col[2]);
  io.render();
  if(hit && !rctx.stopped) ouch(rctx);
}

// rotate(deg, rctx): turn by deg degrees (positive = clockwise, Logo convention).
// Animated: [3,12,48,192][speed] degrees per frame. Instant: single update.
export async function rotate(deg, rctx){
  const turtle = rctx.session.turtle;
  if(rctx.speed >= 4){ turtle.angle += deg; return; }
  const DPF = [3,12,48,192][rctx.speed] || 3; // degrees per rAF frame
  const steps = Math.max(1, Math.round(Math.abs(deg) / DPF));
  const start = turtle.angle;
  for(let i = 1; i <= steps && !rctx.stopped; i++){
    turtle.angle = start + deg * (i / steps); rctx.io.render(); await nextFrame(rctx);
  }
  if(!rctx.stopped) turtle.angle = start + deg;
  rctx.io.render();
}

// circle(r, rctx): polygon approximation of a circle of radius |r|, turning right.
// Negative r draws the mirror image (walks backward). Steps = max(36, |r|).
// |r| is capped at MAX_CIRCLE_R to avoid accidental multi-minute animations.
const MAX_CIRCLE_R = 2000;
export async function circle(r, rctx){
  if(!isFinite(r)) throw new Error('CIRCLE: radius must be a finite number, got ' + r);
  if(r === 0) return;
  if(Math.abs(r) > MAX_CIRCLE_R){ rctx.io.log('CIRCLE '+formatNum(r)+' radius capped to '+MAX_CIRCLE_R,'info'); r = Math.sign(r) * MAX_CIRCLE_R; }
  const steps = Math.max(36, Math.round(Math.abs(r)));
  const aStep = 360/steps, fwd = 2*Math.PI*r/steps;
  for(let i=0; i<steps && !rctx.stopped; i++){
    await move(fwd, rctx);
    await rotate(aStep, rctx);
  }
}
