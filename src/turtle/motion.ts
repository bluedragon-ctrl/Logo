import { DEG_PER_FRAME, INSTANT_FLUSH, STEPS_PER_FRAME, macroYield, spendFrame } from '../interpreter/pacing.ts';
import { formatNum } from '../interpreter/scope.ts';
import { STOP_SIGNAL } from '../interpreter/signals.ts';
import { notePoint, trailPushIfRoom, trailPushQuiet } from './drawing.ts';
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
// Floating-point drift: sin/cos of 90°, 180° … are not exactly 0, so after
// REPEAT 4 [FD 100 RT 90] XCOR would be 1.4e-14. Positions and headings are kept
// on a 1e-9 grid (far below a pixel), so closed shapes end exactly where they began.
const snap = (v: number): number => Math.round(v * 1e9) / 1e9;

// ── Edge modes ────────────────────────────────────────────────────────────────
// What happens when a straight path (FD, BK, SETPOS, HOME, …) reaches the canvas edge:
//   FENCE  (default) the turtle stops at the edge and the run ends: OUCH!
//   WRAP   it leaves on one side and comes back in on the opposite side
//   WINDOW it walks on off the canvas (what it draws there is not seen)
// edgePath(rctx, sx,sy, ex,ey) splits the path into the pieces drawn on the canvas.
//   pieces: [x0,y0,x1,y1] each — WRAP jumps to the opposite edge between pieces
//   endX/endY: where the turtle ends; hit: FENCE stopped it at the edge.
export interface EdgePath { pieces: [number, number, number, number][]; endX: number; endY: number; hit: boolean }
const MAX_WRAP_PIECES = 1000;  // FD 1E9 in WRAP: draw this many crossings, then jump to the end
export function edgePath(rctx: RunContext, sx: number, sy: number, ex: number, ey: number): EdgePath {
  const mode = rctx.session.edge;
  if(mode === 'window') return { pieces: [[sx, sy, ex, ey]], endX: ex, endY: ey, hit: false };
  const { w, h } = rctx.io.canvasSize();
  if(mode === 'fence'){
    const hit = clipToCanvas(sx, sy, ex, ey, w, h);
    const [hx, hy] = hit || [ex, ey];
    return { pieces: [[sx, sy, hx, hy]], endX: hx, endY: hy, hit: !!hit };
  }
  // WRAP: walk to the edge, jump across, go on with what is left of the path.
  const HW = w / 2, HH = h / 2, eps = 1e-9 * Math.max(1, HW, HH);
  const pieces: EdgePath['pieces'] = [];
  let x = sx, y = sy, rx = ex - sx, ry = ey - sy;
  for(let n = 0; n < MAX_WRAP_PIECES; n++){
    const hit = clipToCanvas(x, y, x + rx, y + ry, w, h);
    if(!hit){ pieces.push([x, y, snap(x + rx), snap(y + ry)]); return { pieces, endX: snap(x + rx), endY: snap(y + ry), hit: false }; }
    let [hx, hy] = hit;
    if(Math.abs(hx - HW) < eps) hx = HW; else if(Math.abs(hx + HW) < eps) hx = -HW;   // exactly on the edge
    if(Math.abs(hy - HH) < eps) hy = HH; else if(Math.abs(hy + HH) < eps) hy = -HH;
    pieces.push([x, y, hx, hy]);
    rx -= hx - x; ry -= hy - y;
    let nx = hx, ny = hy;
    if(rx > 0 && hx >= HW) nx = -HW; else if(rx < 0 && hx <= -HW) nx = HW;
    if(ry > 0 && hy >= HH) ny = -HH; else if(ry < 0 && hy <= -HH) ny = HH;
    if(nx === hx && ny === hy) break;                       // no edge crossed: give up drawing
    x = nx; y = ny;
  }
  return { pieces, endX: wrapCoord(ex, HW), endY: wrapCoord(ey, HH), hit: false };
}
// wrapCoord(v, half): v folded into -half … half (WRAP).
export function wrapCoord(v: number, half: number): number {
  if(v >= -half && v <= half) return v;
  const span = 2 * half;
  return snap(((v + half) % span + span) % span - half);
}

// advanceWalk(session): step the sprite animation counter (16-bit wrap avoids
// float precision loss over long programs).
function advanceWalk(session: Session): void { session.walkTick = (session.walkTick + 1) & 0xFFFF; }

// normAngle: heading in [0, 360), snapped like positions (RT 0.1 × 3600 → 0).
export function normAngle(a: number): number { const r = snap(((a % 360) + 360) % 360); return r >= 360 ? 0 : r; }

// ouch(rctx): the turtle reached the canvas edge — end the run (FENCE behaviour).
export function ouch(rctx: RunContext): never {
  rctx.session.isMoving = false; rctx.io.render();
  rctx.io.log('OUCH! Turtle went off the canvas.', 'print');
  throw STOP_SIGNAL;
}

// move(dist, rctx): translate turtle by dist along its heading (dist < 0 = backward).
// At the canvas edge the edge mode decides (edgePath): FENCE walks to the edge and
// ends the run, WRAP comes back in on the other side, WINDOW walks on.
//
// Animated mode (speed 0–3): each piece of the path is split into ~1.2 sub-steps per
//   pixel; each costs 1/STEPS_PER_FRAME[speed] of a frame (spendFrame — the budget is
//   shared with the commands before and after). Sub-steps are painted only; one trail
//   segment is stored per piece (or the part walked before STOP). A move of length 0
//   costs nothing.
// Instant mode (speed 4): one segment per piece, no yield; every INSTANT_FLUSH moves
//   the browser gets a macrotask to paint progress.
export async function move(dist: number, rctx: RunContext): Promise<void> {
  const { session, io } = rctx, turtle = session.turtle;
  const a = turtle.angle * Math.PI / 180;
  const path = edgePath(rctx, turtle.x, turtle.y, snap(turtle.x + Math.sin(a) * dist), snap(turtle.y + Math.cos(a) * dist));
  const col = turtle.color, w = turtle.width;

  if(rctx.speed >= 4){
    if(turtle.pen) for(const [x0, y0, x1, y1] of path.pieces)
      if(x0 !== x1 || y0 !== y1) trailPushIfRoom(rctx, x0, y0, x1, y1, w, col[0], col[1], col[2]);
    turtle.x = path.endX; turtle.y = path.endY;
    advanceWalk(session);
    notePoint(session);
    if(path.hit) ouch(rctx);
    if(++rctx.instantStepCount >= INSTANT_FLUSH){
      rctx.instantStepCount = 0;
      io.render();
      await macroYield(rctx); // browser paint + CSS tick + STOP clicks
    }
    return;
  }

  session.isMoving = true;
  for(const [x0, y0, x1, y1] of path.pieces){
    turtle.x = x0; turtle.y = y0;                     // WRAP: jump to the opposite edge
    await walk(x0, y0, x1, y1, rctx);
    if(rctx.stopped) break;
  }
  session.isMoving = false;
  if(!rctx.stopped){ turtle.x = path.endX; turtle.y = path.endY; notePoint(session); }
  io.render();
  if(path.hit && !rctx.stopped) ouch(rctx);
}
// walk(sx,sy, ex,ey, rctx): animate one straight piece of a move (see move()).
async function walk(sx: number, sy: number, ex: number, ey: number, rctx: RunContext): Promise<void> {
  const { session, io } = rctx, turtle = session.turtle;
  const col = turtle.color, w = turtle.width;
  const moved = ex !== sx || ey !== sy;
  const steps = moved ? Math.max(1, Math.round(Math.hypot(ex - sx, ey - sy) * 1.2)) : 0; // 1.2× → smoother diagonals
  const pen   = turtle.pen && moved;
  for(let i = 1; i <= steps && !rctx.stopped; i++){
    // The speed is read every sub-step: the slider can change it mid-run.
    // Switched to instant → the rest of the move is drawn in one go.
    if(rctx.speed >= 4) i = steps;
    const ox = turtle.x, oy = turtle.y;
    if(i === steps){ turtle.x = ex; turtle.y = ey; } // snap last step exactly
    else { turtle.x = sx + (ex - sx) * i / steps; turtle.y = sy + (ey - sy) * i / steps; }
    if(pen) io.paintLine(ox, oy, turtle.x, turtle.y, w, col[0], col[1], col[2]);
    advanceWalk(session);
    if(rctx.speed < 4) await spendFrame(rctx, 1 / STEPS_PER_FRAME[rctx.speed]);
  }
  // Store what was actually walked (all of it, or up to where STOP interrupted).
  if(pen && (turtle.x !== sx || turtle.y !== sy)) trailPushQuiet(rctx, sx, sy, turtle.x, turtle.y, w, col[0], col[1], col[2]);
}

// rotate(deg, rctx): turn by deg degrees (positive = clockwise, Logo convention).
// Animated: DEG_PER_FRAME[speed] degrees per frame, from the shared frame budget
// (the turn first fills what is left of the current frame). Instant: single update.
// The final heading is normalised to [0, 360).
export async function rotate(deg: number, rctx: RunContext): Promise<void> {
  const turtle = rctx.session.turtle;
  if(rctx.speed >= 4){ turtle.angle = normAngle(turtle.angle + deg); return; }
  const total = Math.abs(deg), sign = Math.sign(deg), start = turtle.angle;
  let done = 0;
  while(total - done > 1e-9 && !rctx.stopped){
    if(rctx.speed >= 4) break; // slider moved to instant mid-turn: finish at once
    const DPF = DEG_PER_FRAME[rctx.speed]; // re-read: the slider can change it mid-run
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
const capRadius = (r: number, what: string, rctx: RunContext): number => {
  if(Math.abs(r) <= MAX_CIRCLE_R) return r;
  rctx.io.log(what+' '+formatNum(r)+' radius capped to '+MAX_CIRCLE_R,'info');
  return Math.sign(r) * MAX_CIRCLE_R;
};
export async function circle(r: number, rctx: RunContext): Promise<void> {
  if(r === 0) return;
  r = capRadius(r, 'CIRCLE', rctx);
  const steps = Math.max(36, Math.round(Math.abs(r)));
  const aStep = 360/steps, fwd = 2*Math.PI*r/steps;
  for(let i=0; i<steps && !rctx.stopped; i++){
    await move(fwd, rctx);
    await rotate(aStep, rctx);
  }
}

// arc(deg, r, rctx): deg degrees of a circle of radius r, turning right (negative
// deg turns left, negative r walks backward like CIRCLE). Unlike CIRCLE's polygon,
// the chords are placed between half-step turns, so the turtle ends exactly on the
// true arc: ARC 90 100 from HOME ends at (100, 100), heading 90. Same step density
// as CIRCLE. r = 0 is just the turn.
export async function arc(deg: number, r: number, rctx: RunContext): Promise<void> {
  if(deg === 0) return;
  if(r === 0){ await rotate(deg, rctx); return; }
  r = capRadius(r, 'ARC', rctx);
  const t = rctx.session.turtle;
  // Exact end point: centre = start + k·n(h0), end = centre − k·n(h0 + deg), where
  // n(h) = (cos h, −sin h) is the right-hand normal of heading h and k = r·sign(deg).
  const k = r * Math.sign(deg), rad = Math.PI / 180, h0 = t.angle * rad, h1 = (t.angle + deg) * rad;
  const endX = snap(t.x + k * (Math.cos(h0) - Math.cos(h1))), endY = snap(t.y - k * (Math.sin(h0) - Math.sin(h1)));
  const full  = Math.max(36, Math.round(Math.abs(r)));            // steps of a whole circle
  const steps = Math.max(1, Math.ceil(full * Math.abs(deg) / 360 - 1e-9));
  const aStep = deg / steps;
  const chord = 2 * r * Math.sin(Math.abs(aStep) * Math.PI / 360); // 2·r·sin(step/2)
  await rotate(aStep / 2, rctx);
  for(let i=0; i<steps && !rctx.stopped; i++){
    await move(chord, rctx);
    await rotate(i < steps - 1 ? aStep : aStep / 2, rctx);
  }
  if(!rctx.stopped){                                // remove the 1e-9 drift of the snapped steps
    if(rctx.session.edge === 'wrap'){ const { w, h } = rctx.io.canvasSize(); t.x = wrapCoord(endX, w / 2); t.y = wrapCoord(endY, h / 2); }
    else { t.x = endX; t.y = endY; }
  }
}
