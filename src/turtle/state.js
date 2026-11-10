// ── Turtle state ──────────────────────────────────────────────────────────────
// mkTurtle(): canonical initial state — origin (0,0), pen down, heading 0° (north).
//   x, y     Logo world coordinates (float, origin = canvas centre)
//   angle    heading in degrees, 0 = north, increases clockwise (standard Logo convention)
//   pen      true = draw segments; false = move silently (PENUP)
//   visible  false = skip sprite draw in render() (HIDETURTLE)
//   color    [r,g,b] Uint8-range values written directly into trailU8 by trailPush
//   width    stroke width in pixels, clamped 0.5–100 by SETWIDTH
function mkTurtle(){ return {x:0, y:0, angle:0, pen:true, visible:true, color:[0,0,0], width:3}; }

export let turtle    = mkTurtle();
export let walkTick  = 0;       // cyclic 16-bit integer (& 0xFFFF); drives all sprite animation via sin
export let isMoving  = false;   // true during move() animation loop; controls leg-swing in buildSprite
export function resetTurtle(){ turtle = mkTurtle(); }
export function setMoving(on){ isMoving = on; }
export function advanceWalk(){ walkTick = (walkTick + 1) & 0xFFFF; } // 16-bit wrap avoids float precision loss over long programs
