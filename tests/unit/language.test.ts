import { describe, expect, test } from 'vitest';
import { CASES } from '../cases.js';
import { makeRunContext } from '../../src/interpreter/context.ts';
import { execute, parseProgram } from '../../src/interpreter/execute.ts';
import { headlessIO } from '../../src/interpreter/io.ts';
import { createSession } from '../../src/interpreter/session.ts';
import { runLogo } from './run-logo.ts';

describe('language cases (tests/cases.js)', () => {
  test.each(CASES)('%s', async (_name, src, expected) => {
    const { out } = await runLogo(src);
    expect(out).toContain(expected);
  });
});

describe('interpreter state', () => {
  test('a square is 4 segments and ends where it started', async () => {
    const { session } = await runLogo('REPEAT 4 [ FD 100 RT 90 ]');
    expect(session.drawing.len).toBe(4);
    expect(session.turtle.x).toBeCloseTo(0, 9);
    expect(session.turtle.y).toBeCloseTo(0, 9);
    expect(((session.turtle.angle % 360) + 360) % 360).toBeCloseTo(0, 9);
  });
  test('PENUP moves without drawing', async () => {
    const { session } = await runLogo('PU FD 50 PD FD 50');
    expect(session.drawing.len).toBe(1);
    expect(session.turtle.y).toBeCloseTo(100, 9);
  });
  test('LABEL and DOT are stored in the drawing', async () => {
    const { session } = await runLogo('LABEL "Hi\nDOT 10 20');
    expect(session.drawing.labels).toEqual([{ x: 0, y: 0, text: 'Hi', r: 0, g: 0, b: 0 }]);
    expect(session.drawing.len).toBe(1);
  });
  test('CS clears the drawing but keeps variables', async () => {
    const { session, out } = await runLogo('MAKE :A 5\nFD 10\nCS\nPRINT :A');
    expect(session.drawing.len).toBe(0);
    expect(out).toContain('PRINT → 5');
  });
  test('SCRWIDTH / SCRHEIGHT come from io.canvasSize()', async () => {
    const { out } = await runLogo('PRINT SCRWIDTH\nPRINT SCRHEIGHT', { width: 640, height: 480 });
    expect(out).toContain('PRINT → 640');
    expect(out).toContain('PRINT → 480');
  });
  test('the canvas edge depends on the canvas size', async () => {
    const small = await runLogo('FD 150', { width: 200, height: 200 });
    expect(small.out).toContain('OUCH!');
    expect(small.session.turtle.y).toBe(100);
    const big = await runLogo('FD 150', { width: 400, height: 400 });
    expect(big.out).toContain('✓ Done!');
  });
  test('variables and procedures persist in a session (direct mode)', async () => {
    const first = await runLogo('MAKE :N 3\nTO TRI\n REPEAT :N [ FD 10 RT 120 ]\nEND');
    const { out, session } = await runLogo('TRI\nPRINT :N', { session: first.session });
    expect(out).toContain('PRINT → 3');
    expect(session.drawing.len).toBe(3);
  });
  test('animated speed gives the same result as instant', async () => {
    const src = 'REPEAT 3 [ FD 20 RT 120 ]\nCIRCLE 5';
    const instant = await runLogo(src);
    const animated = await runLogo(src, { speed: 3 });
    expect(animated.session.drawing.len).toBe(instant.session.drawing.len);
    expect(animated.session.turtle.x).toBeCloseTo(instant.session.turtle.x, 6);
    expect(animated.session.turtle.y).toBeCloseTo(instant.session.turtle.y, 6);
  });
  test('STOP (rctx.stopped) ends the run without an error', async () => {
    const io = headlessIO();
    const rctx = makeRunContext(4, createSession(), io);
    const parsed = parseProgram('WHILE [ 1 = 1 ] [ MAKE :I 1 ]', io);
    if (!parsed) throw new Error('parse failed');
    const run = execute(parsed.topLevel, rctx);
    setTimeout(() => { rctx.stopped = true; }, 50);
    await run;
    expect(io.text()).not.toMatch(/✗|Done/);
  });
});
