import { editor } from '../editor/editor.ts';
import { EXAMPLES } from '../examples.ts';
import { makeRunContext } from '../interpreter/context.ts';
import { execute, parseProgram, registerProcs } from '../interpreter/execute.ts';
import { headlessIO } from '../interpreter/io.ts';
import { createSession } from '../interpreter/session.ts';
import type { RunContext } from '../interpreter/types.ts';
import { drawingBounds, paintDrawing } from '../render/paint.ts';
import { byId, context2d, escHtml } from '../util.ts';

// ── Examples panel ────────────────────────────────────────────────────────────
// A compact grid of cards: a small picture of what the example draws, its title
// and description. Clicking a card loads the code into the editor (one undo step).
//
// The pictures are drawn by running each example headlessly (its own session and
// a headless LogoIO, like the unit tests) on a THUMB_WORLD-sized canvas, then
// painting its drawing scaled to fit the card. They are made once, the first time
// the panel opens, one example at a time so the page stays responsive.

const THUMB_W = 132, THUMB_H = 99;               // CSS pixels
const THUMB_WORLD = { width: 800, height: 600 };  // canvas size the examples run on
const THUMB_TIME_MS = 1500;                       // safety cap per example

// runForThumbnail(code): the session after running code headlessly. Yields resolve
// at once (no frames to wait for), so the time cap is checked inside them.
export async function runForThumbnail(code: string) {
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

// paintThumbnail: the canvas's background is CSS (the beige of the main canvas). Fit the drawing (plus a margin) into the canvas, keeping the
// aspect ratio; never enlarge more than 1.5×, so a small square stays small-ish.
function paintThumbnail(cv: HTMLCanvasElement, code: string): Promise<void> {
  return runForThumbnail(code).then(session => {
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(THUMB_W * dpr); cv.height = Math.round(THUMB_H * dpr);
    const c = context2d(cv);
    if(session.background){ c.fillStyle = 'rgb(' + session.background.join(',') + ')'; c.fillRect(0, 0, cv.width, cv.height); } // SETBG
    const b = drawingBounds(session.drawing);
    if(!b) return;
    const m = 8, bw = Math.max(b.x1 - b.x0, 1), bh = Math.max(b.y1 - b.y0, 1);
    const s = Math.min((THUMB_W - 2*m) / bw, (THUMB_H - 2*m) / bh, 1.5);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    // Logo (x, y) → thumbnail (THUMB_W/2 + (x - cx)·s, THUMB_H/2 - (y - cy)·s)
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * (THUMB_W/2 - cx*s), dpr * (THUMB_H/2 + cy*s));
    paintDrawing(c, session.drawing, 0, 0, 1 / s);   // at least one CSS pixel wide
  });
}

const grid = byId('ex-grid');
EXAMPLES.forEach(function(ex, n){
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'ex-card';
  card.dataset.n = String(n);
  card.innerHTML = '<canvas class="ex-thumb" width="' + THUMB_W + '" height="' + THUMB_H + '"></canvas>'
                 + '<span class="ex-text"><span class="ex-title">' + escHtml(ex.title) + '</span>'
                 + '<span class="ex-desc">' + escHtml(ex.desc) + '</span></span>';
  card.onclick = function(){
    editor.setValue(ex.code);
    byId('ex-overlay').classList.remove('open');
    editor.focus();
  };
  grid.appendChild(card);
});

// Pictures: made on the first open, in order, yielding to the page between examples.
let thumbsStarted = false;
byId('btn-examples').addEventListener('click', () => setTimeout(async () => {
  if(thumbsStarted || !byId('ex-overlay').classList.contains('open')) return;
  thumbsStarted = true;
  const cards = grid.querySelectorAll<HTMLElement>('.ex-card');
  for(let n = 0; n < EXAMPLES.length; n++){
    const cv = cards[n].querySelector('canvas');
    if(cv) await paintThumbnail(cv, EXAMPLES[n].code);
    await new Promise(r => setTimeout(r, 0));
  }
  grid.dataset.thumbs = 'done';   // for the browser test
}, 0));
