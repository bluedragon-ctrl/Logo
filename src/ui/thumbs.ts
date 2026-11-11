import { EXAMPLES } from '../examples.ts';
import { makeRunContext } from '../interpreter/context.ts';
import { execute, parseProgram, registerProcs } from '../interpreter/execute.ts';
import { headlessIO } from '../interpreter/io.ts';
import { createSession } from '../interpreter/session.ts';
import type { RunContext, Session } from '../interpreter/types.ts';
import { drawingBounds, paintDrawing } from '../render/paint.ts';
import { context2d } from '../util.ts';

// ── Example pictures ──────────────────────────────────────────────────────────
// Pictures of what an example draws, for the Examples cards and preview and the
// Commands panel's "Used in" chips. Each example is run headlessly once (its own
// session and a headless LogoIO, like the unit tests) on a THUMB_WORLD-sized
// canvas; the session is kept, so any number of canvases can show it at any size.
// Runs are queued one at a time, yielding to the page between examples.

const THUMB_WORLD = { width: 800, height: 600 };  // canvas size the examples run on
const THUMB_TIME_MS = 1500;                       // safety cap per example

// runForThumbnail(code): the session after running code headlessly. Yields resolve
// at once (no frames to wait for), so the time cap is checked inside them.
export async function runForThumbnail(code: string): Promise<Session> {
  const session = createSession();
  const io = headlessIO(THUMB_WORLD);
  const deadline = Date.now() + THUMB_TIME_MS;
  let rctx: RunContext | null = null;
  const yieldNow = () => { if(rctx && Date.now() > deadline) rctx.stopped = true; return Promise.resolve(); };
  io.nextFrame = yieldNow; io.macroYield = yieldNow;
  rctx = makeRunContext(4, session, io);
  const parsed = parseProgram(code, io);
  if(parsed){ registerProcs(session, parsed.newProcs, io); await execute(parsed.topLevel, rctx); }
  return session;
}

const sessions = new Map<number, Promise<Session>>();
let queue: Promise<unknown> = Promise.resolve();

// exampleSession(n): example n's finished drawing (run once, then cached).
export function exampleSession(n: number): Promise<Session> {
  let p = sessions.get(n);
  if(!p){
    p = queue.then(() => runForThumbnail(EXAMPLES[n].code));
    queue = p.then(() => new Promise(r => setTimeout(r, 0)));
    sessions.set(n, p);
  }
  return p;
}

// paintExample(cv, n, w, h): draw example n into canvas cv of w × h CSS pixels.
// The canvas's own background is CSS (the beige of the main canvas); SETBG paints
// over it. The drawing (plus a margin) is fitted keeping its aspect ratio, never
// enlarged more than 1.5×, so a small square stays small-ish.
export async function paintExample(cv: HTMLCanvasElement, n: number, w: number, h: number): Promise<void> {
  const session = await exampleSession(n);
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const c = context2d(cv);
  if(session.background){ c.fillStyle = 'rgb(' + session.background.join(',') + ')'; c.fillRect(0, 0, cv.width, cv.height); } // SETBG
  const b = drawingBounds(session.drawing);
  if(!b) return;
  const m = Math.max(4, Math.round(w / 16)), bw = Math.max(b.x1 - b.x0, 1), bh = Math.max(b.y1 - b.y0, 1);
  const s = Math.min((w - 2*m) / bw, (h - 2*m) / bh, 1.5);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  // Logo (x, y) → canvas (w/2 + (x - cx)·s, h/2 - (y - cy)·s)
  c.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w/2 - cx*s), dpr * (h/2 + cy*s));
  paintDrawing(c, session.drawing, 0, 0, 1 / s);   // at least one CSS pixel wide
}
