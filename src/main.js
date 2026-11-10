// Blue Logo — application entry point.
//
// Module layout (see CLAUDE.md):
//   app.js        the page's session + browser LogoIO
//   render/       canvas, sprite, background, trail + labels, render()
//   turtle/       turtle state, drawing store, move / rotate / circle
//   interpreter/  tokenizer → procedures → runtime (runStack) ⇄ expr, CMD table,
//                 session, LogoIO — no DOM (ESLint enforces it)
//   editor/       contenteditable editor with highlighting and undo
//   format/       beautify (pure)
//   ui/           console, buttons, direct mode, overlays, files, autosave, options, resize
//
// The UI modules wire their DOM handlers when they are first imported. Imports
// below follow the order of the sections in the old single-file app.
import './styles/app.css';
import { EXAMPLES } from './examples.js';
import './ui/examples-overlay.js';
import { editor } from './editor/editor.js';
import './ui/splitter.js';
import './ui/code-buttons.js';
import './ui/program.js';
import { runDirectCommand } from './ui/direct.js';
import './ui/overlays.js';
import './ui/files.js';
import './ui/autosave.js';
import './ui/options.js';
import { resizeCanvas } from './ui/resize.js';
import { render } from './render/render.js';
import { rebuildTrailCanvas } from './render/trail.js';
import { session } from './app.js';
import { activeRctx } from './interpreter/context.js';
import { beautify } from './format/beautify.js';
import { optSpeed } from './ui/console.js';

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
