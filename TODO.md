# Blue Logo — TODO

The v7.3 review (`REVIEW.md`) was fully addressed in v8.0. Remaining ideas, roughly by value:

## Pending

Roadmap for making this a classroom tool: `docs/architecture-proposal.md` (phases 0–5).

### Deployment
- [x] GitHub Pages enabled; CI runs tests on PRs (v8.0 → main)
- [x] Embedded VT323 font; autosave to localStorage (v8.1)
- [x] Phase 1: Vite build, split into `src/` modules, examples as `.logo` files (v8.2)
- [x] Phase 2: `LogoIO` injection + `Session`, Vitest unit tests, ESLint boundary rule; renamed to Blue Logo (v8.3)
- [x] Phase 3: TypeScript, strict, everywhere (v8.4)
- [x] Positioned tokens + CodeMirror 6 editor (v8.5)
- [ ] Next: remaining technical work (see below), then a visual / interface pass, then phase 4 teaching features

### Repo
- [ ] Tag releases on `main` (`v8.1`, `v8.2`, `v8.3`; optionally older ones from history)
- [ ] Optional: rename the GitHub repository to match the new name (the Pages URL follows the repo name; old URLs redirect only for the repo, not for Pages)

### Language
- [x] v8.7 review (`docs/review-v8.7.md`): all items fixed or documented in v8.8

Missing language features (review of Nov 2026), in the agreed order:

**Step 1 — v8.9: cheap, no breaking changes**
- [x] `SETXY x y`, `SETX x`, `SETY y`
- [x] `FOREVER [ … ]` (REPCOUNT works inside; leave with BREAK / STOP)
- [x] `ARC angle radius` (turtle-path arc like CIRCLE)
- [x] `PI`
- [x] Aliases `SETPC` / `SETPENCOLOR`, `SETPENSIZE`; `PENSIZE` query (`PENCOLOR` needs list values → step 3)
- [x] `SETBG colour` / `SETBACKGROUND`
- [x] `IFELSE` as a value: `OUTPUT IFELSE :N < 2 [1] [:N * FACT :N - 1]`
- [x] Short-circuit `AND` / `OR`

**Step 2 — v8.11: medium effort**
- [x] Filled shapes: `BEGINFILL` … `ENDFILL` (path recorded as a polygon, drawing-store `fills`, painted under the outline); a flood `FILL` is not planned
- [x] Edge modes `WRAP` / `WINDOW` / `FENCE` (FENCE + OUCH stays the default)
- [x] Interaction: `TIMER` / `RESETTIMER`, `KEYP` / `READKEY` (key codes), `MOUSEX` / `MOUSEY` / `BUTTONP` — io methods `keyWaiting`, `readKey`, `mouse`
- [x] Several values in one `PRINT` / `LABEL`: `(PRINT "Score: :N)`
- [x] Optional procedure inputs with default values: `TO BOX :W [:H 50]`, `(BOX 10 20)`
- [x] `HOME` drawing a line when the pen is down (UCBLogo behaviour)
- [ ] Maybe later: an interactive example (it cannot be in `examples/` while every example must finish on its own in the tests); a click queue (`CLICKP`) if polling `BUTTONP` proves too coarse

**Step 3 — v8.12: UCBLogo compatibility without lists (non-breaking)** — `docs/design-v9-lists.md` §13, phase 0
Guiding rules: UCBLogo programs should run (accept the UCBLogo form as well); keep the current Blue Logo approach where it is simpler and clearer.
- [ ] `FOR [i 1 10 2] [ … ]` (UCBLogo control list) next to `FOR :i 1 10 2 [ … ]`
- [ ] `~` line continuation
- [ ] Prefix `AND a b` / `OR a b` / `(AND a b c)`; `SUM` `DIFFERENCE` `PRODUCT` `QUOTIENT` `MINUS`; `REMAINDER`, `MODULO`, `LOG10`; `(RANDOM a b)`
- [ ] `SETPC n` / `SETBG n` with UCBLogo's 16 palette colours
- [ ] `PENERASE` / `PE`, `PENPAINT` / `PPT`; `CLEAN`; `SHOWNP`; `PENDOWNP`; `SETLABELHEIGHT`; `FILLED colour [ … ]`
- [ ] `UNTIL`, `DO.WHILE`, `DO.UNTIL`; `TEST` / `IFTRUE` / `IFFALSE`; `NAME value "x`
- [ ] Screen words (`SETSCRUNCH`, `TEXTSCREEN`, `SPLITSCREEN`, `FULLSCREEN`) and flood `FILL` as no-ops with an info line
- [x] Decided: `ARC` (walking), `WAIT` (seconds), function-input binding (one operand), quoted-word delimiters and `MAKE :x` stay as they are (design §12)

**Step 4 — v9.0: words and lists (MAJOR)** — `docs/design-v9-lists.md` phases A–C
- [x] Design written and decided (UCBLogo programs should run; extras kept)
- [ ] Values number | word | list; list literals with case kept; `FIRST` `BUTFIRST` `LAST` `BUTLAST` `ITEM` `COUNT` `EMPTYP` `LIST` `SENTENCE` `FPUT` `LPUT` `WORD` `MEMBERP` `PICK` `THING`, `SHOW` / `TYPE`, `RUN`, `FOREACH list template`; conditions accept `true` / `false`
- [ ] `PENCOLOR`, `POS`, list forms of SETPENCOLOR / SETBG / SETPOS / TOWARDS; `READCHAR` / `RC`, `CHAR`, `ASCII`; rest inputs

Not planned: multiple turtles, property lists, file I/O (SAVE / LOAD buttons cover it), `DEFINE` / `TEXT`, macros, `CATCH` / `THROW`.

### Internals — remaining technical work (agreed: finish this before the visual pass)
1. [x] Positioned tokens (v8.5): give every token `{line, col}` instead of the `__L<n>:` line-sentinel tokens. Enables exact error locations and, later, step mode / running-line highlight. Update tokenizer, extractor, `skipSen` / `noteLine`, beautify's lexer if needed, tests.
2. [ ] Collect all error messages in one module (`interpreter/errors.ts`), ready for the friendlier wording of phase 4.
3. [x] Editor: CodeMirror 6 (v8.5) — line numbers, bracket matching, real undo. Next on top of it: error-line underline and running-line highlight (needs tokens to know whether they came from the editor or from direct mode), colours for more token classes in the visual pass.
4. [ ] Smaller: move the browser test to `@playwright/test`; `vite.config.ts`.

Keep every step behaviour-preserving: `npm run lint` + `npm test` pass, and deterministic examples still draw pixel-identical canvases.

### Visual / interface pass
- [x] Part 1 (v8.6): system fonts, contrast, calm colours, syntax highlighting, sentence case, flat beige canvas, flat vector turtle
- [ ] Part 2 — canvas: optional grid with x/y axes; readable font for LABEL text (currently VT323 16 px); turtle size / pen-point review
- [x] Part 2a (v8.7): Commands panel as one aligned, searchable table with Try buttons; Examples as a grid of cards with pictures; examples resized for the beige canvas; examples fit + drawing snapshots in the unit tests
- [x] Part 2b (v8.10): Commands as separate commands with cards (longer text, several examples, Try / Insert, See also, Used in examples), group chips, ranked search with synonyms, keyboard; Examples with search, topics, "uses" filter and a preview before loading; F1 in the editor opens the command's card
- [ ] Optional: hover tooltip in the editor with the one-line description (CodeMirror `hoverTooltip`, from `REFERENCE`)
- [ ] Part 2 — layout: labelled toolbar (≡ ⎘ ⚙ → text or icon + text, "L:1" → "Ln 1"); Save as PNG next to Save / Load; move the version out of the header
- [ ] Commands panel docked beside the canvas instead of floating over it — needs `resizeCanvas()` to keep the turtle's position (today it re-centres the turtle when idle)
- [ ] Optional: light theme; "Retro" theme (VT323, sand, the old cartoon turtle)

### Later (agreed order)
- Phase 4 teaching features (share link, friendlier errors, lessons, PWA) — after the visual pass.
