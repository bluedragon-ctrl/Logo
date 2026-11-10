# Claude Logo — Architecture Review & Modernisation Proposal

*November 2026, based on v8.0. Status: agreed direction (see §5). Phase 0 in progress.*

The goal is to turn a family project into a teaching tool used every week. That changes the priorities:
- it must never lose a pupil's work,
- it is delivered as a **hosted web page** (GitHub Pages first, possibly a real server later), not as a local file,
- it must work on locked-down school networks,
- it must be easy to change without breaking things, because changes will come more often.

---

## 1. Where the project is today

| Aspect | Today | Assessment |
|---|---|---|
| Delivery | One 160 KB HTML file (≈360 lines CSS, 250 HTML, 2 680 JS), opens from `file://` | 🟡 Was a strength for a local app. Now that it is a hosted page, single-file delivery is no longer needed. |
| Code structure | Clear layers marked with `// ──` comments, all in one global scope | 🟡 Good design, but the only boundary is discipline. Any function can touch any global (`turtle`, `globalVars`, `procs`, `CW`, `optSpeed`…). |
| Interpreter | Tokens → trampoline `runStack` ⇄ precedence parser. Core is DOM-free; leaf commands call `log` / `render` / canvas directly | 🟢 The core is solid. 🟡 The leaf layer is tied to the DOM, so it can only be tested in a browser. |
| Tests | One Playwright script: 31 examples, 31 language cases, 4 UI checks, ≈8 s | 🟢 Good regression net. 🟡 Every test drives the real UI through globals (`editor`, `activeRctx`, `EXAMPLES`…). No unit tests and no coverage. |
| CI | Only the Pages deploy, which has **never succeeded** (Pages not enabled in repo settings). **Tests do not run on PRs** | 🔴 Easy to fix and worth fixing first. |
| Types | None. Frame shapes, tokens and scopes are documented only in comments | 🟡 The interpreter is a textbook fit for TypeScript discriminated unions. |
| Versioning | Copy the whole HTML file into `versions/` on every bump; version string edited by hand in 5+ places | 🟡 Error-prone and duplicates git history. |
| Editor | Hand-written contenteditable with its own undo and caret code; re-renders the whole document on every keystroke | 🟡 Works, but it is the most fragile code in the project and a lot to maintain. |
| Persistence | Nothing saved automatically. A refresh or closed tab loses the program | 🔴 For a classroom tool, the most important gap. |
| Offline / privacy | VT323 font loaded from Google Fonts | 🟡 Breaks the look offline. Some school networks block it, and embedding Google Fonts has GDPR implications in the EU. |
| Docs | Two specs, CLAUDE.md, CHANGELOG, TODO, REVIEW | 🟢 Unusually thorough. Some of it describes the single file's layout and will need rewriting after a split. |

In short, the language and interpreter design is in good shape. What is missing is the **engineering scaffolding** around them (modules, types, unit tests, CI, release automation) and a few **classroom features**.

---

## 2. Recommendations

### 2.1 Split the source into modules and build with Vite

Since the app is now a hosted page, there is no need to keep it in one file.

- **Vite** with `base: '/Logo/'` (the GitHub Pages path) → `dist/` with hashed JS/CSS assets, deployed by the Pages workflow.
- `npm run dev` gives hot reload while you work. `npm run build` produces the site.
- A normal multi-file build also makes the later steps easy: self-hosted font, a service worker (PWA), and code-splitting if the app grows (e.g. load the editor separately).
- If a real server comes later, the built frontend is served as-is. Server features (accounts, a teacher's view of pupils' programs) would sit behind small interfaces in the frontend, e.g. a `ProgramStore` with a `localStorage` implementation first and an HTTP implementation later.

### 2.2 TypeScript: yes, introduced gradually

With Vite in place, TypeScript costs almost nothing to set up, and this codebase benefits a lot:

- The `runStack` frames (`exec | repeat | while | for`, told apart by `isRepeat` / `isWhile` / `isFor`) become a **discriminated union**. The compiler then checks every place that handles frames. This is exactly the kind of invariant CLAUDE.md lists as "easy to get wrong".
- `RunContext`, `Proc`, `Token`, `Scope`, and the `CMD` handler signature become checked contracts rather than comments.
- Refactors (renaming, moving code between modules) become safe.

Suggested path:
1. Rename to `.ts` with `strict: false` and `allowJs`, and convert module by module.
2. Make `interpreter/` fully `strict` first, since it holds the most logic and has no DOM.
3. Do the UI modules later. They benefit less.

(Agreed: TypeScript, not JSDoc.)

### 2.3 Testing: Vitest for logic, Playwright for the UI

| Layer | Tool | What |
|---|---|---|
| Unit | **Vitest** (Node, no browser) | `tokenize`, `extractProcedures`, `evalExpr`, scoping, `runStack` control flow, `beautify`, `clipToCanvas`, number formatting. Runs in under a second in watch mode. |
| Interpreter integration | Vitest + a fake IO | Run each example `.logo` file headlessly and assert on the log output and the trail segments (e.g. "Square draws 4 segments and ends at the origin"). |
| Visual regression (optional) | Vitest + snapshot of the trail array, or Playwright screenshots | Catches rendering changes. |
| End-to-end | **`@playwright/test`** | STOP during WAIT, direct mode, resize, editor undo, save/load. Run against the **built** site (`vite preview`). |

**Prerequisite (already in TODO.md):** inject the side effects into the interpreter:

```ts
interface LogoIO {
  log(msg: string, cls: LogClass): void;
  render(): void;
  drawSegment(x0, y0, x1, y1, color, width): void;
  drawLabel(...): void; drawDot(...): void;
  canvasSize(): { w: number; h: number };
  setSpeed?(n: number): void;
  clearConsole?(): void;
  now(): number; nextFrame(): Promise<void>;   // so tests can run without rAF
}
// makeRunContext(speed, procs, io)  → rctx.io
```

This is the **single most valuable refactor**. It unlocks Node tests and keeps the interpreter reusable, for example for a future "check my answer" exercise mode or a CLI.

The existing `tests/run-examples.js` reaches into page globals. After modularising, either expose a small test hook (`window.__logo = { editor, run, state }` in dev/test builds) or move most of those cases to Vitest. Recommendation: **move the 31 language cases to Vitest**, where they belong, and keep only the UI checks in Playwright.

### 2.4 Proposed file layout

```
claude-logo/
├── index.html                 # Vite entry (markup only) — the app itself, no longer a redirect
├── src/
│   ├── main.ts                # wires everything together
│   ├── styles/                # app.css, overlays.css, …
│   ├── interpreter/           # NO DOM imports — enforced by ESLint rule
│   │   ├── tokenizer.ts
│   │   ├── procedures.ts      # extractBlock, extractProcedures
│   │   ├── expr.ts            # evalExpr, operators, UNARY/BINARY2 tables
│   │   ├── runtime.ts         # runStack, run, runExpr, frames
│   │   ├── scope.ts           # setVar, procScopeOf, repeatInfo
│   │   ├── commands/          # motion.ts, pen.ts, vars.ts, output.ts …
│   │   ├── context.ts         # RunContext, LogoIO
│   │   └── errors.ts          # all error messages in one place
│   ├── turtle/                # turtle state, move/rotate/circle, clipping
│   ├── render/                # canvas, HiDPI, sprite, background, trail, labels
│   ├── editor/                # editor, highlighting, undo
│   ├── ui/                    # buttons, splitter, overlays, options, files, direct mode
│   └── format/beautify.ts
├── examples/                  # one .logo file per example (+ front-matter title/desc)
├── public/fonts/VT323.woff2   # self-hosted
├── tests/
│   ├── unit/                  # Vitest
│   └── e2e/                   # Playwright
├── docs/
│   ├── lang-spec.md, impl-spec.md
│   └── archive/
├── CHANGELOG.md, TODO.md, CLAUDE.md
├── package.json               # version lives here, injected at build time
└── .github/workflows/{ci.yml, pages.yml}
```

Notes:
- **Examples as real `.logo` files** (imported with Vite's `?raw`) are easier to edit than JS string literals with `\n`. They can be opened in the app, and the test suite can pick them up automatically. This is also the natural home for lessons later (§3).
- The **`versions/` folder** can stay frozen as-is for old links. New releases come from git tags: the Pages workflow builds `main` → `/`, and each tag `vX.Y` → `/versions/claude-logo-vX.Y.html`. That ends copying 160 KB per release and editing the version number in five places by hand.

### 2.5 Tooling and CI

- **CI workflow on every PR and push:** `npm ci → tsc --noEmit → eslint → vitest run → vite build → playwright test`. Block merges on red.
- **ESLint** (with `no-restricted-imports` so `src/interpreter/**` cannot import `render/`, `ui/` or `editor/`) + **Prettier**. Or use **Biome** as a single fast tool for both. The DOM-free rule then becomes enforced, not just documented.
- **Release:** `npm version minor` → changelog entry → tag → Pages deploy. Write a short `scripts/release` note in CLAUDE.md to replace the manual 6-step list.

### 2.6 State encapsulation (do it together with the module split)

Module-level mutable globals (`turtle`, `globalVars`, `procs`, trail arrays, `labelStore`, `activeRctx`, `CW/CH`) become explicit objects:

```ts
const session = createSession();      // { turtle, globals, procs, trail, labels }
const rctx = makeRunContext({ speed, session, io });
```

Benefits: tests create a fresh session per case, CLR becomes `session = createSession()`, and two canvases side by side becomes possible (e.g. a "target picture" next to the pupil's).

### 2.7 Editor: consider CodeMirror 6 (medium term, optional)

The hand-written editor (caret save/restore, custom undo, full re-render per keystroke, `execCommand`) is the most fragile and least "Logo-specific" part of the code. **CodeMirror 6** (≈120–150 KB min, inlined by the build) gives you:
- proper undo/redo, IME and mobile input, accessibility,
- incremental syntax highlighting (a small Logo grammar using `StreamLanguage`),
- line numbers, **error-line underline**, **current-line highlight while running** (great for teaching),
- bracket matching for `[ ]` (pupils often get this wrong), autocomplete of commands and procedure names.

The trade-off is a larger download and a dependency to keep up to date. Do this **after** the build split. With a bundler in place it becomes a contained change inside `src/editor/`. Decide in phase 5; the main argument for it is the run-line highlight and step mode.

### 2.8 Interpreter evolution (optional, later)

The interpreter works on flat token arrays with `__L<n>:text` string sentinels for line tracking. That is fine today. If you later want any of the following, a step to **tokens with `{line, col}` positions** (and possibly a small AST) pays off:
- precise error locations (underline the exact word),
- a **step / trace mode** that highlights the running command,
- static checks before running ("procedure SQUAR is not defined — did you mean SQUARE?"),

Don't do this early. Typing and unit tests first make it a safe change later.

---

## 3. Teaching features unlocked by the new architecture

Ordered by value to a classroom, roughly:

1. **Autosave** the editor to `localStorage` (and restore on load), plus a "recent programs" list. Prevents the most common classroom disaster.
2. **Self-hosted font** → no third-party requests (privacy / GDPR, filtered school networks).
3. **Share via link:** program compressed into the URL `#hash`. The teacher posts a link, pupils open it, and no accounts or server are needed.
4. **Friendlier error messages:** collect all messages in `errors.ts`, review them for young readers, and add hints ("did you mean SQUARE?"). English only.
5. **Step / slow mode with current-line highlight** (needs §2.7, ideally §2.8).
6. **Lessons / challenges:** a lesson is a `.logo` file with front matter (goal text, starter code, optional target drawing). A "check" compares the pupil's trail with the target (made possible by the headless interpreter of §2.3).
7. **PWA** (manifest + service worker) so it can be "installed" on school Chromebooks and keeps working when the network drops mid-lesson.
8. Language items already in TODO (`FOREVER`, `SETXY`, `FILL`, `WRAP`), which are easier and safer to add with unit tests in place.

---

## 4. Suggested roadmap

Each phase is a separate PR and leaves the app fully working. Phases 1–3 should cause **no visible change** for pupils.

| Phase | Content | Size | Risk |
|---|---|---|---|
| **0** | Get GitHub Pages live (enable Pages in repo settings). Run the tests in CI on every PR; deploy only after tests pass. `package.json` pinning Playwright. | S | Low |
| **0b** | Self-host the VT323 font. Autosave to localStorage. (v8.1) | S | Low |
| **1** | Vite build. Mechanical split of the HTML into `src/` modules (no logic changes). Examples → `.logo` files. Playwright test runs against the built site. Pages deploys `dist/`. | M | Medium: mostly moving code; the existing test suite is the safety net |
| **2** | `LogoIO` injection + `Session` object. Vitest; move language cases to unit tests and add tokenizer/parser/beautify tests. ESLint boundary rule. | M | Low–medium |
| **3** | TypeScript: interpreter strict first, then render/turtle, then UI. | M | Low (incremental) |
| **4** | Teaching features: share link, friendlier errors, lessons, PWA. | M–L | Low |
| **5** | Run-line highlight and step mode; CodeMirror if it makes these easier. Optionally positioned tokens. | L | Medium |

## 5. Decisions (agreed with the maintainer, November 2026)

1. **Build step:** accepted (Node + Vite to develop).
2. **Delivery:** a hosted web page, GitHub Pages first, possibly a server later. Opening the app from `file://` is no longer a requirement, so no single-file build.
3. **Old versions:** keep `versions/` frozen and online; future versions come from git tags.
4. **Language:** English only. No localisation work.
5. **CodeMirror:** no strong preference. Decide in phase 5 on technical grounds.
6. **TypeScript, Vitest and the file reorganisation:** agreed as proposed.
