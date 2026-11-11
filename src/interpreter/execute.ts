import { paramList } from './expr.ts';
import { extractProcedures } from './procedures.ts';
import { run } from './runtime.ts';
import { STOP_SIGNAL } from './signals.ts';
import { tokenize } from './tokenizer.ts';
import type { LogoIO, ProcMap, RunContext, Session, Token } from './types.ts';

// errorText: the message of anything thrown.
export const errorText = (e: unknown): string => e instanceof Error ? e.message : String(e);

// ── Program execution (shared by RUN, direct mode and the unit tests) ─────────
// parseProgram(src, io): tokenize + extract procedures; reports a parse error via
//   io.log and returns null.
export function parseProgram(src: string, io: LogoIO): { topLevel: Token[]; newProcs: ProcMap } | null {
  try { return extractProcedures(tokenize(src)); }
  catch(e){ io.log('✗ ' + errorText(e), 'err'); return null; }
}
// registerProcs(session, newProcs, io): merge parsed procedures into session.procs, logging each.
export function registerProcs(session: Session, newProcs: ProcMap, io: LogoIO): void {
  Object.entries(newProcs).forEach(([name, proc]) => {
    session.procs[name] = proc;
    io.log('Defined: ' + name + (proc.params.length ? ' (' + paramList(proc) + ')' : ''), 'info');
  });
}
// execute(tokens, rctx): run top-level tokens in the session's globals and report
//   the outcome: "✓ Done!", or the error with its source line. STOP_SIGNAL (OUCH
//   or the user's STOP) was already reported. Never throws.
export async function execute(tokens: Token[], rctx: RunContext): Promise<void> {
  try {
    await run(tokens, 0, rctx.session.globals, rctx);
    if(!rctx.stopped) rctx.io.log('✓ Done!', 'ok');
  } catch(e) {
    if(e !== STOP_SIGNAL) {
      const lineCtx = rctx.execLine.text ? '\n  line ' + rctx.execLine.n + ':  ' + rctx.execLine.text : '';
      rctx.io.log('✗ ' + errorText(e) + lineCtx, 'err');
    }
  } finally {
    rctx.session.isMoving = false;
  }
}
