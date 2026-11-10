// Headless smoke test for Claude Logo (dev tooling only — the app itself stays build-free).
// Usage:  node tests/run-examples.js [claude-logo-vX.Y.html]
// Needs Playwright + Chromium (pre-installed in Claude Code cloud sessions).
// Runs every EXAMPLES entry at instant speed, checks for "✓ Done!", checks beautify
// idempotency, and runs the regression cases below. Exit code 1 on any failure.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

function currentVersionFile() {
  const m = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').match(/url=(claude-logo-v[\d.]+\.html)/);
  return path.join(__dirname, '..', m[1]);
}

// [name, source, expected substring of the last console lines]
// Cases marked KNOWN-BUG document behaviour found in the v7.3 review (REVIEW.md);
// flip their expectation when the bug is fixed.
const CASES = [
  ['precedence is right-recursive', 'PRINT 2 + 3 * 4', 'PRINT → 14'],
  ['10 - 2 - 3 right-recursive',    'PRINT 10 - 2 - 3', 'PRINT → 11'],
  ['OUTPUT recursion',              'TO FACT :N\n IF :N < 2 [ OUTPUT 1 ]\n OUTPUT :N * FACT :N - 1\nEND\nPRINT FACT 10', 'PRINT → 3628800'],
  ['KNOWN-BUG FOR in REPEAT loses outer var', 'MAKE :SIZE 10\nREPEAT 2 [ FOR :I 1 2 [ PRINT :SIZE ] ]', 'Unknown variable: SIZE'],
  ['KNOWN-BUG FOR in proc loses global',      'MAKE :G 7\nTO P\n FOR :I 1 2 [ PRINT :G ]\nEND\nP', 'Unknown variable: G'],
];

(async () => {
  const file = path.resolve(process.argv[2] || currentVersionFile());
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto('file://' + file);
  await page.waitForTimeout(300);

  async function runProgram(code) {
    pageErrors.length = 0;
    await page.evaluate(c => { editor.setValue(c); optSpeed.value = 4; document.getElementById('btn-run').click(); }, code);
    await page.waitForFunction(() => activeRctx === null, null, { timeout: 60000 });
    const out = await page.evaluate(() => [...document.getElementById('console').children].map(d => d.textContent).join('\n'));
    return out + (pageErrors.length ? '\n[PAGEERROR] ' + pageErrors.join('; ') : '');
  }

  let failures = 0;
  const report = (ok, label) => { if (!ok) failures++; console.log((ok ? 'ok   ' : 'FAIL ') + label); };

  const examples = await page.evaluate(() => EXAMPLES.map(e => [e.title, e.code]));
  for (const [title, code] of examples) {
    const out = await runProgram(code);
    report(out.includes('✓ Done!') && !/✗|OUCH|PAGEERROR/.test(out), 'example: ' + title);
  }
  const nonIdem = await page.evaluate(() => EXAMPLES.filter(e => beautify(beautify(e.code)) !== beautify(e.code)).map(e => e.title));
  report(nonIdem.length === 0, 'beautify idempotent on all examples' + (nonIdem.length ? ' — ' + nonIdem.join(', ') : ''));

  for (const [name, code, expect] of CASES) {
    const out = await runProgram(code);
    report(out.includes(expect), 'case: ' + name + (out.includes(expect) ? '' : '\n      expected "' + expect + '", got:\n      ' + out.split('\n').slice(-3).join(' | ')));
  }

  await browser.close();
  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
