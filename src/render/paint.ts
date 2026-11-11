import type { Drawing, Fill, Label } from '../interpreter/types.ts';

// ── Painting a drawing ────────────────────────────────────────────────────────
// Pure painters from session.drawing (turtle/drawing.ts) onto any 2D context,
// with no module state. Used by the trail layer (render/trail.ts) and by the
// example thumbnails (ui/examples-overlay.ts), so both look the same.
// (hw, hh) is where the Logo origin lands, in the context's current units:
//   Logo (x, y) → canvas (hw + x, hh - y)   (Logo y points up)

export const LABEL_FONT = '16px "VT323", monospace';

// paintLabelOn: one LABEL entry.
export function paintLabelOn(c: CanvasRenderingContext2D, lab: Label, hw: number, hh: number): void {
  c.save();
  c.fillStyle = `rgb(${lab.r},${lab.g},${lab.b})`;
  c.font = LABEL_FONT;
  c.fillText(lab.text, hw + lab.x, hh - lab.y);
  c.restore();
}

// paintFillOn: one filled polygon (BEGINFILL … ENDFILL). Non-zero winding, so a
// star drawn with REPEAT 5 [ FD 100 RT 144 ] is filled completely.
export function paintFillOn(c: CanvasRenderingContext2D, f: Fill, hw: number, hh: number): void {
  const p = f.pts;
  c.fillStyle = `rgb(${f.r},${f.g},${f.b})`;
  c.beginPath();
  c.moveTo(hw + p[0], hh - p[1]);
  for(let k = 2; k < p.length; k += 2) c.lineTo(hw + p[k], hh - p[k + 1]);
  c.closePath();
  c.fill('nonzero');
}

// paintDrawing: every stored segment (a DOT is a zero-length segment, painted as a
// filled circle of diameter = width), each fill just before the segments drawn
// after its BEGINFILL (fill.at), then the labels on top.
// minWidth: thinnest stroke in context units (thumbnails scale down; keep lines visible).
//
// Performance (OPT-5): hw/hh hoisted; strokeStyle / lineWidth written only when they
// change (raw channel comparison, no string per segment). lastR = -1 forces the first write.
export function paintDrawing(c: CanvasRenderingContext2D, d: Drawing, hw: number, hh: number, minWidth = 0): void {
  c.lineCap = 'round'; c.lineJoin = 'round';
  const { f32, u8, len } = d;
  let lastR = -1, lastG = 0, lastB = 0, lastW = 0, nextFill = 0;
  const fills = d.fills;
  for(let i = 0; i < len; i++){
    while(nextFill < fills.length && fills[nextFill].at <= i){ paintFillOn(c, fills[nextFill++], hw, hh); lastR = -1; }
    const fi = i*5, ci = i*3;
    const r = u8[ci], g = u8[ci+1], b = u8[ci+2], w = Math.max(f32[fi+4], minWidth);
    const x1 = f32[fi], y1 = f32[fi+1], x2 = f32[fi+2], y2 = f32[fi+3];
    if(x1 === x2 && y1 === y2){
      c.fillStyle = `rgb(${r},${g},${b})`;
      c.beginPath();
      c.arc(hw + x1, hh - y1, w / 2, 0, Math.PI * 2);
      c.fill();
      lastR = -1; // the next line segment must re-set strokeStyle
    } else {
      if(r !== lastR || g !== lastG || b !== lastB){ c.strokeStyle = `rgb(${r},${g},${b})`; lastR = r; lastG = g; lastB = b; }
      if(w !== lastW){ c.lineWidth = w; lastW = w; }
      c.beginPath();
      c.moveTo(hw + x1, hh - y1);
      c.lineTo(hw + x2, hh - y2);
      c.stroke();
    }
  }
  while(nextFill < fills.length) paintFillOn(c, fills[nextFill++], hw, hh);
  for(const lab of d.labels) paintLabelOn(c, lab, hw, hh);
}

// drawingBounds: bounding box of the segments, fills and label anchors, or null when empty.
export function drawingBounds(d: Drawing): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number, pad: number) => {
    x0 = Math.min(x0, x - pad); x1 = Math.max(x1, x + pad);
    y0 = Math.min(y0, y - pad); y1 = Math.max(y1, y + pad);
  };
  for(let i = 0; i < d.len; i++){
    const fi = i*5, pad = d.f32[fi+4] / 2;
    grow(d.f32[fi], d.f32[fi+1], pad); grow(d.f32[fi+2], d.f32[fi+3], pad);
  }
  for(const f of d.fills) for(let k = 0; k < f.pts.length; k += 2) grow(f.pts[k], f.pts[k + 1], 0);
  for(const lab of d.labels){ grow(lab.x, lab.y, 0); grow(lab.x + 8 * lab.text.length, lab.y + 12, 0); }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
