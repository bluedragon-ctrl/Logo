# Claude Logo — TODO

See `REVIEW.md` (v7.3 project review, 2026-11-10) for details on each item.

## Pending

### v7.4 — bug fixes
- [ ] B1 FOR scope drops inherited variables (FOR inside REPEAT / procedure)
- [ ] B2 STOP does not interrupt WAIT; RUN silently ignored until timer ends
- [ ] B3 Direct-mode command can run concurrently with RUN (guard `activeRctx`)
- [ ] B4 Clear-on-run leaves LABEL text (`labelStore` not reset)
- [ ] B5 Parse errors (e.g. missing END) not shown on RUN
- [ ] B6 Expression-context recursion ends in raw JS stack overflow

### v7.5 — docs
- [ ] Lang spec: precedence section (actual: right-recursive, `2 + 3 * 4 = 14`)
- [ ] Impl spec: rewrite interpreter chapter for unified `runStack`
- [ ] CLAUDE.md: section map, example count (28), known-limitations list, DOM-dependency claim
- [ ] Archive `claude-logo-spec-v4.1.md`, `plan-graph-drawing-features.md`

### Repo
- [ ] Git tags per release; prune/move old `claude-logo-v*.html`
- [ ] Use `node tests/run-examples.js` as the standard verification step
