# Claude Logo — Software Specification
## Version 4.1 — March 2026

Claude Logo is a self-contained, browser-based Logo turtle graphics environment implemented as a single HTML file. It provides a code editor, animated turtle canvas, interpreter, and console in an integrated interface with no build step, no server, and no external runtime dependencies beyond a Google Fonts import.

This document specifies the architecture, data structures, algorithms, and interface design at the level of detail required for maintenance, extension, or reimplementation in a different environment.

| Property | Value |
|---|---|
| Target environment | Any modern browser (Chrome, Firefox, Safari, Edge). No server required. |
| Delivery | Single `.html` file. All JS, CSS, and HTML inline. |
| External dependencies | Google Fonts (VT323) — purely cosmetic; degrades gracefully offline. |
| Language supported | Subset of UCBLogo with extensions. Case-insensitive. Full spec in Section 2. |
| Max trail segments | 50 000 (configurable via `MAX_TRAIL_SEGS` constant). |
| Max recursion depth | Unlimited — trampoline executor; no JS call-stack growth per Logo call. |
| Expression call depth | 64 levels (`MAX_EXPR_DEPTH`) for expression-context proc calls. |

---

## 1. Architecture Overview

The application is structured as a single JavaScript execution context. All state is module-level. There is no framework, no module bundler, and no class hierarchy. The codebase is divided into five logical layers:

| Layer | Responsibility |
|---|---|
| Rendering | Canvas compositing, sprite generation, background and trail painting. |
| Turtle state | Position, heading, pen, colour, width. Single mutable object reset by CS/CLR/RUN. |
| Interpreter | Tokeniser → procedure extractor → trampoline executor → expression evaluator. |
| Editor | Contenteditable IIFE with syntax highlighting, caret preservation, tab/paste handling. |
| UI shell | Splitter, overlays, buttons, options, canvas resize, keyboard shortcuts. |

Data flows in one direction during execution:

```
editor.getValue()
  → tokenize(src)              → token[]
  → extractProcedures()        → { topLevel, newProcs }
  → makeRunContext(speed, procs) → rctx
  → run(topLevel, 0, {}, rctx)  → async, drives move() / rotate() / circle()
  → move(dist, rctx)           → trailPush() + paintSegment() + render()
```

No state is shared between runs except the canvas contents when "Clear screen on run" is unchecked.

### 1.1 File Layout

All code is in one file. Sections in declaration order:

| Section | Contents |
|---|---|
| Release notes (HTML comment) | One-line pointer to `CHANGELOG.md`. |
| `<style>` | All CSS. VT323 font import. Layout, overlays, animations, log colours. |
| HTML body | Panel div, canvas div, overlays, option controls. No inline scripts. |
| `<script>` — Utilities | `escHtml()`. Defined before all other code. |
| Canvas setup | `canvas`, `ctx`, `SPRITE_SIZE`, `SPRITE_OFFSET` constants. |
| Palette | Colour constants for turtle sprite. |
| Sprite helpers | `drawShell`, `drawLeg`, `drawHead`, `drawBelly`, `buildSprite`, `drawSimpleTurtle`. |
| Background | `buildGrains`, `buildBgCache`, `drawBackground`. |
| Trail storage | `trailF32`, `trailU8`, `trailLen`, `trailCapWarned`, `paintSegment`, `trailPush`, `trailPushIfRoom`, `rebuildTrailCanvas`. |
| Render pipeline | `toCanvas`, `spriteCenter`, `render`. |
| Turtle state | `mkTurtle`, `turtle`, `walkTick`, `isMoving`. |
| Run context | `makeRunContext`, `activeRctx`. |
| Run-state indicator | `setRunning`. |
| Console / log | `log()`, `MAX_LOG_LINES`, cached DOM refs. |
| Token resolution | `resolveToken`, `UNARY`, `UNARY_FNS`, `BINARY2`. |
| Expression evaluator | `evalExpr`. |
| Tokeniser | `tokenize`, `LINE_SEN`. |
| Block extractor | `extractBlock`. |
| Procedure store | `extractProcedures`, `procs`, `globalVars`. |
| Control-flow sentinels | `STOP_SIGNAL`. |
| Command dispatch table | `CMD` object + all leaf command handlers. |
| `runExpr` | Expression-context executor. |
| `run` | Trampoline executor. |
| Motion functions | `move`, `rotate`, `circle`, `MAX_CIRCLE_R`. |
| Label store | `labelStore`, `labelCapWarned`, `MAX_LABELS`, `paintLabel`. |
| Examples | `EXAMPLES` array, `buildExamples` IIFE. |
| Editor | Editor IIFE (`getValue`, `setValue`, caret, highlight, tab, paste). |
| Splitter | Drag, touch, collapse/expand IIFE. |
| Beautify | `beautify(src)` pure function + `INLINE_THRESHOLD` constant. |
| Button handlers | Copy, beautify, RUN, STOP, CLR. |
| Overlay management | `openOverlay`, `closeOverlay`, keyboard Escape. |
| Options | Font size pills IIFE, speed slider, canvas/turtle style wiring. |
| Canvas resize | `resizeCanvas`, debounced window resize listener. |

### 1.2 RunContext (`rctx`)

`rctx` is a plain object created by `makeRunContext(speed, procs)` at the start of every RUN. It bundles all per-run mutable state previously spread across globals and DOM reads.

| Field | Type | Purpose |
|---|---|---|
| `stopped` | `boolean` | Kill-switch. Set `true` by STOP/CLR buttons via `activeRctx`. |
| `execLine` | `{n, text}` | Most recently executed source line — appended to error messages. |
| `speed` | `0–4` integer | Animation speed resolved once at RUN start from the slider. 0 = slowest animated; 4 = instant. |
| `procs` | `object` | Reference to the global `procs` store populated before `run()` is called. |
| `instantStepCount` | `number` | Counter for periodic canvas flush in instant mode (resets at `INSTANT_FLUSH`). |

**Invariants:**
- Every function in the interpreter chain (`run`, `runExpr`, `evalExpr`, all CMD handlers, `move`, `rotate`, `circle`) receives `rctx` as a parameter — never reads `stopped`, `execLine`, or the speed DOM element directly.
- `activeRctx` (module-level) points to the live context while a program runs; STOP and CLR write `activeRctx.stopped = true`. Set to `null` after each run.
- `rctx.speed` is fixed at run start — moving the slider mid-run has no effect on the current execution.

### 1.3 Key Constants

| Constant | Value | Purpose |
|---|---|---|
| `MAX_TRAIL_SEGS` | 50 000 | Cap on drawn segments. |
| `MAX_CIRCLE_R` | 2 000 | Prevents runaway animated draws. |
| `MAX_EXPR_DEPTH` | 64 | Expression-context recursion guard. |
| `MAX_LOG_LINES` | 500 | Console line cap. |
| `MAX_LABELS` | 500 | LABEL store cap. |
| `INSTANT_FLUSH` | 150 | Move steps between paint yields in instant mode. |
| `INLINE_THRESHOLD` | 8 | Max tokens for inline `[ block ]` in beautify. |
| `SPRITE_SIZE` | 64 px | Turtle sprite canvas dimensions. |
| `SPRITE_OFFSET` | 18.8 px | Nose-to-centre distance for animated sprite placement. |

---

## 2. Interpreter

The interpreter processes Logo source text in four sequential stages: tokenisation, procedure extraction, expression evaluation, and trampoline execution. All stages are implemented as pure or near-pure functions with explicit parameter passing; global state mutations are confined to the RUN button handler.

### 2.1 Language Reference

#### 2.1.1 Motion Commands

| Command | Description |
|---|---|
| `FORWARD n` / `FD n` | Move forward n Logo units along current heading. |
| `BACK n` / `BK n` | Move backward n units (delegates to `move(-n)`). |
| `RIGHT n` / `RT n` | Turn clockwise n degrees. |
| `LEFT n` / `LT n` | Turn counter-clockwise n degrees. |
| `SETHEADING n` / `SETH n` | Set absolute heading. Animates via shortest arc (≤ 180°). |
| `HOME` | Teleport to origin (0,0), heading 0° (north). Instant, no trail segment. |
| `SETPOS x y` | Teleport to (x, y). Draws trail segment if pen down. |
| `XCOR` / `YCOR` / `HEADING` | Current x, y, or heading. Usable in expressions or as standalone statements. |
| `TOWARDS x y` | Returns heading (degrees CW from north) from turtle to (x,y). |
| `DISTANCE x y` | Returns Euclidean distance from turtle to (x,y). |

#### 2.1.2 Drawing Commands

| Command | Description |
|---|---|
| `PENUP` / `PU` | Raise pen. Motion no longer draws trail. |
| `PENDOWN` / `PD` | Lower pen. Motion draws trail. |
| `PENDOWN?` / `PD?` | Returns 1 if pen is down, 0 if up. |
| `PENUP?` / `PU?` | Returns 1 if pen is up, 0 if down. |
| `CIRCLE r` | Draw circle of radius r via polygon approximation. r capped at 2000. |
| `SETCOLOR r g b` / `SC r g b` | Set line colour. Each channel 0–255; clamped with warning. Also accepts named colours — see Section 2.1.6. |
| `SETWIDTH n` / `SW n` | Set line width in pixels. Clamped to 0.5–100 with warning. |
| `LABEL text` | Draw text at the turtle's current position in the current pen colour. Text persists across canvas resize. |
| `CLEARSCREEN` / `CS` | Clear canvas, reset turtle to origin, reset trail and label store. |
| `HIDETURTLE` / `HT` | Hide turtle sprite. |
| `SHOWTURTLE` / `ST` | Show turtle sprite. |

#### 2.1.3 Control Flow

| Command | Description |
|---|---|
| `REPEAT n [body]` | Execute body n times. Negative n logs error and skips. |
| `WHILE [cond] [body]` | Execute body while cond ≠ 0. Cond re-evaluated each iteration. |
| `FOR :v start end [body]` | Count :v from start to end, step auto-signed (±1). |
| `FOR :v start end step [body]` | Count loop with explicit step. Step 0 throws. |
| `IF cond [body]` | Execute body if cond ≠ 0. |
| `IFELSE cond [t] [f]` | Execute t-branch if cond ≠ 0, else f-branch. |
| `STOP` | Exit current procedure immediately (unwinds to nearest procBoundary frame). |
| `OUTPUT val` / `OP val` | Return val from current procedure. |
| `WAIT n` | Pause execution n seconds. Capped at 30 s; negative throws. |
| `TO name :p1 …  …  END` | Define named procedure with optional parameters. |
| `; comment` | Rest of line ignored by tokeniser. |

#### 2.1.4 Variables and Expressions

| Syntax | Description |
|---|---|
| `MAKE :name val` / `MAKE "name val` | Assign val to variable name in current scope. |
| `:name` | Read variable. Throws if undefined or non-finite. |
| `PRINT val` | Print evaluated value to console. Always visible; auto-expands console. |
| `CLEARTEXT` / `CT` | Clear the console without affecting canvas or interpreter state. |
| `+ - * /` | Arithmetic. Division by zero throws. |
| `MOD` | Modulo (infix: `10 MOD 3 → 1`). Also available as prefix: `MOD a b`. |
| `> < = >= <= !=` | Comparison. Returns 1 (true) or 0 (false). |
| `AND  OR  NOT` | Logical. Operands treated as 0 = false, non-zero = true. |

#### 2.1.5 Math Functions

| Function | Description and range |
|---|---|
| `SIN n` / `COS n` / `TAN n` | Trig functions. Argument in degrees. |
| `ARCSIN n` / `ARCCOS n` | Inverse trig. Argument must be in [−1, 1]; throws otherwise. |
| `ARCTAN n` | Arctangent. Argument unbounded. Result in degrees. |
| `SQRT n` | Square root. n ≥ 0; throws on negative. |
| `LN n` / `LOG n` | Natural / base-10 log. n > 0; throws on ≤ 0. |
| `EXP n` | eⁿ. n ≤ 709; throws if result would overflow to Infinity. |
| `ABS n` | Absolute value. |
| `INT n` | Truncate toward zero (`Math.trunc`). |
| `ROUND n` | Round to nearest integer. |
| `FLOOR n` | Round down to nearest integer. |
| `CEILING n` | Round up to nearest integer. |
| `POWER a b` | Exponentiation: a ^ b. |
| `MAX a b` | Maximum of two numbers. |
| `MIN a b` | Minimum of two numbers. |
| `RANDOM n` / `RND n` | Random integer in [0, n−1]. n must be > 0. |

#### 2.1.6 Named Colours

`SETCOLOR` accepts a colour name in place of three numeric channels. Supported names:

| Name | RGB | Name | RGB |
|---|---|---|---|
| `RED` | 220, 50, 50 | `NAVY` | 0, 0, 150 |
| `ORANGE` | 255, 140, 0 | `PURPLE` | 150, 50, 200 |
| `YELLOW` | 255, 220, 0 | `PINK` | 255, 100, 180 |
| `GREEN` | 50, 180, 50 | `MAGENTA` | 220, 0, 220 |
| `LIME` | 100, 255, 50 | `WHITE` | 255, 255, 255 |
| `CYAN` | 0, 220, 220 | `GRAY` / `GREY` | 150, 150, 150 |
| `BLUE` | 50, 100, 220 | `BLACK` | 0, 0, 0 |
| `BROWN` | 150, 80, 30 | `GOLD` | 255, 200, 0 |

Named colour lookup peeks at the next non-sentinel token inside the SETCOLOR handler before falling through to the numeric RGB path.

### 2.2 Tokeniser

`tokenize(src) → token[]`

Processes source line by line. For each non-empty line after comment stripping, a `LINE_SEN` sentinel is prepended, then all tokens on that line are uppercased and appended. Sentinels have the form:

```
__L<lineNumber>:<original source text>
```

Sentinels are identifiable by `startsWith("__L")` without case conversion. All other tokens are already uppercase when they enter the downstream pipeline, eliminating all `.toUpperCase()` calls from the hot dispatch loops.

Token regex (multi-character operators matched before single characters):

```
/>=|<=|!=|[\[\]+\-*\/=><]|[^\s\[\]+\-*\/=><]+/g
```

**LINE_SEN guard:** Before processing a sentinel in `run()` or `runExpr()`, the code checks `indexOf(':') >= 0` and skips with `continue` if absent. This prevents a malformed sentinel from storing `NaN` in `rctx.execLine.n`.

### 2.3 Procedure Extractor

`extractProcedures(tokens) → { topLevel: token[], newProcs: Object }`

Scans the top-level token stream for `TO…END` blocks. Each block is removed from `topLevel` and stored in `newProcs` as `{ params: string[], body: token[] }`. `LINE_SEN` sentinels are preserved inside body arrays so line tracking works correctly inside procedure calls.

The function is pure: it does not modify the global `procs` map. The RUN handler calls `Object.assign(procs, newProcs)` after parsing, making the mutation visible at the call site.

Validation errors thrown:
- `TO` with no following name token
- `TO` name token is a punctuation character or operator
- Missing `END` before end-of-token-stream

### 2.4 Expression Evaluator

`evalExpr(tokens, idx, vars, rctx, tstate, depth) → async { value, nextIdx }`

Recursive descent. Consumes one expression starting at `tokens[idx]` and returns the numeric value and the index of the first unconsumed token. Must be `async` because user-procedure primaries call `runExpr()` which may animate.

Grammar (Logo has no operator precedence — all operators are left-to-right):

```
expr    ::= primary (BINOP expr)*
primary ::= "-" expr                  (unary minus, depth-guarded to MAX_EXPR_DEPTH)
          | BINARY2_FN expr expr       (TOWARDS, DISTANCE, MOD, POWER, MAX, MIN)
          | UNARY_FN  token           (SIN :a — single resolveToken arg)
          | PROC_NAME expr*            (user proc as value, via runExpr)
          | token                     (number literal, :var, XCOR/YCOR/HEADING)
```

**Key behavioural notes:**
- Unary functions (`SIN`, `COS`, `SQRT`, `FLOOR`, `CEILING`, …) take a single token argument via `resolveToken`, not a recursive `evalExpr` call. This gives `SIN :x * 150` the expected parse: `(SIN :x) * 150`.
- User procedures in expression context use `runExpr()` (recursive, bounded by `MAX_EXPR_DEPTH=64`). `OUTPUT` in the procedure throws `{ __output__, value }` which `evalExpr` catches.
- Token sets `UNARY`, `BINARY2`, `BINOPS` are module-level `Set` objects built once at startup.
- `tstate` (optional, defaults to global `turtle`) is threaded so `TOWARDS`/`DISTANCE` in sub-expressions see the same turtle snapshot.
- `depth` (optional, defaults to 0) guards unary minus against impractically deep chains.

### 2.5 Trampoline Executor (run)

`run(tokens, startIdx, vars, rctx) → async`

Maintains an explicit frame stack. No JS call frame is consumed per Logo procedure call, removing all recursion depth limits for statement-context execution.

#### 2.5.1 Frame Shapes

| Frame type | Fields and semantics |
|---|---|
| Exec frame | `{ tokens, idx, vars, procBoundary?, outputVal? }` — Normal sequential execution. `procBoundary=true` marks a procedure entry point; STOP unwinds to here; OUTPUT stores its return value in `outputVal` then also unwinds. |
| Repeat frame | `{ isRepeat:true, body, vars, remaining }` — Pushes a fresh exec frame for body while `remaining > 0`, then pops self. |
| While frame | `{ isWhile:true, cond, body, vars }` — `cond` is a `token[]` evaluated from index 0 on every iteration via `evalExpr`. Pushes body exec frame while cond ≠ 0, then pops self. |
| For frame | `{ isFor:true, varName, end, step, body, vars, nextVal }` — `nextVal` holds the value for the next body execution. `frame.vars[varName]` is set before the body frame is pushed. FOR uses `Object.assign` (copy), not `Object.create`, so MAKE inside FOR body does not affect outer scope (documented inconsistency vs REPEAT/WHILE). |

#### 2.5.2 Flow Control

| Command | Mechanism |
|---|---|
| `STOP` | Pops frames until a `procBoundary` frame is found, then pops that frame too. |
| `OUTPUT` | Single-pass scan to find `procBoundary` frame; stores value in `outputVal`; then unwinds like STOP. Throws if no `procBoundary` found (OUTPUT outside procedure). |
| `IF` / `IFELSE` | Handled inline: evaluates condition, calls `extractBlock` for one or two bodies, conditionally pushes exec frame. |
| `REPEAT` / `WHILE` / `FOR` | Push a typed control frame. The control frame's handler at the top of the main loop pushes body exec frames per iteration. |
| User procedure (statement) | Evaluates parameter expressions in caller's scope; creates child scope via `Object.create(frame.vars)`; pushes `procBoundary` exec frame for procedure body. |
| Built-in leaf command | Dispatched via `CMD[cmd](tokens, idx, vars, rctx) → nextIdx`. Unknown command throws to halt. |

#### 2.5.3 Variable Scoping

Procedure calls (statement context) use `Object.create(parentVars)` for the local scope:
- Variable reads walk the prototype chain — the procedure inherits the caller's variables.
- `MAKE` writes create own properties at the local level only; the caller's scope is unaffected.
- Memory per frame is O(param count), not O(all visible variables).

FOR loops use `Object.assign({}, parentVars)` instead. This is a known scoping inconsistency: `MAKE` inside a FOR body does not affect outer variables, while `MAKE` inside REPEAT/WHILE does. Documented by design.

### 2.6 Expression-Context Executor (runExpr)

`runExpr(tokens, vars, depth, rctx) → async`

Lightweight recursive executor used by `evalExpr` when a user procedure appears as an expression value (e.g. `FD DOUBLE 50`). Uses throw/catch for STOP and OUTPUT instead of stack unwinding because expression-level call depth is bounded (~3–5 frames in practice). `MAX_EXPR_DEPTH=64` guards against pathological cases.

`STOP_SIGNAL = { __stop__: true }` (frozen) is thrown by STOP and propagates up through the `runExpr` call stack. OUTPUT throws `{ __output__: true, value }` which `evalExpr` catches to extract the return value.

### 2.7 Token Resolution

`resolveToken(tok, vars, tstate) → number`

| Token form | Resolution |
|---|---|
| `:name` or `"name` | Variable lookup in vars chain. Throws if undefined or non-finite (NaN, Infinity). |
| `XCOR` / `YCOR` | `tstate.x` / `tstate.y` (defaults to global turtle). |
| `HEADING` | `((tstate.angle % 360) + 360) % 360` — normalised to [0, 360). |
| Bare number string | `parseFloat`. Throws on NaN (unknown token). |

`tstate` defaults to the global turtle object. Pass a snapshot for pure / side-effect-free evaluation.

### 2.8 Error Handling

All interpreter errors are plain JavaScript `Error` objects caught by the RUN handler. The catch block appends the most recently executed source line from `rctx.execLine` to the message:

```
✘ <error message>
  line 7:  REPEAT :n [FD 100 RT 90]
```

| Condition | Behaviour |
|---|---|
| Unknown command | Throws. Halts execution. |
| Unknown variable | Throws in `resolveToken`. |
| Variable is NaN or Infinity | Throws in `resolveToken`. |
| Division by zero | Throws. |
| Math domain (SQRT, LN, ARCSIN…) | Throws with descriptive message and argument value. |
| RANDOM / RND ≤ 0 | Throws. |
| OUTPUT outside procedure | Throws. |
| FOR step = 0 | Throws (infinite loop prevention). |
| Missing `]` in block | Throws in `extractBlock`. |
| WAIT n < 0 | Throws. |
| CIRCLE radius not finite | Throws with descriptive message. |
| `:XCOR` / `:YCOR` / `:HEADING` | Throws — colon prefix is for user variables only. |
| REPEAT n < 0 | Logs error, skips. Does not halt. |
| SETCOLOR out of range | Clamps to [0, 255], logs info warning. |
| SETWIDTH out of range | Clamps to [0.5, 100], logs info warning. |
| WAIT n > 30 | Caps to 30 s, logs info warning. |
| CIRCLE r > 2000 | Caps to 2000, logs info warning. |

---

## 3. Visuals

### 3.1 Coordinate System

Logo uses a Cartesian coordinate system with the origin at the canvas centre. Y increases upward (north). Canvas pixel coordinates have origin at the top-left with Y increasing downward. The conversion is:

```
canvas_x = canvas.width  / 2 + logo_x
canvas_y = canvas.height / 2 - logo_y
```

**Heading convention (standard Logo):** Heading is measured in degrees clockwise from **north** (0° = up, 90° = right/east, 180° = down, 270° = left/west). `TOWARDS` returns an azimuth using this convention. `SETH` and `HOME` apply normalisation to [0, 360).

Motion formulae in Logo world coordinates (y increases upward):

```
dx = sin(heading_radians) × dist
dy = cos(heading_radians) × dist
```

### 3.2 Render Pipeline

`render()` composites three layers every frame via painter's algorithm (back to front):

| Layer | Source | Update frequency |
|---|---|---|
| Background | `bgCache` off-screen canvas | Rebuilt on window resize only. |
| Trail | `trailCanvas` off-screen canvas | One segment appended per move step (`paintSegment`). Fully rebuilt on resize or CS. |
| Turtle sprite | `spr` off-screen canvas | Rebuilt by `buildSprite` only when tick, moving, or penDown changes (cache guard). |

Each layer is a separate off-screen canvas composited with a single `ctx.drawImage()` call. The turtle is drawn only when `turtle.visible` is true.

### 3.3 Background

The background is a radial gradient (amber centre → brown edge) with 1 600 randomised grain dots overlaid to mimic a sandy surface. An alternative **white canvas** style with no texture is available via the CANVAS STYLE option. Grain positions are stored in absolute pixel coordinates and regenerated on every canvas resize.

| Constant | Value | Purpose |
|---|---|---|
| Grain count | 1 600 | Visual density without noticeable render cost. |
| Grain radius | 0.3 – 1.9 px | Randomised per grain. |
| Grain alpha | 0.07 – 0.35 | Randomised per grain. |
| Grain colours | `#9a6a18` / `#f2dc8a` | Two tones, 50% each at random. |

### 3.4 Trail Storage

Trail segments are stored in two pre-allocated typed arrays, never reallocated after startup:

| Array | Type | Layout | Memory at cap |
|---|---|---|---|
| `trailF32` | `Float32Array` | Segment i: [x1, y1, x2, y2, w] at offsets i×5…i×5+4 | 1 000 KB |
| `trailU8` | `Uint8Array` | Segment i: [r, g, b] at offsets i×3…i×3+2 | 150 KB |

Coordinates are stored in Logo world space (not canvas pixels). `toCanvas()` conversion is inlined in `paintSegment()` and `rebuildTrailCanvas()` with `hw`/`hh` hoisted to avoid per-segment division.

**Invariants:**
- `0 ≤ trailLen ≤ MAX_TRAIL_SEGS` always.
- `trailCapWarned` is set `true` on the first rejected segment; the cap message is not repeated thereafter.
- Both `trailLen` and `trailCapWarned` are reset on CS, CLR, and RUN (when "clear on run" is checked).
- `rebuildTrailCanvas()` batches state changes: `strokeStyle` and `lineWidth` are only written when their value changes from the previous segment. After redrawing the trail, all entries in `labelStore` are replayed via `paintLabel()`.

### 3.5 Label Store

`LABEL text` draws text at the turtle's current position onto `trailCanvas` and stores the entry in `labelStore[]` as `{ x, y, text, r, g, b }`. On resize, `rebuildTrailCanvas()` replays all labels after redrawing trail segments, preserving text across window resizes.

`labelStore` is capped at `MAX_LABELS` (500). `labelCapWarned` prevents repeated cap warnings. Both are reset by CS, CLR, and RUN.

### 3.6 Turtle Sprite

Two turtle styles are available:

**ANIMATED (default):** A procedurally generated sprite drawn into a 64×64 px off-screen canvas (`spr`). Regenerated only when its inputs change (cache guard on `tick`, `moving`, `penDown`).

Draw order (back to front, painter's algorithm):
1. Rear legs (two ellipses, opposite-phase swing from front legs)
2. Belly plate (`drawBelly` — concentric ellipses)
3. Shell (`drawShell` — radial gradient + hexagonal suture pattern)
4. Tail stub or pen indicator dot
5. Head (`drawHead` — radial gradient + two eyes with blink)

The sprite is drawn facing **east** (right). When placed on the main canvas, it is rotated by `(heading − 90)°` so that heading 0 (north) points the sprite upward.

**TRIANGLE:** A small filled green triangle drawn directly to the canvas at the turtle world position. No `SPRITE_OFFSET` — the triangle is centred at the logical position. The tip points toward the current heading. A pen-state indicator dot is drawn at the centre (red = down, brown = up).

#### 3.6.1 Animation Variables

| Variable | Formula | Purpose |
|---|---|---|
| `swing` | `sin(tick × 0.32)` | Leg displacement. 0 when not moving. |
| `headExt` | `1.5 + sin(tick × 0.32)` | Head protrudes ~1 px further while walking. |
| `blink` | `sin(tick × 0.05)` | Slow wave, period ≈125 ticks. Triggers eye close when > 0.92. |
| `eyeOpen` | `1` or `max(0.15, …)` | Vertical scale of eye ellipses. Ignored while moving. |
| `pulse` | `sin(tick × 0.18)` | Pen-dot glow radius/alpha oscillation when pen down. |

`walkTick` is a 16-bit cyclic counter (`& 0xFFFF` per step) shared between animated and instant modes.

`SPRITE_OFFSET = 18.8 px`: the animated sprite is drawn nose-forward. The logical turtle position (pen tip) is 18.8 px behind the nose along the heading direction. `spriteCenter()` computes the visual midpoint by projecting `SPRITE_OFFSET` ahead:

```js
// Logo world coords (y up):
[turtle.x + Math.sin(a) * SPRITE_OFFSET,
 turtle.y + Math.cos(a) * SPRITE_OFFSET]
```

### 3.7 Motion Rendering

#### 3.7.1 Speed Levels

Animation speed is controlled by a 5-position slider (`opt-speed`, value 0–4) resolved once at RUN time into `rctx.speed`.

| Speed | Move steps per rAF | Rotation degrees per rAF | Feel |
|---|---|---|---|
| 0 (SLOW) | 1 | 3° | Smooth step-by-step animation |
| 1 | 4 | 12° | |
| 2 | 16 | 48° | |
| 3 | 64 | 192° | |
| 4 (FAST) | instant path | instant | Former "instant mode" |

#### 3.7.2 Animated Mode (speed 0–3)

`move(dist)` splits the displacement into `Math.ceil(|dist| × 1.2)` sub-steps. The 1.2 factor gives slightly sub-pixel steps on diagonal lines, reducing staircase artefacts. One rAF is yielded every `SPF = [1,4,16,64][speed]` steps. The final step snaps to the exact destination to prevent accumulated float drift.

`rotate(deg)` splits the rotation into `Math.ceil(|deg| / DPF)` steps where `DPF = [3,12,48,192][speed]` degrees per frame. The turtle snaps to `start + deg` after the loop.

`circle(r)` approximates a circle as a regular polygon: `steps = max(36, round(r))`. Each step calls `move(chord)` then `rotate(360/steps)`. Speed is inherited from `move()` and `rotate()`.

#### 3.7.3 Instant Mode (speed = 4)

`move()` writes one segment to the typed arrays and returns without yielding a rAF. `rotate()` updates `turtle.angle` with no animation frames. Every `INSTANT_FLUSH` (150) move steps, `render()` + `setTimeout(0)` is called to paint partial progress and keep the CSS running-indicator animation alive.

---

## 4. User Interface

### 4.1 Layout

The page is a horizontal flex container split into two panels:

| Panel | ID | Width | Contents |
|---|---|---|---|
| Left panel | `#panel` | 384 px fixed | Title, code editor, splitter, console, button rows. |
| Right panel | `#canvas-panel` | `flex: 1` (fills remainder) | Main canvas, options overlay, commands overlay, examples overlay. |

The left panel is a vertical flex column. The `#split` div inside it contains the code editor (`#code-wrap`), the drag splitter (`#splitter`), the console label row, and the console (`#console`). The code editor and console share available height via a JS-managed drag splitter.

### 4.2 Code Editor

The editor is a `contenteditable` div, not a textarea. This allows inline syntax highlighting without a shadow overlay. It is managed by a self-contained IIFE that exposes a minimal public API: `{ getValue, setValue, focus, el }`.

#### 4.2.1 Syntax Highlighting

Re-applied on every keystroke (`onInput`). Process:
1. `getValue()` reads plain text by walking `childNodes` (handles `div`, `P`, `BR`, and `TEXT_NODE` models across Chrome, Edge, Safari, Firefox).
2. `getCaretOffset()` records the character offset of the caret before the rewrite.
3. `renderLines(src)` splits on `\n`; each line becomes a `<div>`. Comment text (`;` to end of line) is wrapped in `<span class="comment">`. `escHtml()` is applied to all text before insertion into `innerHTML`.
4. `setCaretOffset(offset)` restores the caret after the `innerHTML` rewrite by walking `childNodes` and counting characters, including +1 per div boundary (implicit newline).

#### 4.2.2 Tab and Paste

Tab key is trapped (`preventDefault`) and inserts two spaces via `document.execCommand("insertText")`. Paste is intercepted to strip HTML: only `text/plain` from the clipboard is passed through `execCommand`.

### 4.3 Splitter

The drag bar between the code editor and console is a 6 px div (`#splitter`). Dragging it resizes `#code-wrap` via `style.height`. The console fills the remaining space via `flex:1`.

Mouse and touch events are both handled. `applyDragGuarded()` auto-expands the console if the splitter is dragged while it is collapsed. After auto-expand it re-anchors `startY` and `startCodeH` to the current position so there is no jump.

#### 4.3.1 Console Collapse

The console is toggled by a CSS-styled checkbox (`#console-chk`). When unchecked, `collapse()` removes the console from the flex layout by setting `flex:none`, `height:0`, `minHeight:0`, and `overflow:hidden`. The code editor is simultaneously expanded to fill all available space. `expand()` reverses this, restoring the saved code height or defaulting to 50% if no height was saved.

### 4.4 Console / Log

`log(msg, cls)` appends a `<div class="cls">` to the console element. Messages are filtered by class via checkboxes in the Options panel. PRINT (class `"print"`) bypasses all filters and auto-expands the console if it is collapsed.

| Class | Colour | Filter | Contents |
|---|---|---|---|
| `op` | `#fa4` (orange) | MOTION checkbox | FD, BK, RT, LT, CIRCLE distance and angle values. |
| `info` | `#8af` (blue) | INFO checkbox | MAKE assignments, procedure definitions, SETCOLOR, SETWIDTH, HOME, SETHEADING. |
| `ok` | `#6f9` (green) | STATUS checkbox | Done, STOP confirmation. |
| `err` | `#f84` (red-orange) | ERRORS checkbox | Runtime errors. Always visible. |
| `print` | `#ff9` (yellow) | Always shown | PRINT command output. Auto-expands console. |

The console is capped at 500 lines (`MAX_LOG_LINES`). Oldest entries are removed before appending when the cap is reached.

DOM references for `logFilters`, `optSpeed`, and `consoleCchk` are all cached at module startup to avoid `getElementById` calls from hot paths.

### 4.5 Button Bar

| Button | Action |
|---|---|
| RUN (▶) | Clears console and `globalVars`. Optionally clears canvas (`opt-clear-on-run`). Clears and re-parses `procs`. Creates `rctx` from current speed slider value. Tokenises and runs editor content. Disables itself, shows pulsing state, re-enables on completion. |
| STOP (■) | Sets `activeRctx.stopped = true` (checked in `run()`/`move()` loops). Sets `isMoving = false`. Calls `render()` to update sprite. Logs "Stopped." |
| CLR | Clears trail, label store, resets turtle, clears `globalVars`, clears `procs`, clears console, renders. |
| ? COMMANDS | Opens commands reference overlay (toggles; closes other overlays). |
| ✦ EXAMPLES | Opens examples overlay (toggles; closes other overlays). |

### 4.6 Code Label Buttons

| Button | Symbol | Action |
|---|---|---|
| Beautify | `≡` | Runs `beautify(src)` on editor content; sets result if changed. Flashes green ✓ for 1.2 s. |
| Copy | `⎘` | Writes editor content to clipboard via `navigator.clipboard.writeText()`. Falls back to textarea + `execCommand("copy")` on non-HTTPS. Flashes green ✓ for 1.2 s. |

### 4.7 Overlays

Three overlays exist: commands reference (`#ref-overlay`), examples (`#ex-overlay`), and options (`#opt-overlay`). Only one can be open at a time. `openOverlay(id)` toggles the target and removes `"open"` from all others. Escape key closes all overlays.

#### 4.7.1 Commands Reference

Static HTML table listing all commands grouped by category, including a `▸ COLORS` section with colour swatches for all 16 named colours. Positioned top-right of the canvas panel.

#### 4.7.2 Examples

Built dynamically from the `EXAMPLES` array (25 entries). Each example shows title, description, and a `<pre>` code preview. Clicking loads the code into the editor and closes the overlay. `escHtml()` is applied to all example content before insertion into `innerHTML`.

#### 4.7.3 Options

Positioned top-left of canvas panel. Sections:

| Section | Controls |
|---|---|
| ▸ SAVE | `⤓ SAVE AS PNG` button — composites current canvas state and triggers browser download as `logo-drawing.png`. |
| ▸ FONT SIZE | Three pills (SMALL / MEDIUM / LARGE) that set the `--fs-base` CSS variable (1 / 1.4 / 1.8). All font sizes in CSS use `calc(Npx * var(--fs-base))`. |
| ▸ CONSOLE LOG FILTERS | Four checkboxes (MOTION, INFO, STATUS, ERRORS) corresponding to log classes `op`/`info`/`ok`/`err`. |
| ▸ BEHAVIOUR | CLEAR SCREEN ON RUN checkbox (default on); SPEED slider (0=SLOW … 4=FAST, default 0). |
| ▸ CANVAS STYLE | PARCHMENT (default, sandy texture with gradient) or WHITE (plain white background). Switching takes effect immediately. |
| ▸ TURTLE STYLE | ANIMATED (default, procedural turtle sprite) or TRIANGLE (small green triangle). Switching takes effect immediately. |

### 4.8 Beautify Function

`beautify(src)` is a pure function (string → string). It does not call `tokenize()`, `run()`, or any interpreter code. A bug in beautify can produce oddly formatted output but cannot corrupt interpreter state.

Four-pass algorithm, each pass O(n):

| Pass | Output | Purpose |
|---|---|---|
| Pass 1 | `rawLines[]  { code, comment, blank }` | Split each source line on `";"` to separate code from comment text. |
| Pass 2 | `stream[]  { tok (uppercased), li }` | Lex non-comment code into tokens tagged with source line index. |
| Pass 3 | `outLines[]  { toks[], sourceLi, depth }` | Walk stream; emit output line records. `TO`/`END` expand with indent. `[` triggers `shouldInline()` heuristic. |
| Pass 4 | `final[]  string[]` | Render outLines to strings. Interleave comment-only lines. Inject blank separators after `END` or `]` at depth 0 only. |

#### 4.8.1 Inline vs Expand Heuristic

`shouldInline(idx)` is a pure lookahead from the `[` token. Returns `true` if and only if the block contains no nested `[` AND has ≤ `INLINE_THRESHOLD` (8) non-bracket tokens. Both conditions must hold; either violation always expands.

#### 4.8.2 Blank Line Rule

A blank line is preserved in the output only when: (a) there is a source gap (`sourceLi` jumped by > 1), (b) the output is at depth 0, (c) the previous output line ends with `END` or `]`, and (d) at least one of the gap lines was actually blank in the source. Blank lines between plain statements are stripped.

### 4.9 Canvas Resize

`resizeCanvas()` is called at startup and debounced on window resize (150 ms). It reads the canvas-panel dimensions, resizes both the main canvas and off-screen canvases, and calls `buildGrains()` + `buildBgCache()` + `rebuildTrailCanvas()` + `render()`.

Guard: if the panel has not yet been laid out (`clientWidth` or `clientHeight` = 0), `resizeCanvas` returns immediately and schedules a retry via `requestAnimationFrame`.

---

## 5. Known Limitations

The following are documented design decisions or deferred features, not bugs:

| Area | Limitation |
|---|---|
| Operator precedence | Logo has no precedence levels. `2 + 3 * 4` evaluates left-to-right as 20, not 14. This is standard UCBLogo behaviour. |
| Negative literal after value | `FD 100 -10` is always parsed as `FD(100 - 10) = FD(90)`. Unary minus after a value token always fuses as binary minus. Use `MAKE :n -10 / FD :n` to avoid ambiguity. |
| FOR vs REPEAT/WHILE scoping | `MAKE` inside FOR body does not affect outer scope (Object.assign copy). `MAKE` inside REPEAT/WHILE does (shared object). Documented inconsistency. |
| Right-recursive binary chain | `a - b + c` evaluates as `a - (b + c)`. The binary chain in `evalExpr` is right-recursive by construction. |
| `REPCOUNT` | Not implemented. The current iteration index is not exposed inside REPEAT bodies. |
| `LOCAL :var` | Not implemented. There is no way to declare a variable as local without it being a procedure parameter. |
| `FILL` / `SAVE` / `LOAD` | Not implemented. |
| `document.execCommand` | Used in Tab/paste handlers and clipboard fallback. Deprecated per spec; functional in all current browsers. |

---

## 6. Extension Guide

### 6.1 Adding a New Command

All leaf commands are registered in the `CMD` dispatch table:

```js
CMD['MYCOMMAND'] = CMD['MC'] = async (t, i, v, rctx) => {
  const { value: n, nextIdx } = await evalExpr(t, i, v, rctx);
  // ... do something with n ...
  return nextIdx;
};
```

If the command has side effects on turtle state, it will be reflected on the next `render()` call (which animated motion triggers automatically). For instant-mode compatibility, avoid calling `render()` directly inside CMD handlers that don't need it — `move()` and `rotate()` handle rendering internally.

Add the command to the HTML commands reference table in the `#ref-body` div.

### 6.2 Adding a New Loop Construct

Push a typed control frame with a unique boolean discriminator:

```js
stack.push({ isMyLoop: true, body, vars: frame.vars, /* state */ });
```

Add a handler at the top of the `run()` while loop, before the exec-frame code:

```js
if (frame.isMyLoop) {
  if (/* condition */) {
    stack.push({ tokens: frame.body, idx: 0, vars: frame.vars });
  } else {
    stack.pop();
  }
  continue;
}
```

### 6.3 Adding a New Math Function

Add the function name to the `UNARY` Set and provide its implementation in `UNARY_FNS`:

```js
UNARY.add('MYFN');
UNARY_FNS['MYFN'] = a => { /* validate, compute */ };
```

Single-argument functions use `resolveToken` (not recursive `evalExpr`) for the argument. This is intentional — see Section 2.4.

For two-argument prefix functions, add to `BINARY2` and handle in the `switch` inside `evalExpr`.

### 6.4 Adding a New Canvas Style

1. Add a pill button in the `▸ CANVAS STYLE` opt-section.
2. Add a `case 'MYSTYLE':` in `drawBackground()`.
3. Wire the pill click to set `canvasStyle = 'MYSTYLE'` and call `render()`.

### 6.5 Adding a New Turtle Style

1. Add a pill button in the `▸ TURTLE STYLE` opt-section.
2. Add a `drawMyTurtle()` function (follows `drawSimpleTurtle()` pattern).
3. Add a `case 'mytyle':` in the `render()` switch.
4. Wire the pill click to set `turtleStyle = 'mystyle'` and call `render()`.

### 6.6 Splitting Into Multiple Files

The single-file structure is a delivery choice, not an architectural requirement. Natural split boundaries:

| File | Contents | DOM dependency |
|---|---|---|
| `interpreter.js` | `tokenize`, `extractBlock`, `extractProcedures`, `evalExpr`, `runExpr`, `run`, `CMD`, `resolveToken`, `globalVars`, `procs`, `makeRunContext` | None — fully testable in Node |
| `turtle.js` | `mkTurtle`, `move`, `rotate`, `circle`, turtle state globals | Depends on trail.js, render.js |
| `trail.js` | Typed arrays, `trailPush`, `paintSegment`, `rebuildTrailCanvas`, label store | Canvas only |
| `render.js` | `canvas`, `ctx`, `buildSprite`, `drawSimpleTurtle`, `render`, `buildGrains`, `buildBgCache` | Canvas + DOM |
| `editor.js` | Editor IIFE, `beautify`, `escHtml` | DOM |
| `ui.js` | Button handlers, splitter, overlays, `log`, options, resize, examples, `setRunning` | DOM |
| `style.css` | All CSS from the `<style>` block | — |
| `index.html` | Shell HTML with `<script type="module">` imports | — |

The `interpreter.js` layer having zero DOM dependencies is the most important invariant to preserve.

---

## 7. Function Signatures (Quick Reference)

```
// Interpreter entry points
run(tokens, startIdx, vars, rctx)                        → async, void
runExpr(tokens, vars, depth, rctx)                       → async, void  (throws STOP_SIGNAL / {__output__})
evalExpr(tokens, idx, vars, rctx, tstate, depth)         → async, {value, nextIdx}

// CMD handler signature (all leaf commands)
CMD['NAME'] = async (tokens, idx, vars, rctx) => nextIdx

// Turtle motion
move(dist, rctx)                                         → async, void
rotate(deg, rctx)                                        → async, void
circle(r, rctx)                                          → async, void

// Run context
makeRunContext(speed, procsMap)                           → {stopped, execLine, speed, procs, instantStepCount}

// Tokeniser / parser
tokenize(src)                                            → token[]
extractBlock(tokens, idx)                                → {body, nextIdx}
extractProcedures(tokens)                                → {topLevel, newProcs}
resolveToken(tok, vars, tstate)                          → number | null

// Rendering / trail
render()                                                 → void
trailPush(x1,y1,x2,y2,w,r,g,b)                         → void  (no cap check)
trailPushIfRoom(x1,y1,x2,y2,w,r,g,b)                   → boolean
rebuildTrailCanvas()                                     → void
paintLabel(lab)                                          → void
spriteCenter()                                           → [canvas_x, canvas_y]
toCanvas(x, y)                                           → [canvas_x, canvas_y]
```

---

## 8. Examples Catalogue

25 built-in examples covering all major language features. All verified against v4.1.

| Title | Features demonstrated |
|---|---|
| Square | REPEAT, FD, RT |
| Triangle | REPEAT, geometry (120° exterior angle) |
| Circle | CIRCLE command |
| Star | REPEAT, non-90° turns (144°) |
| Spiral | REPEAT, MAKE, variable step size |
| Spinning Squares | Nested REPEAT |
| Sunburst | REPEAT with growing variable, FD+BK |
| Random Splatter | RND, SETCOLOR, SETWIDTH, HT |
| Coloured Star | SETCOLOR, SETWIDTH |
| Growing Circles | CIRCLE, MAKE, variable radius |
| House | TO…END procedures, WALLS, ROOF |
| Flower | CIRCLE inside REPEAT |
| Rainbow Spiral | SETCOLOR with :r :g :b variables |
| Bouncing Counter | IF, IFELSE, PRINT, SETCOLOR |
| Diamond | SETPOS, PU/PD, negative variable |
| Compass Rose | SETH, MAKE, arithmetic in expressions |
| Sine Wave | SIN, SETPOS, PU/PD, FOR-like REPEAT |
| STOP in Procedure | STOP early exit, recursive procedure |
| OUTPUT — Return Values | OUTPUT/OP, SQRT, procedure composition |
| Comments | ; inline comments throughout |
| WHILE — Unwinding Spiral | WHILE, SETCOLOR with expressions |
| FOR — Starburst | FOR with explicit step 15 |
| FOR — Colour Spectrum | FOR, SETPOS, SETWIDTH, HT, vertical bars |
| Colour Wheel | Named colours, LABEL, SETHEADING, six spokes |
| Deep Recursion — Dragon Curve | TO…END, SQRT in expressions, 12 levels of recursion, trampoline stress test |
