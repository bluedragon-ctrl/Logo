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

/** Trail segments + labels (turtle/drawing.ts). */
export interface Drawing {
  /** x1, y1, x2, y2, w per segment. */
  f32: Float32Array;
  /** r, g, b per segment. */
  u8: Uint8Array;
  len: number;
  capWarned: boolean;
  labels: Label[];
  labelCapWarned: boolean;
}

/** A user procedure: TO NAME :a :b … END. */
export interface Proc { params: string[]; body: Token[] }
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

/** Everything a Logo program can change (session.ts). */
export interface Session {
  turtle: Turtle;
  drawing: Drawing;
  globals: Scope;
  procs: ProcMap;
  walkTick: number;
  isMoving: boolean;
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
  redraw(): void;
  clearText(): void;
  canvasSize(): { w: number; h: number };
  setSpeed(n: number): void;
  nextFrame(): Promise<unknown>;
  macroYield(): Promise<unknown>;
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
}

/** A leaf command handler: consumes its arguments from tokens[idx…], returns the next index. */
export type CommandHandler = (tokens: Token[], idx: number, vars: Scope, rctx: RunContext) => Promise<number>;
