import { COLOR_NAMES } from '../interpreter/commands.ts';
import { REFERENCE } from '../reference.ts';
import { byId, escHtml } from '../util.ts';
import { tryInDirect } from './direct.ts';

// ── Commands panel ────────────────────────────────────────────────────────────
// Built from REFERENCE (src/reference.ts): one table, so the columns line up
// across sections, plus the colour swatches (from the interpreter's own colour
// table). The search box filters rows by syntax or description. "Try" puts the
// example line into direct mode, ready to run with Enter.

// Colour names, with aliases that share a colour folded together: GRAY / GREY.
function colourEntries(): { names: string[]; rgb: [number, number, number] }[] {
  const out: { names: string[]; rgb: [number, number, number] }[] = [];
  for(const [name, rgb] of Object.entries(COLOR_NAMES)){
    const same = out.find(e => e.rgb.join() === rgb.join());
    if(same) same.names.push(name); else out.push({ names: [name], rgb });
  }
  return out;
}

(function buildReference(){
  const body = byId('ref-body');
  let html = '<table class="ref-table">';
  REFERENCE.forEach(sec => {
    html += '<tbody class="ref-sec"><tr class="ref-head"><th colspan="3">' + escHtml(sec.title) + '</th></tr>';
    sec.entries.forEach(e => {
      html += '<tr class="ref-row" data-search="' + escHtml((e.syntax + ' ' + e.desc).toLowerCase()) + '">'
            + '<td class="ref-syntax">' + escHtml(e.syntax) + '</td>'
            + '<td class="ref-desc">' + escHtml(e.desc) + '</td>'
            + '<td class="ref-try">' + (e.try ? '<button type="button" data-try="' + escHtml(e.try) + '" title="' + escHtml(e.try) + '">Try</button>' : '') + '</td></tr>';
    });
    html += '</tbody>';
  });
  html += '</table><div class="ref-colours" id="ref-colours"><div class="ref-colours-head">Colours <span>for SETCOLOR name</span></div><div class="ref-swatches">';
  colourEntries().forEach(c => {
    const label = c.names.join(' / ');
    html += '<button type="button" class="ref-swatch" data-try="SETCOLOR ' + c.names[0] + '" data-search="' + label.toLowerCase() + ' colour color setcolor" title="SETCOLOR ' + c.names[0] + '">'
          + '<span class="csw" style="background:rgb(' + c.rgb.join(',') + ')"></span>' + label + '</button>';
  });
  html += '</div></div><div class="ref-none" id="ref-none" hidden>No command matches.</div>';
  body.innerHTML = html;

  body.addEventListener('click', ev => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-try]');
    if(btn?.dataset.try) tryInDirect(btn.dataset.try);
  });

  const search = byId<HTMLInputElement>('ref-search');
  const filter = () => {
    const q = search.value.trim().toLowerCase();
    let any = false;
    body.querySelectorAll<HTMLElement>('.ref-sec').forEach(sec => {
      let shown = 0;
      sec.querySelectorAll<HTMLElement>('.ref-row').forEach(row => {
        const hit = !q || (row.dataset.search ?? '').includes(q);
        row.hidden = !hit; if(hit) shown++;
      });
      sec.hidden = shown === 0; if(shown) any = true;
    });
    let swatches = 0;
    body.querySelectorAll<HTMLElement>('.ref-swatch').forEach(sw => {
      const hit = !q || (sw.dataset.search ?? '').includes(q);
      sw.hidden = !hit; if(hit) swatches++;
    });
    byId('ref-colours').hidden = swatches === 0;
    byId('ref-none').hidden = any || swatches > 0;
  };
  search.addEventListener('input', filter);
  search.addEventListener('keydown', e => { if(e.key === 'Escape' && search.value){ e.stopPropagation(); search.value = ''; filter(); } });
  // Opening the panel puts the caret in the search box (after overlays.ts has toggled it).
  byId('btn-ref').addEventListener('click', () => setTimeout(() => {
    if(byId('ref-overlay').classList.contains('open')) search.focus();
  }, 0));
})();
