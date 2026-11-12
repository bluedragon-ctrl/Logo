import { formatNum } from '../interpreter/scope.ts';
import { addLabel, trailPushIfRoom } from './drawing.ts';
import { clipToCanvas } from './motion.ts';
import type { PlotFrame, RunContext } from '../interpreter/types.ts';

// ── Plot frame (SETPLOT / PLOT / AXES / PLOTX / PLOTY) ────────────────────────
// SETPLOT xmin xmax ymin ymax stores a graph range in session.plot. It does not
// change the turtle's own coordinates: FD, SETPOS, XCOR … stay in canvas steps.
// Only PLOT (go to a graph point), AXES and PLOTX / PLOTY use the range.
//
// The range fills the plot area: the canvas minus PLOT_MARGIN steps on every side
// (room for the axis labels). The mapping is worked out again on every use from
// io.canvasSize(), so a program fits any window. Normally x and y are stretched
// separately; with "EQUAL both get the smaller scale and the range is widened
// (around its centre) to fill the area, so a circle stays round.

export const PLOT_MARGIN = 40;
const TICK = 4;             // tick mark: this many steps on each side of the axis
const MIN_TICK_GAP = 4;     // ticks closer than this are an error (step too small)
const LABEL_GAP_X = 45, LABEL_GAP_Y = 22;   // labels are thinned to at least this far apart
const CHAR_W = 7;           // approximate width of one LABEL character (VT323 16 px)

/** Graph → canvas: canvas = (graph − centre) × scale. hw / hh: half the plot area. */
export interface PlotMapping { sx: number; sy: number; cx: number; cy: number; hw: number; hh: number }

const snap = (v: number): number => Math.round(v * 1e9) / 1e9;

export function plotMapping(f: PlotFrame, size: { w: number; h: number }): PlotMapping {
  const hw = Math.max(1, size.w - 2 * PLOT_MARGIN) / 2, hh = Math.max(1, size.h - 2 * PLOT_MARGIN) / 2;
  let sx = 2 * hw / (f.xmax - f.xmin), sy = 2 * hh / (f.ymax - f.ymin);
  if(f.equal) sx = sy = Math.min(sx, sy);
  return { sx, sy, cx: (f.xmin + f.xmax) / 2, cy: (f.ymin + f.ymax) / 2, hw, hh };
}
export function toCanvas(m: PlotMapping, x: number, y: number): [number, number] {
  return [snap((x - m.cx) * m.sx), snap((y - m.cy) * m.sy)];
}
export function fromCanvas(m: PlotMapping, px: number, py: number): [number, number] {
  return [m.cx + px / m.sx, m.cy + py / m.sy];
}
/** Is a canvas point inside the plot area (edges included)? */
export function inPlotArea(m: PlotMapping, px: number, py: number): boolean {
  return Math.abs(px) <= m.hw + 1e-9 && Math.abs(py) <= m.hh + 1e-9;   // false for NaN / ±Infinity
}

// requirePlot(rctx, cmd): the frame, or an error that says how to make one.
export function requirePlot(rctx: RunContext, cmd: string): PlotFrame {
  const f = rctx.session.plot;
  if(!f) throw new Error(cmd + ': no graph range yet — start with SETPLOT xmin xmax ymin ymax');
  return f;
}

// makePlotFrame(xmin, xmax, ymin, ymax, equal): checks the range (SETPLOT's errors).
export function makePlotFrame(xmin: number, xmax: number, ymin: number, ymax: number, equal: boolean): PlotFrame {
  if(xmin >= xmax) throw new Error('SETPLOT: xmin (' + formatNum(xmin) + ') must be less than xmax (' + formatNum(xmax) + ')');
  if(ymin >= ymax) throw new Error('SETPLOT: ymin (' + formatNum(ymin) + ') must be less than ymax (' + formatNum(ymax) + ')');
  return { xmin, xmax, ymin, ymax, equal, outside: null };
}

// ── PLOT: where to draw ───────────────────────────────────────────────────────
// A point outside the plot area (or not a finite number) breaks the line: the
// line from the turtle is drawn up to the area's edge, and the turtle waits
// there. The next point inside starts a new line where the curve comes back in,
// so y = 1 / x draws both branches without a line along the asymptote. A line
// between two points that are both outside is not drawn.
//   plotStep → { jump?, to?, exit? }: jump the turtle to `jump` without drawing,
//   then go to `to` (a line if the pen is down); or, for a point outside, go to
//   `exit` (on the edge) if the line leaves the area here.
export interface PlotStep { jump?: [number, number]; to?: [number, number]; exit?: [number, number] }

export function plotStep(rctx: RunContext, x: number, y: number): PlotStep {
  const f = requirePlot(rctx, 'PLOT'), t = rctx.session.turtle;
  const m = plotMapping(f, rctx.io.canvasSize());
  const [px, py] = toCanvas(m, x, y), w = 2 * m.hw, h = 2 * m.hh;
  if(inPlotArea(m, px, py)) {
    const prev = f.outside;
    f.outside = null;
    if(prev && t.pen) {
      const entry = isFinite(prev[0]) && isFinite(prev[1]) ? clipToCanvas(px, py, prev[0], prev[1], w, h) : null;
      return { jump: entry ? [snap(entry[0]), snap(entry[1])] : [px, py], to: [px, py] };
    }
    return { to: [px, py] };
  }
  const wasInside = !f.outside;
  f.outside = [px, py];
  if(wasInside && t.pen && inPlotArea(m, t.x, t.y) && isFinite(px) && isFinite(py)) {
    const exit = clipToCanvas(t.x, t.y, px, py, w, h);
    if(exit) return { exit: [snap(exit[0]), snap(exit[1])] };
  }
  return {};
}

// ── AXES xstep ystep ──────────────────────────────────────────────────────────
// Both axes across the plot area, in the pen colour and width, with a tick mark
// at every multiple of the step and number labels (thinned to every 2nd, 5th,
// 10th … tick when they would crowd). An axis is drawn through 0 when 0 is in
// the range, otherwise along the bottom / left edge of the area. The turtle
// does not move; the pen may be up.
export function drawAxes(rctx: RunContext, xstep: number, ystep: number): void {
  const f = requirePlot(rctx, 'AXES'), t = rctx.session.turtle;
  for(const s of [xstep, ystep]) if(!(s > 0) || !isFinite(s)) throw new Error('AXES: a step must be a number > 0, got ' + formatNum(s));
  const m = plotMapping(f, rctx.io.canvasSize());
  for(const [s, scale] of [[xstep, m.sx], [ystep, m.sy]])
    if(s * scale < MIN_TICK_GAP) throw new Error('AXES: a step of ' + formatNum(s) + ' puts the ticks too close together for this range — use a bigger step');

  const [xlo, ylo] = fromCanvas(m, -m.hw, -m.hh), [xhi, yhi] = fromCanvas(m, m.hw, m.hh);
  const gx0 = xlo <= 0 && 0 <= xhi ? 0 : xlo, gy0 = ylo <= 0 && 0 <= yhi ? 0 : ylo;   // where the axes cross
  const [ax, ay] = toCanvas(m, gx0, gy0);
  const [r, g, b] = t.color, w = t.width;
  const line = (x0: number, y0: number, x1: number, y1: number): void => { trailPushIfRoom(rctx, x0, y0, x1, y1, w, r, g, b); };
  const label = (x: number, y: number, text: string): void => { addLabel(rctx, { x, y, text, r, g, b }); };

  line(-m.hw, ay, m.hw, ay);
  line(ax, -m.hh, ax, m.hh);
  const ticks = (lo: number, hi: number, step: number, scale: number, minGap: number, at: (v: number, text: string, showLabel: boolean) => void): void => {
    let every = 1;   // label every 1st, 2nd, 5th, 10th, 20th … tick
    search: for(let p = 1; p <= 1e6; p *= 10) for(const k of [1, 2, 5]) if(k * p * step * scale >= minGap){ every = k * p; break search; }
    const first = Math.ceil(lo / step - 1e-9), last = Math.floor(hi / step + 1e-9);
    for(let k = first; k <= last; k++) {
      const v = Number((k * step).toPrecision(12));
      at(v, formatNum(v), k % every === 0);
    }
  };
  ticks(xlo, xhi, xstep, m.sx, LABEL_GAP_X, (v, text, showLabel) => {
    const [px] = toCanvas(m, v, gy0);
    line(px, ay - TICK, px, ay + TICK);
    if(showLabel && !(v === gx0 && gx0 === 0)) label(px - text.length * CHAR_W / 2, ay - TICK - 14, text);
  });
  ticks(ylo, yhi, ystep, m.sy, LABEL_GAP_Y, (v, text, showLabel) => {
    const [, py] = toCanvas(m, gx0, v);
    line(ax - TICK, py, ax + TICK, py);
    if(showLabel && !(v === gy0 && gy0 === 0)) label(ax - TICK - 3 - text.length * CHAR_W, py - 5, text);
  });
  if(gx0 === 0 && gy0 === 0) label(ax - TICK - 3 - CHAR_W, ay - TICK - 14, '0');   // the origin, once
}
