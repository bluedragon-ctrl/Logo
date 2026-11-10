import { editor } from '../editor/editor.js';
import { activeRctx } from '../interpreter/context.js';
import { extractProcedures, procs } from '../interpreter/procedures.js';
import { LINE_SEN, tokenize } from '../interpreter/tokenizer.js';
import { consoleVisible, log } from './console.js';
import { parseProgram, registerProcs, runProgram } from './program.js';

// ── Direct mode state ─────────────────────────────────────────────────────────
export let directMode = false;
const directHistory = [];
let directHistoryIdx = -1;

// ── Direct mode execution ─────────────────────────────────────────────────────
// Returns false (and leaves the input alone) when a program is already running.
export async function runDirectCommand(rawText) {
  const cmdText = rawText.trim();
  if (!cmdText) return true;
  if (activeRctx) { log('Busy — a program is running. Press STOP first.', 'err'); return false; }

  // Save to history (deduplicate consecutive identical commands)
  if (directHistory[directHistory.length - 1] !== cmdText) directHistory.push(cmdText);
  directHistoryIdx = -1;

  // Re-parse editor procedures so the latest editor content is always available
  try {
    const { newProcs: editorProcs } = extractProcedures(tokenize(editor.getValue()));
    Object.assign(procs, editorProcs);
  } catch(_) { /* ignore editor parse errors in direct mode */ }

  const parsed = parseProgram(cmdText);
  if (!parsed) return true;
  registerProcs(parsed.newProcs);
  if (!parsed.topLevel.some(t => !t.startsWith(LINE_SEN))) return true; // only definitions typed

  log('⌘ ' + cmdText, 'cmd');
  await runProgram(parsed.topLevel);
  return true;
}

// ── Direct mode UI handlers ───────────────────────────────────────────────────
document.getElementById('btn-direct-toggle').onclick = function() {
  directMode = !directMode;
  this.classList.toggle('dm-active', directMode);
  document.getElementById('direct-panel').classList.toggle('dm-open', directMode);
  // Switch console label text to "▸ TERMINAL" in direct mode
  document.getElementById('console-label').classList.toggle('dm-terminal', directMode);
  // Console-label is shown when consoleVisible OR directMode (terminal header always needed)
  document.getElementById('console-label').style.display =
    (consoleVisible || directMode) ? '' : 'none';
  // Recalculate code height when console is hidden (label may have just appeared/disappeared)
  if (!consoleVisible) {
    const wrap   = document.getElementById('split');
    const codeEl = document.getElementById('code-wrap');
    const chrH   = document.getElementById('splitter').offsetHeight
                 + document.getElementById('code-label').offsetHeight
                 + document.getElementById('console-label').offsetHeight
                 + document.getElementById('direct-panel').offsetHeight;
    codeEl.style.height = Math.max(40, wrap.clientHeight - chrH) + 'px';
  }
  if (directMode) document.getElementById('direct-input').focus();
};

document.getElementById('direct-input').addEventListener('keydown', async function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const val = this.value;
    if (activeRctx) { await runDirectCommand(val); return; } // reports "busy", keeps the text
    this.value = '';
    directHistoryIdx = -1;
    await runDirectCommand(val);
    this.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (directHistory.length === 0) return;
    if (directHistoryIdx === -1) directHistoryIdx = directHistory.length - 1;
    else if (directHistoryIdx > 0) directHistoryIdx--;
    this.value = directHistory[directHistoryIdx];
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (directHistoryIdx === -1) return;
    if (directHistoryIdx < directHistory.length - 1) {
      directHistoryIdx++;
      this.value = directHistory[directHistoryIdx];
    } else {
      directHistoryIdx = -1;
      this.value = '';
    }
  }
});

document.getElementById('btn-direct-run').onclick = async function() {
  const inp = document.getElementById('direct-input');
  const val = inp.value;
  if (activeRctx) { await runDirectCommand(val); return; } // reports "busy", keeps the text
  inp.value = '';
  await runDirectCommand(val);
  inp.focus();
};
