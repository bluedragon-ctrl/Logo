import type { RunContext } from './types.ts';

// ── Responsiveness helpers ────────────────────────────────────────────────────
// nextFrame: yield until the next animation frame (animated drawing).
// macroYield: yield one macrotask so the browser can paint and handle clicks.
// sleep: cancellable timer for WAIT — haltRun() calls rctx.wake to end it early.

export function nextFrame(rctx: RunContext): Promise<unknown> { rctx.lastYield = Date.now(); return rctx.io.nextFrame(); }
export function macroYield(rctx: RunContext): Promise<unknown> { rctx.lastYield = Date.now(); return rctx.io.macroYield(); }
export function sleep(ms: number, rctx: RunContext): Promise<void> {
  return new Promise<void>(res => {
    const done = () => { clearTimeout(id); rctx.wake = null; rctx.lastYield = Date.now(); res(); };
    const id = setTimeout(done, ms);
    rctx.wake = done;
  });
}
// Animated speeds (0–3) have one budget per animation frame, shared by every
// command: a frame holds STEPS_PER_FRAME[speed] move() sub-steps (~0.83 px each)
// or DEG_PER_FRAME[speed] degrees of turning, or that many tick()s. Commands spend
// fractions of it with spendFrame(); the frame is shown (render + nextFrame) only
// when it is full. So REPEAT 360 [FD 1 RT 1] runs as fast as one FD of the same
// length, instead of paying a whole frame per command.
export const STEPS_PER_FRAME = [1, 4, 16, 64];  // by speed 0–3; move() sub-steps and tick()s
export const DEG_PER_FRAME   = [3, 12, 48, 192]; // by speed 0–3; rotate()
export async function spendFrame(rctx: RunContext, part: number): Promise<void> {
  rctx.frameUsed += part;
  if(rctx.frameUsed >= 1 - 1e-9) { rctx.frameUsed = 0; rctx.io.render(); await nextFrame(rctx); }
}
// tick: pacing for commands that draw in one go (SETPOS, DOT, LABEL). Animated
// speeds show them at the same rate as move() steps; instant mode batches them.
export async function tick(rctx: RunContext): Promise<void> {
  if(rctx.speed >= 4) {
    if(++rctx.instantStepCount >= INSTANT_FLUSH){ rctx.instantStepCount = 0; rctx.io.render(); await macroYield(rctx); }
    return;
  }
  await spendFrame(rctx, 1 / STEPS_PER_FRAME[rctx.speed]);
}

// Instant-mode partial flush: in instant mode move() never yields a rAF, so the
// browser would show nothing until the program ends. To show progress and keep the
// .running CSS animation alive, move() increments rctx.instantStepCount each step;
// when it reaches INSTANT_FLUSH it calls render() + setTimeout(0) (a macro-task
// yield that lets the browser paint). Lower value = more feedback, slightly slower.
export const INSTANT_FLUSH   = 150; // yield every N instant-mode move steps
