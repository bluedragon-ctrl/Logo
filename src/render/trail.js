import { CH, CW, DPR, canvas } from './canvas.js';
import { resetTurtle } from '../turtle/state.js';
import { log } from '../ui/console.js';

// ── Trail storage (typed array layout) ───────────────────────────────────────
// Pen strokes are stored as line segments in two pre-allocated typed arrays.
// Writing a segment costs one trailPush() call; reading costs direct index math.
// There is no per-segment object allocation and no GC pressure at cap.
//
// Array layout — segment index i:
//   trailF32[i*5 + 0] = x1  (Logo world coords, Float32 — origin at canvas centre)
//   trailF32[i*5 + 1] = y1
//   trailF32[i*5 + 2] = x2
//   trailF32[i*5 + 3] = y2
//   trailF32[i*5 + 4] = w   (stroke width in pixels)
//   trailU8 [i*3 + 0] = r   (colour channels, Uint8 clamped 0–255)
//   trailU8 [i*3 + 1] = g
//   trailU8 [i*3 + 2] = b
//
// Memory at cap: Float32Array(250 000) = 1 000 KB + Uint8Array(150 000) = 150 KB ≈ 1.1 MB
//   vs a JS object array: ~5 MB (56-byte V8 object × 50k + GC overhead)
//
// Invariants:
//   0 <= trailLen <= MAX_TRAIL_SEGS  (trailLen never exceeds the array bound)
//   trailCapWarned = false until the first rejected segment; then always true
//   trailLen and trailCapWarned are both reset to 0/false by CS and RUN-with-clear
const MAX_TRAIL_SEGS = 50000;
const trailF32 = new Float32Array(MAX_TRAIL_SEGS * 5); // x1,y1,x2,y2,w
const trailU8  = new Uint8Array(MAX_TRAIL_SEGS * 3);   // r,g,b
let trailLen       = 0;     // number of committed segments (0..MAX_TRAIL_SEGS)
let trailCapWarned = false; // true once the cap-reached message has been shown

// ── Label store — text drawn by LABEL; replayed by rebuildTrailCanvas on resize.
export const MAX_LABELS = 500;
export let labelStore    = []; // {x, y, text, r, g, b} in Logo coordinates
export let labelCapWarned = false;
export function setLabelCapWarned(v){ labelCapWarned = v; }
export const trailCanvas=document.createElement('canvas');
const trailCtx=trailCanvas.getContext('2d');
// toCanvas: Logo world → canvas pixel.
// Logo: Cartesian, origin at centre, Y points UP.
// Canvas: top-left origin, Y points DOWN.
// Result: cx = width/2 + x,  cy = height/2 - y
export function toCanvas(x,y){ return [CW/2 + x, CH/2 - y]; }

// paintLine(): stroke one segment (or a DOT, when both ends coincide) onto trailCanvas
// WITHOUT storing it. Used directly by animated move() to show progress sub-step by
// sub-step; the finished line is stored once (trailPushQuiet) at the end of the move,
// so an animated FD costs one trail slot instead of ~1.2 per pixel.
export function paintLine(x1,y1,x2,y2,w,r,g,b){
  const hw = CW / 2, hh = CH / 2;
  if(x1 === x2 && y1 === y2) {
    // DOT: filled circle — diameter = w (matches pen width)
    trailCtx.fillStyle = `rgb(${r},${g},${b})`;
    trailCtx.beginPath();
    trailCtx.arc(hw + x1, hh - y1, w / 2, 0, Math.PI * 2);
    trailCtx.fill();
  } else {
    trailCtx.lineCap    = 'round';
    trailCtx.lineJoin   = 'round';
    trailCtx.strokeStyle = `rgb(${r},${g},${b})`;
    trailCtx.lineWidth   = w;
    trailCtx.beginPath();
    trailCtx.moveTo(hw + x1, hh - y1);
    trailCtx.lineTo(hw + x2, hh - y2);
    trailCtx.stroke();
  }
}
// paintSegment(): paint the stored segment at index trailLen-1.
// Must be called immediately after trailPush() — the implicit index is trailLen-1.
function paintSegment(){
  const fi = (trailLen - 1) * 5, ci = (trailLen - 1) * 3;
  paintLine(trailF32[fi], trailF32[fi+1], trailF32[fi+2], trailF32[fi+3], trailF32[fi+4],
            trailU8[ci], trailU8[ci+1], trailU8[ci+2]);
}

// trailPush(x1,y1,x2,y2,w, r,g,b): write one segment at index trailLen, then
// increment trailLen. Precondition: trailLen < MAX_TRAIL_SEGS (all callers check).
function trailPush(x1,y1,x2,y2,w, r,g,b){
  const fi = trailLen * 5, ci = trailLen * 3;
  trailF32[fi]=x1; trailF32[fi+1]=y1; trailF32[fi+2]=x2; trailF32[fi+3]=y2; trailF32[fi+4]=w;
  trailU8[ci]=r;   trailU8[ci+1]=g;   trailU8[ci+2]=b;
  trailLen++;
}

// trailPushIfRoom(x1,y1,x2,y2,w, r,g,b): guard + trailPush + paintSegment in one call.
// Returns true if the segment was written; false if the cap was already reached.
// Emits the cap warning once (on the first rejected segment) via trailCapWarned.
// Centralises the three formerly-independent cap-check blocks in move() and SETPOS.
export function trailPushIfRoom(x1,y1,x2,y2,w, r,g,b){
  if(trailLen < MAX_TRAIL_SEGS){
    trailPush(x1,y1,x2,y2,w, r,g,b);
    paintSegment();
    return true;
  }
  if(!trailCapWarned){
    trailCapWarned=true;
    log('Trail limit reached ('+MAX_TRAIL_SEGS+' segments) — use CS to clear','err');
  }
  return false;
}
// trailPushQuiet(): like trailPushIfRoom but without painting — for segments that
// were already painted incrementally (animated move()).
export function trailPushQuiet(x1,y1,x2,y2,w, r,g,b){
  if(trailLen < MAX_TRAIL_SEGS){ trailPush(x1,y1,x2,y2,w, r,g,b); return true; }
  if(!trailCapWarned){
    trailCapWarned=true;
    log('Trail limit reached ('+MAX_TRAIL_SEGS+' segments) — use CS to clear','err');
  }
  return false;
}
// clearScreen(): erase trail + labels and reset the turtle. Shared by CS,
// RUN-with-"clear screen on run", and the CLR button.
export function clearScreen(){
  trailLen=0; trailCapWarned=false; labelStore=[]; labelCapWarned=false;
  resetTurtle(); rebuildTrailCanvas();
}

// rebuildTrailCanvas(): repaint all committed segments onto trailCanvas from scratch.
// Called after canvas resize (trailCanvas must match main canvas dimensions) and
// after CS (trailLen is reset to 0 so the loop draws nothing, producing a clear canvas).
//
// Context state note: assigning to canvas.width/height resets the entire 2D context
// including lineCap/lineJoin, so these must be re-set before any drawing.
//
// Performance (OPT-5):
//   • toCanvas() inlined — hw/hh hoisted outside loop: 2 divisions per rebuild
//     instead of 4 per segment (~200k divisions saved at full cap).
//   • Colour batching: strokeStyle/lineWidth only written on change, not per segment.
//     lastR=-1 sentinel forces a strokeStyle write on the first segment.
// paintLabel — draw one label entry onto trailCanvas.
// Uses hw/hh of trailCanvas (same dims as canvas) to convert Logo → pixel coords.
export function paintLabel(lab){
  const hw=CW/2, hh=CH/2;
  trailCtx.save();
  trailCtx.fillStyle=`rgb(${lab.r},${lab.g},${lab.b})`;
  trailCtx.font='16px "VT323", monospace';
  trailCtx.fillText(lab.text, hw+lab.x, hh-lab.y);
  trailCtx.restore();
}

export function rebuildTrailCanvas(){
  trailCanvas.width=canvas.width; trailCanvas.height=canvas.height; // device pixels; also clears
  trailCtx.setTransform(DPR,0,0,DPR,0,0);              // draw in logical units
  trailCtx.lineCap='round'; trailCtx.lineJoin='round'; // re-apply after canvas reset
  const hw=CW/2, hh=CH/2; // hoisted
  // Colour batching via raw channel comparison — avoids string construction per segment.
  // lastR=-1 ensures the first segment always sets strokeStyle.
  let lastR=-1, lastG=0, lastB=0, lastW=0;
  for(let i=0; i<trailLen; i++){
    const fi=i*5, ci=i*3;
    const r=trailU8[ci], g=trailU8[ci+1], b=trailU8[ci+2], w=trailF32[fi+4];
    const x1=trailF32[fi], y1=trailF32[fi+1], x2=trailF32[fi+2], y2=trailF32[fi+3];
    if(x1===x2 && y1===y2){
      // DOT: filled circle — diameter = w
      trailCtx.fillStyle=`rgb(${r},${g},${b})`;
      trailCtx.beginPath();
      trailCtx.arc(hw+x1, hh-y1, w/2, 0, Math.PI*2);
      trailCtx.fill();
      lastR=-1; // reset batching: next line segment must re-set strokeStyle
    } else {
      if(r!==lastR || g!==lastG || b!==lastB){
        trailCtx.strokeStyle=`rgb(${r},${g},${b})`; lastR=r; lastG=g; lastB=b;
      }
      if(w!==lastW){ trailCtx.lineWidth=w; lastW=w; }
      trailCtx.beginPath();
      trailCtx.moveTo(hw+x1, hh-y1);
      trailCtx.lineTo(hw+x2, hh-y2);
      trailCtx.stroke();
    }
  }
  // Replay labels on top of trail segments
  labelStore.forEach(paintLabel);
}
