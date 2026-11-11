import { editor } from '../editor/editor.ts';
import { EXAMPLES, examplesUsing } from '../examples.ts';
import { COLOR_NAMES } from '../interpreter/commands.ts';
import { REFERENCE, entryWords, findEntry, scoreEntry } from '../reference.ts';
import type { RefEntry } from '../reference.ts';
import { byId, escHtml } from '../util.ts';
import { tryInDirect } from './direct.ts';
import { helpNav } from './help-nav.ts';
import { showOverlay } from './overlays.ts';
import { paintExample } from './thumbs.ts';

// ── Commands panel ────────────────────────────────────────────────────────────
// Built from REFERENCE (src/reference.ts): one table, so the columns line up,
// with a <tbody> per command — its row (syntax, description) and its card,
// which opens on a click (or Enter). The card is built the first time it opens:
// the longer text, other forms, examples (Try → direct mode, Insert → editor),
// "See also" links and "Used in" — the examples that use the command, found from
// the example files (examplesUsing), with small pictures.
//
// Chips above the list show one group (or the colour swatches). The search box
// ranks commands: a Logo word that matches exactly, then a word that starts with
// the query, then tags (synonyms) and descriptions. While searching, the results
// are one flat list, best first. Keys: ↓ from the search box into the list, ↑ ↓
// between rows, Enter opens / closes a card, Escape clears the search.

const USED_IN_SHOWN = 4;                   // example chips on a card before "All n examples"
const CHIP_W = 64, CHIP_H = 48;            // their pictures, CSS pixels

interface Item { e: RefEntry; sec: string; n: number; words: string[]; tbody: HTMLElement; built: boolean }

// Colour names, with aliases that share a colour folded together: GRAY / GREY.
function colourEntries(): { names: string[]; rgb: [number, number, number] }[] {
  const out: { names: string[]; rgb: [number, number, number] }[] = [];
  for(const [name, rgb] of Object.entries(COLOR_NAMES)){
    const same = out.find(e => e.rgb.join() === rgb.join());
    if(same) same.names.push(name); else out.push({ names: [name], rgb });
  }
  return out;
}

const body = byId('ref-body');
const search = byId<HTMLInputElement>('ref-search');
const chipsBox = byId('ref-chips');
const items: Item[] = [];
const codes: string[] = [];                // example programs, by data-code index
let chip = 'all';                          // 'all', a section id, or 'colours'

// ── Building ──
(function build(){
  const table = document.createElement('table');
  table.className = 'ref-table';
  REFERENCE.forEach(sec => {
    const head = document.createElement('tbody');
    head.className = 'ref-head'; head.dataset.sec = sec.id;
    head.innerHTML = '<tr><th colspan="3">' + escHtml(sec.title) + '</th></tr>';
    table.appendChild(head);
    sec.entries.forEach(e => {
      const tbody = document.createElement('tbody');
      tbody.className = 'ref-cmd'; tbody.dataset.sec = sec.id;
      tbody.innerHTML = '<tr class="ref-row" tabindex="0" aria-expanded="false">'
        + '<td class="ref-syntax">' + escHtml(e.syntax) + '</td>'
        + '<td class="ref-desc">' + escHtml(e.desc) + '</td>'
        + '<td class="ref-chev" aria-hidden="true">›</td></tr>'
        + '<tr class="ref-detail" hidden><td colspan="3"><div class="ref-card"></div></td></tr>';
      table.appendChild(tbody);
      items.push({ e, sec: sec.id, n: items.length, words: entryWords(e), tbody, built: false });
    });
  });
  body.appendChild(table);

  let html = '<div class="ref-colours" id="ref-colours"><div class="ref-colours-head">Colours <span>for SETCOLOR name and SETBG name</span></div><div class="ref-swatches">';
  colourEntries().forEach(c => {
    const label = c.names.join(' / ');
    html += '<button type="button" class="ref-swatch" data-try="SETCOLOR ' + c.names[0] + '" data-search="' + label.toLowerCase() + ' colour color setcolor" title="SETCOLOR ' + c.names[0] + '">'
          + '<span class="csw" style="background:rgb(' + c.rgb.join(',') + ')"></span>' + label + '</button>';
  });
  html += '</div></div><div class="ref-none" id="ref-none" hidden>No command matches. Try another word, or All.</div>';
  body.insertAdjacentHTML('beforeend', html);

  const chips: [string, string][] = [['all', 'All'], ...REFERENCE.map(s => [s.id, s.title] as [string, string]), ['colours', 'Colours']];
  chipsBox.innerHTML = chips.map(([id, title]) =>
    '<button type="button" class="chip" data-chip="' + id + '" aria-pressed="' + (id === chip) + '">' + escHtml(title) + '</button>').join('');
})();

// The card of an entry: built on first open.
function buildCard(it: Item): void {
  const e = it.e;
  let h = '';
  if(e.more) h += '<p class="ref-more">' + escHtml(e.more) + '</p>';
  if(e.forms?.length) h += '<div class="ref-label">Also written</div><div class="ref-forms">'
    + e.forms.map(f => '<code>' + escHtml(f) + '</code>').join('') + '</div>';
  if(e.examples?.length){
    h += '<div class="ref-label">' + (e.examples.length > 1 ? 'Examples' : 'Example') + '</div>';
    e.examples.forEach(code => {
      const k = codes.push(code) - 1;
      const oneLine = !code.includes('\n');
      h += '<div class="ref-ex"><pre>' + escHtml(code) + '</pre><span class="ref-ex-btns">'
         + (oneLine ? '<button type="button" data-try="' + escHtml(code) + '" title="Put it in direct mode, ready to run with Enter">Try</button>' : '')
         + '<button type="button" data-insert="' + k + '" title="Insert it into the program at the caret">Insert</button></span></div>';
    });
  }
  if(e.see?.length) h += '<div class="ref-see"><span class="ref-label">See also</span> '
    + e.see.map(w => '<button type="button" class="ref-link" data-see="' + escHtml(w) + '">' + escHtml(w) + '</button>').join(' ') + '</div>';
  const used = examplesUsing(it.words);
  if(used.length){
    h += '<div class="ref-label">Used in ' + (used.length === 1 ? 'an example' : used.length + ' examples') + '</div><div class="ref-used">'
       + used.slice(0, USED_IN_SHOWN).map(n => '<button type="button" class="ref-ex-chip" data-ex="' + n + '" title="' + escHtml(EXAMPLES[n].desc) + '">'
         + '<canvas class="ex-thumb" width="' + CHIP_W + '" height="' + CHIP_H + '"></canvas><span>' + escHtml(EXAMPLES[n].title) + '</span></button>').join('')
       + (used.length > USED_IN_SHOWN ? '<button type="button" class="ref-link ref-more-ex" data-uses="' + it.n + '">All ' + used.length + ' examples →</button>' : '')
       + '</div>';
  }
  const card = it.tbody.querySelector<HTMLElement>('.ref-card');
  if(!card) return;
  card.innerHTML = h;
  card.querySelectorAll<HTMLElement>('.ref-ex-chip').forEach(b => {
    const cv = b.querySelector('canvas');
    if(cv) void paintExample(cv, Number(b.dataset.ex), CHIP_W, CHIP_H);
  });
  it.built = true;
}

function setOpen(it: Item, open: boolean): void {
  if(open && !it.built) buildCard(it);
  const row = it.tbody.querySelector<HTMLElement>('.ref-row'), detail = it.tbody.querySelector<HTMLElement>('.ref-detail');
  if(!row || !detail) return;
  row.setAttribute('aria-expanded', String(open));
  detail.hidden = !open;
  it.tbody.classList.toggle('open', open);
}
const isOpen = (it: Item) => it.tbody.classList.contains('open');

// ── Filtering: chip + search ──
function apply(): void {
  const q = search.value.trim();
  const table = body.querySelector('table');
  if(!table) return;
  const inChip = (it: Item) => chip === 'all' || chip === it.sec;
  let shown: Item[];
  if(q){
    shown = items.map(it => ({ it, s: inChip(it) ? scoreEntry(it.e, q) : 0 })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.it.n - b.it.n).map(x => x.it);
  } else shown = chip === 'colours' ? [] : items.filter(inChip);
  // Re-order: section heads + commands in their order, or the ranked flat list.
  const showSet = new Set(shown);
  if(q) shown.forEach(it => table.appendChild(it.tbody));
  else REFERENCE.forEach(sec => {
    const head = table.querySelector<HTMLElement>('.ref-head[data-sec="' + sec.id + '"]');
    if(head) table.appendChild(head);
    items.filter(it => it.sec === sec.id).forEach(it => table.appendChild(it.tbody));
  });
  items.forEach(it => { it.tbody.hidden = !showSet.has(it); });
  table.querySelectorAll<HTMLElement>('.ref-head').forEach(h => {
    h.hidden = !!q || !items.some(it => it.sec === h.dataset.sec && showSet.has(it));
  });
  // Colour swatches: in All and Colours.
  let swatches = 0;
  const lq = q.toLowerCase();
  body.querySelectorAll<HTMLElement>('.ref-swatch').forEach(sw => {
    const hit = (chip === 'all' || chip === 'colours') && (!lq || lq.split(/\s+/).every(w => (sw.dataset.search ?? '').includes(w)));
    sw.hidden = !hit; if(hit) swatches++;
  });
  byId('ref-colours').hidden = swatches === 0;
  byId('ref-none').hidden = shown.length > 0 || swatches > 0;
}

function setChip(id: string): void {
  chip = id;
  chipsBox.querySelectorAll<HTMLElement>('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.chip === id)));
  apply();
  body.scrollTop = 0;
}

const visibleRows = () => [...body.querySelectorAll<HTMLElement>('.ref-cmd:not([hidden]) .ref-row')];
const itemOf = (el: Element) => items.find(it => it.tbody === el.closest('.ref-cmd'));

// showCommand(word): open the panel at a command's card (search for the word if no command has it).
function showCommand(word: string): void {
  showOverlay('ref-overlay');
  const e = word ? findEntry(word.replace(/^"/, '')) : undefined;
  const it = e && items.find(x => x.e === e);
  search.value = it ? '' : word.replace(/^[:"]/, '');
  setChip('all');
  if(!it){ search.focus(); return; }
  setOpen(it, true);
  const row = it.tbody.querySelector<HTMLElement>('.ref-row');
  row?.scrollIntoView({ block: 'start' });
  row?.focus({ preventScroll: true });
}
helpNav.showCommand = showCommand;
editor.onHelp(word => showCommand(word));

// ── Events ──
chipsBox.addEventListener('click', ev => {
  const c = (ev.target as HTMLElement).closest<HTMLElement>('[data-chip]');
  if(c?.dataset.chip) setChip(c.dataset.chip);
});

body.addEventListener('click', ev => {
  const t = ev.target as HTMLElement;
  const btn = t.closest<HTMLElement>('button');
  if(btn){
    const d = btn.dataset;
    if(d.try) tryInDirect(d.try);
    else if(d.insert){ editor.insert(codes[Number(d.insert)]); editor.focus(); }
    else if(d.see) showCommand(d.see);
    else if(d.ex) helpNav.showExample(Number(d.ex));
    else if(d.uses){ const it = items[Number(d.uses)]; helpNav.showExamplesUsing(it.words, it.words[0] ?? it.e.syntax); }
    return;
  }
  const row = t.closest('.ref-row');
  const it = row && itemOf(row);
  if(it) setOpen(it, !isOpen(it));
});

body.addEventListener('keydown', ev => {
  const row = (ev.target as HTMLElement).closest<HTMLElement>('.ref-row');
  if(!row || ev.target !== row) return;
  const rows = visibleRows(), k = rows.indexOf(row);
  if(ev.key === 'Enter' || ev.key === ' '){
    ev.preventDefault();
    const it = itemOf(row); if(it) setOpen(it, !isOpen(it));
  } else if(ev.key === 'ArrowDown' || ev.key === 'ArrowUp'){
    ev.preventDefault();
    if(ev.key === 'ArrowUp' && k === 0){ search.focus(); return; }
    rows[Math.max(0, Math.min(rows.length - 1, k + (ev.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  }
});

search.addEventListener('input', apply);
search.addEventListener('keydown', e => {
  if(e.key === 'Escape' && search.value){ e.stopPropagation(); search.value = ''; apply(); }
  else if(e.key === 'ArrowDown'){ e.preventDefault(); visibleRows()[0]?.focus(); }
  else if(e.key === 'Enter'){
    // Enter: open the best match.
    const first = visibleRows()[0], it = first && itemOf(first);
    if(it){ setOpen(it, true); first.focus(); }
  }
});
// Opening the panel puts the caret in the search box (after overlays.ts has toggled it).
byId('btn-ref').addEventListener('click', () => setTimeout(() => {
  if(byId('ref-overlay').classList.contains('open')) search.focus();
}, 0));
apply();
