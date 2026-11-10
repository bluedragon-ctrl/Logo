// ═══════════════════════════════════════════════════════════════════════════════
// INTERPRETER — v4.0  (Claude Logo v8.0)
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
//                                       outputVal, stopFired] }
//     procBoundary marks a procedure body. stmtCall=true when the procedure was
//     called as a command (its OUTPUT would be lost → error); false/absent when
//     runExpr called it for its value (runExpr reads .outputVal afterwards).
//   repeat frame { isRepeat, body, vars, remaining, iteration, total }
//   while frame  { isWhile, cond, body, vars }
//   for frame    { isFor, varName, end, step, body, vars, nextVal, eps }
//
// Scopes — dynamic scoping, as in UCBLogo. Plain objects linked by prototype:
//   rctx.globals        root scope (globalVars)
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
// ═══════════════════════════════════════════════════════════════════════════════

export let globalVars = {}; // top-level variable scope; reset by RUN and CLR
export function resetGlobals(){ globalVars = {}; }

export const REPEAT_SCOPE = Symbol('repeatScope'); // value on a REPEAT iteration scope: { count, max }
export const PROC_SCOPE   = Symbol('procScope');   // value on a procedure scope: procedure name
export const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// varName(tok): ':x' / '"x' → 'X'. Quoted words keep their source case in the
// token stream (for LABEL / PRINT), so names are uppercased here.
export function varName(tok){ return tok.slice(1).toUpperCase(); }
export function isVarTok(tok){ return !!tok && (tok.startsWith(':') || tok.startsWith('"')) && tok.length > 1; }

// setVar: MAKE semantics — update the nearest scope that owns the name, else global.
export function setVar(vars, name, value, rctx){
  for(let s = vars; s && s !== Object.prototype; s = Object.getPrototypeOf(s))
    if(hasOwn(s, name)) { s[name] = value; return; }
  (rctx.globals || globalVars)[name] = value;
}
// procScopeOf: nearest procedure scope (LOCAL target), or the globals at top level.
export function procScopeOf(vars, rctx){
  for(let s = vars; s && s !== Object.prototype; s = Object.getPrototypeOf(s))
    if(hasOwn(s, PROC_SCOPE)) return s;
  return rctx.globals || globalVars;
}
// repeatInfo: { count, max } of the innermost REPEAT in the current procedure, or null.
// The walk stops at a procedure scope: REPCOUNT does not leak into called procedures.
export function repeatInfo(vars){
  for(let s = vars; s && s !== Object.prototype; s = Object.getPrototypeOf(s)){
    if(hasOwn(s, REPEAT_SCOPE)) return s[REPEAT_SCOPE];
    if(hasOwn(s, PROC_SCOPE))   return null;
  }
  return null;
}

// formatNum: human-friendly number text for PRINT / LABEL (0.1+0.2 → 0.3).
export function formatNum(v){ return Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(12))); }
