import { setCanvasStyle, setTurtleStyle, type CanvasStyle, type TurtleStyle } from '../render/background.ts';
import { canvas } from '../render/canvas.ts';
import { render } from '../render/render.ts';
import { closeOverlay, openOverlay } from './overlays.ts';
import { resizeCanvas } from './resize.ts';
import { byId } from '../util.ts';

// ── Options ───────────────────────────────────────────────────────────────────
(function(){
  const btn    = byId('opt-btn');
  const closeBtn=byId('btn-opt-close');

  btn.onclick   = ()=>openOverlay('opt-overlay');
  closeBtn.onclick = ()=>closeOverlay('opt-overlay');

  // Save PNG button — composites current canvas state and triggers browser download
  byId('save-btn').onclick = () => {
    const a=document.createElement('a');
    a.download='logo-drawing.png';
    a.href=canvas.toDataURL('image/png');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Font size pills
  document.querySelectorAll<HTMLElement>('.opt-pill[data-fs]').forEach(function(pill){
    pill.onclick = function(){
      document.querySelectorAll('.opt-pill[data-fs]').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      document.documentElement.style.setProperty('--fs-base', pill.dataset.fs ?? '1');
      // Clear any splitter-set inline width so the CSS calc() re-applies immediately
      const _p = byId('panel');
      if(_p){ _p.style.width = ''; _p.style.minWidth = ''; }
      // Changing font size resizes the canvas panel — trigger a canvas relayout.
      // setTimeout(0) defers until after the CSS has been applied and laid out.
      setTimeout(resizeCanvas, 0);
    };
  });

  document.querySelectorAll<HTMLElement>('.opt-pill[data-canvas]').forEach(function(pill){
    pill.onclick = function(){
      document.querySelectorAll('.opt-pill[data-canvas]').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      setCanvasStyle(pill.dataset.canvas as CanvasStyle);
      render();
    };
  });

  document.querySelectorAll<HTMLElement>('.opt-pill[data-turtle]').forEach(function(pill){
    pill.onclick = function(){
      document.querySelectorAll('.opt-pill[data-turtle]').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      setTurtleStyle(pill.dataset.turtle as TurtleStyle);
      render();
    };
  });
})();
