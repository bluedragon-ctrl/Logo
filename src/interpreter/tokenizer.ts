import type { Token } from './types.ts';

// ── Tokeniser ─────────────────────────────────────────────────────────────────
// tokenize(src) → token[]
//   Splits source into tokens and injects a LINE_SEN sentinel before each
//   non-empty line. Sentinels survive extractBlock() and procedure body slicing,
//   so error messages can name the source line everywhere.
//
// Sentinel format: LINE_SEN + lineNum + ':' + original source text
//   e.g. "__L3:  REPEAT 4 [FD 100]"   (detected with startsWith(LINE_SEN))
//
// Case: all tokens are uppercased here (OPT-4) EXCEPT "quoted words, which keep
// their source case so LABEL "Hello draws Hello. Names taken from :x / "x are
// uppercased by varName().
//
// Negative sign: a '-' preceded by start-of-line, whitespace, '[' or '(' and
// directly followed by a digit, '.', ':', '(' or a letter becomes the token '~'
// (see the expression evaluator). 'A - B' and 'A-B' stay binary subtraction.

export const LINE_SEN = '__L'; // sentinel prefix; lowercase '__L' + digits never collides with a token
export function tokenize(src: string): Token[] {
  const TOK = />=|<=|!=|[\[\]()+\-*\/=><~]|[^\s\[\]()+\-*\/=><~]+/g;
  const tokens: Token[] = [];
  src.split('\n').forEach((rawLine, i) => {
    const stripped = rawLine.replace(/;.*$/, '');  // strip inline comment
    const processed = stripped.replace(/(^|[\s\[(])-(?=[\d.:(A-Za-z])/g, '$1~');
    const toks = processed.match(TOK);
    if(toks && toks.length) {
      tokens.push(LINE_SEN + (i + 1) + ':' + rawLine.trim()); // sentinel — kept as-is
      for(const tok of toks) tokens.push(tok.startsWith('"') ? tok : tok.toUpperCase());
    }
  });
  return tokens;
}
