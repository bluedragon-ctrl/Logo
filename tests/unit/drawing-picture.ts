// drawingPicture(drawing, width, height): a text summary of what a program drew,
// for snapshot tests. Snapshot diffs then show WHAT changed, not just that a
// number changed:
//   segments 120 · dots 0 · labels 0 · bounds x -224..220 y -225..208 · hash 1a2b3c4d
//   a COLS × ROWS character picture of the whole canvas: # line, o dot, labels as text
// The hash covers every segment (coordinates and width to 0.01, colour) and label,
// so any change to the picture changes it, including ones too small to see in the
// character grid.
import type { Drawing } from '../../src/interpreter/types.ts';

const COLS = 64, ROWS = 24;

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function drawingPicture(d: Drawing, width: number, height: number): string {
  const grid = Array.from({ length: ROWS }, () => Array<string>(COLS).fill('.'));
  const cell = (x: number, y: number): [number, number] =>   // Logo → [col, row]
    [Math.floor((x + width / 2) / width * COLS), Math.floor((height / 2 - y) / height * ROWS)];
  const mark = (x: number, y: number, ch: string) => {
    const [c, r] = cell(x, y);
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) grid[r][c] = ch;
  };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  let dots = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, data = '';
  for (let i = 0; i < d.len; i++) {
    const f = d.f32, u = d.u8, fi = i * 5, ci = i * 3;
    const [ax, ay, bx, by] = [f[fi], f[fi + 1], f[fi + 2], f[fi + 3]];
    data += [ax, ay, bx, by, f[fi + 4]].map(r2).join(',') + ':' + [u[ci], u[ci + 1], u[ci + 2]].join(',') + ';';
    x0 = Math.min(x0, ax, bx); x1 = Math.max(x1, ax, bx); y0 = Math.min(y0, ay, by); y1 = Math.max(y1, ay, by);
    if (ax === bx && ay === by) { dots++; mark(ax, ay, 'o'); continue; }
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 2);
    for (let k = 0; k <= n; k++) mark(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, '#');
  }
  for (const lab of d.labels) {
    data += 'L' + [lab.x, lab.y].map(r2).join(',') + ':' + lab.text + ';';
    const [c, r] = cell(lab.x, lab.y);
    [...lab.text].forEach((ch, k) => { if (r >= 0 && r < ROWS && c + k >= 0 && c + k < COLS) grid[r][c + k] = ch; });
  }
  const bounds = d.len ? `x ${Math.round(x0)}..${Math.round(x1)} y ${Math.round(y0)}..${Math.round(y1)}` : 'empty';
  const head = `segments ${d.len - dots} · dots ${dots} · labels ${d.labels.length} · bounds ${bounds} · hash ${fnv1a(data)}`;
  return '\n' + head + '\n' + grid.map(row => row.join('')).join('\n') + '\n';
}
