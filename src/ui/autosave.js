import { editor } from '../editor/editor.js';
import { log } from './console.js';

// ── Autosave ──────────────────────────────────────────────────────────────────
// The editor text is kept in localStorage so a refresh or a closed tab does not
// lose a pupil's work. Saved AUTOSAVE_DELAY_MS after the last change, and at once
// when the page is hidden or closed. Restored on start-up (without an undo step).
// localStorage can be unavailable (privacy mode, sandboxed iframes, quota):
// every access is guarded and autosave then silently does nothing.
const AUTOSAVE_KEY = 'claude-logo:program';
const AUTOSAVE_DELAY_MS = 500;
const autosave = (function(){
  let timer = null;
  function save(){
    clearTimeout(timer); timer = null;
    try { localStorage.setItem(AUTOSAVE_KEY, editor.getValue()); } catch(e) { /* unavailable */ }
  }
  function load(){
    try { return localStorage.getItem(AUTOSAVE_KEY); } catch(e) { return null; }
  }
  editor.onChange(() => { clearTimeout(timer); timer = setTimeout(save, AUTOSAVE_DELAY_MS); });
  const flush = () => { if(timer) save(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flush(); });
  return { save, load, flush };
})();
(function restoreProgram(){
  const src = autosave.load();
  if(src){ editor.initValue(src); log('Restored your program from last time.', 'ok'); }
})();
