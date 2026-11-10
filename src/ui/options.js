import { setCanvasStyle, setTurtleStyle } from '../render/background.js';
import { canvas } from '../render/canvas.js';
import { render } from '../render/render.js';
import { closeOverlay, openOverlay } from './overlays.js';
import { resizeCanvas } from './resize.js';

// ── Options ───────────────────────────────────────────────────────────────────
(function(){
  const btn    = document.getElementById('opt-btn');
  const closeBtn=document.getElementById('btn-opt-close');

  btn.onclick   = ()=>openOverlay('opt-overlay');
  closeBtn.onclick = ()=>closeOverlay('opt-overlay');

  // Save PNG button — composites current canvas state and triggers browser download
  document.getElementById('save-btn').onclick = () => {
    const a=document.createElement('a');
    a.download='logo-drawing.png';
    a.href=canvas.toDataURL('image/png');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Font size pills
  document.querySelectorAll('.opt-pill[data-fs]').forEach(function(pill){
    pill.onclick = function(){
      document.querySelectorAll('.opt-pill[data-fs]').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      document.documentElement.style.setProperty('--fs-base', pill.dataset.fs);
      // Clear any splitter-set inline width so the CSS calc() re-applies immediately
      const _p = document.getElementById('panel');
      if(_p){ _p.style.width = ''; _p.style.minWidth = ''; }
      // Changing font size resizes the canvas panel — trigger a canvas relayout.
      // setTimeout(0) defers until after the CSS has been applied and laid out.
      setTimeout(resizeCanvas, 0);
    };
  });

  document.querySelectorAll('.opt-pill[data-canvas]').forEach(function(pill){
    pill.onclick = function(){
      document.querySelectorAll('.opt-pill[data-canvas]').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      setCanvasStyle(pill.dataset.canvas);
      render();
    };
  });

  document.querySelectorAll('.opt-pill[data-turtle]').forEach(function(pill){
    pill.onclick = function(){
      document.querySelectorAll('.opt-pill[data-turtle]').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      setTurtleStyle(pill.dataset.turtle);
      render();
    };
  });
})();
