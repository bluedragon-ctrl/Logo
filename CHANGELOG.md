# Blue Logo — Release Notes

Severity markers: `+` new feature · `~` change/fix · `-` removed · `*` bug fix

---

## v8.16.0  2026-11-12
**GRID AND SAVE PICTURE; THREE-PART VERSION NUMBERS**
- + ADDITION: GRID xstep ystep draws graph paper for the SETPLOT range: a line across the range at every multiple of the step, in the pen colour and width, no numbers. The graphs example now draws a light grid under the axes.
- ~ CHANGE: Save picture moved from the Options panel to the toolbar, next to Open / Save. The PNG leaves the turtle out, is named after the program (like Save), and uses the save dialog where the browser has one.
- ~ CHANGE: versions now have three parts, MAJOR.MINOR.PATCH, continuing from the old numbers (v8.15 = 8.15.0): MAJOR for breaking language changes, MINOR for new commands and features, PATCH for fixes only. The app shows the full number. Releases are tagged on main from v8.15.0 on.

## v8.15  2026-11-12
**GRAPHS: SETPLOT, PLOT, AXES**
- + ADDITION: SETPLOT xmin xmax ymin ymax chooses a graph range shown on the canvas (inside a 40-step margin for the axis numbers, at any window size); (SETPLOT … "EQUAL) gives x and y the same scale. The turtle's own coordinates do not change: only the new words use the range. CS keeps it; RUN and CLR remove it; RESETPLOT forgets it.
- + ADDITION: PLOT x y goes to a graph point like SETPOS. A point outside the range breaks the line (drawn up to the edge, restarted where the curve comes back), so y = 1 / x draws no line along its asymptote.
- + ADDITION: AXES xstep ystep draws both axes with a tick at every step and numbers (thinned when they would crowd), in the pen colour. PLOTX / PLOTY give the turtle's position in the graph range.
- + ADDITION: example "Graphs — Parabola and Hyperbola"; a Graphs section in the Commands panel.
- * BUG: FOR with a fractional step added the step each round, so the values drifted: FOR :X -1 1 0.01 gave 7.5e-16 instead of 0 (and 1.0000000000000013 at the end). FOR now counts start + k × step, rounded to 15 digits.

---

## v8.14  2026-11-11
**SMALL POLISH FROM THE v8.13 CODE REVIEW**
- * BUG: the Errors checkbox in Options did nothing, because errors are always shown. It is removed (review 1.1).
- * BUG: error messages printed raw floating-point numbers (WAIT: duration must be >= 0, got -0.20000000000000004). The ARCSIN, ARCCOS, SQRT, LN, LOG, EXP, RANDOM, POWER and WAIT errors now show numbers the way PRINT does (review 1.3).
- ~ CHANGE: SETWIDTH and SPEED write one console line when they clamp, not two (review 4.2).
- ~ CHANGE: log() uses the same filter rule as logs() instead of a second copy. The RUN button reads its idle label from index.html. RUN and CLR empty the console through io.clearText() (review 2.2, 2.4, 4.3).
- - REMOVAL: guards that could never fail: the finite-number checks in CIRCLE and ARC (evalExpr already rejects non-finite values), the speed-table fallbacks in move() and rotate(), and the defaults in run() (review 4.1).
- ~ CHANGE: comments name .ts files instead of the pre-TypeScript .js names, and the session header lists fills and the full procedure shape (review 3.3, 3.4).

---

## v8.13  2026-11-11
**CLEARER TOOLBAR; COMMANDS AND EXAMPLES MOVE UP**
- ~ CHANGE: the buttons above the editor were a mix of hard-to-read symbols (≡ for beautify, ⎘ for copy — the latter missing from some fonts) and words (Log, Save, Load), with names only in tooltips. They are now drawn SVG icons in small groups — Tidy, Copy | Open, Save — each with an accessible name and a tooltip; Copy and Tidy flash a tick when done.
- ~ CHANGE: Commands and Examples moved from their own row under Run into the toolbar above the editor (icon + word), next to the code they help with; the editor gains a row of height.
- ~ CHANGE: the Log button is replaced by the Console header itself, a collapse toggle with a chevron. The header stays when the console is hidden, so it is clear where to reopen it.
- ~ CHANGE: Options (⚙) moved to the right of the title, as a sliders icon.
- ~ CHANGE: on a narrow panel the line indicator (L:n) hides first (the gutter already highlights the line), then the Commands / Examples icons, so the toolbar always fits.
- + ADDITION: browser test — every toolbar button has a name, the toolbar fits the narrowest panel, the Console header collapses and reopens.

## v8.12  2026-11-11
**SPEED SLIDER WORKS DURING A RUN**
- * BUG: moving the speed slider while a program ran had no effect (the run used the speed it started with) and the slider jumped back when the run ended. Now the slider changes the running program's speed at once — also in the middle of a long FD or turn (switching to instant finishes it at once) — and stays where the user put it. `SPEED n` in a program still does not stick.

## v8.11  2026-11-11
**LANGUAGE ADDITIONS, STEP 2 (FILLS, EDGE MODES, KEYBOARD AND MOUSE, (PRINT …), OPTIONAL INPUTS)**
- + ADDITION: `BEGINFILL` … `ENDFILL` — fills the path the turtle walks in between (pen up or down; every move, SETPOS / SETXY / SETX / SETY and HOME adds a corner) with the pen colour BEGINFILL saw. The fill lies under the outline and everything drawn after BEGINFILL, over what came before; non-zero rule, so crossing stars fill completely. New drawing-store list `fills` (`{at, pts, r, g, b}`, max 1 000 × 10 000 corners), painted by `paintDrawing`, the example pictures and the snapshot pictures (`+`); new `io.paintFill`. Live painting and a repaint after resize are identical.
- + ADDITION: edge modes `WRAP` (leave on one side, come back on the other), `WINDOW` (walk off the canvas) and `FENCE` (the old behaviour, still the default). For FD / BK / CIRCLE / ARC and SETPOS / SETXY / SETX / SETY / HOME, via `edgePath` in `turtle/motion.ts`. CS keeps the mode; RUN with "clear screen on run" and CLR go back to FENCE. `clearScreen`'s option is now `{ keepSettings }` (background + edge mode). New session fields `edge` and `fillPath`.
- + ADDITION: keyboard, mouse and time: `KEYP`, `READKEY` (waits; key codes A–Z 65–90, digits 48–57, space 32, Enter 13, Escape 27, Backspace 8, arrows 37–40; STOP ends the wait), `MOUSEX` / `MOUSEY` (turtle coordinates), `BUTTONP`, `TIMER` (seconds since the run started), `RESETTIMER`. New io methods `keyWaiting`, `readKey`, `mouse` (browser: `ui/input.ts`, keys queued only while a program runs and not typed into a text field; clicking the canvas takes the focus from the editor. Headless: options `keys` / `mouse`).
- + ADDITION: several inputs in parentheses: `(PRINT "Score: :N)` → `Score: 7`, `(LABEL "x: XCOR)`; the inputs are joined with spaces and may span lines.
- + ADDITION: optional procedure inputs `TO BOX :W [:H 50]`: `BOX 10` uses the default, `(BOX 10 20)` passes it — as a command or a value. A default is one value, worked out per call, and may use the inputs before it. `Proc` gains `required` and `defaults`; `procInputs` / `bindDefaults` are shared by statement and value calls.
- ~ CHANGE: `HOME` draws a line back to the centre when the pen is down, as in UCBLogo (it used to jump). No example changes: they all lift the pen first.
- ~ CHANGE: the new built-in words (WRAP, WINDOW, FENCE, BEGINFILL, ENDFILL, KEYP, READKEY, MOUSEX, MOUSEY, BUTTONP, TIMER, RESETTIMER) can no longer be used as procedure names.
- - REMOVAL: `clipForRun` (replaced by `edgePath`).
- + ADDITION: example 37 "Filled Shapes" (fills with black outlines, an optional input, `(LABEL …)`). Commands panel: cards for the new words and a "Keyboard and mouse" group.
- + ADDITION: tests — 33 language cases; unit tests for fills, WRAP pieces, HOME, READKEY / KEYP / mouse; browser checks for real key presses, the mouse and fill painting; and for every example that beautifying it does not change its drawing (beautify keeps optional inputs `[:H 50]` on the TO line — moving them to the next line would have turned them into body code).

## v8.10  2026-11-11
**COMMANDS AND EXAMPLES PANELS: SEPARATE COMMANDS, SEARCH, LINKS**
- ~ CHANGE: Commands panel — every command is its own row that opens into a card: a longer explanation, other ways to write it, two or three examples (Try in direct mode, Insert into the program at the caret), See also links and "Used in": pictures of the examples that use it, plus "All n examples →". `REFERENCE` entries gained `more`, `forms`, `examples` (replacing `try`), `see`, `tags`; variants such as SETCOLOR r g b / name, DOT / DOT x y, FOR with a step are folded into one command.
- ~ CHANGE: Commands search ranks its hits (exact word or alias first, so `fd` finds FORWARD; then word prefixes, synonyms such as turn / colour / loop, descriptions) and shows them as one list, best first. Group chips (Motion, Pen and drawing, Loops, …, Colours) show one group. Keyboard: ↓ into the list, ↑ ↓, Enter opens a card.
- ~ CHANGE: Examples panel — search (title, idea, or a command the example uses), topic chips with counts (new `;; topic:` header line in every example file), a "uses FOR" filter reached from a command card, and a preview (larger picture, commands used as links to their cards, the code) with "Open in editor" — a click on a card no longer replaces the program at once.
- + ADDITION: F1 in the editor opens the card of the command at the caret.
- + ADDITION: `;; shows:` example header — the commands an example is about; it is listed first under those commands. Which commands an example uses is found with the tokenizer (`EXAMPLES[n].uses`), so "Used in" never goes out of date.
- ~ CHANGE: example pictures moved to `ui/thumbs.ts` (each example run once and cached, any size); `ui/help-nav.ts` links the two panels; `editor.insert` / `editor.onHelp`.
- + ADDITION: tests — every command has an example and every example runs, every word is documented once, See also links resolve, search ranking, example topics / `shows` / `uses`; browser checks for chips, cards, Insert, See also, Used in, F1, Examples search / topics / preview / filter.

## v8.9  2026-11-11
**LANGUAGE ADDITIONS, STEP 1 (SETXY, FOREVER, ARC, SETBG, IFELSE AS A VALUE, SHORT-CIRCUIT AND / OR)**
- + ADDITION: `SETXY x y` (= `SETPOS`), `SETX x`, `SETY y` — draw like SETPOS, OUCH at the edge.
- + ADDITION: `FOREVER [ … ]` — an endless REPEAT; leave with BREAK or STOP. REPCOUNT counts the rounds; REPCOUNTMAX is an error inside it.
- + ADDITION: `ARC angle radius` — walks part of a CIRCLE (negative angle turns left, negative radius mirrors). Half-step turns put the chords on the true arc and the turtle ends on the exact end point (`ARC 90 100` from HOME ends at 100 100, heading 90). Unlike UCBLogo's ARC the turtle walks, like Blue Logo's CIRCLE.
- + ADDITION: `SETBG` / `SETBACKGROUND` colour (name or r g b) — canvas background. CS keeps it (as in UCBLogo); RUN with "clear screen on run" and CLR go back to the Options canvas colour. New session field `background`; `clearScreen(session, io, { keepBackground })`. Example thumbnails show it.
- + ADDITION: `PI`; `PENSIZE` (pen width as a value); aliases `SETPC` / `SETPENCOLOR` (= SETCOLOR) and `SETPENSIZE` (= SETWIDTH), so UCBLogo worksheets run. `PENCOLOR` waits for list values.
- + ADDITION: `IFELSE cond [a] [b]` as a value: `OUTPUT IFELSE :N < 2 [1] [:N * FACT :N - 1]`. Only the chosen block is evaluated; each block must hold exactly one value.
- ~ CHANGE: `AND` / `OR` short-circuit — when the left side decides, the right side is parsed and checked but not evaluated (no procedure runs, no variable is read), so `:X != 0 AND 10 / :X > 1` is safe. New skip mode in the expression parser.
- ~ CHANGE: the new built-in words (ARC, PI, FOREVER, SETBG, …) can no longer be used as procedure names.
- + ADDITION: example 36 "Arc Flowers" (ARC, SETBG, SETXY, IFELSE as a value, FOREVER + BREAK). Commands panel lists the new words.
- ~ CHANGE: `TODO.md` lists the missing language features in three steps (this release is step 1; filled shapes, edge modes, input and multi-value PRINT next; words and lists for v9).

## v8.8  2026-11-11
**REVIEW FIXES: INTERPRETER, LANGUAGE AND EXAMPLES** (`docs/review-v8.7.md`)

Some results change: see the language changes below. Four example pictures moved by one cell where a line now sits exactly on 0 (Spinning Squares, House, Precedence, Global Counter).
- * BUG: Floating-point drift was visible: after `REPEAT 4 [FD 100 RT 90]`, `XCOR` was 1.4e-14 and `IF XCOR = 0` false; 3600 × `RT 0.1` gave a heading of 1.3e-11. Turtle positions and headings are now kept on a 10⁻⁹ grid, headings are normalised to [0, 360), and comparisons treat numbers that agree to ~12 significant digits as equal (`0.1 + 0.2 = 0.3` is true).
- * BUG: Animated pacing: every move or turn waited for at least one frame, so `REPEAT 360 [FD 1 RT 1]` took 12 s at speed 3 while `FD 360` took 0.1 s, `CIRCLE 100` 3.3 s and `RT 0` a frame each. Move, turn and tick now share one budget per animation frame (`spendFrame`); speed 0 is unchanged, and many small steps run as fast as one long one.
- * BUG: `LABEL` and `DOT` did not accept a procedure that OUTPUTs (`LABEL DOUBLE 3` drew the word DOUBLE, then failed).
- * BUG: Tail-call optimisation hid the caller's `LOCALMAKE` variables from a self-recursive call, so a procedure behaved differently depending on whether anything followed the recursive call. A finished caller's scope is now dropped only when all its variables are parameters of the callee; mutual tail recursion now also runs in constant memory.
- * BUG: An error after a procedure used as a value had returned (`PRINT 10 / Z`) named a line inside that procedure; it now names the caller's line.
- ~ CHANGE: `MOD` has the sign of the divisor (`-7 MOD 3` = 2, like UCBLogo `MODULO`); `ROUND` rounds halves away from zero (`ROUND -2.5` = -3).
- ~ CHANGE: A `"word` where a number is expected is an error (`"red is a word, not a number — for a variable write :red`) instead of silently reading the variable.
- ~ CHANGE: Clearer errors: too few inputs for a procedure ("SQ needs 1 input (:S)"), unknown bare colour names in `SETCOLOR`, a parameter listed twice, `TO` inside `[ ]`, a hint for `LABEL END`.
- ~ CHANGE: `SPEED` in a program no longer leaves the slider changed after the run; typed in direct mode it still sets the slider.
- + ADDITION: `<>` as another spelling of `!=`; numbers with a negative exponent (`1E-5`).
- + ADDITION: Four examples: Clock Face (`MOD`, `LABEL`, `WAIT`), Chase (`TOWARDS`, `DISTANCE`, `WHILE`), BREAK / CONTINUE with a test procedure, Tree (branching recursion).
- ~ CHANGE: Examples use the standard `MAKE "X` / `LOCALMAKE "X` form and glued negative numbers (`-150`); duplicated title comments removed; Square and Flower in lowercase; Random Splatter uses `RND 256`; Sine Wave, OUTPUT and Global Counter tidied (Global Counter now shows `LOCALMAKE` shadowing a global). The language spec teaches `MAKE "x` as the main form.
- ~ CHANGE: Performance: `io.logs(cls)` tells the interpreter whether a console class is shown, so the hot paths (MAKE, calls, motion, …) skip building messages that the console filters would drop.
- ~ CHANGE: Code: shared word-class helpers in `expr.ts` (`isReporterWord`, `isCommandWord`, `isBuiltinWord`); the interpreter header comment moved to `runtime.ts`; `MOD` has one implementation.

---

## v8.7  2026-11-11
**VISUAL PASS, PART 2A: COMMANDS AND EXAMPLES PANELS; EXAMPLES IN THE TESTS**

The language is unchanged. Several examples were resized or tidied (below), so their pictures differ from v8.6.
- ~ CHANGE: Commands panel: one table for all sections, so the columns line up; a search box (focused on open) filters by command or description; sections regrouped (Motion, Pen and drawing, Loops, Decisions, Procedures, Variables, Console and time, Maths) and every description reworded in the same plain style. Each row has a Try button that opens direct mode with an example line ready to run with Enter. Colours are clickable swatches built from the interpreter's own colour table (GRAY / GREY shown together).
- ~ CHANGE: Examples panel: a compact grid of cards with a picture of what each example draws, its title and description, instead of the full code of every example. The pictures are drawn by running the examples headlessly the first time the panel opens; the page's program, variables and drawing are not touched.
- ~ CHANGE: Examples reviewed on the new beige canvas. Small drawings made bigger (Square, Triangle, Circle, Star, Spinning Squares, Sunburst, Coloured Star, House, Flower, Bouncing Counter, Diamond, Compass Rose, STOP in Procedure, OUTPUT, SPEED, Precedence, Global Counter); FOR Starburst no longer reaches the edge of a small canvas; the Dragon Curve is centred and smaller (it hit the edge below 500 px height); REPCOUNT is now a growing triangle spiral with a blue-to-red fade; the Colour Wheel has thicker, longer spokes; OUTPUT now uses its SQR procedure; descriptions spell colour / centre consistently.
- + ADDITION: `src/reference.ts`: the Commands panel content as data; `ui/reference-panel.ts` renders it. A unit test fails if a built-in word is missing from it or if it lists a word that does not exist, and every Try line must run without an error.
- + ADDITION: Tests: every example must fit a 640 × 480 canvas (no OUCH, except the endless spiral), and the drawing of every example without RND / RANDOM is a Vitest snapshot: a 64 × 24 character picture of the canvas, segment / dot / label counts, bounds and a hash of every segment. Any change to what an example draws now shows up as a readable diff (`npx vitest run -u` to accept an intended change).
- + ADDITION: Browser checks: the Commands panel (one table, search, no-match message, Try fills direct mode) and the Examples panel (a non-blank picture for every example, a click loads the code).
- ~ CHANGE: `render/paint.ts`: `paintDrawing` paints a drawing onto any 2D context; the trail layer and the example pictures share it (the canvas is painted exactly as before). `escHtml` also escapes `"`.
- - REMOVAL: The static reference tables and the code previews in `index.html`.

---

## v8.6  2026-11-11
**VISUAL PASS, PART 1: READABLE FONTS, CALM COLOURS, FLAT CANVAS AND TURTLE**

Logo programs behave exactly as before; only the look changes.
- ~ CHANGE: The interface uses the system UI font and code / console / examples use the system monospace font instead of the VT323 pixel font everywhere. Base sizes raised (14 px interface, 15 px code). VT323 remains for the title and for LABEL text on the canvas. Nothing new is downloaded.
- ~ CHANGE: Font size option (Small / Medium / Large = 1 / 1.25 / 1.5) scales the reading text (editor, console, direct input, overlays) and no longer widens the side panel; the panel width follows the window (`clamp(360px, 32vw, 520px)`).
- ~ CHANGE: Contrast: every text colour is at least 4.5:1 on its background (line numbers were 2.4:1, comments 2.6:1, the editor placeholder 1.9:1); toolbar buttons are no longer drawn at 60 % opacity.
- ~ CHANGE: Calm dark palette defined as CSS variables. Buttons are neutral; only Run (green) and Stop (red) are coloured; a single accent blue marks focus and active toggles. Overlays restyled to match.
- + ADDITION: Syntax highlighting: commands, control words, TO / END, functions, :variables, numbers, "words and comments each have their own colour.
- ~ CHANGE: Sentence case in the interface ("Run", "Clear screen on run", "Motion"); capitals stay for Logo commands. The CLR button is labelled "Clear".
- ~ CHANGE: Canvas: plain beige (`#f4eedf`) is the default instead of the parchment gradient with random sand grains; White remains. The background is a flat fill (no cache, no grains).
- ~ CHANGE: Turtle: a blue flat vector drawing (shell, plate, head, legs, tail; legs swing while moving) replaces the 64 px gradient sprite. It is drawn in logical units each frame (sharp at any zoom / DPR), is about 40 px long instead of 64, and is centred on the pen position with a dot marking it (red = pen down, white = pen up). The triangle turtle uses the same colours and dot. Options: Turtle / Triangle.
- + ADDITION: The blue turtle is the app's logo: `src/assets/logo.svg` is the favicon and replaces the 🐢 emoji in the header.
- - REMOVAL: `buildGrains`, `buildBgCache`, `buildSprite`, `spr`, `SPRITE_SIZE`, `SPRITE_OFFSET`, `spriteCenter`.
- + ADDITION: Browser check: the canvas is plain beige by default and the page font is not VT323.

---

## v8.5  2026-11-11
**POSITIONED TOKENS + CODEMIRROR EDITOR**

Logo programs behave as before (every deterministic example draws the same picture), except that error messages name the right line in one more case.
- ~ CHANGE: Every token carries its source position `{ text, line, col, lineText }` instead of the `__L<n>:` line-sentinel tokens in the token stream. The places where a line break matters (an operator on a new line ends an expression outside `( )`, a `TO` header ends with its line, `DOT` takes inputs only from its own line) now compare token lines (`newLine`); `skipSen` / `noteLine` are gone. Ready for exact error locations and a running-line highlight.
- * BUG: An error after a procedure call on the same line named the last line of the procedure (`P RT :NOPE` reported P's line). The error line now comes from the token being executed or evaluated.
- ~ CHANGE: The code editor is CodeMirror 6 instead of the hand-written contenteditable editor: line numbers, `[ ]` bracket matching, proper undo/redo, IME and mobile input, no full re-render on every keystroke. Tab still inserts two spaces; Shift+Tab un-indents; Ctrl/Cmd+/ toggles `;` comments. Colours unchanged (comments grey, code green on black); the Logo highlighter already tags commands, variables, numbers, words and brackets for a later colour pass.
- ~ CHANGE: `editor.getValue()` returns the text exactly (the old editor dropped trailing empty lines).
- + ADDITION: CodeMirror is bundled (MIT, `third-party/CodeMirror-MIT.txt`); the page still makes no third-party requests.
- + ADDITION: Tests: token positions, the line-break rules, error lines inside and after procedure calls, and a browser check of the editor (typing, Tab, undo, line numbers, bracket match).

---

## v8.4  2026-11-11
**TYPESCRIPT — the whole app and the unit tests in strict TypeScript**

No change in behaviour: every deterministic example draws a pixel-identical picture compared with v8.1.
- ~ CHANGE: All of `src/` is TypeScript in strict mode (`.js` → `.ts`; imports use the `.ts` file names). Vite strips the types when building; `tsc` only type-checks. The unit tests are TypeScript too.
- + ADDITION: `interpreter/types.ts` — the shared types (`Session`, `Turtle`, `Drawing`, `LogoIO`, `RunContext`, `Scope`, `Proc`, `CommandHandler`, …). The runStack frames are a typed union, so each loop kind's fields are checked.
- + ADDITION: `tsconfig.core.json` type-checks the interpreter, turtle and formatter without the DOM library: using a browser API there is now a type error (replaces the ESLint globals rule). The ESLint import boundary stays.
- + ADDITION: `npm run typecheck`; `npm run lint` runs it before ESLint (now with typescript-eslint).
- + ADDITION: `byId<T>(id)` / `context2d(canvas)` in `util.ts`: a missing element in `index.html` fails at start-up with a clear message.
- ~ CHANGE: Small fixes found by the type checker, without visible effect: the editor's paste handler no longer reads the non-standard `window.clipboardData`; file-picker errors are checked with `instanceof DOMException`; the sprite's eye openness is a number, not a flag.
- - REMOVAL: The unused `stopFired` frame field.

---

## v8.3  2026-11-10
**BLUE LOGO — new name; interpreter runs without a browser; unit tests**

No change in how Logo programs behave: every deterministic example draws a pixel-identical picture compared with v8.1.
- ~ CHANGE: The project is now called **Blue Logo** (page title, header, welcome text, docs). The spec files are now `blue-logo-lang-spec.md` and `blue-logo-impl-spec.md`. The frozen `versions/claude-logo-v*.html` files keep their names so old links work.
- ~ CHANGE: Autosave uses the key `blue-logo:program`. A program saved under the old key `claude-logo:program` is moved over once on the first visit, so nobody loses their work.
- ~ CHANGE: Program state is one session object (`createSession()`: turtle, drawing, globals, procedures) instead of module-level variables. CS, RUN and CLR reset its fields.
- ~ CHANGE: The interpreter and turtle code no longer touch the page. All output goes through `rctx.io` (LogoIO: log, render, paint, canvas size, animation frames); the page's implementation is in `src/app.js`. Trail segments and labels are stored by the core (`turtle/drawing.js`) and painted by the renderer.
- ~ CHANGE: The RUN logic (run, report "✓ Done!" or the error with its line) moved to `interpreter/execute.js`, shared by RUN, direct mode and the tests.
- + ADDITION: Vitest unit tests (`tests/unit/`, ~1 s): the language cases, every example, interpreter state (segments, turtle pose, labels, canvas edge), tokenizer, procedure extraction, number formatting, clipping, beautify. `npm test` runs them before the browser test; `npm run test:watch` re-runs on save.
- + ADDITION: ESLint boundary rule: `interpreter/`, `turtle/` and `format/` cannot use browser globals or import the browser layers.
- + ADDITION: Browser tests: the autosave key migration, the page title.
- ~ CHANGE: The language cases moved to `tests/cases.js`, shared by the unit and browser tests.

---

## v8.2  2026-11-10
**MODULES — Vite build, source split into src/, examples as .logo files**

No change in behaviour: every deterministic example draws a pixel-identical picture compared with v8.1, and all tests pass unchanged.
- ~ CHANGE: The single HTML file is split into ES modules under `src/` (render/, turtle/, interpreter/, editor/, format/, ui/). The code was moved, not rewritten. Mutable state that another module changes is now written through small setters (`setCanvasSize`, `setActiveRctx`, `resetGlobals`, `resetTurtle`, `setMoving`, …), because ES modules cannot assign to imported variables.
- ~ CHANGE: Vite builds the site into `dist/`. `index.html` is now the app itself (markup only), no longer a redirect. The version shown in the title comes from `package.json`.
- ~ CHANGE: The examples live in `examples/*.logo`, one file per example, with `;; title:` / `;; desc:` metadata lines. They can be opened in the app like any program.
- ~ CHANGE: The VT323 font is a self-hosted woff2 file instead of a base64 data URI (still no third-party requests).
- ~ CHANGE: v8.1 and older stay available as frozen single-file versions in `versions/`, and at their old URLs.
- + ADDITION: ESLint (`npm run lint`), which catches missing imports and writes to imported variables. CI runs lint, build and tests; Pages deploys the tested build.
- + ADDITION: `npm run dev` / `npm run preview` for local development.
- - REMOVAL: An unused variable in the options panel code.

---

## v8.1  2026-11-10
**CLASSROOM BASICS — autosave, no third-party requests, CI**
- + ADDITION: Autosave. The editor text is stored in localStorage 0.5 s after each change (and immediately when the page is hidden or closed) and restored on start-up, so a refresh or a closed tab no longer loses work. The console shows "Restored your program from last time." Restoring does not create an undo step. If localStorage is unavailable, autosave silently does nothing.
- ~ CHANGE: The VT323 font is embedded in the HTML (latin subset, base64 woff2, ~24 KB) instead of loaded from Google Fonts. The app now makes no network requests at all: works offline, on filtered school networks, and without third-party data transfer. License: `third-party/VT323-OFL.txt`.
- + ADDITION: Editor API `editor.onChange(fn)` and `editor.initValue(src)`.
- + ADDITION: Tests: autosave survives a reload; the page makes no network requests. CI runs the tests on every pull request; GitHub Pages deploys only after they pass.

---

## v8.0  2026-11-10
**REVIEW RELEASE — operator precedence, UCBLogo scoping, 13 bug fixes, HiDPI, editor undo**

Breaking language changes (older programs may need edits):
- ~ CHANGE: Expressions use standard precedence and are left-associative: `* / MOD` before `+ -` before comparisons before `AND` before `OR`. `2 + 3 * 4` = 14, `10 - 2 - 3` = 5 (was 11), `- 3 + 4` = 1 (was -7), `IF :A + 1 > 5` now compares `(:A + 1)`. New precedence-climbing parser (`parseBinary` / `parseUnary` / `parsePrimary`).
- ~ CHANGE: `MAKE` inside a procedure updates the nearest existing variable (caller's or global) and creates a global if none exists (UCBLogo dynamic scoping). Previously it always created a procedure-local variable. Recursive procedures that use MAKE for working variables must switch to `LOCALMAKE` (the Dragon Curve example was updated).
- ~ CHANGE: `PRINT "word` prints the word (previously read a variable named word).
- ~ CHANGE: `TO` can no longer redefine built-in words (`TO FD` is an error).
- ~ CHANGE: A procedure that OUTPUTs, called as a command, is an error ("You don't say what to do with …"); `STOP` in a procedure used as a value is an error instead of silently ending the program.

Bug fixes:
- * BUG: FOR inside a REPEAT body or a procedure could not see outer/global variables (`Object.assign` copied only own properties). FOR now uses a prototype-chain scope holding only the loop variable.
- * BUG: STOP did not interrupt WAIT; RUN looked enabled but clicks were ignored for up to 30 s. WAIT now uses a cancellable sleep (`rctx.wake`, `haltRun()`).
- * BUG: A direct-mode command could start while a program ran, overwriting `activeRctx` so the program could no longer be stopped. Direct mode now refuses while running and keeps the typed text.
- * BUG: "Clear screen on run" left old LABEL text. RUN, CS and CLR now share `clearScreen()`.
- * BUG: Parse errors on RUN (e.g. missing END) were not shown. `parseProgram()` reports them with the line number.
- * BUG: Runaway recursion in procedures used as values (`TO BOOM OUTPUT BOOM END`) crashed with a raw JS stack overflow. `MAX_EXPR_DEPTH` (500) is now enforced by `deeper()`.
- * BUG: REPCOUNT leaked into procedures called from a REPEAT, and `MAKE "REPCOUNT` could fake it outside a loop. REPEAT metadata now lives under a Symbol and stops at procedure scopes.
- * BUG: SETPOS could move the turtle off the canvas silently. It now stops at the edge with OUCH, like FD. Instant-mode FD clipping was coordinate-wise (distorted diagonals); both now use exact segment clipping (`clipToCanvas`).
- * BUG: `RANDOM 0.5` always returned 0; RANDOM now requires n ≥ 1 (fractional n is floored).
- * BUG: CLR during a run could let the in-flight step draw on the cleared canvas. CLR now halts first and resets after the run has unwound (`rctx.onFinish`).
- * BUG: Errors in top-level code showed no line number (sentinels were dropped by `extractProcedures`). Kept now.
- * BUG: Inside procedures a `[ block ]` starting on the next line failed ("Expected [ but got __L…"), e.g. a two-line IFELSE. `extractBlock` and argument parsing now skip line sentinels.
- * BUG: A WHILE/arithmetic loop that never moved the turtle froze the page and could not be stopped. `runStack` now yields to the browser every ~40 ms.
- * BUG: Pressing STOP while a procedure-as-value was running reported "did not OUTPUT a value". Now ends quietly.

Additions and improvements:
- + ADDITION: Parentheses `( … )` in expressions, may span lines. Negative sign also for variables and groups: `SETPOS 0 -:Y`, `-(:A + 1)`.
- + ADDITION: `LOCAL :a :b …` and `LOCALMAKE :x value`.
- + ADDITION: Tail-call elimination: a procedure call as the last step replaces the caller's frame, so recursive loops are unbounded (self-recursion also reuses the scope chain level).
- + ADDITION: `PR` alias for PRINT; `LABEL :X` / `LABEL (expr)` draws a number; quoted words keep their case (`LABEL "Hello`); `SETCOLOR "red` accepted.
- + ADDITION: Editor undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y). Previously Ctrl+Z did nothing because highlighting re-renders the editor. Loading an example or file is undoable.
- + ADDITION: HiDPI canvas: sharp lines on retina screens / zoom; PNG export at device resolution. Geometry uses logical `CW`/`CH`.
- + ADDITION: Examples "Precedence & Parentheses", "Global Counter & LOCALMAKE", "Tail Recursion — Endless Spiral" (31 total). OUTPUT and DOT examples simplified thanks to parentheses/precedence.
- + ADDITION: `tests/run-examples.js` headless test (examples, beautify idempotency, 31 language cases, 4 UI checks).
- ~ CHANGE: Animated moves paint sub-steps but store one trail segment per move (was ~1.2 per pixel), so the 50 000-segment cap goes much further.
- ~ CHANGE: SETPOS, DOT and LABEL are paced like other drawing at animated speeds (visible progress instead of a frozen page).
- ~ CHANGE: SPEED accepts 0–4, matching the slider (was 1–4).
- ~ CHANGE: Friendlier errors: extra values (`FD 100 -10`), value-producing words used as commands, commands used as values, stray `)`/`]`/END, built-in redefinition, missing `)`. Numbers print without float noise (`0.1 + 0.2` → 0.3).
- ~ CHANGE: Labels are repainted once the VT323 web font has loaded.
- ~ CHANGE: Shared `runProgram()` for RUN and direct mode; `QUERY_TOKENS` table replaces the special-case chain in `resolveToken` and DOT's value heuristic; save/load fallbacks deduplicated.
- ~ CHANGE: Repo layout: previous versions moved to `versions/` (still deployed, old URLs keep working), superseded docs to `docs/archive/`. Specs and CLAUDE.md rewritten to match the code.

## v7.3  2026-03-24
**ITCH.IO FIX — save/load fall back to download when File System API is blocked**
- * BUG: On itch.io (and any cross-origin iframe host), `showSaveFilePicker` / `showOpenFilePicker` exist on `window` but throw a `SecurityError` when called. The `catch` block logged the error instead of falling back to the `<a download>` / `<input type="file">` path. Fix: on any non-AbortError, both `saveToFile` and `loadFromFile` now execute the download/file-input fallback rather than reporting a failure.

## v7.2  2026-03-17
**REFERENCE PANEL — ▸ LOOPS section split from ▸ CONTROL**
- ~ CHANGE: The ▸ CONTROL reference section split into ▸ LOOPS (REPEAT / REPCOUNT / REPCOUNTMAX / WHILE / FOR / BREAK / CONTINUE) and ▸ CONTROL (IF / IFELSE / STOP / OUTPUT / TO / WAIT / SPEED / comment). Loops were half the entries; grouping them makes the panel easier to scan.

## v7.1  2026-03-17
**CODE REVIEW FIXES — runStack hardening + CONTINUE + REPCOUNTMAX**
- * BUG: `depth` guard in `runExpr` was dead code — `evalExpr` always passed `depth=0` so the check `depth > MAX_EXPR_DEPTH` never fired. Deep mutual recursion (`TO BOOM OUTPUT BOOM END / FD BOOM`) would silently consume JS async frames until a crash. Fix: added `MAX_STACK_FRAMES = 10000` guard at the top of `runStack`'s while loop; any Logo recursion deeper than 10 000 frames throws a clean `Stack overflow` error.
- ~ CHANGE: STOP, OUTPUT, and BREAK in `runStack` replaced double-pass scan (find-then-unwind) with a single index scan + `stack.length = k` truncation. Each of the three handlers is now one scan + one assignment; no repeated `stack.pop()` calls.
- + ADDITION: `CONTINUE` command — skips to the next iteration of the innermost loop (REPEAT / FOR / WHILE). Mirrors BREAK's scan logic but keeps the loop frame (`stack.length = k + 1`). CONTINUE respects procedure boundaries: it cannot escape a proc.
- + ADDITION: `REPCOUNTMAX` — the total iteration count of the current REPEAT, available inside the body alongside `REPCOUNT`. Stored as `total` on the isRepeat frame at setup; injected into `bodyVars` each iteration. Exposed via `resolveToken` with the same out-of-loop guard as REPCOUNT.
- ~ CHANGE: Comment "User procedure call (statement context)" corrected to remove "statement context" — `runStack` handles proc calls from any context (top-level and expression-context via `runExpr`).
- ~ CHANGE: Stale comment "same fix as runExpr FOR" removed from FOR eps line — there is only one FOR implementation now.
- ~ CHANGE: CMD dispatch table comment updated to list CONTINUE and to say "runStack()" instead of "run() and runExpr()".
- - REMOVAL: `MAX_EXPR_DEPTH` constant is now unused (kept declared with a comment for reference). The `depth` parameter to `runExpr` is retained in the signature for caller compatibility but is not checked.

## v7.0  2026-03-17
**UNIFIED TRAMPOLINE — interpreter refactor**
- ~ CHANGE: All Logo control-flow (REPEAT, WHILE, FOR, IF, IFELSE, STOP, BREAK, OUTPUT, user proc calls) now lives in a single `runStack(stack, rctx)` function. Both `run()` (top-level statements) and `runExpr()` (expression-context proc calls) are thin wrappers over `runStack`. The previous design duplicated every loop construct in two places; adding a new loop construct now requires touching only `runStack`.
- - REMOVAL: `runExpr()` recursive self-calls for loop bodies, IF/IFELSE bodies, and nested proc calls — all handled by the trampoline. `runExpr()` is now ~10 lines.
- - REMOVAL: `BREAK_SIGNAL` sentinel object and all associated throw/catch plumbing. BREAK is handled entirely via stack unwinding inside `runStack`; BREAK at a proc boundary throws a plain `Error` directly.
- ~ CHANGE: `STOP` inside an expression-context proc (called as a value from `evalExpr`) now sets `boundary.stopFired` on the proc frame instead of throwing `STOP_SIGNAL` through the JS call stack. `runExpr()` reads this flag and re-throws `STOP_SIGNAL` after `runStack` returns — same observable behaviour, cleaner mechanism.
- ~ CHANGE: The interpreter architecture comment block updated from "v2.6 TRAMPOLINE" to "v3.0 UNIFIED TRAMPOLINE" with revised frame-shape and flow-control documentation.

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
