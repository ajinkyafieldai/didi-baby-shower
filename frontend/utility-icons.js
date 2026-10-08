const paths = {
  names: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  quiz: '<path d="M8 3h8v6a4 4 0 0 1-8 0zM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v7m-4 1h8"/>',
  wishes: '<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0ZM7 10h10M7 14h6"/>',
  moments: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m4 11v-3a6 6 0 0 0-4-5"/>',
  camera: '<rect x="2" y="6" width="20" height="15" rx="3"/><path d="m7 6 2-3h6l2 3"/><circle cx="12" cy="13" r="4"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>'
};
export function applyUtilityIcons(root = document) {
  for (const [selector, kind] of [['[data-game="names"] span:first-child','names'],['[data-game="didi"] span:first-child','quiz'],['#blessing-launch span:first-child','wishes'],['.photo-button span:first-child','camera']]) {
    const target = root.querySelector(selector); if (target) target.innerHTML = svg(kind);
  }
  for (const [view, kind] of [['wall','wishes'],['mosaic','moments'],['map','people']]) {
    const target = root.querySelector(`[data-hub-tab="${view}"]`);
    if (target) { const label = target.textContent.replace(/^[^\p{L}]+/u, '').trim(); target.innerHTML = svg(kind); target.append(document.createTextNode(` ${label}`)); }
  }
  const full = root.querySelector('#video-fullscreen');
  if (full) { for (const node of [...full.childNodes]) if (node.nodeType === 3) node.remove(); full.insertAdjacentHTML('afterbegin', svg('fullscreen')); }
}
function svg(kind) { return `<svg class="utility-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind]}</svg>`; }
