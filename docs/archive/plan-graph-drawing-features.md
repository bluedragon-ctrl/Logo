# Graph Drawing Features — Implementation Plan

Target: Claude Logo v6.5 → v6.6 → v6.7 → v6.8

---

## Context / Gaps Being Addressed

Current state for graph programs:
- **No canvas size query.** Programs cannot know their drawable bounds. They hardcode numbers and break at other window sizes.
- **No point/dot primitive.** To plot a data point, users must call `CIRCLE 3` — which draws a polygon outline (not filled), animated (slow), and moves the turtle.
- **No background control.** The sand texture is charming for turtle art but is visual noise for graphs.
- **No state save/restore.** Drawing axes inside a graph procedure requires manually saving and restoring pen color, width, position, heading.
- **No coordinate transform.** Data values must be manually scaled to Logo world units. A plot of sin(x) for x ∈ [0, 2π] is unwritable without a lot of MAKE arithmetic.
- **No filled shapes.** Bar charts need filled rectangles; the trail system only stores segments.

---

## Wave 1 — v6.6: Core Primitives (Low Risk)

### 1.1 `SCRWIDTH` / `SCRHEIGHT` — canvas dimension tokens

**What they do:**
Read-only bare tokens (no colon, no parens) that return the current canvas dimensions in Logo world units. Because 1 Logo unit = 1 screen pixel and (0,0) is the canvas center:

```
SCRWIDTH   →  canvas.width   (e.g. 900)
SCRHEIGHT  →  canvas.height  (e.g. 640)
```

Typical usage:
```logo
MAKE :xmax SCRWIDTH / 2 - 20     ; right margin 20 units from edge
MAKE :xmin 0 - :xmax             ; left margin
MAKE :ymax SCRHEIGHT / 2 - 20
MAKE :ymin 0 - :ymax
```

**Where to add:** `resolveToken()` (~line 1200). Add two cases in the bare-token dispatch alongside `XCOR`, `YCOR`, `HEADING`:
```js
if (text === 'SCRWIDTH')  return canvas.width;
if (text === 'SCRHEIGHT') return canvas.height;
```

**Risk:** Zero. Two read-only token additions. No interpreter state touched.

---

### 1.2 `DOT [x y]` — filled point primitive

**What it does:**
Draws a filled circle dot. Size = current `SETWIDTH` (diameter = pen width). Color = current `SETCOLOR`. Always draws regardless of pen up/down state (DOT is a stamp, not a pen move).

Syntax:
```logo
DOT              ; dot at current turtle position
DOT 50 ~30       ; dot at (50, -30), no turtle movement
DOT XCOR YCOR    ; explicit current-position form
DOT :x :y        ; variables
```

**Argument detection (variable arity):**
CMD handlers receive the token array and current index `i`. To detect 0 vs 2 args without full speculative evaluation:
- If `t[i]` is undefined → use turtle pos (end of program / end of block)
- If `t[i].text` matches `/^[A-Z][A-Z0-9]*$/` AND `t[i].text` is in `CMD` → use turtle pos (next token is a command)
- If `t[i].text === ']'` → use turtle pos (end of block)
- Otherwise → parse 2 full expressions via `evalExpr` for x and y; do NOT move the turtle

**Trail storage — zero-length segment trick:**
Store as `trailPushIfRoom(px, py, px, py, penWidth, r, g, b)`.

In `rebuildTrailCanvas()`, detect zero-length segments and draw them as filled circles:
```js
if (x1 === x2 && y1 === y2) {
  // dot
  ctx.beginPath();
  ctx.arc(cx + x1, cy - y1, w / 2, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fill();
} else {
  // normal segment — existing path
}
```

**Immediate render:**
After storing in trail, draw immediately with the same arc+fill approach on `offscreen` (the trail canvas). Then call `render()`.

**Where to add:**
- `CMD['DOT']` in the dispatch table (~line 1463)
- `rebuildTrailCanvas()` detection in trail storage section (~line 921)

**Risk:** Low. Additive. The zero-length trail segment encoding is backward-compatible — no existing trail record has x1===x2 && y1===y2. `rebuildTrailCanvas` change is a 5-line conditional addition.

**Example to add to EXAMPLES:**
```logo
; Scatter plot — sine wave as dots
SPEED 4
SC BLACK SW 1
FOR :i 0 360 5 [
  MAKE :x :i - 180
  MAKE :y SIN :i * 80
  DOT :x :y
]
```

---

## Wave 2 — v6.7: Graph Infrastructure (Medium Complexity)

### 2.1 `SETBG color` — background color control

**What it does:**
Replaces the sand-grain background texture with a solid color (or returns to sand). Essential for professional-looking graphs (white background, graph paper gray, etc.).

Syntax:
```logo
SETBG WHITE        ; solid white background
SETBG 240 240 255  ; light blue-white
SETBG SAND         ; restore the default sand texture (special keyword)
```

**State:** Add `let bgMode = 'sand'` and `let bgRGB = [255,253,240]` at module level (near turtle state).

**Where to change:**
- `buildBgCache()` (~line 893): if `bgMode === 'solid'`, skip grain drawing and fill with `bgRGB`. If `bgMode === 'sand'`, existing logic runs unchanged.
- `CMD['SETBG']` in dispatch table: parse either a name token or 3 RGB values. Update `bgMode`/`bgRGB`, call `buildBgCache()`, call `rebuildTrailCanvas()`, call `render()`.
- `CLR` handler: reset `bgMode = 'sand'` and rebuild.

**Risk:** Medium. Touches `buildBgCache` and CLR. Must ensure `rebuildTrailCanvas` picks up the new bg.

---

### 2.2 `CS` — ClearScreen (visual only)

**What it does:**
Clears the canvas (trail, labels, dots) and resets turtle to home — but does NOT clear variables, procedures, or the console log. Distinct from `CLR` which resets everything.

This is a standard Logo command (`CS` = ClearScreen in UCBLogo).

```logo
TO DRAWGRAPH :dataset
  CS              ; clear previous graph, keep procedures and vars
  DRAWAXES
  PLOTDATA :dataset
END
```

**Where to add:**
- New `CMD['CS']` handler that resets `trail`, `labels`, turtle to home, redraws background — but skips `globalVars = {}`, `procs = {}`, and console clear.
- Extract the visual-reset portion of the existing `CLR` handler into a shared helper `clearVisual()` called by both `CS` and `CLR`.

**Risk:** Medium. The CLR refactor needs care to not regress existing clear behavior.

---

### 2.3 `PUSHSTATE` / `POPSTATE` — turtle state save/restore

**What it does:**
Saves and restores the full turtle state: position (x, y), heading, pen color (r, g, b), pen width, pen up/down. Stack-based — multiple PUSH/POPs can nest.

Critical for drawing axes or gridlines inside a procedure without corrupting the caller's drawing state:
```logo
TO DRAWAXES
  PUSHSTATE
  SW 1 SC GRAY
  PU SETPOS ~200 0 PD SETPOS 200 0     ; x axis
  PU SETPOS 0 ~200 PD SETPOS 0 200     ; y axis
  POPSTATE
END
```

**Where to add:**
- Module-level: `let turtleStack = []`
- `CMD['PUSHSTATE']`: push a snapshot of `{x, y, heading, r, g, b, penWidth, penDown}` onto stack
- `CMD['POPSTATE']`: pop and restore; warn + no-op if stack empty
- `CMD['PS'] = CMD['PUSHSTATE']`; `CMD['POS'] = CMD['POPSTATE']` (short aliases — check for conflicts first; `PS` may conflict with nothing, `POS` conflicts with nothing known)
- Stack is cleared by `CLR` and `CS`.

**Risk:** Medium-low. Self-contained stack, no interpreter change. Only CMD additions and two CLR/CS touches.

---

### 2.4 `RECT w h` — rectangle outline

**What it does:**
Draws an axis-aligned rectangle outline centered at the current turtle position. Does not move the turtle. Respects pen up/down: only draws if pen is down (consistent with FD/SETPOS behavior).

```logo
; Draw a graph frame
PU SETPOS 0 0 PD
SW 2 SC BLACK
RECT 300 200     ; 300 wide, 200 tall, centered at origin
```

**Implementation:**
RECT stores 4 trail segments (the 4 sides) using `trailPushIfRoom`. No animation. Turtle position unchanged. Uses current pen color and width.

```
corners: (x-w/2, y-h/2), (x+w/2, y-h/2), (x+w/2, y+h/2), (x-w/2, y+h/2)
segments: TL→TR, TR→BR, BR→BL, BL→TL
```

**Where to add:** `CMD['RECT']` in dispatch table. Two arg `evalExpr` calls for w, h. Then 4 `trailPushIfRoom` calls + `paintSegment` calls + `render()`.

**Risk:** Low. Pure additive CMD. No interpreter change.

---

## Wave 3 — v6.8: Advanced Graph System (Higher Complexity)

### 3.1 `SETWORLD xmin xmax ymin ymax` + `PLOT x y` — coordinate transforms

**The biggest feature.** Lets programs work in natural data coordinates, not Logo pixel units:

```logo
; Plot sin(x) for x in [0, 360], y in [-1, 1]
SETWORLD 0 360 ~1 1
FOR :x 0 360 2 [
  PLOT :x SIN :x
]
```

`SETWORLD` stores the data-to-canvas mapping. `PLOT x y` converts data coordinates to Logo world coordinates and calls `DOT` (or `SETPOS` if pen is down). No turtle movement.

**Mapping math (all in JS):**
```
logoX = (dataX - worldXmin) / (worldXmax - worldXmin) * canvasWidth  - canvasWidth/2
logoY = (dataY - worldYmin) / (worldYmax - worldYmin) * canvasHeight - canvasHeight/2
```

**State:** `let world = null` (null = no transform, pass-through). `CLR`/`CS` reset world to null.

**Where to add:**
- Module-level `world` state
- `CMD['SETWORLD']` — 4-arg, stores world bounds
- `CMD['PLOT']` — 2-arg, maps coordinates, calls DOT logic at mapped position
- `CMD['CLEARWORLD']` / `CMD['CW']` — resets world to null
- `CMD['WORLDX']` / `CMD['WORLDY']` — query functions that return the mapped coordinate (for manual use with SETPOS/DOT)

**Risk:** Medium. Isolated new state variable. No change to existing commands. PLOT is a new code path.

---

### 3.2 Multi-word `LABEL` — quoted string support

**What it does:**
Allow LABEL to accept a double-quoted string with spaces:

```logo
LABEL "X Axis"         ; prints: X Axis
LABEL "Count (n=100)"  ; prints: Count (n=100)
```

Currently LABEL accepts one token only (no spaces in output). This makes axis annotation painful.

**Where to change:** `CMD['LABEL']` handler and `tokenize()`. Currently the tokenizer would split `"X Axis"` as two tokens. Options:
- A: Tokenizer recognizes `"..."` quoted strings as single tokens → simpler, but requires tokenizer change.
- B: LABEL consumes tokens until it hits a non-word or a `"` closer → fragile.

**Recommended:** Option A — tokenizer change. The tokenizer already handles string-like tokens for LABEL single words. Add a regex for double-quoted strings: `/"[^"]*"/` → one STRING token. LABEL and future string-aware commands use it.

**Risk:** Medium — tokenizer change affects all parsing. Must run all 24 examples.

---

### 3.3 `FORMAT :n digits` — number formatting

**What it does:**
Returns a number rounded to a given number of decimal places, as a token suitable for LABEL:

```logo
LABEL FORMAT :x 2    ; prints e.g. "3.14"
```

**Where to add:** `BINARY2` map in `resolveToken` (like MOD, MAX, MIN). Takes 2 resolved tokens: number and decimal places.

**Risk:** Low once LABEL handles string tokens. Deferred until 3.2 lands.

---

### 3.4 `ARC r degrees` — partial circle

**What it does:**
Draws an arc with radius r, sweeping `degrees` degrees from the turtle's current heading. Useful for pie chart slices and rounded corners.

```logo
; 90-degree arc for pie chart quadrant
ARC 100 90
```

**Where to add:** New `CMD['ARC']` handler. Draws via polygon approximation (like `circle()`) but sweeps only `degrees` of the full circle. Similar to CIRCLE but stops at the given angle.

**Risk:** Medium. New animation function similar to `circle()`.

---

## Summary Table

| Version | Command | Args | Purpose |
|---|---|---|---|
| v6.6 | `SCRWIDTH` | — | Canvas width in Logo units |
| v6.6 | `SCRHEIGHT` | — | Canvas height in Logo units |
| v6.6 | `DOT [x y]` | 0 or 2 | Filled dot at position or turtle |
| v6.7 | `SETBG color` | 1 or 3 | Background color |
| v6.7 | `CS` | 0 | ClearScreen (visual only) |
| v6.7 | `PUSHSTATE` / `POPSTATE` | 0 | Turtle state stack |
| v6.7 | `RECT w h` | 2 | Rectangle outline |
| v6.8 | `SETWORLD xmin xmax ymin ymax` | 4 | Coordinate transform |
| v6.8 | `PLOT x y` | 2 | Plot in world coordinates |
| v6.8 | `LABEL "quoted string"` | 1 | Multi-word labels |
| v6.8 | `FORMAT n digits` | 2 | Number formatting for labels |
| v6.8 | `ARC r degrees` | 2 | Partial circle |

---

## Files to edit per wave

**Wave 1 (v6.6):**
- `claude-logo-v6.5.html` → copy to `claude-logo-v6.6.html`, then:
  - `resolveToken()`: add SCRWIDTH, SCRHEIGHT cases
  - `CMD['DOT']`: new handler with lookahead + zero-length trail encoding
  - `rebuildTrailCanvas()`: add zero-length-segment → arc+fill branch
  - `#ref-body` HTML table: add DOT, SCRWIDTH, SCRHEIGHT rows
  - `EXAMPLES`: add 1 scatter plot example
- `CHANGELOG.md`: new `## v6.6` block
- `claude-logo-lang-spec.md`: add DOT, SCRWIDTH, SCRHEIGHT to command reference
- `claude-logo-impl-spec.md`: update section map and trail storage notes

**Wave 2 (v6.7):**
- `claude-logo-v6.6.html` → copy to `claude-logo-v6.7.html`
- `CHANGELOG.md`, specs: same updates as above

**Wave 3 (v6.8):**
- `claude-logo-v6.7.html` → copy to `claude-logo-v6.8.html`
- Tokenizer change for quoted strings needs full test pass of all 24 examples
- After v6.8, candidate for v7.0 MAJOR review

---

## Open questions / decisions needed

1. **DOT size semantics:** Diameter = `penWidth`? Or should DOT have its own size arg (e.g. `DOT 5` = dot of diameter 5 at turtle pos, `DOT 5 x y` = at position)? The proposed spec uses penWidth for visual consistency with lines. Alternative: `DOT r` always takes 1 arg (radius), `DOTAT r x y` for positioned form.

2. **SETBG SAND keyword:** Should CLR always restore to sand, or should background color persist across CLR? Proposed: CLR resets to sand (full reset). CS preserves background.

3. **PUSHSTATE/POPSTATE aliases:** `PS`/`POS` are proposed short aliases. Check if `PS` conflicts with any planned command. `POS` is potentially confusable with position-related concepts.

4. **SETWORLD with PLOT — should PLOT use DOT or draw a line?** Two modes:
   - `PLOT` always draws a dot (scatter mode)
   - `PLOT` draws to the position with pen (line mode, like SETPOS in world coordinates)
   - Proposed: both — `PLOT x y` draws a segment from last PLOT position to (x, y) if pen is down, draws a dot if pen is up. Matches how SETPOS behaves.
