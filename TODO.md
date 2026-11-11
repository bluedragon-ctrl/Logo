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

### Internals
- [ ] Editor: re-render only the changed line instead of the whole editor on every keystroke (performance on long programs)
