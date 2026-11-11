# Blue Logo v8.13 — code quality review

Scope: all of `src/`, which is about 4 400 lines of TypeScript. The review looks at readability, duplication, dead code, consistency and maintainability. It does not cover language design (that was `docs/review-v8.7.md`).
Baseline: `npm run lint` passes and `npm run test:unit` passes (508 tests). Every 🔴 item was checked by running it in the page or headlessly with `runLogo()`.

Severity: 🔴 bug · 🟡 design / maintainability · 🟢 polish.

Overall: the code is in very good shape. The layering is enforced by tooling, not just by convention: `tsconfig.core.json` and the ESLint import boundary. All control flow is in one trampoline (`runStack`), and LogoIO is a narrow, testable seam. Comments explain *why*, and the snapshot and reference tests make refactoring safe. Most items below are small duplications and drift that crept in during the v8.9–v8.13 feature work.

---

## 1. Bugs

### 🔴 1.1 The "Errors" console filter does nothing
Options has an **Errors** checkbox (`#log-err`, `index.html:89`), and `console.ts` caches it in `logFilters`. But both `logs()` and `log()` always let `'err'` through, and impl-spec §4 says errors are "always shown". If a pupil unticks it, nothing changes.
Fix: remove the checkbox and its `logFilters.err` entry. Or, less helpful for teaching, honour it.

### 🟡 1.2 Animated moves paint past the trail cap
`walk()` (`turtle/motion.ts`) paints every sub-step with `io.paintLine` first. Only at the end does it store the segment with `trailPushQuiet`. Once `MAX_TRAIL_SEGS` is reached, the store is refused, but the line is already on the canvas. It disappears at the next `rebuildTrailCanvas()` (a resize, or a fill). Instant mode is consistent, because `trailPushIfRoom` paints only what it stores.
Fix: in `walk()`, skip `paintLine` when `d.len >= MAX_TRAIL_SEGS` (or export a `trailHasRoom(session)` helper).

### 🟡 1.3 Error and log messages print raw floats
Most messages use `formatNum`, but several concatenate the number directly. So floating-point drift reaches pupils:

```
WAIT 0.1 - 0.30000000000000004  → ✗ WAIT: duration must be >= 0, got -0.20000000000000004
PRINT ARCSIN 1.0000000000000002  → ✗ ARCSIN: argument 1.0000000000000002 out of range [-1, 1]
```
The affected places:
- the `UNARY_FNS` domain errors (`ARCSIN`, `ARCCOS`, `SQRT`, `LN`, `LOG`, `EXP`, `RANDOM`)
- `POWER`
- `WAIT`
- `CIRCLE` / `ARC`
- the `WIDTH` / `SETWIDTH … clamped to` lines

Use `formatNum` everywhere. Related: `ARCSIN` / `ARCCOS` of a computed ratio such as `:a / :c` can land at 1 + 2⁻⁵² and fail. Clamping inputs within `approxEq` of ±1 would match the tolerant comparisons from v8.8.

## 2. Duplication

### 🟡 2.1 `isValueStart` restates the expression grammar
`isValueStart` (`commands.ts`) lists `QUERY_TOKENS`, `REPCOUNT`, `REPCOUNTMAX`, `UNARY`, `BINARY2`, `NOT` and `READKEY` by hand. That is exactly `isReporterWord()` in `expr.ts`. A new reporter has to be added in both places, or `DOT` / `LABEL` / `SETCOLOR` quietly miss it. Suggested replacement in `expr.ts`, next to the other word classes:

```ts
export function startsValue(tok, rctx) {
  return isVarTok(tok) || hasOwn(rctx.procs, tok) || /^[\d.]/.test(tok) ||
         tok === '~' || tok === '-' || tok === '(' || tok === 'IFELSE' || isReporterWord(tok);
}
```

### 🟡 2.2 Console filtering is written twice
`log()` repeats the rule that `logs()` already encodes ('print' / 'cmd' / 'err' always; others by checkbox). It should start with `if(!logs(cls)) return;` and keep only the 'print' auto-expand.

### 🟡 2.3 Direct mode: duplicated submit and layout code (`ui/direct.ts`)
- The Enter handler and `#btn-direct-run` hold the same five lines (busy check, clear, run, focus). Extract a `submitDirect(input)` function.
- The toggle handler recomputes the code height with its own copy of `chromeH()` from `splitter.ts`. The splitter already does this on resize. Export a `relayout()` from the splitter (through a setter, as with `setShowConsole`) and call that.

### 🟢 2.4 Smaller repeats
- The heading normalisation `((a % 360) + 360) % 360` appears in `QUERY_TOKENS.HEADING`, `CMD.HEADING` and `SETH`. `motion.ts` already exports `normAngle`, which also snaps.
- `runStack` searches for the nearest procedure boundary twice, for STOP and OUTPUT (`while(k >= 0 && !stack[k].procBoundary) k--`). A `boundaryIndex(stack)` helper would read better.
- `FD` / `BK` / `RT` / `LT` are four copy-pasted one-liners. A table like `PEN_COMMANDS` would remove them.
- `program.ts` empties the console with `con.innerHTML = ''` in two places. `io.clearText()` already does this.

## 3. Consistency

### 🟡 3.1 Log guards are applied unevenly
Hot paths guard string building with `if(rctx.io.logs('op'))`. That covers FD, BK, RT, LT, ARC, SETPOS, DOT, IFELSE, REPEAT and others, but not:
- `IF`
- `SETH`
- `CIRCLE`
- `WAIT`
- the pen commands
- `SETCOLOR` / `SETWIDTH`

`IF` runs inside tight loops. Pick one rule ("guard every non-`print`/`err` log in the interpreter") and apply it everywhere, or add `io.logf(cls, () => msg)`.

### 🟡 3.2 Import cycle in the core
`commands.ts ⇄ expr.ts ⇄ runtime.ts`, and `expr.ts ⇄ procedures.ts` (`CONTROL_WORDS` / `isBuiltinWord`). It works today because every cross-module use happens at call time, not at module evaluation. But a future top-level `CMD[...]` lookup, or a constant built from `UNARY` in `commands.ts`, would read `undefined` with no error. Suggestions:
- Move the word tables and classes (`CONTROL_WORDS`, `UNARY`, `BINARY2`, `BINOP_PREC`, `QUERY_TOKENS`, `isReporterWord`, `isCommandWord`, `isBuiltinWord`, and `startsValue` from 2.1) into a leaf `interpreter/words.ts`.
- Consider `import/no-cycle` in ESLint.

### 🟢 3.3 Stale `.js` file names in comments
After the TypeScript move, comments still name `.js` files: `app.js`, `session.js`, `io.js`, `execute.js`, `state.js`, `drawing.js`, `trail.js`, `splitter.js` and `autosave.js`. They are in:
- `interpreter/context.ts`, `io.ts`, `session.ts`
- `turtle/drawing.ts`, `state.ts`
- `render/trail.ts`
- `ui/program.ts`, `console.ts`, `files.ts`
- `app.ts`, `main.ts`

`grep -rn '\.js\b' src` finds them all. Leave `tests/run-examples.js`, which really is JavaScript.

### 🟢 3.4 `session.ts` header comment is out of date
It says `drawing` holds "trail segments + labels" and `procs` holds `{ params, body }`. Today it is segments + labels + fills, and `{ params, required, defaults, body }`.

## 4. Dead or redundant code

### 🟢 4.1 Guards the types already guarantee
These are noise, and they suggest to a reader that the case can happen:
- `circle()` / `arc()` check `isFinite(r)`, but `evalExpr` already throws on non-finite values.
- `DEG_PER_FRAME[rctx.speed] || 3` and `STEPS_PER_FRAME[rctx.speed] || 1`: `speed` is clamped to an integer 0–4, and both lookups only run for 0–3.
- `run()`: `tokens || []` and `startIdx || 0` on non-optional parameters.
- `setVar` / `procScopeOf`: `rctx.globals || rctx.session.globals`. `run()` always sets `globals` first, so the type could become `Scope` (set in `makeRunContext`) rather than `Scope | null`.

### 🟢 4.2 `SETWIDTH` logs twice when it clamps
It logs both "SETWIDTH n clamped to w" and "WIDTH w". `SPEED` has the same pattern. Log one line.

### 🟢 4.3 `setRunning` hard-codes the button labels
`'▶ Run'` is written both in `index.html` and in `program.ts`. Read the idle label once at start-up, or toggle a CSS class.

---

## Suggested order

1. 1.1, 1.3 and 3.3: tiny, visible to pupils or readers.
2. 2.1 together with 3.2 (`words.ts`): removes the duplication that is most likely to cause a real bug.
3. 1.2 and 2.2–2.4.
4. The rest whenever the files are touched next.

None of these items need a language change, so they fit a v8.14 polish release.
