import { CH, CW, DPR, canvas } from './canvas.js';
import { session } from '../app.js';

// ── Trail layer ───────────────────────────────────────────────────────────────
// trailCanvas caches everything the turtle has drawn, so render() composites it
// in one blit. The data itself (segments + labels) lives in session.drawing
// (turtle/drawing.js); this module only paints it.
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

// rebuildTrailCanvas(): repaint all stored segments and labels onto trailCanvas from
// scratch. Called after canvas resize (trailCanvas must match main canvas dimensions)
// and after CS (io.redraw — the drawing is empty, producing a clear canvas).
//
// Context state note: assigning to canvas.width/height resets the entire 2D context
// including lineCap/lineJoin, so these must be re-set before any drawing.
//
// Performance (OPT-5):
//   • toCanvas() inlined — hw/hh hoisted outside loop: 2 divisions per rebuild
//     instead of 4 per segment (~200k divisions saved at full cap).
//   • Colour batching: strokeStyle/lineWidth only written on change, not per segment.
//     lastR=-1 sentinel forces a strokeStyle write on the first segment.
export function rebuildTrailCanvas(){
  trailCanvas.width=canvas.width; trailCanvas.height=canvas.height; // device pixels; also clears
  trailCtx.setTransform(DPR,0,0,DPR,0,0);              // draw in logical units
  trailCtx.lineCap='round'; trailCtx.lineJoin='round'; // re-apply after canvas reset
  const hw=CW/2, hh=CH/2; // hoisted
  // Colour batching via raw channel comparison — avoids string construction per segment.
  // lastR=-1 ensures the first segment always sets strokeStyle.
  const { f32: trailF32, u8: trailU8, len: trailLen, labels } = session.drawing;
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
  labels.forEach(paintLabel);
}
