import { CMD } from './commands.ts';
import { BINARY2, BINOP_PREC, QUERY_TOKENS, UNARY, evalExpr, noteTok } from './expr.ts';
import { macroYield } from './pacing.ts';
import { extractBlock } from './procedures.ts';
import { PROC_SCOPE, REPEAT_SCOPE, formatNum, hasOwn, isVarTok, varName } from './scope.ts';
import { MAX_STACK_FRAMES, STOP_SIGNAL } from './signals.ts';
import type { Proc, RunContext, Scope, Token } from './types.ts';

// ── Frames of the runStack trampoline (see the header comment in scope.ts) ────
// ExecFrame runs tokens; the loop frames drive a loop body. The is* flags tell
// them apart (and narrow the type in runStack).
interface ExecFrame {
  isRepeat?: never; isWhile?: never; isFor?: never;
  tokens: Token[];
  idx: number;
  vars: Scope;
  /** Marks a procedure body: STOP / OUTPUT unwind to it. */
  procBoundary?: boolean;
  procName?: string;
  /** true = called as a command (an OUTPUT would be lost → error); false/absent = runExpr wants the value. */
  stmtCall?: boolean;
  outputVal?: number;
}
interface LoopFrameBase { procBoundary?: never; vars: Scope; body: Token[] }
interface RepeatFrame extends LoopFrameBase { isRepeat: true; isWhile?: never; isFor?: never; remaining: number; iteration: number; total: number }
interface WhileFrame  extends LoopFrameBase { isWhile: true; isRepeat?: never; isFor?: never; cond: Token[] }
interface ForFrame    extends LoopFrameBase { isFor: true; isRepeat?: never; isWhile?: never; varName: string; end: number; step: number; nextVal: number; eps: number }
type LoopFrame = RepeatFrame | WhileFrame | ForFrame;
type Frame = ExecFrame | LoopFrame;

// ── runExpr: procedure used as a value ────────────────────────────────────────
// runExpr(name, proc, scope, rctx) → number
// Runs the body on its own frame stack (same runStack trampoline) and returns the
// OUTPUT value. Errors: STOP or falling off the end without OUTPUT.
export async function runExpr(name: string, proc: Proc, scope: Scope, rctx: RunContext): Promise<number> {
  const boundary: ExecFrame = { tokens: proc.body, idx: 0, vars: scope, procBoundary: true, procName: name };
  await runStack([boundary], rctx);
  if(rctx.stopped) throw STOP_SIGNAL; // user pressed STOP mid-expression: end quietly
  if(boundary.outputVal === undefined)
    throw new Error(name + ' did not OUTPUT a value, but was used where a value is needed');
  return boundary.outputVal;
}

// isLoopFrame: frame kinds that BREAK / CONTINUE target.
const isLoopFrame = (f: Frame): f is LoopFrame => !!(f.isRepeat || f.isWhile || f.isFor);

// ── runStack(stack, rctx): shared trampoline executor ────────────────────────
// Single implementation for ALL Logo control-flow. To add a loop construct:
// push a typed frame { isXxx:true, … } and add an if(frame.isXxx) branch at the
// top of the while loop (and to isLoopFrame if BREAK/CONTINUE should see it).
async function runStack(stack: Frame[], rctx: RunContext): Promise<void> {
  while(stack.length > 0 && !rctx.stopped) {
    if(stack.length > MAX_STACK_FRAMES) throw new Error('Stack overflow: Logo recursion too deep (> ' + MAX_STACK_FRAMES + ' frames)');
    // Responsiveness: programs that never move the turtle (e.g. a long WHILE that
    // only does arithmetic) still yield to the browser every ~40 ms, so the page
    // keeps painting and the STOP button works.
    if(++rctx.steps >= 500) {
      rctx.steps = 0;
      if(Date.now() - rctx.lastYield > 40) { await macroYield(rctx); continue; }
    }
    const frame = stack[stack.length - 1];

    // ── REPEAT: next iteration (fresh scope carrying REPCOUNT) or done ───────
    if(frame.isRepeat) {
      if(frame.remaining > 0) {
        frame.remaining--;
        const iterVars: Scope = Object.create(frame.vars);
        iterVars[REPEAT_SCOPE] = { count: frame.iteration++, max: frame.total };
        stack.push({ tokens: frame.body, idx: 0, vars: iterVars });
      } else {
        stack.pop();
      }
      continue;
    }

    // ── WHILE: re-evaluate cond each tick, push body frame or pop ───────────
    if(frame.isWhile) {
      const {value: cond} = await evalExpr(frame.cond, 0, frame.vars, rctx);
      if(rctx.stopped) break;
      if(cond !== 0) stack.push({ tokens: frame.body, idx: 0, vars: frame.vars });
      else           stack.pop();
      continue;
    }

    // ── FOR: write loop var, push body frame, advance nextVal, or pop ────────
    if(frame.isFor) {
      const cur    = frame.nextVal;
      const active = frame.step > 0 ? cur <= frame.end + frame.eps : cur >= frame.end - frame.eps;
      if(active) {
        frame.vars[frame.varName] = cur;          // body sees current value
        frame.nextVal             = cur + frame.step;
        stack.push({ tokens: frame.body, idx: 0, vars: frame.vars });
      } else {
        stack.pop();
      }
      continue;
    }

    // ── Exec frame: tokens consumed — pop and resume caller ─────────────────
    if(frame.idx >= frame.tokens.length) { stack.pop(); continue; }

    const tok = frame.tokens[frame.idx++];
    noteTok(tok, rctx); // source position for error messages
    const cmd = tok.text; // already uppercase (OPT-4)

    // ── STOP: unwind to nearest procBoundary (top level: end the program) ───
    if(cmd === 'STOP') {
      rctx.io.log('STOP', 'info');
      let k = stack.length - 1;
      while(k >= 0 && !stack[k].procBoundary) k--;
      if(k >= 0) stack.length = k; // removes boundary + everything above
      else stack.length = 0;
      continue;
    }

    // ── BREAK / CONTINUE: innermost loop frame; error at a procedure boundary ─
    if(cmd === 'BREAK' || cmd === 'CONTINUE') {
      let k = stack.length - 1;
      while(k >= 0 && !stack[k].procBoundary && !isLoopFrame(stack[k])) k--;
      if(k < 0 || stack[k].procBoundary) throw new Error(cmd + ' used outside a loop');
      stack.length = cmd === 'BREAK' ? k : k + 1; // BREAK discards the loop frame; CONTINUE keeps it
      continue;
    }

    // ── OUTPUT: store value on the nearest procBoundary, unwind to it ───────
    if(cmd === 'OUTPUT' || cmd === 'OP') {
      const {value, nextIdx} = await evalExpr(frame.tokens, frame.idx, frame.vars, rctx);
      frame.idx = nextIdx;
      let k = stack.length - 1;
      while(k >= 0 && !stack[k].procBoundary) k--;
      if(k < 0) throw new Error('OUTPUT used outside a procedure');
      const boundary = stack[k] as ExecFrame;
      if(boundary.stmtCall)
        throw new Error("You don't say what to do with " + formatNum(value) + ' — ' + boundary.procName +
                        ' OUTPUTs a value but was used as a command (try e.g. PRINT ' + boundary.procName + ')');
      rctx.io.log('OUTPUT → ' + formatNum(value), 'info');
      boundary.outputVal = value;
      stack.length = k;
      continue;
    }

    // ── IF / IFELSE ─────────────────────────────────────────────────────────
    if(cmd === 'IF') {
      const {value:cond, nextIdx:ci} = await evalExpr(frame.tokens, frame.idx, frame.vars, rctx);
      const {body, nextIdx:ni} = extractBlock(frame.tokens, ci);
      frame.idx = ni;
      if(cond !== 0) { rctx.io.log('IF → true','info');  stack.push({ tokens:body, idx:0, vars:frame.vars }); }
      else             rctx.io.log('IF → false','info');
      continue;
    }
    if(cmd === 'IFELSE') {
      const {value:cond, nextIdx:ci} = await evalExpr(frame.tokens, frame.idx, frame.vars, rctx);
      const b0 = extractBlock(frame.tokens, ci);
      const b1 = extractBlock(frame.tokens, b0.nextIdx);
      frame.idx = b1.nextIdx;
      rctx.io.log('IFELSE → ' + (cond !== 0), 'info');
      stack.push({ tokens: cond !== 0 ? b0.body : b1.body, idx:0, vars:frame.vars });
      continue;
    }

    // ── REPEAT n [ body ] ───────────────────────────────────────────────────
    if(cmd === 'REPEAT') {
      const {value:count, nextIdx:ci} = await evalExpr(frame.tokens, frame.idx, frame.vars, rctx);
      const {body, nextIdx:ni} = extractBlock(frame.tokens, ci);
      frame.idx = ni;
      const n = Math.round(count);
      if(n < 0) { rctx.io.log('REPEAT ' + n + ': count is negative, skipping', 'err'); }
      else { rctx.io.log('REPEAT ' + n, 'info'); if(n > 0) stack.push({ isRepeat:true, body, vars:frame.vars, remaining:n, iteration:1, total:n }); }
      continue;
    }

    // ── WHILE [ condition ] [ body ] ────────────────────────────────────────
    if(cmd === 'WHILE') {
      const {body:cond, nextIdx:ci} = extractBlock(frame.tokens, frame.idx);
      const {body, nextIdx:ni} = extractBlock(frame.tokens, ci);
      frame.idx = ni;
      stack.push({ isWhile:true, cond, body, vars:frame.vars }); // cond checked before first run
      continue;
    }

    // ── FOR :var start end [step] [ body ] ──────────────────────────────────
    // Step is optional (±1 towards end). The loop variable lives in a FOR scope
    // that inherits everything visible outside; it disappears after the loop.
    if(cmd === 'FOR') {
      const rawVar = frame.tokens[frame.idx++]?.text;
      if(!isVarTok(rawVar))
        throw new Error('FOR: expected a variable name like :i, got: ' + (rawVar || 'nothing'));
      const name = varName(rawVar);
      const {value:start, nextIdx:i1} = await evalExpr(frame.tokens, frame.idx, frame.vars, rctx);
      const {value:end,   nextIdx:i2} = await evalExpr(frame.tokens, i1, frame.vars, rctx);
      frame.idx = i2;
      let step = start <= end ? 1 : -1;
      if(frame.tokens[frame.idx]?.text !== '[') {
        const {value:s, nextIdx:i3} = await evalExpr(frame.tokens, frame.idx, frame.vars, rctx);
        if(s === 0) throw new Error('FOR: step cannot be zero (infinite loop)');
        step = s; frame.idx = i3;
      }
      const {body, nextIdx:ni} = extractBlock(frame.tokens, frame.idx);
      frame.idx = ni;
      const forVars: Scope = Object.create(frame.vars);
      forVars[name] = start;
      // eps: tolerance for IEEE-754 drift with fractional steps (FOR :i 0 1 0.1).
      stack.push({ isFor:true, varName:name, end, step, body, vars:forVars, nextVal:start, eps:Math.abs(step) * 1e-9 });
      continue;
    }

    // ── User procedure call (as a command) ──────────────────────────────────
    if(hasOwn(rctx.procs, cmd)) {
      rctx.io.log('CALL ' + cmd, 'info');
      const proc = rctx.procs[cmd];
      const args: number[] = [];
      for(let p = 0; p < proc.params.length; p++) {
        const {value, nextIdx} = await evalExpr(frame.tokens, frame.idx, frame.vars, rctx);
        args.push(value);
        frame.idx = nextIdx;
      }
      // Dynamic scope: the callee sees the caller's variables.
      let parentVars = frame.vars;
      // Tail call: drop frames that have nothing left to do (the caller's finished
      // body, finished IF bodies, …) so recursion in tail position runs in constant
      // stack. Stops at loop frames and at expression-context boundaries (runExpr
      // still needs those to collect OUTPUT). For direct self-recursion the new
      // scope also replaces the finished one instead of chaining onto it, so an
      // endless recursive loop runs in constant memory.
      while(stack.length) {
        const top = stack[stack.length - 1];
        if(isLoopFrame(top) || (top.procBoundary && !top.stmtCall)) break;
        if(top.idx < top.tokens.length) break;
        stack.pop();
        if(top.procBoundary && top.procName === cmd && parentVars === top.vars) parentVars = Object.getPrototypeOf(top.vars);
      }
      const scope: Scope = Object.create(parentVars);
      scope[PROC_SCOPE] = cmd;
      proc.params.forEach((name, k) => { scope[name] = args[k]; });
      stack.push({ tokens:proc.body, idx:0, vars:scope, procBoundary:true, procName:cmd, stmtCall:true });
      continue;
    }

    // ── Built-in leaf command via CMD dispatch table ────────────────────────
    const handler = CMD[cmd];
    if(handler) { frame.idx = await handler(frame.tokens, frame.idx, frame.vars, rctx); continue; }

    // Unknown word: halt with the most helpful message we can give.
    if(cmd === '~' || /^[\d.]/.test(cmd) || isVarTok(cmd)) {
      const shown = cmd === '~' ? '-' + (frame.tokens[frame.idx]?.text || '') : cmd;
      throw new Error('Unexpected value ' + shown + ' — the previous command already has all its inputs.' +
                      (cmd === '~' ? ' For subtraction put spaces on both sides: 100 - 10' : ''));
    }
    if(cmd === ')' || cmd === '(' || cmd === ']' || BINOP_PREC.has(cmd)) throw new Error('Unexpected ' + cmd);
    if(cmd === 'END') throw new Error('END without a matching TO');
    if(UNARY.has(cmd) || BINARY2.has(cmd) || QUERY_TOKENS.has(cmd) || cmd === 'NOT' || cmd === 'REPCOUNT' || cmd === 'REPCOUNTMAX')
      throw new Error(cmd + ' produces a value — use it as an input, e.g. PRINT ' + cmd + (UNARY.has(cmd) ? ' 30' : ''));
    throw new Error('Unknown command: ' + cmd);
  }
}

// ── run(tokens, startIdx, vars, rctx): top-level interpreter entry point ─────
export async function run(tokens: Token[], startIdx: number, vars: Scope | null, rctx: RunContext): Promise<void> {
  const globals = vars || rctx.session.globals;
  rctx.globals = globals;
  await runStack([{ tokens: tokens || [], idx: startIdx || 0, vars: globals }], rctx);
}
