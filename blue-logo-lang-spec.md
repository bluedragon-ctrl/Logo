# Blue Logo — Language Specification
## Version 8.6 — November 2026

Blue Logo is a subset of UCBLogo extended with several convenience features. It is case-insensitive. All keywords and command names in this document are shown in uppercase; lowercase equivalents are equally valid.

This document covers everything a **programmer** needs to write, understand, and debug Logo programs. Implementation internals are in `blue-logo-impl-spec.md`.

> **Changes in v8.0 that can affect older programs:** expressions now use standard operator precedence and are left-associative (§3), and `MAKE` inside a procedure now updates an existing outer/global variable instead of always creating a local one (§6). Use `LOCALMAKE` / `LOCAL` for procedure-private variables.

---

## 1. Program Structure

A Logo program is a sequence of statements separated by whitespace and newlines. Statements are executed top-to-bottom. Procedure definitions (`TO … END`) are extracted before execution begins and are available for the entire run regardless of where they appear in the source.

Line breaks are mostly insignificant: a command may take its inputs from the next line, and a `[ block ]` may start on the next line:

```logo
IFELSE :N > 5 [ SETCOLOR RED ]
              [ SETCOLOR GREEN ]
```

A line break does end things in three places:
- **Operators:** outside parentheses, an operator at the start of a line does not continue the expression on the line before (`PRINT 5` ⏎ `+ 1` is an error). Inside `( )` an expression may span lines.
- **`TO` header:** the procedure name and its parameters are the rest of the `TO` line.
- **`DOT`:** takes its inputs only from its own line, so `DOT` alone on a line draws at the turtle.

### 1.1 Comments

A semicolon `;` starts a comment that extends to the end of the line.

```logo
; this entire line is a comment
FD 100  ; inline comment after a command
```

### 1.2 Values

All values are floating-point numbers. Logical predicates return `1` (true) or `0` (false). There are no list or string values; the only text is a **quoted word** (`"Hello`), accepted by `LABEL`, `PRINT`, and as a colour name for `SETCOLOR`. Quoted words keep their case.

**Negative numbers:** a minus sign glued to the following number, variable or `(` — and separated by a space from what comes before — is a negative sign:

```logo
SETPOS 0 -100      ; two inputs: 0 and -100
SETPOS 0 -:Y       ; two inputs: 0 and the negative of :Y
SETPOS 0 - 100     ; ONE input: 0 - 100 = -100  → SETPOS then lacks its y input
FD 100 -10         ; error: -10 is an extra value. Subtraction needs spaces: FD 100 - 10
```

### 1.3 Variables

Variables are assigned with `MAKE` and read with the `:name` prefix. Names are case-insensitive. `"name` is accepted as the target of `MAKE` / `LOCAL` / `FOR`.

```logo
MAKE :x 42
FD :x              ; forward 42
MAKE "y 10         ; double-quote prefix also works for MAKE
FD :y + :x         ; forward 52
```

See §6 for scoping rules.

---

## 2. Commands

### 2.1 Motion

| Command | Description |
|---|---|
| `FORWARD n` / `FD n` | Move forward n units along the current heading, drawing a trail if the pen is down. |
| `BACK n` / `BK n` | Move backward n units (equivalent to `FD -n`). |
| `RIGHT n` / `RT n` | Turn clockwise n degrees. |
| `LEFT n` / `LT n` | Turn counter-clockwise n degrees. |
| `SETHEADING n` / `SETH n` | Set absolute heading. 0 = north (up), 90 = east, 180 = south, 270 = west. Animates via the shorter arc (≤ 180°). |
| `HOME` | Teleport to the origin (0, 0), heading 0°. Instant — no trail drawn. |
| `SETPOS x y` | Move straight to (x, y) without changing heading. Draws a line if the pen is down. |

**Canvas edge:** if `FD`, `BK` or `SETPOS` would take the turtle off the canvas, it moves to the edge, the console shows `OUCH! Turtle went off the canvas.` and the program ends.

**Turtle and canvas queries (usable in expressions):**

| Expression | Returns |
|---|---|
| `XCOR` / `YCOR` | Current x / y coordinate. |
| `HEADING` | Current heading in degrees, normalised to [0, 360). |
| `TOWARDS x y` | Heading (degrees CW from north) from the turtle to point (x, y). |
| `DISTANCE x y` | Distance from the turtle to point (x, y). |
| `SCRWIDTH` / `SCRHEIGHT` | Canvas width / height in Logo units. The origin is the centre, so `SCRWIDTH / 2` is the right edge. |

### 2.2 Drawing

| Command | Description |
|---|---|
| `PENUP` / `PU` | Raise the pen. Motion no longer draws. |
| `PENDOWN` / `PD` | Lower the pen. Motion draws. |
| `PENDOWN?` / `PD?` | 1 if pen is down, 0 if up. |
| `PENUP?` / `PU?` | 1 if pen is up, 0 if down. |
| `CIRCLE r` | Draw a circle of radius r, turning right, starting at the turtle position. Negative r draws the mirror image. \|r\| is capped at 2000. |
| `DOT` | Filled dot at the turtle position. Diameter = pen width, colour = pen colour. Draws even with the pen up. |
| `DOT x y` | Filled dot at (x, y); the turtle does not move. Inputs must start on the same line as `DOT`. |
| `SETCOLOR r g b` / `SC r g b` | Set pen colour. Channels 0–255; out-of-range values are clamped with a warning. |
| `SETCOLOR name` | Named colour, bare or quoted: `SETCOLOR RED`, `SETCOLOR "red` — see §4. |
| `SETWIDTH n` / `SW n` | Set pen width in pixels. Clamped to 0.5–100 with a warning. |
| `LABEL "text` | Draw text (case kept) at the turtle position in the pen colour. One word per LABEL. |
| `LABEL value` | Draw a number: `LABEL :X`, `LABEL XCOR`, `LABEL (:A + 1)`. |
| `CLEARSCREEN` / `CS` | Clear the trail, dots and labels; reset the turtle (position, heading, pen, colour, width). Variables, procedures and console are kept. |
| `HIDETURTLE` / `HT` | Hide the turtle sprite. |
| `SHOWTURTLE` / `ST` | Show the turtle sprite. |

### 2.3 Loops

| Command | Description |
|---|---|
| `REPEAT n [body]` | Run body n times (n rounded). Negative n logs a warning and skips. |
| `REPCOUNT` | Current iteration (1…n) of the innermost `REPEAT` in the current procedure. Error outside a `REPEAT`. |
| `REPCOUNTMAX` | Total iteration count n of that `REPEAT`. |
| `WHILE [cond] [body]` | Run body while cond is non-zero; cond is checked before each iteration. |
| `FOR :v start end [body]` | Count `:v` from start to end in steps of ±1 (direction automatic). |
| `FOR :v start end step [body]` | As above with an explicit step. Step 0 is an error. Fractional steps are safe (`FOR :i 0 1 0.1` runs 11 times). |
| `BREAK` | Leave the innermost `REPEAT` / `FOR` / `WHILE`. Error outside a loop or across a procedure boundary. |
| `CONTINUE` | Skip to the next iteration of the innermost loop. Same restrictions as `BREAK`. |

### 2.4 Control

| Command | Description |
|---|---|
| `IF cond [body]` | Run body if cond is non-zero. |
| `IFELSE cond [then] [else]` | Run then if cond is non-zero, otherwise else. |
| `STOP` | Leave the current procedure. At top level: end the program. |
| `OUTPUT val` / `OP val` | Return val from the current procedure (see §2.5). |
| `WAIT n` | Pause n seconds (n ≥ 0, capped at 30). The STOP button ends a WAIT immediately. |
| `SPEED n` | Animation speed 0 (slowest) … 3 (fast) animated, 4 = instant — the same scale as the Options speed slider. Takes effect immediately and moves the slider. Outside 0–4: clamped with a warning. |

### 2.5 Procedures

```logo
TO name :param1 :param2
  ; body statements
END
```

- Parameters are listed with `:` on the `TO` line and are private to each call.
- Procedure names must start with a letter or `_` and cannot redefine built-in words (`TO FD` is an error).
- A procedure used as a **command** must not `OUTPUT` — `F` alone, where F outputs, is an error ("You don't say what to do with …").
- A procedure used as a **value** must `OUTPUT`; falling off the end or `STOP` is an error. Its inputs are full expressions: `FACT :N - 1` means `FACT (:N - 1)`.
- **Recursion:** a procedure call that is the last thing a procedure does (tail call) can repeat forever — `TO SPIRAL :S  FD :S RT 89  SPIRAL :S + 1  END`. Other recursion (e.g. a tree or the Dragon curve) may nest up to 10 000 levels; recursion inside expressions (procedures used as values) up to 500 levels.

```logo
TO SQUARE :size
  REPEAT 4 [ FD :size  RT 90 ]
END
SQUARE 100

TO DOUBLE :n
  OUTPUT :n * 2
END
FD DOUBLE 50    ; forward 100
```

### 2.6 Variables and Output

| Command | Description |
|---|---|
| `MAKE :name val` | Set a variable (see §6 for which one). |
| `LOCALMAKE :name val` | Create a variable private to the current procedure and set it. |
| `LOCAL :a :b …` | Declare variables private to the current procedure; give them values later with `MAKE`. Reading one before it has a value is an error. |
| `PRINT val` / `PR val` | Print a value to the console (`0.1 + 0.2` prints `0.3`). Always shown, opens the console if hidden. |
| `PRINT "word` | Print a word. |
| `CLEARTEXT` / `CT` | Clear the console. |

---

## 3. Expressions

Every numeric input accepts a full expression. Operators follow the usual maths rules: higher precedence binds tighter, equal precedence evaluates **left to right**, and parentheses group.

| Precedence | Operators |
|---|---|
| highest | unary minus, math functions (`SIN`, `SQRT`, …) — bind to the single operand right after them |
| 5 | `*` `/` `MOD` |
| 4 | `+` `-` |
| 3 | `=` `!=` `<` `>` `<=` `>=` |
| 2 | `AND` |
| 1 (lowest) | `OR` |

```logo
PRINT 2 + 3 * 4        ; 14
PRINT (2 + 3) * 4      ; 20
PRINT 10 - 2 - 3       ; 5
IF :A + 1 > 5 [ … ]    ; (:A + 1) > 5
PRINT SIN 30 * 2       ; (SIN 30) * 2 = 1
PRINT SQRT (9 + 16)    ; 5 — use ( ) to give a function a whole expression
IF NOT :X = 5 [ … ]    ; NOT applies to the whole comparison
```

An expression inside `( )` may span several lines.

### 3.1 Arithmetic

| Operator | Description |
|---|---|
| `+` `-` `*` | Addition, subtraction, multiplication. `-` before an operand is negation. |
| `/` | Division. Error on division by zero. |
| `MOD` | Remainder. Infix `10 MOD 3` → 1, or prefix `MOD 10 3`. Error on zero divisor. |

### 3.2 Comparison and logic

Comparisons `>` `<` `=` `>=` `<=` `!=` return 1 or 0 (`=` is exact). `AND`, `OR` (infix) and `NOT` (prefix) treat 0 as false and anything else as true, and return 1 or 0. Both sides of `AND` / `OR` are always evaluated.

### 3.3 Math functions

Single-input functions bind to the one operand that follows (number, variable, query, another function, or a `( … )` group).

| Function | Description |
|---|---|
| `SIN n` `COS n` `TAN n` | Trigonometry, n in degrees. |
| `ARCSIN n` `ARCCOS n` | Inverse sine / cosine, n in [−1, 1], result in degrees. |
| `ARCTAN n` | Arctangent, result in degrees. |
| `SQRT n` | Square root, n ≥ 0. |
| `LN n` / `LOG n` | Natural / base-10 logarithm, n > 0. |
| `EXP n` | eⁿ (n ≤ 709). |
| `ABS n` `INT n` `ROUND n` `FLOOR n` `CEILING n` | Absolute value, truncate toward zero, round, round down, round up. |
| `RANDOM n` / `RND n` | Random whole number 0 … ⌊n⌋−1. n must be ≥ 1. |

Two-input prefix functions (each input is a full expression):

| Function | Description |
|---|---|
| `POWER a b` | aᵇ. Error if the result is not a real number (e.g. `POWER -8 0.5`). |
| `MAX a b` / `MIN a b` | Larger / smaller value. |
| `TOWARDS x y` / `DISTANCE x y` | See §2.1. |

Results that overflow to infinity are an error ("Number too large").

---

## 4. Named Colours

| Name | RGB | Name | RGB |
|---|---|---|---|
| `RED` | 220, 50, 50 | `NAVY` | 0, 0, 150 |
| `ORANGE` | 255, 140, 0 | `PURPLE` | 150, 50, 200 |
| `YELLOW` | 255, 220, 0 | `PINK` | 255, 100, 180 |
| `GREEN` | 50, 180, 50 | `MAGENTA` | 220, 0, 220 |
| `LIME` | 100, 255, 50 | `WHITE` | 255, 255, 255 |
| `CYAN` | 0, 220, 220 | `GRAY` / `GREY` | 150, 150, 150 |
| `BLUE` | 50, 100, 220 | `BLACK` | 0, 0, 0 |
| `BROWN` | 150, 80, 30 | `GOLD` | 255, 200, 0 |

---

## 5. Coordinate System

The origin (0, 0) is the centre of the canvas. X increases to the right, Y upward. One unit is one CSS pixel. Headings: 0° = north, clockwise positive.

---

## 6. Variable Scoping Rules

Blue Logo uses **dynamic scoping**, like UCBLogo: a procedure can read the variables of whoever called it.

| Situation | Behaviour |
|---|---|
| `MAKE :x …` | Updates the nearest existing `:x` — a parameter or `LOCAL` of the current procedure, of a calling procedure, a `FOR` variable, or a global. If no `:x` exists, a **global** is created. |
| `LOCALMAKE :x …` / `LOCAL :x` | Creates `:x` in the current procedure (at top level: a global). It shadows outer variables of the same name until the procedure returns. |
| Procedure parameters | Private to each call. `MAKE` of a parameter changes only that call's copy. |
| `FOR :v …` | `:v` exists only inside the loop. Everything else behaves as outside the loop (a `MAKE` in the body updates outer variables). |
| `REPEAT` / `WHILE` / `IF` bodies | No new scope. |

```logo
MAKE :COUNT 0
TO TICK
  LOCALMAKE :STEP 1          ; private
  MAKE :COUNT :COUNT + :STEP ; updates the global
END
TICK TICK
PRINT :COUNT                 ; 2
```

**Recursive procedures that need their own working variables must use `LOCALMAKE`** (or parameters) — with plain `MAKE`, all levels share one global.

---

## 7. Known Limitations

| Area | Behaviour |
|---|---|
| **Numbers only** | No lists or strings; quoted words exist only for `LABEL`, `PRINT` and colour names. |
| **No short-circuit logic** | `AND` / `OR` evaluate both sides: `:X != 0 AND 10 / :X > 1` still divides by zero when `:X` is 0. Use nested `IF`. |
| **`REPCOUNT` is innermost only** | Use `FOR` with a named variable if you need an outer loop's count. |
| **`HOME` does not draw** | Unlike UCBLogo, `HOME` never draws a line, even with the pen down. |
| **Canvas edge ends the program** | There is no `WRAP` / `WINDOW` mode. |
| **Not implemented** | `FILL`, `FOREVER`, `SETXY`/`SETX`/`SETY`, file commands (use the SAVE / LOAD buttons). |

---

## 8. Error Messages

A runtime error halts the program and shows the line of the statement or value being worked on:

```
✗ Unknown variable: :SIZE
  line 7:  FD :SIZE
```

| Condition | Message (abridged) |
|---|---|
| Unknown command | `Unknown command: FOO` |
| Value used as a command | `SIN produces a value — use it as an input, e.g. PRINT SIN 30` |
| Extra value after a command | `Unexpected value -10 — the previous command already has all its inputs. …` |
| Command used as a value | `RT is a command, not a value — a value was expected here` |
| Undefined variable | `Unknown variable: :X` |
| `LOCAL` variable read before set | `Variable :X has no value yet (declared with LOCAL)` |
| `:XCOR` etc. with colon | `XCOR: use without colon (e.g. FD XCOR). …` |
| Division / `MOD` by zero | `Division by zero` / `MOD: divisor must not be zero` |
| Math domain | e.g. `SQRT: argument -5 must be >= 0` |
| Overflow | `Number too large (overflow)` |
| Missing `)` / `]` | `Missing ) — a ( was opened but never closed` / `Missing ] — …` |
| Missing `[` | `Expected [ but got: …` |
| Missing `END` / stray `END` | `Procedure F (line 3): missing END` / `END without a matching TO (line 9)` |
| Redefining a built-in | `TO: FD is a built-in word and cannot be redefined` |
| `OUTPUT` from a command call | `You don't say what to do with 5 — F OUTPUTs a value but was used as a command` |
| No `OUTPUT` from a value call | `F did not OUTPUT a value, but was used where a value is needed` |
| `OUTPUT` outside a procedure | `OUTPUT used outside a procedure` |
| `BREAK` / `CONTINUE` outside a loop | `BREAK used outside a loop` |
| `REPCOUNT` outside `REPEAT` | `REPCOUNT used outside a REPEAT loop` |
| Deep recursion | `Stack overflow: … (> 10000 frames)` / `Expression nested too deeply (> 500 levels) …` |
| `FOR` step 0, `WAIT` < 0, non-finite `CIRCLE` | Specific error |

Warnings (execution continues): `REPEAT` with negative count (skipped), `SETCOLOR` / `SETWIDTH` / `SPEED` clamped, `WAIT` > 30 s capped, `CIRCLE` radius capped, trail limit (50 000 segments) or label limit (500) reached.

---

## 9. Examples

31 built-in examples are available from the EXAMPLES panel.

| Title | Features demonstrated |
|---|---|
| Square, Triangle, Star | `REPEAT`, `FD`, `RT` |
| Circle | `CIRCLE` |
| Spiral, Sunburst | `REPEAT` with a growing variable |
| Spinning Squares | Nested `REPEAT` |
| Random Splatter | `RND`, `SETCOLOR`, `SETWIDTH`, `HT` |
| Coloured Star | `SETCOLOR`, `SETWIDTH` |
| Growing Circles, Flower | `CIRCLE` inside `REPEAT` |
| House | `TO…END` procedures |
| Rainbow Spiral, Comments | `SETCOLOR` with variables, `;` comments |
| Bouncing Counter | `IF`, `IFELSE` across two lines, `PRINT` |
| Diamond | `SETPOS`, `PU`/`PD`, negative values |
| Compass Rose | `SETH`, arithmetic |
| Sine Wave | `SIN`, `SETPOS` |
| STOP in Procedure | `STOP`, recursion |
| OUTPUT — Return Values | `OUTPUT`, `SQRT (…)` |
| WHILE — Unwinding Spiral | `WHILE` |
| FOR — Starburst, FOR — Colour Spectrum | `FOR` with step |
| Deep Recursion — Dragon Curve | Recursion 12 levels deep, `LOCALMAKE` |
| Named Colours — Colour Wheel | Named colours, `LABEL`, `SETHEADING` |
| SPEED — Slow to Fast | `SPEED` inside a loop |
| REPCOUNT — Expanding Spiral | `REPCOUNT` |
| DOT — Sine Wave Scatter | `DOT`, `SCRWIDTH` / `SCRHEIGHT`, parentheses |
| Precedence & Parentheses | Operator precedence, `( )` |
| Global Counter & LOCALMAKE | `MAKE` from a procedure, `LOCALMAKE`, `LABEL "Word` |
| Tail Recursion — Endless Spiral | Unbounded tail recursion, canvas edge |
