import { CH, CW, ctx } from './canvas.ts';

// ── Background ────────────────────────────────────────────────────────────────
// A flat fill, painted first by render() every frame. Beige (default) is easy on
// the eyes and keeps light pen colours visible; white is for printing / PNG export.
export type CanvasStyle = 'beige' | 'white';
export type TurtleStyle = 'turtle' | 'triangle';
const BG_COLOUR: Record<CanvasStyle, string> = { beige: '#f4eedf', white: '#ffffff' };
let canvasStyle: CanvasStyle = 'beige';             // set by OPTIONS panel
export let turtleStyle: TurtleStyle = 'turtle';     // set by OPTIONS panel
export function setCanvasStyle(s: CanvasStyle): void { canvasStyle = s; }
export function setTurtleStyle(s: TurtleStyle): void { turtleStyle = s; }
export function drawBackground(){
  ctx.fillStyle = BG_COLOUR[canvasStyle];
  ctx.fillRect(0,0,CW,CH);
}
