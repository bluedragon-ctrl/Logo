import { CMD } from './commands.ts';
import { CONTROL_WORDS } from './procedures.ts';
import { runExpr } from './runtime.ts';
import { PROC_SCOPE, hasOwn, isVarTok, repeatInfo, varName } from './scope.ts';
import { LINE_SEN } from './tokenizer.ts';
import type { RunContext, Scope, Token, Turtle } from './types.ts';

// ── Token resolution ──────────────────────────────────────────────────────────
// QUERY_TOKENS: bare words that read turtle / canvas state. One table, used by
// resolveToken and by DOT's "is the next token a value?" check. Adding a query
// is a one-line change here.
export const QUERY_TOKENS = new Map<string, (ts: Turtle, rctx: RunContext) => number>([
  ['XCOR',      ts => ts.x],
  ['YCOR',      ts => ts.y],
  ['HEADING',   ts => ((ts.angle % 360) + 360) % 360], // normalise to [0, 360)
  ['PENDOWN?',  ts => ts.pen ? 1 : 0],
  ['PD?',       ts => ts.pen ? 1 : 0],
  ['PENUP?',    ts => ts.pen ? 0 : 1],
  ['PU?',       ts => ts.pen ? 0 : 1],
  ['SCRWIDTH',  (ts, rctx) => rctx.io.canvasSize().w],   // canvas width  in Logo units (1 unit = 1 CSS px, origin at centre)
  ['SCRHEIGHT', (ts, rctx) => rctx.io.canvasSize().h],   // canvas height in Logo units
]);

// resolveToken(tok, vars, rctx) → number   — a single value token:
//   number literal · :var / "var · query token · REPCOUNT / REPCOUNTMAX
function resolveToken(tok: Token | undefined, vars: Scope, rctx: RunContext): number {
  if(tok === undefined || tok === null || tok === '') throw new Error('Missing value — the expression ended early');
  const q = QUERY_TOKENS.get(tok);
  if(q) return q(rctx.session.turtle, rctx);
  if(tok === 'REPCOUNT' || tok === 'REPCOUNTMAX') {
    const r = repeatInfo(vars);
    if(!r) throw new Error(tok + ' used outside a REPEAT loop');
    return tok === 'REPCOUNT' ? r.count : r.max;
  }
  if(isVarTok(tok)) {
    const name = varName(tok);
    if(!(name in vars)) {
      if(QUERY_TOKENS.has(name) || name === 'REPCOUNT' || name === 'REPCOUNTMAX')
        throw new Error(name + ': use without colon (e.g. FD ' + name + '). Colon prefix is for variables only.');
      throw new Error('Unknown variable: :' + name);
    }
    const v = vars[name];
    if(v === undefined) throw new Error('Variable :' + name + ' has no value yet (declared with LOCAL)');
    if(typeof v !== 'number' || !isFinite(v)) throw new Error('Variable :' + name + ' has invalid value: ' + v);
    return v;
  }
  if(/^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?$/.test(tok)) return Number(tok);
  if(CMD[tok] || CONTROL_WORDS.has(tok)) throw new Error(tok + ' is a command, not a value — a value was expected here');
  if(tok === ']' || tok === '[' || tok === ')' || BINOP_PREC.has(tok))
    throw new Error('Expected a value but found ' + tok);
  throw new Error('Unknown token: ' + tok);
}

// ── Expression evaluator ──────────────────────────────────────────────────────
// evalExpr(tokens, idx, vars, rctx) → { value, nextIdx }
//   Consumes ONE expression starting at tokens[idx].
//
// Grammar (standard precedence, left-associative; higher binds tighter):
//   expr     ::= operand (BINOP operand)*         precedence climbing:
//                   OR(1) < AND(2) < = != < > <= >=(3) < + -(4) < * / MOD(5)
//   unary    ::= ('-' | '~') unary                negative / unary minus
//              | NOT expr[≥3]                     NOT :a = 1  →  NOT (:a = 1)
//              | UNARY_FN unary                   SIN :x * 2  →  (SIN :x) * 2
//              | primary
//   primary  ::= '(' expr ')'
//              | BINARY2_FN expr expr             TOWARDS x y, MAX a b, …
//              | PROC_NAME expr*                  user procedure that OUTPUTs
//              | token                            number, :var, query token, REPCOUNT
//
// '~' is the tokenizer's marker for a minus glued to the following operand but
// separated from the previous one ('SETPOS 0 -100', 'FD -:X'). It is a unary
// minus that can never be read as binary subtraction, so it also ends the
// previous expression — that is what lets 'SETPOS 0 -100' take two arguments.
//
// Async because user-procedure primaries run Logo code (runExpr) that animates.
export const UNARY   = new Set(['SIN','COS','TAN','ARCTAN','ARCSIN','ARCCOS','SQRT','LN','LOG','ABS','ROUND','INT','EXP','RANDOM','RND','FLOOR','CEILING']);
export const BINARY2 = new Set(['TOWARDS','DISTANCE','MOD','POWER','MAX','MIN']); // two-argument prefix functions
export const BINOP_PREC = new Map<string, number>([
  ['OR',1], ['AND',2],
  ['=',3], ['!=',3], ['<',3], ['>',3], ['<=',3], ['>=',3],
  ['+',4], ['-',4],
  ['*',5], ['/',5], ['MOD',5],
]);
const CMP_PREC = 3;
const MAX_EXPR_DEPTH = 500; // nesting cap: parens, unary chains and procedures-as-values combined

const UNARY_FNS: Record<string, (a: number) => number> = {
  SIN:    a => Math.sin(a  * Math.PI / 180),
  COS:    a => Math.cos(a  * Math.PI / 180),
  TAN:    a => Math.tan(a  * Math.PI / 180),
  ARCTAN: a => Math.atan(a) * 180 / Math.PI,
  ARCSIN: a => { if(a < -1 || a > 1) throw new Error('ARCSIN: argument ' + a + ' out of range [-1, 1]'); return Math.asin(a) * 180 / Math.PI; },
  ARCCOS: a => { if(a < -1 || a > 1) throw new Error('ARCCOS: argument ' + a + ' out of range [-1, 1]'); return Math.acos(a) * 180 / Math.PI; },
  SQRT:   a => { if(a < 0)           throw new Error('SQRT: argument ' + a + ' must be >= 0');            return Math.sqrt(a); },
  LN:     a => { if(a <= 0)          throw new Error('LN: argument ' + a + ' must be > 0');               return Math.log(a); },
  LOG:    a => { if(a <= 0)          throw new Error('LOG: argument ' + a + ' must be > 0');              return Math.log10(a); },
  ABS:    a => Math.abs(a),
  ROUND:  a => Math.round(a),
  INT:    a => Math.trunc(a),
  EXP:    a => { if(a > 709) throw new Error('EXP: argument ' + a + ' would overflow (~e^710 > Number.MAX_VALUE)'); return Math.exp(a); },
  // RANDOM n → whole number 0 … floor(n)-1. Fractional n is floored (RANDOM 2.7 → 0 or 1).
  RANDOM: a => { const n = Math.floor(a); if(n < 1) throw new Error('RANDOM: argument must be >= 1, got ' + a); return Math.floor(Math.random() * n); },
  RND:    a => UNARY_FNS.RANDOM(a), // alias for RANDOM
  FLOOR:   a => Math.floor(a),
  CEILING: a => Math.ceil(a),
};
const BINARY2_FNS: Record<string, (a: number, b: number, ts: Turtle) => number> = {
  // Logo heading is CW from +y (north=0). atan2(dx, dy) gives exactly that.
  TOWARDS:  (x, y, ts) => ((Math.atan2(x - ts.x, y - ts.y) * 180 / Math.PI) % 360 + 360) % 360,
  DISTANCE: (x, y, ts) => Math.hypot(x - ts.x, y - ts.y),
  MOD:      (a, b) => { if(b === 0) throw new Error('MOD: divisor must not be zero'); return a % b; },
  POWER:    (a, b) => { const r = a ** b; if(!isFinite(r)) throw new Error('POWER ' + a + ' ' + b + ' is not a real number'); return r; },
  MAX:      (a, b) => Math.max(a, b),
  MIN:      (a, b) => Math.min(a, b),
};

function applyBinop(op: string, a: number, b: number): number {
  switch(op) {
    case '+':   return a + b;
    case '-':   return a - b;
    case '*':   return a * b;
    case '/':   if(b === 0) throw new Error('Division by zero'); return a / b;
    case 'MOD': if(b === 0) throw new Error('MOD: divisor must not be zero'); return a % b;
    case 'AND': return (a !== 0 && b !== 0) ? 1 : 0;
    case 'OR':  return (a !== 0 || b !== 0) ? 1 : 0;
    case '>':   return a >  b ? 1 : 0;
    case '<':   return a <  b ? 1 : 0;
    case '=':   return a === b ? 1 : 0;
    case '>=':  return a >= b ? 1 : 0;
    case '<=':  return a <= b ? 1 : 0;
    case '!=':  return a !== b ? 1 : 0;
  }
  throw new Error('Unknown operator: ' + op);
}

// Parser state shared by the parse* functions of one evalExpr call.
interface Parser { tokens: Token[]; idx: number; vars: Scope; rctx: RunContext; paren: number }

export async function evalExpr(tokens: Token[], idx: number, vars: Scope, rctx: RunContext): Promise<{ value: number; nextIdx: number }> {
  const p: Parser = { tokens, idx, vars, rctx, paren: 0 };
  const value = await parseBinary(p, 1);
  if(!Number.isFinite(value)) throw new Error('Number too large (overflow)');
  return { value, nextIdx: p.idx };
}

// skipSen(tokens, idx, rctx?): index of the next non-sentinel token. When rctx is
// given, skipped sentinels still update rctx.execLine (accurate error lines).
export function skipSen(tokens: Token[], idx: number, rctx?: RunContext): number {
  while(idx < tokens.length && tokens[idx].startsWith(LINE_SEN)) {
    if(rctx) noteLine(tokens[idx], rctx);
    idx++;
  }
  return idx;
}
export function noteLine(raw: Token, rctx: RunContext): void {
  const col = raw.indexOf(':');
  if(col >= 0) { rctx.execLine.n = parseInt(raw.slice(LINE_SEN.length, col)); rctx.execLine.text = raw.slice(col + 1); }
}

// deeper(p, fn): run fn one nesting level deeper; throws a clean Logo error
// instead of letting runaway recursion hit the JavaScript stack limit.
async function deeper(p: Parser, fn: () => Promise<number>): Promise<number> {
  const r = p.rctx;
  if(r.exprDepth >= MAX_EXPR_DEPTH)
    throw new Error('Expression nested too deeply (> ' + MAX_EXPR_DEPTH + ' levels) — runaway recursion in a procedure that OUTPUTs?');
  r.exprDepth++;
  try { return await fn(); } finally { r.exprDepth--; }
}

async function parseBinary(p: Parser, minPrec: number): Promise<number> {
  let left = await parseUnary(p);
  for(;;) {
    if(p.paren > 0) p.idx = skipSen(p.tokens, p.idx, p.rctx); // inside ( ) an expression may span lines
    const op = p.tokens[p.idx];
    const prec = BINOP_PREC.get(op);
    if(prec === undefined || prec < minPrec) return left;
    p.idx++;
    const right = await parseBinary(p, prec + 1); // prec+1 → left-associative
    left = applyBinop(op, left, right);
  }
}

async function parseUnary(p: Parser): Promise<number> {
  p.idx = skipSen(p.tokens, p.idx, p.rctx); // an operand is required — a line break can't end the expression here
  const t = p.tokens[p.idx];
  if(t === '-' || t === '~') { p.idx++; return deeper(p, async () => -(await parseUnary(p))); }
  if(t === 'NOT')            { p.idx++; return deeper(p, async () => (await parseBinary(p, CMP_PREC)) === 0 ? 1 : 0); }
  if(UNARY.has(t))           { p.idx++; return deeper(p, async () => UNARY_FNS[t](await parseUnary(p))); }
  return parsePrimary(p);
}

async function parsePrimary(p: Parser): Promise<number> {
  const t = p.tokens[p.idx];
  if(t === '(') {
    p.idx++;
    return deeper(p, async () => {
      p.paren++;
      try {
        const v = await parseBinary(p, 1);
        p.idx = skipSen(p.tokens, p.idx, p.rctx);
        if(p.tokens[p.idx] !== ')') throw new Error('Missing ) — a ( was opened but never closed' + (p.tokens[p.idx] ? ' (found ' + p.tokens[p.idx] + ')' : ''));
        p.idx++;
        return v;
      } finally { p.paren--; }
    });
  }
  if(BINARY2.has(t)) {
    p.idx++;
    const a = await parseBinary(p, 1);
    const b = await parseBinary(p, 1);
    return BINARY2_FNS[t](a, b, p.rctx.session.turtle);
  }
  if(t !== undefined && hasOwn(p.rctx.procs, t)) {
    // User procedure used as a value: FD DOUBLE 50, OUTPUT :N * FACT :N - 1.
    // Arguments are full expressions evaluated in the caller's scope.
    p.idx++;
    const proc = p.rctx.procs[t];
    const scope: Scope = Object.create(p.vars);
    scope[PROC_SCOPE] = t;
    for(const param of proc.params) scope[param] = await parseBinary(p, 1);
    return deeper(p, () => runExpr(t, proc, scope, p.rctx));
  }
  p.idx++;
  return resolveToken(t, p.vars, p.rctx);
}
