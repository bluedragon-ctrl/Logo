import { CMD } from './commands.ts';
import { CONTROL_WORDS, extractBlock } from './procedures.ts';
import { runExpr } from './runtime.ts';
import { nextFrame } from './pacing.ts';
import { PROC_SCOPE, hasOwn, isVarTok, repeatInfo, varName } from './scope.ts';
import { STOP_SIGNAL } from './signals.ts';
import { newLine } from './tokenizer.ts';
import type { Proc, RunContext, Scope, Token, Turtle } from './types.ts';

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
  ['PENSIZE',   ts => ts.width],
  ['PI',        () => Math.PI],
  // Interaction (io.ts): keyboard, mouse, time.
  ['KEYP',      (ts, rctx) => rctx.io.keyWaiting() ? 1 : 0],
  ['MOUSEX',    (ts, rctx) => rctx.io.mouse().x],
  ['MOUSEY',    (ts, rctx) => rctx.io.mouse().y],
  ['BUTTONP',   (ts, rctx) => rctx.io.mouse().down ? 1 : 0],
  ['TIMER',     (ts, rctx) => (Date.now() - rctx.timerStart) / 1000],   // seconds since the run started or RESETTIMER
]);
// READKEY: a value that waits — the next key press (io.ts, KEY CODES). Parsed in parsePrimary.
export const READKEY = 'READKEY';

// resolveToken(tok, vars, rctx) → number   — a single value token:
//   number literal · :var / "var · query token · REPCOUNT / REPCOUNTMAX
function resolveToken(tok: string | undefined, vars: Scope, rctx: RunContext): number {
  if(tok === undefined || tok === '') throw new Error('Missing value — the expression ended early');
  const q = QUERY_TOKENS.get(tok);
  if(q) return q(rctx.session.turtle, rctx);
  if(tok === 'REPCOUNT' || tok === 'REPCOUNTMAX') {
    const r = repeatInfo(vars);
    if(!r) throw new Error(tok + ' used outside a REPEAT loop');
    if(tok === 'REPCOUNTMAX' && !isFinite(r.max)) throw new Error('REPCOUNTMAX: FOREVER has no count');
    return tok === 'REPCOUNT' ? r.count : r.max;
  }
  if(tok.startsWith('"') && tok.length > 1) {
    const w = tok.slice(1);
    throw new Error('"' + w + ' is a word, not a number — for a variable write :' + w);
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
  if(isCommandWord(tok)) throw new Error(tok + ' is a command, not a value — a value was expected here');
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
//              | IFELSE expr '[' expr ']' '[' expr ']'   only the chosen block is evaluated
//              | BINARY2_FN expr expr             TOWARDS x y, MAX a b, …
//              | PROC_NAME expr*                  user procedure that OUTPUTs (its required inputs)
//              | '(' PROC_NAME expr* ')'          … with some or all of its optional inputs
//              | READKEY                          waits for a key press
//              | token                            number, :var, query token, REPCOUNT
//
// '~' is the tokenizer's marker for a minus glued to the following operand but
// separated from the previous one ('SETPOS 0 -100', 'FD -:X'). It is a unary
// minus that can never be read as binary subtraction, so it also ends the
// previous expression — that is what lets 'SETPOS 0 -100' take two arguments.
//
// AND / OR short-circuit: when the left side decides the result, the right side is
// parsed in skip mode (p.skip > 0) — every token is consumed and the syntax checked
// as usual, but nothing is computed: no procedure runs, no variable is read, no
// function or operator is applied (so :X != 0 AND 10 / :X > 1 is safe). Skipped
// parts yield 0. The same skip mode passes over IFELSE's unchosen block.
//
// Async because user-procedure primaries run Logo code (runExpr) that animates.
export const UNARY   = new Set(['SIN','COS','TAN','ARCTAN','ARCSIN','ARCCOS','SQRT','LN','LOG','ABS','ROUND','INT','EXP','RANDOM','RND','FLOOR','CEILING']);
export const BINARY2 = new Set(['TOWARDS','DISTANCE','MOD','POWER','MAX','MIN']); // two-argument prefix functions
export const BINOP_PREC = new Map<string, number>([
  ['OR',1], ['AND',2],
  ['=',3], ['!=',3], ['<>',3], ['<',3], ['>',3], ['<=',3], ['>=',3],
  ['+',4], ['-',4],
  ['*',5], ['/',5], ['MOD',5],
]);
const CMP_PREC = 3;
const MAX_EXPR_DEPTH = 500; // nesting cap: parens, unary chains and procedures-as-values combined

// ── Word classes (shared by the procedure extractor and runStack's error messages) ──
// isReporterWord: a built-in word that produces a value (function, query, REPCOUNT, NOT).
export function isReporterWord(w: string): boolean {
  return UNARY.has(w) || BINARY2.has(w) || QUERY_TOKENS.has(w) || w === 'NOT' || w === 'REPCOUNT' || w === 'REPCOUNTMAX' || w === READKEY;
}
// isCommandWord: a built-in command or control word that can never be a value.
// (XCOR / YCOR / HEADING are both: as a statement they log their value.)
export function isCommandWord(w: string): boolean {
  return (!!CMD[w] && !QUERY_TOKENS.has(w)) || CONTROL_WORDS.has(w);
}
// isBuiltinWord: any built-in word — these cannot be redefined with TO.
export function isBuiltinWord(w: string): boolean {
  return !!CMD[w] || CONTROL_WORDS.has(w) || isReporterWord(w) || BINOP_PREC.has(w);
}

// checkProcInput(tokens, idx, name, proc, got): before reading input number got+1 of
// procedure name — throw "SQ needs 1 input (:SIZE)" when there clearly is none (end of
// the program or block, a ')' or a command word), instead of the confusing error the
// expression parser would give ("RT is a command, not a value").
export function checkProcInput(tokens: Token[], idx: number, name: string, proc: Proc, got: number): void {
  const t = tokens[idx]?.text;
  if(t !== undefined && t !== ']' && t !== ')' && (t === 'IFELSE' || !isCommandWord(t))) return;
  const n = proc.required;
  throw new Error(name + ' needs ' + n + ' input' + (n === 1 ? '' : 's') + ' (' + proc.params.slice(0, n).map(p => ':' + p).join(' ') +
                  ')' + (got ? ', got only ' + got : ''));
}

// procInputs(tokens, idx, name, proc, parens, read) → nextIdx: read the inputs of a
// call. Without parentheses a procedure takes its required inputs; in a call in
// parentheses, (NAME a b c), it takes inputs up to the ) — at least the required
// ones, at most all. read(k) parses input k and returns nothing (the caller stores it).
// Returns the number of inputs read; for a call in parentheses tokens[idx] is then the ).
export async function procInputs(tokens: Token[], idx: () => number, name: string, proc: Proc, parens: boolean,
                                 read: (k: number) => Promise<void>): Promise<number> {
  if(!parens) {
    for(let k = 0; k < proc.required; k++) { checkProcInput(tokens, idx(), name, proc, k); await read(k); }
    return proc.required;
  }
  let k = 0;
  for(; tokens[idx()]?.text !== ')'; k++) {
    if(tokens[idx()] === undefined || tokens[idx()].text === ']') throw new Error('Missing ) — (' + name + ' … was opened but never closed');
    if(k === proc.params.length)
      throw new Error(name + ' takes at most ' + k + ' input' + (k === 1 ? '' : 's') + ' (' + paramList(proc) + ')');
    await read(k);
  }
  if(k < proc.required) checkProcInput(tokens, idx(), name, proc, k);  // throws "needs n inputs"
  return k;
}
// paramList(proc): ':A :B [:C]' — the inputs as written in the TO line (defaults left out).
export function paramList(proc: Proc): string {
  return proc.params.map((p, k) => k < proc.required ? ':' + p : '[:' + p + ']').join(' ');
}
// bindDefaults(proc, got, scope, rctx): give the optional inputs a call did not pass
// their default values, in order, in the procedure's own scope (so a default may
// use the inputs before it: TO BOX :W [:H :W]).
export async function bindDefaults(name: string, proc: Proc, got: number, scope: Scope, rctx: RunContext): Promise<void> {
  for(let k = got; k < proc.params.length; k++) {
    const expr = proc.defaults[k - proc.required];
    const { value, nextIdx } = await evalExpr(expr, 0, scope, rctx);
    if(nextIdx < expr.length) throw new Error(name + ': the default of :' + proc.params[k] + ' must be one value, found ' + expr[nextIdx].text + ' after it');
    scope[proc.params[k]] = value;
  }
}

// Comparisons allow for floating-point drift: two numbers are equal when they agree
// to about 12 significant digits (what PRINT shows), so 0.1 + 0.2 = 0.3 is true and
// XCOR = 0 holds after a closed shape. Near zero the tolerance is absolute (1e-12).
const CMP_TOL = 1e-12;
export function approxEq(a: number, b: number): boolean {
  return a === b || Math.abs(a - b) <= CMP_TOL * Math.max(1, Math.abs(a), Math.abs(b));
}
// modulo: remainder with the sign of the divisor (-7 MOD 3 = 2, like UCBLogo MODULO),
// so MOD n always gives 0 … n-1 for a positive n.
function modulo(a: number, b: number): number {
  if(b === 0) throw new Error('MOD: divisor must not be zero');
  const r = a % b;
  return r !== 0 && (r < 0) !== (b < 0) ? r + b : r;
}

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
  ROUND:  a => Math.sign(a) * Math.round(Math.abs(a)), // halves away from zero: ROUND -2.5 = -3
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
  MOD:      (a, b) => modulo(a, b),
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
    case 'MOD': return modulo(a, b);
    case 'AND': return (a !== 0 && b !== 0) ? 1 : 0;
    case 'OR':  return (a !== 0 || b !== 0) ? 1 : 0;
    case '>':   return a > b && !approxEq(a, b) ? 1 : 0;
    case '<':   return a < b && !approxEq(a, b) ? 1 : 0;
    case '=':   return approxEq(a, b) ? 1 : 0;
    case '>=':  return a > b || approxEq(a, b) ? 1 : 0;
    case '<=':  return a < b || approxEq(a, b) ? 1 : 0;
    case '!=':
    case '<>':  return approxEq(a, b) ? 0 : 1;
  }
  throw new Error('Unknown operator: ' + op);
}

// Parser state shared by the parse* functions of one evalExpr call.
// skip > 0: parse without computing (short-circuit AND / OR, see above).
interface Parser { tokens: Token[]; idx: number; vars: Scope; rctx: RunContext; paren: number; skip: number }

export async function evalExpr(tokens: Token[], idx: number, vars: Scope, rctx: RunContext): Promise<{ value: number; nextIdx: number }> {
  const p: Parser = { tokens, idx, vars, rctx, paren: 0, skip: 0 };
  const value = await parseBinary(p, 1);
  if(!Number.isFinite(value)) throw new Error('Number too large (overflow)');
  return { value, nextIdx: p.idx };
}

// noteTok(tok, rctx): remember tok's source position for error messages. Called
// for every statement (runStack) and every operand (parseUnary).
export function noteTok(tok: Token, rctx: RunContext): void {
  const l = rctx.execLine;
  l.n = tok.line; l.col = tok.col; l.text = tok.lineText;
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
    // Outside ( ) a line break ends the expression; inside, it may span lines.
    if(p.paren === 0 && newLine(p.tokens, p.idx)) return left;
    const op = p.tokens[p.idx]?.text;
    const prec = op === undefined ? undefined : BINOP_PREC.get(op);
    if(prec === undefined || prec < minPrec) return left;
    p.idx++;
    // Short-circuit: 0 AND … is 0, (non-zero) OR … is 1 — the right side is skipped.
    const decided = p.skip === 0 && ((op === 'AND' && left === 0) || (op === 'OR' && left !== 0));
    if(decided) { await skipping(p, () => parseBinary(p, prec + 1)); left = op === 'OR' ? 1 : 0; continue; }
    const right = await parseBinary(p, prec + 1); // prec+1 → left-associative
    left = p.skip ? 0 : applyBinop(op as string, left, right);
  }
}

// skipping(p, fn): run the parse fn in skip mode (nothing is computed).
async function skipping(p: Parser, fn: () => Promise<number>): Promise<number> {
  p.skip++;
  try { return await fn(); } finally { p.skip--; }
}

async function parseUnary(p: Parser): Promise<number> {
  // An operand is required here, so a line break can't end the expression.
  const tok = p.tokens[p.idx];
  if(tok) noteTok(tok, p.rctx);
  const t = tok?.text;
  if(t === '-' || t === '~') { p.idx++; return deeper(p, async () => -(await parseUnary(p))); }
  if(t === 'NOT')            { p.idx++; return deeper(p, async () => (await parseBinary(p, CMP_PREC)) === 0 ? 1 : 0); }
  if(t !== undefined && UNARY.has(t)) { p.idx++; return deeper(p, async () => { const a = await parseUnary(p); return p.skip ? 0 : UNARY_FNS[t](a); }); }
  return parsePrimary(p);
}

async function parsePrimary(p: Parser): Promise<number> {
  const t = p.tokens[p.idx]?.text;
  if(t === '(') {
    p.idx++;
    return deeper(p, async () => {
      p.paren++;
      try {
        const name = p.tokens[p.idx]?.text;
        const v = name !== undefined && hasOwn(p.rctx.procs, name) ? (p.idx++, await procValue(p, name, true)) : await parseBinary(p, 1);
        const close = p.tokens[p.idx]?.text;
        if(close !== ')') throw new Error('Missing ) — a ( was opened but never closed' + (close ? ' (found ' + close + ')' : ''));
        p.idx++;
        return v;
      } finally { p.paren--; }
    });
  }
  if(t === 'IFELSE') {
    // IFELSE as a value: IFELSE cond [ value ] [ value ] — only the chosen block runs.
    p.idx++;
    return deeper(p, async () => {
      const cond = await parseBinary(p, 1);
      const b0 = extractBlock(p.tokens, p.idx);
      const b1 = extractBlock(p.tokens, b0.nextIdx);
      p.idx = b1.nextIdx;
      if(p.skip) return 0;
      return blockValue(cond !== 0 ? b0.body : b1.body, p);
    });
  }
  if(t !== undefined && BINARY2.has(t)) {
    p.idx++;
    const a = await parseBinary(p, 1);
    const b = await parseBinary(p, 1);
    return p.skip ? 0 : BINARY2_FNS[t](a, b, p.rctx.session.turtle);
  }
  if(t !== undefined && hasOwn(p.rctx.procs, t)) { p.idx++; return procValue(p, t, false); }
  if(t === READKEY) {
    p.idx++;
    if(p.skip) return 0;
    return readKey(p.rctx);
  }
  p.idx++;
  if(p.skip && t !== undefined && (isVarTok(t) || t === 'REPCOUNT' || t === 'REPCOUNTMAX')) return 0; // not read when skipped
  return resolveToken(t, p.vars, p.rctx);
}

// procValue(p, name, parens): a user procedure used as a value — FD DOUBLE 50,
// OUTPUT :N * FACT :N - 1, (BOX 10 20). p.idx is just after the name; in a call in
// parentheses the ) is left for the caller. Inputs are full expressions evaluated
// in the caller's scope.
async function procValue(p: Parser, name: string, parens: boolean): Promise<number> {
  const proc = p.rctx.procs[name];
  const scope: Scope = Object.create(p.vars);
  scope[PROC_SCOPE] = name;
  const got = await procInputs(p.tokens, () => p.idx, name, proc, parens, async k => { scope[proc.params[k]] = await parseBinary(p, 1); });
  if(p.skip) return 0;
  // Errors after the call (10 / Z, WAIT Z - 1) belong to this line, not to the
  // last line the procedure ran: restore the source position on return.
  const here = { ...p.rctx.execLine };
  await bindDefaults(name, proc, got, scope, p.rctx);
  const v = await deeper(p, () => runExpr(name, proc, scope, p.rctx));
  Object.assign(p.rctx.execLine, here);
  return v;
}

// readKey(rctx): wait for a key press and return its code. The canvas keeps being
// shown while it waits, and STOP ends the wait.
async function readKey(rctx: RunContext): Promise<number> {
  for(;;) {
    const k = rctx.io.readKey();
    if(k !== null) return k;
    if(rctx.stopped) throw STOP_SIGNAL;
    rctx.io.render();
    rctx.frameUsed = 0;
    await nextFrame(rctx);
    if(rctx.stopped) throw STOP_SIGNAL;
  }
}

// blockValue(body, p): the value of an IFELSE block — exactly one expression.
async function blockValue(body: Token[], p: Parser): Promise<number> {
  if(body.length === 0) throw new Error('IFELSE used as a value: a [ ] block is empty — it must hold a value');
  const sub: Parser = { tokens: body, idx: 0, vars: p.vars, rctx: p.rctx, paren: 1, skip: 0 }; // paren: the block may span lines
  const v = await parseBinary(sub, 1);
  if(sub.idx < body.length)
    throw new Error('IFELSE used as a value: a [ ] block must hold one value, found ' + body[sub.idx].text + ' after it');
  return v;
}
