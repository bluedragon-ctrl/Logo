import { render } from '../render/render.js';

// ── Responsiveness helpers ────────────────────────────────────────────────────
// nextFrame: yield until the next animation frame (animated drawing).
// macroYield: yield one macrotask so the browser can paint and handle clicks.
// sleep: cancellable timer for WAIT — haltRun() calls rctx.wake to end it early.
export function nextFrame(rctx){ rctx.lastYield = Date.now(); return new Promise(res => requestAnimationFrame(res)); }
export function macroYield(rctx){ rctx.lastYield = Date.now(); return new Promise(res => setTimeout(res, 0)); }
export function sleep(ms, rctx){
  return new Promise(res => {
    const done = () => { clearTimeout(id); rctx.wake = null; rctx.lastYield = Date.now(); res(); };
    const id = setTimeout(done, ms);
    rctx.wake = done;
  });
}
// tick: pacing for commands that draw in one go (SETPOS, DOT, LABEL). Animated
// speeds show them at the same rate as move() steps; instant mode batches them.
export const STEPS_PER_FRAME = [1, 4, 16, 64]; // by speed 0–3; shared with move()
export async function tick(rctx){
  if(rctx.speed >= 4) {
    if(++rctx.instantStepCount >= INSTANT_FLUSH){ rctx.instantStepCount = 0; render(); await macroYield(rctx); }
    return;
  }
  render();
  if(++rctx.tickCount >= STEPS_PER_FRAME[rctx.speed]){ rctx.tickCount = 0; await nextFrame(rctx); }
}

// Instant-mode partial flush: in instant mode move() never yields a rAF, so the
// browser would show nothing until the program ends. To show progress and keep the
// .running CSS animation alive, move() increments rctx.instantStepCount each step;
// when it reaches INSTANT_FLUSH it calls render() + setTimeout(0) (a macro-task
// yield that lets the browser paint). Lower value = more feedback, slightly slower.
export const INSTANT_FLUSH   = 150; // yield every N instant-mode move steps
