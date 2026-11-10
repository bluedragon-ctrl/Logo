export const con = document.getElementById('console');

// ── Console / log ─────────────────────────────────────────────────────────────
// log(msg, cls): append one div to #console with class cls.
//   'op'    motion commands (FD, RT…)  — filtered by #log-op checkbox
//   'info'  variable / proc events     — filtered by #log-info checkbox
//   'ok'    Done / Stop messages       — filtered by #log-ok checkbox
//   'err'   runtime errors             — always shown regardless of filters
//   'print' PRINT command output       — always shown; auto-expands console panel
//
// All filter checkboxes and hot-path UI elements are cached at module startup.
// log() and move()/rotate() are called thousands of times per program run;
// getElementById() on every call would be measurably slow.
//
// Cap: when childElementCount reaches MAX_LOG_LINES the oldest child is removed
// before appending, keeping memory bounded.
const logFilters={
  op:   document.getElementById('log-op'),
  info: document.getElementById('log-info'),
  ok:   document.getElementById('log-ok'),
  err:  document.getElementById('log-err'),
};
export const optSpeed    = document.getElementById('opt-speed');     // 0=slowest animated … 4=instant
export let consoleVisible = true;          // true = console section is shown
export function setConsoleVisible(v){ consoleVisible = v; }
let showConsole    = () => {};      // populated by the splitter (ui/splitter.js)
export function setShowConsole(fn){ showConsole = fn; }
const MAX_LOG_LINES = 500;
export function log(msg,cls){
  cls=cls||'info';
  // 'print' bypasses filter checkboxes and forces the console panel open so
  // PRINT output is always visible even if the user collapsed the console.
  if(cls==='print'){
    if(!consoleVisible) showConsole();
  } else if(cls!=='cmd' && cls!=='err'){
    const chk=logFilters[cls];
    if(chk&&!chk.checked) return; // suppressed by filter — do not append
  }
  // Evict oldest entry before appending when at cap (keeps DOM size bounded)
  while(con.childElementCount >= MAX_LOG_LINES) con.removeChild(con.firstChild);
  const d=document.createElement('div');d.className=cls;d.textContent=msg;
  con.appendChild(d);con.scrollTop=con.scrollHeight;
}
