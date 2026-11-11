import { CH, CW, DPR, canvas, ctx } from './canvas.ts';
import { context2d } from '../util.ts';

// ── Background: sand texture ──────────────────────────────────────────────────
// 1600 random dots in pixel-space composited once into bgCache to mimic sand.
// Grain positions must be regenerated on every resize because they are stored
// in absolute pixel coordinates, not proportional coordinates.
interface Grain { x: number; y: number; r: number; a: number; c: string }
let grains: Grain[] = [];
export function buildGrains(){
  grains=[];
  for(let i=0;i<1600;i++) grains.push({x:Math.random()*CW,y:Math.random()*CH,r:Math.random()*1.6+0.3,a:Math.random()*0.28+0.07,c:Math.random()>0.5?'#9a6a18':'#f2dc8a'});
}

// buildBgCache: paint the static background (radial gradient + 1600 grain dots)
// into a dedicated off-screen canvas so render() can blit it with one drawImage().
// Prerequisite: buildGrains() must have been called first (grains[] is populated).
// Must be called again after every canvas resize (bgCache dimensions must match).
let bgCache: HTMLCanvasElement | null = null;
export function buildBgCache(){
  const cache = bgCache = document.createElement('canvas');
  cache.width=canvas.width; cache.height=canvas.height; // device pixels
  const bc=context2d(cache);
  bc.setTransform(DPR,0,0,DPR,0,0);                         // draw in logical units
  const w=CW,h=CH;
  const g=bc.createRadialGradient(w*.45,h*.4,0,w*.5,h*.6,w*.85);
  g.addColorStop(0,'#edd98a');g.addColorStop(0.5,'#d4a850');g.addColorStop(1,'#a87030');
  bc.fillStyle=g; bc.fillRect(0,0,w,h);
  for(const gr of grains){bc.globalAlpha=gr.a;bc.fillStyle=gr.c;bc.beginPath();bc.arc(gr.x,gr.y,gr.r,0,Math.PI*2);bc.fill();}
  bc.globalAlpha=1;
}
export type CanvasStyle = 'parchment' | 'white';
export type TurtleStyle = 'animated' | 'triangle';
let canvasStyle: CanvasStyle = 'parchment'; // 'parchment' | 'white'  — set by OPTIONS panel
export let turtleStyle: TurtleStyle = 'animated';  // 'animated'  | 'triangle' — set by OPTIONS panel
export function setCanvasStyle(s: CanvasStyle): void { canvasStyle = s; }
export function setTurtleStyle(s: TurtleStyle): void { turtleStyle = s; }
export function drawBackground(){
  switch(canvasStyle){
    case 'white':
      ctx.fillStyle='#ffffff';
      ctx.fillRect(0,0,CW,CH);
      break;
    default: // 'parchment'
      if(bgCache) ctx.drawImage(bgCache,0,0,CW,CH); // single blit (device-res cache drawn at logical size) — far cheaper than replaying 1600 grain arcs
  }
}
