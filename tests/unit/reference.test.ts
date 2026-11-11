import { describe, expect, test } from 'vitest';
import { CMD } from '../../src/interpreter/commands.ts';
import { BINARY2, BINOP_PREC, QUERY_TOKENS, UNARY } from '../../src/interpreter/expr.ts';
import { CONTROL_WORDS } from '../../src/interpreter/procedures.ts';
import { REFERENCE, entryWords, findEntry, scoreEntry } from '../../src/reference.ts';
import { runLogo } from './run-logo.ts';

// The Commands panel (src/reference.ts) must list every built-in word, and only
// words that exist. (The colour swatches are built from COLOR_NAMES itself.)
const BUILTINS = new Set<string>([
  ...Object.keys(CMD), ...CONTROL_WORDS, ...UNARY, ...BINARY2, ...QUERY_TOKENS.keys(),
  ...[...BINOP_PREC.keys()].filter(w => /^[A-Z]+$/.test(w)),   // AND, OR, MOD
  'REPCOUNT', 'REPCOUNTMAX', 'NOT', 'READKEY',
]);
const entries = REFERENCE.flatMap(s => s.entries);
const documented = new Set(entries.flatMap(entryWords));
const examples = entries.flatMap(e => (e.examples ?? []).map(x => [e.syntax, x] as [string, string]));

describe('commands reference', () => {
  test('every built-in word is documented', () => {
    expect([...BUILTINS].filter(w => !documented.has(w)).sort()).toEqual([]);
  });
  test('every documented word exists', () => {
    expect([...documented].filter(w => !BUILTINS.has(w)).sort()).toEqual([]);
  });
  test('each word is documented by one entry only', () => {
    const seen = new Map<string, string>(), twice: string[] = [];
    for (const e of entries) for (const w of entryWords(e)) {
      // SETPC / SETPENCOLOR's form names SETCOLOR on purpose
      if (seen.has(w) && seen.get(w) !== e.syntax) twice.push(w + ': ' + seen.get(w) + ' / ' + e.syntax);
      seen.set(w, e.syntax);
    }
    expect(twice).toEqual([]);
  });
  test('section ids are unique', () => {
    expect(new Set(REFERENCE.map(s => s.id)).size).toBe(REFERENCE.length);
  });
  test('descriptions start lowercase and have no trailing full stop; longer texts are sentences', () => {
    for (const e of entries) {
      expect(e.desc, e.syntax).toMatch(/^[a-z0-9*>]/);
      expect(e.desc, e.syntax).not.toMatch(/\.$/);
      if (e.more) expect(e.more, e.syntax).toMatch(/^[A-Z0-9].*[.)]$/);
      for (const t of e.tags ?? []) expect(t, e.syntax).toBe(t.toLowerCase());
    }
  });
  test('"see" links point at another entry', () => {
    const bad: string[] = [];
    for (const e of entries) for (const w of e.see ?? []) {
      const target = findEntry(w);
      if (!target || target === e) bad.push(e.syntax + ' → ' + w);
    }
    expect(bad).toEqual([]);
  });
  test('every entry has an example', () => {
    expect(entries.filter(e => !e.examples?.length).map(e => e.syntax)).toEqual([]);
  });
  test('search ranks an exact word first, then prefixes, tags and descriptions', () => {
    const search = (q: string) => entries.map((e, n) => ({ e, n, s: scoreEntry(e, q) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.n - b.n).map(x => x.e.syntax);
    expect(search('fd')[0]).toBe('FORWARD / FD n');
    expect(search('circle')[0]).toBe('CIRCLE r');
    expect(search('circle')).toContain('ARC angle r');
    expect(search('turn').slice(0, 2)).toEqual(['RIGHT / RT n', 'LEFT / LT n']);
    expect(search('colour')).toContain('SETCOLOR / SC r g b');
    expect(search('setpen')).toEqual(['SETCOLOR / SC r g b', 'SETWIDTH / SW n']);   // prefix of SETPENCOLOR / SETPENSIZE
    expect(search('pen up')).toContain('PENUP / PU');                               // every word must match
    expect(search('zzz')).toEqual([]);
  });
  test.each(examples)('example runs: %s — %s', async (_syntax, prog) => {
    const { out } = await runLogo(prog);
    expect(out).toContain('✓ Done!');
    expect(out).not.toMatch(/✗|OUCH/);
  });
});
