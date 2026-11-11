import './styles/app.css';
import { EXAMPLES } from './examples.ts';
import './ui/examples-overlay.ts';
import { editor } from './editor/editor.ts';
import './ui/splitter.ts';
import './ui/code-buttons.ts';
import './ui/program.ts';
import { runDirectCommand } from './ui/direct.ts';
import './ui/overlays.ts';
import './ui/reference-panel.ts';
import './ui/files.ts';
import './ui/autosave.ts';
import './ui/options.ts';
import { resizeCanvas } from './ui/resize.ts';
import { render } from './render/render.ts';
import { rebuildTrailCanvas } from './render/trail.ts';
import { session } from './app.ts';
import { activeRctx } from './interpreter/context.ts';
import { beautify } from './format/beautify.ts';
import { optSpeed } from './ui/console.ts';

// Blue Logo — application entry point.
//
// Module layout (see CLAUDE.md):
//   app.js        the page's session + browser LogoIO
//   render/       canvas, sprite, background, trail + labels, render()
//   turtle/       turtle state, drawing store, move / rotate / circle
//   interpreter/  tokenizer → procedures → runtime (runStack) ⇄ expr, CMD table,
//                 session, LogoIO — no DOM (ESLint enforces it)
//   editor/       CodeMirror 6 editor (Logo highlighting, line numbers, undo)
//   format/       beautify (pure)
//   ui/           console, buttons, direct mode, overlays, files, autosave, options, resize
//
// The UI modules wire their DOM handlers when they are first imported. Imports
// below follow the order of the sections in the old single-file app.

resizeCanvas();
// LABEL uses the VT323 web font; repaint labels once it has loaded so text drawn
// before the font arrived does not stay in the fallback font.
if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => { rebuildTrailCanvas(); render(); });

// Test and console hooks: tests/run-examples.js drives the app through these
// names (they were plain globals in the single-file versions).
Object.defineProperties(window, {
  editor:           { value: editor },
  EXAMPLES:         { value: EXAMPLES },
  beautify:         { value: beautify },
  optSpeed:         { value: optSpeed },
  runDirectCommand: { value: runDirectCommand },
  activeRctx:       { get: () => activeRctx },
  labelStore:       { get: () => session.drawing.labels },
  session:          { value: session },
});
