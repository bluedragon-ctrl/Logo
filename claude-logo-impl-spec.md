# Claude Logo — Implementation Specification
## Version 8.0 — November 2026

This document covers the internal architecture, data structures, algorithms, and extension points for developers maintaining or extending Claude Logo. Language behaviour visible to programmers is in `claude-logo-lang-spec.md`.

| Property | Value |
|---|---|
| Target environment | Any modern browser (Chrome, Firefox, Safari, Edge). No server required. |
| Delivery | Single `.html` file. All JS, CSS, and HTML inline. No build step. |
| External dependencies | Google Fonts (VT323) — cosmetic; degrades gracefully offline. |
| Max trail segments | 50 000 (`MAX_TRAIL_SEGS`). An animated move stores one segment. |
| Procedure recursion | Tail calls unbounded; other statement-level recursion ≤ 10 000 frames (`MAX_STACK_FRAMES`). |
| Expression nesting | ≤ 500 levels (`MAX_EXPR_DEPTH`): parentheses, unary chains and procedures used as values. |
| Tests | `node tests/run-examples.js` — headless Chromium via Playwright (dev tooling only). |

---

## 1. Architecture Overview

The application is one JavaScript execution context. All state is module-level. There is no framework, no bundler, no class hierarchy. Five logical layers in declaration order:

| Layer | Responsibility |
|---|---|
| Rendering | Canvas compositing (HiDPI), sprite generation, background and trail painting. |
| Turtle state | Position, heading, pen, colour, width. Single mutable object reset by CS / CLR / RUN. |
| Interpreter | Tokeniser → procedure extractor → trampoline executor ⇄ expression evaluator → motion. |
| Editor | `contenteditable` IIFE: syntax highlighting, caret preservation, own undo/redo, tab/paste. |
| UI shell | `runProgram`, buttons, direct mode, splitter, overlays, options, resize, file save/load. |

**DOM coupling of the interpreter (honest statement).** The interpreter core — `tokenize`, `extractBlock`, `extractProcedures`, the expression parser, `runStack` — reads only its arguments, `rctx` and the `procs` map. The leaf layer is not DOM-free: CMD handlers and `move`/`rotate` call `log()`, `render()` and paint onto `trailCanvas`; `SCRWIDTH`/`SCRHEIGHT` read `CW`/`CH`; `SPEED` writes the slider (guarded by `typeof optSpeed`); `CT` clears `#console`. Keep new code in the core DOM-free; route side effects through these few functions so a future split (§6.6) only needs to inject them (e.g. `rctx.io = { log, render }`).

### 1.1 Data Flow (RUN)

```
btn-run → parseProgram(editor.getValue())
            → tokenize(src)               → token[]  (with LINE_SEN line sentinels)
            → extractProcedures(tokens)   → { topLevel, newProcs }
        → registerProcs(newProcs)         → procs
        → runProgram(topLevel)
            → makeRunContext(speed, procs) → rctx ; activeRctx = rctx
            → run(topLevel, 0, globalVars, rctx)
                → runStack(stack, rctx)    → CMD handlers / control flow
                    → evalExpr(...)        → parseBinary / parseUnary / parsePrimary
                    → move / rotate / circle → paintLine / trailPush… / render()
            → finally: activeRctx = null, setRunning(false), rctx.onFinish?.()
```

Direct mode (`runDirectCommand`) uses the same `parseProgram` / `registerProcs` / `runProgram`, keeps `globalVars` between commands, and refuses to start while a program runs.

### 1.2 File Layout

Sections in declaration order (grep `// ──` to jump):

| Section | Contents |
|---|---|
| Release notes comment | One-line pointer to `CHANGELOG.md`. |
| `<style>` | All CSS. VT323 import. Layout, overlays, animations, log colours. |
| HTML body | Left panel, canvas panel, overlays, commands reference (`#ref-body`), option controls. |
| Utilities | `escHtml()`. |
| Canvas setup | `canvas`, `ctx`, `con`, `CW`/`CH`/`DPR`, `SPRITE_SIZE`, `SPRITE_OFFSET`. |
| Sprite palette / helpers | Colour constants, `drawShell`, `drawLeg`, `drawHead`, `drawBelly`, `buildSprite`. |
| Background | `buildGrains`, `buildBgCache`, `drawBackground`, `canvasStyle`, `turtleStyle`. |
| Trail storage | Typed arrays, `paintLine`, `paintSegment`, `trailPush`, `trailPushIfRoom`, `trailPushQuiet`, `clearScreen`. |
| Label store | `labelStore`, `MAX_LABELS`, `paintLabel`, `rebuildTrailCanvas`. |
| Render pipeline | `toCanvas`, `spriteCenter`, `drawSimpleTurtle`, `render`. |
| Turtle state | `mkTurtle`, `turtle`, `walkTick`, `isMoving`. |
| Run context | `makeRunContext`, `activeRctx`, `haltRun`. |
| Direct mode state / Run-state indicator / Console | `directHistory`, `setRunning`, `INSTANT_FLUSH`, `log`, `MAX_LOG_LINES`, `optSpeed`. |
| INTERPRETER | Header comment, scope helpers (`setVar`, `procScopeOf`, `repeatInfo`, `varName`), `formatNum`. |
| Token resolution | `QUERY_TOKENS`, `resolveToken`. |
| Expression evaluator | `UNARY`, `BINARY2`, `BINOP_PREC`, `UNARY_FNS`, `BINARY2_FNS`, `applyBinop`, `evalExpr`, `parseBinary`, `parseUnary`, `parsePrimary`, `skipSen`, `noteLine`, `deeper`. |
| Tokeniser / Block extractor / Procedure store | `LINE_SEN`, `tokenize`, `extractBlock`, `procs`, `CONTROL_WORDS`, `extractProcedures`. |
| Control-flow sentinels / Responsiveness | `STOP_SIGNAL`, `MAX_STACK_FRAMES`, `nextFrame`, `macroYield`, `sleep`, `tick`, `STEPS_PER_FRAME`. |
| Command dispatch table | `CMD` + all leaf handlers, `COLOR_NAMES`, `wordArg`, `isValueStart`. |
| runExpr / runStack / run | Executors. |
| Motion | `clipToCanvas`, `ouch`, `move`, `rotate`, `circle`, `MAX_CIRCLE_R`. |
| Examples | `EXAMPLES` (31 entries), `buildExamples`. |
| Code editor | Editor IIFE. |
| Splitter | Drag / touch / LOG toggle IIFE. |
| beautify(src) | Pure formatter + `INLINE_THRESHOLD`. |
| Copy / Beautify buttons | |
| Program execution | `registerProcs`, `parseProgram`, `runProgram`. |
| Direct mode execution / Button handlers | `runDirectCommand`, RUN / STOP / CLR (`resetAll`). |
| Direct mode UI / Overlays / File save-load / Options / Canvas resize | |

### 1.3 Key Constants

| Constant | Value | Purpose |
|---|---|---|
| `MAX_TRAIL_SEGS` | 50 000 | Cap on stored segments. |
| `MAX_LABELS` | 500 | LABEL store cap. |
| `MAX_CIRCLE_R` | 2 000 | Caps \|r\| to prevent runaway animated draws. |
| `MAX_STACK_FRAMES` | 10 000 | `runStack` frame stack cap (non-tail recursion). |
| `MAX_EXPR_DEPTH` | 500 | Expression nesting cap (protects the JS call stack). |
| `MAX_LOG_LINES` | 500 | Console line cap. |
| `INSTANT_FLUSH` | 150 | Instant-mode steps between paint yields. |
| `STEPS_PER_FRAME` | [1, 4, 16, 64] | Move sub-steps / instant commands per frame, by speed 0–3. |
| `INLINE_THRESHOLD` | 8 | Max tokens for inline `[ block ]` in beautify. |
| `SPRITE_SIZE` / `SPRITE_OFFSET` | 64 px / 18.8 px | Turtle sprite canvas size / nose-to-centre distance. |

---

## 2. Interpreter

### 2.1 RunContext (`rctx`)

Created by `makeRunContext(speed, procsMap)` for every RUN / direct command.

| Field | Purpose |
|---|---|
| `stopped` | Kill switch. Set by `haltRun()` (STOP / CLR). Checked by `runStack`, `move`, `rotate`, `circle`. |
| `execLine` | `{ n, text }` of the current source line, from LINE_SEN sentinels. Appended to error messages. |
| `speed` | 0–4. Snapshot of the slider; `SPEED n` changes it mid-run (and moves the slider). |
| `procs` | The live procedure map. |
| `globals` | Root scope of this run (set by `run()`); `MAKE` falls back to it. |
| `exprDepth` | Current expression nesting; checked by `deeper()` against `MAX_EXPR_DEPTH`. |
| `instantStepCount`, `tickCount`, `steps`, `lastYield` | Yield bookkeeping (§2.9). |
| `wake` | Set while `WAIT` sleeps; `haltRun()` calls it to end the sleep at once. |
| `onFinish` | Optional callback run by `runProgram` after full unwind (CLR uses it). |

**Invariants:** every interpreter function receives `rctx` and never reads `stopped`/`speed` from globals or the DOM. `activeRctx` points to the live context while a program runs and is reset to `null` in `runProgram`'s `finally`. Only one program runs at a time (RUN button disabled; direct mode refuses while `activeRctx` is set).

### 2.2 Tokeniser

`tokenize(src) → token[]`. Per source line: strip `;` comments, mark negative signs, split with

```
/>=|<=|!=|[\[\]()+\-*\/=><~]|[^\s\[\]()+\-*\/=><~]+/g
```

and push a sentinel `__L<line>:<trimmed source>` before the line's tokens (empty lines get none).

- **Case:** tokens are uppercased (OPT-4) except `"quoted words`, which keep source case for `LABEL`/`PRINT`. Variable names are uppercased by `varName()` when the `:`/`"` prefix is stripped.
- **Negative sign:** `-` preceded by start-of-line, whitespace, `[` or `(` and directly followed by a digit, `.`, `:`, `(` or a letter becomes the token `~`. `~` is a unary minus that is never binary, so it also ends the previous expression: `SETPOS 0 -100` → `SETPOS 0 ~ 100` (two inputs). Plain `-` is binary in operator position and unary in operand position.
- Sentinels (`startsWith(LINE_SEN)`) survive block and procedure slicing, so line tracking works everywhere, including top level.

### 2.3 Procedure Extractor

`extractProcedures(tokens) → { topLevel, newProcs }` — pure. Moves `TO name :p… body END` out of the stream into `newProcs[name] = { params, body }`. Top-level sentinels are kept. Errors name the line: missing name, invalid name (must match `/^[A-Z_]/`), redefinition of a built-in (CMD, `CONTROL_WORDS`, functions, operators, queries, `REPCOUNT[MAX]`, `NOT`), `TO` inside a body (missing `END`), missing `END`, stray `END`.

### 2.4 Expression Evaluator

`evalExpr(tokens, idx, vars, rctx, tstate) → { value, nextIdx }` consumes one expression. Internally a precedence-climbing recursive-descent parser over a small state object `p = { tokens, idx, vars, rctx, tstate, paren }`:

```
parseBinary(p, minPrec):  left = parseUnary(p)
                          while next token is a BINOP with prec ≥ minPrec:
                              right = parseBinary(p, prec + 1)     ← left-associative
                              left  = applyBinop(op, left, right)
parseUnary(p):  skip sentinels (an operand is required, so a line break can't end here)
                '-' | '~'  → -parseUnary
                NOT        → parseBinary(p, 3) === 0 ? 1 : 0      ← NOT :a = 1 → NOT(:a = 1)
                UNARY fn   → fn(parseUnary)                       ← SIN :x * 2 → (SIN :x) * 2
                else       → parsePrimary
parsePrimary(p): '(' parseBinary(p,1) ')'   (sentinels skipped inside parens: may span lines)
                 BINARY2 fn  parseBinary(p,1) parseBinary(p,1)
                 user proc   args = parseBinary(p,1) × params → runExpr
                 token       → resolveToken
```

Precedence (`BINOP_PREC`): `OR` 1 < `AND` 2 < comparisons 3 < `+ -` 4 < `* / MOD` 5. Unary forms bind tighter than any binary operator. `AND`/`OR` are not short-circuit. A non-finite result throws "Number too large". `deeper(p, fn)` wraps every recursive construct (unary chains, parens, procedures-as-values) and throws a Logo error at `MAX_EXPR_DEPTH` instead of hitting the JS stack limit (Chromium survives > 4 000 levels; 500 leaves margin for other engines).

### 2.5 Trampoline Executor (`runStack`)

`runStack(stack, rctx)` is the single implementation of all control flow; `run()` (top level) and `runExpr()` (procedure as a value) are wrappers. It loops while the stack is non-empty and `!rctx.stopped`, looking at the top frame.

#### 2.5.1 Frame Shapes

| Frame | Fields | Handler |
|---|---|---|
| Exec | `tokens, idx, vars` [+ `procBoundary, procName, stmtCall, outputVal, stopFired`] | Reads the next token; dispatches. Popped when exhausted. |
| Repeat | `isRepeat, body, vars, remaining, iteration, total` | Pushes a body frame with a fresh iteration scope carrying `[REPEAT_SCOPE] = { count, max }`, or pops. |
| While | `isWhile, cond, body, vars` | Evaluates `cond` (token array) each time; pushes body or pops. |
| For | `isFor, varName, end, step, body, vars, nextVal, eps` | Writes the loop variable into its FOR scope, pushes body, advances `nextVal`, or pops. `eps = |step| × 1e-9` absorbs float drift. |

`procBoundary` marks a procedure body. `stmtCall: true` when called as a command (pushed by `runStack`), absent when called by `runExpr`.

#### 2.5.2 Flow Control

| Word | Behaviour |
|---|---|
| `STOP` | Unwind to the nearest `procBoundary` (set `stopFired`, truncate the stack there); at top level, clear the stack. |
| `OUTPUT` / `OP` | Evaluate, find the nearest boundary. `stmtCall` boundary → error ("You don't say what to do with …"). Otherwise store `outputVal` and truncate. No boundary → error. |
| `BREAK` / `CONTINUE` | Scan down to the innermost loop frame (`isLoopFrame`); hitting a `procBoundary` first → error. BREAK truncates to `k` (drops the loop), CONTINUE to `k + 1` (keeps it). |
| `IF` / `IFELSE` | Evaluate, `extractBlock` (skips sentinels, so a block may start on the next line), push the chosen body with the same `vars`. |
| `REPEAT` / `WHILE` / `FOR` | Parse, push the typed control frame. |
| User procedure | Evaluate the arguments in the caller's scope, apply the **tail-call rule**, push `{ tokens: body, vars: scope, procBoundary, procName, stmtCall: true }`. |
| Leaf command | `frame.idx = await CMD[cmd](tokens, idx, vars, rctx)`. |
| Anything else | Specific error (extra value, operator, value-producing word used as a command, unknown command). |

**Tail-call rule:** before pushing a statement-level procedure frame, pop every top frame that has nothing left to run (`skipSen(tokens, idx) >= tokens.length`), stopping at loop frames and at expression boundaries (`procBoundary && !stmtCall`, which `runExpr` must keep to read `outputVal`). For direct self-recursion the new scope is based on the popped invocation's parent scope instead of chaining onto it, so endless recursive loops run in constant stack and memory.

**Responsiveness:** every 500 iterations `runStack` checks `Date.now() - rctx.lastYield`; after 40 ms without a yield it awaits a macrotask. Programs that never move the turtle therefore stay stoppable and do not freeze the page.

#### 2.5.3 Variable Scoping

Scopes are plain objects chained by prototype (dynamic scoping, as in UCBLogo):

| Scope | Created by | Shape |
|---|---|---|
| Globals | RUN / CLR (`globalVars = {}`) | root; `rctx.globals` |
| Procedure | statement call / `parsePrimary` | `Object.create(callerScope)`, own params, `[PROC_SCOPE] = name` |
| REPEAT iteration | repeat frame | `Object.create(scope)`, `[REPEAT_SCOPE] = { count, max }` |
| FOR | `FOR` | `Object.create(scope)`, own loop variable |

- Reads: `name in vars` / `vars[name]` walk the chain.
- `setVar` (MAKE): first scope in the chain that owns the name, else `rctx.globals`.
- `procScopeOf` (LOCAL / LOCALMAKE target): nearest scope with own `PROC_SCOPE`, else globals. `LOCAL` stores `undefined` (read → "has no value yet").
- `repeatInfo` (REPCOUNT): nearest own `REPEAT_SCOPE`, stopping at a `PROC_SCOPE`. Symbols keep this metadata out of the variable namespace.

### 2.6 Procedures as Values (`runExpr`)

`runExpr(name, proc, scope, rctx) → number` runs the body on its own one-frame stack (`procBoundary` without `stmtCall`) through `runStack`, then: `rctx.stopped` → throw `STOP_SIGNAL` (quiet end after the STOP button); no `outputVal` → error "did not OUTPUT a value". Called from `parsePrimary` inside `deeper()`.

### 2.7 Token Resolution

`resolveToken(tok, vars, tstate) → number` handles single value tokens: `QUERY_TOKENS` (a `Map` of name → `ts => value`: `XCOR YCOR HEADING PENDOWN? PD? PENUP? PU? SCRWIDTH SCRHEIGHT`), `REPCOUNT`/`REPCOUNTMAX`, `:var`/`"var`, and strict number literals (`/^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?$/`). Errors distinguish unknown variables, queries written with a colon, commands used as values, stray brackets/operators and unknown tokens. Adding a query is one `QUERY_TOKENS` entry; `DOT`/`LABEL` argument detection (`isValueStart`) uses the same table.

### 2.8 Control-Flow Sentinel

`STOP_SIGNAL` (frozen) is the only thrown control signal. Thrown by `ouch()` (canvas edge — the message is already logged) and by `runExpr` after the STOP button. `runProgram` treats it as a quiet end. Logo `STOP`/`OUTPUT`/`BREAK`/`CONTINUE` never throw; `runStack` unwinds its own stack.

### 2.9 Yielding and Pacing

| Helper | Used by | Behaviour |
|---|---|---|
| `nextFrame(rctx)` | `move`, `rotate`, `tick` | Await `requestAnimationFrame`. |
| `macroYield(rctx)` | instant `move`, `tick`, `runStack` | Await `setTimeout(0)` — lets the browser paint and handle clicks. |
| `sleep(ms, rctx)` | `WAIT` | Cancellable timer; `rctx.wake` ends it early. |
| `tick(rctx)` | `SETPOS`, `DOT`, `LABEL` | Animated speeds: `render()` and one frame per `STEPS_PER_FRAME[speed]` calls. Instant: counts toward `INSTANT_FLUSH`. |

All update `rctx.lastYield`.

### 2.10 Command Dispatch Table

`CMD['NAME'] = async (t, i, v, rctx) => nextIdx`. Aliases share the function (`CMD['FD'] = CMD['FORWARD']`). Flow-control words (`CONTROL_WORDS`) are handled in `runStack`. Helpers: `wordArg` (a `"word` argument with case kept), `isValueStart` (can a token start an expression — used where the argument is optional or may be text), `skipSen` (handlers that peek at raw tokens skip sentinels first, so arguments may sit on the next line; `DOT` deliberately does not, so `DOT` alone on a line takes no inputs).

### 2.11 Error Handling

Errors are plain `Error`s with Logo-level messages. `runProgram` logs `✗ message` plus `line N: source` from `rctx.execLine`. Parse errors (from `extractProcedures`) are reported by `parseProgram` before anything runs. Warnings (clamps, caps) are logged and execution continues.

---

## 3. Visuals

### 3.1 Coordinate System and HiDPI

`CW`/`CH` are the logical canvas size in CSS pixels = Logo units. The backing store is `CW×DPR` by `CH×DPR` device pixels (`DPR = devicePixelRatio`, re-read on every resize, so browser zoom is handled). The main canvas, `trailCanvas` and `bgCache` all draw through `setTransform(DPR,0,0,DPR,0,0)`, so **all drawing code works in logical units — always use `CW`/`CH`, never `canvas.width/height`** for geometry. Saved PNGs are at device resolution.

```
canvas_x = CW / 2 + logo_x          dx = sin(heading) × dist
canvas_y = CH / 2 - logo_y          dy = cos(heading) × dist
```

`TOWARDS` uses `atan2(dx, dy)` (north = 0, clockwise).

### 3.2 Render Pipeline

`render()` resets the transform, then composites back to front: background (`bgCache` blit or white fill), `trailCanvas` blit, turtle (if visible). Context state is re-applied per frame (`imageSmoothingEnabled = false` keeps the sprite crisp) because resizing a canvas resets it.

### 3.3 Background

Radial gradient with 1 600 random grain dots (`buildGrains`, logical coordinates) painted once into `bgCache` (`buildBgCache`) and rebuilt on resize. WHITE style fills instead.

### 3.4 Trail Storage

Two pre-allocated typed arrays: `trailF32` (x1, y1, x2, y2, w per segment, Logo coordinates) and `trailU8` (r, g, b). ~1.1 MB at cap. A zero-length segment is a DOT (filled circle, diameter w).

| Function | Purpose |
|---|---|
| `paintLine(...)` | Paint a segment/dot onto `trailCanvas` without storing it. |
| `trailPush(...)` | Store (no cap check). |
| `trailPushIfRoom(...)` | Cap check + store + paint. Used by instant moves, SETPOS, DOT. |
| `trailPushQuiet(...)` | Cap check + store, no paint — for segments already painted step by step. |
| `rebuildTrailCanvas()` | Resize `trailCanvas` to the backing size, replay all segments (style changes batched) and labels. |
| `clearScreen()` | Reset trail, labels and turtle; rebuild. Used by CS, RUN-with-clear and CLR. |

`0 ≤ trailLen ≤ MAX_TRAIL_SEGS`; the cap warning is logged once (`trailCapWarned`).

### 3.5 Label Store

`labelStore[]` of `{ x, y, text, r, g, b }`, capped at `MAX_LABELS`. `paintLabel` draws 16 px VT323. Labels are replayed by `rebuildTrailCanvas`, including once `document.fonts.ready` resolves (so labels drawn before the web font loaded are repainted).

### 3.6 Turtle Sprite

**ANIMATED (default):** procedurally generated 64×64 sprite (`buildSprite(walkTick, isMoving, pen)`, cached), drawn facing east and rotated by `(heading − 90)°`, centred `SPRITE_OFFSET` ahead of the pen position (`spriteCenter()`). Animation variables derive from `walkTick` (16-bit counter): leg `swing`, `headExt`, `blink`, `pulse`.

**TRIANGLE:** small triangle at the pen position with a pen-state dot.

### 3.7 Motion

| Speed | Move sub-steps / frame | Degrees / frame |
|---|---|---|
| 0 (slowest) | 1 | 3 |
| 1 | 4 | 12 |
| 2 | 16 | 48 |
| 3 | 64 | 192 |
| 4 (instant) | whole move, no frame | whole turn |

- **`move(dist, rctx)`** computes the end point and clips it with `clipToCanvas` (exact segment/rectangle intersection). Animated: `round(len × 1.2)` sub-steps interpolated from the start point, each painted with `paintLine`; one `nextFrame` per `STEPS_PER_FRAME[speed]` steps; after the loop one segment for the distance actually walked is stored (`trailPushQuiet`). Instant: one `trailPushIfRoom`, `macroYield` every `INSTANT_FLUSH` moves. If the path was clipped: `ouch()` (log OUCH, throw `STOP_SIGNAL`).
- **`SETPOS`** uses the same clipping and `ouch()`, then `tick()`.
- **`rotate(deg, rctx)`** animates in `round(|deg| / DPF)` frames; snaps to `start + deg` unless stopped.
- **`circle(r, rctx)`** — polygon with `max(36, round(|r|))` sides: `move(2πr/steps)` + `rotate(360/steps)`. Negative r mirrors.

---

## 4. User Interface

### 4.1 Layout

Horizontal flex: left panel `#panel` (`calc(384px × --fs-base)`) with title, code editor, splitter, console, direct-mode panel and buttons; right panel `#canvas-panel` (`flex: 1`) with the canvas and overlays.

### 4.2 Code Editor

`contenteditable` IIFE. Public API `{ getValue, setValue, focus }`.

- **getValue()** walks child nodes (DIV / P / BR / text models), joins with `\n`, strips trailing empty lines.
- **Highlighting:** every `input` event re-renders all lines (`renderLines`, comments in `<span class="comment">`, `escHtml`) and restores the caret by character offset (`getCaretOffset` / `setCaretOffset`, div by div).
- **Undo / redo:** re-rendering wipes the browser's native undo stack, so the editor keeps its own history of `{ src, caret }` (max 300). Typing within 800 ms coalesces into one step; `setValue()` (examples, LOAD, beautify) always makes its own step, so loading an example can be undone. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y and `beforeinput` `historyUndo`/`historyRedo` are intercepted.
- **Tab / paste:** Tab inserts two spaces; paste inserts `text/plain` only (both via `execCommand('insertText')`).
- **L:N indicator** updates on input and `selectionchange`.

### 4.3 Splitter and Console Toggle

6 px drag bar resizing `#code-wrap` (mouse + touch). The LOG button hides/shows the console; dragging while hidden re-shows it (`applyDragGuarded`).

### 4.4 Console / Log

`log(msg, cls)` appends `<div class=cls>`, capped at `MAX_LOG_LINES`.

| Class | Filter (OPTIONS) | Contents |
|---|---|---|
| `op` | MOTION (off by default) | FD, BK, RT, LT, SETH, SETPOS, CIRCLE, WAIT. |
| `info` | INFO (off by default) | MAKE, CALL, IF, definitions, colour/width, "Screen cleared." |
| `ok` | STATUS (on) | Done, Saved/Loaded. |
| `err` | always shown | Errors, "■ Stopped.", busy notice. |
| `print` | always shown, opens console | PRINT, OUCH. |
| `cmd` | always shown | Direct-mode command echo. |

### 4.5 Buttons and Direct Mode

| Control | Action |
|---|---|
| RUN | Ignored while running. Clears console and `globalVars`; `clearScreen()` if "clear screen on run"; clears `procs`; `parseProgram` (errors stop here); `registerProcs`; `runProgram`. |
| STOP | `haltRun()` (sets `stopped`, ends a WAIT) and logs "■ Stopped." The run unwinds within a frame; `runProgram` re-enables RUN. |
| CLR | `resetAll()` (trail, labels, turtle, variables, procedures, console). While running: halt first, reset in `rctx.onFinish`. |
| ⌘ DIRECT | Toggles the terminal input. Enter / ↵ runs `runDirectCommand` (history with ↑/↓). Editor procedures are re-read each time; variables persist. While a program runs the command is refused and the text is kept. |
| ≡ / ⎘ / LOG / SAVE / LOAD / ⚙ | Beautify, copy, console toggle, save/load `.logo` (File System Access API with `downloadBlob` / `pickFileWithInput` fallbacks, e.g. in cross-origin iframes), options. |

### 4.6 Overlays and Options

One overlay at a time (`openOverlay` toggles, Escape closes all): commands reference (static `#ref-body` tables), examples (built from `EXAMPLES`), options:

| Section | Controls |
|---|---|
| SAVE | Save canvas as PNG (device resolution). |
| FONT SIZE | SMALL / MEDIUM / LARGE → `--fs-base` 1 / 1.4 / 1.8; triggers `resizeCanvas`. |
| CONSOLE LOG FILTERS | MOTION, INFO, STATUS, ERRORS. |
| BEHAVIOUR | Clear screen on run (on); SPEED slider 0–4 (default 0). |
| CANVAS STYLE / TURTLE STYLE | PARCHMENT / WHITE; ANIMATED / TRIANGLE. |

### 4.7 Beautify

`beautify(src)` is a **pure function**; it never calls interpreter code. Invariant: `beautify(beautify(src)) === beautify(src)`.

| Pass | Purpose |
|---|---|
| 1 | Split lines into code / comment / blank. |
| 2 | Mark negative signs exactly like `tokenize()` (`-` → `~`, kept glued to its operand), lex (parentheses included), uppercase everything except `"words`. |
| 3 | Emit line records: `TO`/`END` indent, `[` inline-or-expand (`shouldInline`: no nested `[` and ≤ `INLINE_THRESHOLD` tokens). |
| 4 | Render with `joinToks` (`~x` → `-x`, bare `~` glued to the next token, no space after `(` or before `)`), re-attach comments, keep one blank line after `END`/`]` at depth 0. |

### 4.8 Canvas Resize

`resizeCanvas()` runs at startup and 150 ms after window resizes (and after font-size changes). It retries next frame while the panel is 0×0; sets `DPR`, `CW`, `CH`, the backing size and CSS size; rebuilds background and trail; re-centres the turtle only when no program runs.

---

## 5. Function Signatures (Quick Reference)

```
// Interpreter
run(tokens, startIdx, vars, rctx)                → async void   (sets rctx.globals)
runStack(stack, rctx)                            → async void   (all control flow)
runExpr(name, proc, scope, rctx)                 → async number (procedure as value)
evalExpr(tokens, idx, vars, rctx, tstate?)       → async {value, nextIdx}
CMD['NAME'] = async (tokens, idx, vars, rctx)    → nextIdx
resolveToken(tok, vars, tstate?)                 → number
tokenize(src)                                    → token[]
extractBlock(tokens, idx)                        → {body, nextIdx}
extractProcedures(tokens)                        → {topLevel, newProcs}
skipSen(tokens, idx, rctx?)                      → idx
setVar(vars, name, value, rctx) / procScopeOf(vars, rctx) / repeatInfo(vars)

// Run context and execution
makeRunContext(speed, procsMap)                  → rctx
haltRun()                                        → void
parseProgram(src)                                → {topLevel, newProcs} | null
runProgram(tokens)                               → async void

// Motion and pacing
move(dist, rctx) / rotate(deg, rctx) / circle(r, rctx) → async void
clipToCanvas(x0, y0, x1, y1)                     → null | [x, y]
tick(rctx) / nextFrame(rctx) / macroYield(rctx) / sleep(ms, rctx) → Promise

// Rendering / trail
render() · rebuildTrailCanvas() · clearScreen() · paintLabel(lab)
paintLine(x1,y1,x2,y2,w,r,g,b) · trailPush(…) · trailPushIfRoom(…) → bool · trailPushQuiet(…) → bool
toCanvas(x, y) → [cx, cy] · spriteCenter() → [x, y]
```

---

## 6. Extension Guide

Always add a regression case to `tests/run-examples.js` and run `node tests/run-examples.js`.

### 6.1 Adding a Leaf Command

```js
CMD['MYCOMMAND'] = CMD['MC'] = async (t, i, v, rctx) => {
  const { value: n, nextIdx } = await evalExpr(t, i, v, rctx);
  // … validate (throw Error with a Logo-level message, or clamp + log a warning) …
  return nextIdx;
};
```

- If it draws without moving through `move()`, finish with `await tick(rctx)` so pacing and responsiveness match other commands.
- If it reads a word argument, use `wordArg`; if an argument is optional, use `isValueStart`.
- Add it to the `#ref-body` table and, if it shows something new, to `EXAMPLES`. Built-in names are automatically protected from `TO` redefinition.

### 6.2 Adding a Loop Construct

Push a typed frame (`{ isMyLoop: true, body, vars, … }`) from the exec-frame dispatch, handle `frame.isMyLoop` at the top of the `runStack` loop (push a body frame or pop), and add it to `isLoopFrame` so BREAK / CONTINUE and the tail-call rule recognise it. Nothing else is needed — expression-context code uses the same `runStack`.

### 6.3 Adding a Math Function

- **One input:** add the name to `UNARY` and an implementation to `UNARY_FNS`. The argument is the single operand after the name (`parseUnary`), so `MYFN :x * 2` is `(MYFN :x) * 2`. Throw on domain errors: `throw new Error('MYFN: argument ' + a + ' must be > 0')`.
- **Two inputs:** add to `BINARY2` and `BINARY2_FNS` (`(a, b, tstate) => …`).
- **A query (no input):** one entry in `QUERY_TOKENS`.
- **An infix operator:** add to `BINOP_PREC` and `applyBinop`, and to the tokenizer regex if it uses new characters (and to beautify's).

### 6.4 Canvas / Turtle Styles

Add a pill in the options HTML, a `case` in `drawBackground()` or `render()`, and wire the pill to set `canvasStyle` / `turtleStyle` and call `render()`.

### 6.5 Splitting Into Multiple Files

| File | Contents | DOM dependency |
|---|---|---|
| `interpreter.js` | tokenizer, extractor, parser, `runStack`, `run`, `runExpr`, scopes, `CMD` | none once `log`/`render`/canvas size are injected (see §1) |
| `turtle.js` | `mkTurtle`, `move`, `rotate`, `circle`, `clipToCanvas` | trail + render |
| `trail.js` | typed arrays, paint/push helpers, labels, `rebuildTrailCanvas` | canvas |
| `render.js` | canvas setup, HiDPI, sprite, background, `render` | canvas + DOM |
| `editor.js` | editor IIFE, `beautify`, `escHtml` | DOM |
| `ui.js` | `runProgram`, buttons, direct mode, splitter, overlays, options, resize, files | DOM |
