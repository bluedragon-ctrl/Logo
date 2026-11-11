// runLogo(src, opts): run a Logo program headlessly the way the RUN button does
// (fresh session, parse, define procedures, run at instant speed).
// Returns { out, io, session, rctx }: out is the console text joined with '\n'.
import { makeRunContext } from '../../src/interpreter/context.ts';
import { execute, parseProgram, registerProcs } from '../../src/interpreter/execute.ts';
import { headlessIO } from '../../src/interpreter/io.ts';
import { createSession } from '../../src/interpreter/session.ts';
import type { HeadlessIO } from '../../src/interpreter/io.ts';
import type { RunContext, Session } from '../../src/interpreter/types.ts';

export interface RunOptions { speed?: number; width?: number; height?: number; session?: Session }
export interface RunResult { out: string; io: HeadlessIO; session: Session; rctx: RunContext }

export async function runLogo(src: string, { speed = 4, width = 800, height = 600, session = createSession() }: RunOptions = {}): Promise<RunResult> {
  const io = headlessIO({ width, height });
  const rctx = makeRunContext(speed, session, io);
  const parsed = parseProgram(src, io);
  if (parsed) {
    registerProcs(session, parsed.newProcs, io);
    await execute(parsed.topLevel, rctx);
  }
  return { out: io.text(), io, session, rctx };
}
