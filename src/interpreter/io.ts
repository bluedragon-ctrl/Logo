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
//   redraw()                           repaint the whole trail layer from session.drawing (after CS)
//   clearText()                        CT — empty the console
//   canvasSize() → {w, h}              logical canvas size (Logo world units)
//   setSpeed(n)                        SPEED n — keep the UI's speed control in step
//   nextFrame() → Promise              wait for the next animation frame
//   macroYield() → Promise             give the host one macrotask (paint, clicks)
//
// The page's implementation is in src/app.js. headlessIO() below is the one used
// by unit tests (and any future non-browser use, e.g. "check my answer").

const later = (): Promise<void> => new Promise(res => setTimeout(res, 0));

// headlessIO({ width, height }): no drawing, console lines collected in .lines.
//   .lines   [{ msg, cls }]
//   .text()  all messages joined with '\n' (like the console's text)
export interface HeadlessIO extends LogoIO {
  lines: { msg: string; cls: LogClass }[];
  text(): string;
}
export function headlessIO({ width = 800, height = 600 } = {}): HeadlessIO {
  const lines: HeadlessIO['lines'] = [];
  return {
    lines,
    text: () => lines.map(l => l.msg).join('\n'),
    log(msg, cls){ lines.push({ msg, cls: cls || 'info' }); },
    logs: () => true,
    render(){},
    paintLine(){},
    paintLabel(){},
    redraw(){},
    clearText(){ lines.length = 0; },
    canvasSize: () => ({ w: width, h: height }),
    setSpeed(){},
    nextFrame: later,
    macroYield: later,
  };
}
