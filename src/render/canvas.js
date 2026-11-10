// ── Canvas setup ──────────────────────────────────────────────────────────────
// canvas/ctx  — the main visible canvas; redrawn every frame by render().
// con         — the console log panel DOM element; appended to by log().
// imageSmoothingEnabled=false keeps pixel-art sprite edges crisp when scaled.
export const canvas = document.getElementById('c');
export const ctx    = canvas.getContext('2d');


// HiDPI: CW/CH are the LOGICAL canvas size in CSS pixels (= Logo world units).
// The backing store is CW*DPR × CH*DPR device pixels; every context draws through
// setTransform(DPR,…) so all drawing code works in logical units. Always use CW/CH
// (never canvas.width/height) for geometry. Set by resizeCanvas().
export let CW = 0, CH = 0, DPR = 1;
export function setCanvasSize(w, h, dpr){ CW = w; CH = h; DPR = dpr; }
