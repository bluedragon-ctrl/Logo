import { isBuiltinWord } from './expr.ts';
import { isVarTok, varName } from './scope.ts';
import { newLine } from './tokenizer.ts';
import type { ProcMap, Token } from './types.ts';

// ── Block extractor ───────────────────────────────────────────────────────────
// extractBlock(tokens, idx) → { body: token[], nextIdx: number }
//   Consumes the '[' and collects all tokens up to the matching ']' (nesting
//   handled). The block may start on the next line:
//     IFELSE :N > 5 [ … ]
//                   [ … ]
export function extractBlock(tokens: Token[], idx: number): { body: Token[]; nextIdx: number } {
  if(tokens[idx]?.text !== '[') throw new Error('Expected [ but got: ' + (tokens[idx]?.text || 'end of program'));
  idx++; // consume '['
  let depth = 1; const body: Token[] = [];
  while(idx < tokens.length) {
    const t = tokens[idx++];
    if(t.text === '[') depth++;
    else if(t.text === ']' && --depth === 0) return { body, nextIdx: idx };
    body.push(t);
  }
  throw new Error('Missing ] — a [ was opened but never closed (check loop bodies and IF branches)');
}

// ── Procedures ────────────────────────────────────────────────────────────────
// User procedures live in session.procs: NAME (uppercase) → { params: string[], body: token[] }
//
// extractProcedures(tokens) → { topLevel: token[], newProcs: {} }
//   Pure function: moves TO…END blocks out of the token stream. The TO header
//   (name and parameters) is the rest of the TO line.
// Control-flow words handled inline by runStack (not in CMD).
export const CONTROL_WORDS = new Set(['IF','IFELSE','REPEAT','WHILE','FOR','STOP','BREAK','CONTINUE','OUTPUT','OP','TO','END']);
export function extractProcedures(tokens: Token[]): { topLevel: Token[]; newProcs: ProcMap } {
  const out: Token[] = [], newProcs: ProcMap = {}; let i = 0;
  let depth = 0; // [ ] nesting at top level: TO is not allowed inside a block
  while(i < tokens.length) {
    const tok = tokens[i];
    if(tok.text === 'TO') {
      const defLine = tok.line;
      if(depth > 0) throw new Error('TO inside [ ] (line ' + defLine + '): define procedures outside of blocks');
      i++;
      if(i >= tokens.length || newLine(tokens, i))
        throw new Error('TO: missing procedure name (line ' + defLine + ')');
      const name = tokens[i++].text;
      if(!/^[A-Z_]/.test(name))
        throw new Error('TO: invalid procedure name: ' + name + ' (line ' + defLine + ')');
      if(isBuiltinWord(name))
        throw new Error('TO: ' + name + ' is a built-in word and cannot be redefined (line ' + defLine + ')');
      const params: string[] = [];
      while(i < tokens.length && !newLine(tokens, i) && isVarTok(tokens[i].text)) {
        const p = varName(tokens[i++].text);
        if(params.includes(p)) throw new Error('TO ' + name + ': input :' + p + ' is listed twice (line ' + defLine + ')');
        params.push(p);
      }
      const body: Token[] = [];
      while(i < tokens.length && tokens[i].text !== 'END') {
        if(tokens[i].text === 'TO') throw new Error('Procedure ' + name + ' (line ' + defLine + '): missing END before the next TO');
        body.push(tokens[i++]);
      }
      if(i >= tokens.length) throw new Error('Procedure ' + name + ' (line ' + defLine + '): missing END');
      i++; // consume END
      newProcs[name] = { params, body };
    } else if(tok.text === 'END') {
      // LABEL END: the END closed the procedure (or stands alone) — point at the fix.
      const afterLabel = tokens[i - 1]?.text === 'LABEL' || (tokens[i - 1]?.text === 'END' && tokens[i - 2]?.text === 'LABEL');
      throw new Error('END without a matching TO (line ' + tok.line + ')' + (afterLabel ? ' — to draw the word END write LABEL "END' : ''));
    } else {
      if(tok.text === '[') depth++;
      else if(tok.text === ']' && depth > 0) depth--;
      out.push(tokens[i++]);
    }
  }
  return { topLevel: out, newProcs };
}
