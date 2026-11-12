import { describe, expect, test } from 'vitest';
import { CASES } from '../cases.js';
import { makeRunContext } from '../../src/interpreter/context.ts';
import { execute, parseProgram } from '../../src/interpreter/execute.ts';
import { headlessIO } from '../../src/interpreter/io.ts';
import { clearScreen, createSession } from '../../src/interpreter/session.ts';
import { segment } from '../../src/turtle/drawing.ts';
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
  test('SETBG sets the background; CS keeps it, clearScreen (RUN / CLR) resets it', async () => {
    const { session } = await runLogo('SETBG NAVY\nCS');
    expect(session.background).toEqual([0, 0, 150]);
    clearScreen(session, headlessIO());
    expect(session.background).toBeNull();
  });
  test('ARC draws one segment per step; animated = instant', async () => {
    const instant = await runLogo('ARC 90 100');
    expect(instant.session.drawing.len).toBe(25);   // a quarter of CIRCLE 100's 100 steps
    const animated = await runLogo('ARC 90 100', { speed: 3 });
    expect(animated.session.turtle).toEqual(instant.session.turtle);
  });
  test('a short-circuited AND / OR does not run the procedure on its right', async () => {
    const { out } = await runLogo('TO P\n PRINT 99\n OUTPUT 1\nEND\nPRINT 0 AND P\nPRINT 1 OR P\nPRINT 1 AND P');
    expect(out.match(/PRINT → 99/g)?.length).toBe(1); // only the last line calls P
  });
  test('FOREVER keeps running until stopped (and STOP works)', async () => {
    const io = headlessIO();
    const rctx = makeRunContext(4, createSession(), io);
    const parsed = parseProgram('FOREVER [ RT 1 ]', io);
    if (!parsed) throw new Error('parse failed');
    const run = execute(parsed.topLevel, rctx);
    setTimeout(() => { rctx.stopped = true; }, 50);
    await run;
    expect(io.text()).not.toMatch(/✗|Done/);
  });
  test('BEGINFILL … ENDFILL stores a polygon under the outline, in the pen colour of BEGINFILL', async () => {
    const { session } = await runLogo('FD 10\nSETCOLOR RED\nBEGINFILL\nSETCOLOR BLACK\nREPEAT 4 [ FD 50 RT 90 ]\nENDFILL');
    const [f] = session.drawing.fills;
    expect(session.drawing.fills.length).toBe(1);
    expect(f.at).toBe(1);                                    // after the first FD, before the square
    expect([f.r, f.g, f.b]).toEqual([220, 50, 50]);
    expect(f.pts).toEqual([0, 10, 0, 60, 50, 60, 50, 10]);   // the start point is not repeated at the end
    expect(session.fillPath).toBeNull();
  });
  test('a fill records pen-up moves, SETXY and HOME; CS drops a fill in progress', async () => {
    const { session } = await runLogo('PU\nBEGINFILL\nSETXY 100 0\nSETXY 100 100\nHOME\nENDFILL');
    expect(session.drawing.len).toBe(0);
    expect(session.drawing.fills[0].pts).toEqual([0, 0, 100, 0, 100, 100]);
    const cs = await runLogo('BEGINFILL\nFD 50 RT 90 FD 50\nCS\nPRINT 1');
    expect(cs.session.fillPath).toBeNull();
    expect(cs.session.drawing.fills.length).toBe(0);
    const line = await runLogo('BEGINFILL FD 50 ENDFILL');
    expect(line.session.drawing.fills.length).toBe(0);
    expect(line.out).toContain('fewer than 3 corners');
  });
  test('WRAP splits a line at the edge into pieces', async () => {
    const { session } = await runLogo('WRAP\nRT 90\nFD 700', { width: 400, height: 300 });
    expect(session.drawing.len).toBe(3);                     // 0 → 200, -200 → 200, -200 → -100
    expect(segment(session.drawing, 0).slice(0, 4)).toEqual([0, 0, 200, 0]);
    expect(segment(session.drawing, 1).slice(0, 4)).toEqual([-200, 0, 200, 0]);
    expect(segment(session.drawing, 2).slice(0, 4)).toEqual([-200, 0, -100, 0]);
    expect(session.turtle.x).toBe(-100);
    const animated = await runLogo('WRAP\nRT 90\nFD 700', { width: 400, height: 300, speed: 3 });
    expect(animated.session.drawing.len).toBe(3);
    expect(animated.session.turtle.x).toBe(-100);
  });
  test('WRAP with a huge distance draws a bounded number of pieces', async () => {
    const { session, out } = await runLogo('WRAP\nRT 89\nFD 1E9\nPRINT 1');
    expect(out).toContain('PRINT → 1');
    expect(session.drawing.len).toBeLessThanOrEqual(1000);
  });
  test('HOME draws a line when the pen is down, none when it is up', async () => {
    const down = await runLogo('SETXY 30 40\nHOME');
    expect(down.session.drawing.len).toBe(2);
    expect(segment(down.session.drawing, 1).slice(0, 4)).toEqual([30, 40, 0, 0]);
    const up = await runLogo('SETXY 30 40\nPU\nHOME');
    expect(up.session.drawing.len).toBe(1);
  });
  test('clearScreen (RUN / CLR) resets WRAP to FENCE; CS keeps it', async () => {
    const { session } = await runLogo('WRAP\nCS');
    expect(session.edge).toBe('wrap');
    clearScreen(session, headlessIO());
    expect(session.edge).toBe('fence');
  });
  test('SETPLOT maps the range into the canvas minus the margin; EQUAL uses one scale', async () => {
    const { session } = await runLogo('SETPLOT -1 1 0 10\nPU PLOT 1 10', { width: 480, height: 280 });
    expect([session.turtle.x, session.turtle.y]).toEqual([200, 100]);   // 480 / 2 - 40, 280 / 2 - 40
    const eq = await runLogo('(SETPLOT -1 1 -1 1 "EQUAL)\nPU PLOT 1 1', { width: 480, height: 280 });
    expect([eq.session.turtle.x, eq.session.turtle.y]).toEqual([100, 100]);
  });
  test('PLOT breaks the line outside the range: drawn to the edge, restarted where it comes back', async () => {
    // 1 / x at -1.5 -0.5 0.5 1.5: in, out below (line to the bottom edge), out above, back in from the top edge
    const { session } = await runLogo('SETPLOT -4 4 -1 1\nPU\nFOR :X -1.5 1.5 1 [ PLOT :X 1 / :X PD ]', { width: 480, height: 480 });
    const segs = Array.from({ length: session.drawing.len }, (_, i) => segment(session.drawing, i));
    expect(segs.length).toBe(2);
    expect(segs.every(([, y1, , y2]) => Math.abs(y1) <= 200 && Math.abs(y2) <= 200)).toBe(true);
    expect(segs[0][3]).toBe(-200);   // ends on the bottom edge of the plot area
    expect(segs[1][1]).toBe(200);    // starts again on the top edge
    expect(segs.some(([x1, , x2]) => Math.sign(x1) !== Math.sign(x2))).toBe(false);   // no line across x = 0
  });
  test('AXES draws two axes, ticks and labels; CS keeps the range, clearScreen removes it', async () => {
    const { session } = await runLogo('SETPLOT -1 1 -1 1\nAXES 0.5 0.5', { width: 480, height: 480 });
    expect(session.drawing.len).toBe(2 + 5 + 5);
    expect(session.drawing.labels.map(l => l.text).sort()).toEqual(['-0.5', '-0.5', '-1', '-1', '0', '0.5', '0.5', '1', '1']);
    const cs = await runLogo('SETPLOT -1 1 -1 1\nCS');
    expect(cs.session.plot).not.toBeNull();
    clearScreen(cs.session, cs.io);
    expect(cs.session.plot).toBeNull();
  });
  test('GRID draws a full-height line per x step and a full-width line per y step, no labels', async () => {
    const { session } = await runLogo('SETPLOT -1 1 0 2\nGRID 0.5 1', { width: 480, height: 480 });
    const d = session.drawing, segs = [];
    for (let k = 0; k < d.len; k++) segs.push(Array.from(d.f32.slice(k * 5, k * 5 + 4)));
    expect(d.len).toBe(5 + 3);
    expect(d.labels).toEqual([]);
    expect(segs.slice(0, 5).map(([x1, y1, x2, y2]) => [x1, x1 === x2, y1, y2])).toEqual(
      [-200, -100, 0, 100, 200].map(x => [x, true, -200, 200]));
    expect(segs.slice(5).map(([x1, y1, x2, y2]) => [y1, y1 === y2, x1, x2])).toEqual(
      [-200, 0, 200].map(y => [y, true, -200, 200]));
  });
  test('(LABEL …) joins its inputs with spaces', async () => {
    const { session } = await runLogo('MAKE "N 3\n(LABEL "n: :N * 2 "cm)');
    expect(session.drawing.labels.map(l => l.text)).toEqual(['n: 6 cm']);
  });
  test('READKEY reads the key presses in order; KEYP sees them', async () => {
    const { out } = await runLogo('PRINT KEYP\nPRINT READKEY\nPRINT READKEY\nPRINT KEYP', { keys: [65, 38] });
    expect(out).toMatch(/PRINT → 1\nPRINT → 65\nPRINT → 38\nPRINT → 0/);
  });
  test('READKEY waits for a key press, and STOP ends the wait', async () => {
    const io = headlessIO();
    const rctx = makeRunContext(4, createSession(), io);
    const parsed = parseProgram('PRINT READKEY\nPRINT READKEY', io);
    if (!parsed) throw new Error('parse failed');
    const run = execute(parsed.topLevel, rctx);
    setTimeout(() => io.keys.push(32), 20);
    setTimeout(() => { rctx.stopped = true; }, 60);
    await run;
    expect(io.text()).toContain('PRINT → 32');
    expect(io.text()).not.toMatch(/✗|Done/);
  });
  test('MOUSEX / MOUSEY / BUTTONP come from io.mouse()', async () => {
    const { out } = await runLogo('PRINT MOUSEX\nPRINT MOUSEY\nPRINT BUTTONP', { mouse: { x: -20, y: 35, down: true } });
    expect(out).toMatch(/PRINT → -20\nPRINT → 35\nPRINT → 1/);
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
