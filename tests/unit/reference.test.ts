import { describe, expect, test } from 'vitest';
import { CMD } from '../../src/interpreter/commands.ts';
import { BINARY2, BINOP_PREC, QUERY_TOKENS, UNARY } from '../../src/interpreter/expr.ts';
import { CONTROL_WORDS } from '../../src/interpreter/procedures.ts';
import { REFERENCE, syntaxWords } from '../../src/reference.ts';
import { runLogo } from './run-logo.ts';

// The Commands panel (src/reference.ts) must list every built-in word, and only
// words that exist. (The colour swatches are built from COLOR_NAMES itself.)
const BUILTINS = new Set<string>([
  ...Object.keys(CMD), ...CONTROL_WORDS, ...UNARY, ...BINARY2, ...QUERY_TOKENS.keys(),
  ...[...BINOP_PREC.keys()].filter(w => /^[A-Z]+$/.test(w)),   // AND, OR, MOD
  'REPCOUNT', 'REPCOUNTMAX', 'NOT',
]);
const documented = new Set(REFERENCE.flatMap(s => s.entries.flatMap(e => syntaxWords(e.syntax))));
const entries = REFERENCE.flatMap(s => s.entries);

describe('commands reference', () => {
  test('every built-in word is documented', () => {
    expect([...BUILTINS].filter(w => !documented.has(w)).sort()).toEqual([]);
  });
  test('every documented word exists', () => {
    expect([...documented].filter(w => !BUILTINS.has(w)).sort()).toEqual([]);
  });
  test('descriptions start lowercase and have no trailing full stop', () => {
    for (const e of entries) {
      expect(e.desc, e.syntax).toMatch(/^[a-z0-9*>]/);
      expect(e.desc, e.syntax).not.toMatch(/\.$/);
    }
  });
  test.each(entries.filter(e => e.try).map(e => [e.syntax, e.try as string]))('"Try" line runs: %s', async (_syntax, line) => {
    const { out } = await runLogo(line);
    expect(out).toContain('✓ Done!');
    expect(out).not.toMatch(/✗|OUCH/);
  });
});
