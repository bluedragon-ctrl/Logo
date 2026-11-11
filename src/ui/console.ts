import type { LogClass } from '../interpreter/types.ts';
import { byId } from '../util.ts';
export const con = byId('console');

// ── Console / log ─────────────────────────────────────────────────────────────
// log(msg, cls): append one div to #console with class cls.
//   'op'    motion commands (FD, RT…)  — filtered by #log-op checkbox
//   'info'  variable / proc events     — filtered by #log-info checkbox
//   'ok'    Done / Stop messages       — filtered by #log-ok checkbox
//   'err'   runtime errors             — always shown (no filter)
//   'print' PRINT command output       — always shown; auto-expands console panel
//
// All filter checkboxes and hot-path UI elements are cached at module startup.
// log() and move()/rotate() are called thousands of times per program run;
// getElementById() on every call would be measurably slow.
//
// Cap: when childElementCount reaches MAX_LOG_LINES the oldest child is removed
// before appending, keeping memory bounded.
const logFilters={
  op:   byId<HTMLInputElement>('log-op'),
  info: byId<HTMLInputElement>('log-info'),
  ok:   byId<HTMLInputElement>('log-ok'),
};
export const optSpeed    = byId<HTMLInputElement>('opt-speed');     // 0=slowest animated … 4=instant
export let consoleVisible = true;          // true = console section is shown
export function setConsoleVisible(v: boolean): void { consoleVisible = v; }
let showConsole: () => void = () => {};      // populated by the splitter (ui/splitter.ts)
export function setShowConsole(fn: () => void): void { showConsole = fn; }
const MAX_LOG_LINES = 500;
// logs(cls): would log(…, cls) show the line? (false for a class whose filter is off)
export function logs(cls: LogClass): boolean {
  const chk = logFilters[cls as keyof typeof logFilters];
  return !chk || chk.checked; // print / cmd / err have no filter
}
export function log(msg: string, cls: LogClass = 'info'): void {
  if(!logs(cls)) return; // suppressed by filter — do not append
  // PRINT forces the console panel open so its output is always visible, even
  // if the user collapsed the console.
  if(cls === 'print' && !consoleVisible) showConsole();
  // Evict oldest entry before appending when at cap (keeps DOM size bounded)
  while(con.childElementCount >= MAX_LOG_LINES) con.firstChild?.remove();
  const d=document.createElement('div');d.className=cls;d.textContent=msg;
  con.appendChild(d);con.scrollTop=con.scrollHeight;
}
