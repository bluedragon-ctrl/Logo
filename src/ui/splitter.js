import { consoleVisible, setConsoleVisible, setShowConsole } from './console.js';
import { directMode } from './direct.js';

// ── Splitter ──────────────────────────────────────────────────────────────────
(function(){
  const splitter  = document.getElementById('splitter');
  const codeEl    = document.getElementById('code-wrap');
  const conEl     = document.getElementById('console');
  const wrap      = document.getElementById('split');
  const codeLabel = document.getElementById('code-label');
  const conLabel   = document.getElementById('console-label');
  const btnConsole = document.getElementById('btn-console-toggle');

  // Fixed chrome height inside #split (everything except the two resizable panes).
  // Includes direct-panel height when it is visible (offsetHeight=0 when display:none).
  function chromeH(){
    const dp = document.getElementById('direct-panel');
    return splitter.offsetHeight + codeLabel.offsetHeight + conLabel.offsetHeight + dp.offsetHeight;
  }

  // Max height code-wrap can reach (leaves 40px for console when visible).
  function maxCodeH(){
    return wrap.clientHeight - chromeH() - (consoleVisible ? 40 : 0);
  }

  function initHeights(){
    const avail = wrap.clientHeight - chromeH();
    if(avail <= 0) return;
    codeEl.style.height = Math.floor(avail * 0.75) + 'px';
    // console fills remainder via flex:1 — no height needed
  }
  requestAnimationFrame(initHeights);
  window.addEventListener('resize', initHeights);

  // ── drag ──
  let startY = 0, startCodeH = 0;

  function applyDrag(clientY){
    const dy       = clientY - startY;
    const newH     = Math.max(40, Math.min(maxCodeH(), startCodeH + dy));
    codeEl.style.height = newH + 'px';
    // console adjusts automatically via flex:1
  }

  function onMouseMove(e){ applyDragGuarded(e.clientY); }
  function onMouseUp(){
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   onMouseUp);
    document.body.style.cursor = '';
  }
  splitter.addEventListener('mousedown', function(e){
    e.preventDefault();
    startY     = e.clientY;
    startCodeH = codeEl.offsetHeight;
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  });

  function onTouchMove(e){ applyDragGuarded(e.touches[0].clientY); }
  function onTouchEnd(){
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend',  onTouchEnd);
  }
  splitter.addEventListener('touchstart', function(e){
    startY     = e.touches[0].clientY;
    startCodeH = codeEl.offsetHeight;
    window.addEventListener('touchmove', onTouchMove, {passive:true});
    window.addEventListener('touchend',  onTouchEnd);
  }, {passive:true});

  // ── LOG button toggle ──
  // Hides/shows console-label + #console completely (display:none).
  // If the user drags the splitter while hidden, auto-show — dragging always
  // implies intent to see the console.
  let savedCodeH = 0;

  function showConsole(){
    setConsoleVisible(true);
    conLabel.style.display = '';
    conEl.style.display    = '';
    codeEl.style.height    = (savedCodeH || Math.floor((wrap.clientHeight - chromeH()) * 0.5)) + 'px';
    btnConsole.classList.add('active');
  }
  setShowConsole(showConsole);

  function hideConsole(){
    savedCodeH = codeEl.offsetHeight;
    setConsoleVisible(false);
    if(!directMode) conLabel.style.display = 'none';
    conEl.style.display = 'none';
    codeEl.style.height = Math.max(40, wrap.clientHeight - chromeH()) + 'px';
    btnConsole.classList.remove('active');
  }

  btnConsole.addEventListener('click', function(){
    if(consoleVisible) hideConsole(); else showConsole();
  });

  // Auto-show when splitter is dragged while console is hidden
  function applyDragGuarded(clientY){
    if(!consoleVisible){
      showConsole();
      // Re-anchor drag to current position so it doesn't jump
      startY     = clientY;
      startCodeH = codeEl.offsetHeight;
    }
    applyDrag(clientY);
  }
})();
