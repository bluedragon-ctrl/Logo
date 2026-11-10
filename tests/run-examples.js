// Headless smoke test for Claude Logo (dev tooling only — the app itself stays build-free).
// Usage:  node tests/run-examples.js [claude-logo-vX.Y.html]
// Needs Playwright + Chromium (pre-installed in Claude Code cloud sessions).
// Runs every EXAMPLES entry at instant speed, checks for "✓ Done!", checks beautify
// idempotency, runs the regression cases and UI checks below. Exit code 1 on any failure.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

function currentVersionFile() {
  const m = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').match(/url=(claude-logo-v[\d.]+\.html)/);
  return path.join(__dirname, '..', m[1]);
}

// Examples that are expected to end at the canvas edge rather than with "✓ Done!".
const ENDS_WITH_OUCH = new Set(['Tail Recursion — Endless Spiral']);

// [name, source, expected substring of the console output]
// One case per fixed bug / language rule — add a case for every future fix.
const CASES = [
  // Expression grammar (v8.0): precedence, left-associativity, parentheses, negatives
  ['precedence * before +',        'PRINT 2 + 3 * 4', 'PRINT → 14'],
  ['parentheses',                  'PRINT (2 + 3) * 4', 'PRINT → 20'],
  ['left-associative',             'PRINT 10 - 2 - 3', 'PRINT → 5'],
  ['unary minus',                  'PRINT - 3 + 4', 'PRINT → 1'],
  ['comparison below arithmetic',  'MAKE :A 5\nIF :A + 1 > 5 [ PRINT 1 ]', 'PRINT → 1'],
  ['NOT covers comparison',        'MAKE :X 3\nIF NOT :X = 5 [ PRINT 42 ]', 'PRINT → 42'],
  ['unary function binds tight',   'PRINT SIN 30 * 2', 'PRINT → 1'],
  ['negative literal is own arg',  'SETPOS 10 -20\nPRINT YCOR', 'PRINT → -20'],
  ['negative variable is own arg', 'MAKE :Y 30\nSETPOS 0 -:Y\nPRINT YCOR', 'PRINT → -30'],
  ['FD 100 -10 explains',          'FD 100 -10', 'For subtraction put spaces'],
  ['missing )',                    'PRINT (1 + 2', 'Missing )'],
  ['number formatting',            'PRINT 0.1 + 0.2', 'PRINT → 0.3'],
  // Scoping (v8.0): UCBLogo MAKE, LOCAL/LOCALMAKE, FOR inherits (B1)
  ['B1 FOR inside REPEAT sees outer var', 'MAKE :SIZE 10\nREPEAT 2 [ FOR :I 1 2 [ PRINT :SIZE ] ]', 'PRINT → 10'],
  ['B1 FOR inside proc sees global',      'MAKE :G 7\nTO P\n FOR :I 1 2 [ PRINT :G ]\nEND\nP', 'PRINT → 7'],
  ['FOR variable gone after loop',        'FOR :I 1 2 [ ]\nPRINT :I', 'Unknown variable: :I'],
  ['MAKE in proc updates global',         'MAKE :C 0\nTO INC\n MAKE :C :C + 1\nEND\nINC INC\nPRINT :C', 'PRINT → 2'],
  ['LOCAL keeps variable private',        'MAKE :X 1\nTO P\n LOCAL :X\n MAKE :X 99\nEND\nP\nPRINT :X', 'PRINT → 1'],
  ['parameter MAKE stays local',          'MAKE :N 1\nTO P :N\n MAKE :N :N + 10\nEND\nP 5\nPRINT :N', 'PRINT → 1'],
  ['B7 REPCOUNT does not leak into procs','TO P\n PRINT REPCOUNT\nEND\nREPEAT 2 [ P ]', 'REPCOUNT used outside'],
  // Procedures and recursion
  ['OUTPUT recursion',              'TO FACT :N\n IF :N < 2 [ OUTPUT 1 ]\n OUTPUT :N * FACT :N - 1\nEND\nPRINT FACT 10', 'PRINT → 3628800'],
  ['B6 runaway expression recursion', 'TO BOOM\n OUTPUT BOOM\nEND\nFD BOOM', 'nested too deeply'],
  ['tail recursion is unbounded',   'TO L :N\n IF :N = 0 [ STOP ]\n L :N - 1\nEND\nL 50000\nPRINT 7', 'PRINT → 7'],
  ['B9 OUTPUT used as command',     'TO F\n OUTPUT 5\nEND\nF', "You don't say what to do with 5"],
  ['B5 missing END reported',       'TO F\n FD 10\nPRINT 1', 'missing END'],
  ['built-ins cannot be redefined', 'TO FD :X\nEND', 'cannot be redefined'],
  // Parsing / misc fixes
  ['B12 top-level errors name line', 'FD 10\nFD :NOPE', 'line 2'],
  ['B13 block on next line in proc', 'TO P\n IFELSE 1 [ PRINT 1 ]\n [ PRINT 2 ]\nEND\nP', 'PRINT → 1'],
  ['B8 SETPOS stops at the edge',    'SETPOS 5000 0\nPRINT 1', 'OUCH!'],
  ['B10 RANDOM below 1 rejected',    'PRINT RANDOM 0.5', 'RANDOM: argument must be >= 1'],
  ['PRINT "word keeps case',         'PRINT "Hello', 'PRINT → Hello'],
  ['busy loop without motion',       'MAKE :I 0\nWHILE [ :I < 100000 ] [ MAKE :I :I + 1 ]\nPRINT :I', 'PRINT → 100000'],
];

// UI-level checks (run after the language cases). Each returns [ok, detail].
const UI_CHECKS = [
  ['B4 clear-on-run removes labels', async (page, runProgram) => {
    await runProgram('LABEL "HI'); await runProgram('FD 1');
    const n = await page.evaluate(() => labelStore.length);
    return [n === 0, 'labels left: ' + n];
  }],
  ['B2 STOP ends a WAIT immediately', async (page) => {
    await page.evaluate(() => { editor.setValue('WAIT 5'); document.getElementById('btn-run').click(); });
    await page.waitForTimeout(150);
    const t0 = Date.now();
    await page.evaluate(() => document.getElementById('btn-stop').click());
    await page.waitForFunction(() => activeRctx === null, null, { timeout: 3000 });
    return [Date.now() - t0 < 1000, (Date.now() - t0) + ' ms'];
  }],
  ['B3 direct mode refuses while running', async (page) => {
    await page.evaluate(() => { optSpeed.value = 0; editor.setValue('REPEAT 4 [ FD 100 RT 90 ]'); document.getElementById('btn-run').click(); });
    await page.waitForTimeout(100);
    const busy = await page.evaluate(async () => (await runDirectCommand('RT 45')) === false && activeRctx !== null);
    await page.evaluate(() => document.getElementById('btn-stop').click());
    await page.waitForFunction(() => activeRctx === null);
    return [busy, ''];
  }],
  ['infinite WHILE can be stopped', async (page) => {
    await page.evaluate(() => { editor.setValue('WHILE [ 1 = 1 ] [ MAKE :I 1 ]'); document.getElementById('btn-run').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('btn-stop').click());
    const ok = await page.waitForFunction(() => activeRctx === null, null, { timeout: 3000 }).then(() => true, () => false);
    return [ok, ''];
  }],
  ['autosave restores the program after a reload', async (page) => {
    const src = '; autosave test\nREPEAT 3 [ FD 50 RT 120 ]';
    await page.evaluate(c => editor.setValue(c), src);
    await page.waitForTimeout(700);                       // > AUTOSAVE_DELAY_MS
    await page.reload(); await page.waitForTimeout(300);
    const got = await page.evaluate(() => editor.getValue());
    const out = await page.evaluate(() => document.getElementById('console').textContent);
    return [got === src && out.includes('Restored your program'), JSON.stringify(got)];
  }],
];

(async () => {
  const file = path.resolve(process.argv[2] || currentVersionFile());
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const externalRequests = [];
  page.on('request', r => { if(!/^(file|data|blob):/.test(r.url())) externalRequests.push(r.url()); });
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
    const ok = ENDS_WITH_OUCH.has(title) ? out.includes('OUCH!') && !/✗|PAGEERROR/.test(out)
                                         : out.includes('✓ Done!') && !/✗|OUCH|PAGEERROR/.test(out);
    report(ok, 'example: ' + title);
  }
  const nonIdem = await page.evaluate(() => EXAMPLES.filter(e => beautify(beautify(e.code)) !== beautify(e.code)).map(e => e.title));
  report(nonIdem.length === 0, 'beautify idempotent on all examples' + (nonIdem.length ? ' — ' + nonIdem.join(', ') : ''));

  for (const [name, code, expect] of CASES) {
    const out = await runProgram(code);
    report(out.includes(expect), 'case: ' + name + (out.includes(expect) ? '' : '\n      expected "' + expect + '", got:\n      ' + out.split('\n').slice(-3).join(' | ')));
  }

  for (const [name, check] of UI_CHECKS) {
    const [ok, detail] = await check(page, runProgram);
    report(ok, 'ui: ' + name + (detail ? '  (' + detail + ')' : ''));
  }

  report(externalRequests.length === 0, 'no network requests' + (externalRequests.length ? ' — ' + externalRequests.join(', ') : ''));

  await browser.close();
  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
