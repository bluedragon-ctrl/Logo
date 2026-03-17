# Claude Logo — Implementation Specification
## Version 7.2 — March 2026

This document covers the internal architecture, data structures, algorithms, and extension points for developers maintaining or extending Claude Logo. Language behaviour visible to programmers is in `claude-logo-lang-spec.md`.

| Property | Value |
|---|---|
| Target environment | Any modern browser (Chrome, Firefox, Safari, Edge). No server required. |
| Delivery | Single `.html` file. All JS, CSS, and HTML inline. |
| External dependencies | Google Fonts (VT323) — purely cosmetic; degrades gracefully offline. |
| Max trail segments | 50 000 (configurable via `MAX_TRAIL_SEGS`). |
| Max recursion depth | Unlimited — trampoline executor; no JS call-stack growth per Logo procedure call. |
| Expression call depth | 64 levels (`MAX_EXPR_DEPTH`) for expression-context procedure calls. |

---

## 1. Architecture Overview

The application is one JavaScript execution context. All state is module-level. There is no framework, no module bundler, no class hierarchy. Five logical layers in declaration order:

| Layer | Responsibility |
|---|---|
| Rendering | Canvas compositing, sprite generation, background and trail painting. |
| Turtle state | Position, heading, pen, colour, width. Single mutable object reset by CS / CLR / RUN. |
| Interpreter | Tokeniser → procedure extractor → trampoline executor → expression evaluator. |
| Editor | `contenteditable` IIFE with syntax highlighting, caret preservation, tab/paste handling. |
| UI shell | Splitter, overlays, buttons, options, canvas resize, file save/load. |

**The interpreter has zero DOM dependencies.** It reads only `rctx` and the `procs` map. This invariant must be preserved for testability.

### 1.1 Data Flow (RUN)

```
editor.getValue()
  → tokenize(src)               → token[]
  → extractProcedures(tokens)   → { topLevel, newProcs }
  → makeRunContext(speed, procs) → rctx
  → run(topLevel, 0, {}, rctx)  → async, drives move() / rotate() / circle()
  → move(dist, rctx)            → trailPush() + paintSegment() + render()
```

No state is shared between runs except canvas contents (when "Clear screen on run" is unchecked).

### 1.2 File Layout

All code is in one HTML file. Sections in declaration order:

| Section | Contents |
|---|---|
| Release notes comment | One-line pointer to `CHANGELOG.md`. |
| `<style>` | All CSS. VT323 font import. Layout, overlays, animations, log colours. |
| HTML body | Panel div, canvas div, overlays, option controls. No inline scripts. |
| `<script>` — Utilities | `escHtml()`. |
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
| Control-flow sentinels | `STOP_SIGNAL`, `BREAK_SIGNAL`. |
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
| File save / load | `saveToFile`, `loadFromFile`, `defaultFileName`. |

### 1.3 Key Constants

| Constant | Value | Purpose |
|---|---|---|
| `MAX_TRAIL_SEGS` | 50 000 | Cap on drawn segments. |
| `MAX_CIRCLE_R` | 2 000 | Prevents runaway animated draws. |
| `MAX_STACK_FRAMES` | 10 000 | Stack overflow guard in `runStack` — halts deep mutual recursion before JS crashes. |
| `MAX_EXPR_DEPTH` | 64 | Expression-context recursion guard (kept for API compat; currently unused). |
| `MAX_LOG_LINES` | 500 | Console line cap. |
| `MAX_LABELS` | 500 | LABEL store cap. |
| `INSTANT_FLUSH` | 150 | Move steps between paint yields in instant mode. |
| `INLINE_THRESHOLD` | 8 | Max tokens for inline `[ block ]` in beautify. |
| `SPRITE_SIZE` | 64 px | Turtle sprite canvas dimensions. |
| `SPRITE_OFFSET` | 18.8 px | Nose-to-centre distance for animated sprite placement. |

---

## 2. Interpreter

### 2.1 RunContext (`rctx`)

`rctx` is a plain object created by `makeRunContext(speed, procs)` at the start of every RUN. It bundles all per-run mutable state — previously spread across globals and DOM reads.

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
- `rctx.speed` is fixed at run start — moving the slider mid-run has no effect on the current execution. The `SPEED n` command updates both `rctx.speed` and the slider DOM element.

### 2.2 Tokeniser

`tokenize(src) → token[]`

Processes source line by line. For each non-empty line after comment stripping:
1. Applies negative-literal preprocessing: `(whitespace/[ followed by -)(?=digit)` → replaces `-` with `~` (forming token `~100` for `-100`).
2. Prepends a `LINE_SEN` sentinel.
3. Splits the processed line with the token regex, uppercases all tokens, appends.

```
Token regex: />=|<=|!=|[\[\]+\-*\/=><]|[^\s\[\]+\-*\/=><]+/g
```

Multi-character operators (`>=`, `<=`, `!=`) are matched before single characters. The `~digits` form is matched by the last alternative and resolved to a negative number by `resolveToken`.

**LINE_SEN sentinel format:**
```
__L<lineNumber>:<original source text>
__L3:  REPEAT 4 [FD 100]
```

Sentinels are identifiable by `startsWith("__L")`. All other tokens are already uppercase. **LINE_SEN guard:** before processing a sentinel in `run()` or `runExpr()`, the code checks `indexOf(':') >= 0` and skips with `continue` if absent, preventing `NaN` from being stored in `rctx.execLine.n`.

### 2.3 Procedure Extractor

`extractProcedures(tokens) → { topLevel: token[], newProcs: Object }`

Scans the top-level token stream for `TO…END` blocks. Each block is removed from `topLevel` and stored in `newProcs` as `{ params: string[], body: token[] }`. `LINE_SEN` sentinels are preserved inside body arrays for line tracking inside procedure calls.

Pure function — does not modify the global `procs` map. The RUN handler calls `Object.assign(procs, newProcs)` after parsing, making the mutation visible at the call site.

Validation errors thrown:
- `TO` with no following name token
- `TO` name token is a punctuation character or operator
- Missing `END` before end-of-token-stream

### 2.4 Expression Evaluator

`evalExpr(tokens, idx, vars, rctx, tstate, depth) → async { value, nextIdx }`

Recursive descent. Consumes one expression starting at `tokens[idx]` and returns the numeric value and the index of the first unconsumed token. `async` because user-procedure primaries call `runExpr()` which may animate.

Grammar (no operator precedence — left-to-right):

```
expr    ::= primary (BINOP expr)*
primary ::= "-" expr                  (unary minus; depth-guarded to MAX_EXPR_DEPTH)
          | BINARY2_FN expr expr       (TOWARDS, DISTANCE, MOD, POWER, MAX, MIN)
          | UNARY_FN  token            (SIN :x — single resolveToken arg)
          | PROC_NAME expr*            (user proc as value, via runExpr)
          | token                      (number literal, :var, XCOR/YCOR/HEADING)
```

**Key design notes:**
- Unary functions (`SIN`, `COS`, `SQRT`, `FLOOR`, `CEILING`, …) take one token argument via `resolveToken`, not a recursive `evalExpr` call. This gives `SIN :x * 150` the parse `(SIN :x) * 150`.
- User procedures in expression context use `runExpr()` (recursive, bounded by `MAX_EXPR_DEPTH=64`). `OUTPUT` throws `{ __output__: true, value }` which `evalExpr` catches to extract the return value.
- `tstate` (optional, defaults to global `turtle`) is threaded so `TOWARDS`/`DISTANCE` in sub-expressions see a consistent turtle snapshot.
- `depth` (optional, defaults to 0) guards unary minus against impractically deep chains.

### 2.5 Trampoline Executor (`runStack`)

`runStack(stack, rctx) → async`

**Single shared implementation** for all Logo control-flow. Both `run()` (top-level entry) and `runExpr()` (expression-context entry) are thin wrappers that create an initial frame and call `runStack`. No JS call frame is consumed per Logo procedure call — removes all recursion depth limits for statement-context execution.

A stack overflow guard at the top of the while loop throws `"Stack overflow: Logo recursion too deep (> MAX_STACK_FRAMES frames)"` if the stack exceeds `MAX_STACK_FRAMES` (10 000) frames.

#### 2.5.1 Frame Shapes

| Frame type | Fields and semantics |
|---|---|
| Exec frame | `{ tokens, idx, vars, procBoundary?, outputVal?, stopFired? }` — Normal sequential execution. `procBoundary=true` marks a procedure entry point; STOP unwinds to here (sets `stopFired`); OUTPUT stores its return value in `outputVal` then also unwinds. |
| Repeat frame | `{ isRepeat:true, body, vars, remaining, total }` — Pushes a fresh exec frame for body while `remaining > 0`, then pops self. `total` holds the original `n` so `REPCOUNTMAX` is available as `bodyVars['REPCOUNTMAX']`. |
| While frame | `{ isWhile:true, cond, body, vars }` — `cond` is a `token[]` evaluated from index 0 each iteration via `evalExpr`. Pushes body exec frame while cond ≠ 0. |
| For frame | `{ isFor:true, varName, end, step, eps, body, vars, nextVal }` — `nextVal` holds the value for the next body execution. `eps` is an epsilon tolerance (`Math.abs(step) * 1e-9`) applied to the active check to absorb IEEE-754 drift. `frame.vars[varName]` is set before each body frame is pushed. FOR uses `Object.assign` (copy), not `Object.create`, so `MAKE` inside FOR body does not affect outer scope. |

#### 2.5.2 Flow Control

| Command | Mechanism |
|---|---|
| `STOP` | Scans from the top of the stack to find the nearest `procBoundary` frame; sets `stopFired = true` on it; truncates stack to that frame; pops the boundary frame. `runExpr` detects `stopFired` and re-throws `STOP_SIGNAL` so it propagates out of expression-context calls. |
| `OUTPUT` | Single-pass scan to find `procBoundary` frame; stores value in `outputVal`; truncates stack to that frame; pops it. `runExpr` reads `outputVal` to surface the return value to `evalExpr`. Throws if no `procBoundary` found. |
| `BREAK` | Scans from top, pops frames until a loop frame (`isRepeat`/`isWhile`/`isFor`) is found, then pops it. Throws `"BREAK used outside a loop"` if a `procBoundary` is encountered first. |
| `CONTINUE` | Scans from top to find the nearest loop frame; discards all exec frames above it; does NOT pop the loop frame — control returns to its top-of-loop handler on the next iteration. Throws `"CONTINUE used outside a loop"` if a `procBoundary` is encountered first. |
| `IF` / `IFELSE` | Handled inline: evaluates condition, calls `extractBlock`, conditionally pushes exec frame. |
| `REPEAT` / `WHILE` / `FOR` | Push a typed control frame. The control frame handler at the top of the main loop pushes body exec frames per iteration. |
| User procedure (statement) | Evaluates parameter expressions in caller's scope; creates child scope via `Object.create(frame.vars)`; pushes `procBoundary` exec frame for procedure body. |
| Leaf command | Dispatched via `CMD[cmd](tokens, idx, vars, rctx) → nextIdx`. Unknown command throws to halt. |

#### 2.5.3 Variable Scoping

Procedure calls use `Object.create(parentVars)` for the local scope:
- Variable reads walk the prototype chain — the procedure sees the caller's variables.
- `MAKE` writes create own properties at the local level; the caller's scope is unaffected.
- Memory per frame is O(param count), not O(all visible variables).

FOR loops use `Object.assign({}, parentVars)` — a flat copy. `MAKE` inside a FOR body does not propagate out. This is a known, intentional inconsistency with REPEAT/WHILE.

### 2.6 Expression-Context Executor (`runExpr`)

`runExpr(tokens, vars, depth, rctx) → async`

**Thin wrapper over `runStack`.** Creates a boundary exec frame (`{ procBoundary: true, tokens, idx: 0, vars }`) and calls `runStack([boundary], rctx)`. After `runStack` returns, `runExpr` inspects the boundary frame:
- If `stopFired` is set, re-throws `STOP_SIGNAL` so it propagates to the caller.
- If `outputVal` is set, stores it as the return value (surface via `evalExpr` catch).

All loop constructs (`REPEAT`, `FOR`, `WHILE`), BREAK, CONTINUE, STOP, and OUTPUT are handled identically in `runStack` — there is no duplicated logic.

`MAX_EXPR_DEPTH=64` limits how deeply `evalExpr` may recurse when calling `runExpr` for user procedures appearing as expression values (`FD DOUBLE 50`).

### 2.7 Token Resolution

`resolveToken(tok, vars, tstate) → number`

| Token form | Resolution |
|---|---|
| `:name` or `"name` | Variable lookup in the `vars` prototype chain. Throws if undefined or non-finite (NaN, Infinity). |
| `XCOR` / `YCOR` | `tstate.x` / `tstate.y` (defaults to global `turtle`). |
| `HEADING` | `((tstate.angle % 360) + 360) % 360` — normalised to [0, 360). |
| `PENDOWN?` / `PD?` | `turtle.pen ? 1 : 0`. |
| `PENUP?` / `PU?` | `turtle.pen ? 0 : 1`. |
| `SCRWIDTH` | `canvas.width` — full canvas width in Logo pixel units. |
| `SCRHEIGHT` | `canvas.height` — full canvas height in Logo pixel units. |
| `REPCOUNT` | Reads `vars['REPCOUNT']`. Throws `"REPCOUNT used outside a REPEAT loop"` if absent. |
| `REPCOUNTMAX` | Reads `vars['REPCOUNTMAX']`. Throws `"REPCOUNTMAX used outside a REPEAT loop"` if absent. Both are injected into the body scope by the repeat frame handler before each iteration. |
| `~digits` | `-digits` — negative literal form produced by the tokeniser preprocessor. |
| Bare number string | `parseFloat`. Throws on NaN (unknown token). |

`tstate` defaults to the global turtle object. Pass a snapshot for pure evaluation.

**Note:** The query tokens listed above (`XCOR`, `YCOR`, `HEADING`, `PENDOWN?`, `PU?`, `SCRWIDTH`, `SCRHEIGHT`, `REPCOUNT`, `REPCOUNTMAX`) are each handled by an explicit `if` branch inside `resolveToken`. A future `QUERY_TOKENS` map would centralise these, making new query tokens a one-line addition.

### 2.8 Control-Flow Sentinels

One frozen sentinel object is used for non-local exits from `runExpr`:

| Sentinel | Object | Thrown by | Caught by |
|---|---|---|---|
| `STOP_SIGNAL` | `{ __stop__: true }` | `runExpr` (when it detects `boundary.stopFired` after `runStack` returns) | RUN button handler; `evalExpr` proc-call sites re-throw it upward |

`BREAK` and `CONTINUE` are handled entirely within `runStack`'s stack-scan mechanism and never produce a thrown sentinel. `OUTPUT` delivers its value via `boundary.outputVal` on the boundary exec frame rather than by throwing.

`STOP_SIGNAL` is `Object.freeze`'d to prevent accidental mutation.

### 2.9 Command Dispatch Table

All leaf commands are registered in the `CMD` object. Signature:

```js
CMD['MYCOMMAND'] = CMD['MC'] = async (tokens, idx, vars, rctx) => nextIdx;
```

`tokens[idx]` is the first token after the command name. The handler calls `evalExpr` (or `resolveToken` for single-token args) to consume arguments and returns the index of the first unconsumed token.

**Adding a command:**
1. Register in `CMD` with all aliases.
2. Call `evalExpr` for each argument (or `resolveToken` for single-token). Pass `rctx` through.
3. Add input validation and clamping consistent with the error taxonomy in the language spec.
4. Add the command to the `#ref-body` HTML commands table.
5. Add an example to `EXAMPLES` if it demonstrates something not already covered.

### 2.10 Error Handling

All interpreter errors are plain JavaScript `Error` objects caught by the RUN button handler. The catch block appends the source line from `rctx.execLine`:

```
✘ Division by zero
  line 7:  MAKE :r :x / :y
```

The error taxonomy (throw vs. warn+clamp) is documented in the language spec Section 8.

---

## 3. Visuals

### 3.1 Coordinate System

Logo uses a Cartesian system with origin at canvas centre. Y increases upward. Canvas pixels have origin top-left, Y increases downward. Conversion:

```
canvas_x = canvas.width  / 2 + logo_x
canvas_y = canvas.height / 2 - logo_y
```

Motion formulae (Logo world coords, y up):

```
dx = sin(heading_radians) × dist
dy = cos(heading_radians) × dist
```

`TOWARDS` uses `atan2(dx, dy)` (north=0 azimuth convention).

### 3.2 Render Pipeline

`render()` composites three layers per frame via painter's algorithm (back to front):

| Layer | Source | Update frequency |
|---|---|---|
| Background | `bgCache` off-screen canvas | Rebuilt on window resize only. |
| Trail | `trailCanvas` off-screen canvas | One segment appended per move step (`paintSegment`). Fully rebuilt on resize or CS. |
| Turtle sprite | `spr` off-screen canvas | Rebuilt by `buildSprite` only when `tick`, `moving`, or `penDown` changes (cache guard). |

Each layer is a separate off-screen canvas composited with a single `ctx.drawImage()` call. The turtle is drawn only when `turtle.visible` is true.

### 3.3 Background

Radial gradient (amber centre → brown edge) with 1 600 randomised grain dots to mimic a sandy surface. An alternative **white** canvas style is available via OPTIONS → CANVAS STYLE. Grain positions are in absolute pixel coordinates and regenerated on every resize.

| Constant | Value | Purpose |
|---|---|---|
| Grain count | 1 600 | Visual density without noticeable render cost. |
| Grain radius | 0.3 – 1.9 px | Randomised per grain. |
| Grain alpha | 0.07 – 0.35 | Randomised per grain. |
| Grain colours | `#9a6a18` / `#f2dc8a` | Two tones, 50% each at random. |

### 3.4 Trail Storage

Two pre-allocated typed arrays, never reallocated after startup:

| Array | Type | Layout | Memory at cap |
|---|---|---|---|
| `trailF32` | `Float32Array` | Segment i: [x1, y1, x2, y2, w] at i×5…i×5+4 | ~1 000 KB |
| `trailU8` | `Uint8Array` | Segment i: [r, g, b] at i×3…i×3+2 | ~150 KB |

Coordinates stored in Logo world space. `toCanvas()` conversion is inlined in `paintSegment()` and `rebuildTrailCanvas()` with `hw`/`hh` hoisted outside loops.

**Invariants:**
- `0 ≤ trailLen ≤ MAX_TRAIL_SEGS` always.
- `trailCapWarned` set `true` on first rejected segment; cap message not repeated.
- Both reset on CS, CLR, and RUN (when "clear on run" is checked).
- `rebuildTrailCanvas()` batches state changes: `strokeStyle` and `lineWidth` are only written when their value changes from the previous segment. After redrawing the trail, all `labelStore` entries are replayed via `paintLabel()`.

### 3.5 Label Store

`LABEL text` draws text at the turtle's current position onto `trailCanvas` and stores the entry in `labelStore[]` as `{ x, y, text, r, g, b }`. On resize, `rebuildTrailCanvas()` replays all labels after redrawing trail segments.

`labelStore` is capped at `MAX_LABELS` (500). Both `labelStore` and `labelCapWarned` are reset by CS, CLR, and RUN.

### 3.6 Turtle Sprite

Two styles selectable via OPTIONS → TURTLE STYLE:

**ANIMATED (default):** Procedurally generated sprite drawn into a 64×64 px off-screen canvas (`spr`). Regenerated only when `tick`, `moving`, or `penDown` changes (cache guard).

Draw order (back to front):
1. Rear legs (two ellipses, opposite-phase swing from front legs)
2. Belly plate (`drawBelly` — concentric ellipses)
3. Shell (`drawShell` — radial gradient + hexagonal suture pattern)
4. Tail stub or pen-down indicator dot
5. Head (`drawHead` — radial gradient + two eyes with blink)

The sprite is drawn facing **east**. On the main canvas it is rotated by `(heading − 90)°` so heading 0 (north) points it upward.

**TRIANGLE:** Small filled green triangle drawn directly to the canvas at the turtle's position. No `SPRITE_OFFSET`. Tip points toward current heading. Pen-state indicator dot at centre (red = down, brown = up).

#### 3.6.1 Animation Variables

| Variable | Formula | Purpose |
|---|---|---|
| `swing` | `sin(tick × 0.32)` | Leg displacement. 0 when not moving. |
| `headExt` | `1.5 + sin(tick × 0.32)` | Head protrudes ~1 px further while walking. |
| `blink` | `sin(tick × 0.05)` | Period ≈125 ticks. Triggers eye close when > 0.92. |
| `eyeOpen` | `1` or `max(0.15, …)` | Vertical scale of eye ellipses. Ignored while moving. |
| `pulse` | `sin(tick × 0.18)` | Pen-dot glow oscillation when pen is down. |

`walkTick` is a 16-bit cyclic counter (`& 0xFFFF` per step) shared between animated and instant modes.

`SPRITE_OFFSET = 18.8 px`: the logical turtle position (pen tip) is 18.8 px behind the nose along the heading direction. `spriteCenter()` computes the visual midpoint:

```js
[turtle.x + Math.sin(a) * SPRITE_OFFSET,
 turtle.y + Math.cos(a) * SPRITE_OFFSET]
```

### 3.7 Motion Rendering

#### 3.7.1 Speed Levels

`rctx.speed` resolved once from `opt-speed` slider value (0–4) at RUN start.

| Speed | Move steps per rAF | Rotation degrees per rAF | Feel |
|---|---|---|---|
| 0 (SLOW) | 1 | 3° | Smooth step-by-step |
| 1 | 4 | 12° | |
| 2 | 16 | 48° | |
| 3 | 64 | 192° | |
| 4 (FAST) | instant path | instant | Former "instant mode" |

The `SPEED n` command updates both `rctx.speed` (effective immediately) and the `opt-speed` DOM element (so the next run starts at the same speed).

#### 3.7.2 Animated Mode (speed 0–3)

`move(dist, rctx)` splits the displacement into `Math.ceil(|dist| × 1.2)` sub-steps. The 1.2 factor gives slightly sub-pixel steps, reducing staircase artefacts on diagonals. One rAF is yielded every `SPF = [1,4,16,64][speed]` steps. The final step snaps to the exact destination to prevent accumulated float drift.

`rotate(deg, rctx)` splits into `Math.ceil(|deg| / DPF)` steps where `DPF = [3,12,48,192][speed]`. Snaps to `start + deg` after the loop.

`circle(r, rctx)` approximates a circle as a regular polygon: `steps = max(36, round(r))`. Each step calls `move(chord)` then `rotate(360/steps)`.

#### 3.7.3 Instant Mode (speed = 4)

`move()` writes one segment to the typed arrays and returns without yielding a rAF. `rotate()` updates `turtle.angle` directly. Every `INSTANT_FLUSH` (150) move steps, `render()` + `setTimeout(0)` is called to paint partial progress and keep the CSS run-indicator animation alive.

---

## 4. User Interface

### 4.1 Layout

Horizontal flex container split into two panels:

| Panel | ID | Width | Contents |
|---|---|---|---|
| Left panel | `#panel` | 384 px fixed | Title, code editor, splitter, console, button rows. |
| Right panel | `#canvas-panel` | `flex: 1` | Main canvas, options overlay, commands overlay, examples overlay. |

The left panel is a vertical flex column. `#split` contains the code editor (`#code-wrap`), the drag splitter (`#splitter`), the console label row, and the console (`#console`). Code editor and console share available height via a JS-managed drag splitter.

### 4.2 Code Editor

`contenteditable` div managed by a self-contained IIFE. Public API: `{ getValue, setValue, focus }`.

#### 4.2.1 getValue()

Walks `el.childNodes`. Handles `DIV`, `P`, `BR`, and `TEXT_NODE` models across Chrome/Edge/Safari/Firefox. After joining lines with `\n`, trailing empty lines are stripped — this prevents the browser's guard `<div><br></div>` from producing a spurious trailing `\n` in every `getValue()` call.

#### 4.2.2 Syntax Highlighting

Re-applied on every keystroke (`onInput`):
1. `getValue()` reads plain text.
2. `getCaretOffset()` records caret character offset (div-by-div, +1 per div boundary).
3. `renderLines(src)` splits on `\n`. Each line becomes a `<div>`. Comment text is `<span class="comment">`. `escHtml()` applied to all text.
4. `setCaretOffset(offset)` restores caret by reversing the div-walk.

Caret preservation: `getCaretOffset` measures within each div separately to avoid the inter-div newline ambiguity that plagued earlier range-based approaches.

#### 4.2.3 Tab and Paste

Tab key is trapped (`preventDefault`) and inserts two spaces via `document.execCommand("insertText")`. Paste is intercepted to strip HTML: only `text/plain` from the clipboard is passed through.

### 4.3 Splitter

6 px drag bar (`#splitter`) between code editor and console. Resizes `#code-wrap` via `style.height`. Mouse and touch events both handled.

`applyDragGuarded()` auto-expands the console if dragged while collapsed — re-anchors `startY` and `startCodeH` after auto-expand to prevent a jump.

#### 4.3.1 Console Collapse

Toggled by a CSS-styled checkbox (`#console-chk`). `collapse()` removes the console from flex layout: sets `flex:none`, `height:0`, `minHeight:0`, `overflow:hidden`; expands the code editor to fill all space. `expand()` reverses this, restoring the saved code height or defaulting to 50%.

### 4.4 Console / Log

`log(msg, cls)` appends a `<div class="cls">` to `#console`. Filtered by class via OPTIONS checkboxes. PRINT (class `"print"`) bypasses all filters and auto-expands the console if hidden.

| Class | Colour | Filter | Contents |
|---|---|---|---|
| `op` | `#fa4` (orange) | MOTION | FD, BK, RT, LT, CIRCLE values. |
| `info` | `#8af` (blue) | INFO | MAKE, procedure definitions, SETCOLOR, SETWIDTH, HOME, SETHEADING. |
| `ok` | `#6f9` (green) | STATUS | Done, Stopped. |
| `err` | `#f84` (red-orange) | ERRORS | Runtime errors. Always visible. |
| `print` | `#ff9` (yellow) | Always shown | PRINT output. Auto-expands console. |

Capped at 500 lines (`MAX_LOG_LINES`). Oldest entries removed before appending when cap is reached. DOM references for `logFilters`, `optSpeed`, and `consoleChk` are cached at startup.

### 4.5 Button Bar

| Button | Action |
|---|---|
| RUN (▶) | Clears console, `globalVars`. Optionally clears canvas (`opt-clear-on-run`). Clears and re-parses `procs`. Creates `rctx`. Tokenises and runs editor content. Disables itself, shows pulsing state, re-enables on completion. |
| STOP (■) | Sets `activeRctx.stopped = true`. Sets `isMoving = false`. Calls `render()`. Logs "■ Stopped." |
| CLR | Clears trail, label store, resets turtle, clears `globalVars`, clears `procs`, clears console, renders. |
| ? COMMANDS | Opens commands reference overlay. |
| ✦ EXAMPLES | Opens examples overlay. |

### 4.6 Code Label Buttons

| Button | Symbol | Action |
|---|---|---|
| Beautify | `≡` | Runs `beautify(src)` on editor content; sets result if changed. Flashes green ✓ for 1.2 s. |
| Copy | `⎘` | Writes editor content to clipboard via `navigator.clipboard.writeText()`. Falls back to textarea + `execCommand("copy")` on non-HTTPS. |
| LOG | `LOG` | Toggles console visibility. |
| SAVE | `SAVE` | Saves editor content to a `.logo` file. Uses File System Access API (Chrome/Edge) with `<a download>` fallback. |
| LOAD | `LOAD` | Opens a `.logo` or `.txt` file into the editor. Uses `<input type="file">`. |
| ⚙ | `⚙` | Toggles OPTIONS overlay. |

### 4.7 Overlays

Three overlays: commands reference (`#ref-overlay`), examples (`#ex-overlay`), options (`#opt-overlay`). Only one open at a time. `openOverlay(id)` toggles the target and closes others. Escape key closes all.

#### 4.7.1 Commands Reference

Static HTML table of all commands grouped by category, including a `▸ COLORS` section with colour swatches for all 16 named colours. Positioned top-right of the canvas panel.

#### 4.7.2 Examples

Built dynamically from the `EXAMPLES` array (28 entries). Each entry shows title, description, and a `<pre>` code preview. Clicking loads the code into the editor and closes the overlay. `escHtml()` applied to all example content.

#### 4.7.3 Options

| Section | Controls |
|---|---|
| ▸ FONT SIZE | Three pills (SMALL / MEDIUM / LARGE) setting `--fs-base` CSS variable (1 / 1.4 / 1.8). All font sizes use `calc(Npx * var(--fs-base))`. |
| ▸ CONSOLE LOG FILTERS | Four checkboxes: MOTION, INFO, STATUS, ERRORS (classes `op`/`info`/`ok`/`err`). Off by default for MOTION and INFO; on for STATUS and ERRORS. |
| ▸ BEHAVIOUR | CLEAR SCREEN ON RUN checkbox (default on); SPEED slider (0=SLOW … 4=FAST, default 0). |
| ▸ CANVAS STYLE | PARCHMENT (default) or WHITE. Switching calls `buildBgCache()` + `render()` immediately. |
| ▸ TURTLE STYLE | ANIMATED (default) or TRIANGLE. Switching calls `render()` immediately. |

### 4.8 Beautify Function

`beautify(src)` is a **pure function** (string → string). It does not call `tokenize()`, `run()`, or any interpreter code. A bug here can produce oddly formatted output but cannot corrupt interpreter state.

**Idempotency invariant:** `beautify(beautify(src)) === beautify(src)` for all valid input.

Four-pass algorithm, each O(n):

| Pass | Output | Purpose |
|---|---|---|
| 1 | `rawLines[] { code, comment, blank }` | Split each source line on `";"` to separate code from comment. |
| 2 | `stream[] { tok (uppercased), li }` | Preprocess negative literals (`-digit` → `~digit`), lex tokens with the same regex as the interpreter, tag with source line index. |
| 3 | `outLines[] { toks[], sourceLi, depth }` | Walk stream; emit output line records. `TO`/`END` expand with indent. `[` triggers `shouldInline()` heuristic. |
| 4 | `final[] string[]` | Render `outLines` to strings, converting `~digits` tokens back to `-digits`. Interleave comment-only lines. Inject blank separators after `END` or `]` at depth 0 only. |

**Inline heuristic (`shouldInline`):** A block stays inline if it contains no nested `[` AND has ≤ `INLINE_THRESHOLD` (8) non-bracket tokens. Both conditions required.

**Blank line rule:** A blank line is preserved only when: (a) source line index jumped by > 1, (b) output is at depth 0, (c) the previous output line ends with `END` or `]`, and (d) at least one of the gap lines was actually blank in the source.

**Negative literal round-trip:** Pass 2 mirrors the interpreter's preprocessing so `-100` is kept as a single token (not split into `-` + `100`). Pass 4 converts `~100` back to `-100` for output, ensuring `SETPOS 0 -100` is preserved correctly.

### 4.9 Canvas Resize

`resizeCanvas()` called at startup and debounced on window resize (150 ms). Reads canvas-panel dimensions, resizes main canvas and off-screen canvases, calls `buildGrains()` + `buildBgCache()` + `rebuildTrailCanvas()` + `render()`.

Guard: if the panel has not yet been laid out (`clientWidth` or `clientHeight` = 0), returns immediately and retries via `requestAnimationFrame`.

---

## 5. Function Signatures (Quick Reference)

```
// Interpreter entry points
run(tokens, startIdx, vars, rctx)                        → async, void
runExpr(tokens, vars, depth, rctx)                       → async, void  (throws STOP_SIGNAL / BREAK_SIGNAL / {__output__})
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
resolveToken(tok, vars, tstate)                          → number

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

## 6. Extension Guide

### 6.1 Adding a New Leaf Command

```js
CMD['MYCOMMAND'] = CMD['MC'] = async (t, i, v, rctx) => {
  const { value: n, nextIdx } = await evalExpr(t, i, v, rctx);
  // ... do something with n ...
  return nextIdx;
};
```

- For instant-mode compatibility, do not call `render()` directly inside CMD handlers that don't need it — `move()` and `rotate()` handle rendering internally.
- Add all aliases: `CMD['MC'] = CMD['MYCOMMAND']`.
- Add to the `#ref-body` HTML commands table.

### 6.2 Adding a New Loop Construct

Push a typed control frame with a unique boolean discriminator:

```js
stack.push({ isMyLoop: true, body, vars: frame.vars, /* state */ });
```

Add a handler at the top of the `runStack()` while loop, before the exec-frame code:

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

If the loop should be breakable with `BREAK` or `CONTINUE`, handle `isMyLoop` in the respective stack-scan sections alongside `isRepeat`/`isWhile`/`isFor`.

Because `runStack` is the single shared trampoline, **no duplicate implementation in `runExpr` is needed** — the change applies to both top-level and expression-context execution automatically.

### 6.3 Adding a New Math Function

**Single-argument (unary):**

```js
UNARY.add('MYFN');
UNARY_FNS['MYFN'] = a => { /* validate, compute */ };
```

The argument arrives via `resolveToken` (not recursive `evalExpr`). This is intentional — see Section 2.4.

**Two-argument prefix:**

Add to `BINARY2` Set and handle in the `switch` inside `evalExpr`.

### 6.4 Adding a New Canvas Style

1. Add a pill button in the `▸ CANVAS STYLE` opt-section.
2. Add a `case 'MYSTYLE':` in `drawBackground()`.
3. Wire the pill click to set `canvasStyle = 'MYSTYLE'` and call `buildBgCache()` + `render()`.

### 6.5 Adding a New Turtle Style

1. Add a pill button in the `▸ TURTLE STYLE` opt-section.
2. Add a `drawMyTurtle()` function following the `drawSimpleTurtle()` pattern.
3. Add a `case 'mystyle':` in the `render()` switch.
4. Wire the pill click to set `turtleStyle = 'mystyle'` and call `render()`.

### 6.6 Splitting Into Multiple Files

The single-file structure is a delivery choice. Natural split boundaries:

| File | Contents | DOM dependency |
|---|---|---|
| `interpreter.js` | `tokenize`, `extractBlock`, `extractProcedures`, `evalExpr`, `runExpr`, `run`, `CMD`, `resolveToken`, `globalVars`, `procs`, `makeRunContext` | **None** — fully testable in Node |
| `turtle.js` | `mkTurtle`, `move`, `rotate`, `circle`, turtle state globals | Depends on trail.js, render.js |
| `trail.js` | Typed arrays, `trailPush`, `paintSegment`, `rebuildTrailCanvas`, label store | Canvas only |
| `render.js` | `canvas`, `ctx`, `buildSprite`, `drawSimpleTurtle`, `render`, `buildGrains`, `buildBgCache` | Canvas + DOM |
| `editor.js` | Editor IIFE, `beautify`, `escHtml` | DOM |
| `ui.js` | Button handlers, splitter, overlays, `log`, options, resize, examples, `setRunning`, file save/load | DOM |
| `style.css` | All CSS from `<style>` block | — |
| `index.html` | Shell HTML with `<script type="module">` imports | — |

The `interpreter.js` layer having zero DOM dependencies is the most important invariant to preserve.
