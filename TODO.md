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
- [ ] Decide whether two-input functions (`DISTANCE`, `TOWARDS`, `MAX` …) should bind their inputs like `SQRT` does — `DISTANCE 0 0 > 5` currently means `DISTANCE 0 (0 > 5)` (documented in lang-spec §3.3 / §7; a breaking change)
- [ ] Short-circuit `AND` / `OR` (needs a "skip" parse mode so the right side is consumed without evaluating)
- [ ] `FOREVER`, `SETXY` / `SETX` / `SETY`, `FILL`
- [ ] Optional `WRAP` / `WINDOW` edge modes (currently always stops with OUCH)
- [ ] `HOME` drawing a line when the pen is down (UCBLogo behaviour)

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
- [ ] Part 2 — layout: labelled toolbar (≡ ⎘ ⚙ → text or icon + text, "L:1" → "Ln 1"); Save as PNG next to Save / Load; move the version out of the header
- [ ] Commands panel docked beside the canvas instead of floating over it — needs `resizeCanvas()` to keep the turtle's position (today it re-centres the turtle when idle)
- [ ] Optional: light theme; "Retro" theme (VT323, sand, the old cartoon turtle)

### Later (agreed order)
- Phase 4 teaching features (share link, friendlier errors, lessons, PWA) — after the visual pass.
