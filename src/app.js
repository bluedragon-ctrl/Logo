import { createSession } from './interpreter/session.js';
import { CH, CW } from './render/canvas.js';
import { render } from './render/render.js';
import { paintLabel, paintLine, rebuildTrailCanvas } from './render/trail.js';
import { con, log, optSpeed } from './ui/console.js';

// ── The page's session and IO ─────────────────────────────────────────────────
// session: the one Logo session the page shows (turtle, drawing, variables,
//          procedures). Modules mutate its fields; nothing replaces the object.
// io:      the browser implementation of LogoIO (interpreter/io.js) — console,
//          canvas, animation frames. Passed to every run via makeRunContext.
export const session = createSession();

export const io = {
  log,
  render,
  paintLine,
  paintLabel,
  redraw:     rebuildTrailCanvas,
  clearText:  () => { con.innerHTML = ''; },
  canvasSize: () => ({ w: CW, h: CH }),
  setSpeed:   n => { optSpeed.value = n; },
  nextFrame:  () => new Promise(res => requestAnimationFrame(res)),
  macroYield: () => new Promise(res => setTimeout(res, 0)),
};
