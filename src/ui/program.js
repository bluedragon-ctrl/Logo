import { editor } from '../editor/editor.js';
import { activeRctx, haltRun, makeRunContext, setActiveRctx } from '../interpreter/context.js';
import { extractProcedures, procs } from '../interpreter/procedures.js';
import { run } from '../interpreter/runtime.js';
import { globalVars, resetGlobals } from '../interpreter/scope.js';
import { STOP_SIGNAL } from '../interpreter/signals.js';
import { tokenize } from '../interpreter/tokenizer.js';
import { render } from '../render/render.js';
import { clearScreen } from '../render/trail.js';
import { setMoving } from '../turtle/state.js';
import { con, log, optSpeed } from './console.js';

// ── Run-state indicator ───────────────────────────────────────────────────────
// setRunning(on): toggle the #btn-run visual state between idle and running.
//   on=true  → adds .running CSS class (pulsing border), disables button, changes label
//   on=false → restores idle appearance
//

const btnRun = document.getElementById('btn-run');
function setRunning(on) {
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
// registerProcs: merge parsed procedures into the global store, logging each.
export function registerProcs(newProcs){
  Object.entries(newProcs).forEach(([name, proc]) => {
    procs[name] = proc;
    log('Defined: ' + name + (proc.params.length ? ' (' + proc.params.map(p => ':' + p).join(' ') + ')' : ''), 'info');
  });
}
// parseProgram: tokenize + extract procedures; reports parse errors in the console.
export function parseProgram(src){
  try { return extractProcedures(tokenize(src)); }
  catch(e){ log('✗ ' + (e.message || String(e)), 'err'); return null; }
}
// runProgram: run top-level tokens with a fresh run context. Owns activeRctx and
// the RUN-button state; always cleans up, then runs rctx.onFinish (used by CLR).
export async function runProgram(tokens){
  const rctx = makeRunContext(parseInt(optSpeed.value), procs);
  setActiveRctx(rctx);
  setRunning(true);
  try {
    await run(tokens, 0, globalVars, rctx);
    if(!rctx.stopped) log('✓ Done!', 'ok');
  } catch(e) {
    if(e !== STOP_SIGNAL) { // STOP_SIGNAL = OUCH (already reported) or user STOP
      const lineCtx = rctx.execLine.text ? '\n  line ' + rctx.execLine.n + ':  ' + rctx.execLine.text : '';
      log('✗ ' + (e.message || String(e)) + lineCtx, 'err');
    }
  } finally {
    setMoving(false);
    setActiveRctx(null);
    setRunning(false);
    render(); // ensure instant-mode result is visible
    if(rctx.onFinish) rctx.onFinish();
  }
}

// ── Button handlers ───────────────────────────────────────────────────────────
document.getElementById('btn-run').onclick = async function(){
  if(activeRctx) return; // belt-and-suspenders: btn is disabled by setRunning, but guard here too
  con.innerHTML = ''; resetGlobals();
  if(document.getElementById('opt-clear-on-run').checked) clearScreen();
  Object.keys(procs).forEach(k => delete procs[k]);
  render();
  const parsed = parseProgram(editor.getValue());
  if(!parsed) return;
  registerProcs(parsed.newProcs);
  log('▶ Running...', 'info');
  await runProgram(parsed.topLevel);
};
document.getElementById('btn-stop').onclick = function(){
  if(!activeRctx) return;
  haltRun();
  log('■ Stopped.', 'err');
};
// CLR: full reset. If a program is running it is halted first and the reset
// happens once it has unwound, so no in-flight step can draw on the cleared canvas.
function resetAll(){
  clearScreen();
  resetGlobals(); Object.keys(procs).forEach(k => delete procs[k]);
  con.innerHTML = ''; log('Screen cleared.', 'info'); render();
}
document.getElementById('btn-clear').onclick = function(){
  if(activeRctx){ activeRctx.onFinish = resetAll; haltRun(); }
  else resetAll();
};
