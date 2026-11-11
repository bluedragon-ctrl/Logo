import { CMD, PAREN_CMD } from './commands.ts';
import { BINOP_PREC, UNARY, bindDefaults, evalExpr, isReporterWord, noteTok, procInputs } from './expr.ts';
import { macroYield } from './pacing.ts';
import { extractBlock } from './procedures.ts';
import { PROC_SCOPE, REPEAT_SCOPE, formatNum, hasOwn, isVarTok, varName } from './scope.ts';
import { MAX_STACK_FRAMES, STOP_SIGNAL } from './signals.ts';
import type { Proc, RunContext, Scope, Token } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// INTERPRETER — runStack trampoline (Blue Logo, since v8.0)
//
// Pipeline:  tokenize → extractProcedures → run → runStack (trampoline) ⇄ evalExpr
//
// All Logo control-flow lives in one function: runStack(stack, rctx). run()
// (top-level statements) and runExpr() (a user procedure used as a value inside
// an expression) are thin wrappers over it. Adding a loop construct means
// touching only runStack.
//
// Frame shapes (discriminated by presence of isRepeat / isWhile / isFor):
//   exec frame   { tokens, idx, vars [, procBoundary, procName, stmtCall,
//                                       outputVal] }
//     procBoundary marks a procedure body. stmtCall=true when the procedure was
//     called as a command (its OUTPUT would be lost → error); false/absent when
//     runExpr called it for its value (runExpr reads .outputVal afterwards).
//   repeat frame { isRepeat, body, vars, remaining, iteration, total }   (FOREVER: remaining = total = Infinity)
//   while frame  { isWhile, cond, body, vars }
//   for frame    { isFor, varName, end, step, body, vars, nextVal, eps }
//
// Scopes — dynamic scoping, as in UCBLogo. Plain objects linked by prototype:
//   rctx.globals        root scope (session.globals)
//   procedure scope     Object.create(callerScope); own params; [PROC_SCOPE] = name
//   REPEAT iteration    Object.create(scope); [REPEAT_SCOPE] = { count, max }
//   FOR scope           Object.create(scope); own loop variable
//   Reads walk the chain. MAKE updates the nearest scope that already owns the
//   name, otherwise creates a global. LOCAL / LOCALMAKE create the name in the
//   nearest procedure scope (globals at top level). The FOR loop variable exists
//   only inside its loop.
//
// Flow control:
//   STOP      unwinds to the nearest procBoundary (top level: ends the program)
//   OUTPUT    stores the value on the nearest procBoundary and unwinds to it
//   BREAK / CONTINUE  unwind to the innermost loop frame; error at a procBoundary
//   Tail calls: a statement-level procedure call that is the last thing left in
//   its frame(s) replaces them, so recursive loops (TO L … L END) never overflow.
//   The finished caller's scope is dropped too, but only when every variable it
//   owns is a parameter of the callee (and so shadowed anyway): then the drop is
//   invisible and TO SPIRAL :S … SPIRAL :S + 1 END runs in constant memory. A
//   caller with other locals (LOCALMAKE) stays in the chain — dynamic scoping
//   gives the same result in tail and non-tail position.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Frames of the runStack trampoline (see the header comment above) ──────────
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
      if(rctx.io.logs('info')) rctx.io.log('OUTPUT → ' + formatNum(value), 'info');
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
      if(rctx.io.logs('info')) rctx.io.log('IFELSE → ' + (cond !== 0), 'info');
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
      else { if(rctx.io.logs('info')) rctx.io.log('REPEAT ' + n, 'info'); if(n > 0) stack.push({ isRepeat:true, body, vars:frame.vars, remaining:n, iteration:1, total:n }); }
      continue;
    }

    // ── FOREVER [ body ] — a REPEAT without end (REPCOUNT counts; BREAK / STOP leave) ─
    if(cmd === 'FOREVER') {
      const {body, nextIdx:ni} = extractBlock(frame.tokens, frame.idx);
      frame.idx = ni;
      if(rctx.io.logs('info')) rctx.io.log('FOREVER', 'info');
      stack.push({ isRepeat:true, body, vars:frame.vars, remaining:Infinity, iteration:1, total:Infinity });
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

    // ── ( … ) as a statement: (PRINT a b …), (LABEL a b …), (PROC a b c) ─────
    // The parentheses give a command a different number of inputs: PRINT / LABEL
    // take several, a procedure its optional ones.
    let parens = false;
    if(cmd === '(') {
      const name = frame.tokens[frame.idx]?.text;
      if(name !== undefined && hasOwn(PAREN_CMD, name)) {
        frame.idx = await PAREN_CMD[name](frame.tokens, frame.idx + 1, frame.vars, rctx);
        continue;
      }
      if(name === undefined || !hasOwn(rctx.procs, name)) throw new Error('Unexpected ( — a statement can start with ( only for (PRINT …), (LABEL …) or a procedure call with optional inputs');
      frame.idx++;
      parens = true;
    }

    // ── User procedure call (as a command) ──────────────────────────────────
    const procName = parens ? frame.tokens[frame.idx - 1].text : cmd;
    if(hasOwn(rctx.procs, procName)) {
      if(rctx.io.logs('info')) rctx.io.log('CALL ' + procName, 'info');
      const proc = rctx.procs[procName];
      const args: number[] = [];
      const got = await procInputs(frame.tokens, () => frame.idx, procName, proc, parens, async () => {
        const {value, nextIdx} = await evalExpr(frame.tokens, frame.idx, frame.vars, rctx);
        args.push(value);
        frame.idx = nextIdx;
      });
      if(parens) frame.idx++; // the )
      // Dynamic scope: the callee sees the caller's variables.
      let parentVars = frame.vars;
      // Tail call: drop frames that have nothing left to do (the caller's finished
      // body, finished IF bodies, …) so recursion in tail position runs in constant
      // stack. Stops at loop frames and at expression-context boundaries (runExpr
      // still needs those to collect OUTPUT). A finished caller's scope is dropped
      // as well when all its variables are parameters of the callee (shadowed, so
      // nobody can see the difference): endless recursion runs in constant memory.
      while(stack.length) {
        const top = stack[stack.length - 1];
        if(isLoopFrame(top) || (top.procBoundary && !top.stmtCall)) break;
        if(top.idx < top.tokens.length) break;
        stack.pop();
        if(top.procBoundary && parentVars === top.vars && Object.keys(top.vars).every(k => proc.params.includes(k)))
          parentVars = Object.getPrototypeOf(top.vars);
      }
      const scope: Scope = Object.create(parentVars);
      scope[PROC_SCOPE] = procName;
      args.forEach((v, k) => { scope[proc.params[k]] = v; });
      await bindDefaults(procName, proc, got, scope, rctx);
      stack.push({ tokens:proc.body, idx:0, vars:scope, procBoundary:true, procName, stmtCall:true });
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
    if(isReporterWord(cmd))
      throw new Error(cmd + ' produces a value — use it as an input, e.g. PRINT ' + cmd + (UNARY.has(cmd) ? ' 30' : ''));
    throw new Error('Unknown command: ' + cmd);
  }
}

// ── run(tokens, startIdx, vars, rctx): top-level interpreter entry point ─────
export async function run(tokens: Token[], startIdx: number, vars: Scope | null, rctx: RunContext): Promise<void> {
  const globals = vars || rctx.session.globals;
  rctx.globals = globals;
  await runStack([{ tokens, idx: startIdx, vars: globals }], rctx);
}
