// Everything a tap can do. The screen updates first (commit), then the change goes to Supabase (db.put / db.del).
import { S, account, view, LIMIT_STEP, commit, render, doneOn, findDay, nextPosition, supTaken, trainingDays } from './state.js';
import { byDateDesc, dayLabel, daysAgo, friendly, nowTime, OFFLINE, parseReps, sleepHours, today, uniq, uuid } from './util.js';
import { closeModal, toast } from './ui/common.js';
import { DAY_FIELDS, DIET_FIELDS, PLAN_EX_FIELDS, REG_FIELDS, SECTIONS, SLEEP_PLAN_FIELDS, openForm } from './ui/forms.js';
import { wasJustDragged } from './ui/sleepdial.js';
import { put, del, putSleepPlan, clearLogs } from './db.js';
import { applyImport, downloadBackup, downloadTemplate, ensureOnline, handleImportFile, openImport, useExamplePlan } from './import.js';
import { logout, openChangePassword, openDeleteAccount } from './auth.js';
import { setUpLater } from './views/dashboard.js';
import { showSlide } from './views/workouts.js';
import { INTAKE_FOOD, intakeOthers, intakeRow, loggedToday } from './views/calories.js';
import { fetchOlder, refresh } from './sync.js';

const whenLabel = date => (date === today() ? '' : ` on ${dayLabel(date)}`);

// ---------- check-offs ----------
function toggleSup(name, date = today()) {
  const taken = supTaken(name, date);
  if (taken) {
    S.supplements = S.supplements.filter(x => !(x.date === date && x.supplement === name));
    del('supplement', { date, supplement: name });
  } else {
    const src = S.regulars.find(x => x.name === name) || S.supplements.filter(x => x.supplement === name).sort(byDateDesc)[0] || { dose: '', unit: 'g' };
    const row = { id: uuid(), date, time: date === today() ? nowTime() : '', supplement: name, dose: src.dose, unit: src.unit, notes: '' };
    S.supplements.push(row);
    put('supplement', row);
  }
  commit(taken ? `${name} unchecked${whenLabel(date)}` : `${name} taken${whenLabel(date)}`);
}

function toggleWorkout(dayId, date = today(), replace = false) {
  const day = findDay(dayId), done = doneOn(dayId, date);
  if (!day) return;
  view.changingWorkout = false;
  view.woSlide = Math.max(0, S.plan.indexOf(day));   // after an undo, the row opens on this card
  view.woDay = day.id;                               // and the desktop list keeps it selected
  if (!done && replace) {
    const others = S.sessions.filter(x => x.date === date && x.dayId && x.dayId !== dayId);
    S.sessions = S.sessions.filter(x => !others.includes(x));
    others.forEach(x => del('session', x.id));
    if (others.length) {
      const s = { id: uuid(), date, dayId, name: day.name };
      S.sessions.push(s);
      put('session', s);
      return commit(`Changed to ${day.name}`);
    }
  }
  if (done) {
    S.sessions = S.sessions.filter(x => x !== done);
    del('session', done.id);
  } else {
    const s = { id: uuid(), date, dayId, name: day.name };
    S.sessions.push(s);
    put('session', s);
  }
  commit(done ? `${day.name} unmarked${whenLabel(date)}` : `${day.name} done${whenLabel(date)}`);
}

function toggleFee(date) {
  const paid = S.fees.find(f => f.date === date);
  if (paid) {
    S.fees = S.fees.filter(f => f !== paid);
    del('fee', paid.id);
  } else {
    const row = { id: uuid(), date };
    S.fees.push(row);
    put('fee', row, 'user_id,date');
  }
  commit(paid ? `Fee payment removed from ${dayLabel(date)}` : `Monthly fee marked paid ${date === today() ? 'today' : `on ${dayLabel(date)}`}`);
}

// the Calories sliders set today's total; one "Daily intake" row holds whatever other logs don't cover
function setIntake(key, total) {
  let row = intakeRow();
  if (!row) {
    row = { id: uuid(), date: today(), meal: 'Day', food: INTAKE_FOOD, calories: 0, protein: '', carbs: '', fat: '' };
    S.calories.push(row);
  }
  row[key] = Math.max(0, total - intakeOthers(key));
  put('food', row);
  commit(key === 'calories' ? `Calories set to ${total.toLocaleString()} kcal` : `Protein set to ${total} g`);
}

// one night per date; a new night upserts on the date so two devices can't double it
function saveNight(v, existing) {
  const row = { ...v, hours: sleepHours(v.bed, v.wake) };
  const clash = S.sleep.find(x => x.date === row.date && x !== existing);
  if (clash) return `A night is already logged for ${dayLabel(row.date)}. Edit that one instead.`;
  if (existing) {
    Object.assign(existing, row);
    put('sleep', existing);
  } else {
    const night = { id: uuid(), notes: '', ...row };
    S.sleep.push(night);
    put('sleep', night, 'user_id,date');
  }
  commit(existing ? 'Saved' : 'Sleep logged');
}

// ---------- the three history sections ----------
function addEntry(sec, v) {
  if (sec === 'sleep') return saveNight(v);
  const row = { id: uuid(), ...v };
  S[sec].push(row);
  put(SECTIONS[sec].kind, row);
  commit('Added');
}
function editEntry(sec, row, v) {
  if (sec === 'sleep') return saveNight(v, row);
  Object.assign(row, v);
  put(SECTIONS[sec].kind, row);
  commit('Saved');
}

// ---------- plan editing ----------
function exerciseValues(v) {
  const reps = parseReps(v.reps);
  if (!reps) return 'Reps must be a number like 8 or a range like 8-12.';
  if (!Number.isInteger(v.sets) || v.sets < 1 || v.sets > 20) return 'Sets must be a whole number from 1 to 20.';
  return { ...v, reps };
}
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// "Show older": first show more of what's loaded, then fetch the next 90 days
async function showMore(kind, btn) {
  const loaded = kind === 'supplements' ? uniq(S.supplements.map(x => x.date)).length : S[kind].length;
  if (loaded <= view.limits[kind] && S.more[kind]) {
    if (!navigator.onLine) return toast(OFFLINE, 3000);
    btn.disabled = true; btn.textContent = 'Loading...';
    try { await fetchOlder(kind); } catch (e) { toast(friendly(e), 3000); render(); return; }
  }
  view.limits[kind] += LIMIT_STEP[kind];
  render();
}

export function installActions({ switchTab }) {
  document.addEventListener('click', e => {
    if (wasJustDragged()) return;  // releasing a dial drag over the backdrop must not close the form
    if (e.target.id === 'modal') return closeModal();
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const { act, sec, id, name } = el.dataset, day = findDay(el.dataset.day), i = Number(el.dataset.i);
    switch (act) {
      case 'tab': switchTab(el.dataset.tab); break;
      case 'close': closeModal(); break;
      case 'retry': refresh(); break;

      case 'add': {
        const c = SECTIONS[sec];
        const defaults = { date: today(), time: sec === 'supplements' ? nowTime() : '', meal: 'Snack', unit: 'g' };
        openForm('Add ' + c.title, c.fields, defaults, v => addEntry(sec, v));
        break;
      }
      case 'edit': {
        const c = SECTIONS[sec], row = S[sec].find(r => r.id === id);
        if (row) openForm('Edit ' + c.title, c.fields, row, v => editEntry(sec, row, v));
        break;
      }
      case 'del':
        if (!confirm('Delete this entry?')) return;
        S[sec] = S[sec].filter(r => r.id !== id);
        del(SECTIONS[sec].kind, id);
        commit('Deleted');
        break;
      case 'more': showMore(el.dataset.kind, el); break;

      case 'sup-toggle': toggleSup(name); break;
      case 'sup-cell': toggleSup(name, el.dataset.date); break;
      case 'sup-range': view.supRange = Number(el.dataset.n); render(); break;

      case 'sleep-check': {
        const { bed, wake } = S.sleepPlan;
        if (S.sleep.some(x => x.date === today())) return;
        saveNight({ date: today(), bed, wake, notes: '' });
        break;
      }
      case 'sleep-other':
        openForm('Last night', SECTIONS.sleep.fields, { date: today(), bed: S.sleepPlan.bed, wake: S.sleepPlan.wake }, v => saveNight(v));
        break;
      case 'sleep-undo': {
        const night = S.sleep.find(x => x.date === today());
        if (!night) return;
        S.sleep = S.sleep.filter(x => x !== night);
        del('sleep', night.id);
        commit('Sleep entry removed');
        break;
      }

      case 'plan-tab': view.planTab = el.dataset.k; render(); break;
      case 'plan-add-day':
        openForm('Add day', DAY_FIELDS, {}, v => {
          const d = { id: uuid(), position: nextPosition(S.plan), ...v, exercises: [] };
          S.plan.push(d);
          put('day', d);
          commit('Day added');
        });
        break;
      case 'plan-rename':
        openForm('Edit day', DAY_FIELDS, day, v => { Object.assign(day, v); put('day', day); commit('Saved'); });
        break;
      case 'plan-del-day':
        if (!confirm(`Delete "${day.name}" from your plan? Finished workouts stay in your history.`)) return;
        S.plan = S.plan.filter(d => d !== day);
        S.sessions.forEach(x => { if (x.dayId === day.id) x.dayId = null; });
        del('day', day.id);
        commit('Day deleted');
        break;
      case 'plan-add-ex':
        openForm(`Add exercise to ${day.name}`, PLAN_EX_FIELDS, { sets: 3, reps: '8-12', rest: '90s' }, v => {
          const ok = exerciseValues(v);
          if (typeof ok === 'string') return ok;
          const ex = { id: uuid(), dayId: day.id, position: nextPosition(day.exercises), ...ok };
          day.exercises.push(ex);
          put('exercise', ex);
          commit('Exercise added');
        });
        break;
      case 'plan-edit-ex': {
        const ex = day.exercises[i];
        openForm('Edit exercise', PLAN_EX_FIELDS, ex, v => {
          const ok = exerciseValues(v);
          if (typeof ok === 'string') return ok;
          Object.assign(ex, ok);
          put('exercise', ex);
          commit('Saved');
        });
        break;
      }
      case 'plan-del-ex': {
        const [ex] = day.exercises.splice(i, 1);
        del('exercise', ex.id);
        commit('Exercise removed');
        break;
      }
      case 'plan-up':
        [day.exercises[i - 1], day.exercises[i]] = [day.exercises[i], day.exercises[i - 1]];
        day.exercises.forEach((ex, n) => { ex.position = n; });
        put('exercise', day.exercises);
        commit();
        break;

      case 'wo-toggle': toggleWorkout(el.dataset.day, today(), view.changingWorkout); break;
      case 'wo-change': {
        const current = S.plan.findIndex(d => doneOn(d.id, today()));
        view.changingWorkout = true;
        view.woSlide = Math.max(0, current);
        view.woDay = S.plan[current]?.id ?? null;
        render();
        break;
      }
      case 'swipe-to': showSlide(Number(el.dataset.i)); break;
      case 'wo-pick': view.woDay = el.dataset.day; render(); break;
      case 'wo-change-cancel': view.changingWorkout = false; render(); break;
      case 'fee-toggle': toggleFee(el.dataset.date); break;
      case 'fee-add':
        openForm('Monthly fee paid', [{ key: 'date', label: 'Date you paid', type: 'date', required: true }], { date: today() }, v => {
          if (v.date > today()) return "That date hasn't happened yet.";
          if (S.fees.some(f => f.date === v.date)) return `The fee is already marked on ${dayLabel(v.date)}.`;
          toggleFee(v.date);
        });
        break;
      case 'wo-past': {
        const names = trainingDays().map(d => d.name);
        if (!names.length) return toast('Add a workout plan first');
        openForm('Log a past workout', [{ key: 'date', label: 'Date', type: 'date', required: true }, { key: 'day', label: 'Workout', type: 'select', options: names }],
          { date: daysAgo(1) }, v => {
            const d = trainingDays().find(x => x.name === v.day);
            if (doneOn(d.id, v.date)) return `${d.name} is already marked on ${dayLabel(v.date)}.`;
            toggleWorkout(d.id, v.date);
          });
        break;
      }

      case 'diet-add':
        openForm('Add planned meal', DIET_FIELDS(), { meal: 'Breakfast' }, v => {
          const m = { id: uuid(), position: nextPosition(S.diet), ...v };
          S.diet.push(m);
          put('diet', m);
          commit('Meal added');
        });
        break;
      case 'diet-edit': {
        const m = S.diet.find(x => x.id === id);
        openForm('Edit planned meal', DIET_FIELDS(), m, v => { Object.assign(m, v); put('diet', m); commit('Saved'); });
        break;
      }
      case 'diet-del':
        S.diet = S.diet.filter(x => x.id !== id);
        del('diet', id);
        commit('Meal removed');
        break;
      case 'diet-log': {
        const m = S.diet.find(x => x.id === id), logged = loggedToday(m);
        if (logged) {
          S.calories = S.calories.filter(x => x !== logged);
          del('food', logged.id);
          commit(`${m.food} unlogged`);
        } else {
          const row = { id: uuid(), date: today(), meal: m.meal, food: m.food, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat };
          S.calories.push(row);
          put('food', row);
          commit(`${m.food} logged`);
        }
        break;
      }
      case 'sleep-plan-edit':
        openForm('Edit sleep schedule', SLEEP_PLAN_FIELDS, S.sleepPlan, v => {
          S.sleepPlan = { bed: v.bed, wake: v.wake };
          putSleepPlan(account.user.id, S.sleepPlan);
          commit('Saved');
        });
        break;

      case 'reg-add':
        openForm('Add regular supplement', REG_FIELDS, { unit: 'g', time: 'Morning' }, v => {
          if (S.regulars.some(r => sameName(r.name, v.name))) return `${v.name} is already in your list.`;
          const r = { id: uuid(), position: nextPosition(S.regulars), ...v };
          S.regulars.push(r);
          put('regular', r);
          commit('Added');
        });
        break;
      case 'reg-edit': {
        const r = S.regulars.find(x => x.id === id);
        openForm('Edit regular supplement', REG_FIELDS, r, v => {
          if (S.regulars.some(x => x !== r && sameName(x.name, v.name))) return `${v.name} is already in your list.`;
          Object.assign(r, v);
          put('regular', r);
          commit('Saved');
        });
        break;
      }
      case 'reg-del':
        S.regulars = S.regulars.filter(x => x.id !== id);
        del('regular', id);
        commit('Removed');
        break;

      case 'template': downloadTemplate(el.dataset.kind || 'other'); break;
      case 'import-open': openImport(el.dataset.kind || 'other'); break;
      case 'import-apply': applyImport(el); break;
      case 'example-plan': el.disabled = true; useExamplePlan().finally(() => { el.disabled = false; }); break;
      case 'setup-later': setUpLater(); commit(); break;

      case 'backup': downloadBackup(el); break;
      case 'clear': clearAll(); break;
      case 'change-password': openChangePassword(); break;
      case 'logout': logout(); break;
      case 'delete-account': openDeleteAccount(); break;
    }
  });

  // intake sliders: update the label while dragging, save when released
  document.addEventListener('input', e => {
    const el = e.target, key = el.dataset?.intake;
    if (!key) return;
    const v = Number(el.value), goal = Number(el.dataset.goal), unit = el.dataset.unit;
    document.querySelector(`[data-intake-val="${key}"]`).textContent = v.toLocaleString();
    document.querySelector(`[data-intake-sub="${key}"]`).textContent = goal
      ? `${Math.max(goal - v, 0).toLocaleString()} ${unit} left of ${goal.toLocaleString()}` : 'No daily target set in your plan';
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'importFile' && e.target.files[0]) handleImportFile(e.target.files[0]);
    if (e.target.dataset?.intake) setIntake(e.target.dataset.intake, Number(e.target.value));
  });
  document.addEventListener('dragover', e => {
    const drop = e.target.closest?.('#drop');
    if (drop) { e.preventDefault(); drop.classList.add('over'); }
  });
  document.addEventListener('dragleave', e => { e.target.closest?.('#drop')?.classList.remove('over'); });
  document.addEventListener('drop', e => {
    const drop = e.target.closest?.('#drop');
    if (!drop) return;
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0]);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

async function clearAll() {
  if (!confirm('Delete all workouts, food, supplement, sleep and fee payment entries? Your plan stays.')) return;
  try {
    await ensureOnline();   // queued check-offs would come back after the clear
    await clearLogs();
  } catch (e) {
    return toast(friendly(e), 3500);
  }
  Object.assign(S, { sessions: [], calories: [], supplements: [], sleep: [], fees: [], more: {} });
  commit('Entries cleared');
}
