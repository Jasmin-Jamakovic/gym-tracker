// The in-memory copy of the signed-in account's plan and history.
// Views read S; actions change S first, then write the change to Supabase (db.js).
import { saveCache } from './cache.js';
import { sum, sleepHours, today } from './util.js';
import { toast } from './ui/common.js';

export const HISTORY = ['sessions', 'calories', 'supplements', 'sleep'];

export const emptyState = () => ({
  loaded: false,          // false until the first load from Supabase (or the cache) has arrived
  plan: [], diet: [], regulars: [], sleepPlan: { bed: '23:00', wake: '07:00' },
  sessions: [], calories: [], supplements: [], sleep: [], fees: [],
  since: {},              // per history list: the oldest date loaded so far
  more: {},               // per history list: true when older rows exist on the server
});

export const S = emptyState();
export const account = { user: null };

export function setState(next) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, emptyState(), next);
}

let renderFn = () => {};
export const setRenderer = fn => { renderFn = fn; };
export const render = () => renderFn();

// bumped on every local change, so a load that was already running doesn't overwrite it
export const meta = { version: 0 };

// after every change: save the local copy, redraw, and confirm with a toast
export function commit(msg) {
  meta.version++;
  saveCache(account.user?.id, S);
  render();
  if (msg) toast(msg);
}

// daily targets come straight from the plan
export function goals() {
  return { calGoal: sum(S.diet, 'calories'), proteinGoal: sum(S.diet, 'protein'), sleepGoal: sleepHours(S.sleepPlan.bed, S.sleepPlan.wake) };
}

// ---------- derived from the workout plan ----------
export const SUP_COLORS = ['#35c47c', '#4f8cff', '#ff9f43', '#a77bff', '#ff6b8b', '#2fc6c6', '#f5c542'];
export const isRestDay = d => !d.exercises.length;
export const trainingDays = () => S.plan.filter(d => !isRestDay(d));
export const daySets = d => d.exercises.reduce((a, e) => a + Number(e.sets || 0), 0);
export const dayColor = id => { const i = trainingDays().findIndex(d => d.id === id); return i < 0 ? '#8b93a7' : SUP_COLORS[(i + 1) % SUP_COLORS.length]; };
export const doneOn = (dayId, date) => S.sessions.find(x => x.dayId === dayId && x.date === date);
export const lastDone = d => S.sessions.filter(x => x.dayId === d.id).sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
export const findDay = id => S.plan.find(d => d.id === id);
export const allExerciseNames = () => [...new Set(S.plan.flatMap(d => d.exercises.map(e => e.name)))].sort();
export const nextPosition = list => list.reduce((m, x) => Math.max(m, (x.position ?? -1) + 1), 0);

export function supColor(name) {
  const i = S.regulars.findIndex(r => r.name === name);
  if (i >= 0) return SUP_COLORS[i % SUP_COLORS.length];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUP_COLORS[h % SUP_COLORS.length];
}

export const supTaken = (name, date = today()) => S.supplements.some(x => x.date === date && x.supplement === name);

// what each page is showing right now (tabs, ranges, how far down a history list goes)
export const view = {
  planTab: 'workout', supRange: 28,
  changingWorkout: false,   // Workouts page: picking a different workout for today
  woSlide: 0,               // Workouts page on phones: which card of the swipe row is showing
  woDay: null,              // Workouts page on desktop: the day open on the right (null = up next)
  limits: { sessions: 12, calories: 30, supplements: 7, sleep: 30 },
};
export const LIMIT_STEP = { sessions: 12, calories: 30, supplements: 7, sleep: 30 };
