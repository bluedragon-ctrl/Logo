import { defaultKeymap, history, historyKeymap, indentLess, isolateHistory, toggleComment } from '@codemirror/commands';
import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { logoLanguage } from './logo-language.ts';
import { byId } from '../util.ts';

// The editor's public API (see the return statement at the end).
export interface Editor {
  getValue(): string;
  /** Replace the text as one undo step (examples, LOAD, beautify). */
  setValue(src: string): void;
  /** Load text as the starting point — no undo step, no change event. */
  initValue(src: string): void;
  onChange(fn: () => void): void;
  focus(): void;
}

// ── Code editor (CodeMirror 6) ───────────────────────────────────────────────
// CodeMirror owns the text, the caret, undo / redo, IME and paste. This module
// configures it (Logo highlighting, line numbers, [ ] matching, Tab = 2 spaces)
// and wraps it in the small Editor interface the rest of the app uses.
// Colours: app.css (#editor .cm-…) and the HighlightStyle below.

const PLACEHOLDER = [
  '; Welcome to Blue Logo',
  '; Type commands here and press Run',
  ';',
  '; Move:    FD 100   BK 50   RT 90   LT 45',
  '; Draw:    CIRCLE 80   SETCOLOR 200 50 50',
  '; Repeat:  REPEAT 4 [ FD 100 RT 90 ]',
  '; Vars:    MAKE :n 10   FD :n',
  '; Procs:   TO SQUARE',
  ';            REPEAT 4 [FD 80 RT 90]  END',
  ';',
  '; Examples: ready-made programs',
  '; Commands: the full reference',
].join('\n');

// Token colours (logoLanguage tags every class). Chosen for at least 4.5:1 contrast
// on the editor background (--surface in app.css); plain text, operators and
// user procedure names stay in the default text colour.
const logoHighlight = HighlightStyle.define([
  { tag: tags.comment,                      color: '#8b94a3' },
  { tag: tags.keyword,                      color: '#7cc0ff' },                    // commands (FD, SETCOLOR…)
  { tag: tags.controlKeyword,               color: '#d29bf0' },                    // REPEAT, IF, FOR…
  { tag: tags.definitionKeyword,            color: '#d29bf0', fontWeight: 'bold' }, // TO / END
  { tag: tags.function(tags.variableName),  color: '#6fd3d3' },                    // math functions, queries
  { tag: tags.variableName,                 color: '#f0c674' },                    // :x
  { tag: tags.number,                       color: '#f2a46c' },
  { tag: tags.string,                       color: '#9fd68b' },                    // "word
  { tag: [tags.squareBracket, tags.paren],  color: '#c3c9d3' },
]);

export const editor: Editor = (function(): Editor {
  const changeListeners: (() => void)[] = [];
  const lnIndicator = byId('ln-indicator');

  const insertSpaces = (view: EditorView): boolean => {
    view.dispatch(view.state.replaceSelection('  '), { scrollIntoView: true, userEvent: 'input' });
    return true;
  };

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    bracketMatching(),
    logoLanguage,
    syntaxHighlighting(logoHighlight),
    EditorView.lineWrapping,
    placeholder(PLACEHOLDER),
    EditorState.tabSize.of(2),
    EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'none', 'aria-label': 'Logo program' }),
    keymap.of([
      { key: 'Tab', run: insertSpaces, shift: indentLess },
      { key: 'Mod-/', run: toggleComment },
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of(u => {
      if(u.docChanged) changeListeners.forEach(fn => fn());
      if(u.docChanged || u.selectionSet)
        lnIndicator.textContent = 'L:' + u.state.doc.lineAt(u.state.selection.main.head).number;
    }),
  ];

  const view = new EditorView({
    parent: byId('editor'),
    state: EditorState.create({ doc: '', extensions }),
  });

  return {
    getValue: () => view.state.doc.toString(),
    setValue(src: string){
      if(src === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: src },
        selection: { anchor: 0 },
        scrollIntoView: true,
        userEvent: 'set',
        annotations: isolateHistory.of('full'), // its own undo step, never merged with typing
      });
    },
    // A fresh state: empty undo history, and no update listener call (no change event).
    initValue(src: string){
      view.setState(EditorState.create({ doc: src, extensions }));
      lnIndicator.textContent = 'L:1';
    },
    onChange(fn: () => void){ changeListeners.push(fn); },
    focus(){ view.focus(); },
  };
})();
