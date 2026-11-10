# Claude Logo

Browser-based Logo turtle graphics environment. Delivered as a single self-contained HTML file — no build step, no bundler, no server, no npm for the app. Open the file directly in any modern browser.

Specification is split into two files:
- **`claude-logo-lang-spec.md`** — Language reference: commands, expressions, scoping, error messages. What a Logo programmer needs.
- **`claude-logo-impl-spec.md`** — Implementation reference: architecture, interpreter internals, render pipeline, UI, extension guide. What a developer needs.

---

## Project files

| Path | Purpose |
|---|---|
| `claude-logo-vX.Y.html` | The current application (only one in the root). All JS, CSS, and HTML inline. |
| `versions/` | All previous `claude-logo-v*.html` files. Deployed to Pages at `/versions/…` and at the root (old links keep working). |
| `claude-logo-lang-spec.md` | Language specification. |
| `claude-logo-impl-spec.md` | Implementation specification. |
| `CHANGELOG.md` | Full version history. Add an entry for every version bump. |
| `TODO.md` | Open work items. |
| `REVIEW.md` | v7.3 project review (all items resolved in v8.0; kept for reference). |
| `tests/run-examples.js` | Headless test: all examples, beautify idempotency, language regression cases, UI checks. |
| `docs/architecture-proposal.md` | Architecture review & modernisation roadmap (agreed direction, Nov 2026). |
| `third-party/` | Licenses of embedded third-party assets (VT323 font, OFL). |
| `docs/archive/` | Superseded documents (old v4.1 spec, completed graph-features plan). |
| `index.html` | GitHub Pages entry point — redirects to the current version. |
| `.github/workflows/pages.yml` | Runs the tests on every PR and push; on `main`, after tests pass, deploys `index.html`, the current app and `versions/` to GitHub Pages. |
| `package.json` | Dev tooling only (pins Playwright for the tests). The app itself has no dependencies. |

Current version: **v8.1** (`claude-logo-v8.1.html`)

---

## Architecture in one paragraph

The file is one JavaScript execution context. Five logical layers in declaration order: **rendering** (HiDPI canvas compositing, sprite, background, trail), **turtle state** (position/heading/pen/colour, single mutable object), **interpreter** (tokeniser → procedure extractor → `runStack` trampoline ⇄ precedence-climbing expression parser → motion), **editor** (contenteditable IIFE with syntax highlighting, caret preservation and its own undo history), **UI shell** (`runProgram`, buttons, direct mode, splitter, overlays, options, resize, files). The interpreter *core* (tokenizer, extractor, parser, `runStack`) has no DOM dependencies — keep it that way. The leaf layer (CMD handlers, `move`/`rotate`) calls `log()`, `render()` and paints the trail canvas; route new side effects through those functions.

Data flow during a RUN:
```
btn-run → parseProgram(editor.getValue())   → tokenize() → extractProcedures() → { topLevel, newProcs }
        → registerProcs(newProcs)
        → runProgram(topLevel)              → makeRunContext() → rctx ; activeRctx = rctx
            → run(topLevel, 0, globalVars, rctx) → runStack(stack, rctx)
                → CMD handlers / control flow / evalExpr()
                → move(dist, rctx) → paintLine()/trailPush…() + render()
            → finally: activeRctx = null; setRunning(false); rctx.onFinish?.()
```

### RunContext (`rctx`)

Created by `makeRunContext(speed, procs)` per run. Fields: `stopped` (kill switch, set by `haltRun()`), `execLine` `{n, text}` (current source line for errors), `speed` 0–4 (slider snapshot; `SPEED n` updates it and the slider), `procs`, `globals` (root scope, set by `run()`), `exprDepth`, yield bookkeeping (`instantStepCount`, `tickCount`, `steps`, `lastYield`), `wake` (ends a WAIT early), `onFinish` (callback after unwind; CLR uses it).

**Invariants to preserve:**
- Every interpreter function receives `rctx` and never reads `stopped` / speed from globals or the DOM.
- `activeRctx` points to the live context while a program runs; it is set and cleared only by `runProgram()`. Only one program runs at a time (RUN disabled; direct mode refuses while running).
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
evalExpr(tokens, idx, vars, rctx, tstate?)       → async {value, nextIdx}
CMD['NAME'] = async (t, i, v, rctx) => nextIdx
resolveToken(tok, vars, tstate?)                 → number
tokenize(src) → token[] · extractBlock(tokens, idx) → {body, nextIdx} · extractProcedures(tokens) → {topLevel, newProcs}
skipSen(tokens, idx, rctx?) → idx
setVar(vars, name, value, rctx) · procScopeOf(vars, rctx) · repeatInfo(vars)
makeRunContext(speed, procsMap) → rctx · haltRun() · parseProgram(src) · runProgram(tokens)
move(dist, rctx) · rotate(deg, rctx) · circle(r, rctx) · clipToCanvas(x0,y0,x1,y1) → null | [x,y]
tick(rctx) · nextFrame(rctx) · macroYield(rctx) · sleep(ms, rctx)
render() · rebuildTrailCanvas() · clearScreen() · paintLine(…) · trailPushIfRoom(…) → bool · trailPushQuiet(…) → bool
```

---

## Section map

Line numbers drift between versions — grep the `// ──` markers instead (`grep -n '// ──' claude-logo-v8.1.html`). Main markers in order:

`Utilities` · `Canvas setup` (CW/CH/DPR) · `Sprite colour palette` · `Sprite drawing helpers` · `Background: sand texture` · `Trail storage` · `Label store` · `Render pipeline` · `Turtle state` · `Run context` (`makeRunContext`, `haltRun`) · `Direct mode state` · `Run-state indicator` · `Console / log` · **INTERPRETER** header (scopes) · `Token resolution` (`QUERY_TOKENS`) · `Expression evaluator` · `Tokeniser` · `Block extractor` · `Procedure store` · `Control-flow sentinels` · `Responsiveness helpers` · `Command dispatch table` · `runExpr` · `runStack` · `run` · `Motion` · `Examples` · `Code editor` (undo history) · `Splitter` · `beautify(src)` · `Copy code button` · `Beautify button` · `Program execution` (`runProgram`) · `Direct mode execution` · `Button handlers` · `Direct mode UI handlers` · `Overlay management` · `File save / load` · `Autosave` · `Options` · `Canvas resize`.

---

## Common tasks — sections to read first

| Task | Read these sections |
|---|---|
| Add a CMD command | `Command dispatch table` — copy a nearby handler; impl-spec §6.1 |
| Add a math function / query / operator | `Token resolution` + `Expression evaluator`; impl-spec §6.3 |
| Add a loop construct | `runStack` (`isRepeat`/`isWhile`/`isFor` + `isLoopFrame`); impl-spec §6.2 |
| Change scoping | INTERPRETER header + `setVar` / `procScopeOf` / `repeatInfo`; lang-spec §6 |
| Change animation / pacing | `Motion`, `Responsiveness helpers` |
| Change error reporting | `runProgram` (Program execution) + `rctx.execLine` |
| Change STOP / CLR | `Run context` (`haltRun`) + `Button handlers` |
| Change trail rendering | `Trail storage` + `Render pipeline` |
| Change editor / highlighting / undo | `Code editor` |
| Change beautify formatting | `beautify(src)` — pure function, safe to edit in isolation |

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
1. `git mv claude-logo-vOLD.html versions/` and create `claude-logo-vNEW.html` from it (only the current version lives in the root).
2. Update the version comment (line 2) and the `<h1>` version label in the HTML.
3. Update `index.html` (three references), "Current version" above, and the version header in both spec files if they changed.
4. Add a `CHANGELOG.md` entry.
5. Run `node tests/run-examples.js` — must pass.
6. After merging to `main`, tag the release: `git tag vX.Y`.

---

## Changelog convention

The changelog lives in **`CHANGELOG.md`**. The HTML file contains only a one-line comment: `<!-- Release notes: see CHANGELOG.md — vX.Y  YYYY-MM-DD -->`.

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
1. Read the relevant section of `claude-logo-impl-spec.md` (internals) or `claude-logo-lang-spec.md` (language behaviour).
2. Check **Known Limitations** in `claude-logo-lang-spec.md` §7 — the behaviour may be intentional.
3. Read the code section you are changing, not just the lines around the change.

### Adding a command
1. Register in `CMD` (impl-spec §6.1); add aliases (`CMD['ALIAS'] = CMD['FULLNAME']`).
2. Validate input; clamp + warn or throw, consistent with lang-spec §8.
3. If it draws without `move()`, end with `await tick(rctx)`.
4. Add it to the commands reference table in `#ref-body` and to lang-spec §2.
5. Add an example to `EXAMPLES` if it shows something new, and a case to `tests/run-examples.js`.

### Adding a math function
Add the name to `UNARY` + `UNARY_FNS` (one input — the single operand that follows, so `FN :x * 2` = `(FN :x) * 2`) or `BINARY2` + `BINARY2_FNS` (two full-expression inputs). Throw descriptive domain errors: `throw new Error('MYFN: argument ' + a + ' must be > 0')`.

### Adding a loop construct
Push a typed frame with a unique boolean discriminator, handle it at the top of the `runStack()` loop, and add it to `isLoopFrame`. `runStack` is the single trampoline for both statements and expression-context procedure calls — nothing else to duplicate.

### Modifying beautify
`beautify(src)` is a **pure function**. Its lexer must mirror `tokenize()` (negative-sign rule, parentheses, case of `"words`). Verify idempotency: `beautify(beautify(src)) === beautify(src)` (the test script checks all examples).

---

## Testing

```
npm install                           # once (installs the pinned Playwright)
npm test                              # = node tests/run-examples.js
node tests/run-examples.js            # tests the version index.html points to
node tests/run-examples.js path.html  # or a specific file
```

Runs in ~20 s with the pre-installed Playwright/Chromium. It runs all examples at instant speed (each must reach `✓ Done!`; the endless-spiral example must reach OUCH), checks beautify idempotency, runs the language regression cases and UI checks (STOP during WAIT, direct mode while running, labels cleared on run, infinite loop stoppable). **Add a case for every bug fixed or rule changed.**

Manual checks still worth doing for UI changes: animated runs at speed 0 look right, STOP mid-animation, resize while idle and while running, font sizes, console toggle, HiDPI sharpness, Ctrl+Z in the editor.

### Pre-release review checklist (MAJOR version only)
- [ ] `node tests/run-examples.js` passes
- [ ] STOP halts animation, a WAIT, and an infinite loop
- [ ] CLR clears canvas, trail, labels, variables, procedures, console (also mid-run)
- [ ] Resize smaller/larger — trail rebuilds correctly and stays sharp
- [ ] Console collapse/expand; drag while collapsed auto-expands
- [ ] Speed 0–4 and SPEED command; instant mode toggled mid-session
- [ ] Font sizes scale all UI text
- [ ] Error messages show the correct source line (top level and inside procedures)
- [ ] Editor undo/redo, example load undo
- [ ] No dead variables, no `console.log`
- [ ] Syntax check of the extracted `<script>`: `node --check`

---

## CS vs CLR — reset scope reference

| Reset scope | `CS` / `CLEARSCREEN` | RUN with "clear screen on run" | `CLR` button |
|---|---|---|---|
| Trail segments, dots, labels | ✓ | ✓ | ✓ |
| Turtle pose / pen / colour / width (`mkTurtle`) | ✓ | ✓ | ✓ |
| Variables (`globalVars`) | ✗ | ✓ | ✓ |
| Procedures (`procs`) | ✗ | re-parsed | ✓ |
| Console log | ✗ | ✓ | ✓ |

All three use `clearScreen()`. `resizeCanvas()` only resets turtle **position and heading**, and only when no run is active (`activeRctx === null`).

---

## Language rules that are easy to get wrong

See `claude-logo-lang-spec.md` for full detail.

- **Precedence (v8.0+):** standard maths precedence, left-associative, `( )` supported: `2 + 3 * 4 = 14`, `10 - 2 - 3 = 5`. Single-input functions bind to one operand: `SIN :x * 2 = (SIN :x) * 2`; `NOT` covers a comparison.
- **Negative sign:** `-` glued to the following operand and separated from the previous one is a negative sign (`SETPOS 0 -100`, `FD -:X`); `FD 100 -10` is an error (extra value).
- **Scoping (v8.0+):** dynamic, UCBLogo-style. `MAKE` updates the nearest existing variable or creates a global; `LOCAL` / `LOCALMAKE` create procedure-private variables. FOR's loop variable exists only inside the loop. Recursive procedures need `LOCALMAKE` for working variables.
- **Tail calls** are unbounded; other recursion is capped (10 000 frames; 500 levels inside expressions).
- **Numbers only.** `"words` exist only for LABEL / PRINT / colour names.
- **Autosave:** the editor text lives in localStorage under `claude-logo:program`; `editor.onChange` drives it, `editor.initValue` restores it without an undo step.
- **No network requests:** the font is embedded as base64; the test fails if the page fetches anything. Keep it that way.
- **`document.execCommand`** is used for Tab/paste/copy fallback — deprecated but functional everywhere.
- **Not implemented:** `FILL`, `FOREVER`, `SETXY`, list/string values, short-circuit `AND`/`OR`.
