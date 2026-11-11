import type { RepeatInfo, RunContext, Scope } from './types.ts';

// ── Variable scopes ───────────────────────────────────────────────────────────
// Dynamic scoping, as in UCBLogo — see the header comment in runtime.ts for the
// scope chain (globals → procedure scopes → REPEAT / FOR scopes).

export const REPEAT_SCOPE: unique symbol = Symbol('repeatScope'); // value on a REPEAT iteration scope: { count, max }
export const PROC_SCOPE: unique symbol   = Symbol('procScope');   // value on a procedure scope: procedure name
export const hasOwn = (o: object, k: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(o, k);

// varName(tok): ':x' / '"x' → 'X'. Quoted words keep their source case in the
// token stream (for LABEL / PRINT), so names are uppercased here.
export function varName(tok: string): string { return tok.slice(1).toUpperCase(); }
export function isVarTok(tok: string | undefined): tok is string { return !!tok && (tok.startsWith(':') || tok.startsWith('"')) && tok.length > 1; }

// setVar: MAKE semantics — update the nearest scope that owns the name, else global.
export function setVar(vars: Scope, name: string, value: number, rctx: RunContext): void {
  for(let s: Scope | null = vars; s && s !== Object.prototype; s = Object.getPrototypeOf(s))
    if(hasOwn(s, name)) { s[name] = value; return; }
  (rctx.globals || rctx.session.globals)[name] = value;
}
// procScopeOf: nearest procedure scope (LOCAL target), or the globals at top level.
export function procScopeOf(vars: Scope, rctx: RunContext): Scope {
  for(let s: Scope | null = vars; s && s !== Object.prototype; s = Object.getPrototypeOf(s))
    if(hasOwn(s, PROC_SCOPE)) return s;
  return rctx.globals || rctx.session.globals;
}
// repeatInfo: { count, max } of the innermost REPEAT in the current procedure, or null.
// The walk stops at a procedure scope: REPCOUNT does not leak into called procedures.
export function repeatInfo(vars: Scope): RepeatInfo | null {
  for(let s: Scope | null = vars; s && s !== Object.prototype; s = Object.getPrototypeOf(s)){
    if(hasOwn(s, REPEAT_SCOPE)) return s[REPEAT_SCOPE] ?? null;
    if(hasOwn(s, PROC_SCOPE))   return null;
  }
  return null;
}

// formatNum: human-friendly number text for PRINT / LABEL (0.1+0.2 → 0.3).
export function formatNum(v: number): string { return Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(12))); }
