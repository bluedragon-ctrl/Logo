import { describe, expect, test } from 'vitest';
import { EXAMPLES } from '../../src/examples.js';
import { beautify } from '../../src/format/beautify.js';
import { ENDS_WITH_OUCH } from '../cases.js';
import { runLogo } from './run-logo.js';

describe('examples', () => {
  test('all example files are loaded', () => {
    expect(EXAMPLES.length).toBeGreaterThan(20);
    for (const e of EXAMPLES) {
      expect(e.title).toBeTruthy();
      expect(e.code.trim()).toBeTruthy();
    }
  });
  test.each(EXAMPLES.map(e => [e.title, e]))('runs: %s', async (title, e) => {
    // A large canvas, like a desktop browser window.
    const { out } = await runLogo(e.code, { width: 1000, height: 800 });
    expect(out).not.toMatch(/✗/);
    if (ENDS_WITH_OUCH.has(title)) expect(out).toContain('OUCH!');
    else { expect(out).toContain('✓ Done!'); expect(out).not.toContain('OUCH'); }
  }, 30000);
  test.each(EXAMPLES.map(e => [e.title, e.code]))('beautify is idempotent: %s', (_title, code) => {
    const once = beautify(code);
    expect(beautify(once)).toBe(once);
  });
});
