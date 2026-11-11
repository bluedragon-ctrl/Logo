import { CMD } from './commands.ts';
import { BINARY2, BINOP_PREC, QUERY_TOKENS, UNARY, skipSen } from './expr.ts';
import { isVarTok, varName } from './scope.ts';
import { LINE_SEN } from './tokenizer.ts';
import type { ProcMap, Token } from './types.ts';

// ── Block extractor ───────────────────────────────────────────────────────────
// extractBlock(tokens, idx) → { body: token[], nextIdx: number }
//   Skips line sentinels, consumes the '[' and collects all tokens up to the
//   matching ']' (nesting handled). The block may start on the next line:
//     IFELSE :N > 5 [ … ]
//                   [ … ]
export function extractBlock(tokens: Token[], idx: number): { body: Token[]; nextIdx: number } {
  idx = skipSen(tokens, idx);
  if(tokens[idx] !== '[') throw new Error('Expected [ but got: ' + (tokens[idx] || 'end of program'));
  idx++; // consume '['
  let depth = 1; const body: Token[] = [];
  while(idx < tokens.length) {
    const t = tokens[idx++];
    if(t === '[') depth++;
    else if(t === ']' && --depth === 0) return { body, nextIdx: idx };
    body.push(t);
  }
  throw new Error('Missing ] — a [ was opened but never closed (check loop bodies and IF branches)');
}

// ── Procedures ────────────────────────────────────────────────────────────────
// User procedures live in session.procs: NAME (uppercase) → { params: string[], body: token[] }
//
// extractProcedures(tokens) → { topLevel: token[], newProcs: {} }
//   Pure function: moves TO…END blocks out of the token stream. Line sentinels
//   stay in topLevel so top-level errors report their line too.
// Control-flow words handled inline by runStack (not in CMD).
export const CONTROL_WORDS = new Set(['IF','IFELSE','REPEAT','WHILE','FOR','STOP','BREAK','CONTINUE','OUTPUT','OP','TO','END']);
export function extractProcedures(tokens: Token[]): { topLevel: Token[]; newProcs: ProcMap } {
  const out: Token[] = [], newProcs: ProcMap = {}; let i = 0, line = 0;
  while(i < tokens.length) {
    const tok = tokens[i];
    if(tok.startsWith(LINE_SEN)) { line = parseInt(tok.slice(LINE_SEN.length)); out.push(tokens[i++]); continue; }
    if(tok === 'TO') {
      const defLine = line;
      i++;
      if(i >= tokens.length || tokens[i].startsWith(LINE_SEN))
        throw new Error('TO: missing procedure name (line ' + defLine + ')');
      const name = tokens[i++];
      if(!/^[A-Z_]/.test(name))
        throw new Error('TO: invalid procedure name: ' + name + ' (line ' + defLine + ')');
      if(CMD[name] || CONTROL_WORDS.has(name) || UNARY.has(name) || BINARY2.has(name) || BINOP_PREC.has(name) ||
         QUERY_TOKENS.has(name) || name === 'REPCOUNT' || name === 'REPCOUNTMAX' || name === 'NOT')
        throw new Error('TO: ' + name + ' is a built-in word and cannot be redefined (line ' + defLine + ')');
      const params: string[] = [];
      while(i < tokens.length && isVarTok(tokens[i])) params.push(varName(tokens[i++]));
      const body: Token[] = [];
      while(i < tokens.length && tokens[i] !== 'END') {
        if(tokens[i] === 'TO') throw new Error('Procedure ' + name + ' (line ' + defLine + '): missing END before the next TO');
        body.push(tokens[i++]);
      }
      if(i >= tokens.length) throw new Error('Procedure ' + name + ' (line ' + defLine + '): missing END');
      i++; // consume END
      newProcs[name] = { params, body };
    } else if(tok === 'END') {
      throw new Error('END without a matching TO (line ' + line + ')');
    } else {
      out.push(tokens[i++]);
    }
  }
  return { topLevel: out, newProcs };
}
