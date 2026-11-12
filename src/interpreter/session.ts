import { clearDrawing, createDrawing } from '../turtle/drawing.ts';
import { mkTurtle, resetTurtle } from '../turtle/state.ts';
import type { LogoIO, Session } from './types.ts';

// ── Session ───────────────────────────────────────────────────────────────────
// Everything a Logo program can change, in one object. The page has one session
// (src/app.ts); tests create a fresh one per case.
//   turtle    pose, pen, colour, width (turtle/state.ts)
//   drawing   trail segments + labels + fills (turtle/drawing.ts)
//   globals   root variable scope — replaced by RUN and CLR
//   procs     user procedures NAME → { params, required, defaults, body } — cleared in place, never replaced
//   walkTick  cyclic 16-bit counter that drives the sprite animation
//   isMoving  true while move() animates (leg swing in the sprite)
//   background  SETBG colour, or null for the Options canvas style
//   edge      WRAP / WINDOW / FENCE — what the canvas edge does
//   fillPath  the path recorded since BEGINFILL, or null
//   plot      the SETPLOT frame (turtle/plot.ts), or null
export function createSession(): Session {
  return {
    turtle:   mkTurtle(),
    drawing:  createDrawing(),
    globals:  {},
    procs:    {},
    walkTick: 0,
    isMoving: false,
    background: null,
    edge:     'fence',
    fillPath: null,
    plot:     null,
  };
}

// clearScreen(session, io): erase trail + labels and reset the turtle. Shared by CS,
// RUN-with-"clear screen on run", and the CLR button. Variables and procedures stay.
// The SETBG background, the edge mode (WRAP / WINDOW / FENCE) and the SETPLOT frame
// are reset too, except by CS (keepSettings), as in UCBLogo. A BEGINFILL in progress
// is dropped; a broken PLOT line starts afresh.
export function clearScreen(session: Session, io: LogoIO, opts: { keepSettings?: boolean } = {}): void {
  clearDrawing(session.drawing);
  session.fillPath = null;
  if(!opts.keepSettings){ session.background = null; session.edge = 'fence'; session.plot = null; }
  else if(session.plot) session.plot.outside = null;
  resetTurtle(session.turtle);
  io.redraw();
}
// clearProcs(session): forget all user procedures (RUN re-parses them; CLR).
export function clearProcs(session: Session): void {
  for(const k of Object.keys(session.procs)) delete session.procs[k];
}
