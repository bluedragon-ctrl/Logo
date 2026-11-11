import { activeRctx } from '../interpreter/context.ts';
import { CH, CW, canvas } from '../render/canvas.ts';

// ── Keyboard and mouse for programs (KEYP / READKEY, MOUSEX / MOUSEY / BUTTONP) ─
// While a program runs, key presses that are not meant for a text field (the
// editor, direct mode, the Commands search) are queued for READKEY. Arrow keys and
// space are then kept from scrolling the page. Clicking the canvas takes the focus
// away from the editor, so a game can be played right after clicking it.
// Key codes: see interpreter/io.ts (KEY CODES).

const MAX_KEYS = 32;          // a held-down key repeats; older presses are kept, newer dropped
const keys: number[] = [];
const pointer = { x: 0, y: 0, down: false };

const NAMED: Record<string, number> = {
  ' ': 32, Enter: 13, Escape: 27, Backspace: 8,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
};
// keyCode(e): the Logo key code of a key press, or null for keys Logo ignores.
function keyCode(e: KeyboardEvent): number | null {
  if(e.ctrlKey || e.metaKey || e.altKey) return null;        // shortcuts stay with the browser
  if(e.key in NAMED) return NAMED[e.key];
  if(/^[a-z0-9]$/i.test(e.key)) return e.key.toUpperCase().charCodeAt(0);
  return null;
}
// typingTarget(t): is the key press meant for a text field?
function typingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || !!t.closest('input, textarea, select, .cm-editor'));
}

document.addEventListener('keydown', e => {
  if(!activeRctx || typingTarget(e.target)) return;
  const code = keyCode(e);
  if(code === null) return;
  if(code !== 27) e.preventDefault();                        // Escape still closes overlays
  if(keys.length < MAX_KEYS) keys.push(code);
});

// Mouse position in Logo coordinates (origin at the centre, y up). The canvas may
// be drawn at another CSS size than CW × CH, so scale by its on-screen box.
function track(e: PointerEvent): void {
  const r = canvas.getBoundingClientRect();
  if(r.width === 0 || r.height === 0) return;
  pointer.x = Math.round((e.clientX - r.left) * CW / r.width - CW / 2);
  pointer.y = Math.round(CH / 2 - (e.clientY - r.top) * CH / r.height);
  pointer.down = (e.buttons & 1) === 1;
}
canvas.tabIndex = -1;                                        // focusable by click, not by Tab
canvas.addEventListener('pointermove', track);
canvas.addEventListener('pointerdown', e => { track(e); canvas.focus(); });
canvas.addEventListener('pointerup', track);
canvas.addEventListener('pointerleave', () => { pointer.down = false; });

// The LogoIO methods (src/app.ts).
export const keyWaiting = (): boolean => keys.length > 0;
export const readKey = (): number | null => keys.shift() ?? null;
export const mouse = (): { x: number; y: number; down: boolean } => ({ ...pointer });
// clearKeys(): forget key presses from before a run (runProgram).
export function clearKeys(): void { keys.length = 0; }
