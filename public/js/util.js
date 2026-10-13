// ---------- small helpers shared by every module ----------
export const z = n => String(n).padStart(2, '0');
export const fmt = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const today = () => fmt(new Date());
export const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d); };
export const shiftDate = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return fmt(d); };
export const lastNDays = n => Array.from({ length: n }, (_, i) => daysAgo(n - 1 - i));
export const nowTime = () => { const d = new Date(); return `${z(d.getHours())}:${z(d.getMinutes())}`; };
export const toTime = m => `${z(Math.floor(m / 60) % 24)}:${z(Math.floor(m % 60))}`;
export const toMin = t => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const uuid = () => crypto.randomUUID();
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = v => Number(v) || 0;
export const sum = (rows, k) => round(rows.reduce((a, r) => a + num(r[k]), 0));
export const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
export const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
export const thousands = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const shortDate = s => { const [, m, d] = s.split('-'); return `${Number(d)}.${Number(m)}.`; };
export const uniq = arr => [...new Set(arr.filter(Boolean))].sort();
export const byDateDesc = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''));
export const ratio = (a, b) => (b ? a / b : null);
export const grams = v => (v === '' || v == null ? '' : `${v} g`);
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function sleepHours(bed, wake) {
  if (!bed || !wake) return 0;
  const [bh, bm] = bed.split(':').map(Number), [wh, wm] = wake.split(':').map(Number);
  let m = (wh * 60 + wm) - (bh * 60 + bm);
  if (m <= 0) m += 1440;
  return round(m / 60, 2);
}

// reps are a single number or a range like "8-12"
export function parseReps(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/);
  if (!m) return null;
  const lo = Number(m[1]), hi = m[2] ? Number(m[2]) : lo;
  if (lo < 1 || hi < lo) return null;
  return hi === lo ? String(lo) : `${lo}-${hi}`;
}

export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const parseDay = d => new Date(d + 'T00:00');
export function dayLabel(d) {
  if (d === today()) return 'Today';
  if (d === daysAgo(1)) return 'Yesterday';
  const dt = parseDay(d);
  return `${WD[dt.getDay()]}, ${dt.getDate()} ${MO[dt.getMonth()]}`;
}

// Supabase errors in plain language
export const OFFLINE = 'No connection. Check your internet and try again.';
export function friendly(err) {
  const m = String(err?.message || err || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong username or password.';
  if (m.includes('already registered') || m.includes('already been registered') || err?.code === 'user_already_exists') return 'That username is taken. Pick another one, or log in.';
  if (m.includes('password should be at least') || err?.code === 'weak_password') return 'Use at least 8 characters.';
  if (m.includes('rate limit')) return 'Too many tries. Wait a few minutes and try again.';
  if (m.includes('email not confirmed')) return 'This account isn\'t confirmed. Turn off "Confirm email" in Supabase.';
  if (err?.code === 'email_address_invalid' || m.includes('email address') && m.includes('invalid')) return 'Supabase rejected the internal address for this username. Set usernameDomain in config.js to a domain you own.';
  if (m.includes('different from the old password') || err?.code === 'same_password') return 'Choose a password different from your current one.';
  if (!navigator.onLine || m.includes('failed to fetch') || m.includes('network') || m.includes('load failed') || err?.name === 'AuthRetryableFetchError') return OFFLINE;
  return err?.message || 'Something went wrong. Try again.';
}
