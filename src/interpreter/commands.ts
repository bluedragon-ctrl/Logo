import { BINARY2, QUERY_TOKENS, UNARY, evalExpr } from './expr.ts';
import { sleep, tick } from './pacing.ts';
import { formatNum, hasOwn, isVarTok, procScopeOf, setVar, varName } from './scope.ts';
import { newLine } from './tokenizer.ts';
import { clearScreen } from './session.ts';
import { addLabel, trailPushIfRoom } from '../turtle/drawing.ts';
import { arc, circle, clipForRun, move, ouch, rotate } from '../turtle/motion.ts';
import type { CommandHandler, RunContext, Scope, Token } from './types.ts';

// ── Command dispatch table ────────────────────────────────────────────────────
// CMD maps uppercase command name → async handler.
// Handler signature: async (tokens, idx, vars, rctx) → nextIdx
//   tokens  token array of the current exec frame
//   idx     index of the first argument token (command itself already consumed)
//   vars    current variable scope object
//   return  index of the next token after all arguments consumed
//
// Leaf commands only. Flow-control keywords (CONTROL_WORDS) are dispatched inline
// in runStack() — they need direct access to the frame stack.
// State: rctx.session.turtle / .drawing. Output: rctx.io (log, render, …) — never the DOM.
export const CMD: Record<string, CommandHandler> = {};

// ▸ Variables
CMD['MAKE'] = async (t,i,v,rctx) => {
  const rawName = t[i++]?.text;
  if(!isVarTok(rawName))
    throw new Error('MAKE: expected a variable name like :x or "x, got: ' + (rawName || 'nothing'));
  const name = varName(rawName);
  const {value, nextIdx} = await evalExpr(t, i, v, rctx);
  setVar(v, name, value, rctx);
  if(rctx.io.logs('info')) rctx.io.log('MAKE :' + name + ' = ' + formatNum(value), 'info');
  return nextIdx;
};
// LOCAL :a :b …  — declare variables local to the current procedure (no value yet).
CMD['LOCAL'] = async (t,i,v,rctx) => {
  if(!isVarTok(t[i]?.text)) throw new Error('LOCAL: expected a variable name like :x, got: ' + (t[i]?.text || 'nothing'));
  const scope = procScopeOf(v, rctx);
  for(let w = t[i]?.text; isVarTok(w); w = t[++i]?.text) { const name = varName(w); if(!hasOwn(scope, name)) scope[name] = undefined; }
  return i;
};
// LOCALMAKE :x value  — LOCAL + MAKE in one step.
CMD['LOCALMAKE'] = async (t,i,v,rctx) => {
  const rawName = t[i++]?.text;
  if(!isVarTok(rawName)) throw new Error('LOCALMAKE: expected a variable name like :x, got: ' + (rawName || 'nothing'));
  const name = varName(rawName);
  const {value, nextIdx} = await evalExpr(t, i, v, rctx);
  procScopeOf(v, rctx)[name] = value;
  if(rctx.io.logs('info')) rctx.io.log('LOCALMAKE :' + name + ' = ' + formatNum(value), 'info');
  return nextIdx;
};

// wordArg: if the next token is a "quoted word, return it (source case kept).
function wordArg(t: Token[], i: number): { text: string; nextIdx: number } | null {
  const tok = t[i]?.text;
  if(tok && tok.startsWith('"')) {
    const text = tok.slice(1);
    if(!text) throw new Error('Empty word: put text right after the " (e.g. "HELLO)');
    return { text, nextIdx: i + 1 };
  }
  return null;
}
// PRINT value | "word — always visible regardless of filter settings; auto-expands console.
CMD['PRINT'] = CMD['PR'] = async (t,i,v,rctx) => {
  const w = wordArg(t, i);
  if(w) { rctx.io.log('PRINT → ' + w.text, 'print'); return w.nextIdx; }
  const {value, nextIdx} = await evalExpr(t, i, v, rctx);
  rctx.io.log('PRINT → ' + formatNum(value), 'print');
  return nextIdx;
};

// isValueStart(tok, rctx): can tok begin an expression? (DOT / LABEL / SETCOLOR argument
// detection.) A user procedure counts: it may OUTPUT a value (LABEL DOUBLE 3).
function isValueStart(tok: string | undefined, rctx: RunContext): boolean {
  if(!tok) return false;
  return isVarTok(tok) || hasOwn(rctx.procs, tok) || /^[\d.]/.test(tok) || tok === '~' || tok === '-' || tok === '(' ||
         QUERY_TOKENS.has(tok) || tok === 'REPCOUNT' || tok === 'REPCOUNTMAX' ||
         UNARY.has(tok) || BINARY2.has(tok) || tok === 'NOT' || tok === 'IFELSE';
}

// LABEL "text | value | bareword — draw text at the turtle position.
// "Hello keeps its case. A value (LABEL :X, LABEL XCOR) draws the number.
// Text is stored in session.drawing.labels so it survives canvas resize.
CMD['LABEL'] = async (t,i,v,rctx) => {
  let text;
  const w = wordArg(t, i);
  if(w) { text = w.text; i = w.nextIdx; }
  else {
    const tok = t[i]?.text;
    if(!tok || tok === ']') throw new Error('LABEL: text argument missing');
    if(isValueStart(tok, rctx)) { const r = await evalExpr(t, i, v, rctx); text = formatNum(r.value); i = r.nextIdx; }
    else { text = tok; i++; } // bare word (uppercase), e.g. LABEL HELLO
  }
  const tt = rctx.session.turtle;
  if(!addLabel(rctx, {x:tt.x, y:tt.y, text, r:tt.color[0], g:tt.color[1], b:tt.color[2]})) return i;
  await tick(rctx);
  return i;
};

// ▸ Motion — all delegate to move()/rotate() which own animation and instant-mode logic
CMD['FD'] = CMD['FORWARD'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); if(rctx.io.logs('op')) rctx.io.log('FD '+formatNum(n),'op'); await move(n,rctx);   return nextIdx;
};
CMD['BK'] = CMD['BACK'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); if(rctx.io.logs('op')) rctx.io.log('BK '+formatNum(n),'op'); await move(-n,rctx);  return nextIdx;
};
CMD['RT'] = CMD['RIGHT'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); if(rctx.io.logs('op')) rctx.io.log('RT '+formatNum(n),'op'); await rotate(n,rctx);  return nextIdx;
};
CMD['LT'] = CMD['LEFT'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); if(rctx.io.logs('op')) rctx.io.log('LT '+formatNum(n),'op'); await rotate(-n,rctx); return nextIdx;
};
CMD['SETH'] = CMD['SETHEADING'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx);
  // Find the shortest-arc delta to target so the turtle turns at most 180°.
  const cur = ((rctx.session.turtle.angle%360)+360)%360, target = ((n%360)+360)%360;
  let delta = target - cur;
  if(delta >  180) delta -= 360; // e.g. cur=350 target=10 → delta=-340 → +20
  if(delta < -180) delta += 360;
  rctx.io.log('SETH ' + formatNum(target), 'op');
  await rotate(delta, rctx);
  if(!rctx.stopped) rctx.session.turtle.angle = target; // snap to exact value after animation to eliminate float drift
  return nextIdx;
};
// HOME: teleport to origin (0,0), heading 0°. Instant — no animation, no trail segment.
// Pen/color/width state is unchanged; use CS to clear the trail.
CMD['HOME'] = async (_t,i,_v,rctx) => {
  rctx.session.turtle.x=0; rctx.session.turtle.y=0; rctx.session.turtle.angle=0; rctx.io.render(); rctx.io.log('HOME','info'); return i;
};
// goTo(nx, ny, what, rctx): straight line (pen down) to (nx, ny) without changing
// heading — SETPOS / SETXY / SETX / SETY. Leaving the canvas behaves like FD: the
// line stops at the edge and the run ends (OUCH!).
async function goTo(nx: number, ny: number, what: string, rctx: RunContext): Promise<void> {
  const tt = rctx.session.turtle;
  const hit = clipForRun(rctx, tt.x, tt.y, nx, ny);
  const [ex, ey] = hit || [nx, ny];
  if(tt.pen && (ex !== tt.x || ey !== tt.y))
    trailPushIfRoom(rctx, tt.x,tt.y,ex,ey,tt.width, tt.color[0],tt.color[1],tt.color[2]);
  tt.x=ex; tt.y=ey;
  if(rctx.io.logs('op')) rctx.io.log(what, 'op');
  if(hit) ouch(rctx);
  await tick(rctx);
}
// SETPOS x y / SETXY x y: go to (x, y).
CMD['SETPOS'] = CMD['SETXY'] = async (t,i,v,rctx) => {
  const {value:nx, nextIdx:i1} = await evalExpr(t,i,v,rctx);
  const {value:ny, nextIdx:i2} = await evalExpr(t,i1,v,rctx);
  await goTo(nx, ny, 'SETPOS '+formatNum(nx)+' '+formatNum(ny), rctx);
  return i2;
};
// SETX x / SETY y: change one coordinate, keep the other.
CMD['SETX'] = async (t,i,v,rctx) => {
  const {value:nx, nextIdx} = await evalExpr(t,i,v,rctx);
  await goTo(nx, rctx.session.turtle.y, 'SETX '+formatNum(nx), rctx);
  return nextIdx;
};
CMD['SETY'] = async (t,i,v,rctx) => {
  const {value:ny, nextIdx} = await evalExpr(t,i,v,rctx);
  await goTo(rctx.session.turtle.x, ny, 'SETY '+formatNum(ny), rctx);
  return nextIdx;
};
// DOT [x y] — filled dot at (x,y), or at the turtle position when the next token on
// the same line is not a value. Diameter = pen width, color = pen color. Always draws
// regardless of pen state. Does not move the rctx.session.turtle. Stored as a zero-length trail
// segment (x1===x2, y1===y2), which paintLine/rebuildTrailCanvas draw as a filled circle.
CMD['DOT'] = async (t,i,v,rctx) => {
  let px, py;
  if(!newLine(t, i) && isValueStart(t[i]?.text, rctx)) {  // only inputs on DOT's own line: DOT alone on a line takes none
    const r1 = await evalExpr(t, i, v, rctx); px = r1.value; i = r1.nextIdx;
    const r2 = await evalExpr(t, i, v, rctx); py = r2.value; i = r2.nextIdx;
  } else {
    px = rctx.session.turtle.x; py = rctx.session.turtle.y;
  }
  const tt = rctx.session.turtle;
  trailPushIfRoom(rctx, px, py, px, py, tt.width, tt.color[0], tt.color[1], tt.color[2]);
  if(rctx.io.logs('info')) rctx.io.log('DOT '+formatNum(px)+' '+formatNum(py), 'info');
  await tick(rctx);
  return i;
};
// XCOR / YCOR / HEADING as standalone statements: log current value, no-op otherwise.
CMD['XCOR']    = async (_t,i,_v,rctx) => { rctx.io.log('XCOR = '   +formatNum(rctx.session.turtle.x),'info');                        return i; };
CMD['YCOR']    = async (_t,i,_v,rctx) => { rctx.io.log('YCOR = '   +formatNum(rctx.session.turtle.y),'info');                        return i; };
CMD['HEADING'] = async (_t,i,_v,rctx) => { rctx.io.log('HEADING = '+formatNum(((rctx.session.turtle.angle%360)+360)%360),'info');    return i; };

// ▸ Pen / visibility — data-table factory: [abbr, full, property, value, log-message]
const PEN_COMMANDS: [string, string, 'pen' | 'visible', boolean, string][] = [
  ['PU','PENUP',      'pen',     false, 'PEN UP'     ],
  ['PD','PENDOWN',    'pen',     true,  'PEN DOWN'   ],
  ['HT','HIDETURTLE', 'visible', false, 'HIDE TURTLE'],
  ['ST','SHOWTURTLE', 'visible', true,  'SHOW TURTLE'],
];
PEN_COMMANDS.forEach(([abbr, full, prop, val, msg]) => {
  CMD[abbr] = CMD[full] = async (_t,i,_v,rctx) => { rctx.session.turtle[prop]=val; rctx.io.render(); rctx.io.log(msg,'info'); return i; };
});

// ▸ Drawing
CMD['CS'] = CMD['CLEARSCREEN'] = async (_t,i,_v,rctx) => {
  // CS clears trail segments, labels, and dots; resets turtle to home.
  // Does NOT clear variables, procedures, or the console — use CLR for a full reset.
  clearScreen(rctx.session, rctx.io, { keepBackground: true }); rctx.io.render(); rctx.io.log('CLEAR','info'); return i;
};
CMD['CT'] = CMD['CLEARTEXT'] = async (_t,i,_v,rctx) => { rctx.io.clearText(); return i; };
CMD['CIRCLE'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); rctx.io.log('CIRCLE '+formatNum(n),'op'); await circle(n,rctx); return nextIdx;
};
// ARC angle radius: walk part of a CIRCLE — angle degrees of it, turning right
// (negative angle: turning left). ARC 360 r draws the same as CIRCLE r.
CMD['ARC'] = async (t,i,v,rctx) => {
  const {value:a, nextIdx:i1} = await evalExpr(t,i,v,rctx);
  const {value:r, nextIdx:i2} = await evalExpr(t,i1,v,rctx);
  if(rctx.io.logs('op')) rctx.io.log('ARC '+formatNum(a)+' '+formatNum(r),'op');
  await arc(a, r, rctx);
  return i2;
};
// Named colour table — 16 kid-friendly colours accepted by SETCOLOR.
// GREY is an alias for GRAY (same slot, not counted separately).
export const COLOR_NAMES: Record<string, [number, number, number]> = {
  RED:[220,50,50], ORANGE:[255,140,0], YELLOW:[255,220,0],
  GREEN:[50,180,50], LIME:[100,255,50], CYAN:[0,220,220],
  BLUE:[50,100,220], NAVY:[0,0,150], PURPLE:[150,50,200],
  PINK:[255,100,180], MAGENTA:[220,0,220], WHITE:[255,255,255],
  GRAY:[150,150,150], GREY:[150,150,150], BLACK:[0,0,0],
  BROWN:[150,80,30], GOLD:[255,200,0],
};

// readColour(t, i, v, rctx, cmd): a colour input — a name (bare or "quoted, see
// COLOR_NAMES) or three expressions r g b, each clamped to 0–255 with a warning.
async function readColour(t: Token[], i: number, v: Scope, rctx: RunContext, cmd: string): Promise<{ rgb: [number, number, number]; nextIdx: number }> {
  const word = t[i]?.text;
  const nameTok = word && (word.startsWith('"') ? word.slice(1).toUpperCase() : word);
  if(nameTok && hasOwn(COLOR_NAMES, nameTok))
    return { rgb: [...COLOR_NAMES[nameTok]] as [number, number, number], nextIdx: i + 1 };
  if(word && word.startsWith('"')) throw new Error(cmd + ': unknown colour name ' + word.slice(1));
  if(word && /^[A-Z_]/.test(word) && !isValueStart(word, rctx))
    throw new Error(cmd + ': unknown colour name ' + word + ' (colours: ' + Object.keys(COLOR_NAMES).join(' ') + ')');
  const {value:r, nextIdx:i1} = await evalExpr(t,i,v,rctx);
  const {value:g, nextIdx:i2} = await evalExpr(t,i1,v,rctx);
  const {value:b, nextIdx:i3} = await evalExpr(t,i2,v,rctx);
  // Clamp each channel to 0–255 and warn if any value was changed — mirrors
  // SETWIDTH's behaviour so out-of-range input is never silently discarded.
  const clamp = (x: number): number => Math.max(0, Math.min(255, Math.round(x)));
  const rgb: [number, number, number] = [clamp(r), clamp(g), clamp(b)];
  // Compare against the raw input (not Math.round) so tiny negatives like -0.4 also warn.
  if(rgb[0]!==r || rgb[1]!==g || rgb[2]!==b)
    rctx.io.log(cmd + ' ' + [r,g,b].map(formatNum).join(' ') + ' clamped to ' + rgb.join(' '), 'info');
  return { rgb, nextIdx: i3 };
}
// SETCOLOR name | r g b — pen colour.
CMD['SC'] = CMD['SETCOLOR'] = CMD['SETPC'] = CMD['SETPENCOLOR'] = async (t,i,v,rctx) => {
  const { rgb, nextIdx } = await readColour(t, i, v, rctx, 'SETCOLOR');
  rctx.session.turtle.color = rgb;
  rctx.io.log('COLOR ' + rgb.join(' '), 'info');
  return nextIdx;
};
// SETBG name | r g b — canvas background colour. Kept by CS; RUN (with "clear
// screen on run") and CLR go back to the canvas style chosen in Options.
CMD['SETBG'] = CMD['SETBACKGROUND'] = async (t,i,v,rctx) => {
  const { rgb, nextIdx } = await readColour(t, i, v, rctx, 'SETBG');
  rctx.session.background = rgb;
  rctx.io.render();
  rctx.io.log('BACKGROUND ' + rgb.join(' '), 'info');
  return nextIdx;
};
CMD['SW'] = CMD['SETWIDTH'] = CMD['SETPENSIZE'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx);
  const w = Math.max(0.5, Math.min(100, n)); // clamp: 0 or negative = invisible; >100 = unreasonable
  if(w !== n) rctx.io.log('SETWIDTH ' + formatNum(n) + ' clamped to ' + w, 'info');
  rctx.session.turtle.width = w;
  rctx.io.log('WIDTH ' + w, 'info');
  return nextIdx;
};
// WAIT n: pause for n seconds (non-blocking, ends early on STOP). Capped at 30 s.
CMD['WAIT'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx);
  if(n < 0)  throw new Error('WAIT: duration must be >= 0, got ' + n);
  const secs = Math.min(n, 30); // cap: prevent accidental multi-hour freeze
  if(secs < n) rctx.io.log('WAIT ' + formatNum(n) + 's capped to 30s', 'info');
  rctx.io.log('WAIT ' + formatNum(secs) + 's', 'op');
  rctx.io.render();
  await sleep(secs * 1000, rctx);
  return nextIdx;
};
// SPEED n: 0 (slowest) … 3 (fast) animated, 4 = instant. Same scale as the slider.
CMD['SPEED'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx);
  const s = Math.max(0, Math.min(4, Math.round(n)));
  if(s !== Math.round(n)) rctx.io.log('SPEED ' + formatNum(n) + ' clamped to ' + s, 'info');
  rctx.speed   = s;   // takes effect immediately for the rest of this run
  rctx.io.setSpeed(s); // sync the slider so the next run starts at the same speed
  rctx.io.log('SPEED ' + s, 'info');
  return nextIdx;
};
