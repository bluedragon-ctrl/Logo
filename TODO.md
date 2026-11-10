# Claude Logo — TODO

The v7.3 review (`REVIEW.md`) was fully addressed in v8.0. Remaining ideas, roughly by value:

## Pending

Roadmap for making this a classroom tool: `docs/architecture-proposal.md` (phases 0–5).

### Deployment
- [ ] Enable GitHub Pages: repository Settings → Pages → Source: "GitHub Actions" (both deploys so far failed with "Get Pages site failed — Not Found")
- [ ] Self-host the VT323 font; autosave the editor to localStorage (v8.1)

### Repo
- [ ] After merging v8.0 to `main`: tag releases (`git tag v8.0`, optionally older ones from history)

### Language
- [ ] Short-circuit `AND` / `OR` (needs a "skip" parse mode so the right side is consumed without evaluating)
- [ ] `FOREVER`, `SETXY` / `SETX` / `SETY`, `FILL`
- [ ] Optional `WRAP` / `WINDOW` edge modes (currently always stops with OUCH)
- [ ] `HOME` drawing a line when the pen is down (UCBLogo behaviour)

### Internals
- [ ] Inject `log` / `render` / canvas size into the interpreter (`rctx.io`) so the core can run in Node tests without a browser
- [ ] Editor: re-render only the changed line instead of the whole editor on every keystroke (performance on long programs)
