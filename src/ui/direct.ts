import { io, session } from '../app.ts';
import { editor } from '../editor/editor.ts';
import { activeRctx } from '../interpreter/context.ts';
import { parseProgram, registerProcs } from '../interpreter/execute.ts';
import { extractProcedures } from '../interpreter/procedures.ts';
import { LINE_SEN, tokenize } from '../interpreter/tokenizer.ts';
import { consoleVisible, log } from './console.ts';
import { runProgram } from './program.ts';
import { byId } from '../util.ts';

// ── Direct mode state ─────────────────────────────────────────────────────────
export let directMode = false;
const directHistory: string[] = [];
let directHistoryIdx = -1;

// ── Direct mode execution ─────────────────────────────────────────────────────
// Returns false (and leaves the input alone) when a program is already running.
export async function runDirectCommand(rawText: string): Promise<boolean> {
  const cmdText = rawText.trim();
  if (!cmdText) return true;
  if (activeRctx) { log('Busy — a program is running. Press STOP first.', 'err'); return false; }

  // Save to history (deduplicate consecutive identical commands)
  if (directHistory[directHistory.length - 1] !== cmdText) directHistory.push(cmdText);
  directHistoryIdx = -1;

  // Re-parse editor procedures so the latest editor content is always available
  try {
    const { newProcs: editorProcs } = extractProcedures(tokenize(editor.getValue()));
    Object.assign(session.procs, editorProcs);
  } catch(_) { /* ignore editor parse errors in direct mode */ }

  const parsed = parseProgram(cmdText, io);
  if (!parsed) return true;
  registerProcs(session, parsed.newProcs, io);
  if (!parsed.topLevel.some(t => !t.startsWith(LINE_SEN))) return true; // only definitions typed

  log('⌘ ' + cmdText, 'cmd');
  await runProgram(parsed.topLevel);
  return true;
}

// ── Direct mode UI handlers ───────────────────────────────────────────────────
const btnDirect = byId('btn-direct-toggle');
btnDirect.onclick = function() {
  directMode = !directMode;
  btnDirect.classList.toggle('dm-active', directMode);
  byId('direct-panel').classList.toggle('dm-open', directMode);
  // Switch console label text to "▸ TERMINAL" in direct mode
  byId('console-label').classList.toggle('dm-terminal', directMode);
  // Console-label is shown when consoleVisible OR directMode (terminal header always needed)
  byId('console-label').style.display =
    (consoleVisible || directMode) ? '' : 'none';
  // Recalculate code height when console is hidden (label may have just appeared/disappeared)
  if (!consoleVisible) {
    const wrap   = byId('split');
    const codeEl = byId('code-wrap');
    const chrH   = byId('splitter').offsetHeight
                 + byId('code-label').offsetHeight
                 + byId('console-label').offsetHeight
                 + byId('direct-panel').offsetHeight;
    codeEl.style.height = Math.max(40, wrap.clientHeight - chrH) + 'px';
  }
  if (directMode) byId<HTMLInputElement>('direct-input').focus();
};

byId<HTMLInputElement>('direct-input').addEventListener('keydown', async function(e) {
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

byId('btn-direct-run').onclick = async function() {
  const inp = byId<HTMLInputElement>('direct-input');
  const val = inp.value;
  if (activeRctx) { await runDirectCommand(val); return; } // reports "busy", keeps the text
  inp.value = '';
  await runDirectCommand(val);
  inp.focus();
};
