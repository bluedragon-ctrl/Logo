import { byId, escHtml } from '../util.ts';

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

// ── Code editor (contenteditable) ────────────────────────────────────────────
export const editor: Editor = (function(): Editor {
  const el = byId('editor');

  // Render a plain-text source string into the editor as highlighted divs.
  // One <div> per line — the browser's natural contenteditable line model.
  function renderLines(src: string): void {
    const lines = src.split('\n');
    // Build fragment to avoid multiple reflows
    const frag = document.createDocumentFragment();
    for(const line of lines){
      const div = document.createElement('div');
      const ci  = line.indexOf(';');
      if(line === ''){
        // Empty line: use <br> so the div has height
        div.innerHTML = '<br>';
      } else if(ci === -1){
        div.innerHTML = escHtml(line);
      } else {
        div.innerHTML = escHtml(line.slice(0, ci)) +
                        '<span class="comment">' + escHtml(line.slice(ci)) + '</span>';
      }
      frag.appendChild(div);
    }
    el.innerHTML = '';
    el.appendChild(frag);
  }

  // Read plain text from the editor — walk child divs, join with \n.
  // Handles both <div> line model (Chrome/Edge) and <br> model (Safari/Firefox).
  // textOf: text of a node ('' for an element without text).
  const textOf = (n: Node): string => n.textContent ?? '';

  function getValue(): string {
    const lines: string[] = [];
    for(const node of el.childNodes){
      if(node.nodeType === Node.TEXT_NODE){
        lines.push(textOf(node));
      } else if(node.nodeName === 'DIV' || node.nodeName === 'P'){
        lines.push(textOf(node));
      } else if(node.nodeName === 'BR'){
        lines.push('');
      }
    }
    // If editor has no children at all it's empty
    if(lines.length === 0) return '';
    // Trim trailing empty lines — browsers insert a guard <div><br></div> at the
    // end of contenteditable which would otherwise bake a spurious trailing \n
    // into every getValue() call, causing copy-paste to accumulate blank lines.
    while(lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  // Save & restore cursor position across innerHTML rewrites using character offset.
  //
  // Both functions operate div-by-div and add 1 per div boundary (the implicit
  // newline between lines). This keeps them in sync.
  //
  // getCaretOffset: finds which div the caret is in, uses range.toString() within
  //   that single div (reliable — no cross-div newline ambiguity), adds the length
  //   of all preceding divs plus one newline per div.
  //
  // setCaretOffset: reverses the process — subtracts div lengths (+1 per newline)
  //   until it finds the target div, then walks text nodes within that div.
  //
  // Bug that was here: getCaretOffset previously used a single range.toString()
  // spanning the whole editor, which omits inter-div newlines. setCaretOffset
  // subtracted those newlines, so the cursor landed N lines too early for a caret
  // on line N (the "jumps to line above" symptom).
  function getCaretOffset(): number {
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount) return 0;
    const r = sel.getRangeAt(0);
    let offset = 0;
    for(const div of el.childNodes){
      if(div.contains(r.startContainer)){
        // Caret is inside this div — measure chars within this div only
        const inner = document.createRange();
        inner.setStart(div, 0);
        inner.setEnd(r.startContainer, r.startOffset);
        offset += inner.toString().length;
        return offset;
      }
      offset += textOf(div).length + 1; // +1 for the implicit newline
    }
    return offset;
  }

  function setCaretOffset(offset: number): void {
    const sel = window.getSelection();
    if(!sel) return;
    for(const div of el.childNodes){
      const len = textOf(div).length;
      if(offset <= len){
        // Caret lands inside this div — walk its text nodes
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        let node: Node | null, remaining = offset;
        while((node = walker.nextNode())){
          if(remaining <= textOf(node).length){
            const range = document.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
          }
          remaining -= textOf(node).length;
        }
        // Empty div (<br>) or past all text nodes — place at end of div
        const range = document.createRange();
        range.selectNodeContents(div);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      offset -= len + 1; // +1 for the implicit newline
    }
    // Fallback: move to end of editor
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ── Undo / redo history ──────────────────────────────────────────────────
  // onInput() rewrites the editor's DOM, which wipes the browser's native undo
  // stack, so the editor keeps its own: snapshots of { src, caret }.
  // Consecutive typing within UNDO_COALESCE_MS merges into one step; setValue()
  // (examples, LOAD, beautify) always makes its own step, so it can be undone.
  const UNDO_LIMIT = 300, UNDO_COALESCE_MS = 800;
  const hist: { src: string; caret: number }[] = [{ src: '', caret: 0 }];
  // Change listeners (autosave). Called whenever the text actually changes:
  // typing, setValue(), undo / redo.
  const changeListeners: (() => void)[] = [];
  function notifyChange(){ changeListeners.forEach(fn => fn()); }
  let hIdx = 0, lastRecord = 0;
  function record(src: string, caret: number, coalesce: boolean): void {
    if(src === hist[hIdx].src) { hist[hIdx].caret = caret; return; }
    notifyChange();
    const now = Date.now();
    hist.length = hIdx + 1;                       // drop the redo branch
    if(coalesce && hIdx > 0 && now - lastRecord < UNDO_COALESCE_MS) hist[hIdx] = { src, caret };
    else { hist.push({ src, caret }); hIdx++; }
    if(hist.length > UNDO_LIMIT){ hist.shift(); hIdx--; }
    lastRecord = coalesce ? now : 0;
  }
  function applyHist(i: number): void {
    hIdx = i; lastRecord = 0;
    renderLines(hist[i].src);
    setCaretOffset(hist[i].caret);
    updateLn();
    notifyChange();
  }
  function undo(){ if(hIdx > 0) applyHist(hIdx - 1); }
  function redo(){ if(hIdx < hist.length - 1) applyHist(hIdx + 1); }

  // Re-highlight after every edit, preserving caret position
  function onInput(e: Event): void {
    const offset = getCaretOffset();
    const src    = getValue();
    renderLines(src);
    setCaretOffset(offset);
    const type = e instanceof InputEvent ? e.inputType : '';
    const typing = type === 'insertText' || type === 'deleteContentBackward' || type === 'deleteContentForward';
    record(src, offset, typing);
  }

  el.addEventListener('input', onInput);
  el.addEventListener('keydown', function(e){
    if(!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if(k === 'z' && !e.shiftKey){ e.preventDefault(); undo(); }
    else if((k === 'z' && e.shiftKey) || k === 'y'){ e.preventDefault(); redo(); }
  });
  // Undo/redo from the context menu or OS shortcuts arrive as beforeinput events.
  el.addEventListener('beforeinput', function(e){
    if(e.inputType === 'historyUndo'){ e.preventDefault(); undo(); }
    else if(e.inputType === 'historyRedo'){ e.preventDefault(); redo(); }
  });

  // Trap Tab — insert 2 spaces at caret
  // Note: document.execCommand('insertText') is deprecated per spec but retained
  // for contenteditable editing in all current browsers. The modern alternative
  // (DataTransfer + input events) requires significantly more code for no practical
  // benefit here. Revisit if browser support degrades.
  el.addEventListener('keydown', function(e){
    if(e.key !== 'Tab') return;
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  });

  // Intercept paste — strip HTML, insert plain text only
  el.addEventListener('paste', function(e){
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });

  // ── Line-number indicator ─────────────────────────────────────────────────
  // Updates the L:N display in the toolbar on every keystroke and cursor move.
  const lnIndicator = byId('ln-indicator');
  function updateLn() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
    const line = getValue().slice(0, getCaretOffset()).split('\n').length;
    lnIndicator.textContent = 'L:' + line;
  }
  el.addEventListener('input', updateLn);
  document.addEventListener('selectionchange', updateLn);

  // Public API used by the rest of the app
  return {
    getValue,
    setValue(src: string){ renderLines(src); record(getValue(), 0, false); },
    // initValue: load text as the starting point — no undo step, no change event.
    initValue(src: string){ renderLines(src); hist.length = 0; hist.push({ src: getValue(), caret: 0 }); hIdx = 0; lastRecord = 0; },
    onChange(fn: () => void){ changeListeners.push(fn); },
    focus(){ el.focus(); },
  };
})();
