# Blue Logo — Implementation Specification
## Version 8.3 — November 2026

This document covers the internal architecture, data structures, algorithms, and extension points for developers maintaining or extending Blue Logo. Language behaviour visible to programmers is in `blue-logo-lang-spec.md`.

| Property | Value |
|---|---|
| Target environment | Any modern browser (Chrome, Firefox, Safari, Edge). Served as a static site (GitHub Pages). |
| Delivery | ES modules in `src/`, built by Vite into `dist/` (`index.html` + hashed JS/CSS/font). Module scripts do not load from `file://` — use `npm run dev` or `npm run preview` locally. Versions up to v8.1 are frozen single-file HTML in `versions/`. |
| External dependencies | None at runtime. VT323 is self-hosted (`src/assets/fonts/`, OFL, see `third-party/`); the page makes no third-party requests (checked by the tests). Dev tooling: Vite, Vitest, ESLint, Playwright. |
| Max trail segments | 50 000 (`MAX_TRAIL_SEGS`). An animated move stores one segment. |
| Procedure recursion | Tail calls unbounded; other statement-level recursion ≤ 10 000 frames (`MAX_STACK_FRAMES`). |
| Expression nesting | ≤ 500 levels (`MAX_EXPR_DEPTH`): parentheses, unary chains and procedures used as values. |
| Tests | `npm test` — Vitest unit tests (interpreter in Node, `tests/unit/`), Vite build, then headless Chromium via Playwright against `dist/`. `npm run lint` — ESLint, including the core boundary rule. |

---

## 1. Architecture Overview

The application is a set of ES modules (`src/`) bundled by Vite. There is no framework and no class hierarchy. Everything a Logo program can change lives in a **session** object; everything it shows goes through a **LogoIO** object; both travel in `rctx` (§1.3). UI-only state (canvas size, styles, console visibility) lives in module-level variables, each owned by one module (§1.2). Five logical layers:

| Layer | Responsibility |
|---|---|
| Rendering | Canvas compositing (HiDPI), sprite generation, background and trail painting. |
| Turtle | `session.turtle` (position, heading, pen, colour, width), `session.drawing` (trail segments + labels), `move`/`rotate`/`circle`. |
| Interpreter | Tokeniser → procedure extractor → trampoline executor ⇄ expression evaluator → motion. |
| Editor | `contenteditable` editor (`editor/editor.js`): syntax highlighting, caret preservation, own undo/redo, tab/paste. |
| UI shell | `runProgram`, buttons, direct mode, splitter, overlays, options, resize, file save/load. |

**The core has no DOM.** `src/interpreter/`, `src/turtle/` and `src/format/` never touch the browser: they see no browser globals and may not import `render/`, `ui/`, `editor/`, `app.js` or `main.js` (ESLint enforces both, see `eslint.config.js`). The page wires the core to the browser in `src/app.js`; the unit tests use `headlessIO()` instead (§1.3).

### 1.1 Data Flow (RUN)

```
btn-run → parseProgram(editor.getValue(), io)
            → tokenize(src)               → token[]  (with LINE_SEN line sentinels)
            → extractProcedures(tokens)   → { topLevel, newProcs }
        → registerProcs(session, newProcs, io) → session.procs
        → runProgram(topLevel)                                   (ui/program.js)
            → makeRunContext(speed, session, io) → rctx ; activeRctx = rctx
            → execute(topLevel, rctx)                            (interpreter/execute.js)
                → run(topLevel, 0, session.globals, rctx)
                    → runStack(stack, rctx)    → CMD handlers / control flow
                        → evalExpr(...)        → parseBinary / parseUnary / parsePrimary
                        → move / rotate / circle → session.drawing + rctx.io.paintLine / render
                → "✓ Done!" or "✗ error + line"
            → finally: activeRctx = null, setRunning(false), rctx.onFinish?.()
```

Direct mode (`runDirectCommand`) uses the same `parseProgram` / `registerProcs` / `runProgram`, keeps `session.globals` between commands, and refuses to start while a program runs.

### 1.2 File Layout

| Path | Contents |
|---|---|
| `index.html` | Markup only: left panel, canvas panel, overlays, commands reference (`#ref-body`), option controls. `%APP_VERSION%` is replaced at build time (MAJOR.MINOR from `package.json`). |
| `src/app.js` | The page's `session` (`createSession()`) and `io` (browser LogoIO: console, trail canvas, `CW`/`CH`, speed slider, `requestAnimationFrame`). |
| `src/main.js` | Entry point: imports the CSS and the UI modules (which wire their DOM handlers on import), calls `resizeCanvas()`, repaints labels after the font loads, exposes the test hooks on `window`. |
| `src/styles/app.css` | All CSS, including the VT323 `@font-face`. |
| `src/assets/fonts/` | `VT323-Regular.woff2` (latin subset). |
| `src/util.js` | `escHtml()`. |
| `src/examples.js` | Loads `examples/*.logo` (Vite `import.meta.glob`, `?raw`), `parseExample`, `EXAMPLES`. |
| `examples/NN-name.logo` | One example per file. Leading `;; title:` / `;; desc:` lines are metadata; the rest is the code. The number prefix sets the order. |
| **render/** | |
| `render/canvas.js` | `canvas`, `ctx`, `CW`/`CH`/`DPR` + `setCanvasSize`. |
| `render/sprite.js` | Palette, `drawShell`/`drawLeg`/`drawHead`/`drawBelly`, `spr`, `buildSprite`, `SPRITE_OFFSET`. |
| `render/background.js` | `buildGrains`, `buildBgCache`, `drawBackground`, `canvasStyle`/`turtleStyle` + setters. |
| `render/trail.js` | `trailCanvas`, `toCanvas`, `paintLine`, `paintLabel`, `rebuildTrailCanvas` (paints `session.drawing`). |
| `render/render.js` | `render()` (background → trail → sprite; reads `session.turtle`, `walkTick`, `isMoving`). |
| **turtle/** | |
| `turtle/state.js` | `mkTurtle`, `resetTurtle(t)` (in place). |
| `turtle/drawing.js` | Drawing store: `createDrawing`, `clearDrawing`, `segment`, `trailPushIfRoom`, `trailPushQuiet`, `addLabel`, `MAX_TRAIL_SEGS`, `MAX_LABELS`. |
| `turtle/motion.js` | `clipToCanvas`, `clipForRun`, `ouch`, `move`, `rotate`, `circle`. |
| **interpreter/** | |
| `interpreter/session.js` | `createSession`, `clearScreen(session, io)`, `clearProcs`. |
| `interpreter/io.js` | The LogoIO contract (header comment) and `headlessIO()`. |
| `interpreter/context.js` | `makeRunContext`, `activeRctx` + `setActiveRctx`, `haltRun`. |
| `interpreter/execute.js` | `parseProgram`, `registerProcs`, `execute` — shared by RUN, direct mode and the unit tests. |
| `interpreter/scope.js` | INTERPRETER header comment, `REPEAT_SCOPE`, `PROC_SCOPE`, `setVar`, `procScopeOf`, `repeatInfo`, `varName`, `isVarTok`, `hasOwn`, `formatNum`. |
| `interpreter/tokenizer.js` | `LINE_SEN`, `tokenize`. |
| `interpreter/procedures.js` | `extractBlock`, `CONTROL_WORDS`, `extractProcedures`. |
| `interpreter/expr.js` | `QUERY_TOKENS`, `resolveToken`, operator tables, `evalExpr` and the precedence parser, `skipSen`, `noteLine`. |
| `interpreter/signals.js` | `STOP_SIGNAL`, `MAX_STACK_FRAMES`. |
| `interpreter/pacing.js` | `nextFrame`, `macroYield`, `sleep`, `tick`, `STEPS_PER_FRAME`, `INSTANT_FLUSH`. |
| `interpreter/commands.js` | `CMD` and all leaf handlers, `COLOR_NAMES`. |
| `interpreter/runtime.js` | `runExpr`, `runStack`, `run`. |
| **editor/, format/** | |
| `editor/editor.js` | `editor` (`getValue`, `setValue`, `initValue`, `onChange`, `focus`), undo history, line indicator. |
| `format/beautify.js` | `beautify(src)` — pure. |
| **ui/** | |
| `ui/console.js` | `con`, `log`, `optSpeed`, `consoleVisible` + `setConsoleVisible`, `setShowConsole`. |
| `ui/program.js` | `setRunning`, `runProgram`; RUN / STOP / CLR handlers (`resetAll`). |
| `ui/direct.js` | Direct-mode state, `runDirectCommand`, direct-mode handlers. |
| `ui/examples-overlay.js`, `ui/overlays.js`, `ui/options.js` | Examples list, `openOverlay`/`closeOverlay`/`OVERLAYS`, options panel. |
| `ui/splitter.js`, `ui/code-buttons.js`, `ui/files.js`, `ui/resize.js` | Splitter + LOG toggle, copy / beautify buttons, file save/load, `resizeCanvas`. |
| `ui/autosave.js` | `AUTOSAVE_KEY` (`blue-logo:program`; migrates the pre-v8.3 key `claude-logo:program` once), `AUTOSAVE_DELAY_MS` (500), `autosave` (`save`/`load`/`flush`), `restoreProgram`. Driven by `editor.onChange`; flushes on `pagehide` / hidden `visibilitychange`; restores with `editor.initValue` (no undo step). All localStorage access is guarded. |

**State ownership.** Program state is in the session object; modules change its fields (`session.globals = {}`, `session.turtle.x = 0`) and never replace the object. `session.turtle` and `session.procs` are also never replaced (they are reset in place) so references held during a run stay valid. UI state that is a module-level variable is written only by the module that declares it, through a small setter (`setCanvasSize`, `setActiveRctx`, `setCanvasStyle`, `setTurtleStyle`, `setConsoleVisible`, `setShowConsole`) — an ES module cannot assign to a variable it imports; ESLint's `no-import-assign` catches violations.

**Circular imports** exist (e.g. `expr` ⇄ `runtime` ⇄ `commands`; `app` ⇄ `render`) and are harmless because those modules only use each other inside functions. Do not add top-level code that calls into another interpreter module at import time.

### 1.3 Session and LogoIO

`createSession()` (`interpreter/session.js`) → `{ turtle, drawing, globals, procs, walkTick, isMoving }`. The page has one (`src/app.js`); tests make one per case. CS / RUN-with-clear / CLR call `clearScreen(session, io)`; RUN and CLR also set `session.globals = {}` and `clearProcs(session)`.

`rctx.io` is the interpreter's only way out (`interpreter/io.js`):

| Method | Browser (`src/app.js`) | `headlessIO()` |
|---|---|---|
| `log(msg, cls)` | `ui/console.js` `log` | collects `{msg, cls}` in `.lines`; `.text()` joins them |
| `render()` | `render()` | no-op |
| `paintLine(x1,y1,x2,y2,w,r,g,b)` / `paintLabel(lab)` | paint on `trailCanvas` | no-op |
| `redraw()` | `rebuildTrailCanvas()` | no-op |
| `clearText()` | empty `#console` | clears `.lines` |
| `canvasSize()` → `{w, h}` | `{CW, CH}` | fixed (default 800 × 600) |
| `setSpeed(n)` | moves the speed slider | no-op |
| `nextFrame()` / `macroYield()` | `requestAnimationFrame` / `setTimeout(0)` | `setTimeout(0)` |

Storage is the core's job, painting is the IO's: `trailPushIfRoom(rctx, …)` stores the segment in `session.drawing` and then calls `io.paintLine`.

### 1.4 Key Constants

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

Created by `makeRunContext(speed, session, io)` for every RUN / direct command.

| Field | Purpose |
|---|---|
| `stopped` | Kill switch. Set by `haltRun()` (STOP / CLR). Checked by `runStack`, `move`, `rotate`, `circle`. |
| `execLine` | `{ n, text }` of the current source line, from LINE_SEN sentinels. Appended to error messages. |
| `speed` | 0–4. Snapshot of the slider; `SPEED n` changes it mid-run (and moves the slider). |
| `session`, `io` | What the program changes / where its output goes (§1.3). |
| `procs` | `session.procs` (shortcut). |
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

`evalExpr(tokens, idx, vars, rctx) → { value, nextIdx }` consumes one expression. Internally a precedence-climbing recursive-descent parser over a small state object `p = { tokens, idx, vars, rctx, paren }`:

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
| Globals | RUN / CLR (`session.globals = {}`) | root; `rctx.globals` |
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

`resolveToken(tok, vars, rctx) → number` handles single value tokens: `QUERY_TOKENS` (a `Map` of name → `(turtle, rctx) => value`; `SCRWIDTH`/`SCRHEIGHT` read `rctx.io.canvasSize()`: `XCOR YCOR HEADING PENDOWN? PD? PENUP? PU? SCRWIDTH SCRHEIGHT`), `REPCOUNT`/`REPCOUNTMAX`, `:var`/`"var`, and strict number literals (`/^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?$/`). Errors distinguish unknown variables, queries written with a colon, commands used as values, stray brackets/operators and unknown tokens. Adding a query is one `QUERY_TOKENS` entry; `DOT`/`LABEL` argument detection (`isValueStart`) uses the same table.

### 2.8 Control-Flow Sentinel

`STOP_SIGNAL` (frozen) is the only thrown control signal. Thrown by `ouch()` (canvas edge — the message is already logged) and by `runExpr` after the STOP button. `runProgram` treats it as a quiet end. Logo `STOP`/`OUTPUT`/`BREAK`/`CONTINUE` never throw; `runStack` unwinds its own stack.

### 2.9 Yielding and Pacing

| Helper | Used by | Behaviour |
|---|---|---|
| `nextFrame(rctx)` | `move`, `rotate`, `tick` | Await `rctx.io.nextFrame()` (`requestAnimationFrame` in the page). |
| `macroYield(rctx)` | instant `move`, `tick`, `runStack` | Await `rctx.io.macroYield()` (`setTimeout(0)`) — lets the browser paint and handle clicks. |
| `sleep(ms, rctx)` | `WAIT` | Cancellable timer; `rctx.wake` ends it early. |
| `tick(rctx)` | `SETPOS`, `DOT`, `LABEL` | Animated speeds: `render()` and one frame per `STEPS_PER_FRAME[speed]` calls. Instant: counts toward `INSTANT_FLUSH`. |

All update `rctx.lastYield`.

### 2.10 Command Dispatch Table

`CMD['NAME'] = async (t, i, v, rctx) => nextIdx`. Aliases share the function (`CMD['FD'] = CMD['FORWARD']`). Flow-control words (`CONTROL_WORDS`) are handled in `runStack`. Helpers: `wordArg` (a `"word` argument with case kept), `isValueStart` (can a token start an expression — used where the argument is optional or may be text), `skipSen` (handlers that peek at raw tokens skip sentinels first, so arguments may sit on the next line; `DOT` deliberately does not, so `DOT` alone on a line takes no inputs).

### 2.11 Error Handling

Errors are plain `Error`s with Logo-level messages. `execute` logs `✗ message` plus `line N: source` from `rctx.execLine`. Parse errors (from `extractProcedures`) are reported by `parseProgram` before anything runs. Warnings (clamps, caps) are logged and execution continues.

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

`session.drawing` (`turtle/drawing.js`) holds two pre-allocated typed arrays: `f32` (x1, y1, x2, y2, w per segment, Logo coordinates) and `u8` (r, g, b), plus `len`, `capWarned`, `labels`, `labelCapWarned`. ~1.1 MB at cap. A zero-length segment is a DOT (filled circle, diameter w).

| Function | Purpose |
|---|---|
| `trailPushIfRoom(rctx, …)` | Cap check + store + `io.paintLine`. Used by instant moves, SETPOS, DOT. |
| `trailPushQuiet(rctx, …)` | Cap check + store, no paint — for segments already painted step by step. |
| `segment(drawing, i)` | Read one segment as `[x1, y1, x2, y2, w, r, g, b]` (tests). |
| `paintLine(...)` (`render/trail.js`) | Paint a segment/dot onto `trailCanvas` without storing it. |
| `rebuildTrailCanvas()` (`render/trail.js`) | Resize `trailCanvas` to the backing size, replay all segments (style changes batched) and labels. |
| `clearScreen(session, io)` (`interpreter/session.js`) | Reset drawing and turtle; `io.redraw()`. Used by CS, RUN-with-clear and CLR. |

`0 ≤ len ≤ MAX_TRAIL_SEGS`; the cap warning is logged once (`capWarned`).

### 3.5 Label Store

`session.drawing.labels[]` of `{ x, y, text, r, g, b }`, capped at `MAX_LABELS` (`addLabel`). `paintLabel` draws 16 px VT323. Labels are replayed by `rebuildTrailCanvas`, including once `document.fonts.ready` resolves (so labels drawn before the web font loaded are repainted).

### 3.6 Turtle Sprite

**ANIMATED (default):** procedurally generated 64×64 sprite (`buildSprite(session.walkTick, session.isMoving, pen)`, cached), drawn facing east and rotated by `(heading − 90)°`, centred `SPRITE_OFFSET` ahead of the pen position (`spriteCenter()`). Animation variables derive from `walkTick` (16-bit counter): leg `swing`, `headExt`, `blink`, `pulse`.

**TRIANGLE:** small triangle at the pen position with a pen-state dot.

### 3.7 Motion

| Speed | Move sub-steps / frame | Degrees / frame |
|---|---|---|
| 0 (slowest) | 1 | 3 |
| 1 | 4 | 12 |
| 2 | 16 | 48 |
| 3 | 64 | 192 |
| 4 (instant) | whole move, no frame | whole turn |

- **`move(dist, rctx)`** computes the end point and clips it with `clipForRun` → `clipToCanvas(…, w, h)` against `io.canvasSize()` (exact segment/rectangle intersection). Animated: `round(len × 1.2)` sub-steps interpolated from the start point, each painted with `paintLine`; one `nextFrame` per `STEPS_PER_FRAME[speed]` steps; after the loop one segment for the distance actually walked is stored (`trailPushQuiet`). Instant: one `trailPushIfRoom`, `macroYield` every `INSTANT_FLUSH` moves. If the path was clipped: `ouch(rctx)` (log OUCH, throw `STOP_SIGNAL`).
- **`SETPOS`** uses the same clipping and `ouch(rctx)`, then `tick()`.
- **`rotate(deg, rctx)`** animates in `round(|deg| / DPF)` frames; snaps to `start + deg` unless stopped.
- **`circle(r, rctx)`** — polygon with `max(36, round(|r|))` sides: `move(2πr/steps)` + `rotate(360/steps)`. Negative r mirrors.

---

## 4. User Interface

### 4.1 Layout

Horizontal flex: left panel `#panel` (`calc(384px × --fs-base)`) with title, code editor, splitter, console, direct-mode panel and buttons; right panel `#canvas-panel` (`flex: 1`) with the canvas and overlays.

### 4.2 Code Editor

`contenteditable` editor created by an IIFE in `editor/editor.js`. Public API `{ getValue, setValue, initValue, onChange, focus }`.

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
| RUN | Ignored while running. Clears console and `session.globals`; `clearScreen(session, io)` if "clear screen on run"; clears `session.procs`; `parseProgram` (errors stop here); `registerProcs`; `runProgram`. |
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
evalExpr(tokens, idx, vars, rctx)                → async {value, nextIdx}
CMD['NAME'] = async (tokens, idx, vars, rctx)    → nextIdx
resolveToken(tok, vars, rctx)                    → number
tokenize(src)                                    → token[]
extractBlock(tokens, idx)                        → {body, nextIdx}
extractProcedures(tokens)                        → {topLevel, newProcs}
skipSen(tokens, idx, rctx?)                      → idx
setVar(vars, name, value, rctx) / procScopeOf(vars, rctx) / repeatInfo(vars)

// Session, run context and execution
createSession()                                  → session
headlessIO({width, height}?)                     → io (+ .lines, .text())
makeRunContext(speed, session, io)               → rctx
haltRun()                                        → void
parseProgram(src, io)                            → {topLevel, newProcs} | null
registerProcs(session, newProcs, io)             → void
execute(tokens, rctx)                            → async void  (logs Done / error; never throws)
runProgram(tokens)                               → async void  (page: activeRctx, RUN button)

// Motion and pacing
move(dist, rctx) / rotate(deg, rctx) / circle(r, rctx) → async void
clipToCanvas(x0, y0, x1, y1, w, h)               → null | [x, y]
clipForRun(rctx, x0, y0, x1, y1)                 → null | [x, y]
tick(rctx) / nextFrame(rctx) / macroYield(rctx) / sleep(ms, rctx) → Promise

// Drawing store (core)
trailPushIfRoom(rctx, x1,y1,x2,y2,w,r,g,b) → bool · trailPushQuiet(rctx, …) → bool · addLabel(rctx, lab) → bool
clearScreen(session, io) · clearProcs(session) · segment(drawing, i) → [x1,y1,x2,y2,w,r,g,b]

// Rendering (browser)
render() · rebuildTrailCanvas() · paintLine(x1,y1,x2,y2,w,r,g,b) · paintLabel(lab)
toCanvas(x, y) → [cx, cy] · spriteCenter(turtle) → [x, y]
```

---

## 6. Extension Guide

Always add a regression case to `tests/cases.js` (run by both the unit tests and the browser test) and run `npm test`. Interpreter-only checks (state, segments) go in `tests/unit/`; UI behaviour in `UI_CHECKS` in `tests/run-examples.js`.

### 6.1 Adding a Leaf Command

```js
CMD['MYCOMMAND'] = CMD['MC'] = async (t, i, v, rctx) => {
  const { value: n, nextIdx } = await evalExpr(t, i, v, rctx);
  // … validate (throw Error with a Logo-level message, or clamp + log a warning) …
  return nextIdx;
};
```

- Read and change state through `rctx.session` (`turtle`, `drawing`); produce output only through `rctx.io` (`log`, `render`, …). Never import from `render/` or `ui/` — lint fails.
- If it draws without moving through `move()`, store via `trailPushIfRoom(rctx, …)` / `addLabel(rctx, …)` and finish with `await tick(rctx)` so pacing and responsiveness match other commands.
- If it reads a word argument, use `wordArg`; if an argument is optional, use `isValueStart`.
- Add it to the `#ref-body` table and, if it shows something new, to `EXAMPLES`. Built-in names are automatically protected from `TO` redefinition.

### 6.2 Adding a Loop Construct

Push a typed frame (`{ isMyLoop: true, body, vars, … }`) from the exec-frame dispatch, handle `frame.isMyLoop` at the top of the `runStack` loop (push a body frame or pop), and add it to `isLoopFrame` so BREAK / CONTINUE and the tail-call rule recognise it. Nothing else is needed — expression-context code uses the same `runStack`.

### 6.3 Adding a Math Function

- **One input:** add the name to `UNARY` and an implementation to `UNARY_FNS`. The argument is the single operand after the name (`parseUnary`), so `MYFN :x * 2` is `(MYFN :x) * 2`. Throw on domain errors: `throw new Error('MYFN: argument ' + a + ' must be > 0')`.
- **Two inputs:** add to `BINARY2` and `BINARY2_FNS` (`(a, b, turtle) => …`).
- **A query (no input):** one entry in `QUERY_TOKENS` (`(turtle, rctx) => value`).
- **An infix operator:** add to `BINOP_PREC` and `applyBinop`, and to the tokenizer regex if it uses new characters (and to beautify's).

### 6.4 Canvas / Turtle Styles

Add a pill in the options markup (`index.html`), a `case` in `drawBackground()` or `render()`, and wire the pill (`ui/options.js`) to call `setCanvasStyle` / `setTurtleStyle` and `render()`.

### 6.5 Adding a Module

Put it in the folder of its layer, `export` only what other modules use, and import it from `main.js` if it wires DOM handlers. Program state belongs in the session (§1.3); UI state that other modules must change gets a setter (§1.2). Code in `interpreter/`, `turtle/` or `format/` must stay DOM-free. Run `npm run lint` — `no-undef` reports missing imports, `no-unused-vars` reports stale ones.

### 6.6 Adding an Example

Add `examples/NN-name.logo` with `;; title:` and `;; desc:` lines at the top. It appears in the EXAMPLES overlay in file-name order, and `npm test` runs it automatically, headless and in the browser (it must end with `✓ Done!`; list it in `ENDS_WITH_OUCH` in `tests/cases.js` if it is meant to stop at the edge).
