import { isBuiltinWord } from './interpreter/expr.ts';
import { tokenize } from './interpreter/tokenizer.ts';

// ── Examples ──────────────────────────────────────────────────────────────────
// One file per example in /examples, loaded at build time. The number prefix of
// the file name sets the order in the EXAMPLES overlay. A file starts with
// metadata lines, which are Logo comments, so the file also opens in the app:
//   ;; title: Square
//   ;; desc: The classic — 4 sides, 90 degree turns
//   ;; topic: First steps          (one of EXAMPLE_TOPICS)
//   ;; shows: REPEAT, FD           (optional: the commands this example is about)
// Everything after the metadata is the example's code.
//
// uses: the built-in words the code uses, found with the real tokenizer — the
// Commands panel's "Used in" and the Examples panel's "uses" filter come from it,
// so they never go out of date. Examples that `shows` a word come first there.
const files = import.meta.glob<string>('../examples/*.logo', { query: '?raw', import: 'default', eager: true });

export const EXAMPLE_TOPICS = ['First steps', 'Loops', 'Variables and decisions', 'Procedures', 'Recursion', 'Colour', 'Maths and curves'];

export interface Example { title: string; desc: string; topic: string; shows: string[]; uses: string[]; code: string }

// usedWords(code): the built-in words in a program (uppercase, first-use order). Symbols (+, >) are left out.
export function usedWords(code: string): string[] {
  return [...new Set(tokenize(code).map(t => t.text).filter(w => /^[A-Z]/.test(w) && isBuiltinWord(w)))];
}

export function parseExample(text: string, file = ''): Example {
  const meta: Record<string, string> = {};
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  for(; i < lines.length; i++){
    const m = lines[i].match(/^;;\s*(\w+):\s*(.*)$/);
    if(!m) break;
    meta[m[1].toLowerCase()] = m[2].trim();
  }
  if(!meta.title) throw new Error('Example ' + file + ': missing ";; title:" line');
  const code = lines.slice(i).join('\n').replace(/\n+$/, '');
  const shows = (meta.shows ?? '').split(/[\s,]+/).filter(Boolean).map(w => w.toUpperCase());
  return { title: meta.title, desc: meta.desc || '', topic: meta.topic || '', shows, uses: usedWords(code), code };
}

export const EXAMPLES: Example[] = Object.keys(files).sort().map(f => parseExample(files[f], f));

// examplesUsing(words): indices of the examples that use any of the words — those
// that show one of them first, then the rest, each group in file order.
export function examplesUsing(words: string[]): number[] {
  const hit = EXAMPLES.map((e, n) => ({ n, shows: e.shows.some(w => words.includes(w)), uses: e.uses.some(w => words.includes(w)) }))
    .filter(x => x.uses);
  return [...hit.filter(x => x.shows), ...hit.filter(x => !x.shows)].map(x => x.n);
}
