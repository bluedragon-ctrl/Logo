// ── Overlay management ────────────────────────────────────────────────────────
// Only one overlay (COMMANDS / EXAMPLES / OPTIONS) can be open at a time.
// openOverlay: toggles the target (so clicking its button again closes it),
//              and removes 'open' from all others.
// closeOverlay: removes 'open' unconditionally from the named overlay.
export const OVERLAYS = ['ref-overlay', 'ex-overlay', 'opt-overlay'];
export function openOverlay(id){
  OVERLAYS.forEach(function(oid){
    document.getElementById(oid).classList[oid===id?'toggle':'remove']('open');
  });
}
export function closeOverlay(id){ document.getElementById(id).classList.remove('open'); }

document.getElementById('btn-ref').onclick      = ()=>openOverlay('ref-overlay');
document.getElementById('btn-ref-close').onclick = ()=>closeOverlay('ref-overlay');
document.getElementById('btn-examples').onclick  = ()=>openOverlay('ex-overlay');
document.getElementById('btn-ex-close').onclick  = ()=>closeOverlay('ex-overlay');
