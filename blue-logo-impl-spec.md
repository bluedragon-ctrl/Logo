# Blue Logo — Implementation Specification
## Version 8.10 — November 2026

This document covers the internal architecture, data structures, algorithms, and extension points for developers maintaining or extending Blue Logo. Language behaviour visible to programmers is in `blue-logo-lang-spec.md`.

| Property | Value |
|---|---|
| Target environment | Any modern browser (Chrome, Firefox, Safari, Edge). Served as a static site (GitHub Pages). |
| Delivery | ES modules in `src/`, built by Vite into `dist/` (`index.html` + hashed JS/CSS/font). Module scripts do not load from `file://` — use `npm run dev` or `npm run preview` locally. Versions up to v8.1 are frozen single-file HTML in `versions/`. |
| External dependencies | CodeMirror 6 (editor, MIT), bundled into the app by Vite. VT323 (title and LABEL text only) is self-hosted (`src/assets/fonts/`, OFL; licenses in `third-party/`); everything else uses system fonts; the page makes no third-party requests (checked by the tests). Dev tooling: TypeScript, Vite, Vitest, ESLint, Playwright. |
| Max trail segments | 50 000 (`MAX_TRAIL_SEGS`). An animated move stores one segment. |
| Procedure recursion | Tail calls unbounded; other statement-level recursion ≤ 10 000 frames (`MAX_STACK_FRAMES`). |
| Expression nesting | ≤ 500 levels (`MAX_EXPR_DEPTH`): parentheses, unary chains and procedures used as values. |
| Tests | `npm test` — Vitest unit tests (interpreter in Node, `tests/unit/`), Vite build, then headless Chromium via Playwright against `dist/`. `npm run lint` — two TypeScript checks (app + tests; core without the DOM), then ESLint. |

---

## 1. Architecture Overview

The application is a set of TypeScript ES modules (`src/`, strict mode) bundled by Vite, which strips the types; `tsc` only type-checks (`noEmit`). There is no framework and no class hierarchy. Everything a Logo program can change lives in a **session** object; everything it shows goes through a **LogoIO** object; both travel in `rctx` (§1.3). UI-only state (canvas size, styles, console visibility) lives in module-level variables, each owned by one module (§1.2). Five logical layers:

| Layer | Responsibility |
|---|---|
| Rendering | Canvas compositing (HiDPI), turtle drawing, background and trail painting. |
| Turtle | `session.turtle` (position, heading, pen, colour, width), `session.drawing` (trail segments + labels), `move`/`rotate`/`circle`. |
| Interpreter | Tokeniser → procedure extractor → trampoline executor ⇄ expression evaluator → motion. |
| Editor | CodeMirror 6 (`editor/editor.ts`, `editor/logo-language.ts`): Logo highlighting, line numbers, `[ ]` matching, undo/redo, Tab = two spaces. |
| UI shell | `runProgram`, buttons, direct mode, splitter, overlays, options, resize, file save/load. |

**The core has no DOM.** `src/interpreter/`, `src/turtle/` and `src/format/` never touch the browser: `tsconfig.core.json` type-checks them without the DOM library (the only host globals are `setTimeout` / `clearTimeout`, `types/core-globals.d.ts`), and ESLint forbids imports from `render/`, `ui/`, `editor/`, `app.ts` or `main.ts`. The page wires the core to the browser in `src/app.ts`; the unit tests use `headlessIO()` instead (§1.3).

### 1.1 Data Flow (RUN)

```
btn-run → parseProgram(editor.getValue(), io)
            → tokenize(src)               → token[]  ({ text, line, col, lineText })
            → extractProcedures(tokens)   → { topLevel, newProcs }
        → registerProcs(session, newProcs, io) → session.procs
        → runProgram(topLevel)                                   (ui/program.ts)
            → makeRunContext(speed, session, io) → rctx ; activeRctx = rctx
            → execute(topLevel, rctx)                            (interpreter/execute.ts)
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
| `index.html` | Markup only: left panel, canvas panel, overlays (their content is built by `ui/`), option controls. `%APP_VERSION%` is replaced at build time (MAJOR.MINOR from `package.json`). |
| `src/app.ts` | The page's `session` (`createSession()`) and `io` (browser LogoIO: console, trail canvas, `CW`/`CH`, speed slider, `requestAnimationFrame`). |
| `src/main.ts` | Entry point: imports the CSS and the UI modules (which wire their DOM handlers on import), calls `resizeCanvas()`, repaints labels after the font loads, exposes the test hooks on `window`. |
| `src/styles/app.css` | All CSS: design tokens (colours, font stacks, `--fs-base`), the VT323 `@font-face`. |
| `src/assets/fonts/` | `VT323-Regular.woff2` (latin subset). |
| `src/assets/logo.svg` | The app logo (favicon and header): the canvas turtle without the pen dot. Keep it in sync with `render/sprite.ts`. |
| `src/util.ts` | `escHtml()`, `byId<T>(id)` (throws if `index.html` lacks the element), `context2d(canvas)`. |
| `src/types/` | `file-system-access.d.ts` — the File System Access API (not in TypeScript's DOM library). |
| `src/reference.ts` | `REFERENCE` — the Commands panel content as data: sections `{ id, title, entries }` of `{ syntax, desc, more?, forms?, examples?, see?, tags? }` (field rules in the file's header). `syntaxWords`, `entryWords` (the Logo words of an entry), `findEntry(word)` (for See also / F1), `scoreEntry(entry, query)` (search ranking). `tests/unit/reference.test.ts` checks it lists every built-in word once and nothing else, that every entry has an example and every example runs, that every See also link resolves, and the search ranking. |
| `src/examples.ts` | Loads `examples/*.logo` (Vite `import.meta.glob`, `?raw`), `parseExample`, `EXAMPLES` (`{ title, desc, topic, shows, uses, code }`), `EXAMPLE_TOPICS`, `usedWords(code)` (built-in words, found with `tokenize`), `examplesUsing(words)` (examples that use a command; those that `shows` it first). |
| `examples/NN-name.logo` | One example per file. Leading `;; title:` / `;; desc:` / `;; topic:` / `;; shows:` lines are metadata; the rest is the code. The number prefix sets the order. |
| **render/** | |
| `render/canvas.ts` | `canvas`, `ctx`, `CW`/`CH`/`DPR` + `setCanvasSize`. |
| `render/sprite.ts` | `drawTurtleSprite` — the flat vector turtle, drawn each frame. |
| `render/background.ts` | `drawBackground` (flat fill), `canvasStyle`/`turtleStyle` + setters. |
| `render/paint.ts` | `paintDrawing(ctx, drawing, hw, hh, minWidth?)`, `paintLabelOn`, `drawingBounds`, `LABEL_FONT` — pure painters of a drawing onto any 2D context (trail layer and example pictures). |
| `render/trail.ts` | `trailCanvas`, `toCanvas`, `paintLine`, `paintLabel`, `rebuildTrailCanvas` (paints `session.drawing` with `paintDrawing`). |
| `render/render.ts` | `render()` (background → trail → turtle; reads `session.turtle`, `walkTick`, `isMoving`, `background`). |
| **turtle/** | |
| `turtle/state.ts` | `mkTurtle`, `resetTurtle(t)` (in place). |
| `turtle/drawing.ts` | Drawing store: `createDrawing`, `clearDrawing`, `segment`, `trailPushIfRoom`, `trailPushQuiet`, `addLabel`, `MAX_TRAIL_SEGS`, `MAX_LABELS`. |
| `turtle/motion.ts` | `clipToCanvas`, `clipForRun`, `ouch`, `move`, `rotate`, `circle`. |
| **interpreter/** | |
| `interpreter/session.ts` | `createSession`, `clearScreen(session, io)`, `clearProcs`. |
| `interpreter/types.ts` | Shared types (no runtime code): `Token`, `Turtle`, `Label`, `Drawing`, `Proc`, `ProcMap`, `RepeatInfo`, `Scope`, `Session`, `LogClass`, `LogoIO`, `RunContext`, `CommandHandler`. |
| `interpreter/io.ts` | The LogoIO contract (header comment) and `headlessIO()` (`HeadlessIO`). |
| `interpreter/context.ts` | `makeRunContext`, `activeRctx` + `setActiveRctx`, `haltRun`. |
| `interpreter/execute.ts` | `parseProgram`, `registerProcs`, `execute` — shared by RUN, direct mode and the unit tests. |
| `interpreter/scope.ts` | `REPEAT_SCOPE`, `PROC_SCOPE`, `setVar`, `procScopeOf`, `repeatInfo`, `varName`, `isVarTok`, `hasOwn`, `formatNum`. |
| `interpreter/tokenizer.ts` | `tokenize`, `newLine`. |
| `interpreter/procedures.ts` | `extractBlock`, `CONTROL_WORDS`, `extractProcedures`. |
| `interpreter/expr.ts` | `QUERY_TOKENS`, `resolveToken`, operator tables, word classes (`isReporterWord`, `isCommandWord`, `isBuiltinWord`), `checkProcInput`, `approxEq`, `evalExpr` and the precedence parser, `noteTok`. |
| `interpreter/signals.ts` | `STOP_SIGNAL`, `MAX_STACK_FRAMES`. |
| `interpreter/pacing.ts` | `nextFrame`, `macroYield`, `sleep`, `spendFrame`, `tick`, `STEPS_PER_FRAME`, `DEG_PER_FRAME`, `INSTANT_FLUSH`. |
| `interpreter/commands.ts` | `CMD` and all leaf handlers, `COLOR_NAMES`. |
| `interpreter/runtime.ts` | INTERPRETER header comment (frames, scopes, flow control, tail calls), `runExpr`, `runStack`, `run`. |
| **editor/, format/** | |
| `editor/editor.ts` | `editor` (`getValue`, `setValue`, `initValue`, `onChange`, `focus`): the CodeMirror view, its extensions and highlight style, line indicator. |
| `editor/logo-language.ts` | `logoLanguage`: CodeMirror `StreamLanguage` that classifies Logo tokens for highlighting (word lists from `CMD`, `CONTROL_WORDS`, `UNARY`, `BINARY2`, `QUERY_TOKENS`). |
| `format/beautify.ts` | `beautify(src)` — pure. |
| **ui/** | |
| `ui/console.ts` | `con`, `log`, `optSpeed`, `consoleVisible` + `setConsoleVisible`, `setShowConsole`. |
| `ui/program.ts` | `setRunning`, `runProgram`; RUN / STOP / CLR handlers (`resetAll`). |
| `ui/direct.ts` | Direct-mode state, `runDirectCommand`, `tryInDirect` (open direct mode with a line ready to run), direct-mode handlers. |
| `ui/examples-overlay.ts` | Examples panel: search, topic chips, "uses" filter, a card per example with a picture, the preview (picture, commands used, code, Open in editor). |
| `ui/reference-panel.ts` | Commands panel: one table from `REFERENCE` (a `<tbody>` per command: row + card built on first open) plus colour swatches from `COLOR_NAMES`; group chips, ranked search, keyboard; Try / Insert / See also / Used in. |
| `ui/thumbs.ts` | Example pictures: `runForThumbnail` (run headlessly), `exampleSession(n)` (queued, cached), `paintExample(canvas, n, w, h)` (`paintDrawing` scaled to fit). |
| `ui/help-nav.ts` | `helpNav` — `showCommand`, `showExample`, `showExamplesUsing`: links between the two panels (and F1), filled in by each panel so they need not import each other. |
| `ui/overlays.ts`, `ui/options.ts` | `openOverlay` (toggles) / `showOverlay` (opens) / `closeOverlay` / `OVERLAYS`, options panel. |
| `ui/splitter.ts`, `ui/code-buttons.ts`, `ui/files.ts`, `ui/resize.ts` | Splitter + LOG toggle, copy / beautify buttons, file save/load, `resizeCanvas`. |
| `ui/autosave.ts` | `AUTOSAVE_KEY` (`blue-logo:program`; migrates the pre-v8.3 key `claude-logo:program` once), `AUTOSAVE_DELAY_MS` (500), `autosave` (`save`/`load`/`flush`), `restoreProgram`. Driven by `editor.onChange`; flushes on `pagehide` / hidden `visibilitychange`; restores with `editor.initValue` (no undo step). All localStorage access is guarded. |

**State ownership.** Program state is in the session object; modules change its fields (`session.globals = {}`, `session.turtle.x = 0`) and never replace the object. `session.turtle` and `session.procs` are also never replaced (they are reset in place) so references held during a run stay valid. UI state that is a module-level variable is written only by the module that declares it, through a small setter (`setCanvasSize`, `setActiveRctx`, `setCanvasStyle`, `setTurtleStyle`, `setConsoleVisible`, `setShowConsole`) — an ES module cannot assign to a variable it imports; ESLint's `no-import-assign` catches violations.

**Circular imports** exist (e.g. `expr` ⇄ `runtime` ⇄ `commands`; `app` ⇄ `render`) and are harmless because those modules only use each other inside functions. Do not add top-level code that calls into another interpreter module at import time.

### 1.3 Session and LogoIO

`createSession()` (`interpreter/session.ts`) → `{ turtle, drawing, globals, procs, walkTick, isMoving, background }`. The page has one (`src/app.ts`); tests make one per case. CS / RUN-with-clear / CLR call `clearScreen(session, io)`; RUN and CLR also set `session.globals = {}` and `clearProcs(session)`.

`rctx.io` is the interpreter's only way out (`interpreter/io.ts`):

| Method | Browser (`src/app.ts`) | `headlessIO()` |
|---|---|---|
| `log(msg, cls)` | `ui/console.ts` `log` | collects `{msg, cls}` in `.lines`; `.text()` joins them |
| `logs(cls)` → bool | `ui/console.ts` `logs`: false when that class's console filter is off | always true |
| `render()` | `render()` | no-op |
| `paintLine(x1,y1,x2,y2,w,r,g,b)` / `paintLabel(lab)` | paint on `trailCanvas` | no-op |
| `redraw()` | `rebuildTrailCanvas()` | no-op |
| `clearText()` | empty `#console` | clears `.lines` |
| `canvasSize()` → `{w, h}` | `{CW, CH}` | fixed (default 800 × 600) |
| `setSpeed(n)` | moves the speed slider (the RUN button puts it back when the run ends; direct mode keeps it) | no-op |
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
| `DEG_PER_FRAME` | [3, 12, 48, 192] | Degrees of turning per frame, by speed 0–3. |
| `INLINE_THRESHOLD` | 8 | Max tokens for inline `[ block ]` in beautify. |

---

## 2. Interpreter

### 2.1 RunContext (`rctx`)

Created by `makeRunContext(speed, session, io)` for every RUN / direct command.

| Field | Purpose |
|---|---|
| `stopped` | Kill switch. Set by `haltRun()` (STOP / CLR). Checked by `runStack`, `move`, `rotate`, `circle`. |
| `execLine` | `{ n, col, text }`: source position of the statement or operand executed last (`noteTok`, called by `runStack` for every statement and by `parseUnary` for every operand; restored after a procedure used as a value returns, so a later error names the caller's line). Appended to error messages. |
| `speed` | 0–4. Taken from the slider at the start; moving the slider during the run changes it at once (`ui/program.ts`), and `SPEED n` changes it mid-run (and moves the slider). `move` / `rotate` re-read it every step. |
| `session`, `io` | What the program changes / where its output goes (§1.3). |
| `procs` | `session.procs` (shortcut). |
| `globals` | Root scope of this run (set by `run()`); `MAKE` falls back to it. |
| `exprDepth` | Current expression nesting; checked by `deeper()` against `MAX_EXPR_DEPTH`. |
| `instantStepCount`, `frameUsed`, `steps`, `lastYield` | Yield bookkeeping (§2.9). `frameUsed` is the part (0 … 1) of the current animation frame already spent. |
| `wake` | Set while `WAIT` sleeps; `haltRun()` calls it to end the sleep at once. |
| `onFinish` | Optional callback run by `runProgram` after full unwind (CLR uses it). |

**Invariants:** every interpreter function receives `rctx` and never reads `stopped`/`speed` from globals or the DOM. `activeRctx` points to the live context while a program runs and is reset to `null` in `runProgram`'s `finally`. Only one program runs at a time (RUN button disabled; direct mode refuses while `activeRctx` is set).

### 2.2 Tokeniser

`tokenize(src) → token[]`. Per source line: strip `;` comments, mark negative signs, split with

```
/>=|<=|!=|[\[\]()+\-*\/=><~]|[^\s\[\]()+\-*\/=><~]+/g
```

into tokens `{ text, line, col, lineText }`: `line` / `col` are 1-based and point at the token's first character, `lineText` is the trimmed source line (one string shared by the line's tokens).

- **Case:** tokens are uppercased (OPT-4) except `"quoted words`, which keep source case for `LABEL`/`PRINT`. Variable names are uppercased by `varName()` when the `:`/`"` prefix is stripped.
- **Negative sign:** `-` preceded by start-of-line, whitespace, `[` or `(` and directly followed by a digit, `.`, `:`, `(` or a letter becomes the token `~`. `~` is a unary minus that is never binary, so it also ends the previous expression: `SETPOS 0 -100` → `SETPOS 0 ~ 100` (two inputs). Plain `-` is binary in operator position and unary in operand position.
- Positions survive block and procedure slicing, so error lines are right everywhere, including top level.
- **Line breaks** matter in three places only, all through `newLine(tokens, idx)` (does `tokens[idx]` sit on a later line than the token before it?): outside `( )` a binary operator on the next line ends the expression; a `TO` header (name, parameters) is the rest of its line; `DOT` takes inputs only from its own line. Everywhere else a line break is ordinary whitespace.

### 2.3 Procedure Extractor

`extractProcedures(tokens) → { topLevel, newProcs }` — pure. Moves `TO name :p… body END` out of the stream into `newProcs[name] = { params, body }`; the header (name, parameters) is the rest of the `TO` line. Errors name the line: missing name, invalid name (must match `/^[A-Z_]/`), redefinition of a built-in (CMD, `CONTROL_WORDS`, functions, operators, queries, `REPCOUNT[MAX]`, `NOT`), `TO` inside a body (missing `END`), missing `END`, stray `END`.

### 2.4 Expression Evaluator

`evalExpr(tokens, idx, vars, rctx) → { value, nextIdx }` consumes one expression. Internally a precedence-climbing recursive-descent parser over a small state object `p = { tokens, idx, vars, rctx, paren, skip }`:

```
parseBinary(p, minPrec):  left = parseUnary(p)
                          while next token is a BINOP with prec ≥ minPrec:
                              0 AND … / non-zero OR …: right side parsed with skip++, left = 0 / 1
                              right = parseBinary(p, prec + 1)     ← left-associative
                              left  = applyBinop(op, left, right)
parseUnary(p):  noteTok (an operand is required, so a line break can't end here)
                '-' | '~'  → -parseUnary
                NOT        → parseBinary(p, 3) === 0 ? 1 : 0      ← NOT :a = 1 → NOT(:a = 1)
                UNARY fn   → fn(parseUnary)                       ← SIN :x * 2 → (SIN :x) * 2
                else       → parsePrimary
parsePrimary(p): '(' parseBinary(p,1) ')'   (paren > 0: the expression may span lines)
                 IFELSE cond [a] [b] → blockValue(chosen block): exactly one expression
                 BINARY2 fn  parseBinary(p,1) parseBinary(p,1)
                 user proc   args = parseBinary(p,1) × params → runExpr
                 token       → resolveToken
```

Precedence (`BINOP_PREC`): `OR` 1 < `AND` 2 < comparisons 3 < `+ -` 4 < `* / MOD` 5. Unary forms bind tighter than any binary operator. **Skip mode** (`p.skip > 0`, entered with `skipping(p, fn)`) makes `AND` / `OR` short-circuit and passes over IFELSE's unchosen block: tokens are consumed and the syntax checked exactly as usual (so the parse ends at the same place), but nothing is computed — variables and `REPCOUNT` are not read, functions and operators not applied, user procedures not run (`checkProcInput` still runs) — and every skipped part yields 0. Comparisons use `approxEq` (equal within 10⁻¹² relative, absolute near zero); `MOD` has the sign of the divisor. Before each input of a user procedure, `checkProcInput` throws "NAME needs n inputs (:A :B)" when the next token is the end, `]`, `)` or a command word. A non-finite result throws "Number too large". `deeper(p, fn)` wraps every recursive construct (unary chains, parens, procedures-as-values) and throws a Logo error at `MAX_EXPR_DEPTH` instead of hitting the JS stack limit (Chromium survives > 4 000 levels; 500 leaves margin for other engines).

### 2.5 Trampoline Executor (`runStack`)

`runStack(stack, rctx)` is the single implementation of all control flow; `run()` (top level) and `runExpr()` (procedure as a value) are wrappers. It loops while the stack is non-empty and `!rctx.stopped`, looking at the top frame.

#### 2.5.1 Frame Shapes

| Frame | Fields | Handler |
|---|---|---|
| Exec | `tokens, idx, vars` [+ `procBoundary, procName, stmtCall, outputVal`] | Reads the next token; dispatches. Popped when exhausted. |
| Repeat | `isRepeat, body, vars, remaining, iteration, total` | Pushes a body frame with a fresh iteration scope carrying `[REPEAT_SCOPE] = { count, max }`, or pops. `FOREVER` pushes one with `remaining = total = Infinity` (REPCOUNTMAX then throws). |
| While | `isWhile, cond, body, vars` | Evaluates `cond` (token array) each time; pushes body or pops. |
| For | `isFor, varName, end, step, body, vars, nextVal, eps` | Writes the loop variable into its FOR scope, pushes body, advances `nextVal`, or pops. `eps = |step| × 1e-9` absorbs float drift. |

`procBoundary` marks a procedure body. `stmtCall: true` when called as a command (pushed by `runStack`), absent when called by `runExpr`. In `runtime.ts` the frames are a TypeScript union (`ExecFrame | RepeatFrame | WhileFrame | ForFrame`): testing `frame.isRepeat` / `isWhile` / `isFor` narrows the type, and `isLoopFrame` is a type guard. A new loop frame type goes into that union.

#### 2.5.2 Flow Control

| Word | Behaviour |
|---|---|
| `STOP` | Unwind to the nearest `procBoundary` (set `stopFired`, truncate the stack there); at top level, clear the stack. |
| `OUTPUT` / `OP` | Evaluate, find the nearest boundary. `stmtCall` boundary → error ("You don't say what to do with …"). Otherwise store `outputVal` and truncate. No boundary → error. |
| `BREAK` / `CONTINUE` | Scan down to the innermost loop frame (`isLoopFrame`); hitting a `procBoundary` first → error. BREAK truncates to `k` (drops the loop), CONTINUE to `k + 1` (keeps it). |
| `IF` / `IFELSE` | Evaluate, `extractBlock` (a block may start on the next line), push the chosen body with the same `vars`. |
| `REPEAT` / `FOREVER` / `WHILE` / `FOR` | Parse, push the typed control frame. |
| User procedure | Evaluate the arguments in the caller's scope, apply the **tail-call rule**, push `{ tokens: body, vars: scope, procBoundary, procName, stmtCall: true }`. |
| Leaf command | `frame.idx = await CMD[cmd](tokens, idx, vars, rctx)`. |
| Anything else | Specific error (extra value, operator, value-producing word used as a command, unknown command). |

**Tail-call rule:** before pushing a statement-level procedure frame, pop every top frame that has nothing left to run (`idx >= tokens.length`), stopping at loop frames and at expression boundaries (`procBoundary && !stmtCall`, which `runExpr` must keep to read `outputVal`). A popped procedure frame's scope is also dropped — the new scope is based on its parent — when every variable it owns (`Object.keys`) is a parameter of the callee: those are shadowed, so the drop cannot be observed, and endless recursion (also mutual) runs in constant stack and memory. A caller with other locals (`LOCALMAKE`, `LOCAL`) stays in the chain, so dynamic scoping gives the same result in tail and non-tail position.

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

`resolveToken(tok, vars, rctx) → number` handles single value tokens: `QUERY_TOKENS` (a `Map` of name → `(turtle, rctx) => value`; `SCRWIDTH`/`SCRHEIGHT` read `rctx.io.canvasSize()`: `XCOR YCOR HEADING PENDOWN? PD? PENUP? PU? SCRWIDTH SCRHEIGHT`), `REPCOUNT`/`REPCOUNTMAX`, `:var` (a `"word` here is an error: words are not numbers), and strict number literals (`/^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?$/`). Errors distinguish unknown variables, queries written with a colon, commands used as values, stray brackets/operators and unknown tokens. Adding a query is one `QUERY_TOKENS` entry; `DOT`/`LABEL`/`SETCOLOR` argument detection (`isValueStart(tok, rctx)`) uses the same table and also accepts user procedure names (they may OUTPUT).

### 2.8 Control-Flow Sentinel

`STOP_SIGNAL` (frozen) is the only thrown control signal. Thrown by `ouch()` (canvas edge — the message is already logged) and by `runExpr` after the STOP button. `runProgram` treats it as a quiet end. Logo `STOP`/`OUTPUT`/`BREAK`/`CONTINUE` never throw; `runStack` unwinds its own stack.

### 2.9 Yielding and Pacing

| Helper | Used by | Behaviour |
|---|---|---|
| `spendFrame(rctx, part)` | `move`, `rotate`, `tick` | Animated speeds share one budget per frame: add `part` to `rctx.frameUsed`; when it reaches 1, `render()` + `nextFrame` and start a new frame. A move sub-step costs `1 / STEPS_PER_FRAME[speed]`, a degree of turning `1 / DEG_PER_FRAME[speed]`, a `tick` like a sub-step — so many short commands animate as fast as one long one, and `RT 0` / `FD 0` cost nothing. |
| `nextFrame(rctx)` | `spendFrame` | Await `rctx.io.nextFrame()` (`requestAnimationFrame` in the page). |
| `macroYield(rctx)` | instant `move`, `tick`, `runStack` | Await `rctx.io.macroYield()` (`setTimeout(0)`) — lets the browser paint and handle clicks. |
| `sleep(ms, rctx)` | `WAIT` | Cancellable timer; `rctx.wake` ends it early. |
| `tick(rctx)` | `SETPOS`, `DOT`, `LABEL` | Animated speeds: `spendFrame(rctx, 1 / STEPS_PER_FRAME[speed])`. Instant: counts toward `INSTANT_FLUSH`. |

All update `rctx.lastYield`.

### 2.10 Command Dispatch Table

`CMD['NAME'] = async (t, i, v, rctx) => nextIdx`. Aliases share the function (`CMD['FD'] = CMD['FORWARD']`). Flow-control words (`CONTROL_WORDS`) are handled in `runStack`. Helpers: `wordArg` (a `"word` argument with case kept), `isValueStart` (can a token start an expression — used where the argument is optional or may be text) — arguments may sit on the next line, except for `DOT`, which takes inputs only from its own line (`newLine`), so `DOT` alone on a line takes none. Handlers compare `t[i]?.text`.

### 2.11 Error Handling

Errors are plain `Error`s with Logo-level messages. `execute` logs `✗ message` plus `line N: source` from `rctx.execLine`. Parse errors (from `extractProcedures`) are reported by `parseProgram` before anything runs. Warnings (clamps, caps) are logged and execution continues.

---

## 3. Visuals

### 3.1 Coordinate System and HiDPI

`CW`/`CH` are the logical canvas size in CSS pixels = Logo units. The backing store is `CW×DPR` by `CH×DPR` device pixels (`DPR = devicePixelRatio`, re-read on every resize, so browser zoom is handled). The main canvas and `trailCanvas` draw through `setTransform(DPR,0,0,DPR,0,0)`, so **all drawing code works in logical units — always use `CW`/`CH`, never `canvas.width/height`** for geometry. Saved PNGs are at device resolution.

```
canvas_x = CW / 2 + logo_x          dx = sin(heading) × dist
canvas_y = CH / 2 - logo_y          dy = cos(heading) × dist
```

`TOWARDS` uses `atan2(dx, dy)` (north = 0, clockwise).

### 3.2 Render Pipeline

`render()` resets the transform, then composites back to front: background (flat fill), `trailCanvas` blit (1:1, `imageSmoothingEnabled = false`), turtle (if visible). Context state is re-applied per frame because resizing a canvas resets it.

### 3.3 Background

A flat fill: `session.background` when a program set one with `SETBG` (`drawBackground(bg)`), otherwise the Options canvas style — BEIGE `#f4eedf` (default) or WHITE `#ffffff`. Nothing is cached; saved PNGs include it. `clearScreen` resets `session.background` to null except when CS calls it (`{ keepBackground: true }`). The Examples thumbnails fill with it too.

### 3.4 Trail Storage

`session.drawing` (`turtle/drawing.ts`) holds two pre-allocated typed arrays: `f32` (x1, y1, x2, y2, w per segment, Logo coordinates) and `u8` (r, g, b), plus `len`, `capWarned`, `labels`, `labelCapWarned`. ~1.1 MB at cap. A zero-length segment is a DOT (filled circle, diameter w).

| Function | Purpose |
|---|---|
| `trailPushIfRoom(rctx, …)` | Cap check + store + `io.paintLine`. Used by instant moves, SETPOS, DOT. |
| `trailPushQuiet(rctx, …)` | Cap check + store, no paint — for segments already painted step by step. |
| `segment(drawing, i)` | Read one segment as `[x1, y1, x2, y2, w, r, g, b]` (tests). |
| `paintLine(...)` (`render/trail.ts`) | Paint a segment/dot onto `trailCanvas` without storing it. |
| `rebuildTrailCanvas()` (`render/trail.ts`) | Resize `trailCanvas` to the backing size, replay all segments (style changes batched) and labels with `paintDrawing` (`render/paint.ts`). |
| `clearScreen(session, io, { keepBackground? })` (`interpreter/session.ts`) | Reset drawing, turtle and (unless `keepBackground`, which CS passes) `session.background`; `io.redraw()`. Used by CS, RUN-with-clear and CLR. |

`0 ≤ len ≤ MAX_TRAIL_SEGS`; the cap warning is logged once (`capWarned`).

### 3.5 Label Store

`session.drawing.labels[]` of `{ x, y, text, r, g, b }`, capped at `MAX_LABELS` (`addLabel`). `paintLabel` draws 16 px VT323. Labels are replayed by `rebuildTrailCanvas`, including once `document.fonts.ready` resolves (so labels drawn before the web font loaded are repainted).

### 3.6 Turtle Sprite

Both styles are centred on the pen position and show the pen state as a dot there: red = pen down, white = pen up.

**TURTLE (default):** a blue flat vector turtle — the same drawing as the app logo `src/assets/logo.svg` (`drawTurtleSprite`, about 26 × 40 px: shell with a centre plate, head with eyes, four legs, tail), drawn straight into the main context every frame in logical units, so it is sharp at any DPR. While `session.isMoving` the legs swing in diagonal pairs, driven by `session.walkTick` (16-bit counter); a resting turtle is static.

**TRIANGLE:** small triangle with the same pen-state dot.

### 3.7 Motion

| Speed | Move sub-steps / frame | Degrees / frame |
|---|---|---|
| 0 (slowest) | 1 | 3 |
| 1 | 4 | 12 |
| 2 | 16 | 48 |
| 3 | 64 | 192 |
| 4 (instant) | whole move, no frame | whole turn |

- **`move(dist, rctx)`** computes the end point and clips it with `clipForRun` → `clipToCanvas(…, w, h)` against `io.canvasSize()` (exact segment/rectangle intersection). The end point is snapped to a 10⁻⁹ grid (`snap`), so closed shapes return exactly to their start. Animated: `round(len × 1.2)` sub-steps (none for a zero-length move) interpolated from the start point, each painted with `paintLine` and paid for with `spendFrame(rctx, 1 / STEPS_PER_FRAME[speed])`; after the loop one segment for the distance actually walked is stored (`trailPushQuiet`). Instant: one `trailPushIfRoom`, `macroYield` every `INSTANT_FLUSH` moves. If the path was clipped: `ouch(rctx)` (log OUCH, throw `STOP_SIGNAL`).
- **`SETPOS` / `SETXY` / `SETX` / `SETY`** share `goTo` (`commands.ts`): the same clipping and `ouch(rctx)`, then `tick()`.
- **`rotate(deg, rctx)`** turns in pieces that fill the current frame's remaining budget (`DEG_PER_FRAME[speed]` degrees per frame, `spendFrame`); at the end, unless stopped, the heading is `normAngle(start + deg)` — normalised to [0, 360) and snapped to 10⁻⁹. Instant: `normAngle(angle + deg)` at once.
- **`circle(r, rctx)`** — polygon with `max(36, round(|r|))` sides: `move(2πr/steps)` + `rotate(360/steps)`. Negative r mirrors.
- **`arc(deg, r, rctx)`** — the same step density (`ceil(max(36, round|r|) × |deg| / 360)` steps), but placed on the true arc: `rotate(step/2)`, then chords `2r·sin(step/2)` separated by full-step turns, a half-step turn at the end. Unless stopped the turtle is then put on the exactly computed end point (centre = start + k·n(h₀), end = centre − k·n(h₀ + deg), n(h) = (cos h, −sin h), k = r·sign(deg)), removing the 10⁻⁹ drift of the snapped steps. `r = 0` only turns. (CIRCLE keeps its older polygon so existing drawings do not move.)

---

## 4. User Interface

### 4.1 Layout

Horizontal flex: left panel `#panel` (`clamp(360px, 32vw, 520px)` — it follows the window, not the font size) with title, code editor, splitter, console, direct-mode panel and buttons; right panel `#canvas-panel` (`flex: 1`) with the canvas and overlays.

### 4.1a Look (fonts and colours)

- **Fonts:** the interface uses the system UI font (`--font-ui`: `system-ui`, Segoe UI, Roboto, …); code, console, direct input and the code samples in the overlays use the system monospace font (`--font-mono`: `ui-monospace`, Cascadia Mono, SF Mono, Menlo, Consolas, DejaVu Sans Mono, …). Nothing is downloaded for them. VT323 is used only for the title and for LABEL text on the canvas.
- **Sizes:** buttons and labels 13–14 px (fixed); reading text `--fs-code` 15 px, `--fs-console` / `--fs-read` 14 px, `--fs-small` 13 px, all × `--fs-base`.
- **Colours:** design tokens in `:root` of `app.css` (`--bg`, `--panel`, `--surface`, `--raised`, `--border`, `--text`, `--muted`, `--faint`, `--accent`, run / stop colours). Buttons are neutral; only Run (green) and Stop (red) are coloured; `--accent` blue marks focus and active toggles. Every text colour is at least 4.5:1 against the background it sits on.
- **Wording:** sentence case for the interface ("Clear screen on run"); capitals only for Logo commands.

### 4.2 Code Editor

CodeMirror 6, created by an IIFE in `editor/editor.ts` and mounted in `#editor`. Public API `{ getValue, setValue, initValue, onChange, focus, insert, onHelp }` — the rest of the app never touches CodeMirror directly.

- **Extensions:** `lineNumbers`, `highlightActiveLineGutter`, `history`, `bracketMatching`, `logoLanguage`, `syntaxHighlighting(logoHighlight)`, `lineWrapping`, a placeholder (the welcome text, shown while empty), and a keymap: Tab inserts two spaces, Shift+Tab un-indents, Ctrl/Cmd+/ toggles `;` comments, F1 asks for help on the word at the caret (`onHelp` listeners; `wordAt` uses the tokenizer's word characters), then CodeMirror's history and default keymaps.
- **Highlighting:** `logoLanguage` (`editor/logo-language.ts`) is a `StreamLanguage` that mirrors `tokenize()`'s word / operator split and tags comments, `"words`, `:variables`, numbers, operators, brackets, `TO`/`END`, control words, commands and functions. Token colours are in `logoHighlight` (`editor.ts`): commands blue, control words and `TO`/`END` purple, functions cyan, `:variables` yellow, numbers orange, `"words` green, comments grey; all at least 4.5:1 on the editor background. Editor chrome: `#editor .cm-…` rules in `app.css`.
- **getValue()** is the document text, exactly.
- **setValue(src)** replaces the whole document as its own undo step (`isolateHistory`), so loading an example, LOAD or beautify can be undone; the caret goes to the start.
- **insert(text)** puts text at the caret on a line of its own, as its own undo step (the Commands panel's Insert).
- **initValue(src)** creates a fresh `EditorState`: empty undo history and no change event (autosave restore).
- **onChange(fn)** is called from an `updateListener` whenever the document changes (typing, setValue, undo / redo). The same listener updates the **L:N indicator** on every change and selection move.

### 4.3 Splitter and Console Toggle

8 px drag bar (with a grip line) resizing `#code-wrap` (mouse + touch). The LOG button hides/shows the console; dragging while hidden re-shows it (`applyDragGuarded`).

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
| Clear (CLR) | `resetAll()` (trail, labels, turtle, variables, procedures, console). While running: halt first, reset in `rctx.onFinish`. |
| Direct | Toggles the terminal input. Enter / ↵ runs `runDirectCommand` (history with ↑/↓). Editor procedures are re-read each time; variables persist. While a program runs the command is refused and the text is kept. |
| ≡ / ⎘ / LOG / SAVE / LOAD / ⚙ | Beautify, copy, console toggle, save/load `.logo` (File System Access API with `downloadBlob` / `pickFileWithInput` fallbacks, e.g. in cross-origin iframes), options. |

### 4.6 Overlays and Options

One overlay at a time (`openOverlay` toggles, Escape closes all): Commands, Examples, Options.

**Commands** (`ui/reference-panel.ts`): one table built from `REFERENCE` (`src/reference.ts`), so the columns line up, with a `<tbody>` per command holding its row (syntax, description) and its card; then the colour swatches (from `COLOR_NAMES`; aliases with the same colour are folded: GRAY / GREY).
- **Chips** under the search box show one section, or only the colours; All shows everything.
- **Search** (opening the panel focuses it) ranks with `scoreEntry`: an exact Logo word (`fd` → FORWARD) 100, a word prefix 50, other syntax text 30, a tag 20 (prefix 15), the description 10; every query word must match. While searching, the hits are one flat list, best first (the `<tbody>`s are re-ordered; section heads hidden). Escape clears; ↓ moves into the list, ↑ ↓ between rows, Enter opens / closes a card (Enter in the search box opens the best hit).
- **Cards** open on a click or Enter and are built on first open: `more`, `forms` ("Also written"), `examples` — **Try** (one-line examples, and a click on a swatch) opens direct mode with the line in the input, ready to run with Enter, nothing runs by itself; **Insert** puts the example into the editor at the caret (`editor.insert`) — **See also** links (open that card) and **Used in**: the first four examples from `examplesUsing(entry words)` as small pictures (click → the example's preview) and "All n examples →" (the Examples panel filtered to them).
- **F1** in the editor opens the card of the word at the caret (or searches for it).

**Examples** (`ui/examples-overlay.ts`): a search box (title, description, topic, or a command the example uses), topic chips (`EXAMPLE_TOPICS`, with counts), an optional "Examples that use FOR ✕" filter (set from a command card), and a grid of cards (picture, title, description). A click on a card opens its **preview**: a larger picture, title, description, topic, "Commands used" (links to their cards; the ones the example `shows` are outlined) and the code; **Open in editor** loads it (one undo step) and closes the panel, "← All examples" goes back. The pictures (`ui/thumbs.ts`) are made the first time they are needed, one example at a time: `runForThumbnail` runs the example headlessly in its own session (`headlessIO` on an 800 × 600 world, yields resolved at once, 1.5 s cap); the session is cached, and `paintExample` scales the drawing to any canvas (at most 1.5×, lines at least 1 px). The page's session is never touched.

Options:

| Section | Controls |
|---|---|
| Save | Save canvas as PNG (device resolution). |
| Font size | Small / Medium / Large → `--fs-base` 1 / 1.25 / 1.5. Scales the reading text (editor, console, direct input, overlays), not the buttons or the panel width. |
| Console log | Motion, Info, Status, Errors. |
| Behaviour | Clear screen on run (on); Speed slider 0–4 (default 0). |
| Canvas / Turtle | Beige / White; Turtle / Triangle. |

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
newLine(tokens, idx) → bool · noteTok(tok, rctx)
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
move(dist, rctx) / rotate(deg, rctx) / circle(r, rctx) / arc(deg, r, rctx) → async void
clipToCanvas(x0, y0, x1, y1, w, h)               → null | [x, y]
clipForRun(rctx, x0, y0, x1, y1)                 → null | [x, y]
tick(rctx) / nextFrame(rctx) / macroYield(rctx) / sleep(ms, rctx) → Promise

// Drawing store (core)
trailPushIfRoom(rctx, x1,y1,x2,y2,w,r,g,b) → bool · trailPushQuiet(rctx, …) → bool · addLabel(rctx, lab) → bool
clearScreen(session, io, {keepBackground}?) · clearProcs(session) · segment(drawing, i) → [x1,y1,x2,y2,w,r,g,b]

// Rendering (browser)
render() · rebuildTrailCanvas() · paintLine(x1,y1,x2,y2,w,r,g,b) · paintLabel(lab)
toCanvas(x, y) → [cx, cy] · drawTurtleSprite(ctx, cx, cy, turtle, tick, moving)
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
- Add it to `REFERENCE` (`src/reference.ts`; the unit test fails until it is listed) with at least one runnable example, related commands in `see` and search synonyms in `tags`; and, if it shows something new, add an example file (`;; shows:` the command). "Used in" on its card then follows automatically. Built-in names are automatically protected from `TO` redefinition.

### 6.2 Adding a Loop Construct

Push a typed frame (`{ isMyLoop: true, body, vars, … }`) from the exec-frame dispatch, handle `frame.isMyLoop` at the top of the `runStack` loop (push a body frame or pop), and add it to `isLoopFrame` so BREAK / CONTINUE and the tail-call rule recognise it. Nothing else is needed — expression-context code uses the same `runStack`.

### 6.3 Adding a Math Function

- **One input:** add the name to `UNARY` and an implementation to `UNARY_FNS`. The argument is the single operand after the name (`parseUnary`), so `MYFN :x * 2` is `(MYFN :x) * 2`. Throw on domain errors: `throw new Error('MYFN: argument ' + a + ' must be > 0')`.
- **Two inputs:** add to `BINARY2` and `BINARY2_FNS` (`(a, b, turtle) => …`).
- **A query (no input):** one entry in `QUERY_TOKENS` (`(turtle, rctx) => value`).
- **An infix operator:** add to `BINOP_PREC` and `applyBinop`, and to the tokenizer regex if it uses new characters (and to beautify's).

### 6.4 Canvas / Turtle Styles

Add a pill in the options markup (`index.html`), a `case` in `drawBackground()` or `render()`, and wire the pill (`ui/options.ts`) to call `setCanvasStyle` / `setTurtleStyle` and `render()`.

### 6.5 Adding a Module

Put it in the folder of its layer, `export` only what other modules use, and import it from `main.ts` if it wires DOM handlers. Program state belongs in the session (§1.3); UI state that other modules must change gets a setter (§1.2). Code in `interpreter/`, `turtle/` or `format/` must stay DOM-free. Import with the `.ts` file name; use `import type` for types. Run `npm run lint` — `tsc` reports missing imports and type errors (in the core also any browser API), ESLint stale imports.

### 6.6 Adding an Example

Add `examples/NN-name.logo` with `;; title:`, `;; desc:` and `;; topic:` lines at the top (the topic is one of `EXAMPLE_TOPICS` in `src/examples.ts`; a unit test checks it), and optionally `;; shows: FOR, SETCOLOR` — the commands it is about: it is listed first in those commands' "Used in" (a unit test checks the example uses them). It appears in the EXAMPLES overlay in file-name order, and `npm test` runs it automatically, headless and in the browser (it must end with `✓ Done!`; list it in `ENDS_WITH_OUCH` in `tests/cases.js` if it is meant to stop at the edge). It must also fit a 640 × 480 canvas (no OUCH), and its drawing is snapshotted (`tests/unit/__snapshots__/examples.test.ts.snap`: a character picture of the canvas, counts, bounds and a hash of every segment) unless it uses `RND` / `RANDOM`. A new example writes its snapshot on the first run; after an intended change to an example or to the drawing code, run `npx vitest run -u` and review the snapshot diff. The Examples panel shows its picture automatically.
