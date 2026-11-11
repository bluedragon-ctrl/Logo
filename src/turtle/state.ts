import type { Turtle } from '../interpreter/types.ts';

// ── Turtle state ──────────────────────────────────────────────────────────────
// mkTurtle(): canonical initial state — origin (0,0), pen down, heading 0° (north).
//   x, y     Logo world coordinates (float, origin = canvas centre)
//   angle    heading in degrees, 0 = north, increases clockwise (standard Logo convention)
//   pen      true = draw segments; false = move silently (PENUP)
//   visible  false = skip sprite draw in render() (HIDETURTLE)
//   color    [r,g,b] Uint8-range values written directly into the trail store
//   width    stroke width in pixels, clamped 0.5–100 by SETWIDTH
// The turtle lives in a session (interpreter/session.js): session.turtle.

export function mkTurtle(): Turtle { return {x:0, y:0, angle:0, pen:true, visible:true, color:[0,0,0], width:3}; }

// resetTurtle(t): back to the initial state IN PLACE, so every reference to
// session.turtle (an expression being evaluated, the renderer) stays valid.
export function resetTurtle(t: Turtle): void { Object.assign(t, mkTurtle()); }
