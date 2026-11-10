import { editor } from '../editor/editor.js';
import { beautify } from '../format/beautify.js';

// ── Copy code button ──────────────────────────────────────────────────────────
document.getElementById('btn-copy-code').onclick = function(){
  const code = editor.getValue();
  const btn = document.getElementById('btn-copy-code');
  function flashCopied(){ btn.textContent='✓'; btn.classList.add('copied'); setTimeout(()=>{ btn.textContent='⎘'; btn.classList.remove('copied'); },1200); }
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
document.getElementById('btn-fmt-code').onclick = function(){
  const prev = editor.getValue();
  const fmted = beautify(prev);
  if(fmted !== prev) editor.setValue(fmted);
  const btn = document.getElementById('btn-fmt-code');
  btn.classList.add('fmted');
  setTimeout(() => btn.classList.remove('fmted'), 1200);
};
