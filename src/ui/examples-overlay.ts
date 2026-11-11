import { editor } from '../editor/editor.ts';
import { EXAMPLES, EXAMPLE_TOPICS } from '../examples.ts';
import { byId, escHtml } from '../util.ts';
import { helpNav } from './help-nav.ts';
import { closeOverlay, showOverlay } from './overlays.ts';
import { paintExample } from './thumbs.ts';

// ── Examples panel ────────────────────────────────────────────────────────────
// A compact grid of cards: a small picture of what the example draws, its title
// and description. Above it: a search box (title, description, topic and the
// commands the example uses), topic chips (`;; topic:` in the example files) and,
// when the Commands panel asked for it, a "uses FOR" filter.
//
// Clicking a card opens its preview: a larger picture, the commands it uses
// (links to their cards in the Commands panel) and the code. "Open in editor"
// loads the code (one undo step) and closes the panel.
//
// The pictures come from ui/thumbs.ts (each example run headlessly once). They
// are made the first time the panel opens, in order, yielding between examples.

const THUMB_W = 132, THUMB_H = 99;     // card pictures, CSS pixels
const PREVIEW_W = 264, PREVIEW_H = 198;

const grid = byId('ex-grid');
const search = byId<HTMLInputElement>('ex-search');
const chipsBox = byId('ex-chips');
const preview = byId('ex-preview');
let topic = 'all';
let usesFilter: string[] | null = null;   // words, set by the Commands panel's "All n examples"
let current = -1;                         // example in the preview

const cards: HTMLElement[] = EXAMPLES.map((ex, n) => {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'ex-card';
  card.dataset.n = String(n);
  card.innerHTML = '<canvas class="ex-thumb" width="' + THUMB_W + '" height="' + THUMB_H + '"></canvas>'
                 + '<span class="ex-text"><span class="ex-title">' + escHtml(ex.title) + '</span>'
                 + '<span class="ex-desc">' + escHtml(ex.desc) + '</span></span>';
  card.onclick = () => showPreview(n);
  grid.appendChild(card);
  return card;
});

chipsBox.innerHTML = [['all', 'All', EXAMPLES.length] as const, ...EXAMPLE_TOPICS.map(t => [t, t, EXAMPLES.filter(e => e.topic === t).length] as const)]
  .map(([id, title, count]) => '<button type="button" class="chip" data-chip="' + escHtml(id) + '" aria-pressed="' + (id === topic) + '">'
    + escHtml(title) + ' <span class="chip-n">' + count + '</span></button>').join('');

// ── Filtering ──
function matches(n: number): boolean {
  const ex = EXAMPLES[n];
  if(topic !== 'all' && ex.topic !== topic) return false;
  if(usesFilter && !ex.uses.some(w => usesFilter?.includes(w))) return false;
  const q = search.value.trim().toLowerCase();
  if(!q) return true;
  const text = (ex.title + ' ' + ex.desc + ' ' + ex.topic).toLowerCase(), uses = ex.uses.map(w => w.toLowerCase());
  return q.split(/\s+/).every(w => text.includes(w) || uses.includes(w));
}
function apply(): void {
  let shown = 0;
  cards.forEach((c, n) => { const hit = matches(n); c.hidden = !hit; if(hit) shown++; });
  byId('ex-none').hidden = shown > 0 || !preview.hidden;
}
function setTopic(id: string): void {
  topic = id;
  chipsBox.querySelectorAll<HTMLElement>('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.chip === id)));
  apply();
}
function setUses(words: string[] | null, label = ''): void {
  usesFilter = words;
  byId('ex-uses').hidden = !words;
  byId('ex-uses-word').textContent = label;
  apply();
}

// ── Grid ⇄ preview ──
function showGrid(): void {
  preview.hidden = true; grid.hidden = false;
  apply();
  if(current >= 0) cards[current]?.focus();
}
function showPreview(n: number): void {
  const ex = EXAMPLES[n];
  current = n;
  byId('exp-title').textContent = ex.title;
  byId('exp-desc').textContent = ex.desc;
  byId('exp-topic').textContent = ex.topic;
  byId('exp-code').textContent = ex.code.replace(/^\n+/, '');
  byId('exp-cmds').innerHTML = ex.uses.filter(w => w !== 'END').map(w => '<button type="button" class="ref-link' + (ex.shows.includes(w) ? ' shows' : '') + '" data-cmd="' + escHtml(w) + '">' + escHtml(w) + '</button>').join(' ');
  void paintExample(byId<HTMLCanvasElement>('exp-pic'), n, PREVIEW_W, PREVIEW_H);
  grid.hidden = true; byId('ex-none').hidden = true; preview.hidden = false;
  preview.scrollTop = 0;
  byId('ex-open').focus();
}

// ── Opening from elsewhere ──
let thumbsStarted = false;
function startThumbs(): void {
  if(thumbsStarted) return;
  thumbsStarted = true;
  void (async () => {
    for(let n = 0; n < EXAMPLES.length; n++){
      const cv = cards[n].querySelector('canvas');
      if(cv) await paintExample(cv, n, THUMB_W, THUMB_H);
    }
    grid.dataset.thumbs = 'done';   // for the browser test
  })();
}
function open(): void { showOverlay('ex-overlay'); startThumbs(); }

helpNav.showExample = n => { open(); showPreview(n); };
helpNav.showExamplesUsing = (words, label) => {
  open();
  search.value = ''; setTopic('all'); setUses(words, label);
  showGrid();
  grid.scrollTop = 0;
};

// ── Events ──
chipsBox.addEventListener('click', ev => {
  const c = (ev.target as HTMLElement).closest<HTMLElement>('[data-chip]');
  if(c?.dataset.chip){ setTopic(c.dataset.chip); if(!preview.hidden) showGrid(); }
});
search.addEventListener('input', () => { if(!preview.hidden) showGrid(); apply(); });
search.addEventListener('keydown', e => {
  if(e.key === 'Escape' && search.value){ e.stopPropagation(); search.value = ''; apply(); }
  else if(e.key === 'Enter'){ const first = cards.find(c => !c.hidden); if(first) first.click(); }
});
byId('ex-uses-clear').onclick = () => setUses(null);
byId('ex-back').onclick = showGrid;
byId('ex-open').onclick = () => {
  if(current < 0) return;
  editor.setValue(EXAMPLES[current].code);
  closeOverlay('ex-overlay');
  editor.focus();
};
byId('exp-cmds').addEventListener('click', ev => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
  if(b?.dataset.cmd) helpNav.showCommand(b.dataset.cmd);
});
// The Examples button (overlays.ts toggles the panel): start the pictures, back to the grid, focus the search.
byId('btn-examples').addEventListener('click', () => setTimeout(() => {
  if(!byId('ex-overlay').classList.contains('open')) return;
  startThumbs();
  if(!preview.hidden) showGrid();
  search.focus();
}, 0));
