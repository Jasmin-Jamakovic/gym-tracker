// The look of the app: 'classic' (dark) or 'cartoon'. Saved per device; index.html applies it before the first paint.
const KEY = 'gym_theme';
export const THEMES = [['classic', 'Classic'], ['cartoon', 'Cartoon']];

export function getTheme() {
  try { return localStorage.getItem(KEY) === 'cartoon' ? 'cartoon' : 'classic'; } catch (e) { return 'classic'; }
}
export function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch (e) { /* private mode: the theme just won't stick */ }
}
