import { DEG_PER_FRAME, INSTANT_FLUSH, STEPS_PER_FRAME, macroYield, spendFrame } from '../interpreter/pacing.ts';
import { formatNum } from '../interpreter/scope.ts';
import { STOP_SIGNAL } from '../interpreter/signals.ts';
import { trailPushIfRoom, trailPushQuiet } from './drawing.ts';
import type { RunContext, Session } from '../interpreter/types.ts';

// ── Motion ────────────────────────────────────────────────────────────────────
// clipToCanvas(x0,y0,x1,y1, w,h): null if (x1,y1) is on a w×h canvas centred on the
// origin, otherwise the point where the straight path from (x0,y0) leaves it.
// Exact for diagonal paths.
export function clipToCanvas(x0: number, y0: number, x1: number, y1: number, w: number, h: number): [number, number] | null {
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
export function clipForRun(rctx: RunContext, x0: number, y0: number, x1: number, y1: number): [number, number] | null {
  const { w, h } = rctx.io.canvasSize();
  return clipToCanvas(x0, y0, x1, y1, w, h);
}
// advanceWalk(session): step the sprite animation counter (16-bit wrap avoids
// float precision loss over long programs).
function advanceWalk(session: Session): void { session.walkTick = (session.walkTick + 1) & 0xFFFF; }

// Floating-point drift: sin/cos of 90°, 180° … are not exactly 0, so after
// REPEAT 4 [FD 100 RT 90] XCOR would be 1.4e-14. Positions and headings are kept
// on a 1e-9 grid (far below a pixel), so closed shapes end exactly where they began.
const snap = (v: number): number => Math.round(v * 1e9) / 1e9;
// normAngle: heading in [0, 360), snapped like positions (RT 0.1 × 3600 → 0).
export function normAngle(a: number): number { const r = snap(((a % 360) + 360) % 360); return r >= 360 ? 0 : r; }

// ouch(rctx): the turtle reached the canvas edge — end the run (FENCE behaviour).
export function ouch(rctx: RunContext): never {
  rctx.session.isMoving = false; rctx.io.render();
  rctx.io.log('OUCH! Turtle went off the canvas.', 'print');
  throw STOP_SIGNAL;
}

// move(dist, rctx): translate turtle by dist along its heading (dist < 0 = backward).
// If the path leaves the canvas, the turtle walks to the edge and the run stops.
//
// Animated mode (speed 0–3): the path is split into ~1.2 sub-steps per pixel; each
//   costs 1/STEPS_PER_FRAME[speed] of a frame (spendFrame — the budget is shared
//   with the commands before and after). Sub-steps are painted only; one trail
//   segment is stored for the whole move (or the part walked before STOP). A move
//   of length 0 costs nothing.
// Instant mode (speed 4): one segment, no yield; every INSTANT_FLUSH moves the
//   browser gets a macrotask to paint progress.
export async function move(dist: number, rctx: RunContext): Promise<void> {
  const { session, io } = rctx, turtle = session.turtle;
  const a = turtle.angle * Math.PI / 180;
  const sx = turtle.x, sy = turtle.y;
  let endX = snap(sx + Math.sin(a) * dist), endY = snap(sy + Math.cos(a) * dist);
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
  const steps = moved ? Math.max(1, Math.round(Math.hypot(endX - sx, endY - sy) * 1.2)) : 0; // 1.2× → smoother diagonals
  const pen   = turtle.pen && moved;
  session.isMoving = true;
  for(let i = 1; i <= steps && !rctx.stopped; i++){
    const ox = turtle.x, oy = turtle.y;
    if(i === steps){ turtle.x = endX; turtle.y = endY; } // snap last step exactly
    else { turtle.x = sx + (endX - sx) * i / steps; turtle.y = sy + (endY - sy) * i / steps; }
    if(pen) io.paintLine(ox, oy, turtle.x, turtle.y, w, col[0], col[1], col[2]);
    advanceWalk(session);
    await spendFrame(rctx, 1 / SPF);
  }
  session.isMoving = false;
  // Store what was actually walked (all of it, or up to where STOP interrupted).
  if(pen && (turtle.x !== sx || turtle.y !== sy)) trailPushQuiet(rctx, sx, sy, turtle.x, turtle.y, w, col[0], col[1], col[2]);
  io.render();
  if(hit && !rctx.stopped) ouch(rctx);
}

// rotate(deg, rctx): turn by deg degrees (positive = clockwise, Logo convention).
// Animated: DEG_PER_FRAME[speed] degrees per frame, from the shared frame budget
// (the turn first fills what is left of the current frame). Instant: single update.
// The final heading is normalised to [0, 360).
export async function rotate(deg: number, rctx: RunContext): Promise<void> {
  const turtle = rctx.session.turtle;
  if(rctx.speed >= 4){ turtle.angle = normAngle(turtle.angle + deg); return; }
  const DPF = DEG_PER_FRAME[rctx.speed] || 3;
  const total = Math.abs(deg), sign = Math.sign(deg), start = turtle.angle;
  let done = 0;
  while(total - done > 1e-9 && !rctx.stopped){
    const part = Math.min(total - done, DPF * (1 - rctx.frameUsed));
    done += part;
    turtle.angle = start + sign * done;
    await spendFrame(rctx, part / DPF);
  }
  if(!rctx.stopped) turtle.angle = normAngle(start + deg);
  rctx.io.render();
}

// circle(r, rctx): polygon approximation of a circle of radius |r|, turning right.
// Negative r draws the mirror image (walks backward). Steps = max(36, |r|).
// |r| is capped at MAX_CIRCLE_R to avoid accidental multi-minute animations.
const MAX_CIRCLE_R = 2000;
export async function circle(r: number, rctx: RunContext): Promise<void> {
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
