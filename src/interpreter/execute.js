import { extractProcedures } from './procedures.js';
import { run } from './runtime.js';
import { STOP_SIGNAL } from './signals.js';
import { tokenize } from './tokenizer.js';

// ── Program execution (shared by RUN, direct mode and the unit tests) ─────────
// parseProgram(src, io): tokenize + extract procedures; reports a parse error via
//   io.log and returns null.
export function parseProgram(src, io){
  try { return extractProcedures(tokenize(src)); }
  catch(e){ io.log('✗ ' + (e.message || String(e)), 'err'); return null; }
}
// registerProcs(session, newProcs, io): merge parsed procedures into session.procs, logging each.
export function registerProcs(session, newProcs, io){
  Object.entries(newProcs).forEach(([name, proc]) => {
    session.procs[name] = proc;
    io.log('Defined: ' + name + (proc.params.length ? ' (' + proc.params.map(p => ':' + p).join(' ') + ')' : ''), 'info');
  });
}
// execute(tokens, rctx): run top-level tokens in the session's globals and report
//   the outcome: "✓ Done!", or the error with its source line. STOP_SIGNAL (OUCH
//   or the user's STOP) was already reported. Never throws.
export async function execute(tokens, rctx){
  try {
    await run(tokens, 0, rctx.session.globals, rctx);
    if(!rctx.stopped) rctx.io.log('✓ Done!', 'ok');
  } catch(e) {
    if(e !== STOP_SIGNAL) {
      const lineCtx = rctx.execLine.text ? '\n  line ' + rctx.execLine.n + ':  ' + rctx.execLine.text : '';
      rctx.io.log('✗ ' + (e.message || String(e)) + lineCtx, 'err');
    }
  } finally {
    rctx.session.isMoving = false;
  }
}
