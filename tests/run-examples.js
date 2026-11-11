// Browser test for Blue Logo (Playwright). The interpreter itself is unit-tested
// with Vitest (tests/unit/); this file checks the real page end to end.
// Usage:  npm test                                   (builds, then tests dist/)
//         node tests/run-examples.js                 (tests the existing dist/ build)
//         node tests/run-examples.js versions/claude-logo-v8.1.html   (an archived single-file version)
// Needs Playwright + Chromium (pre-installed in Claude Code cloud sessions).
// Runs every EXAMPLES entry at instant speed, checks for "✓ Done!", checks beautify
// idempotency, runs the language cases (tests/cases.js, shared with Vitest) and the
// UI checks below. Exit code 1 on any failure.
/* global editor, EXAMPLES, beautify, optSpeed, runDirectCommand, activeRctx, labelStore */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, ENDS_WITH_OUCH } from './cases.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Serve dist/ on a local port (module scripts do not load from file://).
// The site is served under /Logo/ like on GitHub Pages.
function serveDist() {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/ not found — run "npm run build" first (or use "npm test").');
    process.exit(2);
  }
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!url.startsWith('/Logo/')) { res.writeHead(404).end(); return; }
    let file = path.normalize(path.join(DIST, url.slice('/Logo/'.length)));
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// UI-level checks (run after the language cases). Each returns [ok, detail].
// { currentOnly: true } = skipped when testing an archived single-file version.
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
  ['SPEED in a program does not stick; in direct mode it does', async (page) => {
    await page.evaluate(() => { optSpeed.value = 2; editor.setValue('SPEED 4\nFD 10'); document.getElementById('btn-run').click(); });
    await page.waitForFunction(() => activeRctx === null, null, { timeout: 3000 });
    const afterRun = await page.evaluate(() => optSpeed.value);
    await page.evaluate(() => runDirectCommand('SPEED 1'));
    const afterDirect = await page.evaluate(() => optSpeed.value);
    await page.evaluate(() => { optSpeed.value = 4; });
    return [afterRun === '2' && afterDirect === '1', JSON.stringify({ afterRun, afterDirect })];
  }],
  ['SETBG colours the canvas, CS keeps it, the next RUN resets it', async (page) => {
    const corner = () => page.evaluate(() => [...document.getElementById('c').getContext('2d').getImageData(2, 2, 1, 1).data.slice(0, 3)].join());
    const runIt = async (src) => {
      await page.evaluate(c => { document.getElementById('opt-clear-on-run').checked = true; editor.setValue(c); document.getElementById('btn-run').click(); }, src);
      await page.waitForFunction(() => activeRctx === null, null, { timeout: 3000 });
    };
    await runIt('SETBG NAVY\nCS\nFD 10');
    const navy = await corner();
    await runIt('FD 10');
    const after = await corner();
    return [navy === '0,0,150' && after === '244,238,223', JSON.stringify({ navy, after })];
  }, { currentOnly: true }],
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
  ['autosave migrates the pre-rename key', async (page) => {
    const src = 'FD 42';
    await page.evaluate(c => { localStorage.removeItem('blue-logo:program'); localStorage.setItem('claude-logo:program', c); }, src);
    await page.reload(); await page.waitForTimeout(300);
    const [got, oldKey] = await page.evaluate(() => [editor.getValue(), localStorage.getItem('claude-logo:program')]);
    return [got === src && oldKey === null, JSON.stringify(got)];
  }, { currentOnly: true }],
  ['editor: typing, Tab, undo, line numbers, bracket match', async (page) => {
    await page.evaluate(() => editor.setValue('REPEAT 4 [ FD 10 ]'));
    await page.click('.cm-content');
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.type('rt 90');
    const typed = await page.evaluate(() => editor.getValue());
    const [gutter, ln] = await page.evaluate(() => [document.querySelectorAll('.cm-lineNumbers .cm-gutterElement').length > 1,
                                                     document.getElementById('ln-indicator').textContent]);
    await page.keyboard.press('Control+Home'); for (let k = 0; k < 9; k++) await page.keyboard.press('ArrowRight'); // caret before '['
    const match = await page.evaluate(() => document.querySelectorAll('.cm-matchingBracket').length === 2);
    await page.keyboard.press('Control+z');
    const undone = await page.evaluate(() => editor.getValue());
    const ok = typed === 'REPEAT 4 [ FD 10 ]\n  rt 90' && gutter && ln === 'L:2' && match && undone.trimEnd() === 'REPEAT 4 [ FD 10 ]';
    return [ok, JSON.stringify({ typed, gutter, ln, match, undone })];
  }, { currentOnly: true }],
  ['canvas is plain beige by default, UI uses system fonts', async (page) => {
    const [px, font] = await page.evaluate(() => {
      const c = document.getElementById('c');
      const d = c.getContext('2d').getImageData(2, 2, 1, 1).data;   // corner: background only
      return [[d[0], d[1], d[2]], getComputedStyle(document.body).fontFamily];
    });
    const ok = px.join() === '244,238,223' && !font.includes('VT323');
    return [ok, JSON.stringify({ px, font })];
  }, { currentOnly: true }],
  ['commands panel: one aligned table, search, Try', async (page) => {
    await page.click('#btn-ref');
    await page.waitForTimeout(50);
    const r = await page.evaluate(() => {
      const body = document.getElementById('ref-body');
      const visibleRows = () => [...body.querySelectorAll('.ref-row')].filter(r => !r.hidden && !r.closest('tbody').hidden);
      const tables = body.querySelectorAll('table').length, all = visibleRows().length;
      const focused = document.activeElement?.id;
      const search = document.getElementById('ref-search');
      search.value = 'circle'; search.dispatchEvent(new Event('input'));
      const hits = visibleRows().map(r => r.querySelector('.ref-syntax').textContent);
      search.value = 'zzz'; search.dispatchEvent(new Event('input'));
      const none = !document.getElementById('ref-none').hidden;
      search.value = ''; search.dispatchEvent(new Event('input'));
      body.querySelector('[data-try="FD 100"]').click();
      const direct = document.getElementById('direct-input').value;
      return { tables, all, focused, hits, none, direct, back: visibleRows().length === all };
    });
    await page.evaluate(() => { document.getElementById('btn-direct-toggle').click(); document.getElementById('direct-input').value = ''; document.getElementById('btn-ref-close').click(); });
    const ok = r.tables === 1 && r.all > 60 && r.focused === 'ref-search' && r.hits.join() === 'CIRCLE r,ARC angle r'
            && r.none && r.direct === 'FD 100' && r.back;
    return [ok, JSON.stringify(r)];
  }, { currentOnly: true }],
  ['examples panel: a picture per example, click loads the code', async (page) => {
    await page.click('#btn-examples');
    await page.waitForFunction(() => document.getElementById('ex-grid').dataset.thumbs === 'done', null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#ex-grid .ex-card')];
      // a picture is drawn when its canvas has non-transparent pixels
      const blank = cards.filter(c => {
        const cv = c.querySelector('canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
        return true;
      }).map(c => c.querySelector('.ex-title').textContent);
      cards[2].click();
      return { cards: cards.length, blank, loaded: editor.getValue() === EXAMPLES[2].code,
               closed: !document.getElementById('ex-overlay').classList.contains('open') };
    });
    const ok = r.cards === (await page.evaluate(() => EXAMPLES.length)) && r.blank.length === 0 && r.loaded && r.closed;
    return [ok, JSON.stringify(r)];
  }, { currentOnly: true }],
  ['page is titled Blue Logo', async (page) => {
    const [title, h1] = await page.evaluate(() => [document.title, document.querySelector('h1').textContent]);
    return [title === 'Blue Logo' && h1.includes('BLUE LOGO'), title + ' / ' + h1];
  }, { currentOnly: true }],
];

(async () => {
  let url, server = null;
  if (process.argv[2]) url = 'file://' + path.resolve(process.argv[2]);
  else { server = await serveDist(); url = `http://127.0.0.1:${server.address().port}/Logo/`; }
  const origin = server ? new URL(url).origin : null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const externalRequests = [];
  page.on('request', r => {
    const u = r.url();
    if (!/^(file|data|blob):/.test(u) && !(origin && u.startsWith(origin + '/'))) externalRequests.push(u);
  });
  await page.goto(url);
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
  report(examples.length > 0, 'examples loaded: ' + examples.length);
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

  for (const [name, check, opts] of UI_CHECKS) {
    if (opts?.currentOnly && !server) continue;
    const [ok, detail] = await check(page, runProgram);
    report(ok, 'ui: ' + name + (detail ? '  (' + detail + ')' : ''));
  }

  report(externalRequests.length === 0, 'no network requests' + (externalRequests.length ? ' — ' + externalRequests.join(', ') : ''));

  await browser.close();
  if (server) server.close();
  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
