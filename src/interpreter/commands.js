import { BINARY2, QUERY_TOKENS, UNARY, evalExpr, skipSen } from './expr.js';
import { sleep, tick } from './pacing.js';
import { formatNum, hasOwn, isVarTok, procScopeOf, setVar, varName } from './scope.js';
import { LINE_SEN } from './tokenizer.js';
import { render } from '../render/render.js';
import { MAX_LABELS, clearScreen, labelCapWarned, labelStore, paintLabel, setLabelCapWarned, trailPushIfRoom } from '../render/trail.js';
import { circle, clipToCanvas, move, ouch, rotate } from '../turtle/motion.js';
import { turtle } from '../turtle/state.js';
import { con, log, optSpeed } from '../ui/console.js';

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
export const CMD = {};

// ▸ Variables
CMD['MAKE'] = async (t,i,v,rctx) => {
  i = skipSen(t, i, rctx);
  const rawName = t[i++];
  if(!isVarTok(rawName))
    throw new Error('MAKE: expected a variable name like :x or "x, got: ' + (rawName || 'nothing'));
  const name = varName(rawName);
  const {value, nextIdx} = await evalExpr(t, i, v, rctx);
  setVar(v, name, value, rctx);
  log('MAKE :' + name + ' = ' + formatNum(value), 'info');
  return nextIdx;
};
// LOCAL :a :b …  — declare variables local to the current procedure (no value yet).
CMD['LOCAL'] = async (t,i,v,rctx) => {
  i = skipSen(t, i, rctx);
  if(!isVarTok(t[i])) throw new Error('LOCAL: expected a variable name like :x, got: ' + (t[i] || 'nothing'));
  const scope = procScopeOf(v, rctx);
  while(isVarTok(t[i])) { const name = varName(t[i++]); if(!hasOwn(scope, name)) scope[name] = undefined; }
  return i;
};
// LOCALMAKE :x value  — LOCAL + MAKE in one step.
CMD['LOCALMAKE'] = async (t,i,v,rctx) => {
  i = skipSen(t, i, rctx);
  const rawName = t[i++];
  if(!isVarTok(rawName)) throw new Error('LOCALMAKE: expected a variable name like :x, got: ' + (rawName || 'nothing'));
  const name = varName(rawName);
  const {value, nextIdx} = await evalExpr(t, i, v, rctx);
  procScopeOf(v, rctx)[name] = value;
  log('LOCALMAKE :' + name + ' = ' + formatNum(value), 'info');
  return nextIdx;
};

// wordArg: if the next token is a "quoted word, return it (source case kept).
function wordArg(t, i, rctx) {
  i = skipSen(t, i, rctx);
  const tok = t[i];
  if(tok && tok.startsWith('"')) {
    const text = tok.slice(1);
    if(!text) throw new Error('Empty word: put text right after the " (e.g. "HELLO)');
    return { text, nextIdx: i + 1 };
  }
  return null;
}
// PRINT value | "word — always visible regardless of filter settings; auto-expands console.
CMD['PRINT'] = CMD['PR'] = async (t,i,v,rctx) => {
  const w = wordArg(t, i, rctx);
  if(w) { log('PRINT → ' + w.text, 'print'); return w.nextIdx; }
  const {value, nextIdx} = await evalExpr(t, i, v, rctx);
  log('PRINT → ' + formatNum(value), 'print');
  return nextIdx;
};

// isValueStart(tok): can tok begin an expression? (DOT / LABEL argument detection)
function isValueStart(tok) {
  if(!tok || tok.startsWith(LINE_SEN)) return false;
  return isVarTok(tok) || /^[\d.]/.test(tok) || tok === '~' || tok === '-' || tok === '(' ||
         QUERY_TOKENS.has(tok) || tok === 'REPCOUNT' || tok === 'REPCOUNTMAX' ||
         UNARY.has(tok) || BINARY2.has(tok) || tok === 'NOT';
}

// LABEL "text | value | bareword — draw text at the turtle position.
// "Hello keeps its case. A value (LABEL :X, LABEL XCOR) draws the number.
// Text is stored in labelStore so it survives canvas resize.
CMD['LABEL'] = async (t,i,v,rctx) => {
  let text;
  const w = wordArg(t, i, rctx);
  if(w) { text = w.text; i = w.nextIdx; }
  else {
    i = skipSen(t, i, rctx);
    if(!t[i] || t[i] === ']') throw new Error('LABEL: text argument missing');
    if(isValueStart(t[i])) { const r = await evalExpr(t, i, v, rctx); text = formatNum(r.value); i = r.nextIdx; }
    else { text = t[i++]; } // bare word (uppercase), e.g. LABEL HELLO
  }
  if(labelStore.length>=MAX_LABELS){
    if(!labelCapWarned){ log('LABEL: label limit ('+MAX_LABELS+') reached — further labels ignored','info'); setLabelCapWarned(true); }
    return i;
  }
  const lab={x:turtle.x, y:turtle.y, text, r:turtle.color[0], g:turtle.color[1], b:turtle.color[2]};
  labelStore.push(lab);
  paintLabel(lab);
  await tick(rctx);
  return i;
};

// ▸ Motion — all delegate to move()/rotate() which own animation and instant-mode logic
CMD['FD'] = CMD['FORWARD'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); log('FD '+formatNum(n),'op'); await move(n,rctx);   return nextIdx;
};
CMD['BK'] = CMD['BACK'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); log('BK '+formatNum(n),'op'); await move(-n,rctx);  return nextIdx;
};
CMD['RT'] = CMD['RIGHT'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); log('RT '+formatNum(n),'op'); await rotate(n,rctx);  return nextIdx;
};
CMD['LT'] = CMD['LEFT'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); log('LT '+formatNum(n),'op'); await rotate(-n,rctx); return nextIdx;
};
CMD['SETH'] = CMD['SETHEADING'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx);
  // Find the shortest-arc delta to target so the turtle turns at most 180°.
  const cur = ((turtle.angle%360)+360)%360, target = ((n%360)+360)%360;
  let delta = target - cur;
  if(delta >  180) delta -= 360; // e.g. cur=350 target=10 → delta=-340 → +20
  if(delta < -180) delta += 360;
  log('SETH ' + formatNum(target), 'op');
  await rotate(delta, rctx);
  if(!rctx.stopped) turtle.angle = target; // snap to exact value after animation to eliminate float drift
  return nextIdx;
};
// HOME: teleport to origin (0,0), heading 0°. Instant — no animation, no trail segment.
// Pen/color/width state is unchanged; use CS to clear the trail.
CMD['HOME'] = async (_t,i) => {
  turtle.x=0; turtle.y=0; turtle.angle=0; render(); log('HOME','info'); return i;
};
// SETPOS x y: straight line (pen down) to (x, y) without changing heading.
// Leaving the canvas behaves like FD: the line stops at the edge and the run ends (OUCH!).
CMD['SETPOS'] = async (t,i,v,rctx) => {
  const {value:nx, nextIdx:i1} = await evalExpr(t,i,v,rctx);
  const {value:ny, nextIdx:i2} = await evalExpr(t,i1,v,rctx);
  const hit = clipToCanvas(turtle.x, turtle.y, nx, ny);
  const [ex, ey] = hit || [nx, ny];
  if(turtle.pen && (ex !== turtle.x || ey !== turtle.y))
    trailPushIfRoom(turtle.x,turtle.y,ex,ey,turtle.width, turtle.color[0],turtle.color[1],turtle.color[2]);
  turtle.x=ex; turtle.y=ey;
  log('SETPOS '+formatNum(nx)+' '+formatNum(ny), 'op');
  if(hit) ouch();
  await tick(rctx);
  return i2;
};
// DOT [x y] — filled dot at (x,y), or at the turtle position when the next token on
// the same line is not a value. Diameter = pen width, color = pen color. Always draws
// regardless of pen state. Does not move the turtle. Stored as a zero-length trail
// segment (x1===x2, y1===y2), which paintLine/rebuildTrailCanvas draw as a filled circle.
CMD['DOT'] = async (t,i,v,rctx) => {
  let px, py;
  if(isValueStart(t[i])) {  // raw peek, no sentinel skip: DOT alone on a line takes no inputs
    const r1 = await evalExpr(t, i, v, rctx); px = r1.value; i = r1.nextIdx;
    const r2 = await evalExpr(t, i, v, rctx); py = r2.value; i = r2.nextIdx;
  } else {
    px = turtle.x; py = turtle.y;
  }
  trailPushIfRoom(px, py, px, py, turtle.width, turtle.color[0], turtle.color[1], turtle.color[2]);
  log('DOT '+formatNum(px)+' '+formatNum(py), 'info');
  await tick(rctx);
  return i;
};
// XCOR / YCOR / HEADING as standalone statements: log current value, no-op otherwise.
CMD['XCOR']    = async (_t,i) => { log('XCOR = '   +formatNum(turtle.x),'info');                        return i; };
CMD['YCOR']    = async (_t,i) => { log('YCOR = '   +formatNum(turtle.y),'info');                        return i; };
CMD['HEADING'] = async (_t,i) => { log('HEADING = '+formatNum(((turtle.angle%360)+360)%360),'info');    return i; };

// ▸ Pen / visibility — data-table factory: [abbr, full, property, value, log-message]
[['PU','PENUP',      'pen',     false, 'PEN UP'     ],
 ['PD','PENDOWN',    'pen',     true,  'PEN DOWN'   ],
 ['HT','HIDETURTLE', 'visible', false, 'HIDE TURTLE'],
 ['ST','SHOWTURTLE', 'visible', true,  'SHOW TURTLE'],
].forEach(([abbr, full, prop, val, msg]) => {
  CMD[abbr] = CMD[full] = async (_t,i) => { turtle[prop]=val; render(); log(msg,'info'); return i; };
});

// ▸ Drawing
CMD['CS'] = CMD['CLEARSCREEN'] = async (_t,i) => {
  // CS clears trail segments, labels, and dots; resets turtle to home.
  // Does NOT clear variables, procedures, or the console — use CLR for a full reset.
  clearScreen(); render(); log('CLEAR','info'); return i;
};
CMD['CT'] = CMD['CLEARTEXT'] = async (_t,i) => { con.innerHTML=''; return i; };
CMD['CIRCLE'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx); log('CIRCLE '+formatNum(n),'op'); await circle(n,rctx); return nextIdx;
};
// Named colour table — 16 kid-friendly colours accepted by SETCOLOR.
// GREY is an alias for GRAY (same slot, not counted separately).
const COLOR_NAMES = {
  RED:[220,50,50], ORANGE:[255,140,0], YELLOW:[255,220,0],
  GREEN:[50,180,50], LIME:[100,255,50], CYAN:[0,220,220],
  BLUE:[50,100,220], NAVY:[0,0,150], PURPLE:[150,50,200],
  PINK:[255,100,180], MAGENTA:[220,0,220], WHITE:[255,255,255],
  GRAY:[150,150,150], GREY:[150,150,150], BLACK:[0,0,0],
  BROWN:[150,80,30], GOLD:[255,200,0],
};

CMD['SC'] = CMD['SETCOLOR'] = async (t,i,v,rctx) => {
  // Named colour form: SETCOLOR RED  or  SETCOLOR "red
  const pi = skipSen(t, i, rctx);
  const nameTok = t[pi] && (t[pi].startsWith('"') ? t[pi].slice(1).toUpperCase() : t[pi]);
  if(nameTok && hasOwn(COLOR_NAMES, nameTok)){
    turtle.color = [...COLOR_NAMES[nameTok]];
    log('COLOR ' + turtle.color.join(' '), 'info');
    return pi+1;
  }
  if(t[pi] && t[pi].startsWith('"')) throw new Error('SETCOLOR: unknown colour name ' + t[pi].slice(1));
  // Numeric form: SETCOLOR r g b
  const {value:r, nextIdx:i1} = await evalExpr(t,i,v,rctx);
  const {value:g, nextIdx:i2} = await evalExpr(t,i1,v,rctx);
  const {value:b, nextIdx:i3} = await evalExpr(t,i2,v,rctx);
  // Clamp each channel to 0–255 and warn if any value was changed — mirrors
  // SETWIDTH's behaviour so out-of-range input is never silently discarded.
  const clamp = x => Math.max(0, Math.min(255, Math.round(x)));
  turtle.color = [clamp(r), clamp(g), clamp(b)];
  // Compare against raw input (not Math.round) so tiny negatives like -0.4 also trigger
  // the warning. clamp() already rounds+clamps; the warn fires whenever stored !== raw.
  if(turtle.color[0]!==r || turtle.color[1]!==g || turtle.color[2]!==b)
    log('SETCOLOR ' + [r,g,b].map(formatNum).join(' ') + ' clamped to ' + turtle.color.join(' '), 'info');
  log('COLOR ' + turtle.color.join(' '), 'info');
  return i3;
};
CMD['SW'] = CMD['SETWIDTH'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx);
  const w = Math.max(0.5, Math.min(100, n)); // clamp: 0 or negative = invisible; >100 = unreasonable
  if(w !== n) log('SETWIDTH ' + formatNum(n) + ' clamped to ' + w, 'info');
  turtle.width = w;
  log('WIDTH ' + w, 'info');
  return nextIdx;
};
// WAIT n: pause for n seconds (non-blocking, ends early on STOP). Capped at 30 s.
CMD['WAIT'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx);
  if(n < 0)  throw new Error('WAIT: duration must be >= 0, got ' + n);
  const secs = Math.min(n, 30); // cap: prevent accidental multi-hour freeze
  if(secs < n) log('WAIT ' + formatNum(n) + 's capped to 30s', 'info');
  log('WAIT ' + formatNum(secs) + 's', 'op');
  render();
  await sleep(secs * 1000, rctx);
  return nextIdx;
};
// SPEED n: 0 (slowest) … 3 (fast) animated, 4 = instant. Same scale as the slider.
CMD['SPEED'] = async (t,i,v,rctx) => {
  const {value:n, nextIdx} = await evalExpr(t,i,v,rctx);
  const s = Math.max(0, Math.min(4, Math.round(n)));
  if(s !== Math.round(n)) log('SPEED ' + formatNum(n) + ' clamped to ' + s, 'info');
  rctx.speed   = s;   // takes effect immediately for the rest of this run
  if(typeof optSpeed !== 'undefined') optSpeed.value = s; // sync slider so next run starts at same speed
  log('SPEED ' + s, 'info');
  return nextIdx;
};
