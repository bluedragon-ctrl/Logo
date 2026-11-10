// ── Examples ──────────────────────────────────────────────────────────────────
// One file per example in /examples, loaded at build time. The number prefix of
// the file name sets the order in the EXAMPLES overlay. A file starts with
// metadata lines, which are Logo comments, so the file also opens in the app:
//   ;; title: Square
//   ;; desc: The classic — 4 sides, 90 degree turns
// Everything after the metadata is the example's code.
const files = import.meta.glob('../examples/*.logo', { query: '?raw', import: 'default', eager: true });

export function parseExample(text, file = '') {
  const meta = {};
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  for(; i < lines.length; i++){
    const m = lines[i].match(/^;;\s*(\w+):\s*(.*)$/);
    if(!m) break;
    meta[m[1].toLowerCase()] = m[2].trim();
  }
  if(!meta.title) throw new Error('Example ' + file + ': missing ";; title:" line');
  const code = lines.slice(i).join('\n').replace(/\n+$/, '');
  return { title: meta.title, desc: meta.desc || '', code };
}

export const EXAMPLES = Object.keys(files).sort().map(f => parseExample(files[f], f));
