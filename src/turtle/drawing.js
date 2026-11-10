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
export const MAX_TRAIL_SEGS = 50000;
export const MAX_LABELS     = 500;

export function createDrawing(){
  return {
    f32: new Float32Array(MAX_TRAIL_SEGS * 5), // x1,y1,x2,y2,w
    u8:  new Uint8Array(MAX_TRAIL_SEGS * 3),   // r,g,b
    len: 0, capWarned: false,
    labels: [], labelCapWarned: false,
  };
}
// clearDrawing: erase everything (CS, RUN with "clear screen on run", CLR).
export function clearDrawing(d){ d.len = 0; d.capWarned = false; d.labels = []; d.labelCapWarned = false; }

// segment(d, i) → [x1, y1, x2, y2, w, r, g, b] — convenience reader for tests / tools.
export function segment(d, i){
  const fi = i * 5, ci = i * 3;
  return [d.f32[fi], d.f32[fi+1], d.f32[fi+2], d.f32[fi+3], d.f32[fi+4], d.u8[ci], d.u8[ci+1], d.u8[ci+2]];
}

// pushSegment(rctx, x1,y1,x2,y2,w, r,g,b, paint): store one segment and, when
// paint is true, draw it via rctx.io.paintLine. Returns false (and warns once)
// when the cap is reached.
//   trailPushIfRoom — store + paint (instant moves, SETPOS, DOT)
//   trailPushQuiet  — store only; for segments already painted step by step (animated move())
function pushSegment(rctx, x1,y1,x2,y2,w, r,g,b, paint){
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
export function trailPushIfRoom(rctx, x1,y1,x2,y2,w, r,g,b){ return pushSegment(rctx, x1,y1,x2,y2,w, r,g,b, true); }
export function trailPushQuiet (rctx, x1,y1,x2,y2,w, r,g,b){ return pushSegment(rctx, x1,y1,x2,y2,w, r,g,b, false); }

// addLabel(rctx, lab): store + paint one LABEL; warns once at MAX_LABELS.
export function addLabel(rctx, lab){
  const d = rctx.session.drawing;
  if(d.labels.length >= MAX_LABELS){
    if(!d.labelCapWarned){ rctx.io.log('LABEL: label limit ('+MAX_LABELS+') reached — further labels ignored','info'); d.labelCapWarned = true; }
    return false;
  }
  d.labels.push(lab);
  rctx.io.paintLabel(lab);
  return true;
}
