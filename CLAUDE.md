# Blue Logo

Browser-based Logo turtle graphics environment for teaching. TypeScript (strict) ES modules in `src/`, built with Vite into a static site and served on GitHub Pages. No framework; the only runtime dependency is CodeMirror 6 (the editor), bundled by Vite.

```
npm install        # once
npm run dev        # dev server with live reload
npm test           # unit tests + build + browser tests (must pass)
npm run test:watch # unit tests in watch mode (Vitest, ~1 s)
npm run lint       # type check (tsc, twice) + ESLint (must pass)
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
| `src/` | The app: `main.ts` (entry), `app.ts` (the page's session + browser IO), `render/`, `turtle/`, `interpreter/`, `editor/`, `format/`, `ui/`, `styles/app.css`, `assets/fonts/`, `assets/logo.svg` (app logo = the turtle; keep in sync with `render/sprite.ts`). Module map: impl-spec §1.2. |
| `examples/` | One `.logo` file per example (`;; title:` / `;; desc:` / `;; topic:` / optional `;; shows:` header lines). Loaded at build time; the number prefix sets the order. Each must fit a 640 × 480 canvas; its drawing is snapshotted. |
| `src/reference.ts` | The Commands panel content as data (`REFERENCE`: per command syntax, description, longer text, examples, see-also, search tags). A unit test checks it lists every built-in word and runs every example. |
| `versions/` | Frozen single-file HTML versions up to v8.1 (from when the project was called "Claude Logo"; file names kept so old links work). Deployed to Pages at `/versions/…` and at the root (old links keep working). Never edited. |
| `blue-logo-lang-spec.md` | Language specification. |
| `blue-logo-impl-spec.md` | Implementation specification. |
| `CHANGELOG.md` | Full version history. Add an entry for every version bump. |
| `TODO.md` | Open work items. |
| `REVIEW.md` | v7.3 project review (all items resolved in v8.0; kept for reference). |
| `tests/cases.js` | Language regression cases, shared by the unit and browser tests. |
| `tests/unit/` | Vitest unit tests of the core in Node: language cases, all examples (run, fit, drawing snapshots in `__snapshots__/`), the commands reference, interpreter state, tokenizer, procedures, beautify, clipping. `run-logo.ts` runs a program headlessly; `drawing-picture.ts` turns a drawing into a character picture + hash. |
| `tests/run-examples.js` | Browser test (Playwright) against the built `dist/`: all examples, beautify idempotency, the shared cases, UI checks. |
| `docs/architecture-proposal.md` | Architecture review & modernisation roadmap (agreed direction, Nov 2026). |
| `docs/design-v9-lists.md` | Design proposal for v9.0 words and lists (not implemented yet; open questions in §11). |
| `docs/review-v8.7.md` | v8.7 review of interpreter, language and examples (all items resolved in v8.8; kept for reference). |
| `docs/review-v8.13.md` | v8.13 code quality review of `src/` (small polish done in v8.14; the rest open). |
| `third-party/` | Licenses of bundled third-party code and assets (VT323 font, OFL; CodeMirror, MIT). |
| `docs/archive/` | Superseded documents (old v4.1 spec, completed graph-features plan). |
| `.github/workflows/pages.yml` | On every PR and push: lint, build, test. On `main`, after the tests pass: deploys the tested `dist/` plus `versions/` to GitHub Pages. |
| `package.json` | Version number, scripts and dev tooling (Vite, Vitest, TypeScript, ESLint, Playwright). |
| `vite.config.js`, `eslint.config.js` | Build, Vitest and lint configuration (including the core import boundary). |
| `tsconfig.json` | TypeScript, strict, for `src/` and `tests/unit/` (type check only — Vite strips types when building). |
| `tsconfig.core.json` | Second type check of `interpreter/`, `turtle/`, `format/` **without the DOM library**: a browser API there is a type error. Host globals allowed in the core: `types/core-globals.d.ts`. |
| `src/types/` | Declarations for browser APIs missing from TypeScript's DOM library (File System Access API). |

Current version: **v8.14** (`package.json` → `8.14.0`)

---

## Architecture in one paragraph

Five layers, one folder each under `src/`: **rendering** (`render/` — HiDPI canvas compositing, sprite, background, trail layer), **turtle** (`turtle/` — turtle state, drawing store of segments + labels, `move`/`rotate`/`circle`), **interpreter** (`interpreter/` — tokeniser → procedure extractor → `runStack` trampoline ⇄ precedence-climbing expression parser, `CMD` table, session, LogoIO), **editor** (`editor/` — CodeMirror 6 with a Logo `StreamLanguage`, line numbers, bracket matching; `format/beautify.ts`), **UI shell** (`ui/` — `runProgram`, buttons, direct mode, splitter, overlays, options, resize, files, autosave). `src/main.ts` imports everything; UI modules wire their DOM handlers on import.

**The core has no DOM** — `interpreter/`, `turtle/`, `format/` cannot use browser APIs (`tsconfig.core.json` type-checks them without the DOM library) and cannot import `render/`, `ui/`, `editor/`, `app.ts` (ESLint `no-restricted-imports`). That is what lets Vitest run the interpreter in Node.
- **State** a program changes lives in a **session** (`createSession()` → `{ turtle, drawing, globals, procs, walkTick, isMoving, background, edge, fillPath }`), reached as `rctx.session`. The page has one, exported by `src/app.ts`; tests make a fresh one per case.
- **Output** goes through **`rctx.io`** (LogoIO, `interpreter/io.ts`): `log`, `logs`, `render`, `paintLine`, `paintLabel`, `paintFill`, `redraw`, `clearText`, `canvasSize`, `setSpeed`, `nextFrame`, `macroYield`, `keyWaiting`, `readKey`, `mouse`. The browser implementation is `io` in `src/app.ts`; tests use `headlessIO()`. New side effects = a new `io` method, implemented in both.

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

Created by `makeRunContext(speed, session, io)` per run. Fields: `session`, `io`, `stopped` (kill switch, set by `haltRun()`), `execLine` `{n, text}` (current source line for errors), `speed` 0–4 (slider snapshot; `SPEED n` updates it and the slider, which the RUN button restores afterwards), `procs` (= `session.procs`), `globals` (root scope, set by `run()`), `exprDepth`, yield bookkeeping (`instantStepCount`, `frameUsed`, `steps`, `lastYield`), `wake` (ends a WAIT early), `onFinish` (callback after unwind; CLR uses it), `timerStart` (TIMER).

**Invariants to preserve:**
- Every interpreter function receives `rctx` and reaches state only via `rctx.session` and the outside world only via `rctx.io`.
- `activeRctx` points to the live context while a program runs; it is set and cleared only by `runProgram()` (via `setActiveRctx`). Only one program runs at a time (RUN disabled; direct mode refuses while running).
- STOP / CLR call `haltRun()` — never set `stopped` directly (WAIT needs `rctx.wake`).
- Use `CW` / `CH` (logical canvas size) for geometry, never `canvas.width/height` (those are device pixels).
- Every long-running path yields (`nextFrame` / `macroYield` / `tick`), so STOP always works.

### TypeScript conventions

- Strict mode everywhere. `npm run lint` runs both type checks; Vite and Vitest only strip types, so **a type error shows up in lint, not in `npm run dev`**.
- Imports use the real file name with `.ts` (`import { run } from './runtime.ts'`); type-only imports use `import type` (ESLint enforces it).
- Shared core types live in `interpreter/types.ts` (types only, no runtime code). Types used by one module stay in it (the runStack frame union in `runtime.ts`, `Parser` in `expr.ts`).
- DOM lookups go through `byId<T>(id)` / `context2d(canvas)` (`util.ts`): they throw at start-up if `index.html` lacks the element, so the rest of the code needs no null checks.
- Avoid `any`; narrow dynamic values instead (`e instanceof Error`, `errorText(e)` in `execute.ts`).
- `tests/run-examples.js` and `tests/cases.js` stay JavaScript (run by plain Node); `tests/cases.d.ts` types the cases for the unit tests.

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
newLine(tokens, idx) → bool · noteTok(tok, rctx)   (Token = {text, line, col, lineText})
setVar(vars, name, value, rctx) · procScopeOf(vars, rctx) · repeatInfo(vars)
createSession() → session · headlessIO({width, height}?) → io · makeRunContext(speed, session, io) → rctx · haltRun()
parseProgram(src, io) → {topLevel, newProcs} | null · registerProcs(session, newProcs, io) · execute(tokens, rctx) · runProgram(tokens)
move(dist, rctx) · rotate(deg, rctx) · circle(r, rctx) · arc(deg, r, rctx) · clipToCanvas(x0,y0,x1,y1, w,h) → null | [x,y] · edgePath(rctx, sx,sy,ex,ey) → {pieces, endX, endY, hit}
tick(rctx) · spendFrame(rctx, part) · nextFrame(rctx) · macroYield(rctx) · sleep(ms, rctx)
trailPushIfRoom(rctx, …) → bool · trailPushQuiet(rctx, …) → bool · addLabel(rctx, lab) → bool · beginFill(session) · notePoint(session) · endFill(rctx) → bool · clearScreen(session, io, {keepSettings}?) · clearProcs(session)
procInputs(tokens, idx(), name, proc, parens, read) → count · bindDefaults(name, proc, got, scope, rctx)   (Proc = {params, required, defaults, body})
render() · rebuildTrailCanvas() · paintLine(…) · paintLabel(lab) · paintFill(fill)        (browser only)
```

---

## Module map

Full table with the contents of each file: impl-spec §1.2. Each module keeps the `// ──` section comments of the old single file, so `grep -rn '// ──' src` still works as a table of contents.

| Folder / file | Main contents |
|---|---|
| `app.ts` | The page's `session` and browser `io` |
| `render/` | `canvas.ts` (CW/CH/DPR) · `sprite.ts` · `background.ts` · `paint.ts` (`paintDrawing` — pure, any 2D context) · `trail.ts` (`trailCanvas`, `paintLine`, `paintLabel`, `rebuildTrailCanvas`) · `render.ts` |
| `turtle/` | `state.ts` (`mkTurtle`, `resetTurtle`) · `drawing.ts` (segment + label + fill store, `beginFill` / `notePoint` / `endFill`) · `motion.ts` (`move`, `rotate`, `circle`, `arc`, `edgePath` for FENCE / WRAP / WINDOW, `clipToCanvas`, `ouch`) |
| `interpreter/` | `types.ts` (shared types: `Session`, `Turtle`, `Drawing`, `LogoIO`, `RunContext`, `Scope`, `Proc`, `CommandHandler`, …) · `session.ts` · `io.ts` (LogoIO, `headlessIO`) · `context.ts` (`makeRunContext`, `haltRun`) · `execute.ts` (`parseProgram`, `registerProcs`, `execute`) · `scope.ts` · `tokenizer.ts` · `procedures.ts` · `expr.ts` · `signals.ts` · `pacing.ts` · `commands.ts` (`CMD`, `PAREN_CMD`) · `runtime.ts` (`runStack`, `run`, `runExpr`) |
| `editor/editor.ts`, `editor/logo-language.ts`, `format/beautify.ts` | CodeMirror setup behind the `Editor` interface; Logo highlighting tokenizer; pure formatter |
| `ui/` | `console.ts` (`log`) · `input.ts` (key queue + mouse for KEYP / READKEY / MOUSEX …) · `program.ts` (`runProgram`, RUN/STOP/CLR) · `direct.ts` (`tryInDirect`) · `splitter.ts` · `overlays.ts` · `reference-panel.ts` (Commands, from `REFERENCE`: chips, ranked search, cards) · `examples-overlay.ts` (search, topics, cards, preview) · `thumbs.ts` (example pictures) · `help-nav.ts` (links between the panels, F1) · `options.ts` · `files.ts` · `autosave.ts` · `resize.ts` · `code-buttons.ts` |
| `examples.ts` | Loads `examples/*.logo`; `uses` (built-in words per example), `examplesUsing` |
| `reference.ts` | `REFERENCE` — Commands panel data |

---

## Common tasks — sections to read first

| Task | Read these sections |
|---|---|
| Add a CMD command | `interpreter/commands.ts` — copy a nearby handler; impl-spec §6.1 |
| Add a math function / query / operator | `interpreter/expr.ts`; impl-spec §6.3 |
| Add a loop construct | `interpreter/runtime.ts` (`isRepeat`/`isWhile`/`isFor` + `isLoopFrame`); impl-spec §6.2 |
| Change scoping | `interpreter/runtime.ts` (header comment, tail-call rule) · `interpreter/scope.ts` (`setVar` / `procScopeOf` / `repeatInfo`); lang-spec §6 |
| Change animation / pacing | `turtle/motion.ts`, `interpreter/pacing.ts`, `io.nextFrame` in `src/app.ts` |
| Add a side effect (new output) | a method in the `LogoIO` interface (`interpreter/types.ts`), implemented in `src/app.ts` and `headlessIO()` (`interpreter/io.ts`) — the compiler points at both |
| Add state a program changes | a field in `Session` (`interpreter/types.ts`) + `createSession()` |
| Change error reporting | `interpreter/execute.ts` (`execute`) + `rctx.execLine` |
| Change STOP / CLR | `interpreter/context.ts` (`haltRun`) + `ui/program.ts` |
| Change trail storage / rendering | `turtle/drawing.ts` (data) · `render/trail.ts` + `render/render.ts` (painting) |
| Change editor / highlighting / undo | `editor/editor.ts` (extensions, colours) · `editor/logo-language.ts` (token classes) · `#editor .cm-…` in `app.css` |
| Change beautify formatting | `format/beautify.ts` — pure function, safe to edit in isolation |
| Add or edit an example | `examples/NN-name.logo` (with `;; topic:`, optional `;; shows:`); impl-spec §6.6; then `npx vitest run -u` and review the snapshot diff |
| Change the Commands panel | `src/reference.ts` (data, `scoreEntry` search ranking) · `ui/reference-panel.ts` (rendering); impl-spec §4.6 |

---

## Key constants (quick reference)

| Constant | Value | Purpose |
|---|---|---|
| `MAX_TRAIL_SEGS` | 50 000 | Cap on stored segments (one per move, per SETPOS line, per DOT) |
| `MAX_LABELS` | 500 | Cap on LABELs |
| `MAX_FILLS` / `MAX_FILL_POINTS` | 1 000 / 10 000 | Cap on fills / corners per fill |
| `MAX_CIRCLE_R` | 2 000 | Cap on \|radius\| |
| `MAX_STACK_FRAMES` | 10 000 | runStack frames (non-tail recursion depth) |
| `MAX_EXPR_DEPTH` | 500 | Expression nesting (parens, unary chains, procedures as values) |
| `MAX_LOG_LINES` | 500 | Console line cap |
| `INSTANT_FLUSH` | 150 | Instant-mode steps between paint yields |
| `STEPS_PER_FRAME` | [1, 4, 16, 64] | Animated move sub-steps / ticks per frame by speed 0–3 (one budget per frame shared by all commands) |
| `DEG_PER_FRAME` | [3, 12, 48, 192] | Animated degrees of turning per frame by speed 0–3 |
| `INLINE_THRESHOLD` | 8 | Max tokens for inline `[ block ]` in beautify |

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
1. Register in `CMD` in `interpreter/commands.ts` (impl-spec §6.1); add aliases (`CMD['ALIAS'] = CMD['FULLNAME']`).
2. Validate input; clamp + warn or throw, consistent with lang-spec §8.
3. State via `rctx.session`, output via `rctx.io` — no imports from `render/` / `ui/` (lint fails).
4. If it draws without `move()`, store via `trailPushIfRoom(rctx, …)` / `addLabel(rctx, …)` and end with `await tick(rctx)`.
5. Add it to `REFERENCE` in `src/reference.ts` (the unit test fails until you do; give it `examples`, `see` and `tags`) and to lang-spec §2.
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
npm run typecheck                     # tsc for the app + tests, and for the core without the DOM
npm run lint                          # typecheck, then ESLint (unused code, type-only imports, core import boundary)
```

**Unit tests** (`tests/unit/`, Vitest, Node): the language cases from `tests/cases.js`, every example (must reach `✓ Done!`, the endless spiral OUCH; must fit 640 × 480; drawing snapshot — a 64 × 24 character picture, bounds and a hash — for every example without `RND`/`RANDOM`; update with `npx vitest run -u` only for intended changes), the commands reference (every built-in word listed once, nothing extra, every example runs, See also links resolve, search ranking), example metadata (topics, `shows`, `uses`), interpreter state (segments, turtle pose, labels, canvas-size edge, sessions persisting like direct mode), tokenizer, procedure extraction, `formatNum`, `clipToCanvas`, beautify. `tests/unit/run-logo.ts` → `runLogo(src, {speed, width, height, session})` returns `{ out, session, io }`; assert on `out` (console text) or on `session.drawing` / `session.turtle`.

**Browser test** (`tests/run-examples.js`, ~20 s with the pre-installed Playwright/Chromium): drives the built page through hooks that `src/main.ts` puts on `window` (`editor`, `EXAMPLES`, `beautify`, `optSpeed`, `runDirectCommand`, `activeRctx`, `labelStore`, `session`) — keep them when refactoring. Runs all examples, beautify idempotency, the shared cases, and the UI checks (STOP during WAIT, direct mode while running, labels cleared on run, infinite loop stoppable, autosave restore, editor typing / Tab / undo / bracket match, Commands chips / search / cards / Try / Insert / See also / Used in, F1 help, Examples pictures / search / topics / preview / Open in editor, SETBG, keys reaching READKEY, the mouse, fills painted and repainted). **Add a case for every bug fixed or rule changed** — `tests/cases.js` for language behaviour, `tests/unit/` for interpreter state, `UI_CHECKS` for page behaviour.

Manual checks still worth doing for UI changes: animated runs at speed 0 look right, STOP mid-animation, resize while idle and while running, font sizes, console toggle, HiDPI sharpness, Ctrl+Z in the editor.

### Pre-release review checklist (MAJOR version only)
- [ ] `npm test` and `npm run lint` pass
- [ ] STOP halts animation, a WAIT, and an infinite loop
- [ ] CLR clears canvas, trail, labels, variables, procedures, console (also mid-run)
- [ ] Resize smaller/larger — trail rebuilds correctly and stays sharp
- [ ] Console collapse/expand; drag while collapsed auto-expands
- [ ] Speed 0–4 and SPEED command; instant mode toggled mid-session
- [ ] Font sizes scale the editor, console and overlay text
- [ ] Error messages show the correct source line (top level and inside procedures)
- [ ] Editor undo/redo, example load undo
- [ ] No dead variables, no `console.log`

---

## CS vs CLR — reset scope reference

| Reset scope | `CS` / `CLEARSCREEN` | RUN with "clear screen on run" | `CLR` button |
|---|---|---|---|
| Trail segments, dots, labels, fills (and an unfinished BEGINFILL) | ✓ | ✓ | ✓ |
| Turtle pose / pen / colour / width (`mkTurtle`) | ✓ | ✓ | ✓ |
| `SETBG` background (`session.background`) | ✗ | ✓ | ✓ |
| Edge mode `WRAP` / `WINDOW` (`session.edge`, back to FENCE) | ✗ | ✓ | ✓ |
| Variables (`session.globals`) | ✗ | ✓ | ✓ |
| Procedures (`session.procs`) | ✗ | re-parsed | ✓ |
| Console log | ✗ | ✓ | ✓ |

All three use `clearScreen(session, io)` (CS with `{ keepSettings: true }`). `resizeCanvas()` only resets turtle **position and heading**, and only when no run is active (`activeRctx === null`).

---

## Language rules that are easy to get wrong

See `blue-logo-lang-spec.md` for full detail.

- **Precedence (v8.0+):** standard maths precedence, left-associative, `( )` supported: `2 + 3 * 4 = 14`, `10 - 2 - 3 = 5`. Single-input functions bind to one operand: `SIN :x * 2 = (SIN :x) * 2`; `NOT` covers a comparison.
- **Negative sign:** `-` glued to the following operand and separated from the previous one is a negative sign (`SETPOS 0 -100`, `FD -:X`); `FD 100 -10` is an error (extra value).
- **Scoping (v8.0+):** dynamic, UCBLogo-style. `MAKE` updates the nearest existing variable or creates a global; `LOCAL` / `LOCALMAKE` create procedure-private variables. FOR's loop variable exists only inside the loop. Recursive procedures need `LOCALMAKE` for working variables.
- **Tail calls** are unbounded; other recursion is capped (10 000 frames; 500 levels inside expressions). A tail call drops the caller's scope only when all its variables are callee parameters, so dynamic scoping is unchanged.
- **Comparisons are approximate** (`approxEq`, ~12 significant digits); turtle positions/headings are snapped to 10⁻⁹. `MOD` has the sign of the divisor.
- **Variables:** examples and docs use `MAKE "x` / `LOCALMAKE "x`; `MAKE :x` is accepted. A `"word` where a number is expected is an error.
- **Numbers only.** `"words` exist only for LABEL / PRINT / colour names / variable names in MAKE, LOCAL, LOCALMAKE, FOR.
- **Autosave:** the editor text lives in localStorage under `blue-logo:program` (the pre-v8.3 key `claude-logo:program` is migrated once); `editor.onChange` drives it, `editor.initValue` restores it without an undo step.
- **No third-party requests:** the UI uses system fonts; VT323 (title + LABEL only) is self-hosted (`src/assets/fonts/`); the test fails if the page fetches anything outside its own origin. Keep it that way.
- **Look:** colours and font stacks are CSS variables in `:root` of `app.css` (impl-spec §4.1a); syntax colours are in `editor.ts`. Keep text at ≥ 4.5:1 contrast, buttons neutral (only Run / Stop coloured), sentence case except Logo commands.
- **Editor = CodeMirror 6** (`src/editor/`): it owns text, caret, undo, IME and paste. The rest of the app uses only the `Editor` interface (`getValue`, `setValue`, `initValue`, `onChange`, `focus`). `document.execCommand('copy')` remains only as the copy-button fallback.
- **Short-circuit `AND` / `OR`** (v8.9) and IFELSE-as-a-value use the parser's skip mode (`p.skip`): the skipped tokens are parsed and checked but nothing is computed or run.
- **Edge modes** (v8.11): `move` and `goTo` (SETPOS, SETXY, SETX, SETY, HOME) split their path with `edgePath` — FENCE clips + OUCH, WRAP splits into pieces across the edges, WINDOW leaves it whole. `HOME` draws with the pen down (since v8.11).
- **Fills** (v8.11): `BEGINFILL` records the turtle's end points (`notePoint` after every move / goTo); `ENDFILL` stores a polygon `{at, …}` painted just before segment `at`, i.e. under the outline. Fill colour = pen colour at BEGINFILL.
- **Parentheses at statement level** (v8.11): `(PRINT …)` / `(LABEL …)` take several inputs (`PAREN_CMD`), `(PROC a b c)` passes optional inputs (`TO P :A [:B 1]`). Without parentheses a procedure takes only its required inputs.
- **Keyboard / mouse** (v8.11): `KEYP`, `READKEY` (waits; key codes A = 65, arrows 37–40), `MOUSEX`, `MOUSEY`, `BUTTONP`, `TIMER` — through `io.keyWaiting` / `readKey` / `mouse`. Keys are queued only while a program runs and not typed into a text field.
- **`ARC`** walks the true arc (half-step turns, exact end point); **`CIRCLE`** keeps its older polygon so existing drawings do not move.
- **Not implemented:** flood `FILL`, list/string values (and so `PENCOLOR`). Planned order: `TODO.md` → Language.
