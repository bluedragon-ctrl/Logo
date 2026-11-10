// ── Utilities ─────────────────────────────────────────────────────────────────
// escHtml: escape a string for safe insertion into innerHTML.
// Used by renderLines (editor highlighting) and buildExamples (overlay previews).
// Defined at module level so both can share it without exposing editor internals.
export function escHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
