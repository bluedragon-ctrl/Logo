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
- [ ] Next: remaining technical work (see below), then a visual / interface pass, then phase 4 teaching features

### Repo
- [ ] Tag releases on `main` (`v8.1`, `v8.2`, `v8.3`; optionally older ones from history)
- [ ] Optional: rename the GitHub repository to match the new name (the Pages URL follows the repo name; old URLs redirect only for the repo, not for Pages)

### Language
- [ ] Short-circuit `AND` / `OR` (needs a "skip" parse mode so the right side is consumed without evaluating)
- [ ] `FOREVER`, `SETXY` / `SETX` / `SETY`, `FILL`
- [ ] Optional `WRAP` / `WINDOW` edge modes (currently always stops with OUCH)
- [ ] `HOME` drawing a line when the pen is down (UCBLogo behaviour)

### Internals — remaining technical work (agreed: finish this before the visual pass)
1. [ ] Positioned tokens: give every token `{line, col}` instead of the `__L<n>:` line-sentinel tokens. Enables exact error locations and, later, step mode / running-line highlight. Update tokenizer, extractor, `skipSen` / `noteLine`, beautify's lexer if needed, tests.
2. [ ] Collect all error messages in one module (`interpreter/errors.ts`), ready for the friendlier wording of phase 4.
3. [ ] Editor decision: CodeMirror 6 (line numbers, bracket matching, error underline, running-line highlight) vs. fixing our own editor (it re-renders everything on every keystroke). Decide before the visual pass.
4. [ ] Smaller: move the browser test to `@playwright/test`; `vite.config.ts`.

Keep every step behaviour-preserving: `npm run lint` + `npm test` pass, and deterministic examples still draw pixel-identical canvases.

### Later (agreed order)
- Visual / interface pass (readability, layout) — after the technical work.
- Phase 4 teaching features (share link, friendlier errors, lessons, PWA) — after the visual pass.
