# Blue Logo v8.7 — review of interpreter, language and examples

Scope: `src/interpreter/`, `src/turtle/`, `src/format/beautify.ts`, `blue-logo-lang-spec.md`, `examples/`.
Every 🔴 item was checked by running the program through `runLogo()` (headless, as in the unit tests). The output shown is what v8.7 actually prints.

Severity: 🔴 bug · 🟡 design / teaching problem · 🟢 polish.

Overall: the core is in good shape. The trampoline (`runStack`) handles STOP / OUTPUT / BREAK / CONTINUE / tail calls cleanly, the DOM boundary holds, error messages are mostly specific and helpful, and the test coverage (cases, snapshots, reference check) is strong. The items below are mostly edge cases, plus a few things that will confuse pupils.

---

## 1. Interpreter — bugs

### 🔴 1.1 `LABEL` and `DOT` ignore user procedures that OUTPUT
`isValueStart()` (`commands.ts`) does not know about user procedures, so a reporter procedure is not seen as a value:

```logo
TO D :x  OUTPUT :x * 2  END
LABEL D 3        ; ✗ Unexpected value 3 — LABEL drew the text "D"
TO X0  OUTPUT 10  END
DOT X0 X0        ; draws a dot at the turtle, then ✗ "X0 OUTPUTs a value but was used as a command"
```
Fix: `isValueStart(tok, rctx)` should also return true for `hasOwn(rctx.procs, tok)`. Add both lines to `tests/cases.js`.

### 🔴 1.2 Tail-call optimisation changes which variables are visible
For direct self-recursion in tail position, `runStack` attaches the new scope to the *caller's caller* (`parentVars = Object.getPrototypeOf(top.vars)`). With dynamic scoping this is visible: the callee no longer sees the previous invocation's locals. The same procedure behaves differently depending on whether anything follows the recursive call:

```logo
TO T :n
  IF :n = 0 [PRINT :m STOP]
  LOCALMAKE "m :n
  T :n - 1            ; tail call   → ✗ Unknown variable: :M
END                   ; add "PRINT 0" after the call → prints 1 (dynamic scoping)
T 2
```
Options: (a) only drop the old scope when it has no own names other than the parameters being rebound — i.e. reuse it in place, or (b) keep the scope chain but collapse it when the dropped scope's own keys are all shadowed by the new scope's parameters, or (c) document it as a known limitation in lang-spec §6/§7. (a) gives constant memory for the usual `TO SPIRAL :S … SPIRAL :S + 1 END` and correct semantics otherwise.

Related 🟡: non-self tail calls (mutual recursion `A → B → A …`) run in constant *stack* but the scope chain grows by one object per call, so an endless mutual recursion slowly leaks memory (80 000 calls ≈ 0.7 s, linear — no crash, just growth).

### 🔴 1.3 Error line points into a procedure body after the procedure returned
`noteTok` updates `rctx.execLine` for every operand, including tokens inside a reporter procedure. When the error is raised *after* the procedure returned (operator or command validation), the message names the wrong line:

```logo
TO Z
  OUTPUT 0
END
PRINT 10 / Z          ; ✗ Division by zero   line 2:  OUTPUT 0
WAIT Z - 1            ; ✗ WAIT: duration must be >= 0   line 2:  OUTPUT 0
```
Fix: in `runExpr` (or `deeper` around it) save `execLine` before the call and restore it afterwards; in `runStack`, the statement token could also be re-noted before calling the CMD handler's validation — simplest is to save/restore in `runExpr`.

### 🔴 1.4 Floating-point drift is shown to pupils and breaks `=`
```logo
REPEAT 4 [FD 100 RT 90]
PRINT XCOR            ; 1.42108547152e-14
RT 0.1 REPEAT 3599 [RT 0.1]
PRINT HEADING         ; 1.33582034323e-11
PRINT 0.1 + 0.2 = 0.3 ; 0   (while PRINT 0.1 + 0.2 shows 0.3)
```
After a square the turtle is "not home": `IF XCOR = 0 […]` is false. For a teaching tool this is the most visible defect in the list.
Suggested fix (two parts, both cheap):
- `move()`: compute `sin`/`cos` exactly for multiples of 90° (or round the new `x`/`y` to, say, 1e-9), and normalise `angle` to `[0, 360)` with rounding to 1e-9 in `rotate()`.
- `=` / `!=` (and probably `<=`, `>=`): compare with a relative tolerance of ~1e-12, matching what `formatNum` prints (12 significant digits). Document it in lang-spec §3.2.

### 🔴 1.5 Animated pacing: many small moves are 100× slower than one big move
`move()` and `rotate()` always end with `nextFrame()`, so every command costs at least one frame, whatever the speed. Measured at speed 3 ("fast"):

| Program | Frames | Time at 60 Hz |
|---|---|---|
| `FD 360` | 6 | 0.1 s |
| `REPEAT 360 [FD 1 RT 1]` | 720 | 12 s |
| `CIRCLE 100` | 200 | 3.3 s |
| `REPEAT 100 [RT 0]` | 100 | 1.7 s (nothing visible happens) |

Typical classroom programs (circles from `REPEAT 360 [FD 1 RT 1]`, curves, fractals) are exactly the slow case, and the speed slider barely helps between 1 and 3. Fix: make the step budget per *frame* instead of per command — share a counter in `rctx` (like `tick()` already does with `tickCount`) so `move`, `rotate` and `tick` only await `nextFrame` once `STEPS_PER_FRAME[speed]` sub-steps (or degrees) have been spent; `RT 0` / zero-length moves should not yield at all. `CIRCLE` would then be as fast as a straight line of the same length.

---

## 2. Interpreter — design and smaller issues

- 🟡 **`"word` in a value position reads a variable.** `isVarTok` accepts `"x`, and `resolveToken` treats it like `:x`: `FD "size` moves by `:size`; `IF :c = "red [...]` fails with *Unknown variable: :RED*. Since words are not values, a clearer error is better: `"red is a word, not a number — use :red for a variable`. Only `MAKE` / `LOCAL` / `LOCALMAKE` / `FOR` / `TO` headers should accept `"name`.
- 🟡 **Reporter procedures vs. built-in functions bind differently.** `SQRT 16 + 9` → 13 (one operand), but `MYSQRT 16 + 9` → 5 (full expression). The built-in rule is documented and good for teaching; user procedures follow UCBLogo. Pupils who wrap a function in a procedure will get a different answer. At least document it next to "Single-input functions bind to one operand" in lang-spec §3; consider making single-parameter procedures bind like `UNARY`.
- 🟡 **Missing inputs give a misleading message.** `SQ` (defined with `:s`) followed by `RT 90` on the next line → *RT is a command, not a value*. When an argument of a command or procedure starts on a later line with a command word, say `SQ needs 1 input (:S)` instead. This is the most common beginner error; worth doing with the planned `interpreter/errors.ts`.
- 🟡 **`MOD` sign.** `-7 MOD 3` → `-1` (JavaScript `%`). Pupils use `MOD 360` / `MOD n` for wrap-around and expect `2`. UCBLogo has `MODULO` (sign of divisor) and `REMAINDER` (sign of dividend). Either make `MOD` follow the divisor or document it.
- 🟢 `ROUND -2.5` → `-2` (`Math.round`); most Logos give `-3`. Use `Math.sign(a) * Math.round(Math.abs(a))`.
- 🟢 Scientific notation with a negative exponent: `1E-5` tokenises as `1E`, `-`, `5` → *Unknown token: 1E*. `1E5` works. Either support it in the tokenizer regex or reject `E` notation altogether.
- 🟢 `SETCOLOR RDE` → *Unknown token: RDE*. When the bare word is not a value start, say `SETCOLOR: unknown colour name RDE` (as is already done for `"rde`).
- 🟢 `<>` is not accepted (`!=` is). Many textbooks use `<>`; adding it to the tokenizer and `BINOP_PREC` is two lines.
- 🟢 Duplicate parameter names are accepted silently: `TO F :a :a` (the last one wins). Reject in `extractProcedures`.
- 🟢 `TO … END` inside a block is extracted anyway: `REPEAT 2 [ TO X … END ]` defines `X` and leaves an empty loop. Harmless, but an error ("TO inside [ ]") would be clearer.
- 🟢 A bare `END` as a LABEL word (`LABEL END`) ends the procedure. Fine, but the error *END without a matching TO* is confusing in that case; low priority.
- 🟢 `;` inside a quoted word starts a comment (`LABEL "a;b` draws `a`). Consistent with beautify, just worth a line in lang-spec §1.1.
- 🟢 `REPEAT 2.5` runs 3 times (`Math.round`); UCBLogo truncates. Document or truncate.
- 🟢 `SPEED` changes the Options slider permanently (`io.setSpeed`). An example that ends with `SPEED 4` (26, 28) leaves the user in instant mode for every later run. Consider restoring the slider value at the end of the run, or only syncing it from direct mode.
- 🟢 Performance is fine: 1 000 000 `MAKE` iterations run in ~2.5 s headless. Most of that is `io.log` of an info line per statement; if the console filter hides info lines, skipping the string building when info logging is off would roughly halve it.

Code quality notes (no behaviour change):
- The scope / interpreter header comment lives in `scope.ts` but describes `runtime.ts`; move it to `runtime.ts` (and drop "v4.0").
- The built-in-name check in `extractProcedures` and the "produces a value" check in `runStack` repeat the same list (`UNARY`, `BINARY2`, `QUERY_TOKENS`, `REPCOUNT`, `REPCOUNTMAX`, `NOT`). One `isBuiltinWord(name)` / `isReporterWord(name)` helper in `expr.ts` would keep them in step.
- `MOD` exists both in `BINARY2_FNS` and `applyBinop`; let the prefix form call `applyBinop('MOD', a, b)`.
- `context.ts` comment still mentions a module-level `ctx` (canvas) that no longer exists in the core.

---

## 3. Language specification

- The spec is accurate for everything I checked (negative-sign rule, precedence, scoping table, error list, limits).
- Missing from §7 Known Limitations, if not fixed: 1.2 (tail calls and visible locals), 1.4 (float equality), `MOD` sign, `"word` in value position, reporter-procedure binding vs. `SQRT`.
- §1.3 presents `MAKE :x 42` as the main form and `MAKE "y` as an alternative. In every other Logo, `MAKE "x` is the standard and `MAKE :x` means something different (indirect assignment). For pupils who will later meet UCBLogo, Scratch-era textbooks or Python-Turtle tutorials referring to Logo, teach `MAKE "x` as the main form and keep `MAKE :x` as an accepted shortcut. Same for `LOCALMAKE`, `LOCAL`.

---

## 4. Examples

General:
- 🟡 All examples use `MAKE :X …`; see §3 — switch to `MAKE "X …` (and `LOCALMAKE "HALF`) so the examples teach the portable form. Snapshots won't change.
- 🟢 Negative numbers are written with a detached sign: `MAKE :N - 150` (15), `MAKE :X - 180` (17), `FOR :X - 180 180 6` (23), `SETPOS - 40 100` (24), `MAKE :BOT - 140` (23). They work only because unary minus is accepted at operand start; `-150` is the form lang-spec §1.2 teaches (and `SETPOS 0 - 100` is the documented pitfall). Write `-150`; beautify keeps it.
- 🟢 Every file repeats its title as a `; Title` comment right under `;; title:`; drop the duplicate line or turn it into a one-line explanation of the idea.
- 🟢 Uppercase everywhere is fine for Logo, but a couple of lowercase examples would show that case doesn't matter.

Individual:
- 08 Random Splatter: `RND 255` gives 0–254; `RND 256` covers the full range.
- 17 Sine Wave: `MAKE :Y SIN :X` + `MAKE :Y :Y * 180` → `MAKE "Y 180 * SIN :X` shows the precedence rule nicely; the `PU … PD` inside the loop deserves a comment ("pen down only after the first jump").
- 19 OUTPUT: `HYPO 90 120` is computed twice per iteration; `LOCALMAKE`/`MAKE "L HYPO 90 120` then `FD :L BK :L` is clearer.
- 26 SPEED and 28 DOT: they leave the slider at instant (see §2). Either restore the speed at the end (`SPEED 2`) or fix `SPEED` itself.
- 30 Global Counter: good — it is the only example that explains scoping. Consider showing the contrast (a `MAKE` that *would* clobber a variable without `LOCALMAKE`).

Coverage gaps — commands with no example: `BREAK` / `CONTINUE`, `LOCAL`, `TOWARDS` / `DISTANCE`, `ARCTAN` etc., `XCOR` / `YCOR` / `HEADING` as values, `WAIT`, `PRINT "word`, `MOD`, `NOT` / `AND` / `OR`, `IF` with a procedure that OUTPUTs a truth value (predicate procedure). Suggested new examples:
1. **Clock face** — `REPEAT 12`, `MOD`, `LABEL` with numbers, `WAIT` for a ticking second hand.
2. **Chase** — `TOWARDS` / `DISTANCE` with a target point, `WHILE [DISTANCE 0 0 > 5]`.
3. **Find the first …** — `FOR` + `IF … [BREAK]`, `CONTINUE` to skip, a predicate procedure `TO EVEN? :N OUTPUT :N MOD 2 = 0 END`.
4. **Tree** — classic binary tree recursion (non-tail, needs `LOCALMAKE` or parameters only), the most common recursion exercise in class.

---

## 5. Suggested order

1. 1.4 float drift and 1.5 pacing (most visible in class).
2. 1.1 LABEL/DOT with procedures, 1.3 error line (small, safe fixes with test cases).
3. 1.2 tail-call scoping (decide: fix or document).
4. Error-message items in §2 together with `interpreter/errors.ts` (TODO item 2).
5. Examples: `MAKE "x`, `-150`, new examples for the coverage gaps.

Each fix should add a case to `tests/cases.js` (language) or `tests/unit/` (state), per CLAUDE.md.
