# Claude Logo

Browser-based Logo turtle graphics environment. Delivered as a single self-contained HTML file — no build step, no bundler, no server, no npm. Open the file directly in any modern browser.

Specification is split into two files:
- **`claude-logo-lang-spec.md`** — Language reference: all commands, expressions, scoping, error messages. What a Logo programmer needs.
- **`claude-logo-impl-spec.md`** — Implementation reference: architecture, interpreter internals, render pipeline, UI, extension guide. What a developer needs.

---

## Project files

| File | Purpose |
|---|---|
| `claude-logo-vX.Y.html` | The application. All JS, CSS, and HTML inline. |
| `claude-logo-lang-spec.md` | Language specification — commands, expressions, errors, examples. |
| `claude-logo-impl-spec.md` | Implementation specification — architecture, interpreter, UI, extension guide. |
| `CHANGELOG.md` | Full version history. Add an entry here for every version bump. |
| `CLAUDE.md` | This file. Read by Claude Code at session start. |

Current version: **v7.1** (`claude-logo-v7.1.html`)

---

## Architecture in one paragraph

The file is one JavaScript execution context. Five logical layers in declaration order: **rendering** (canvas compositing, sprite, background, trail), **turtle state** (position/heading/pen/colour, single mutable object), **interpreter** (tokeniser → procedure extractor → trampoline executor → expression evaluator), **editor** (contenteditable IIFE with syntax highlighting and caret preservation), **UI shell** (splitter, overlays, buttons, options, resize). The interpreter has no DOM dependencies — keep it that way.

Data flow during a RUN:
```
editor.getValue()
  → tokenize()            → token[]
  → extractProcedures()   → { topLevel, newProcs }
  → makeRunContext()       → rctx  (bundles stopped, execLine, speed, procs)
  → run(topLevel, …, rctx)  → async, drives move() / rotate() / circle()
  → move(dist, rctx)      → trailPush() + paintSegment() + render()
```

### RunContext (`rctx`)

`rctx` is a plain object created by `makeRunContext(speed, procs)` at the start of every RUN. It bundles all per-run state that the interpreter previously read from globals or the DOM:

| Field | Type | Purpose |
|---|---|---|
| `stopped` | `boolean` | Set to `true` by STOP/CLR buttons to halt the running program |
| `execLine` | `{n, text}` | Tracks current source line for error messages |
| `speed` | `number` (1–4) | Snapshot of the SPEED slider at run start. The `SPEED n` command can update this mid-run (writes to both `rctx.speed` and the slider). Moving the slider manually mid-run has no effect. |
| `procs` | `object` | Reference to the global `procs` store (populated before `run()` is called) |
| `instantStepCount` | `number` | Counter for speed=4 (instant) periodic flush (reset to 0 when `INSTANT_FLUSH` reached in `move()`) |

**Invariants to preserve:**
- Every function in the interpreter chain (`run`, `runExpr`, `evalExpr`, all CMD handlers, `move`, `rotate`, `circle`) receives `rctx` as a parameter and uses it — never reads `stopped`, `execLine`, or `optSpeed.value` directly.
- `activeRctx` (module-level) points to the live context while a program runs; STOP and CLR buttons write `activeRctx.stopped = true` to signal the halt. It is set to `null` after each run.
- `rctx.speed` starts from the slider at run time. Moving the slider manually mid-run has no effect, but the Logo `SPEED n` command updates `rctx.speed` immediately for the rest of the run.

---

## Function signatures (quick reference)

Key functions in the interpreter chain. Check these before editing call sites — signatures must stay consistent across all callers.

```
// Interpreter entry points
run(tokens, startIdx, vars, rctx)                      → async, void  (thin wrapper over runStack)
runStack(stack, rctx)                                  → async, void  (shared trampoline — all control-flow)
runExpr(tokens, vars, depth, rctx)                     → async, void  (thin wrapper; throws STOP_SIGNAL / {__output__})
evalExpr(tokens, idx, vars, rctx, tstate, depth)       → async, {value, nextIdx}

// CMD handler signature (all leaf commands)
CMD['NAME'] = async (t, i, v, rctx) => nextIdx

// Turtle motion
move(dist, rctx)                                       → async, void
rotate(deg, rctx)                                      → async, void
circle(r, rctx)                                        → async, void

// Run context
makeRunContext(speed, procsMap)                         → {stopped, execLine, speed, procs}

// Tokeniser / parser
tokenize(src)                                          → token[]
extractBlock(tokens, idx)                              → {body, nextIdx}
extractProcedures(tokens)                              → {topLevel, newProcs}
resolveToken(tok, vars, tstate)                        → number | null

// Rendering / trail
render()                                               → void
trailPush(x1,y1,x2,y2,w,r,g,b)                       → void  (no cap check — use trailPushIfRoom)
trailPushIfRoom(x1,y1,x2,y2,w,r,g,b)                 → boolean
rebuildTrailCanvas()                                   → void
```

---

## Section map (v3.2, approximate line numbers)

Grep for the `// ──` marker to jump precisely. Line numbers shift slightly between versions.

| Line | Section marker | Contents |
|------|---------------|----------|
| 743 | `// ── Utilities` | `escHtml` |
| 751 | `// ── Canvas setup` | `canvas`, `ctx`, dimensions |
| 768 | `// ── Sprite colour palette` | palette constants |
| 780 | `// ── Sprite drawing helpers` | `drawShell`, `drawLeg`, `drawHead`, `drawBelly`, `buildSprite` |
| 893 | `// ── Background: sand texture` | `buildGrains`, `buildBgCache`, `drawBackground` |
| 921 | `// ── Trail storage` | typed arrays, `trailPush`, `trailPushIfRoom`, `rebuildTrailCanvas` |
| 1033 | `// ── Render pipeline` | `toCanvas`, `paintSegment`, `spriteCenter`, `render` |
| 1057 | `// ── Turtle state` | `mkTurtle`, `turtle` global |
| 1071 | `// ── Run context` | `makeRunContext`, `activeRctx` |
| 1095 | `// ── Run-state indicator` | `btnRun`, `setRunning` |
| 1121 | `// ── Console / log` | `log`, `MAX_LOG_LINES` |
| 1200 | `// ── Token resolution` | `resolveToken`, `UNARY`, `UNARY_FNS`, `BINARY2` |
| 1228 | `// ── Expression evaluator` | `evalExpr` |
| 1360 | `// ── Tokeniser` | `tokenize`, `LINE_SEN` |
| 1392 | `// ── Block extractor` | `extractBlock` |
| 1412 | `// ── Procedure store` | `extractProcedures`, `procs`, `globalVars` |
| 1451 | `// ── Control-flow sentinels` | `STOP_SIGNAL` |
| 1468 | `// ── Command dispatch table` | `CMD` object + all leaf command handlers |
| 1696 | `// ── runExpr` | `runExpr` thin wrapper |
| 1714 | `// ── runStack` | `runStack` — shared trampoline, all control-flow |
| 1952 | `run(…)` | `run` thin wrapper |
| 1970 | *(after `run`)* | `move`, `rotate`, `circle`, `MAX_CIRCLE_R` |
| 1926 | `// ── Examples` | `EXAMPLES` array |
| 2065 | `// ── Code editor` | `editor` IIFE, `renderLines`, `getValue`, `beautify` button wiring |
| 2233 | `// ── Splitter` | drag-resize panel splitter |
| 2341 | `// ── beautify(src)` | `beautify` pure function |
| 2606 | `// ── Copy code button` | copy handler |
| 2632 | `// ── Button handlers` | `btn-run`, `btn-stop`, `btn-clear` onclick |
| 2670 | `// ── Overlay management` | `openOverlay`, `closeOverlay` |
| 2689 | `// ── Options` | font-size options, speed-slider wiring |
| 2708 | `// ── Canvas resize` | `resizeCanvas`, debounce |

---

## Common tasks — sections to read first

| Task | Read these sections |
|------|-------------------|
| Add a new CMD command | `// ── Command dispatch table` (L1463) — read one nearby handler as pattern |
| Add a math function | `// ── Token resolution` (L1200) — `UNARY` set + `UNARY_FNS` map |
| Add a loop construct | `// ── runStack` (L1714) — `isRepeat`/`isFor` pattern; one place only |
| Change animation behaviour | `move` / `rotate` / `circle` (L1846) |
| Change error reporting | `// ── Expression evaluator` (L1228) + `// ── Button handlers` (L2632) — `rctx.execLine` |
| Change STOP / CLR behaviour | `// ── Button handlers` (L2632) + `// ── Run context` (L1071) |
| Change trail rendering | `// ── Trail storage` (L921) + `// ── Render pipeline` (L1033) |
| Change editor / syntax highlight | `// ── Code editor` (L2065) |
| Change beautify formatting | `// ── beautify(src)` (L2341) — pure function, safe to edit in isolation |

---

## Key constants (quick reference)

| Constant | Value | Location | Purpose |
|---|---|---|---|
| `MAX_TRAIL_SEGS` | 50 000 | trail storage section | Cap on drawn segments |
| `MAX_CIRCLE_R` | 2 000 | `circle()` | Prevents runaway animation |
| `MAX_EXPR_DEPTH` | 64 | `runExpr()` | Expression-context recursion guard |
| `MAX_LOG_LINES` | 500 | `log()` | Console line cap |
| `INSTANT_FLUSH` | 150 | `move()` | Steps between paint yields in speed=4 (instant) mode |
| `INLINE_THRESHOLD` | 8 | `beautify()` | Max tokens for inline `[ block ]` |
| `SPRITE_SIZE` | 64 px | canvas setup | Turtle sprite canvas dimensions |
| `SPRITE_OFFSET` | 18.8 px | canvas setup | Nose-to-centre distance for sprite placement |

---

## Versioning

Format: `MAJOR.MINOR`

- Bump **MINOR** for bug fixes, polish, small additions (v3.0 → v3.1)
- Bump **MAJOR** for stable releases after a review pass (v3.1 → v4.0)
- Each version is saved as a new file: `claude-logo-v3.1.html`
- Old versions are kept alongside the current one

---

## Changelog convention

The changelog lives in **`CHANGELOG.md`**. The HTML file contains only a one-line comment: `<!-- Release notes: see CHANGELOG.md — vX.Y  YYYY-MM-DD -->`.

Add a new `## vX.Y` block at the top of `CHANGELOG.md` for every version bump. Format:

```
## vX.Y  YYYY-MM-DD
**SHORT TITLE**
- * BUG: description — what was wrong, what the fix is.
- ~ CHANGE: description of behaviour or design change.
- + ADDITION: new feature or command.
- - REMOVAL: dead code or deprecated behaviour removed.
```

Severity markers in the spec review use 🔴 (bug) / 🟡 (design) / 🟢 (polish). Use plain text in the changelog.

---

## Making changes

### Before touching code
1. Read the relevant section of `claude-logo-impl-spec.md` (interpreter) or `claude-logo-lang-spec.md` (language behaviour).
2. Check **Known Limitations** in `claude-logo-lang-spec.md` Section 7 — the issue may be documented as intentional.
3. Read the existing code section you are changing, not just the area around the change.

### Adding a command
1. Register in the `CMD` dispatch table (see `claude-logo-impl-spec.md` Section 2.9, and the `// ── Command dispatch table` section in the file).
2. Add alias if applicable (`CMD['ALIAS'] = CMD['FULLNAME']`).
3. Add input validation and a clamping/warning pattern consistent with existing commands (see error taxonomy in `claude-logo-lang-spec.md` Section 8).
4. Add the command to the HTML commands reference table in `#ref-body`.
5. Add an example to `EXAMPLES` if it demonstrates something not already covered.

### Adding a math function
1. Add name to the `UNARY` Set.
2. Add implementation to `UNARY_FNS` (single-argument; argument arrives already resolved via `resolveToken`, not recursive `evalExpr` — this is intentional, see `claude-logo-impl-spec.md` Section 2.4).
3. Throw a descriptive error on domain violations. Mirror the existing pattern: `throw new Error('MYFN argument must be > 0, got ' + a)`.

### Adding a loop construct
Push a typed frame with a unique boolean discriminator. Handle it at the top of the `runStack()` while loop before the exec-frame block. See `claude-logo-impl-spec.md` Section 2.5 and the `isRepeat` / `isWhile` / `isFor` pattern in the source. Because `runStack` is the single shared trampoline, **no duplicate implementation in `runExpr` is needed** — the change applies to both top-level and expression-context execution automatically.

### Modifying the beautify function
`beautify(src)` is a **pure function** — no globals read or written, no interpreter functions called. A bug here can only produce oddly formatted output; it cannot corrupt turtle or interpreter state. Test by verifying idempotency: `beautify(beautify(src)) === beautify(src)`.

---

## Verification workflow

After editing the HTML file while a preview server is running, verify the change before declaring it done:

1. Reload the file in the preview: `window.location.assign('http://localhost:8080/claude-logo-vX.Y.html')`
2. Confirm the changed feature works with a targeted `preview_eval` or screenshot.
3. Run at least one animated example (e.g. Square) and confirm `✓ Done!` appears in the console.
4. If the change touched STOP/CLR, test that stopping mid-run works: start an animated program, call `btn-stop.onclick()` after a delay, confirm `■ Stopped.` appears.

---

## Testing

No automated test suite. Ask if verification is need. If yes follow verification process:

1. Open the HTML file in a browser.
2. Run all 24 built-in examples from the EXAMPLES panel — each must produce the expected drawing with no console errors.
3. For interpreter changes, additionally run the examples that exercise the changed feature directly.
4. For beautify changes, paste each example through the `≡` button and verify idempotency (press `≡` twice; result must not change).
5. For a MAJOR version bump, perform the full review checklist (see below).

### Pre-release review checklist (MAJOR version only)
- [ ] All 24 examples run without errors
- [ ] Beautify is idempotent on all 24 examples
- [ ] STOP button halts animation and resets turtle pose
- [ ] CLR clears canvas, trail, variables, procedures, and console
- [ ] Resize: drag the window smaller and larger — trail rebuilds correctly
- [ ] Console collapse/expand via toggle works; drag while collapsed auto-expands
- [ ] Instant mode: toggle on/off mid-session produces correct output
- [ ] Font size options (SMALL / MEDIUM / LARGE) scale all UI text
- [ ] Error messages show correct source line context
- [ ] No dead variables, no `console.log` left in
- [ ] Node syntax check: `node --check claude-logo-vX.Y.html` — must produce no errors (run against the `<script>` block extracted to a .js file)

---

## CS vs CLR — reset scope reference

| Reset scope | `CS` / `CLEARSCREEN` | `CLR` button |
|---|---|---|
| Trail segments | ✓ | ✓ |
| Labels (`LABEL`) | ✓ | ✓ |
| Turtle pose / pen / color / width | ✓ (`mkTurtle`) | ✓ (`mkTurtle`) |
| Variables (`globalVars`) | ✗ | ✓ |
| Procedures (`procs`) | ✗ | ✓ |
| Console log | ✗ | ✓ |

`resizeCanvas()` only resets turtle **position and heading** (not pen/color/width), and only when no run is active (`activeRctx === null`).

---

## Known limitations (do not fix without reading the spec)

These are documented design decisions, not bugs. See `claude-logo-lang-spec.md` Section 7 for full detail.

- **No operator precedence.** `2 + 3 * 4` evaluates left-to-right as `(2+3)*4 = 20`. This is standard UCBLogo behaviour.
- **Negative number literals.** Write `-100` with no space between `-` and the digits: `FD -100`, `SETPOS 0 -100`. Binary subtraction with spaces (`A - B`) still works. `FD 100 -10` (space before minus, digit directly after) now produces an error — it previously silently gave `FD 90`.
- **FOR vs REPEAT/WHILE scoping.** `MAKE` inside `FOR` body does not affect outer scope; inside `REPEAT`/`WHILE` it does.
- **Right-recursive binary chain.** `a - b + c` = `a - (b + c)`.
- **`document.execCommand`** used in Tab/paste handlers and clipboard fallback. Deprecated per spec; functional in all current browsers.
- **`REPCOUNT`**, **`LOCAL`**, **`FILL`**, **`SAVE`/`LOAD`** not implemented.
- **No list or string type.** All values are `number`. `"word` syntax exists in the tokeniser but no command accepts or produces strings beyond `LABEL`/`PRINT`. Adding collection types would require changes to `evalExpr`, all type-checking code, and the trail pipeline.
- **`resolveToken` special-case list.** Query tokens (`XCOR`, `YCOR`, `HEADING`, `PENDOWN?`, `PU?`, `SCRWIDTH`, `SCRHEIGHT`, `REPCOUNT`) are each handled by an explicit `if` branch inside `resolveToken`. The `DOT` command duplicates the "is this a value?" heuristic. A future `QUERY_TOKENS` map would centralise these, making new query tokens a one-line addition.

---

## Multi-file split (if the project grows)

The single-file structure is a delivery choice. If splitting becomes necessary, the natural boundaries are:

| File | Contents | DOM dependency |
|---|---|---|
| `interpreter.js` | `tokenize`, `extractBlock`, `extractProcedures`, `evalExpr`, `runExpr`, `run`, `CMD`, `resolveToken`, `globalVars`, `procs`, `makeRunContext` | None — fully testable in Node |
| `turtle.js` | `mkTurtle`, `move`, `rotate`, `circle`, turtle state globals | Depends on trail.js, render.js |
| `trail.js` | Typed arrays, `trailPush`, `paintSegment`, `rebuildTrailCanvas` | Canvas only |
| `render.js` | `canvas`, `ctx`, `buildSprite`, `render`, `buildGrains`, `buildBgCache` | Canvas + DOM |
| `editor.js` | Editor IIFE, `beautify`, `escHtml` | DOM |
| `ui.js` | Button handlers, splitter, overlays, `log`, options, resize, examples, `setRunning` | DOM |
| `style.css` | All CSS from the `<style>` block | — |
| `index.html` | Shell HTML with `<script type="module">` imports | — |

The `interpreter.js` layer having zero DOM dependencies is the most important invariant to preserve.
