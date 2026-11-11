// ── Help navigation ───────────────────────────────────────────────────────────
// Links between the Commands and Examples panels (a command card's "Used in", an
// example's "Commands used", F1 in the editor). Each panel fills in its own
// functions when it loads, so the two modules need not import each other.
export interface HelpNav {
  /** Open the Commands panel at the card of this word (or search for it). */
  showCommand(word: string): void;
  /** Open the Examples panel at the preview of example n. */
  showExample(n: number): void;
  /** Open the Examples panel showing only the examples that use one of the words. */
  showExamplesUsing(words: string[], label: string): void;
}
const missing = () => { throw new Error('help panel not loaded'); };
export const helpNav: HelpNav = { showCommand: missing, showExample: missing, showExamplesUsing: missing };
