// ── Utilities ─────────────────────────────────────────────────────────────────
// escHtml: escape a string for safe insertion into innerHTML.
// Used by renderLines (editor highlighting) and buildExamples (overlay previews).
export function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// byId: document.getElementById that fails loudly (at start-up) if index.html
// lacks the element, instead of a null error later. T narrows the element type:
// byId<HTMLInputElement>('opt-speed').value.
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if(!el) throw new Error('index.html has no element #' + id);
  return el as T;
}

// context2d: a canvas's 2D context (never null for a canvas element in practice).
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = canvas.getContext('2d');
  if(!c) throw new Error('2D canvas not supported');
  return c;
}
