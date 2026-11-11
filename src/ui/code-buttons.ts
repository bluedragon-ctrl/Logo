import { editor } from '../editor/editor.ts';
import { beautify } from '../format/beautify.ts';
import { byId } from '../util.ts';

// A tick replaces the button's icon for a moment (CSS: .tb-btn.done).
function flashDone(btn: HTMLElement): void {
  btn.classList.add('done');
  setTimeout(() => btn.classList.remove('done'), 1200);
}

// ── Copy code button ──────────────────────────────────────────────────────────
byId('btn-copy-code').onclick = function(){
  const code = editor.getValue();
  const btn = byId('btn-copy-code');
  function flashCopied(){ flashDone(btn); }
  navigator.clipboard.writeText(code).then(flashCopied).catch(() => {
    // Fallback for browsers where clipboard API is unavailable (e.g. non-https)
    const ta = document.createElement('textarea');
    ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    flashCopied();
  });
};

// ── Beautify button ───────────────────────────────────────────────────────────
byId('btn-fmt-code').onclick = function(){
  const prev = editor.getValue();
  const fmted = beautify(prev);
  if(fmted !== prev) editor.setValue(fmted);
  flashDone(byId('btn-fmt-code'));
};
