import { CH, CW, ctx } from './canvas.ts';

// ── Background ────────────────────────────────────────────────────────────────
// A flat fill, painted first by render() every frame (SETBG overrides the style). Beige (default) is easy on
// the eyes and keeps light pen colours visible; white is for printing / PNG export.
export type CanvasStyle = 'beige' | 'white';
export type TurtleStyle = 'turtle' | 'triangle';
const BG_COLOUR: Record<CanvasStyle, string> = { beige: '#f4eedf', white: '#ffffff' };
let canvasStyle: CanvasStyle = 'beige';             // set by OPTIONS panel
export let turtleStyle: TurtleStyle = 'turtle';     // set by OPTIONS panel
export function setCanvasStyle(s: CanvasStyle): void { canvasStyle = s; }
export function setTurtleStyle(s: TurtleStyle): void { turtleStyle = s; }
// drawBackground(bg): the SETBG colour if a program set one, else the canvas style.
export function drawBackground(bg: [number, number, number] | null){
  ctx.fillStyle = bg ? 'rgb(' + bg.join(',') + ')' : BG_COLOUR[canvasStyle];
  ctx.fillRect(0,0,CW,CH);
}
