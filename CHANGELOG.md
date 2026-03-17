# Claude Logo — Release Notes

Severity markers: `+` new feature · `~` change/fix · `-` removed · `*` bug fix

---

## v6.9  2026-03-17
**STABILISATION — code-review items 1–12**
- * BUG: CS (CLEARSCREEN) did not clear `labelStore`. LABEL text survived a CS and was replayed by `rebuildTrailCanvas()` onto the freshly cleared canvas. Fix: CS now clears `labelStore` and resets `labelCapWarned`, matching the documented behaviour (trail + labels + dots cleared; variables/procs/console preserved). Distinct from CLR which resets everything.
- * BUG: `resizeCanvas()` (v6.8) reset `turtle.x/y/angle` unconditionally, corrupting turtle position during active animations when the window was resized mid-run. Fix: position reset is now guarded by `if(!activeRctx)`.
- * BUG: Infix `MOD` (e.g. `10 MOD 0`) produced silent `NaN` — JavaScript `x % 0 === NaN` — which propagated undetected through downstream arithmetic. The prefix form `MOD 10 0` already threw correctly. Fix: added zero-divisor check to the binary operator chain, consistent with the `/` guard on the line above.
- * BUG: FOR loops with fractional steps accumulated IEEE-754 rounding error. `FOR :i 0 1 0.1` could fire one iteration too many or too few near the end value. Fix: epsilon tolerance (`Math.abs(step) * 1e-9`) stored in the loop frame and applied to the active check in both `run()` (trampoline) and `runExpr()` (recursive path).
- * BUG: SETCOLOR out-of-range warning had a false negative for small negative inputs. `SETCOLOR -0.4 0 0` rounded to 0, so the comparison `clamped !== Math.round(original)` evaluated `0 !== 0 = false` and no warning fired. Fix: compare against the raw input value.
- ~ CHANGE: `extractBlock` unclosed-bracket error now says "a [ was opened but never closed (check loop bodies and IF branches)" instead of the terse "Missing ]".
- ~ CHANGE: `btn-run` onclick now has an explicit `if(activeRctx) return;` guard. Belt-and-suspenders: button is already `disabled` by `setRunning`, but the intent is now explicit.
- ~ CHANGE: CLAUDE.md updated — CS vs CLR reset-scope table; SPEED command note (mid-run `SPEED n` writes `rctx.speed` directly); `resolveToken` registry pattern documented as future work; no-string-type added to Known Limitations; current version corrected.

---

## v6.8  2026-03-16
**BUG FIXES — DOT scatter example, turtle recenter on resize**
- * BUG: "DOT — Sine Wave Scatter" example produced wrong output. Root cause: multi-operator MAKE expressions like `SCRWIDTH / 2 - 10` evaluate right-recursively as `SCRWIDTH / (2 - 10)` due to the known right-recursive binary chain. Fix: rewrote the example using one binary operator per MAKE statement, avoiding the right-recursion trap. Added a comment explaining the pattern.
- * BUG: Turtle position was not reset after canvas resize. After a window or font-size resize the turtle remained at its previous Logo coordinates. Fix: `resizeCanvas()` now resets `turtle.x/y/angle` to 0 (HOME) after each resize, keeping the turtle predictably at the canvas centre.
- ~ CHANGE: Changing font size (SMALL/MEDIUM/LARGE in OPTIONS) now calls `resizeCanvas()` via `setTimeout(0)` so the canvas dimensions update to match the new panel width introduced in v6.7.

---

## v6.7  2026-03-16
**UI — live line-number indicator, font-scaled left panel**
- + ADDITION: Live `L:N` line-number indicator in the editor toolbar, left of the `≡` button. Updates on every keystroke (`input` event) and every cursor movement (`selectionchange` listener). Shows the 1-based line number of the current caret position. Implemented inside the editor IIFE using the existing `getCaretOffset()` and `getValue()` functions; no interpreter changes.
- + ADDITION: Left panel width now scales with font size via `calc(384px * var(--fs-base))` — 384 px at SMALL, 538 px at MEDIUM, 691 px at LARGE. Switching font size in OPTIONS clears any residual inline width style so the CSS calc value takes effect immediately.

---

## v6.6  2026-03-16
**BUG FIX + GRAPH DRAWING PRIMITIVES — MAKE scoping, DOT, SCRWIDTH/SCRHEIGHT**
- * BUG: `MAKE :STEP :STEP + 1` (and any MAKE mutation) inside a `REPEAT` body stopped working in v6.5. Root cause: the REPCOUNT feature created a child scope (`Object.create(outerVars)`) for each REPEAT iteration body; `MAKE` wrote to that child scope, which was discarded at the end of the iteration. Fix: added `const REPEAT_SCOPE = Symbol('repeatScope')` to mark REPEAT body scopes. `CMD['MAKE']` now walks the prototype chain through REPEAT-marked scopes to write to the correct defining scope. FOR uses `Object.assign` (flat copy, no prototype chain) so MAKE inside FOR correctly stays local — no change there. Procedure scopes use `Object.create` but are not marked with `REPEAT_SCOPE`, so procedure-local MAKE is also unaffected. Broken examples restored: Spiral, Sunburst, Rainbow Spiral, Comments.
- + ADDITION: `SCRWIDTH` and `SCRHEIGHT` — read-only bare tokens (like `XCOR`/`YCOR`) that return the current canvas pixel dimensions. Since the Logo origin is at the canvas centre, `SCRWIDTH / 2` is the rightmost x coordinate. Useful for writing programs that scale to any window size.
- + ADDITION: `DOT` — draw a filled circle dot at the turtle's current position. `DOT x y` draws at (x, y) without moving the turtle. Diameter = current pen width (`SETWIDTH`). Color = current pen color (`SETCOLOR`). Always draws regardless of pen up/down state. Stored as a zero-length trail segment so dots survive canvas resize. New "DOT — Sine Wave Scatter" example added.

---

## v6.5  2026-03-16
**ADDITION — `REPCOUNT`**
- + ADDITION: `REPCOUNT` returns the current iteration index (1-based) inside a `REPEAT` loop. Implemented by injecting `REPCOUNT` as an own property of a child vars scope before each body execution in both `run()` and `runExpr()`, so it is visible inside the body without polluting the enclosing scope. Resolved as a bare token (no colon) via `resolveToken`, like `XCOR`/`YCOR`. Throws `"REPCOUNT used outside a REPEAT loop"` if used outside any REPEAT. New "REPCOUNT — Expanding Spiral" example added.

---

## v6.4  2026-03-16
**BUG FIXES — editor paste, beautify negative literals**
- * BUG: Copy-paste accumulated extra blank lines. `getValue()` emitted a trailing `\n` from the browser's guard `<div><br></div>`. Paste via `insertText` appended at caret rather than replacing, baking extra empty lines into source. Fix: `getValue()` now trims trailing empty lines before joining.
- * BUG: `beautify()` reformatted `SETPOS 100 -100` as `SETPOS 100 - 100`. The beautify tokeniser had its own TOK regex that always split `-` as a separate token. Fix: Pass 2 now applies the same negative-literal preprocessing as the interpreter (`-` preceded by whitespace/`[` and directly followed by a digit → `~digits`). Pass 4 converts `~digits` tokens back to `-digits` on output.

---

## v6.3  2026-03-15
**REPEAT / FOR / WHILE in expression-context procs; BREAK command**
- + ADDITION: `REPEAT`, `FOR`, and `WHILE` are now fully supported inside procedures called as expression values (e.g. `MAKE :N MYFUNC :X`). Previously, `runExpr()` (the recursive executor used for expression-context calls) only handled `IF`/`IFELSE`, so any proc containing a loop that was called as a value threw "Unknown command: REPEAT". The loop logic is now duplicated from `run()` into `runExpr()` using JS `for`/`while` with `BREAK_SIGNAL` catch. See comment block in `runExpr()` for the design rationale behind the deliberate duplication.
- + ADDITION: New `BREAK` command exits the innermost enclosing loop (`REPEAT`, `FOR`, or `WHILE`) immediately, in both `run()` and `runExpr()`. In `run()` the trampoline stack is unwound until the loop frame is found and popped. In `runExpr()` a `BREAK_SIGNAL` sentinel is thrown and caught by the nearest loop body's `try/catch`. `BREAK` cannot cross a procedure boundary in either executor — doing so throws `"BREAK used outside a loop"`.
- + ADDITION: New `BREAK_SIGNAL` frozen sentinel object, mirroring `STOP_SIGNAL`. Proc-call sites in both `evalExpr` and `runExpr` convert an escaping `BREAK_SIGNAL` to a plain `Error` to enforce the boundary rule.

---

## v6.2  2026-03-15
**ADDITION — `SPEED n` command**
- + ADDITION: New `SPEED n` command (n = 1–4) sets animation speed from within a Logo program. Matches the OPTIONS speed slider: 1 = slow animated, 2 = medium, 3 = fast, 4 = instant. Updates both `rctx.speed` (takes effect immediately for the current run) and `optSpeed.value` (slider synced so the next run starts at the same speed). Values outside 1–4 are clamped with a warning in the console. Includes a new "SPEED — Slow to Fast" example and a reference table entry.

---

## v6.1  2026-03-15
**BUG FIX — negative number literals (`SETPOS 0 -100`)**
- * BUG: `SETPOS 0 -100` (and any command where a negative number literal directly followed another value) reported "Missing value". The tokeniser split every `-` into its own token; `evalExpr`'s binary-operator loop then consumed `0 - 100 = -100` as the first argument, leaving nothing for the second. Fix: in `tokenize()`, a `-` preceded by whitespace or `[` and directly followed by a digit (no space) is replaced with `~`, forming a single token like `~100`. `resolveToken` maps `~100` → -100. Binary subtraction with spaces (`A - B`) is unaffected — the lookahead `(?=\d)` requires the digit to be immediately adjacent to the minus.
- ~ CHANGE: `FD 100 -10` previously silently computed `FD 90` (an undocumented gotcha). It now produces an error, which is more honest than the previous silent wrong result.

---

## v6.0  2026-03-15
**STABLE RELEASE — file I/O, turtle boundary, UX polish**

Promoted to v6.0 after review. All v5.x changes are included; no new features in this release.

---

## v5.2  2026-03-15
**POLISH — button styling, turtle boundary, editor placeholder**
- ~ CHANGE: SAVE, LOAD, and ⚙ buttons in the code label bar now share the same ghost-green styling as ≡, ⎘, and LOG (border, opacity, hover transition). Standalone #opt-btn CSS rules removed.
- + ADDITION: Turtle boundary detection in move() — when the turtle reaches the edge of the canvas it stops at the boundary, prints "OUCH! Turtle went off the canvas." (opens console if hidden), and halts the program. Applies to FD, BK, and CIRCLE. Both animated and instant (speed=4) paths covered.
- ~ CHANGE: Editor no longer pre-fills with commented welcome text. Instead, a ghost placeholder (CSS ::before, italic, disappears on first keystroke) shows four example commands and a hint to use EXAMPLES/COMMANDS.

---

## v5.1  2026-03-15
**FILE SAVE / LOAD — OS file dialogs, tidied label bar**
- + ADDITION: SAVE button in the code label bar — saves the current editor code to a `.logo` file via the OS Save dialog (File System Access API in Chrome/Edge; `<a download>` fallback elsewhere). Suggested filename is derived from the first non-comment code line.
- + ADDITION: LOAD button in the code label bar — opens a `.logo` or `.txt` file from the user's filesystem via the OS Open dialog (`<input type="file">` fallback). Code is loaded directly into the editor.
- ~ CHANGE: ⚙ OPTIONS button moved from its isolated position in the panel header into the code label bar, alongside ≡, ⎘, LOG, SAVE, LOAD. All utility/overlay buttons now live in one compact strip.

---

## v5.0  2026-03-14
**POLISH — examples, UI consistency, console defaults**
- * BUG: House example drew rotated anticlockwise due to v4.1 heading-convention change (north=0). Fixed: WALLS now uses `RT 90` (clockwise square) and roof-positioning drops the now-redundant `LT 90` pre-turn.
- * BUG: OUTPUT example produced `FD 50038` because `SQRT` takes a single token, not a full expression. `HYPO` rewritten with intermediate `MAKE :AA` / `MAKE :SUM` variables so `SQRT :SUM` receives one pre-computed value.
- ~ CHANGE: COLORS reference table — left column names now use the same `#aac` neutral colour as the right column; previously inherited the command-green `#4f8` rule, making one column green and the other grey.
- ~ CHANGE: RUN button shows icon `⟳` only while running (was `⟳ RUN`); text deliberately omitted so the button keeps a fixed width and the animated border alone signals activity.
- ~ CHANGE: MOTION (FD, RT…) and INFO (MAKE, CALL…) console filters are now off by default; only STATUS and ERRORS show on first load, keeping the console quiet for new users.

---

## v4.3  2026-03-14
**LAYOUT — terminal-style DIRECT mode, LOG button, full console hide**
- ~ CHANGE: Direct mode input strip moved inside `#split` flex container (was outside), eliminating pixel-height overflow that caused the console label and direct input to visually overlap when the console was collapsed.
- ~ CHANGE: When Direct mode is active the `▸ CONSOLE` section header relabels to `▸ TERMINAL`; the `>` prompt prefix appears on the input line for a terminal-style feel.
- ~ CHANGE: Console on/off control replaced: pill toggle switch removed from the `▸ CONSOLE` header; a `LOG` button is now placed alongside `≡` and `⎘` in the `▸ CODE` toolbar row.
- ~ CHANGE: Hiding the console now fully removes both the section header and the output area (`display:none`), leaving no collapsed stub. Previously the header strip remained visible when collapsed.
- * BUG: Toggling Direct mode while the console was hidden caused a −54 px overlap (direct panel rendered above the console label). Fixed by moving the panel into the shared flex container and recalculating code-editor height on every visibility change.
- * BUG: Opening Direct mode after collapsing the console left the input strip off-screen because `collapse()` sized the editor without knowing the direct panel's height. Height is now recalculated in both toggle directions.

---

## v4.2  2026-03-14
**DIRECT MODE — immediate command execution**
- + ADDITION: Direct Mode toggle button (⌘ DIRECT) in the button row.
- + ADDITION: Command input strip appears between console and buttons when active; Enter executes immediately.
- + ADDITION: Command history navigation with ↑/↓ arrow keys (terminal-style recall).
- + ADDITION: Editor procedures are auto-loaded before each direct command — define in editor, call in direct mode.
- ~ CHANGE: globalVars and turtle state persist across direct-mode commands; RUN/CLR still reset as before.

---

## v4.1  2026-03-13
**HEADING CONVENTION — NORTH=0, STANDARD LOGO**
- * Heading convention corrected to standard Logo: 0° = north (up), clockwise positive.
    Previously 0° = east (right), which is the math/unit-circle convention.
    move(): dx = sin(a), dy = cos(a) in Logo world coords (replaces cos/−sin).
    spriteCenter(): nose offset uses sin/+cos direction (replaces cos/−sin).
    TOWARDS: formula changed to atan2(dx, dy) — north=0 azimuth from Logo world delta.
    Animated sprite: rotation offset −90° applied so sprite faces north at heading 0.
    Triangle style: tip moved from (12,0) to (0,−12) — points up at heading 0.
- ~ All 24 built-in examples unaffected (use relative RT/LT turns, not absolute headings).
    Colour wheel example headings still produce a symmetric star; orientation rotated 90°.

---

## v4.0  2026-03-13
**STABLE RELEASE — v3.x SERIES**
Promotes the full v3.x series to a stable major release.
Summary of everything added since v3.0:

INTERPRETER ARCHITECTURE (v3.2–v3.3)
- ~ RunContext (rctx) pattern: all per-run state bundled into one plain object
    { stopped, execLine, speed, procs, instantStepCount } and threaded through
    the entire interpreter chain. No global reads in move/rotate/evalExpr.
- ~ DOM dependency eliminated from the animation layer: move() and rotate() read
    rctx.speed (resolved once at RUN time), not the DOM on every step.
- ~ instantStepCount moved from module global into rctx (per-run, not shared).
- * LINE_SEN sentinel NaN guard: missing ':' no longer produces "line NaN" errors.
- * circle(0) early return; circle(NaN) now throws a descriptive error.
- * :XCOR / :YCOR / :HEADING now throw on colon-prefixed access — colon prefix
    is for user variables only; turtle properties use bare XCOR / YCOR / HEADING.

LANGUAGE ADDITIONS (v3.4)
- + POWER a b, MAX a b, MIN a b, MOD a b — prefix two-argument math functions.
- + FLOOR n, CEILING n — integer rounding.
- + PENDOWN? / PD?, PENUP? / PU? — pen-state predicates (return 1/0).
- + CLEARTEXT / CT — clears console without touching canvas or variables.

UI & DISPLAY OPTIONS (v3.5)
- + CANVAS STYLE: PARCHMENT (default) or WHITE.
- + TURTLE STYLE: ANIMATED sprite (default) or TRIANGLE (classic green triangle).

ANIMATION SPEED (v3.6)
- ~ INSTANT MODE checkbox replaced by a 5-position SPEED slider (SLOW → FAST).
    Slow = 1 step/rAF (smooth); Fast = instant batch mode (INSTANT_FLUSH path).
    Intermediates: 4 / 16 / 64 steps per rAF frame.

DRAWING & OUTPUT (v3.7)
- + 16 named colours: RED ORANGE YELLOW GREEN LIME CYAN BLUE NAVY PURPLE PINK
    MAGENTA WHITE GRAY/GREY BLACK BROWN GOLD — accepted by SETCOLOR.
- + LABEL text — draws text at turtle position in current pen colour; persists
    across resize via labelStore replay in rebuildTrailCanvas().
- + PNG save button (⤓ PNG, top-right header) — downloads current canvas.
- + COMMANDS reference: ▸ COLORS section with colour swatches for all 16 names.

---

## v3.7  2026-03-13
**NAMED COLORS, LABEL COMMAND, SAVE PICTURE**
- + 16 named colours (RED ORANGE YELLOW GREEN LIME CYAN BLUE NAVY PURPLE PINK
    MAGENTA WHITE GRAY GREY BLACK BROWN GOLD) accepted by SETCOLOR.
- + LABEL command — draws text on the canvas at the turtle's position in the
    current pen colour. Text persists across resize via labelStore replay.
- + PNG save button (top-right header) — downloads the canvas as a PNG.

---

## v3.6  2026-03-13
**SPEED SLIDER — replaces binary INSTANT MODE toggle**
- ~ INSTANT MODE checkbox replaced by a 5-position SPEED slider in BEHAVIOUR options.
    Position 0 (SLOW) = current animated default (1 move-step per rAF, 3°/rAF).
    Position 4 (FAST) = former instant mode (INSTANT_FLUSH batch path, no rAF).
    Intermediate positions: 4 / 16 / 64 move-steps per rAF frame.
- ~ rctx.instant (boolean) replaced by rctx.speed (0–4 integer).
    move() and rotate() use rctx.speed >= 4 to select the instant code path.

---

## v3.5  2026-03-13
**DISPLAY OPTIONS — CANVAS STYLE, TURTLE STYLE**
- + CANVAS STYLE selector (OPTIONS panel): PARCHMENT (default) or WHITE.
    Switching takes effect immediately. New styles can be added as one pill + one case.
- + TURTLE STYLE selector (OPTIONS panel): ANIMATED (default) or TRIANGLE.
    TRIANGLE: small filled green triangle, pen-state dot at centre (red=down, brown=up).
    No SPRITE_OFFSET — triangle centred at turtle world position.
    New styles can be added as one pill + one draw function + one case.

---

## v3.4  2026-03-13
**TIER 1 LOGO FEATURES — PREFIX MATH, PEN PREDICATES, CLEARTEXT**
- + POWER a b: prefix exponentiation (a ^ b). Also via BINARY2 dispatch.
- + MAX a b: prefix maximum of two numbers.
- + MIN a b: prefix minimum of two numbers.
- + MOD a b: prefix modulo (complement to infix 'a MOD b').
- + FLOOR n: round down to nearest integer.
- + CEILING n: round up to nearest integer.
- + PENDOWN? / PD?: returns 1 if pen is down, 0 if up.
- + PENUP? / PU?: returns 1 if pen is up, 0 if down.
- + CLEARTEXT / CT: clears the console output without affecting canvas or state.
- ~ BINARY2 dispatch refactored from ternary to switch statement to accommodate
    new functions (POWER, MAX, MIN, MOD) alongside existing TOWARDS/DISTANCE.

---

## v3.3  2026-03-13
**STABILISATION — ERROR GUARDS, INPUT VALIDATION, :XCOR/:YCOR RESTRICTION**
- * S1 — LINE_SEN sentinel with missing ':' caused parseInt to receive a garbage
    string and store NaN in rctx.execLine.n. Error messages showed "line NaN".
    Fix: skip sentinel with continue if indexOf(':') < 0. Applied in run() and runExpr().
- * S3 — circle(0) ran 36 unnecessary move/rotate steps. Added early return for r === 0.
- * S4 — circle(NaN) silently did nothing (NaN < steps is always false after cap check).
    Now throws: 'CIRCLE: radius must be a finite number'.
- ~ :XCOR, :YCOR, :HEADING no longer silently fall through to variable lookup.
    They now throw a descriptive error. The colon prefix is for user variables only;
    turtle properties are accessed without colon (XCOR, YCOR, HEADING).
- ~ D1 — instantStepCount moved from module global into rctx.instantStepCount.
    It is now per-run state initialised by makeRunContext(), consistent with all other
    per-run fields. Removes one module-level mutable variable.
- + S2 — Error message fallback: log('✗ ' + (e.message || String(e))) handles non-Error
    throws without crashing the error display.
- ~ C1 — PU/PD/HT/ST handlers consolidated via a data-table factory. Eliminates 4
    near-identical handler definitions; pattern is easier to extend.

---

## v3.2  2026-03-13
**RUN-CONTEXT REFACTOR — PURE INTERPRETER, DOM-FREE ANIMATION**
- + makeRunContext(instant, procsMap): bundles all per-run mutable state into one
    object { stopped, execLine, instant, procs }. Passed as 'ctx' parameter
    to run/runExpr/evalExpr/move/rotate/circle and all CMD handlers.
- ~ D1: procs global no longer a hidden dependency of run/runExpr/evalExpr.
    All procedure lookups now use ctx.procs. Interpreter callable with any
    procedure map without touching global state.
- ~ D2: stopped and execLine globals removed. Replaced by ctx.stopped and
    ctx.execLine. Active context stored in module-level activeCtx so
    STOP/CLR buttons can still set the kill-switch.
- ~ D3: move() and rotate() no longer read optInstant DOM element. instant flag
    is resolved once at RUN time and passed through ctx. Animation layer now
    has zero DOM dependencies.
- ~ S2: evalExpr gains optional depth parameter; unary minus recursive path
    checks depth >= MAX_EXPR_DEPTH before recursing. Guards against
    impractically deep chains like - - - - - n.
- ~ CMD handler signature extended to (tokens, idx, vars, ctx): all handlers
    receive ctx; motion handlers thread it to move/rotate/circle; all handlers
    pass it to evalExpr. Consistent signature across all 20 handlers.
- ~ evalExpr signature: (tokens, idx, vars, ctx, tstate, depth). ctx is now
    position-4 (mandatory); tstate and depth remain optional with defaults.
    All internal recursive calls thread ctx, tstate, and depth correctly.
- + All 24 built-in examples beautified via beautify() — consistent indentation,
    uppercase keywords, canonicalised inline block style.

---

## v3.1  2026-03-13
**BUG FIXES & STABILITY**
- * CLR button did not set stopped=true — a running program continued drawing
    from the reset origin. Fix: CLR now sets stopped=true and calls setRunning(false).
- * runExpr() logged unknown commands instead of throwing — silent errors with
    misaligned token index in expression-context procedure bodies. Fix: throw
    'Unknown command: X' to match run() behaviour.
- * STOP_SIGNAL was a plain mutable object — accidental write could silently
    break all STOP handling. Fix: Object.freeze(STOP_SIGNAL).
- * TOWARDS and DISTANCE in evalExpr read global turtle directly, violating
    the tstate parameter contract. Fix: evalExpr accepts optional tstate parameter
    (defaults to global turtle); BINARY2 handlers use tstate.x/tstate.y.
- * editor.el exported from editor IIFE but never used externally. Removed.
- ~ trail-cap guard extracted to trailPushIfRoom() helper — eliminates three
    divergent copies in move() animated, move() instant, and CMD['SETPOS'].

---

## v3.0  2026-03-12
**STABLE RELEASE — BUG FIXES & POLISH**
- * Example overlay preview garbled for 3 examples — bare < and > parsed as HTML.
    Fix: escHtml() applied in buildExamples().
- * Dead variables startX/startY in move(). Removed.
- * STOP button did not call render() after halting — turtle frozen in mid-walk pose.
    Fix: render() added to btn-stop handler.
- * isMoving not reset on exception mid-animation. Fix: isMoving=false in RUN catch block.
- ~ CLR now also clears procs (user-defined procedures).
- ~ Canvas resize debounce increased 16ms → 150ms.
- ~ Copy-to-clipboard flash logic de-duplicated via flashCopied().
- + SETCOLOR now logs a warning when any channel is clamped.
- + AI-friendly comments on all major functions, data structures, and algorithms.

---

## v2.6  2026-03-12
**CODE REVIEW FIXES**
- * rebuildTrailCanvas could read past typed array bounds when trail cap exceeded.
    Fix: separate trailCapWarned boolean; trailLen capped at MAX_TRAIL_SEGS.
- ~ turtle.colorStr removed (trailPush uses turtle.color[0..2] directly).
- ~ opt-instant and console-chk DOM elements cached at startup.
- ~ resolveToken no longer calls .toUpperCase() — tokens pre-uppercased by tokenize().
- ~ MAKE and FOR throw a descriptive error if variable token is malformed.
- ~ OUTPUT handler collapsed to a single pass.
- ~ CIRCLE radius capped at MAX_CIRCLE_R=2000.
- + document.execCommand('insertText') deprecation documented.

---

## v2.5  2026-03-12
**MEMORY OPTIMIZATIONS**
- ~ OPT-1: Trail replaced from JS object array to two pre-allocated typed arrays.
    trailF32: Float32Array(MAX_TRAIL_SEGS*5) — x1,y1,x2,y2,w per segment.
    trailU8: Uint8Array(MAX_TRAIL_SEGS*3) — r,g,b per segment.
    Memory at cap: ~1.1MB vs ~5MB (4.5x reduction). Zero per-segment allocation.

---

## v2.4  2026-03-12
**MEMORY OPTIMIZATIONS**
- ~ OPT-5: rebuildTrailCanvas — toCanvas() inlined; hw/hh hoisted outside loop.
- ~ OPT-4: tokenize() pre-uppercases all non-sentinel tokens at parse time.
- ~ OPT-3: Object.create(vars) replaces Object.assign({}, vars) for procedure calls.

---

## v2.3  2026-03-12
**INPUT VALIDATION & GRACEFUL ERROR HANDLING**
- + SETCOLOR, SETWIDTH, WAIT, FOR, SQRT/LN/LOG/ARCSIN/ARCCOS, EXP, RANDOM: full validation.
- + Division by zero throws instead of producing Infinity.
- + extractBlock throws on missing [ or unclosed ].
- + extractProcedures throws on malformed TO/END.
- + Unknown command throws and halts (previously logged and continued).
- ~ extractProcedures returns { topLevel, newProcs } — no global mutation.
- ~ resolveToken accepts optional tstate parameter.
- + Trail capped at 50,000 segments.
- + RND alias for RANDOM.

---

## v2.2  2026-03-12
- + RUN button pulses with animated glow while executing.
- + Instant mode flushes canvas every 150 steps.
- + setRunning() helper manages run-state.
- ~ All examples audited and fixed for negative-literal expression fusion bug.
- + Editor caret fix: getCaretOffset/setCaretOffset walk div-by-div.

---

## v2.1  2026-03-12
- + Trampoline executor — run() uses explicit frame stack, no JS recursion limit.
- + WHILE [cond] [body] loop.
- + FOR :v start end [body] and FOR :v start end step [body].
- + INSTANT MODE option.
- + runExpr() helper for expression-context proc calls.
- + Error messages show the source line that caused the failure.

---

## v2.0  2026-03-12
- + contenteditable editor replaces textarea.
- + PRINT always visible — bypasses log filters, auto-expands console.
- + Console collapse toggle.
- + STOP command fixed — signal propagates through IF/IFELSE/REPEAT.

---

## v1.6  2026-03-12
- + Tab key inserts 2 spaces.
- + autocorrect/autocapitalize/autocomplete off (mobile fix).

---

## v1.5  2026-03-11
- + Dispatch table replaces 150-line if/else chain in run().
- + Single-pass tokenizer replaces 10 sequential .replace() calls.
- ~ circle() fixed to call move()/rotate() directly.

---

## v1.4  2026-03-11
- ~ Font changed Press Start 2P → VT323.

---

## v1.3 – v1.0  2026-03-11
- + Commands overlay, panel width, comment syntax highlighting, OUTPUT/OP,
    recursion depth guard, unknown command errors.
