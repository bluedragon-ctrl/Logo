// runLogo(src, opts): run a Logo program headlessly the way the RUN button does
// (fresh session, parse, define procedures, run at instant speed).
// Returns { out, io, session, rctx }: out is the console text joined with '\n'.
import { makeRunContext } from '../../src/interpreter/context.js';
import { execute, parseProgram, registerProcs } from '../../src/interpreter/execute.js';
import { headlessIO } from '../../src/interpreter/io.js';
import { createSession } from '../../src/interpreter/session.js';

export async function runLogo(src, { speed = 4, width = 800, height = 600, session = createSession() } = {}) {
  const io = headlessIO({ width, height });
  const rctx = makeRunContext(speed, session, io);
  const parsed = parseProgram(src, io);
  if (parsed) {
    registerProcs(session, parsed.newProcs, io);
    await execute(parsed.topLevel, rctx);
  }
  return { out: io.text(), io, session, rctx };
}
