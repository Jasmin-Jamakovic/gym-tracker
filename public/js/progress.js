// Per-set reps and weights, and progressive overload.
// An exercise stores reps and weight as one value for every set ("8") or one per set ("8,10,12,8").
// After a finished workout every set's weight goes up by the exercise's increment.
import { parseReps } from './util.js';

// "80, 80", "80/80", "80 80" and "80kg" all work; "8 - 12" stays one range
const split = v => String(v ?? '').replace(/kg/gi, ' ').replace(/\s*[-–—]\s*/g, '-').split(/[,;/\s]+/).filter(Boolean);
const kgText = n => String(Math.round(n * 100) / 100);
// "80,80,80" -> "80": one value when every set is the same
const join = list => (list.every(x => x === list[0]) ? list[0] : list.join(','));

// the user's text, checked against the number of sets; returns { value } or { error }
export function parseRepList(v, sets) {
  const parts = split(v).map(parseReps);
  if (!parts.length || parts.includes(null)) return { error: 'Reps must be a number like 8, a range like 8-12, or one per set like 8, 10, 12, 8.' };
  if (parts.length !== 1 && parts.length !== sets) return { error: `Reps lists ${parts.length} sets but the exercise has ${sets}. Give one value, or one per set.` };
  return { value: join(parts) };
}
export function parseWeightList(v, sets) {
  const parts = split(v);
  if (!parts.length) return { value: '' };   // no weight: bodyweight, or not tracked
  if (!parts.every(x => /^\d{1,4}(\.\d{1,2})?$/.test(x))) return { error: 'Weight must be kilos like 80 or 82.5 (use a dot for decimals), or one per set like 80, 80, 80, 90.' };
  if (parts.length !== 1 && parts.length !== sets) return { error: `Weight lists ${parts.length} sets but the exercise has ${sets}. Give one value, or one per set.` };
  return { value: join(parts.map(x => kgText(Number(x)))) };
}
export function parseIncrement(v) {
  if (v === '' || v == null) return { value: 0 };
  const n = Number(String(v).replace(/kg/i, '').trim());
  if (!(n >= 0 && n <= 100)) return { error: 'Increase must be kilos from 0 to 100 (0 keeps the weight the same).' };
  return { value: Math.round(n * 100) / 100 };
}

// [{ reps: '8', kg: 80 | null }] for every set
export function setsOf(e) {
  const n = Number(e.sets) || 0, reps = split(e.reps), kg = split(e.weight);
  return Array.from({ length: n }, (_, i) => ({
    reps: reps.length > 1 ? reps[i] : reps[0] || '',
    kg: kg.length ? Number(kg.length > 1 ? kg[i] : kg[0]) : null,
  }));
}
export const hasWeight = e => split(e.weight).length > 0;

// the weight for the next workout: every set plus the increment
export const nextWeight = e => (hasWeight(e) && Number(e.increment) > 0 ? join(split(e.weight).map(x => kgText(Number(x) + Number(e.increment)))) : e.weight || '');

// kg × reps over every set (the low end of a range)
export const volume = exercises => exercises.reduce((a, e) => a + setsOf(e).reduce((b, s) => b + (s.kg || 0) * parseInt(s.reps, 10), 0), 0);

// consecutive sets with the same weight share a line: "80 kg × 8, 10, 12" then "90 kg × 8"
export function setGroups(e) {
  const out = [];
  setsOf(e).forEach(s => {
    const last = out[out.length - 1];
    if (last && last.kg === s.kg) last.reps.push(s.reps); else out.push({ kg: s.kg, reps: [s.reps] });
  });
  return out.map(({ kg, reps }) => {
    const same = reps.every(r => r === reps[0]);
    const r = same && reps.length > 1 ? `${reps.length} × ${reps[0]}` : reps.join(', ');
    return kg == null ? (same ? `${reps.length} × ${reps[0]}` : `${r} reps`) : same && reps.length > 1 ? `${r} · ${fmtKg(kg)}` : `${fmtKg(kg)} × ${r}`;
  });
}
export const fmtKg = n => `${kgText(n)} kg`;
