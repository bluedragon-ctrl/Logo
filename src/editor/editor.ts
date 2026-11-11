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
  '; Welcome to BLUE LOGO',
  '; Type commands below and press RUN',
  ';',
  '; Move:    FD 100   BK 50   RT 90   LT 45',
  '; Draw:    CIRCLE 80   SETCOLOR 200 50 50',
  '; Repeat:  REPEAT 4 [ FD 100 RT 90 ]',
  '; Vars:    MAKE :n 10   FD :n',
  '; Procs:   TO SQUARE',
  ';            REPEAT 4 [FD 80 RT 90]  END',
  ';',
  '; Click EXAMPLES for more',
  '; ? COMMANDS for reference',
].join('\n');

// Only comments have their own colour for now; every other token class is tagged
// by logoLanguage, so colouring more of them is a change here.
const logoHighlight = HighlightStyle.define([
  { tag: tags.comment, color: '#556' },
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
