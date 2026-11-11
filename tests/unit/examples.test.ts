import { describe, expect, test } from 'vitest';
import { EXAMPLES, EXAMPLE_TOPICS, examplesUsing, usedWords } from '../../src/examples.ts';
import { beautify } from '../../src/format/beautify.ts';
import { ENDS_WITH_OUCH } from '../cases.js';
import { drawingPicture } from './drawing-picture.ts';
import { runLogo } from './run-logo.ts';

// A modest canvas (a small laptop window, after the side panel): every example
// should fit in it, and the drawing snapshots are taken at this size.
const SMALL = { width: 640, height: 480 };
// Examples that use RND / RANDOM draw something new each run: no snapshot.
const isRandom = (code: string) => /\b(RND|RANDOM)\b/i.test(code.replace(/;.*$/gm, ''));

describe('examples', () => {
  test('all example files are loaded', () => {
    expect(EXAMPLES.length).toBeGreaterThan(20);
    for (const e of EXAMPLES) {
      expect(e.title).toBeTruthy();
      expect(e.code.trim()).toBeTruthy();
    }
  });
  test('every example has a known topic, and every topic has examples', () => {
    expect(EXAMPLES.filter(e => !EXAMPLE_TOPICS.includes(e.topic)).map(e => e.title)).toEqual([]);
    expect(EXAMPLE_TOPICS.filter(t => !EXAMPLES.some(e => e.topic === t))).toEqual([]);
  });
  test('"shows" names only commands the example uses', () => {
    const bad = EXAMPLES.flatMap(e => e.shows.filter(w => !e.uses.includes(w)).map(w => e.title + ': ' + w));
    expect(bad).toEqual([]);
  });
  test('uses: built-in words found with the tokenizer, aliases and all', () => {
    expect(usedWords('; FD in a comment\nTO SQ :S\nrepeat 4 [ fd :s rt 90 ]\nEND\nSQ 10 LABEL "FD PRINT 2 + 3')).toEqual(['TO', 'REPEAT', 'FD', 'RT', 'END', 'LABEL', 'PRINT']);
    const forEx = examplesUsing(['FOR']);
    expect(forEx.length).toBeGreaterThan(1);
    expect(EXAMPLES[forEx[0]].shows).toContain('FOR');   // examples about FOR come first
  });
  test.each(EXAMPLES.map(e => [e.title, e]))('runs: %s', async (title, e) => {
    // A large canvas, like a desktop browser window.
    const { out } = await runLogo(e.code, { width: 1000, height: 800 });
    expect(out).not.toMatch(/✗/);
    if (ENDS_WITH_OUCH.has(title)) expect(out).toContain('OUCH!');
    else { expect(out).toContain('✓ Done!'); expect(out).not.toContain('OUCH'); }
  }, 30000);
  test.each(EXAMPLES.map(e => [e.title, e]))('fits a 640 × 480 canvas: %s', async (title, e) => {
    const { out } = await runLogo(e.code, SMALL);
    expect(out).not.toMatch(/✗/);
    if (!ENDS_WITH_OUCH.has(title)) expect(out).not.toContain('OUCH');
  }, 30000);
  // The drawing of every deterministic example, as a character picture + hash
  // (tests/unit/__snapshots__/examples.test.ts.snap). A change to an example, to
  // the interpreter or to the turtle geometry shows up here. If the change is
  // intended, update the snapshots: npx vitest run -u, and review the diff.
  test.each(EXAMPLES.filter(e => !isRandom(e.code)).map(e => [e.title, e]))('drawing: %s', async (_title, e) => {
    const { session } = await runLogo(e.code, SMALL);
    expect(drawingPicture(session.drawing, SMALL.width, SMALL.height)).toMatchSnapshot();
  }, 30000);
  test.each(EXAMPLES.map(e => [e.title, e.code]))('beautify is idempotent: %s', (_title, code) => {
    const once = beautify(code);
    expect(beautify(once)).toBe(once);
  });
});
