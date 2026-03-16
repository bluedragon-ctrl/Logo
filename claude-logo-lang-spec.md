# Claude Logo — Language Specification
## Version 6.4 — March 2026

Claude Logo is a subset of UCBLogo extended with several convenience features. It is case-insensitive. All keywords and command names in this document are shown in uppercase; lowercase equivalents are equally valid.

This document covers everything a **programmer** needs to write, understand, and debug Logo programs. Implementation internals are in `claude-logo-impl-spec.md`.

---

## 1. Program Structure

A Logo program is a sequence of statements separated by whitespace and newlines. Statements are executed top-to-bottom. Procedure definitions (`TO … END`) are extracted before execution begins and are available for the entire run regardless of where they appear in the source.

### 1.1 Comments

A semicolon `;` starts a comment that extends to the end of the line. Comments are stripped before tokenisation and do not affect execution.

```logo
; this entire line is a comment
FD 100  ; inline comment after a command
```

### 1.2 Numbers

All values in Claude Logo are floating-point numbers. There are no strings, booleans, or lists as distinct types. Logical predicates return `1` (true) or `0` (false).

**Negative number literals:** Write the minus sign directly adjacent to the digits with no space:

```logo
SETPOS 0 -100      ; OK — -100 is a negative literal
SETPOS 0 - 100     ; OK — 100 - 100 = 0 (binary subtraction)
FD -50             ; OK — forward -50 (same as BK 50)
```

### 1.3 Variables

Variables are assigned with `MAKE` and read with `:name` prefix. Variable names are case-insensitive.

```logo
MAKE :x 42
FD :x              ; forward 42
MAKE "y 10         ; double-quote prefix also works
FD :y + :x         ; forward 52
```

---

## 2. Commands

### 2.1 Motion

| Command | Description |
|---|---|
| `FORWARD n` / `FD n` | Move forward n units along the current heading, drawing a trail if the pen is down. |
| `BACK n` / `BK n` | Move backward n units (equivalent to `FD -n`). |
| `RIGHT n` / `RT n` | Turn clockwise n degrees. |
| `LEFT n` / `LT n` | Turn counter-clockwise n degrees. |
| `SETHEADING n` / `SETH n` | Set absolute heading. 0 = north (up), 90 = east (right), 180 = south, 270 = west. Animates via the shorter arc (≤ 180°). |
| `HOME` | Teleport to the origin (0, 0), heading 0° (north). Instant — no trail drawn. |
| `SETPOS x y` | Teleport to position (x, y). Draws a trail segment if the pen is down. |

**Turtle state queries (usable in expressions):**

| Expression | Returns |
|---|---|
| `XCOR` | Current x coordinate. |
| `YCOR` | Current y coordinate. |
| `HEADING` | Current heading in degrees, normalised to [0, 360). |
| `TOWARDS x y` | Heading (degrees CW from north) from the turtle to point (x, y). |
| `DISTANCE x y` | Euclidean distance from the turtle to point (x, y). |

### 2.2 Drawing

| Command | Description |
|---|---|
| `PENUP` / `PU` | Raise the pen. Motion no longer draws a trail. |
| `PENDOWN` / `PD` | Lower the pen. Motion draws a trail. |
| `PENDOWN?` / `PD?` | Returns 1 if pen is down, 0 if up. |
| `PENUP?` / `PU?` | Returns 1 if pen is up, 0 if down. |
| `CIRCLE r` | Draw a circle of radius r centred at the turtle's current position. r is capped at 2000. |
| `SETCOLOR r g b` / `SC r g b` | Set line colour. Each channel 0–255; out-of-range values are clamped with a warning. Also accepts a named colour — see Section 4. |
| `SETWIDTH n` / `SW n` | Set line width in pixels. Clamped to 0.5–100 with a warning. |
| `LABEL text` | Draw text at the turtle's current position in the current pen colour. Text persists across canvas resize. `text` is the next token; multi-word labels require separate LABEL calls. |
| `CLEARSCREEN` / `CS` | Clear the canvas, reset the turtle to the origin and heading 0, and clear the trail and all labels. |
| `HIDETURTLE` / `HT` | Hide the turtle sprite. |
| `SHOWTURTLE` / `ST` | Show the turtle sprite. |

### 2.3 Control Flow

| Command | Description |
|---|---|
| `REPEAT n [body]` | Execute the body block n times. Negative n logs a warning and skips. |
| `WHILE [cond] [body]` | Execute the body while the condition block evaluates to non-zero. The condition is re-evaluated before each iteration. |
| `FOR :v start end [body]` | Count variable `:v` from `start` to `end`, step ±1 (sign auto-determined). Execute body each step. |
| `FOR :v start end step [body]` | As above but with an explicit step size. Step 0 throws an error. |
| `IF cond [body]` | Execute body if `cond` is non-zero. |
| `IFELSE cond [t] [f]` | Execute the `t` block if `cond` is non-zero, otherwise execute the `f` block. |
| `STOP` | Exit the current procedure immediately. Has no effect at top level. |
| `OUTPUT val` / `OP val` | Return `val` from the current procedure. Must be inside a procedure. |
| `BREAK` | Exit the innermost enclosing loop (`REPEAT`, `FOR`, or `WHILE`) immediately. Cannot cross a procedure boundary — using `BREAK` outside any loop throws an error. |
| `WAIT n` | Pause execution for n seconds. n must be ≥ 0; capped at 30 s. |
| `SPEED n` | Set the animation speed from within a program (n = 1–4). 1 = slow animated, 4 = instant. Matches the OPTIONS speed slider. Values outside 1–4 are clamped with a warning. |

### 2.4 Procedures

```logo
TO name :param1 :param2
  ; body statements
END
```

- Parameter names use `:` prefix in the `TO` line.
- Parameters are local to the procedure. Calling procedures inherit the caller's variables (prototype chain lookup) but `MAKE` inside a procedure does not affect the caller's scope.
- Procedures can call themselves recursively. The trampoline executor prevents JavaScript stack overflow regardless of recursion depth.
- `OUTPUT val` returns a value; `STOP` exits with no value.

```logo
TO SQUARE :size
  REPEAT 4 [ FD :size  RT 90 ]
END

SQUARE 100
```

```logo
TO DOUBLE :n
  OUTPUT :n * 2
END

FD DOUBLE 50    ; forward 100
```

### 2.5 Variables and Output

| Command | Description |
|---|---|
| `MAKE :name val` | Assign `val` to variable `:name` in the current scope. |
| `PRINT val` | Print the evaluated value to the console. Always visible; auto-expands the console if hidden. |
| `CLEARTEXT` / `CT` | Clear the console output without affecting the canvas or interpreter state. |

---

## 3. Expressions

All numeric contexts accept full expressions. Expressions are evaluated **left-to-right with no operator precedence** — this matches standard UCBLogo behaviour.

```logo
MAKE :x 2 + 3 * 4    ; :x = 20  (not 14)
```

### 3.1 Arithmetic Operators

| Operator | Description |
|---|---|
| `+` | Addition |
| `-` | Subtraction (binary) or negation (unary, directly adjacent to digits) |
| `*` | Multiplication |
| `/` | Division. Throws on division by zero. |
| `MOD` | Modulo. Infix: `10 MOD 3` → 1. Also prefix: `MOD 10 3`. |

### 3.2 Comparison Operators

Return 1 (true) or 0 (false).

| Operator | Meaning |
|---|---|
| `>` | Greater than |
| `<` | Less than |
| `=` | Equal |
| `>=` | Greater than or equal |
| `<=` | Less than or equal |
| `!=` | Not equal |

### 3.3 Logical Operators

Operands are treated as: 0 = false, non-zero = true. Return 1 or 0.

| Operator | Description |
|---|---|
| `AND` | Logical and |
| `OR` | Logical or |
| `NOT` | Logical not (unary) |

### 3.4 Math Functions

Single-argument math functions take one token as their argument (a number literal, a variable `:x`, or a turtle state query like `XCOR`). They do not accept a full sub-expression — use `MAKE` to compute intermediate values if needed.

```logo
MAKE :h SQRT :a * :a + :b * :b    ; WRONG — SQRT only consumes :a
MAKE :sum :a * :a + :b * :b
MAKE :h SQRT :sum                  ; correct
```

| Function | Description |
|---|---|
| `SIN n` | Sine. Argument in degrees. |
| `COS n` | Cosine. Argument in degrees. |
| `TAN n` | Tangent. Argument in degrees. |
| `ARCSIN n` | Inverse sine. Argument in [−1, 1]; throws outside range. Result in degrees. |
| `ARCCOS n` | Inverse cosine. Argument in [−1, 1]; throws outside range. Result in degrees. |
| `ARCTAN n` | Arctangent. Unbounded argument. Result in degrees. |
| `SQRT n` | Square root. n ≥ 0; throws on negative. |
| `LN n` | Natural logarithm. n > 0; throws on ≤ 0. |
| `LOG n` | Base-10 logarithm. n > 0; throws on ≤ 0. |
| `EXP n` | eⁿ. Throws if result would overflow to Infinity (n > 709). |
| `ABS n` | Absolute value. |
| `INT n` | Truncate toward zero. |
| `ROUND n` | Round to nearest integer. |
| `FLOOR n` | Round down to nearest integer. |
| `CEILING n` | Round up to nearest integer. |
| `RANDOM n` / `RND n` | Random integer in [0, n−1]. n must be > 0. |

Two-argument prefix math functions (these do accept full sub-expressions for both arguments):

| Function | Description |
|---|---|
| `POWER a b` | Exponentiation: a ^ b. |
| `MAX a b` | Maximum of two values. |
| `MIN a b` | Minimum of two values. |

---

## 4. Named Colours

`SETCOLOR` accepts a colour name as a single token in place of three numeric r g b channels.

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

```logo
SETCOLOR RED          ; named colour
SETCOLOR 220 50 50    ; equivalent numeric form
```

---

## 5. Coordinate System

The origin (0, 0) is at the centre of the canvas. X increases to the right, Y increases upward (north).

**Heading convention:** 0° = north (up), 90° = east (right), 180° = south, 270° = west. All headings are in degrees, clockwise positive. `SETHEADING`, `HOME`, `TOWARDS`, and `HEADING` use this convention.

---

## 6. Variable Scoping Rules

| Context | Scope behaviour |
|---|---|
| Top level | All `MAKE` calls create global variables in `globalVars`. |
| Procedure call (statement context) | Procedure gets a new scope that inherits caller's variables. `MAKE` writes to the local scope and does not affect the caller. |
| `REPEAT` / `WHILE` body | `MAKE` affects the enclosing scope (shared object). Variables set in a loop body are visible outside it. |
| `FOR` body | `MAKE` does **not** affect the enclosing scope (copied object). This is an intentional inconsistency with `REPEAT`/`WHILE`. See Section 7. |

---

## 7. Known Limitations

These are documented design decisions, not bugs.

| Area | Behaviour |
|---|---|
| **No operator precedence** | `2 + 3 * 4` = 20, not 14. Evaluation is strictly left-to-right. This matches standard UCBLogo. Use parentheses... actually Logo has no parentheses. Use `MAKE` for intermediate values. |
| **Unary functions take one token** | `SQRT :a + :b` computes `(SQRT :a) + :b`, not `SQRT (:a + :b)`. Assign the inner expression to a variable first. |
| **Right-recursive binary chain** | `a - b + c` evaluates as `a - (b + c)`. |
| **FOR vs REPEAT/WHILE scoping** | `MAKE` inside a `FOR` body does not affect outer variables. `MAKE` inside `REPEAT`/`WHILE` does. |
| **`REPCOUNT` not implemented** | The current iteration index is not exposed inside `REPEAT` bodies. Use `FOR` if you need the index. |
| **`LOCAL :var` not implemented** | There is no way to declare a local variable except as a procedure parameter. |
| **`FILL` / `SAVE` / `LOAD` not implemented** | These UCBLogo commands are not available. |

---

## 8. Error Messages

When a runtime error occurs, execution halts and the console shows:

```
✘ <error message>
  line 7:  REPEAT :n [FD 100 RT 90]
```

The source line shown is the most recently executed line, which is where the problem occurred.

| Condition | Message |
|---|---|
| Unknown command | `Unknown command: FOO` |
| Undefined variable | `Undefined variable: :x` |
| Variable is NaN / Infinity | Error with variable name |
| Division by zero | Error on division |
| Math domain violation | Descriptive: e.g. `SQRT argument must be ≥ 0, got -5` |
| `RANDOM n` with n ≤ 0 | Error |
| `OUTPUT` outside a procedure | Error |
| `BREAK` outside a loop | `BREAK used outside a loop` |
| `FOR` step = 0 | Error (prevents infinite loop) |
| Missing `]` | `Expected ] — block was never closed` |
| `WAIT n < 0` | Error |
| `CIRCLE` with non-finite radius | Error |
| `:XCOR` / `:YCOR` / `:HEADING` with colon | Error — use bare `XCOR`, `YCOR`, `HEADING` |
| `REPEAT n < 0` | Warning in console, execution skips the block. Does **not** halt. |
| `SETCOLOR` channel out of [0, 255] | Warning — value clamped, execution continues. |
| `SETWIDTH` out of [0.5, 100] | Warning — value clamped, execution continues. |
| `WAIT n > 30` | Warning — capped to 30 s. |
| `CIRCLE r > 2000` | Warning — capped to 2000. |
| `SPEED n` outside 1–4 | Warning — value clamped. |

---

## 9. Examples

25 built-in examples are available from the EXAMPLES panel. They cover the full range of language features.

| Title | Features demonstrated |
|---|---|
| Square | `REPEAT`, `FD`, `RT` |
| Triangle | `REPEAT`, geometry (120° exterior angle) |
| Circle | `CIRCLE` command |
| Star | `REPEAT`, non-90° turns (144°) |
| Spiral | `REPEAT`, `MAKE`, variable step size |
| Spinning Squares | Nested `REPEAT` |
| Sunburst | `REPEAT` with growing variable, `FD`+`BK` |
| Random Splatter | `RND`, `SETCOLOR`, `SETWIDTH`, `HT` |
| Coloured Star | `SETCOLOR`, `SETWIDTH` |
| Growing Circles | `CIRCLE`, `MAKE`, variable radius |
| House | `TO…END` procedures, multiple procedure calls |
| Flower | `CIRCLE` inside `REPEAT` |
| Rainbow Spiral | `SETCOLOR` with `:r` `:g` `:b` variables |
| Bouncing Counter | `IF`, `IFELSE`, `PRINT`, `SETCOLOR` |
| Diamond | `SETPOS`, `PU`/`PD`, negative variable |
| Compass Rose | `SETH`, `MAKE`, arithmetic in expressions |
| Sine Wave | `SIN`, `SETPOS`, `PU`/`PD` |
| STOP in Procedure | `STOP` early exit, recursive procedure |
| OUTPUT — Return Values | `OUTPUT`/`OP`, `SQRT`, procedure composition |
| Comments | `;` inline comments throughout |
| WHILE — Unwinding Spiral | `WHILE`, `SETCOLOR` with expressions |
| FOR — Starburst | `FOR` with explicit step 15 |
| FOR — Colour Spectrum | `FOR`, `SETPOS`, `SETWIDTH`, `HT` |
| Colour Wheel | Named colours, `LABEL`, `SETHEADING`, six spokes |
| Deep Recursion — Dragon Curve | Recursive procedures, `SQRT` in expressions, 12 levels deep |
