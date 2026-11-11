import { createSession } from './interpreter/session.ts';
import type { LogoIO } from './interpreter/types.ts';
import { CH, CW } from './render/canvas.ts';
import { render } from './render/render.ts';
import { paintLabel, paintLine, rebuildTrailCanvas } from './render/trail.ts';
import { con, log, logs, optSpeed } from './ui/console.ts';

// ── The page's session and IO ─────────────────────────────────────────────────
// session: the one Logo session the page shows (turtle, drawing, variables,
//          procedures). Modules mutate its fields; nothing replaces the object.
// io:      the browser implementation of LogoIO (interpreter/io.js) — console,
//          canvas, animation frames. Passed to every run via makeRunContext.
export const session = createSession();

export const io: LogoIO = {
  log,
  logs,
  render,
  paintLine,
  paintLabel,
  redraw:     rebuildTrailCanvas,
  clearText:  () => { con.innerHTML = ''; },
  canvasSize: () => ({ w: CW, h: CH }),
  setSpeed:   (n: number) => { optSpeed.value = String(n); },
  nextFrame:  () => new Promise(res => requestAnimationFrame(res)),
  macroYield: () => new Promise(res => setTimeout(res, 0)),
};
