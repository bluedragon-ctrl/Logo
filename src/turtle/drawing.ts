import type { Drawing, Label, RunContext, Session } from '../interpreter/types.ts';

// ── Drawing store: trail segments + labels ───────────────────────────────────
// What the turtle has drawn, as data. Lives in a session (session.drawing) and
// has no DOM dependency: the renderer (render/trail.js) paints it, tests read it.
//
// Pen strokes are stored as line segments in two pre-allocated typed arrays.
// Writing a segment costs one push; reading costs direct index math.
// There is no per-segment object allocation and no GC pressure at cap.
//
// Array layout — segment index i:
//   f32[i*5 + 0] = x1  (Logo world coords, Float32 — origin at canvas centre)
//   f32[i*5 + 1] = y1
//   f32[i*5 + 2] = x2
//   f32[i*5 + 3] = y2
//   f32[i*5 + 4] = w   (stroke width in pixels)
//   u8 [i*3 + 0] = r   (colour channels, Uint8 clamped 0–255)
//   u8 [i*3 + 1] = g
//   u8 [i*3 + 2] = b
// A DOT is a zero-length segment (x1===x2, y1===y2), painted as a filled circle.
//
// Memory at cap: Float32Array(250 000) = 1 000 KB + Uint8Array(150 000) = 150 KB ≈ 1.1 MB
//   vs a JS object array: ~5 MB (56-byte V8 object × 50k + GC overhead)
//
// Invariants:
//   0 <= len <= MAX_TRAIL_SEGS
//   capWarned = false until the first rejected segment; then true until cleared
//   labels: {x, y, text, r, g, b} in Logo coordinates, at most MAX_LABELS
//   fills:  {at, pts, r, g, b} sorted by at (BEGINFILL … ENDFILL), at most MAX_FILLS,
//           each with at most MAX_FILL_POINTS corners

export const MAX_TRAIL_SEGS  = 50000;
export const MAX_LABELS      = 500;
export const MAX_FILLS       = 1000;
export const MAX_FILL_POINTS = 10000;

export function createDrawing(): Drawing {
  return {
    f32: new Float32Array(MAX_TRAIL_SEGS * 5), // x1,y1,x2,y2,w
    u8:  new Uint8Array(MAX_TRAIL_SEGS * 3),   // r,g,b
    len: 0, capWarned: false,
    labels: [], labelCapWarned: false,
    fills: [], fillCapWarned: false,
  };
}
// clearDrawing: erase everything (CS, RUN with "clear screen on run", CLR).
export function clearDrawing(d: Drawing): void {
  d.len = 0; d.capWarned = false; d.labels = []; d.labelCapWarned = false; d.fills = []; d.fillCapWarned = false;
}

// segment(d, i) → [x1, y1, x2, y2, w, r, g, b] — convenience reader for tests / tools.
export type Segment = [x1: number, y1: number, x2: number, y2: number, w: number, r: number, g: number, b: number];
export function segment(d: Drawing, i: number): Segment {
  const fi = i * 5, ci = i * 3;
  return [d.f32[fi], d.f32[fi+1], d.f32[fi+2], d.f32[fi+3], d.f32[fi+4], d.u8[ci], d.u8[ci+1], d.u8[ci+2]];
}

// pushSegment(rctx, x1,y1,x2,y2,w, r,g,b, paint): store one segment and, when
// paint is true, draw it via rctx.io.paintLine. Returns false (and warns once)
// when the cap is reached.
//   trailPushIfRoom — store + paint (instant moves, SETPOS, DOT)
//   trailPushQuiet  — store only; for segments already painted step by step (animated move())
function pushSegment(rctx: RunContext, x1: number, y1: number, x2: number, y2: number, w: number,
                     r: number, g: number, b: number, paint: boolean): boolean {
  const d = rctx.session.drawing;
  if(d.len < MAX_TRAIL_SEGS){
    const fi = d.len * 5, ci = d.len * 3;
    d.f32[fi]=x1; d.f32[fi+1]=y1; d.f32[fi+2]=x2; d.f32[fi+3]=y2; d.f32[fi+4]=w;
    d.u8[ci]=r;   d.u8[ci+1]=g;   d.u8[ci+2]=b;
    d.len++;
    // Paint the stored (Float32-rounded) values so a later full repaint looks identical.
    if(paint) rctx.io.paintLine(d.f32[fi], d.f32[fi+1], d.f32[fi+2], d.f32[fi+3], d.f32[fi+4], r, g, b);
    return true;
  }
  if(!d.capWarned){
    d.capWarned = true;
    rctx.io.log('Trail limit reached ('+MAX_TRAIL_SEGS+' segments) — use CS to clear','err');
  }
  return false;
}
export function trailPushIfRoom(rctx: RunContext, x1: number, y1: number, x2: number, y2: number, w: number, r: number, g: number, b: number): boolean { return pushSegment(rctx, x1,y1,x2,y2,w, r,g,b, true); }
export function trailPushQuiet (rctx: RunContext, x1: number, y1: number, x2: number, y2: number, w: number, r: number, g: number, b: number): boolean { return pushSegment(rctx, x1,y1,x2,y2,w, r,g,b, false); }

// addLabel(rctx, lab): store + paint one LABEL; warns once at MAX_LABELS.
export function addLabel(rctx: RunContext, lab: Label): boolean {
  const d = rctx.session.drawing;
  if(d.labels.length >= MAX_LABELS){
    if(!d.labelCapWarned){ rctx.io.log('LABEL: label limit ('+MAX_LABELS+') reached — further labels ignored','info'); d.labelCapWarned = true; }
    return false;
  }
  d.labels.push(lab);
  rctx.io.paintLabel(lab);
  return true;
}

// ── Filled shapes ─────────────────────────────────────────────────────────────
// BEGINFILL starts recording the turtle's path (session.fillPath); every move,
// SETPOS / SETXY / SETX / SETY and HOME adds the point where the turtle ends up
// (notePoint), with the pen up or down. ENDFILL closes the path and stores it as a
// polygon painted in the pen colour BEGINFILL saw, under everything drawn after
// BEGINFILL (so the outline stays on top).

// beginFill(session): start (or restart) recording at the turtle.
export function beginFill(session: Session): void {
  const t = session.turtle;
  session.fillPath = { at: session.drawing.len, pts: [t.x, t.y], rgb: [...t.color] };
}
// notePoint(session): add the turtle position to the fill path, if one is recorded.
export function notePoint(session: Session): void {
  const fp = session.fillPath;
  if(!fp) return;
  const t = session.turtle, n = fp.pts.length;
  if(fp.pts[n - 2] === t.x && fp.pts[n - 1] === t.y) return;  // the turtle did not move
  if(n / 2 < MAX_FILL_POINTS) fp.pts.push(t.x, t.y);
}
// endFill(rctx): store and paint the recorded polygon. Paths of fewer than three
// corners fill nothing. Returns false when there was nothing to fill.
export function endFill(rctx: RunContext): boolean {
  const { session, io } = rctx, d = session.drawing, fp = session.fillPath;
  if(!fp) throw new Error('ENDFILL without BEGINFILL');
  session.fillPath = null;
  const p = fp.pts, n = p.length;
  if(n > 2 && p[n - 2] === p[0] && p[n - 1] === p[1]) p.length = n - 2;   // back at the start: the polygon closes itself
  if(p.length < 6) return false;
  if(d.fills.length >= MAX_FILLS){
    if(!d.fillCapWarned){ io.log('ENDFILL: fill limit ('+MAX_FILLS+') reached — use CS to clear','err'); d.fillCapWarned = true; }
    return false;
  }
  if(fp.pts.length / 2 >= MAX_FILL_POINTS) io.log('ENDFILL: the shape has more than '+MAX_FILL_POINTS+' corners — the rest is left out','info');
  const f = { at: Math.min(fp.at, d.len), pts: fp.pts, r: fp.rgb[0], g: fp.rgb[1], b: fp.rgb[2] };
  d.fills.push(f);
  // Nothing drawn since BEGINFILL: the fill goes on top, exactly as a full repaint
  // would show it. Otherwise repaint everything, so the fill lies under the outline.
  if(f.at === d.len) io.paintFill(f); else io.redraw();
  return true;
}
