import type { PROC_SCOPE, REPEAT_SCOPE } from './scope.ts';

// ── Shared types of the interpreter core ──────────────────────────────────────
// Types only (no runtime code). Values live in the modules named below.

/** A token (tokenizer.ts). `text`: an uppercase word, a number literal, an
 *  operator, `[` `]` `(` `)`, a `"word` (source case kept) or `~` (negative sign).
 *  `line` / `col`: 1-based source position of its first character.
 *  `lineText`: the trimmed source line, for error messages. */
export interface Token { text: string; line: number; col: number; lineText: string }

/** The source position a run last executed (RunContext.execLine). n = 0: none yet. */
export interface SourcePos { n: number; col: number; text: string }

/** Turtle pose and pen (turtle/state.ts). */
export interface Turtle {
  x: number;
  y: number;
  /** Heading in degrees: 0 = north, clockwise. Not normalised. */
  angle: number;
  pen: boolean;
  visible: boolean;
  color: [number, number, number];
  width: number;
}

/** A LABEL drawn on the canvas, in Logo coordinates. */
export interface Label { x: number; y: number; text: string; r: number; g: number; b: number }

/** A filled polygon (BEGINFILL … ENDFILL). pts: x0, y0, x1, y1, … in Logo coordinates.
 *  at: the number of segments drawn before BEGINFILL — the fill is painted under
 *  everything drawn after that, so the outline stays on top. */
export interface Fill { at: number; pts: number[]; r: number; g: number; b: number }

/** Trail segments + labels + fills (turtle/drawing.ts). */
export interface Drawing {
  /** x1, y1, x2, y2, w per segment. */
  f32: Float32Array;
  /** r, g, b per segment. */
  u8: Uint8Array;
  len: number;
  capWarned: boolean;
  labels: Label[];
  labelCapWarned: boolean;
  /** In painting order (by .at). */
  fills: Fill[];
  fillCapWarned: boolean;
}

/** A user procedure: TO NAME :a :b [:c default] … END.
 *  params: all input names; the first `required` are needed by every call, the rest
 *  are optional (`defaults[k]` = the default expression of params[required + k];
 *  they get a value only in a call in parentheses: (NAME a b c)). */
export interface Proc { params: string[]; required: number; defaults: Token[][]; body: Token[] }
export type ProcMap = Record<string, Proc>;

/** REPCOUNT / REPCOUNTMAX of a REPEAT iteration. */
export interface RepeatInfo { count: number; max: number }

/** A variable scope. Scopes are chained by prototype (dynamic scoping, scope.ts).
 *  `undefined` = declared with LOCAL but no value yet. */
export interface Scope {
  [name: string]: number | undefined;
  [REPEAT_SCOPE]?: RepeatInfo;
  [PROC_SCOPE]?: string;
}

/** What happens at the canvas edge (WRAP / WINDOW / FENCE). */
export type EdgeMode = 'fence' | 'wrap' | 'window';

/** A BEGINFILL in progress: the path so far (x, y pairs), its colour, Fill.at. */
export interface FillPath { at: number; pts: number[]; rgb: [number, number, number] }

/** SETPLOT's frame (turtle/plot.ts): the graph range shown on the canvas, inside a
 *  margin. equal: one scale for x and y (the range is widened to fill the area).
 *  outside: the canvas point of the last PLOT that fell outside the plot area
 *  (the line is broken there), or null. */
export interface PlotFrame { xmin: number; xmax: number; ymin: number; ymax: number; equal: boolean; outside: [number, number] | null }

/** Everything a Logo program can change (session.ts). */
export interface Session {
  turtle: Turtle;
  drawing: Drawing;
  globals: Scope;
  procs: ProcMap;
  walkTick: number;
  isMoving: boolean;
  /** SETBG colour; null = the canvas style chosen in Options. */
  background: [number, number, number] | null;
  /** WRAP / WINDOW / FENCE (default). Kept by CS, like the background. */
  edge: EdgeMode;
  /** Set between BEGINFILL and ENDFILL. */
  fillPath: FillPath | null;
  /** SETPLOT frame for PLOT / AXES / PLOTX / PLOTY, or null. Kept by CS, like the edge mode. */
  plot: PlotFrame | null;
}

/** Console line classes: filtered in the page's console (see ui/console.ts). */
export type LogClass = 'op' | 'info' | 'ok' | 'err' | 'print' | 'cmd';

/** The interpreter's only way out (io.ts). */
export interface LogoIO {
  log(msg: string, cls?: LogClass): void;
  /** Would a line of this class be shown? Lets hot paths skip building messages nobody sees. */
  logs(cls: LogClass): boolean;
  render(): void;
  paintLine(x1: number, y1: number, x2: number, y2: number, w: number, r: number, g: number, b: number): void;
  paintLabel(lab: Label): void;
  /** Draw one fill on top of the trail layer (only used when nothing was drawn after its BEGINFILL). */
  paintFill(f: Fill): void;
  redraw(): void;
  clearText(): void;
  canvasSize(): { w: number; h: number };
  setSpeed(n: number): void;
  nextFrame(): Promise<unknown>;
  macroYield(): Promise<unknown>;
  /** Keyboard (KEYP / READKEY): is a key press waiting? */
  keyWaiting(): boolean;
  /** The oldest waiting key press as a key code, removed from the queue; null if none. */
  readKey(): number | null;
  /** The mouse over the canvas, in Logo coordinates; down = a button is pressed. */
  mouse(): { x: number; y: number; down: boolean };
}

/** Per-run interpreter state (context.ts). */
export interface RunContext {
  session: Session;
  io: LogoIO;
  stopped: boolean;
  execLine: SourcePos;
  speed: number;
  procs: ProcMap;
  globals: Scope | null;
  exprDepth: number;
  instantStepCount: number;
  /** Part of the current animation frame already spent (0 … 1), shared by move / rotate / tick. */
  frameUsed: number;
  steps: number;
  lastYield: number;
  wake: (() => void) | null;
  onFinish: (() => void) | null;
  /** Date.now() when TIMER was last 0 (start of the run, or RESETTIMER). */
  timerStart: number;
}

/** A leaf command handler: consumes its arguments from tokens[idx…], returns the next index. */
export type CommandHandler = (tokens: Token[], idx: number, vars: Scope, rctx: RunContext) => Promise<number>;
