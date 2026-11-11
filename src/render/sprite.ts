import type { Turtle } from '../interpreter/types.ts';

// ── Turtle sprite: flat vector drawing ────────────────────────────────────────
// Drawn straight into the main context every frame (in logical units, so it is
// sharp at any DPR). Local coordinates: origin = the turtle's position (the pen
// point), forward = −y, size ≈ 26 × 40 px. The dot in the middle of the shell
// marks the exact pen point: red = pen down, white = pen up.
//
// Animation: while the turtle moves (session.isMoving) the legs swing in
// diagonal pairs, driven by session.walkTick; a resting turtle is static.

// Blue turtle — the same drawing is the app's icon (src/assets/logo.svg; keep in sync).
const OUTLINE = '#1f4a85';
const SHELL   = '#3b7dd8';
const PLATE   = '#69a5ec';   // centre plate on the shell
const SKIN    = '#9cc5f2';   // head, legs, tail
const EYE     = '#13233a';
const PEN_DOWN = '#e0393b';

function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI*2); c.fill(); c.stroke();
}

// drawTurtleSprite(c, cx, cy, turtle, tick, moving): c must already be in logical
// units (render() sets the DPR transform); (cx, cy) is the turtle in canvas pixels.
export function drawTurtleSprite(c: CanvasRenderingContext2D, cx: number, cy: number,
                                 turtle: Turtle, tick: number, moving: boolean): void {
  const swing = moving ? Math.sin(tick * 0.32) * 2 : 0;   // leg swing ±2 px
  c.save();
  c.translate(cx, cy);
  c.rotate(turtle.angle * Math.PI / 180);                 // heading 0 = up
  c.lineWidth = 1.5; c.strokeStyle = OUTLINE; c.lineJoin = 'round';

  // legs (front-left + rear-right swing together, the other pair opposite), tail
  c.fillStyle = SKIN;
  oval(c, -10, -7 + swing, 4, 5);
  oval(c,  10, -7 - swing, 4, 5);
  oval(c, -10,  8 - swing, 4, 5);
  oval(c,  10,  8 + swing, 4, 5);
  c.beginPath(); c.moveTo(-3, 11); c.lineTo(0, 17); c.lineTo(3, 11); c.closePath(); c.fill(); c.stroke();

  // head with two eyes
  oval(c, 0, -16, 5.5, 6);
  c.fillStyle = EYE;
  c.beginPath(); c.arc(-2.3, -18, 1.1, 0, Math.PI*2); c.arc(2.3, -18, 1.1, 0, Math.PI*2); c.fill();

  // shell + centre plate
  c.fillStyle = SHELL;
  oval(c, 0, 0, 11, 13);
  c.fillStyle = PLATE; c.lineWidth = 1;
  c.beginPath();
  for(let i = 0; i < 6; i++){
    const a = i / 6 * Math.PI * 2;
    const x = Math.sin(a) * 6, y = -Math.cos(a) * 7;
    if(i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath(); c.fill(); c.stroke();

  // pen point
  c.beginPath(); c.arc(0, 0, 3, 0, Math.PI*2);
  c.fillStyle = turtle.pen ? PEN_DOWN : '#ffffff';
  c.strokeStyle = turtle.pen ? '#ffffff' : OUTLINE;
  c.lineWidth = 1.2; c.fill(); c.stroke();
  c.restore();
}
