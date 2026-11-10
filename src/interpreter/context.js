// ── Run context ───────────────────────────────────────────────────────────────
// makeRunContext(speed, session, io): factory for per-run mutable interpreter state.
//   session:  what the program changes — turtle, drawing, globals, procs (session.js).
//   io:       the only way out to the screen / console (io.js). Never the DOM directly.
//   stopped:  kill-switch checked every step in runStack/move/rotate.
//             Set true by STOP/CLR buttons via haltRun() / activeRctx.
//   execLine: { n, text } of the most recently executed source line.
//             Updated from LINE_SEN sentinels; appended to error messages.
//   speed:    0–4 snapshot of the slider at RUN time; SPEED n updates it mid-run.
//             Passed to move/rotate so they never read the DOM directly.
//   procs:    session.procs (shortcut; the live user-procedure map).
//
// Note: 'rctx' is used as the parameter name throughout (not 'ctx') to avoid
// shadowing the module-level canvas 2D context also named 'ctx'.
//   globals:  root variable scope of this run (set by run()); MAKE falls back to it.
//   exprDepth: current expression nesting (parens, unary chains, procedures used
//             as values); capped by MAX_EXPR_DEPTH.
//   instantStepCount / tickCount / steps / lastYield: yield bookkeeping so the
//             browser stays responsive (and STOP clickable) in every program.
//   wake:     set while WAIT sleeps; haltRun() calls it to end the sleep early.
//   onFinish: optional callback run once the program has fully unwound (CLR uses it).
export function makeRunContext(speed, session, io) {
  return {
    session,
    io,
    stopped:          false,
    execLine:         { n: 0, text: '' },
    speed:            Math.max(0, Math.min(4, speed|0)), // 0=slowest animated … 4=instant
    procs:            session.procs,
    globals:          null,
    exprDepth:        0,
    instantStepCount: 0,  // flush counter for speed=4 (instant) path
    tickCount:        0,  // per-frame counter for instant commands (SETPOS/DOT/LABEL) when animated
    steps:            0,  // runStack iteration counter for the responsiveness yield
    lastYield:        Date.now(),
    wake:             null,
    onFinish:         null,
  };
}
export let activeRctx = null; // reference to the currently-executing run context; set by runProgram()
export function setActiveRctx(r){ activeRctx = r; }

// haltRun(): request the active program to stop (STOP / CLR buttons). Ends a WAIT early.
export function haltRun(){
  if(!activeRctx) return;
  activeRctx.stopped = true;
  if(activeRctx.wake) activeRctx.wake();
}
