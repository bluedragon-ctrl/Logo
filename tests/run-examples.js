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
  ['Speed slider changes the speed of a running program and keeps the choice', async (page) => {
    await page.evaluate(() => { optSpeed.value = 0; editor.setValue('REPEAT 40 [ FD 200 BK 200 ]'); document.getElementById('btn-run').click(); });
    await page.waitForTimeout(150);
    await page.evaluate(() => { optSpeed.value = 4; optSpeed.dispatchEvent(new Event('input')); });
    const t0 = Date.now();
    await page.waitForFunction(() => activeRctx === null, null, { timeout: 3000 }).catch(() => {});
    const ms = Date.now() - t0;
    const still = await page.evaluate(() => activeRctx !== null);
    if (still) { await page.evaluate(() => document.getElementById('btn-stop').click()); await page.waitForFunction(() => activeRctx === null); }
    const after = await page.evaluate(() => optSpeed.value);
    return [!still && after === '4', JSON.stringify({ ms, after })];
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
  ['key presses after clicking the canvas reach READKEY, not the editor', async (page) => {
    const src = 'MAKE "A READKEY\nMAKE "B READKEY\nPRINT :A * 1000 + :B';
    await page.evaluate(c => { editor.setValue(c); editor.focus(); document.getElementById('btn-run').click(); }, src);
    await page.click('#c');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('a');
    const done = await page.waitForFunction(() => activeRctx === null, null, { timeout: 3000 }).then(() => true, () => false);
    if(!done) await page.evaluate(() => document.getElementById('btn-stop').click());
    const out = await page.evaluate(() => document.getElementById('console').textContent);
    const code = await page.evaluate(() => editor.getValue());
    return [done && out.includes('PRINT → 38065') && code === src, JSON.stringify({ done, printed: /PRINT → \d+/.exec(out)?.[0], editorUnchanged: code === src })];
  }, { currentOnly: true }],
  ['MOUSEX / MOUSEY / BUTTONP follow the mouse on the canvas', async (page) => {
    await page.evaluate(() => { editor.setValue('FOREVER [ IF BUTTONP [ (PRINT "at MOUSEX MOUSEY) BREAK ] ]'); document.getElementById('btn-run').click(); });
    const box = await page.locator('#c').boundingBox();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 - 30);
    await page.mouse.down();
    const done = await page.waitForFunction(() => activeRctx === null, null, { timeout: 3000 }).then(() => true, () => false);
    await page.mouse.up();
    if(!done) await page.evaluate(() => document.getElementById('btn-stop').click());
    const out = await page.evaluate(() => document.getElementById('console').textContent);
    return [done && out.includes('PRINT → at 50 30'), JSON.stringify({ done, printed: /PRINT → at[^✓]*/.exec(out)?.[0] })];
  }, { currentOnly: true }],
  ['BEGINFILL … ENDFILL paints the inside; a resize repaints it the same', async (page) => {
    await page.evaluate(() => { editor.setValue('PU SETXY -50 -50 PD SETCOLOR RED BEGINFILL REPEAT 4 [ FD 100 RT 90 ] ENDFILL HT'); document.getElementById('btn-run').click(); });
    await page.waitForFunction(() => activeRctx === null, null, { timeout: 3000 });
    const centre = () => page.evaluate(() => { const c = document.getElementById('c'); return [...c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data.slice(0, 3)].join(); });
    const live = await centre();
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(300);                       // resize is debounced (150 ms), then rebuilds the trail layer
    const rebuilt = await centre();
    return [live === '220,50,50' && rebuilt === live, JSON.stringify({ live, rebuilt })];
  }, { currentOnly: true }],
  ['Save picture downloads a PNG of the canvas without the turtle', async (page) => {
    await page.evaluate(() => { document.getElementById('opt-clear-on-run').checked = true; editor.setValue('SETBG NAVY\nST'); document.getElementById('btn-run').click(); });
    await page.waitForFunction(() => activeRctx === null, null, { timeout: 3000 });
    const picker = await page.evaluate(() => { const p = window.showSaveFilePicker; window.showSaveFilePicker = undefined; return p; });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save-pic')]);
    await page.evaluate(p => { if (p) window.showSaveFilePicker = p; }, picker);
    const png = (await readFile(await dl.path())).toString('base64');
    const r = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const screen = document.getElementById('c');
      const at = (ctx, w, h) => [...ctx.getImageData(w >> 1, h >> 1, 1, 1).data.slice(0, 3)].join();
      return { size: img.width + 'x' + img.height, screenSize: screen.width + 'x' + screen.height,
               centre: at(x, img.width, img.height), screenCentre: at(screen.getContext('2d'), screen.width, screen.height) };
    }, png);
    const ok = dl.suggestedFilename() === 'SETBG-NAVY.png' && r.size === r.screenSize && r.centre === '0,0,150' && r.screenCentre !== '0,0,150';
    return [ok, JSON.stringify({ name: dl.suggestedFilename(), ...r })];
  }, { currentOnly: true }],
  ['infinite WHILE can be stopped', async (page) => {
    await page.evaluate(() => { editor.setValue('WHILE [ 1 = 1 ] [ MAKE "I 1 ]'); document.getElementById('btn-run').click(); });
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
  ['commands panel: one aligned table, chips, ranked search, cards with Try / Insert / links', async (page) => {
    await page.click('#btn-ref');
    await page.waitForTimeout(50);
    const r = await page.evaluate(() => {
      const body = document.getElementById('ref-body');
      const visibleRows = () => [...body.querySelectorAll('.ref-cmd:not([hidden]) .ref-row')];
      const syntaxOf = row => row.querySelector('.ref-syntax').textContent;
      const tables = body.querySelectorAll('table').length, all = visibleRows().length;
      const focused = document.activeElement?.id;
      const search = document.getElementById('ref-search');
      const type = q => { search.value = q; search.dispatchEvent(new Event('input')); };
      type('circle');
      const hits = visibleRows().map(syntaxOf).slice(0, 2);
      type('fd');
      const fdFirst = syntaxOf(visibleRows()[0]);
      type('zzz');
      const none = !document.getElementById('ref-none').hidden;
      type('');
      const back = visibleRows().length === all;
      // chips: one group only, then All again
      document.querySelector('#ref-chips [data-chip="loops"]').click();
      const loops = visibleRows().map(syntaxOf);
      const coloursHidden = document.getElementById('ref-colours').hidden;
      document.querySelector('#ref-chips [data-chip="all"]').click();
      // a card: opens on click, Try puts the line into direct mode
      const fwd = visibleRows().find(r => syntaxOf(r).startsWith('FORWARD'));
      fwd.click();
      const card = fwd.closest('.ref-cmd').querySelector('.ref-card');
      const opened = fwd.getAttribute('aria-expanded') === 'true' && !card.closest('.ref-detail').hidden;
      const usedIn = card.querySelectorAll('.ref-ex-chip').length;
      const moreEx = !!card.querySelector('[data-uses]');
      card.querySelector('[data-try="FD 100"]').click();
      const direct = document.getElementById('direct-input').value;
      // See also: jumps to BACK's card
      card.querySelector('[data-see="BACK"]').click();
      const seeOpen = document.activeElement?.classList.contains('ref-row') && syntaxOf(document.activeElement);
      return { tables, all, focused, hits, fdFirst, none, back, loops: loops.length, loopsOk: loops[0].startsWith('REPEAT') && loops.length < 12,
               coloursHidden, opened, usedIn, moreEx, direct, seeOpen };
    });
    // Insert: a TO example goes into the editor at the caret (at the start after setValue)
    const inserted = await page.evaluate(() => {
      editor.setValue('FD 10');
      const it = [...document.querySelectorAll('#ref-body .ref-row')].find(r => r.querySelector('.ref-syntax').textContent.startsWith('TO '));
      it.click();
      it.closest('.ref-cmd').querySelector('[data-insert]').click();
      return editor.getValue();
    });
    await page.evaluate(() => { document.getElementById('btn-direct-toggle').click(); document.getElementById('direct-input').value = ''; document.getElementById('btn-ref-close').click(); });
    const ok = r.tables === 1 && r.all > 60 && r.focused === 'ref-search' && r.hits.join() === 'CIRCLE r,ARC angle r' && r.fdFirst === 'FORWARD / FD n'
            && r.none && r.back && r.loopsOk && r.coloursHidden && r.opened && r.usedIn === 4 && r.moreEx && r.direct === 'FD 100'
            && r.seeOpen === 'BACK / BK n' && inserted.startsWith('TO SQUARE :SIZE') && inserted.endsWith('SQUARE 100\nFD 10');
    return [ok, JSON.stringify({ ...r, inserted: inserted.slice(0, 30) })];
  }, { currentOnly: true }],
  ['F1 in the editor opens the card of the word at the caret', async (page) => {
    await page.evaluate(() => editor.setValue('repeat 4 [ fd 10 ]'));
    await page.click('#editor .cm-content');
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('F1');
    await page.waitForTimeout(50);
    const r = await page.evaluate(() => {
      const open = document.getElementById('ref-overlay').classList.contains('open');
      const row = document.activeElement;
      return { open, row: row?.classList.contains('ref-row') ? row.querySelector('.ref-syntax').textContent : null,
               expanded: row?.getAttribute('aria-expanded') };
    });
    await page.evaluate(() => document.getElementById('btn-ref-close').click());
    return [r.open && r.row === 'REPEAT n [ … ]' && r.expanded === 'true', JSON.stringify(r)];
  }, { currentOnly: true }],
  ['examples panel: pictures, search, topics, preview, open in editor, links to commands', async (page) => {
    await page.click('#btn-examples');
    await page.waitForFunction(() => document.getElementById('ex-grid').dataset.thumbs === 'done', null, { timeout: 20000 });
    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#ex-grid .ex-card')];
      const visible = () => cards.filter(c => !c.hidden).length;
      // a picture is drawn when its canvas has non-transparent pixels
      const blank = cards.filter(c => {
        const cv = c.querySelector('canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
        return true;
      }).map(c => c.querySelector('.ex-title').textContent);
      const focused = document.activeElement?.id;
      const search = document.getElementById('ex-search');
      search.value = 'while'; search.dispatchEvent(new Event('input'));
      const whileHits = visible();
      search.value = ''; search.dispatchEvent(new Event('input'));
      document.querySelector('#ex-chips [data-chip="Recursion"]').click();
      const recursion = visible();
      document.querySelector('#ex-chips [data-chip="all"]').click();
      cards[2].click();
      const previewOpen = !document.getElementById('ex-preview').hidden && document.getElementById('ex-grid').hidden;
      const code = document.getElementById('exp-code').textContent === EXAMPLES[2].code;
      const cmds = [...document.querySelectorAll('#exp-cmds [data-cmd]')].map(b => b.dataset.cmd);
      document.getElementById('ex-open').click();
      return { cards: cards.length, blank, focused, whileHits, recursion, previewOpen, code, cmds,
               loaded: editor.getValue() === EXAMPLES[2].code,
               closed: !document.getElementById('ex-overlay').classList.contains('open') };
    });
    // From a command card: "All n examples" filters the Examples panel; a command link goes back.
    const r2 = await page.evaluate(() => {
      document.getElementById('btn-ref').click();
      const row = [...document.querySelectorAll('#ref-body .ref-row')].find(x => x.querySelector('.ref-syntax').textContent.startsWith('REPEAT'));
      if (row.getAttribute('aria-expanded') !== 'true') row.click();
      row.closest('.ref-cmd').querySelector('[data-uses]').click();
      const exOpen = document.getElementById('ex-overlay').classList.contains('open') && !document.getElementById('ref-overlay').classList.contains('open');
      const filtered = [...document.querySelectorAll('#ex-grid .ex-card')].filter(c => !c.hidden).map(c => EXAMPLES[c.dataset.n]);
      const allUse = filtered.every(e => e.uses.includes('REPEAT'));
      const label = document.getElementById('ex-uses-word').textContent;
      document.getElementById('ex-uses-clear').click();
      const cleared = [...document.querySelectorAll('#ex-grid .ex-card')].every(c => !c.hidden);
      document.querySelector('#ex-grid .ex-card').click();
      document.querySelector('#exp-cmds [data-cmd="FD"]').click();
      const refOpen = document.getElementById('ref-overlay').classList.contains('open');
      const focusedRow = document.activeElement?.querySelector?.('.ref-syntax')?.textContent;
      document.getElementById('btn-ref-close').click();
      return { exOpen, n: filtered.length, allUse, label, cleared, refOpen, focusedRow };
    });
    const ok = r.cards === (await page.evaluate(() => EXAMPLES.length)) && r.blank.length === 0 && r.focused === 'ex-search'
            && r.whileHits >= 1 && r.recursion >= 2 && r.recursion < r.cards && r.previewOpen && r.code && r.cmds.includes('CIRCLE')
            && r.loaded && r.closed
            && r2.exOpen && r2.n > 5 && r2.allUse && r2.label === 'REPEAT' && r2.cleared && r2.refOpen && r2.focusedRow === 'FORWARD / FD n';
    return [ok, JSON.stringify({ ...r, ...r2 })];
  }, { currentOnly: true }],
  ['page is titled Blue Logo', async (page) => {
    const [title, h1] = await page.evaluate(() => [document.title, document.querySelector('h1').textContent]);
    return [title === 'Blue Logo' && h1.includes('BLUE LOGO'), title + ' / ' + h1];
  }, { currentOnly: true }],
  ['toolbar: buttons named, fits the narrowest panel; Console header collapses and reopens', async (page) => {
    const named = await page.evaluate(() => [...document.querySelectorAll('#code-label button, #title-row button')]
      .filter(b => !(b.getAttribute('aria-label') || b.textContent.trim())).map(b => b.id));
    await page.setViewportSize({ width: 900, height: 900 });          // panel at its 360 px minimum
    await page.waitForTimeout(100);
    // Fits with room to spare (≥ 40 px), so other fonts (CI, Windows, Mac) cannot push it over.
    const spare = await page.evaluate(() => { const l = document.getElementById('code-label');
      const used = [...l.children].reduce((w, c) => w + c.getBoundingClientRect().width, 0) + parseFloat(getComputedStyle(l).columnGap) * (l.children.length - 1);
      return Math.round(l.clientWidth - used) - Math.max(0, l.scrollWidth - l.clientWidth); });
    const fits = spare >= 40;
    await page.setViewportSize({ width: 1400, height: 900 });
    const state = () => page.evaluate(() => [document.getElementById('btn-console-toggle').getAttribute('aria-expanded'),
      getComputedStyle(document.getElementById('console')).display, getComputedStyle(document.getElementById('console-label')).display]);
    await page.click('#btn-console-toggle'); const hidden = await state();
    await page.click('#btn-console-toggle'); const shown = await state();
    const ok = named.length === 0 && fits && hidden.join() === 'false,none,flex' && shown.join() === 'true,block,flex';
    return [ok, JSON.stringify({ named, spare, hidden, shown })];
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
