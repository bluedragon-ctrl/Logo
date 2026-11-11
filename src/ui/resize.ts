import { session } from '../app.ts';
import { activeRctx } from '../interpreter/context.ts';
import { DPR, canvas, setCanvasSize } from '../render/canvas.ts';
import { render } from '../render/render.ts';
import { rebuildTrailCanvas } from '../render/trail.ts';
import { OVERLAYS, closeOverlay } from './overlays.ts';
import { byId } from '../util.ts';

// ── Canvas resize (debounced) ─────────────────────────────────────────────────
// resizeCanvas is called at startup and on every window resize.
// Guard: if the panel has not been laid out yet (clientWidth/clientHeight = 0),
// skip and schedule a retry via requestAnimationFrame. This prevents the
// "drawImage on a 0×0 canvas" InvalidStateError that fires when the script
// runs before the browser has completed first layout.
export function resizeCanvas(){
  const p=byId('canvas-panel');
  const w=p.clientWidth, h=p.clientHeight;
  if(w===0 || h===0){
    // Panel not laid out yet — retry next paint
    requestAnimationFrame(resizeCanvas);
    return;
  }
  setCanvasSize(w, h, window.devicePixelRatio || 1);
  canvas.width  = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
  canvas.style.width = w + 'px';       canvas.style.height = h + 'px';
  rebuildTrailCanvas();
  // Re-centre the turtle when idle so it stays at the canvas origin after resize.
  // Guard: do NOT reset position while a program is running — that would corrupt
  // turtle coordinates mid-animation. When activeRctx is set a run is in progress.
  if(!activeRctx){ const t = session.turtle; t.x=0; t.y=0; t.angle=0; }
  render();
}
let _resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize',function(){
  clearTimeout(_resizeTimer);
  _resizeTimer=setTimeout(resizeCanvas,150);
});
window.addEventListener('keydown',function(e){
  if(e.key==='Escape') OVERLAYS.forEach(id=>closeOverlay(id));
});
