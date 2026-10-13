// Shared UI pieces: icons, headers, stat cards, modal and toast.
export const C = { blue: '#4f8cff', orange: '#ff9f43', green: '#35c47c', purple: '#a77bff' };
export const ICONS = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/>',
  plan: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  workouts: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  calories: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  supplements: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  sleep: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  settings: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
};
export const icon = k => `<svg class="ic" viewBox="0 0 24 24">${ICONS[k]}</svg>`;
export const ICON_EDIT = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
export const ICON_DEL = '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';
export const ICON_UP = '<svg viewBox="0 0 24 24"><path d="m18 15-6-6-6 6"/></svg>';
export const EGG = '<path d="M12 22c6.23-.05 7.87-5.57 7.5-10-.36-4.34-3.95-9.96-7.5-10-3.55.04-7.14 5.66-7.5 10-.37 4.43 1.27 9.95 7.5 10z"/>';
export const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';

export function secHead(title, sub, buttons = '') {
  return `<div class="sec-head"><div><h2>${title}</h2>${sub ? `<div class="muted">${sub}</div>` : ''}</div><div class="btns">${buttons}</div></div>`;
}
export const addBtn = (sec, label) => `<button class="primary" data-act="add" data-sec="${sec}">${label}</button>`;

export function statCard(label, big, sub, color, ratio) {
  const bar = ratio == null ? '' : `<div class="bar"><div style="width:${Math.min(100, Math.round(ratio * 100))}%"></div></div>`;
  return `<div class="stat" style="--c:${color}"><div class="label">${label}</div><div class="big">${big}</div><div class="sub">${sub}</div>${bar}</div>`;
}

export function ring(frac, text) {
  const c = 2 * Math.PI * 24, p = Math.max(0, Math.min(1, frac || 0));
  return `<div class="ring"><svg viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="24"/><circle class="fg" cx="30" cy="30" r="24" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg><b>${text}</b></div>`;
}
export function kpi(color, iconSvg, label, pill, body, pillClass = '') {
  return `<div class="kpi" style="--c:${color}">
    <div class="kpi-head"><span class="kpi-ic">${iconSvg}</span><span class="kpi-label">${label}</span>${pill ? `<span class="kpi-pill ${pillClass}">${pill}</span>` : ''}</div>
    <div class="kpi-body">${body}</div></div>`;
}

// "Show older" at the end of a history list
export const moreBtn = (kind, label = 'Show older') => `<button class="ghost show-more" data-act="more" data-kind="${kind}">${label}</button>`;

export function showModal(html) {
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
  const first = document.querySelector('#modalBody input:not([type=hidden]):not([type=file]), #modalBody select');
  if (first) first.focus();
  return document.getElementById('mform');
}
export function closeModal() { document.getElementById('modal').classList.add('hidden'); }

let toastTimer;
export function toast(msg, ms = 1800) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
