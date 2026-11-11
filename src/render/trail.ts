import { CH, CW, DPR, canvas } from './canvas.ts';
import { session } from '../app.ts';
import type { Fill, Label } from '../interpreter/types.ts';
import { context2d } from '../util.ts';
import { paintDrawing, paintFillOn, paintLabelOn } from './paint.ts';

// ── Trail layer ───────────────────────────────────────────────────────────────
// trailCanvas caches everything the turtle has drawn, so render() composites it
// in one blit. The data itself (segments + labels) lives in session.drawing
// (turtle/drawing.js); this module only paints it.
export const trailCanvas=document.createElement('canvas');
const trailCtx=context2d(trailCanvas);
// toCanvas: Logo world → canvas pixel.
// Logo: Cartesian, origin at centre, Y points UP.
// Canvas: top-left origin, Y points DOWN.
// Result: cx = width/2 + x,  cy = height/2 - y
export function toCanvas(x: number, y: number): [number, number] { return [CW/2 + x, CH/2 - y]; }

// paintLine(): stroke one segment (or a DOT, when both ends coincide) onto trailCanvas
// WITHOUT storing it. Used directly by animated move() to show progress sub-step by
// sub-step; the finished line is stored once (trailPushQuiet) at the end of the move,
// so an animated FD costs one trail slot instead of ~1.2 per pixel.
export function paintLine(x1: number, y1: number, x2: number, y2: number, w: number, r: number, g: number, b: number): void {
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
export function paintLabel(lab: Label): void { paintLabelOn(trailCtx, lab, CW/2, CH/2); }
// paintFill — draw one fill onto trailCanvas (on top: nothing was drawn after its BEGINFILL).
export function paintFill(f: Fill): void { paintFillOn(trailCtx, f, CW/2, CH/2); }

// rebuildTrailCanvas(): repaint all stored segments and labels onto trailCanvas from
// scratch (render/paint.ts). Called after canvas resize (trailCanvas must match the
// main canvas) and after CS (io.redraw — the drawing is empty: a clear canvas).
// Assigning canvas.width/height resets the whole 2D context; paintDrawing re-sets
// lineCap / lineJoin.
export function rebuildTrailCanvas(){
  trailCanvas.width=canvas.width; trailCanvas.height=canvas.height; // device pixels; also clears
  trailCtx.setTransform(DPR,0,0,DPR,0,0);              // draw in logical units
  paintDrawing(trailCtx, session.drawing, CW/2, CH/2);
}
