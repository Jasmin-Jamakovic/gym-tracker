// Every read and write to Supabase. RLS makes Postgres return only the signed-in account's rows.
// Rows are mapped to the shape the views use (the same shape as the mockup).
import { supabase } from './supabase.js';
import { send } from './outbox.js';
import { daysAgo, shiftDate } from './util.js';

const hhmm = t => (t ? String(t).slice(0, 5) : '');
const blank = v => (v == null ? '' : Number(v));            // database null -> empty form value
const nul = v => (v === '' || v == null ? null : Number(v)); // empty form value -> database null
const r1 = v => (v === '' || v == null ? null : Math.round(Number(v) * 10) / 10);

// ---------- mapping ----------
const FROM = {
  diet: m => ({ id: m.id, position: m.position, meal: m.meal, food: m.food, calories: m.calories, protein: blank(m.protein), carbs: blank(m.carbs), fat: blank(m.fat) }),
  regular: r => ({ id: r.id, position: r.position, name: r.name, dose: blank(r.dose), unit: r.unit, time: r.timing }),
  session: s => ({ id: s.id, date: s.date, dayId: s.day_id, name: s.name, performed: s.performed || [] }),
  food: c => ({ id: c.id, date: c.date, meal: c.meal, food: c.food, calories: c.calories, protein: blank(c.protein), carbs: blank(c.carbs), fat: blank(c.fat) }),
  supplement: x => ({ id: x.id, date: x.date, time: hhmm(x.time), supplement: x.supplement, dose: blank(x.dose), unit: x.unit, notes: x.notes }),
  sleep: x => ({ id: x.id, date: x.date, bed: hhmm(x.bed), wake: hhmm(x.wake), hours: Number(x.hours), notes: x.notes }),
  fee: f => ({ id: f.id, date: f.date }),
};

const TO = {
  day: d => ({ id: d.id, position: d.position, name: d.name, focus: d.focus || '' }),
  exercise: e => ({ id: e.id, day_id: e.dayId, position: e.position, name: e.name, sets: Number(e.sets), reps: String(e.reps), weight: e.weight || '', increment: Number(e.increment) || 0, rest: e.rest || '', execution: e.notes || '' }),
  diet: m => ({ id: m.id, position: m.position, meal: m.meal || 'Meal', food: m.food, calories: Math.round(Number(m.calories) || 0), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) }),
  regular: r => ({ id: r.id, position: r.position, name: r.name, dose: nul(r.dose), unit: r.unit || '', timing: r.time || '' }),
  session: s => ({ id: s.id, date: s.date, day_id: s.dayId || null, name: s.name, performed: s.performed || [] }),
  food: c => ({ id: c.id, date: c.date, meal: c.meal || 'Meal', food: c.food, calories: Math.round(Number(c.calories) || 0), protein: r1(c.protein), carbs: r1(c.carbs), fat: r1(c.fat) }),
  supplement: x => ({ id: x.id, date: x.date, time: x.time || null, supplement: x.supplement, dose: nul(x.dose), unit: x.unit || '', notes: x.notes || '' }),
  sleep: x => ({ id: x.id, date: x.date, bed: x.bed, wake: x.wake, hours: x.hours, notes: x.notes || '' }),
  fee: f => ({ id: f.id, date: f.date }),
};

const TABLE = {
  day: 'workout_days', exercise: 'exercises', diet: 'diet_plan', regular: 'regulars',
  session: 'workout_sessions', food: 'food_log', supplement: 'supplement_log', sleep: 'sleep_log', fee: 'fee_payments',
};

// history lists in the state -> table and mapper
const HIST = {
  sessions: { table: 'workout_sessions', from: FROM.session },
  calories: { table: 'food_log', from: FROM.food },
  supplements: { table: 'supplement_log', from: FROM.supplement },
  sleep: { table: 'sleep_log', from: FROM.sleep },
};

const must = res => { if (res.error) throw res.error; return res; };

function buildPlan(days, exercises) {
  return days.map(d => ({
    id: d.id, position: d.position, name: d.name, focus: d.focus,
    exercises: exercises.filter(e => e.day_id === d.id).map(e => ({
      id: e.id, dayId: e.day_id, position: e.position, name: e.name, sets: e.sets, reps: e.reps, weight: e.weight || '', increment: Number(e.increment) || 0, rest: e.rest, notes: e.execution,
    })),
  }));
}

// ---------- loading ----------
// the whole plan, plus the last 90 days of history (enough for every view)
export async function loadAll(userId) {
  const since = daysAgo(89);
  const plan = t => supabase.from(t).select('*').order('position').order('created_at');
  const hist = t => supabase.from(t).select('*').gte('date', since).order('date', { ascending: false }).range(0, 999);
  const older = t => supabase.from(t).select('id', { count: 'exact', head: true }).lt('date', since);
  const kinds = Object.keys(HIST);

  const [days, exercises, diet, regulars, sleepPlan, fees, ...rest] = (await Promise.all([
    plan('workout_days'), plan('exercises'), plan('diet_plan'), plan('regulars'),
    supabase.from('sleep_plan').select('bed, wake').maybeSingle(),
    supabase.from('fee_payments').select('id, date').order('date', { ascending: false }),   // a few a year: load them all
    ...kinds.map(k => hist(HIST[k].table)),
    ...kinds.map(k => older(HIST[k].table)),
  ])).map(must);

  // a new account gets the default 23:00 to 07:00 sleep plan
  if (!sleepPlan.data) {
    must(await supabase.from('sleep_plan').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }));
  }

  const out = {
    loaded: true,
    plan: buildPlan(days.data, exercises.data),
    diet: diet.data.map(FROM.diet),
    regulars: regulars.data.map(FROM.regular),
    fees: fees.data.map(FROM.fee),
    sleepPlan: { bed: hhmm(sleepPlan.data?.bed) || '23:00', wake: hhmm(sleepPlan.data?.wake) || '07:00' },
    since: {}, more: {},
  };
  kinds.forEach((k, i) => {
    out[k] = rest[i].data.map(HIST[k].from);
    out.since[k] = since;
    out.more[k] = rest[kinds.length + i].count > 0;
  });
  return out;
}

// the next 90 days further back for one history list
export async function loadOlder(kind, since) {
  const { table, from } = HIST[kind], start = shiftDate(since, -90);
  const [rows, older] = (await Promise.all([
    supabase.from(table).select('*').gte('date', start).lt('date', since).order('date', { ascending: false }).range(0, 999),
    supabase.from(table).select('id', { count: 'exact', head: true }).lt('date', start),
  ])).map(must);
  return { rows: rows.data.map(from), since: start, more: older.count > 0 };
}

// ---------- writing: one action = one small request, through the outbox ----------
// ids are made in the browser and writes are upserts on id, so sending twice is harmless
export function put(kind, items, onConflict) {
  const rows = (Array.isArray(items) ? items : [items]).map(TO[kind]);
  return send({ table: TABLE[kind], action: 'upsert', rows, onConflict });
}

export function del(kind, match) {
  return send({ table: TABLE[kind], action: 'delete', match: typeof match === 'string' ? { id: match } : match });
}

export const putSleepPlan = (userId, p) => send({ table: 'sleep_plan', action: 'upsert', rows: [{ user_id: userId, bed: p.bed, wake: p.wake }], onConflict: 'user_id' });

// ---------- imports (need a connection, one transaction each) ----------
export async function replaceWorkoutPlan(plan) {
  const days = plan.map(d => ({
    name: d.name, focus: d.focus || '',
    exercises: d.exercises.map(e => ({ name: e.name, sets: Number(e.sets), reps: String(e.reps), weight: e.weight || '', increment: Number(e.increment) || 0, rest: e.rest || '', execution: e.notes || '' })),
  }));
  must(await supabase.rpc('replace_workout_plan', { days }));
}

export async function replaceOtherPlan({ diet, regulars, sleepPlan }) {
  must(await supabase.rpc('replace_other_plan', {
    diet: diet ? diet.map(m => { const { id, position, ...row } = TO.diet(m); return row; }) : null,
    regs: regulars ? regulars.map(r => { const { id, position, ...row } = TO.regular(r); return row; }) : null,
    sleep: sleepPlan || null,
  }));
}

// ---------- account-wide actions ----------
const LOG_TABLES = ['workout_sessions', 'food_log', 'supplement_log', 'sleep_log', 'fee_payments'];

export async function clearLogs() {
  for (const t of LOG_TABLES) must(await supabase.from(t).delete().not('id', 'is', null));
}

export async function deleteAccount() {
  must(await supabase.rpc('delete_my_account'));
}

// every row of every table, for the backup download
export const BACKUP_TABLES = [
  ['Workout days', 'workout_days', 'position'], ['Exercises', 'exercises', 'position'], ['Diet plan', 'diet_plan', 'position'],
  ['Supplements plan', 'regulars', 'position'], ['Sleep plan', 'sleep_plan', null],
  ['Workouts', 'workout_sessions', 'date'], ['Food log', 'food_log', 'date'], ['Supplement log', 'supplement_log', 'date'], ['Sleep log', 'sleep_log', 'date'],
  ['Fee payments', 'fee_payments', 'date'],
];
export async function fetchAll(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select('*');
    if (order) q = q.order(order);
    q = q.order(table === 'sleep_plan' ? 'user_id' : 'id');   // stable pages
    const { data } = must(await q.range(from, from + 999));
    out.push(...data.map(({ user_id, ...row }) => row));
    if (data.length < 1000) return out;
  }
}
