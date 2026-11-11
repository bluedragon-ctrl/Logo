import type { Token } from './types.ts';

// ── Tokeniser ─────────────────────────────────────────────────────────────────
// tokenize(src) → token[]
//   Splits source into positioned tokens { text, line, col, lineText }: line and
//   col are 1-based and point at the token's first character in the source;
//   lineText is the trimmed source line (shared by all tokens of that line), so
//   error messages can name the line everywhere — also after extractBlock() and
//   procedure-body slicing.
//
// Line breaks matter in two places only, and both compare token lines (newLine):
// outside ( ) a binary operator on the next line does not continue an expression,
// and a TO header (name, parameters) ends with its line. DOT takes inputs only
// from its own line.
//
// Case: all tokens are uppercased here (OPT-4) EXCEPT "quoted words, which keep
// their source case so LABEL "Hello draws Hello. Names taken from :x / "x are
// uppercased by varName().
//
// Negative sign: a '-' preceded by start-of-line, whitespace, '[' or '(' and
// directly followed by a digit, '.', ':', '(' or a letter becomes the token '~'
// (see the expression evaluator). 'A - B' and 'A-B' stay binary subtraction.

export function tokenize(src: string): Token[] {
  const TOK = />=|<=|!=|[\[\]()+\-*\/=><~]|[^\s\[\]()+\-*\/=><~]+/g;
  const tokens: Token[] = [];
  src.split('\n').forEach((rawLine, i) => {
    const stripped = rawLine.replace(/;.*$/, '');  // strip inline comment
    // Same length as the source line ('-' → '~'), so match indices are source columns.
    const processed = stripped.replace(/(^|[\s\[(])-(?=[\d.:(A-Za-z])/g, '$1~');
    const lineText = rawLine.trim();
    for(const m of processed.matchAll(TOK)) {
      const tok = m[0];
      tokens.push({ text: tok.startsWith('"') ? tok : tok.toUpperCase(), line: i + 1, col: m.index + 1, lineText });
    }
  });
  return tokens;
}

// newLine(tokens, idx): does tokens[idx] start a later source line than the token before it?
export function newLine(tokens: Token[], idx: number): boolean {
  return idx > 0 && idx < tokens.length && tokens[idx].line !== tokens[idx - 1].line;
}
