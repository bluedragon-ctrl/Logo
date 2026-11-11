import { io, session } from '../app.ts';
import { editor } from '../editor/editor.ts';
import { activeRctx, haltRun, makeRunContext, setActiveRctx } from '../interpreter/context.ts';
import { execute, parseProgram, registerProcs } from '../interpreter/execute.ts';
import { clearProcs, clearScreen } from '../interpreter/session.ts';
import { render } from '../render/render.ts';
import { con, log, optSpeed } from './console.ts';
import type { Token } from '../interpreter/types.ts';
import { byId } from '../util.ts';

// ── Run-state indicator ───────────────────────────────────────────────────────
// setRunning(on): toggle the #btn-run visual state between idle and running.
//   on=true  → adds .running CSS class (pulsing border), disables button, changes label
//   on=false → restores idle appearance
//

const btnRun = byId<HTMLButtonElement>('btn-run');
function setRunning(on: boolean): void {
  if(on) {
    btnRun.classList.add('running');
    btnRun.textContent = '⟳';
    btnRun.disabled = true;
  } else {
    btnRun.classList.remove('running');
    btnRun.textContent = '▶ RUN';
    btnRun.disabled = false;
  }
}

// ── Program execution (shared by RUN and direct mode) ────────────────────────
// runProgram: run top-level tokens in the page session with a fresh run context
// (interpreter/execute.js does the work). Owns activeRctx and the RUN-button
// state; always cleans up, then runs rctx.onFinish (used by CLR).
export async function runProgram(tokens: Token[]): Promise<void> {
  const rctx = makeRunContext(parseInt(optSpeed.value), session, io);
  setActiveRctx(rctx);
  setRunning(true);
  try {
    await execute(tokens, rctx);
  } finally {
    setActiveRctx(null);
    setRunning(false);
    render(); // ensure instant-mode result is visible
    if(rctx.onFinish) rctx.onFinish();
  }
}

// ── Button handlers ───────────────────────────────────────────────────────────
byId<HTMLButtonElement>('btn-run').onclick = async function(){
  if(activeRctx) return; // belt-and-suspenders: btn is disabled by setRunning, but guard here too
  con.innerHTML = ''; session.globals = {};
  if(byId<HTMLInputElement>('opt-clear-on-run').checked) clearScreen(session, io);
  clearProcs(session);
  render();
  const parsed = parseProgram(editor.getValue(), io);
  if(!parsed) return;
  registerProcs(session, parsed.newProcs, io);
  log('▶ Running...', 'info');
  await runProgram(parsed.topLevel);
};
byId('btn-stop').onclick = function(){
  if(!activeRctx) return;
  haltRun();
  log('■ Stopped.', 'err');
};
// CLR: full reset. If a program is running it is halted first and the reset
// happens once it has unwound, so no in-flight step can draw on the cleared canvas.
function resetAll(){
  clearScreen(session, io);
  session.globals = {}; clearProcs(session);
  con.innerHTML = ''; log('Screen cleared.', 'info'); render();
}
byId('btn-clear').onclick = function(){
  if(activeRctx){ activeRctx.onFinish = resetAll; haltRun(); }
  else resetAll();
};
