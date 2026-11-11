import { StreamLanguage, type StringStream } from '@codemirror/language';
import { CMD } from '../interpreter/commands.ts';
import { BINARY2, QUERY_TOKENS, UNARY } from '../interpreter/expr.ts';
import { CONTROL_WORDS } from '../interpreter/procedures.ts';

// ── Logo syntax for CodeMirror ────────────────────────────────────────────────
// A StreamLanguage tokenizer that mirrors tokenize() (interpreter/tokenizer.ts):
// same word / operator split, ';' comments to the end of the line. It only
// classifies text for highlighting — the interpreter never sees its output.
// The word lists come from the interpreter's own tables, so a new command is
// highlighted without touching this file.
//
// Token names → highlight tags (see the HighlightStyle in editor.ts):
//   comment · string ("word) · variableName (:x) · number · operator
//   squareBracket · paren · definitionKeyword (TO / END) · controlKeyword
//   keyword (CMD) · variableName.function (math functions, queries, REPCOUNT)

const FUNCTIONS = new Set([...UNARY, ...BINARY2, ...QUERY_TOKENS.keys(), 'REPCOUNT', 'REPCOUNTMAX', 'NOT', 'AND', 'OR', 'MOD']);
const WORD = /^[^\s\[\]()+\-*\/=><~;]+/;

function token(stream: StringStream): string | null {
  if(stream.eatSpace()) return null;
  if(stream.peek() === ';') { stream.skipToEnd(); return 'comment'; }
  if(stream.match(/^[\[\]]/)) return 'squareBracket';
  if(stream.match(/^[()]/))   return 'paren';
  if(stream.match(/^(>=|<=|!=|[+\-*\/=><~])/)) return 'operator';
  const m = stream.match(WORD);
  if(!m || m === true) { stream.next(); return null; }
  const w = m[0], up = w.toUpperCase();
  if(w.startsWith('"')) return 'string';
  if(w.startsWith(':')) return 'variableName';
  if(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(w)) return 'number';
  if(up === 'TO' || up === 'END') return 'definitionKeyword';
  if(CONTROL_WORDS.has(up)) return 'controlKeyword';
  if(FUNCTIONS.has(up)) return 'variableName.function';
  if(CMD[up]) return 'keyword';
  return null; // user procedure names and unknown words
}

export const logoLanguage = StreamLanguage.define<null>({
  name: 'logo',
  startState: () => null,
  token,
  languageData: { commentTokens: { line: ';' } },
});
