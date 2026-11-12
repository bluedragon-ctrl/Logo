# Blue Logo — Language Specification
## Version 8.15 — November 2026

Blue Logo is a subset of UCBLogo extended with several convenience features. It is case-insensitive. All keywords and command names in this document are shown in uppercase; lowercase equivalents are equally valid.

This document covers everything a **programmer** needs to write, understand, and debug Logo programs. Implementation internals are in `blue-logo-impl-spec.md`.

> **New in v8.11:** filled shapes `BEGINFILL` … `ENDFILL` (§2.2), edge modes `WRAP` / `WINDOW` / `FENCE` (§2.1), keyboard, mouse and time — `KEYP`, `READKEY`, `MOUSEX`, `MOUSEY`, `BUTTONP`, `TIMER`, `RESETTIMER` (§2.7), several inputs in `(PRINT …)` / `(LABEL …)` (§2.2, §2.6), optional procedure inputs `TO BOX :W [:H 50]` (§2.5). **Changed:** `HOME` draws a line when the pen is down, as in UCBLogo (§2.1); the new words are built-in and can no longer be procedure names.
>
> **New in v8.9** (no changes to existing programs, except that `AND` / `OR` no longer evaluate a right side the left side already decides, and new built-in words can no longer be procedure names): `SETXY` / `SETX` / `SETY`, `ARC`, `SETBG`, `FOREVER`, `PI`, `PENSIZE`, the aliases `SETPC` / `SETPENCOLOR` / `SETPENSIZE`, `IFELSE` as a value (§2.4), short-circuit `AND` / `OR` (§3.2).
>
> **Changes in v8.8 that can affect older programs:** comparisons allow for floating-point drift (`0.1 + 0.2 = 0.3` is true, §3.2); `MOD` has the sign of the divisor (`-7 MOD 3` = 2) and `ROUND` rounds halves away from zero (§3.1); a `"word` used as a number is an error instead of reading the variable (§1.2); `TO` inside `[ ]` and a parameter listed twice are errors (§2.5).
>
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

A statement starts with `(` only to give a command a different number of inputs: `(PRINT "Score: :N)`, `(LABEL …)` (§2.6), or a procedure with optional inputs `(BOX 10 20)` (§2.5). Inside these parentheses the inputs may span lines.

### 1.1 Comments

A semicolon `;` starts a comment that extends to the end of the line.

```logo
; this entire line is a comment
FD 100  ; inline comment after a command
```

A `;` always starts a comment, even inside a quoted word: `LABEL "a;b` draws `a`.

### 1.2 Values

All values are floating-point numbers. Logical predicates return `1` (true) or `0` (false). There are no list or string values; the only text is a **quoted word** (`"Hello`), accepted by `LABEL`, `PRINT`, and as a colour name for `SETCOLOR` / `SETBG`, and as the name of a variable for `MAKE` / `LOCALMAKE` / `LOCAL` / `FOR`. Quoted words keep their case. A quoted word where a number is expected is an error: `FD "size` → `"size is a word, not a number — for a variable write :size`.

Numbers may use E notation: `1E5`, `2.5E+2`, `1E-3`.

**Negative numbers:** a minus sign glued to the following number, variable or `(` — and separated by a space from what comes before — is a negative sign:

```logo
SETPOS 0 -100      ; two inputs: 0 and -100
SETPOS 0 -:Y       ; two inputs: 0 and the negative of :Y
SETPOS 0 - 100     ; ONE input: 0 - 100 = -100  → SETPOS then lacks its y input
FD 100 -10         ; error: -10 is an extra value. Subtraction needs spaces: FD 100 - 10
```

### 1.3 Variables

Variables are assigned with `MAKE "name value` and read with `:name` ("the value of name"). Names are case-insensitive. This is the standard Logo form and the one the examples use. `MAKE :name value` is accepted as a shortcut, as are `LOCALMAKE :name` / `LOCAL :name` (in UCBLogo, `MAKE :x` means something else — it assigns to the variable *named by* `:x` — so prefer `"`).

```logo
MAKE "x 42
FD :x              ; forward 42
MAKE "y 10
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
| `HOME` | Go straight back to the origin (0, 0) — drawing a line if the pen is down, like `SETPOS 0 0` — then heading 0°. Not animated. (Before v8.11 `HOME` never drew.) |
| `SETPOS x y` / `SETXY x y` | Move straight to (x, y) without changing heading. Draws a line if the pen is down. |
| `SETX x` / `SETY y` | Move straight to a new x (or y); the other coordinate stays. Draws like `SETPOS`. |

**Canvas edge:** what happens when `FD`, `BK`, `SETPOS`, `SETX`, `SETY`, `HOME`, `CIRCLE` or `ARC` reaches the edge of the canvas depends on the edge mode:

| Command | Edge mode |
|---|---|
| `FENCE` | The start setting. The turtle moves to the edge, the console shows `OUCH! Turtle went off the canvas.` and the program ends. |
| `WRAP` | The turtle leaves on one side and comes back in on the opposite side, drawing on: the canvas behaves like the surface of a doughnut. `SETX SCRWIDTH / 2 + 10` ends 10 steps in from the left edge. A very long move draws at most 1 000 crossings and then jumps to where it ends. |
| `WINDOW` | The turtle may walk off the canvas and come back; what it draws out there is not seen (it is still stored, up to the trail limit). |

`CS` keeps the edge mode; RUN (with "Clear screen on run") and CLR go back to `FENCE`. Switching to `WRAP` or `FENCE` while the turtle is off the canvas (after `WINDOW`) brings it back, wrapped onto the canvas.

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
| `ARC angle r` | Walk `angle` degrees of that circle: the turtle moves along the arc and ends turned by `angle`. Negative angle turns left; negative r walks backward (mirror image, like `CIRCLE`). The turtle ends exactly on the arc: `ARC 90 100` from `HOME` ends at (100, 100), heading 90. `ARC 0 r` does nothing, `ARC a 0` only turns. Note: UCBLogo's `ARC` draws around a turtle that stays put; Blue Logo's walks, like its `CIRCLE`. |
| `DOT` | Filled dot at the turtle position. Diameter = pen width, colour = pen colour. Draws even with the pen up. |
| `DOT x y` | Filled dot at (x, y); the turtle does not move. Inputs (numbers, variables, functions or procedures that OUTPUT) must start on the same line as `DOT`. |
| `SETCOLOR r g b` / `SC r g b` | Set pen colour. Channels 0–255; out-of-range values are clamped with a warning. |
| `SETCOLOR name` | Named colour, bare or quoted: `SETCOLOR RED`, `SETCOLOR "red` — see §4. |
| `SETPC …` / `SETPENCOLOR …` | Other names for `SETCOLOR` (as in UCBLogo), same inputs. |
| `SETWIDTH n` / `SW n` / `SETPENSIZE n` | Set pen width in pixels. Clamped to 0.5–100 with a warning. |
| `PENSIZE` | The pen width (a value). |
| `SETBG name` / `SETBG r g b` / `SETBACKGROUND …` | Canvas background colour, same inputs as `SETCOLOR`. `CS` keeps it; RUN (with "Clear screen on run") and CLR go back to the canvas colour chosen in Options. |
| `LABEL "text` | Draw text (case kept) at the turtle position in the pen colour. One word per LABEL. |
| `LABEL value` | Draw a number: `LABEL :X`, `LABEL XCOR`, `LABEL (:A + 1)`, or a procedure that OUTPUTs (`LABEL DOUBLE 3`). |
| `(LABEL a b …)` | Draw several words and values as one label, with a space between each: `(LABEL "x: XCOR)`. |
| `CLEARSCREEN` / `CS` | Clear the trail, dots, labels and fills; reset the turtle (position, heading, pen, colour, width). Variables, procedures, console, `SETBG` and the edge mode are kept. |
| `HIDETURTLE` / `HT` | Hide the turtle sprite. |
| `SHOWTURTLE` / `ST` | Show the turtle sprite. |
| `BEGINFILL` … `ENDFILL` | Fill the shape the turtle walks in between. `BEGINFILL` starts recording at the turtle; every move (`FD`, `BK`, `CIRCLE`, `ARC`, `SETPOS`, `SETXY`, `SETX`, `SETY`, `HOME`) adds the point where it ends, with the pen up or down; `ENDFILL` closes the shape with a straight line back to the start and fills it. The fill colour is the pen colour at `BEGINFILL`, so `SETCOLOR YELLOW BEGINFILL SETCOLOR BLACK REPEAT 4 [ FD 50 RT 90 ] ENDFILL` is a yellow square with a black outline. The fill lies under everything drawn after `BEGINFILL` (the outline stays visible) and over what was drawn before. A crossing shape is filled completely (non-zero rule: the middle of `REPEAT 5 [ FD 100 RT 144 ]` is filled). Fewer than 3 corners fill nothing. A second `BEGINFILL` starts again; `CS` drops an unfinished fill. At most 1 000 fills of up to 10 000 corners each. |

### 2.3 Loops

| Command | Description |
|---|---|
| `REPEAT n [body]` | Run body n times. n is rounded to the nearest whole number (`REPEAT 2.5` runs 3 times; UCBLogo truncates) — rounding keeps counts like `REPEAT 0.7 * 10` right despite floating-point drift. Negative n logs a warning and skips. |
| `REPCOUNT` | Current iteration (1…n) of the innermost `REPEAT` in the current procedure. Error outside a `REPEAT`. |
| `REPCOUNTMAX` | Total iteration count n of that `REPEAT`. |
| `FOREVER [body]` | Run body again and again. Leave it with `BREAK` (or `STOP` inside a procedure); the STOP button always works. `REPCOUNT` counts the rounds (1, 2, …); `REPCOUNTMAX` is an error inside `FOREVER`. |
| `WHILE [cond] [body]` | Run body while cond is non-zero; cond is checked before each iteration. |
| `FOR :v start end [body]` | Count `:v` from start to end in steps of ±1 (direction automatic). |
| `FOR :v start end step [body]` | As above with an explicit step. Step 0 is an error. Fractional steps are safe (`FOR :i 0 1 0.1` runs 11 times): the k-th value is `start + k × step`, rounded to 15 digits, so `FOR :x -1 1 0.01` meets 0 and 1 exactly. |
| `BREAK` | Leave the innermost `REPEAT` / `FOR` / `WHILE`. Error outside a loop or across a procedure boundary. |
| `CONTINUE` | Skip to the next iteration of the innermost loop. Same restrictions as `BREAK`. |

### 2.4 Control

| Command | Description |
|---|---|
| `IF cond [body]` | Run body if cond is non-zero. |
| `IFELSE cond [then] [else]` | Run then if cond is non-zero, otherwise else. |
| `IFELSE cond [a] [b]` as a value | Where a value is expected, `IFELSE` gives the value of one block: `OUTPUT IFELSE :N < 2 [1] [:N * FACT :N - 1]`. Each block must hold exactly one value; only the chosen block is worked out (`IFELSE :X = 0 [0] [1 / :X]` is safe). |
| `STOP` | Leave the current procedure. At top level: end the program. |
| `OUTPUT val` / `OP val` | Return val from the current procedure (see §2.5). |
| `WAIT n` | Pause n seconds (n ≥ 0, capped at 30). The STOP button ends a WAIT immediately. |
| `SPEED n` | Animation speed 0 (slowest) … 3 (fast) animated, 4 = instant — the same scale as the Options speed slider. Takes effect immediately for the rest of the run, and the slider follows while the program runs; when a RUN ends the slider goes back to where the user set it. Typed in direct mode, `SPEED n` keeps its effect (it moves the slider for good). Outside 0–4: clamped with a warning. |

### 2.5 Procedures

```logo
TO name :param1 :param2
  ; body statements
END
```

**Optional inputs** follow the required ones, each written `[:name default]` on the `TO` line:

```logo
TO BOX :W [:H 50]
  REPEAT 2 [ FD :H RT 90 FD :W RT 90 ]
END
BOX 100          ; H is 50
(BOX 100 20)     ; H is 20
```

- A call without parentheses passes the required inputs only; the optional ones get their defaults. To pass optional inputs, put the whole call in parentheses: `(BOX 100 20)` as a command, `PRINT (AREA 3 4) + 1` as a value. In parentheses a call takes at least the required inputs and at most all of them (`BOX takes at most 2 inputs (:W [:H])`).
- A default is one value, worked out at each call, after the inputs before it are set — so it may use them: `TO RECT :W [:H :W]` makes a square by default.
- Required inputs come first (`TO F [:A 1] :B` is an error), and every optional input needs a default (`[:A]` alone is an error).

- Parameters are listed with `:` on the `TO` line and are private to each call. A name may appear only once (`TO F :A :A` is an error).
- `TO … END` must stand outside every `[ ]` block (`REPEAT 2 [ TO X … END ]` is an error).
- A call with too few inputs is an error that names them: `SQUARE` on its own → `SQUARE needs 1 input (:SIZE)`.
- Procedure names must start with a letter or `_` and cannot redefine built-in words (`TO FD` is an error).
- A procedure used as a **command** must not `OUTPUT` — `F` alone, where F outputs, is an error ("You don't say what to do with …").
- A procedure used as a **value** must `OUTPUT`; falling off the end or `STOP` is an error. Its inputs are full expressions: `FACT :N - 1` means `FACT (:N - 1)`. Note that this differs from the built-in single-input functions: `SQRT 16 + 9` is `(SQRT 16) + 9` = 13, but a procedure `MYSQRT 16 + 9` is `MYSQRT (16 + 9)` = 5. Use `( )` when in doubt: `(MYSQRT 16) + 9`.
- **Recursion:** a procedure call that is the last thing a procedure does (tail call) can repeat forever — `TO SPIRAL :S  FD :S RT 89  SPIRAL :S + 1  END`. A tail call gives the same result as any other call — the callee still sees the caller's variables (§6). Other recursion (e.g. a tree or the Dragon curve) may nest up to 10 000 levels; recursion inside expressions (procedures used as values) up to 500 levels.

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
| `MAKE "name val` | Set a variable (see §6 for which one). `MAKE :name val` also works. |
| `LOCALMAKE "name val` | Create a variable private to the current procedure and set it. |
| `LOCAL "a "b …` | Declare variables private to the current procedure; give them values later with `MAKE`. Reading one before it has a value is an error. |
| `PRINT val` / `PR val` | Print a value to the console (`0.1 + 0.2` prints `0.3`). Always shown, opens the console if hidden. |
| `PRINT "word` | Print a word. |
| `(PRINT a b …)` | Print several words and values on one line, with a space between each: `(PRINT "Score: :N)` → `Score: 7`. |
| `CLEARTEXT` / `CT` | Clear the console. |

### 2.7 Keyboard, mouse and time

| Word | Description |
|---|---|
| `KEYP` | 1 if a key was pressed and not read yet, else 0. Does not wait. |
| `READKEY` | Wait for a key press and give its key code (the STOP button ends the wait). Key presses wait in a queue (up to 32), oldest first. |
| `MOUSEX` / `MOUSEY` | Where the mouse pointer was last seen over the canvas, in turtle coordinates (the centre is 0 0, y up). |
| `BUTTONP` | 1 while the (left) mouse button is pressed on the canvas, else 0. |
| `TIMER` | Seconds since the program started, with a fraction (`0.25`). In direct mode every command is a new start. |
| `RESETTIMER` | Start `TIMER` again from 0. |

**Key codes** (the classic browser codes): letters `A`–`Z` are 65–90 whatever the case, digits `0`–`9` are 48–57, space 32, Enter 13, Escape 27, Backspace 8, arrows left 37, up 38, right 39, down 40. Other keys, and keys pressed with Ctrl / Alt / Cmd, are ignored.

Keys reach a program only while it runs, and only when they are not typed into a text field (the editor, the direct-mode line): click the canvas first. While a program runs, the arrow keys and space do not scroll the page. Key presses from before the run are forgotten.

```logo
; steer with the arrow keys, Escape ends
FOREVER [
  IF KEYP [
    MAKE "K READKEY
    IF :K = 37 [ LT 15 ]
    IF :K = 39 [ RT 15 ]
    IF :K = 27 [ BREAK ]
  ]
  FD 2
]
```

### 2.8 Graphs

`SETPLOT` chooses a graph range — the numbers the canvas shows — so a program can draw functions in their own units. It does not change the turtle's coordinates: `FD`, `SETPOS`, `XCOR`, `MOUSEX` … still count in canvas steps. Only the words below use the range.

| Word | Description |
|---|---|
| `SETPLOT xmin xmax ymin ymax` | Show x from xmin to xmax and y from ymin to ymax. The range fills the canvas minus a margin of 40 steps on each side (room for the axis numbers) and is worked out again for every use, so the program fits any window. x and y are stretched separately. xmin must be less than xmax, ymin less than ymax. |
| `(SETPLOT xmin xmax ymin ymax "EQUAL)` | The same with one scale for x and y, so a circle stays round; the range is widened around its centre to fill the canvas (more of the longer side is shown). |
| `PLOT x y` | Go to the graph point (x, y), like `SETPOS`: a line if the pen is down. A point outside the range (in `"EQUAL` mode: outside the area shown) breaks the line: the line is drawn up to the edge of the range, the turtle waits there, and the next point inside starts a new line where the curve comes back in. A line between two points that are both outside is not drawn. |
| `AXES xstep ystep` | Draw both axes across the range, in the pen colour and width, with a tick mark at every multiple of the step and numbers beside them (only every 2nd, 5th, 10th … when they would crowd). An axis goes through 0, or along the bottom / left edge when 0 is not in the range. The pen may be up; the turtle does not move. A step whose ticks would be less than 4 steps apart is an error. |
| `PLOTX` / `PLOTY` | The turtle's position in the graph range. |
| `RESETPLOT` | Forget the range. |

`CS` keeps the range; RUN (with "clear screen on run") and CLR remove it. `PLOT`, `AXES`, `PLOTX` and `PLOTY` without a range are an error.

```logo
SETPLOT -2 2 -1 4
AXES 0.5 1
SETCOLOR BLUE SETWIDTH 2
PU                              ; jump to the first point
FOR :X -2 2 0.01 [ PLOT :X :X * :X PD ]
```

Division by zero stays an error in a graph: for `y = 1 / x`, skip x = 0 (`IF :X <> 0 [ PLOT :X 1 / :X PD ]`). `FOR` counts `start + k × step`, so with `FOR :X -1 1 0.01` the value 0 really is 0.

---

## 3. Expressions

Every numeric input accepts a full expression. Operators follow the usual maths rules: higher precedence binds tighter, equal precedence evaluates **left to right**, and parentheses group.

| Precedence | Operators |
|---|---|
| highest | unary minus, math functions (`SIN`, `SQRT`, …) — bind to the single operand right after them |
| 5 | `*` `/` `MOD` |
| 4 | `+` `-` |
| 3 | `=` `!=` `<>` `<` `>` `<=` `>=` |
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
| `MOD` | Remainder with the sign of the divisor (like UCBLogo `MODULO`): `10 MOD 3` → 1, `-7 MOD 3` → 2, so `:N MOD 360` is always 0 … 359. Infix or prefix `MOD 10 3`. Error on zero divisor. |

### 3.2 Comparison and logic

Comparisons `>` `<` `=` `>=` `<=` `!=` (also written `<>`) return 1 or 0. They allow for floating-point drift: two numbers that agree to about 12 significant digits — what `PRINT` shows — are equal (near zero: closer than 10⁻¹²). So `0.1 + 0.2 = 0.3` is true, and `0.1 + 0.2 > 0.3` is false. `AND`, `OR` (infix) and `NOT` (prefix) treat 0 as false and anything else as true, and return 1 or 0. `AND` / `OR` **short-circuit**: when the left side already decides the result (0 for `AND`, non-zero for `OR`), the right side is not worked out — no procedure on it runs and no variable is read — so `:X != 0 AND 10 / :X > 1` is safe when `:X` is 0. The skipped side is still checked for syntax (`0 AND RT` is an error).

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
| `ABS n` `INT n` `ROUND n` `FLOOR n` `CEILING n` | Absolute value, truncate toward zero, round (halves away from zero: `ROUND -2.5` = −3), round down, round up. |
| `RANDOM n` / `RND n` | Random whole number 0 … ⌊n⌋−1. n must be ≥ 1. |

`PI` is the constant 3.14159…: `2 * PI * :R`. Like every single-input function's operand it is one value, so `ROUND PI * 1000` is `(ROUND PI) * 1000` = 3000; write `ROUND (PI * 1000)`.

Two-input prefix functions (each input is a full expression — so a comparison or `+` after the second input belongs to it: `DISTANCE 0 0 > 5` means `DISTANCE 0 (0 > 5)`; write `(DISTANCE 0 0) > 5`):

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

The origin (0, 0) is the centre of the canvas. X increases to the right, Y upward. One unit is one CSS pixel. (`SETPLOT` adds a separate graph range for `PLOT`, `AXES`, `PLOTX` / `PLOTY` — §2.8 — without changing these coordinates.) Headings: 0° = north, clockwise positive; `HEADING` is always in [0, 360).

Turtle positions and headings are kept on a 10⁻⁹ grid (far below a pixel), so a closed shape ends exactly where it started: after `REPEAT 4 [FD 100 RT 90]`, `XCOR` is 0, not 1.4e-14.

---

## 6. Variable Scoping Rules

Blue Logo uses **dynamic scoping**, like UCBLogo: a procedure can read the variables of whoever called it.

| Situation | Behaviour |
|---|---|
| `MAKE "x …` | Updates the nearest existing `:x` — a parameter or `LOCAL` of the current procedure, of a calling procedure, a `FOR` variable, or a global. If no `:x` exists, a **global** is created. |
| `LOCALMAKE "x …` / `LOCAL "x` | Creates `:x` in the current procedure (at top level: a global). It shadows outer variables of the same name until the procedure returns. |
| Procedure parameters | Private to each call. `MAKE` of a parameter changes only that call's copy. |
| `FOR :v …` | `:v` exists only inside the loop. Everything else behaves as outside the loop (a `MAKE` in the body updates outer variables). |
| `REPEAT` / `WHILE` / `IF` bodies | No new scope. |

```logo
MAKE "COUNT 0
TO TICK
  LOCALMAKE "STEP 1          ; private
  MAKE "COUNT :COUNT + :STEP ; updates the global
END
TICK TICK
PRINT :COUNT                 ; 2
```

**Recursive procedures that need their own working variables must use `LOCALMAKE`** (or parameters) — with plain `MAKE`, all levels share one global.

Tail calls (§2.5) keep these rules: a procedure called as the last thing its caller does still sees the caller's `LOCALMAKE` variables. (Memory is reused only when the caller has nothing but parameters the callee shadows, so endless tail recursion that uses `LOCALMAKE` slowly uses more memory.)

---

## 7. Known Limitations

| Area | Behaviour |
|---|---|
| **Numbers only** | No lists or strings; quoted words exist only for `LABEL`, `PRINT` and colour names. |
| **`REPCOUNT` is innermost only** | Use `FOR` with a named variable if you need an outer loop's count. |
| **Procedures take whole expressions** | A user procedure's inputs, and those of two-input functions (`MAX`, `TOWARDS`, `DISTANCE`, …), are full expressions — unlike single-input functions such as `SQRT`. `(DISTANCE 0 0) > 5` needs the `( )`. See §2.5, §3.3. |
| **Approximate comparisons** | `=` / `<` / … treat numbers within ~12 significant digits as equal (§3.2); there is no exact-equality operator. |
| **No `PENCOLOR`** | There are no list values, so the pen colour cannot be read back as `[r g b]` (planned with lists). |
| **Fills are shapes, not flood fills** | `BEGINFILL` … `ENDFILL` fills the path the turtle walked; there is no `FILL` that floods the area around the turtle. |
| **Key codes, not characters** | `READKEY` gives a number (there are no words to compare with), and only letters, digits and a few special keys have one (§2.7). |
| **Not implemented** | Flood `FILL`, file commands (use the SAVE / LOAD buttons). |

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
| Too few inputs for a procedure | `SQ needs 1 input (:S)` / `R needs 2 inputs (:A :B), got only 1` |
| Too many inputs in `( )` | `BOX takes at most 2 inputs (:W [:H])` |
| Optional inputs in `TO` | `TO F: input :B comes after an optional input — required inputs go first` / `TO F: optional input :A needs a default value, e.g. [:A 0]` / `F: the default of :A must be one value, found …` |
| `(` starting a statement | `Unexpected ( — a statement can start with ( only for (PRINT …), (LABEL …) or a procedure call with optional inputs` / `Missing ) — (PRINT … was opened but never closed` |
| `ENDFILL` | `ENDFILL without BEGINFILL` |
| Graphs | `PLOT: no graph range yet — start with SETPLOT xmin xmax ymin ymax` / `SETPLOT: xmin (1) must be less than xmax (-1)` / `SETPLOT: unknown option "ROUND — the only option is "EQUAL` / `AXES: a step must be a number > 0, got 0` / `AXES: a step of 0.001 puts the ticks too close together for this range — use a bigger step` |
| Word used as a number | `"red is a word, not a number — for a variable write :red` |
| Unknown colour | `SETCOLOR: unknown colour name RDE (colours: RED ORANGE …)` (also `SETBG: …`) |
| `IFELSE` value block | `IFELSE used as a value: a [ ] block must hold one value, found …` / `… a [ ] block is empty …` |
| Undefined variable | `Unknown variable: :X` |
| `LOCAL` variable read before set | `Variable :X has no value yet (declared with LOCAL)` |
| `:XCOR` etc. with colon | `XCOR: use without colon (e.g. FD XCOR). …` |
| Division / `MOD` by zero | `Division by zero` / `MOD: divisor must not be zero` |
| Math domain | e.g. `SQRT: argument -5 must be >= 0` |
| Overflow | `Number too large (overflow)` |
| Missing `)` / `]` | `Missing ) — a ( was opened but never closed` / `Missing ] — …` |
| Missing `[` | `Expected [ but got: …` |
| Missing `END` / stray `END` | `Procedure F (line 3): missing END` / `END without a matching TO (line 9)` (after `LABEL`: `… — to draw the word END write LABEL "END`) |
| `TO` in a block, repeated parameter | `TO inside [ ] (line 2): …` / `TO F: input :A is listed twice` |
| Redefining a built-in | `TO: FD is a built-in word and cannot be redefined` |
| `OUTPUT` from a command call | `You don't say what to do with 5 — F OUTPUTs a value but was used as a command` |
| No `OUTPUT` from a value call | `F did not OUTPUT a value, but was used where a value is needed` |
| `OUTPUT` outside a procedure | `OUTPUT used outside a procedure` |
| `BREAK` / `CONTINUE` outside a loop | `BREAK used outside a loop` |
| `REPCOUNT` outside `REPEAT` | `REPCOUNT used outside a REPEAT loop` (`REPCOUNTMAX` in `FOREVER`: `REPCOUNTMAX: FOREVER has no count`) |
| Deep recursion | `Stack overflow: … (> 10000 frames)` / `Expression nested too deeply (> 500 levels) …` |
| `FOR` step 0, `WAIT` < 0, non-finite `CIRCLE` / `ARC` | Specific error |

Warnings (execution continues): `REPEAT` with negative count (skipped), `SETCOLOR` / `SETBG` / `SETWIDTH` / `SPEED` clamped, `WAIT` > 30 s capped, `CIRCLE` / `ARC` radius capped, trail limit (50 000 segments), label limit (500) or fill limit (1 000) reached, `ENDFILL` with fewer than 3 corners.

---

## 9. Examples

37 built-in examples are available from the EXAMPLES panel.

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
| Global Counter & LOCALMAKE | `MAKE` from a procedure, `LOCALMAKE` shadowing a global, `LABEL "Word` |
| Tail Recursion — Endless Spiral | Unbounded tail recursion, canvas edge |
| Clock Face | `MOD`, `LABEL` with numbers, `IFELSE`, `WAIT`, the turtle as a pointer |
| Chase — TOWARDS and DISTANCE | `TOWARDS`, `DISTANCE`, `HEADING`, `WHILE`, `MOD` for angles, `( )` around two-input functions |
| BREAK, CONTINUE and a Test | A procedure that OUTPUTs 1 / 0, `NOT`, `CONTINUE`, `BREAK` |
| Tree — Recursion | Branching (non-tail) recursion with parameters only |
| Arc Flowers | `ARC`, `SETBG`, `SETXY`, `IFELSE` as a value, `FOREVER` with `BREAK` |
| Filled Shapes | `BEGINFILL` / `ENDFILL` (fill colour from `BEGINFILL`, black outline), an optional procedure input, `(LABEL …)` |
