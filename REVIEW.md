# Claude Logo — Project Review (v7.3, 2026-11-10)

Purpose: get the project ready for the next round of development. This covers the
current app (`claude-logo-v7.3.html`), the docs, and the repo/deploy setup.
Each bug marked **[verified]** was reproduced in headless Chromium (see `tests/run-examples.js`).

Baseline health: `node --check` passes on the extracted script. All **28** built-in
examples run to `✓ Done!` at instant speed. `beautify` is idempotent on all 28.
`console.log` is not used anywhere in the script.

---

## 1. Bugs (fix first)

| # | Sev | Issue | Where |
|---|---|---|---|
| B1 | 🔴 | **FOR loses inherited variables. [verified]** `Object.assign({}, frame.vars)` copies only *own* properties. Inside a REPEAT body or a procedure, the scope is a prototype-chain child, so globals and caller variables disappear. `MAKE :SIZE 10  REPEAT 2 [ FOR :I 1 2 [ PRINT :SIZE ] ]` gives `Unknown variable: SIZE`. A FOR inside any procedure can't read globals either. It also copies the `REPEAT_SCOPE` symbol and `REPCOUNT` onto the FOR scope. **Fix:** `Object.create(frame.vars)` plus own `varName`. To keep "MAKE in FOR stays local", make MAKE stop at FOR scopes (e.g. a `FOR_SCOPE` marker). | `runStack` FOR (~L1932) |
| B2 | 🔴 | **STOP doesn't interrupt WAIT. [verified]** After STOP during `WAIT 5`, the RUN button is re-enabled, but `activeRctx` stays set until the timer fires. RUN clicks are silently ignored for up to 30 s. **Fix:** make WAIT's timer cancellable through rctx (or poll `rctx.stopped` in ~50 ms slices). | `CMD['WAIT']`, `btn-stop` |
| B3 | 🔴 | **Direct-mode command can run at the same time as a RUN. [verified]** `runDirectCommand` has no `activeRctx` guard. It overwrites `activeRctx` and then nulls it, so the main program can no longer be stopped. Two interpreters end up driving the same turtle. **Fix:** `if(activeRctx) return;` (or queue the command). | `runDirectCommand` |
| B4 | 🟡 | **"Clear screen on run" doesn't clear labels. [verified]** RUN resets the trail but not `labelStore`, so `rebuildTrailCanvas()` replays old LABEL text. CS was fixed for this in v6.9, but the RUN path was missed. | `btn-run` (~L2880) |
| B5 | 🟡 | **Parse errors on RUN are silent. [verified]** `extractProcedures(tokenize(...))` runs outside the `try`. With a missing `END`, the console is cleared and nothing is shown; the error only appears as an unhandled rejection. | `btn-run` |
| B6 | 🟡 | **Expression-context recursion guard doesn't work. [verified]** Each `runExpr` starts a new 1-frame stack, so `MAX_STACK_FRAMES` never fires for `TO BOOM OUTPUT BOOM END`. It ends in a raw JS `Maximum call stack size exceeded`. The v7.1 changelog says this case is fixed. **Fix:** count expression nesting depth on `rctx` and throw a Logo-style error. | `runExpr` / `evalExpr` |
| B7 | 🟢 | `REPCOUNT` leaks into procedures called from a REPEAT (dynamic scope through the prototype chain). `MAKE "REPCOUNT 9` inside a REPEAT writes to the outer scope, and REPCOUNT then "works" outside the loop. [verified] | `resolveToken`, REPEAT frame |
| B8 | 🟢 | `SETPOS` / `DOT x y` have no bounds check (`SETPOS 5000 5000` succeeds), while FD stops with "OUCH!". [verified] They also don't count toward `INSTANT_FLUSH`. | `CMD['SETPOS']` |
| B9 | 🟢 | A procedure that OUTPUTs, called as a statement, discards its value silently (UCBLogo reports an error). [verified] | `runStack` OUTPUT |
| B10 | 🟢 | `RANDOM 0.5` always returns 0. Non-integer arguments should be rejected or rounded. | `UNARY_FNS` |
| B11 | 🟢 | CLR during a run resets `turtle` while an in-flight `move()` step may still draw one more segment onto the cleared canvas. | `btn-clear` |

## 2. Documentation drift (fix before the next feature round)

The docs are what Claude Code reads first, and several are now wrong:

- **`claude-logo-lang-spec.md`** says `2 + 3 * 4 = 20` and "left-to-right, matches UCBLogo". Actual result: **14**. The evaluator is *right-recursive* (`10 - 2 - 3 = 11`). UCBLogo does have precedence and parentheses. Line 271 still contains a draft note: "Use parentheses... actually Logo has no parentheses". The same wrong claim (`= 20`) is in **CLAUDE.md**, under Known limitations.
- **`claude-logo-impl-spec.md`** is headed "Version 6.5" and describes the pre-v7.0 interpreter (`BREAK_SIGNAL`, duplicated loops in `runExpr`, `MAX_EXPR_DEPTH=64` as the recursion bound). It needs a rewrite of §2.5–2.7 for the unified `runStack`.
- **CLAUDE.md**:
  - The section map is labelled v3.2 and its line numbers are ~100–400 off. Replace it with marker names only (grep `// ──`).
  - It says "24 examples"; there are 28.
  - It says "REPCOUNT … SAVE/LOAD not implemented". REPCOUNT exists, and file save/load exists as buttons.
  - It says `MAX_EXPR_DEPTH` is an "expression-context recursion guard". It only guards unary-minus chains, and the source comment calling it "unused" is also wrong.
  - It says "the interpreter has no DOM dependencies". In fact `resolveToken` reads `canvas.width`, CMD handlers call `log()`/`render()`, `SPEED` writes `optSpeed`, and `CT` writes `con.innerHTML`. Either restate the invariant honestly or inject these through `rctx` (e.g. `rctx.io = {log, render, screen}`). Injection would make the interpreter testable in Node.
- **Speed range:** the slider is `min=0 max=4` and the code comments say 0–4, but the `SPEED` command and the docs say 1–4. So slider position 0 (1 step/frame) can't be reached from Logo.
- **Stale files:** `claude-logo-spec-v4.1.md` (superseded by the two specs) and `plan-graph-drawing-features.md` (mostly done: Wave 1/2 shipped). Move them to `docs/archive/` or delete them. `TODO.md` says "nothing pending"; this review gives it content.

## 3. Repo & release process

- **11 full copies of the app** (v6.3–v7.3, ~1.7 MB) sit in the root, and **all are deployed to Pages**. Git already keeps history, and there are **no git tags**. Suggestion: tag each release (`v7.3`), move old HTML files to `versions/` (or drop them), and deploy only the current one plus whatever you want public.
- A version bump touches 4 places (new file, `index.html` ×3 references, CLAUDE.md "Current version", CHANGELOG). That's easy to get wrong. Consider a fixed name `claude-logo.html` with the version in a JS constant and a git tag. Then `index.html` needs no edits.
- **Testing:** `tests/run-examples.js` (added with this review) runs all examples, the beautify idempotency check and the regression cases in ~20 s: `node tests/run-examples.js`. It is dev-only and doesn't change the no-build delivery. Suggest updating CLAUDE.md §Testing to use it, and adding a case for each bug fixed.
- The external Google Fonts `@import` is the only network dependency. LABEL text can draw in the fallback font if it runs before VT323 loads (`document.fonts.ready` before the first run would fix that).

## 4. Code quality / design notes (not urgent)

- **Editor re-renders all lines on every keystroke** (`innerHTML` rewrite). This almost certainly breaks native undo (Ctrl+Z), costs O(file) per keypress, and is fragile with IME input. This is the biggest UX debt. Options: a transparent `<textarea>` over a highlighted `<pre>` (keeps native undo), or only re-render the changed line.
- **Canvas isn't HiDPI-aware** (no `devicePixelRatio`), so drawings are blurry on retina and phones, and Save PNG is low-res.
- **Expression grammar.** Right-recursive and no precedence is the root of the "one operator per MAKE" workaround in the DOT example. A small precedence-climbing parser plus `( )` support would be the most valuable language improvement. It's a breaking change, so plan it for a MAJOR version and re-run all examples. Unary functions taking only a single token (`SQRT :a * :a`) is a related pitfall.
- **MAKE inside a procedure is always local**, so a procedure can't update a global counter (UCBLogo updates the existing variable wherever it is defined). This is documented, but it surprises users. Consider a `GLOBAL`/`LOCAL` pair.
- **No tail-call elimination.** `L 20000` (a recursive loop) hits `Stack overflow (> 10000 frames)`. Popping a proc frame whose `idx` is at the end before pushing the callee would make idiomatic recursive loops unbounded.
- `resolveToken` special cases → a `QUERY_TOKENS` map (already noted in CLAUDE.md). `DOT`'s "is the next token a value?" heuristic should use the same map.
- Duplicated code: three copies of the download/file-input fallback in save/load; two identical run/error handlers (`btn-run`, `runDirectCommand`). Extract `downloadBlob()`, `pickFile()`, `executeProgram(tokens, rctx)`.
- Small things: `SETH` logs as `info` while other motion commands log as `op`; `makeRunContext` comment says `(instant, procsMap)`; two comment blocks above `rebuildTrailCanvas` are interleaved with `paintLabel`.

## 5. Suggested order for the next round

1. **v7.4, bug fixes:** B1–B5, plus regression cases in `tests/run-examples.js`.
2. **v7.5, docs refresh:** lang-spec precedence section, rewrite of the impl-spec interpreter chapter, CLAUDE.md section map/counts/limitations, archive stale files, update TODO.md.
3. **Repo hygiene:** git tags, prune or move old versions, simplify the version bump.
4. **Next MAJOR (v8.0):** expression parser with precedence and parentheses, editor undo fix, HiDPI canvas, interpreter I/O injection (Node-testable).
