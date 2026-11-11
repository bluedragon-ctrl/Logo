import { describe, expect, test } from 'vitest';
import { extractProcedures } from '../../src/interpreter/procedures.ts';
import { formatNum } from '../../src/interpreter/scope.ts';
import { LINE_SEN, tokenize } from '../../src/interpreter/tokenizer.ts';
import { clipToCanvas } from '../../src/turtle/motion.ts';
import { beautify } from '../../src/format/beautify.ts';

const code = (toks: string[]): string[] => toks.filter(t => !t.startsWith(LINE_SEN));

describe('tokenize', () => {
  test('uppercases everything except "quoted words', () => {
    expect(code(tokenize('fd 10 label "Hello'))).toEqual(['FD', '10', 'LABEL', '"Hello']);
  });
  test('one line sentinel per non-empty line, with the source text', () => {
    const t = tokenize('FD 10\n\n  RT 90 ; turn');
    expect(t.filter(x => x.startsWith(LINE_SEN))).toEqual([LINE_SEN + '1:FD 10', LINE_SEN + '3:RT 90 ; turn']);
  });
  test('comments are stripped', () => {
    expect(code(tokenize('; nothing\nFD 1 ; go'))).toEqual(['FD', '1']);
  });
  test('negative sign becomes ~, subtraction stays -', () => {
    expect(code(tokenize('SETPOS 0 -100'))).toEqual(['SETPOS', '0', '~', '100']);
    expect(code(tokenize('FD -:X'))).toEqual(['FD', '~', ':X']);
    expect(code(tokenize('PRINT 5 - 3'))).toEqual(['PRINT', '5', '-', '3']);
    expect(code(tokenize('PRINT 5-3'))).toEqual(['PRINT', '5', '-', '3']);
  });
  test('operators and brackets split without spaces', () => {
    expect(code(tokenize('IF :A>=2[FD(1+2)]'))).toEqual(['IF', ':A', '>=', '2', '[', 'FD', '(', '1', '+', '2', ')', ']']);
  });
});

describe('extractProcedures', () => {
  test('moves TO … END out of the top level', () => {
    const { topLevel, newProcs } = extractProcedures(tokenize('TO SQ :S\n REPEAT 4 [ FD :S RT 90 ]\nEND\nSQ 50'));
    expect(Object.keys(newProcs)).toEqual(['SQ']);
    expect(newProcs.SQ.params).toEqual(['S']);
    expect(code(topLevel)).toEqual(['SQ', '50']);
  });
  test('missing END is an error', () => {
    expect(() => extractProcedures(tokenize('TO F\n FD 10'))).toThrow(/missing END/);
  });
});

describe('formatNum', () => {
  test.each([[3, '3'], [0.1 + 0.2, '0.3'], [-2.5, '-2.5'], [1 / 3, '0.333333333333']])('%s → %s', (v, s) => {
    expect(formatNum(v)).toBe(s);
  });
});

describe('clipToCanvas', () => {
  test('null while on the canvas', () => {
    expect(clipToCanvas(0, 0, 50, 50, 200, 200)).toBeNull();
  });
  test('straight path stops at the edge', () => {
    expect(clipToCanvas(0, 0, 0, 500, 200, 200)).toEqual([0, 100]);
  });
  test('diagonal path stops where it leaves', () => {
    const [x, y] = clipToCanvas(0, 0, 300, 150, 200, 200) ?? [NaN, NaN];
    expect(x).toBeCloseTo(100); expect(y).toBeCloseTo(50);
  });
});

describe('beautify', () => {
  test('indents procedure bodies and is idempotent', () => {
    const src = 'to sq :s\nrepeat 4 [fd :s rt 90]\nend';
    const out = beautify(src);
    expect(out.split('\n')[1]).toMatch(/^\s+\S/);
    expect(beautify(out)).toBe(out);
  });
  test('keeps comments', () => {
    expect(beautify('FD 10 ; forward')).toContain('; forward');
  });
});
