import type { LogClass, LogoIO } from './types.ts';

// ── LogoIO: the interpreter's only way out ────────────────────────────────────
// The interpreter and turtle code never touch the DOM. Everything visible goes
// through rctx.io, an object with these methods:
//
//   log(msg, cls)                      console line; cls = op | info | ok | err | print | cmd
//   logs(cls) → bool                   would a line of class cls be shown? (filters)
//   render()                           repaint the visible canvas (turtle moved / pen changed)
//   paintLine(x1,y1,x2,y2,w, r,g,b)    draw one segment (or DOT when both ends coincide)
//                                      onto the trail layer; storage is the session's job
//   paintLabel(lab)                    draw one label {x, y, text, r, g, b}
//   paintFill(fill)                    draw one fill polygon on top of the trail layer
//   redraw()                           repaint the whole trail layer from session.drawing (after CS)
//   clearText()                        CT — empty the console
//   canvasSize() → {w, h}              logical canvas size (Logo world units)
//   setSpeed(n)                        SPEED n — keep the UI's speed control in step
//   nextFrame() → Promise              wait for the next animation frame
//   macroYield() → Promise             give the host one macrotask (paint, clicks)
//   keyWaiting() → bool                KEYP — has a key been pressed and not read yet?
//   readKey() → code | null            READKEY — take the oldest key press (see KEY CODES)
//   mouse() → {x, y, down}             MOUSEX / MOUSEY / BUTTONP, in Logo coordinates
//
// KEY CODES (one number per key, the classic browser key codes): letters 65–90
// (A–Z, whatever the case), digits 48–57, space 32, Enter 13, Escape 27,
// Backspace 8, arrows left 37, up 38, right 39, down 40. Other keys are ignored.
//
// The page's implementation is in src/app.js. headlessIO() below is the one used
// by unit tests (and any future non-browser use, e.g. "check my answer").

const later = (): Promise<void> => new Promise(res => setTimeout(res, 0));

// headlessIO({ width, height, keys, mouse }): no drawing, console lines collected in .lines.
//   .lines   [{ msg, cls }]
//   .text()  all messages joined with '\n' (like the console's text)
//   .keys    the key presses READKEY will read (a test may push more while running)
//   .pointer the mouse state MOUSEX / MOUSEY / BUTTONP report
export interface HeadlessIO extends LogoIO {
  lines: { msg: string; cls: LogClass }[];
  text(): string;
  keys: number[];
  pointer: { x: number; y: number; down: boolean };
}
export interface HeadlessOptions { width?: number; height?: number; keys?: number[]; mouse?: { x: number; y: number; down: boolean } }
export function headlessIO({ width = 800, height = 600, keys = [], mouse = { x: 0, y: 0, down: false } }: HeadlessOptions = {}): HeadlessIO {
  const lines: HeadlessIO['lines'] = [];
  const io: HeadlessIO = {
    lines,
    keys: [...keys],
    pointer: { ...mouse },
    text: () => lines.map(l => l.msg).join('\n'),
    log(msg, cls){ lines.push({ msg, cls: cls || 'info' }); },
    logs: () => true,
    render(){},
    paintLine(){},
    paintLabel(){},
    paintFill(){},
    redraw(){},
    clearText(){ lines.length = 0; },
    canvasSize: () => ({ w: width, h: height }),
    setSpeed(){},
    nextFrame: later,
    macroYield: later,
    keyWaiting: () => io.keys.length > 0,
    readKey:    () => io.keys.shift() ?? null,
    mouse:      () => ({ ...io.pointer }),
  };
  return io;
}
