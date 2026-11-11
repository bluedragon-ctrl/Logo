// ── Control-flow sentinels ─────────────────────────────────────────────────────
// STOP_SIGNAL is thrown when a run must end immediately without an error:
// the turtle hit the canvas edge ("OUCH!"), or the user pressed STOP while an
// expression-context procedure was running. Caught by runProgram().
// Logo's STOP / OUTPUT / BREAK / CONTINUE never throw — runStack unwinds its
// own frame stack for them.
//
// MAX_STACK_FRAMES caps the runStack frame stack (non-tail recursion depth).
export const STOP_SIGNAL: Readonly<{ __stop__: true }> = Object.freeze({ __stop__: true }); // frozen: accidental write would silently break STOP handling
export const MAX_STACK_FRAMES = 10000;
