import { clearDrawing, createDrawing } from '../turtle/drawing.js';
import { mkTurtle, resetTurtle } from '../turtle/state.js';

// ── Session ───────────────────────────────────────────────────────────────────
// Everything a Logo program can change, in one object. The page has one session
// (src/app.js); tests create a fresh one per case.
//   turtle    pose, pen, colour, width (turtle/state.js)
//   drawing   trail segments + labels (turtle/drawing.js)
//   globals   root variable scope — replaced by RUN and CLR
//   procs     user procedures NAME → { params, body } — cleared in place, never replaced
//   walkTick  cyclic 16-bit counter that drives the sprite animation
//   isMoving  true while move() animates (leg swing in the sprite)
export function createSession(){
  return {
    turtle:   mkTurtle(),
    drawing:  createDrawing(),
    globals:  {},
    procs:    {},
    walkTick: 0,
    isMoving: false,
  };
}

// clearScreen(session, io): erase trail + labels and reset the turtle. Shared by CS,
// RUN-with-"clear screen on run", and the CLR button. Variables and procedures stay.
export function clearScreen(session, io){
  clearDrawing(session.drawing);
  resetTurtle(session.turtle);
  io.redraw();
}
// clearProcs(session): forget all user procedures (RUN re-parses them; CLR).
export function clearProcs(session){
  for(const k of Object.keys(session.procs)) delete session.procs[k];
}
