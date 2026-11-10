# Blue Logo

Browser-based Logo turtle graphics environment for teaching. Plain JavaScript ES modules in `src/`, built with Vite into a static site and served on GitHub Pages. No framework and no runtime dependencies.

```
npm install        # once
npm run dev        # dev server with live reload
npm test           # unit tests + build + browser tests (must pass)
npm run test:watch # unit tests in watch mode (Vitest, ~1 s)
npm run lint       # ESLint (must pass)
```

The built app does not run from `file://` (browsers block module scripts there). Use `npm run dev`, or `npm run preview` after `npm run build`.

Specification is split into two files:
- **`blue-logo-lang-spec.md`** — Language reference: commands, expressions, scoping, error messages. What a Logo programmer needs.
- **`blue-logo-impl-spec.md`** — Implementation reference: architecture, interpreter internals, render pipeline, UI, extension guide. What a developer needs.

---

## Project files

| Path | Purpose |
|---|---|
| `index.html` | The app's markup (Vite entry). `%APP_VERSION%` is filled in at build time. |
| `src/` | The app: `main.js` (entry), `app.js` (the page's session + browser IO), `render/`, `turtle/`, `interpreter/`, `editor/`, `format/`, `ui/`, `styles/app.css`, `assets/fonts/`. Module map: impl-spec §1.2. |
| `examples/` | One `.logo` file per example (`;; title:` / `;; desc:` header lines). Loaded at build time; the number prefix sets the order. |
| `versions/` | Frozen single-file HTML versions up to v8.1 (from when the project was called "Claude Logo"; file names kept so old links work). Deployed to Pages at `/versions/…` and at the root (old links keep working). Never edited. |
| `blue-logo-lang-spec.md` | Language specification. |
| `blue-logo-impl-spec.md` | Implementation specification. |
| `CHANGELOG.md` | Full version history. Add an entry for every version bump. |
| `TODO.md` | Open work items. |
| `REVIEW.md` | v7.3 project review (all items resolved in v8.0; kept for reference). |
| `tests/cases.js` | Language regression cases, shared by the unit and browser tests. |
| `tests/unit/` | Vitest unit tests of the core in Node: language cases, all examples, interpreter state, tokenizer, procedures, beautify, clipping. `run-logo.js` runs a program headlessly. |
| `tests/run-examples.js` | Browser test (Playwright) against the built `dist/`: all examples, beautify idempotency, the shared cases, UI checks. |
| `docs/architecture-proposal.md` | Architecture review & modernisation roadmap (agreed direction, Nov 2026). |
| `third-party/` | Licenses of bundled third-party assets (VT323 font, OFL). |
| `docs/archive/` | Superseded documents (old v4.1 spec, completed graph-features plan). |
| `.github/workflows/pages.yml` | On every PR and push: lint, build, test. On `main`, after the tests pass: deploys the tested `dist/` plus `versions/` to GitHub Pages. |
| `package.json` | Version number, scripts and dev tooling (Vite, Vitest, ESLint, Playwright). |
| `vite.config.js`, `eslint.config.js` | Build, Vitest and lint configuration (including the core boundary rule). |

Current version: **v8.3** (`package.json` → `8.3.0`)

---

## Architecture in one paragraph

Five layers, one folder each under `src/`: **rendering** (`render/` — HiDPI canvas compositing, sprite, background, trail layer), **turtle** (`turtle/` — turtle state, drawing store of segments + labels, `move`/`rotate`/`circle`), **interpreter** (`interpreter/` — tokeniser → procedure extractor → `runStack` trampoline ⇄ precedence-climbing expression parser, `CMD` table, session, LogoIO), **editor** (`editor/` — contenteditable with syntax highlighting, caret preservation and its own undo history; `format/beautify.js`), **UI shell** (`ui/` — `runProgram`, buttons, direct mode, splitter, overlays, options, resize, files, autosave). `src/main.js` imports everything; UI modules wire their DOM handlers on import.

**The core has no DOM** — `interpreter/`, `turtle/`, `format/` see no browser globals and cannot import `render/`, `ui/`, `editor/`, `app.js` (ESLint enforces it). That is what lets Vitest run the interpreter in Node.
- **State** a program changes lives in a **session** (`createSession()` → `{ turtle, drawing, globals, procs, walkTick, isMoving }`), reached as `rctx.session`. The page has one, exported by `src/app.js`; tests make a fresh one per case.
- **Output** goes through **`rctx.io`** (LogoIO, `interpreter/io.js`): `log`, `render`, `paintLine`, `paintLabel`, `redraw`, `clearText`, `canvasSize`, `setSpeed`, `nextFrame`, `macroYield`. The browser implementation is `io` in `src/app.js`; tests use `headlessIO()`. New side effects = a new `io` method, implemented in both.

**Module state rule:** change session fields, never replace the session (`session.turtle` and `session.procs` are reset in place, too). For UI state held in module variables, a module never assigns to a variable it imports (ES modules forbid it; ESLint `no-import-assign` catches it) — the owner exports a setter: `setCanvasSize`, `setActiveRctx`, `setCanvasStyle`, `setTurtleStyle`, `setConsoleVisible`, `setShowConsole`. Export only what other modules use.

Data flow during a RUN:
```
btn-run → parseProgram(editor.getValue(), io) → tokenize() → extractProcedures() → { topLevel, newProcs }
        → registerProcs(session, newProcs, io)
        → runProgram(topLevel)              → makeRunContext(speed, session, io) → rctx ; activeRctx = rctx
            → execute(topLevel, rctx)       → run(topLevel, 0, session.globals, rctx) → runStack(stack, rctx)
                → CMD handlers / control flow / evalExpr()
                → move(dist, rctx) → trailPush…(rctx, …) [session.drawing + io.paintLine] + io.render()
              → logs "✓ Done!" or "✗ error + line"
            → finally: activeRctx = null; setRunning(false); rctx.onFinish?.()
```

### RunContext (`rctx`)

Created by `makeRunContext(speed, session, io)` per run. Fields: `session`, `io`, `stopped` (kill switch, set by `haltRun()`), `execLine` `{n, text}` (current source line for errors), `speed` 0–4 (slider snapshot; `SPEED n` updates it and the slider), `procs` (= `session.procs`), `globals` (root scope, set by `run()`), `exprDepth`, yield bookkeeping (`instantStepCount`, `tickCount`, `steps`, `lastYield`), `wake` (ends a WAIT early), `onFinish` (callback after unwind; CLR uses it).

**Invariants to preserve:**
- Every interpreter function receives `rctx` and reaches state only via `rctx.session` and the outside world only via `rctx.io`.
- `activeRctx` points to the live context while a program runs; it is set and cleared only by `runProgram()` (via `setActiveRctx`). Only one program runs at a time (RUN disabled; direct mode refuses while running).
- STOP / CLR call `haltRun()` — never set `stopped` directly (WAIT needs `rctx.wake`).
- Use `CW` / `CH` (logical canvas size) for geometry, never `canvas.width/height` (those are device pixels).
- Every long-running path yields (`nextFrame` / `macroYield` / `tick`), so STOP always works.

---

## Function signatures (quick reference)

Check these before editing call sites.

```
run(tokens, startIdx, vars, rctx)                → async void   (sets rctx.globals)
runStack(stack, rctx)                            → async void   (all control flow)
runExpr(name, proc, scope, rctx)                 → async number (procedure used as a value)
evalExpr(tokens, idx, vars, rctx)                → async {value, nextIdx}
CMD['NAME'] = async (t, i, v, rctx) => nextIdx
resolveToken(tok, vars, rctx)                    → number
tokenize(src) → token[] · extractBlock(tokens, idx) → {body, nextIdx} · extractProcedures(tokens) → {topLevel, newProcs}
skipSen(tokens, idx, rctx?) → idx
setVar(vars, name, value, rctx) · procScopeOf(vars, rctx) · repeatInfo(vars)
createSession() → session · headlessIO({width, height}?) → io · makeRunContext(speed, session, io) → rctx · haltRun()
parseProgram(src, io) → {topLevel, newProcs} | null · registerProcs(session, newProcs, io) · execute(tokens, rctx) · runProgram(tokens)
move(dist, rctx) · rotate(deg, rctx) · circle(r, rctx) · clipToCanvas(x0,y0,x1,y1, w,h) → null | [x,y] · clipForRun(rctx, x0,y0,x1,y1)
tick(rctx) · nextFrame(rctx) · macroYield(rctx) · sleep(ms, rctx)
trailPushIfRoom(rctx, …) → bool · trailPushQuiet(rctx, …) → bool · addLabel(rctx, lab) → bool · clearScreen(session, io) · clearProcs(session)
render() · rebuildTrailCanvas() · paintLine(…) · paintLabel(lab)        (browser only)
```

---

## Module map

Full table with the contents of each file: impl-spec §1.2. Each module keeps the `// ──` section comments of the old single file, so `grep -rn '// ──' src` still works as a table of contents.

| Folder / file | Main contents |
|---|---|
| `app.js` | The page's `session` and browser `io` |
| `render/` | `canvas.js` (CW/CH/DPR) · `sprite.js` · `background.js` · `trail.js` (`trailCanvas`, `paintLine`, `paintLabel`, `rebuildTrailCanvas`) · `render.js` |
| `turtle/` | `state.js` (`mkTurtle`, `resetTurtle`) · `drawing.js` (segment + label store) · `motion.js` (`move`, `rotate`, `circle`, `clipToCanvas`, `ouch`) |
| `interpreter/` | `session.js` · `io.js` (LogoIO, `headlessIO`) · `context.js` (`makeRunContext`, `haltRun`) · `execute.js` (`parseProgram`, `registerProcs`, `execute`) · `scope.js` · `tokenizer.js` · `procedures.js` · `expr.js` · `signals.js` · `pacing.js` · `commands.js` (`CMD`) · `runtime.js` (`runStack`, `run`, `runExpr`) |
| `editor/editor.js`, `format/beautify.js` | Editor + undo history; pure formatter |
| `ui/` | `console.js` (`log`) · `program.js` (`runProgram`, RUN/STOP/CLR) · `direct.js` · `splitter.js` · `overlays.js` · `examples-overlay.js` · `options.js` · `files.js` · `autosave.js` · `resize.js` · `code-buttons.js` |
| `examples.js` | Loads `examples/*.logo` |

---

## Common tasks — sections to read first

| Task | Read these sections |
|---|---|
| Add a CMD command | `interpreter/commands.js` — copy a nearby handler; impl-spec §6.1 |
| Add a math function / query / operator | `interpreter/expr.js`; impl-spec §6.3 |
| Add a loop construct | `interpreter/runtime.js` (`isRepeat`/`isWhile`/`isFor` + `isLoopFrame`); impl-spec §6.2 |
| Change scoping | `interpreter/scope.js` (header comment, `setVar` / `procScopeOf` / `repeatInfo`); lang-spec §6 |
| Change animation / pacing | `turtle/motion.js`, `interpreter/pacing.js`, `io.nextFrame` in `src/app.js` |
| Add a side effect (new output) | a method in the LogoIO contract (`interpreter/io.js`), implemented in `src/app.js` and `headlessIO()` |
| Change error reporting | `interpreter/execute.js` (`execute`) + `rctx.execLine` |
| Change STOP / CLR | `interpreter/context.js` (`haltRun`) + `ui/program.js` |
| Change trail storage / rendering | `turtle/drawing.js` (data) · `render/trail.js` + `render/render.js` (painting) |
| Change editor / highlighting / undo | `editor/editor.js` |
| Change beautify formatting | `format/beautify.js` — pure function, safe to edit in isolation |
| Add or edit an example | `examples/NN-name.logo`; impl-spec §6.6 |

---

## Key constants (quick reference)

| Constant | Value | Purpose |
|---|---|---|
| `MAX_TRAIL_SEGS` | 50 000 | Cap on stored segments (one per move, per SETPOS line, per DOT) |
| `MAX_LABELS` | 500 | Cap on LABELs |
| `MAX_CIRCLE_R` | 2 000 | Cap on \|radius\| |
| `MAX_STACK_FRAMES` | 10 000 | runStack frames (non-tail recursion depth) |
| `MAX_EXPR_DEPTH` | 500 | Expression nesting (parens, unary chains, procedures as values) |
| `MAX_LOG_LINES` | 500 | Console line cap |
| `INSTANT_FLUSH` | 150 | Instant-mode steps between paint yields |
| `STEPS_PER_FRAME` | [1, 4, 16, 64] | Animated steps per frame by speed 0–3 |
| `INLINE_THRESHOLD` | 8 | Max tokens for inline `[ block ]` in beautify |
| `SPRITE_SIZE` / `SPRITE_OFFSET` | 64 px / 18.8 px | Turtle sprite size / nose-to-centre offset |

---

## Versioning

Format: `MAJOR.MINOR`

- Bump **MINOR** for bug fixes, polish, small additions (v8.0 → v8.1).
- Bump **MAJOR** for releases with breaking language changes or after a full review pass.

Release steps:
1. Bump `version` in `package.json` (`8.3.0` → `8.4.0`; the app shows `v8.4`). Run `npm install` so `package-lock.json` follows.
2. Add a `CHANGELOG.md` entry, and update "Current version" above and the version header in both spec files if they changed.
3. `npm run lint` and `npm test` — must pass.
4. After merging to `main` (CI deploys it), tag the release: `git tag vX.Y`.

`versions/` is frozen at v8.1 — releases are no longer copied there; the git tags are the archive.

---

## Changelog convention

The changelog lives in **`CHANGELOG.md`**.

Add a new `## vX.Y` block at the top for every version bump:

```
## vX.Y  YYYY-MM-DD
**SHORT TITLE**
- * BUG: description — what was wrong, what the fix is.
- ~ CHANGE: description of behaviour or design change.
- + ADDITION: new feature or command.
- - REMOVAL: dead code or deprecated behaviour removed.
```

Severity markers in reviews use 🔴 (bug) / 🟡 (design) / 🟢 (polish). Use plain text in the changelog.

---

## Making changes

### Before touching code
1. Read the relevant section of `blue-logo-impl-spec.md` (internals) or `blue-logo-lang-spec.md` (language behaviour).
2. Check **Known Limitations** in `blue-logo-lang-spec.md` §7 — the behaviour may be intentional.
3. Read the code section you are changing, not just the lines around the change.

### Adding a command
1. Register in `CMD` in `interpreter/commands.js` (impl-spec §6.1); add aliases (`CMD['ALIAS'] = CMD['FULLNAME']`).
2. Validate input; clamp + warn or throw, consistent with lang-spec §8.
3. State via `rctx.session`, output via `rctx.io` — no imports from `render/` / `ui/` (lint fails).
4. If it draws without `move()`, store via `trailPushIfRoom(rctx, …)` / `addLabel(rctx, …)` and end with `await tick(rctx)`.
5. Add it to the commands reference table in `#ref-body` (`index.html`) and to lang-spec §2.
6. Add an example file to `examples/` if it shows something new, and a case to `tests/cases.js`.

### Adding a math function
Add the name to `UNARY` + `UNARY_FNS` (one input — the single operand that follows, so `FN :x * 2` = `(FN :x) * 2`) or `BINARY2` + `BINARY2_FNS` (two full-expression inputs). Throw descriptive domain errors: `throw new Error('MYFN: argument ' + a + ' must be > 0')`.

### Adding a loop construct
Push a typed frame with a unique boolean discriminator, handle it at the top of the `runStack()` loop, and add it to `isLoopFrame`. `runStack` is the single trampoline for both statements and expression-context procedure calls — nothing else to duplicate.

### Modifying beautify
`beautify(src)` is a **pure function**. Its lexer must mirror `tokenize()` (negative-sign rule, parentheses, case of `"words`). Verify idempotency: `beautify(beautify(src)) === beautify(src)` (the test script checks all examples).

---

## Testing

```
npm install                           # once (Vite, Vitest, ESLint, pinned Playwright)
npm test                              # vitest run, vite build, then node tests/run-examples.js against dist/
npm run test:unit                     # unit tests only (Node, ~1 s); npm run test:watch to re-run on save
node tests/run-examples.js            # browser test of the existing dist/ build (served on a local port under /Logo/)
node tests/run-examples.js versions/claude-logo-v8.1.html   # or an archived single-file version
npm run lint                          # ESLint: missing imports, writes to imports, unused code, DOM in the core
```

**Unit tests** (`tests/unit/`, Vitest, Node): the language cases from `tests/cases.js`, every example (must reach `✓ Done!`, the endless spiral OUCH), interpreter state (segments, turtle pose, labels, canvas-size edge, sessions persisting like direct mode), tokenizer, procedure extraction, `formatNum`, `clipToCanvas`, beautify. `tests/unit/run-logo.js` → `runLogo(src, {speed, width, height, session})` returns `{ out, session, io }`; assert on `out` (console text) or on `session.drawing` / `session.turtle`.

**Browser test** (`tests/run-examples.js`, ~20 s with the pre-installed Playwright/Chromium): drives the built page through hooks that `src/main.js` puts on `window` (`editor`, `EXAMPLES`, `beautify`, `optSpeed`, `runDirectCommand`, `activeRctx`, `labelStore`, `session`) — keep them when refactoring. Runs all examples, beautify idempotency, the shared cases, and the UI checks (STOP during WAIT, direct mode while running, labels cleared on run, infinite loop stoppable, autosave restore). **Add a case for every bug fixed or rule changed** — `tests/cases.js` for language behaviour, `tests/unit/` for interpreter state, `UI_CHECKS` for page behaviour.

Manual checks still worth doing for UI changes: animated runs at speed 0 look right, STOP mid-animation, resize while idle and while running, font sizes, console toggle, HiDPI sharpness, Ctrl+Z in the editor.

### Pre-release review checklist (MAJOR version only)
- [ ] `npm test` and `npm run lint` pass
- [ ] STOP halts animation, a WAIT, and an infinite loop
- [ ] CLR clears canvas, trail, labels, variables, procedures, console (also mid-run)
- [ ] Resize smaller/larger — trail rebuilds correctly and stays sharp
- [ ] Console collapse/expand; drag while collapsed auto-expands
- [ ] Speed 0–4 and SPEED command; instant mode toggled mid-session
- [ ] Font sizes scale all UI text
- [ ] Error messages show the correct source line (top level and inside procedures)
- [ ] Editor undo/redo, example load undo
- [ ] No dead variables, no `console.log`

---

## CS vs CLR — reset scope reference

| Reset scope | `CS` / `CLEARSCREEN` | RUN with "clear screen on run" | `CLR` button |
|---|---|---|---|
| Trail segments, dots, labels | ✓ | ✓ | ✓ |
| Turtle pose / pen / colour / width (`mkTurtle`) | ✓ | ✓ | ✓ |
| Variables (`session.globals`) | ✗ | ✓ | ✓ |
| Procedures (`session.procs`) | ✗ | re-parsed | ✓ |
| Console log | ✗ | ✓ | ✓ |

All three use `clearScreen(session, io)`. `resizeCanvas()` only resets turtle **position and heading**, and only when no run is active (`activeRctx === null`).

---

## Language rules that are easy to get wrong

See `blue-logo-lang-spec.md` for full detail.

- **Precedence (v8.0+):** standard maths precedence, left-associative, `( )` supported: `2 + 3 * 4 = 14`, `10 - 2 - 3 = 5`. Single-input functions bind to one operand: `SIN :x * 2 = (SIN :x) * 2`; `NOT` covers a comparison.
- **Negative sign:** `-` glued to the following operand and separated from the previous one is a negative sign (`SETPOS 0 -100`, `FD -:X`); `FD 100 -10` is an error (extra value).
- **Scoping (v8.0+):** dynamic, UCBLogo-style. `MAKE` updates the nearest existing variable or creates a global; `LOCAL` / `LOCALMAKE` create procedure-private variables. FOR's loop variable exists only inside the loop. Recursive procedures need `LOCALMAKE` for working variables.
- **Tail calls** are unbounded; other recursion is capped (10 000 frames; 500 levels inside expressions).
- **Numbers only.** `"words` exist only for LABEL / PRINT / colour names.
- **Autosave:** the editor text lives in localStorage under `blue-logo:program` (the pre-v8.3 key `claude-logo:program` is migrated once); `editor.onChange` drives it, `editor.initValue` restores it without an undo step.
- **No third-party requests:** the font is self-hosted (`src/assets/fonts/`); the test fails if the page fetches anything outside its own origin. Keep it that way.
- **`document.execCommand`** is used for Tab/paste/copy fallback — deprecated but functional everywhere.
- **Not implemented:** `FILL`, `FOREVER`, `SETXY`, list/string values, short-circuit `AND`/`OR`.
