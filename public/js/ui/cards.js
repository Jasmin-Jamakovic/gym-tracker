// Workout day cards. Mode "track" has the done button, mode "edit" has the editing controls.
import { isRestDay, daySets, dayColor, doneOn, lastDone } from '../state.js';
import { esc, today, dayLabel, plural, thousands } from '../util.js';
import { fmtKg, hasWeight, setGroups, setsOf, volume } from '../progress.js';
import { ICON_EDIT, ICON_DEL, ICON_UP } from './common.js';

// once today's workout is done, show what was lifted, not the next workout the plan has already moved to
function shownExercises(day) {
  const s = doneOn(day.id, today());
  if (!s?.performed?.length) return day.exercises;
  return day.exercises.map(e => {
    const p = s.performed.find(x => x.id === e.id);
    return p ? { ...e, sets: p.sets, reps: p.reps, weight: p.weight } : e;
  });
}
const setLines = e => setGroups(e).map(g => `<div>${esc(g)}</div>`).join('');

export function workoutCard(day, mode) {
  const edit = mode === 'edit';
  const dayActs = edit ? `<div class="ex-acts show"><button class="icon" title="Edit day" aria-label="Edit day" data-act="plan-rename" data-day="${day.id}">${ICON_EDIT}</button><button class="icon danger" title="Delete day" aria-label="Delete day" data-act="plan-del-day" data-day="${day.id}">${ICON_DEL}</button></div>` : '';
  const head = `<div class="wc-head"><div><div class="wc-title">${esc(day.name)}</div>${day.focus ? `<div class="wc-focus">${esc(day.focus)}</div>` : ''}</div>
    <div class="wc-right">${isRestDay(day) ? '' : `<span class="wc-sets">${daySets(day)} sets</span>`}${dayActs}</div></div>`;
  if (isRestDay(day)) {
    return `<div class="wcard rest">${head}<div class="muted small">${edit ? 'Rest day. Add an exercise to turn it into a training day.' : 'Rest day'}</div>
      ${edit ? `<div><button class="ghost" data-act="plan-add-ex" data-day="${day.id}">+ Exercise</button></div>` : ''}</div>`;
  }
  const done = doneOn(day.id, today()), last = lastDone(day);
  const rows = (edit ? day.exercises : shownExercises(day)).map((e, i) => `<tr>
      <td><div class="ex-name">${esc(e.name)}</div>${e.notes ? `<div class="ex-note">${esc(e.notes)}</div>` : ''}</td>
      <td class="n wc-sets-cell">${setLines(e)}${edit && Number(e.increment) ? `<div class="wc-inc">+${fmtKg(e.increment)} per workout</div>` : ''}</td><td class="n">${esc(e.rest || '')}</td>
      ${edit ? `<td><div class="ex-acts">${i > 0 ? `<button class="icon" title="Move up" aria-label="Move up" data-act="plan-up" data-day="${day.id}" data-i="${i}">${ICON_UP}</button>` : ''}<button class="icon" title="Edit" aria-label="Edit" data-act="plan-edit-ex" data-day="${day.id}" data-i="${i}">${ICON_EDIT}</button><button class="icon danger" title="Delete" aria-label="Delete" data-act="plan-del-ex" data-day="${day.id}" data-i="${i}">${ICON_DEL}</button></div></td>` : ''}
    </tr>`).join('');
  const foot = edit
    ? `<div><button class="ghost" data-act="plan-add-ex" data-day="${day.id}">+ Exercise</button></div>`
    : `<div class="wc-foot"><button class="wc-btn ${done ? 'on' : ''}" data-act="wo-toggle" data-day="${day.id}">${done ? '✓ Done today, tap to undo' : 'Mark as done'}</button>
        <span class="muted small">${last ? `Last done ${dayLabel(last)}` : 'Not done yet'}</span></div>`;
  return `<div class="wcard ${done && !edit ? 'done' : ''}" style="--c:${dayColor(day.id)}">${head}
    <div class="tablewrap"><table class="wc-table"><thead><tr><th>Exercise</th><th>Sets</th><th>Rest</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>${foot}</div>`;
}

// rough session length: about 40s per set plus the middle of the rest range ("90-120s" -> 105s)
function restSeconds(rest) {
  const n = String(rest || '').match(/\d+/g)?.map(Number) || [];
  const s = n.length > 1 ? (n[0] + n[1]) / 2 : n[0] || 90;
  return /m(in)?\b/i.test(rest) && !/s\b/i.test(rest) ? s * 60 : s;
}
export const dayMinutes = d => Math.max(5, Math.round(d.exercises.reduce((a, e) => a + Number(e.sets || 0) * (40 + restSeconds(e.rest)), 0) / 60 / 5) * 5);

// one chip per set; plain "3 × 12-15" when every set is the same and there's no weight
function ddSets(e) {
  const sets = setsOf(e);
  if (!hasWeight(e) && sets.every(x => x.reps === sets[0].reps)) return `<span class="dd-plain">${esc(setGroups(e)[0])}</span>`;
  return `<div class="dd-sets">${sets.map((x, n) => `<span class="dd-set"><i>${n + 1}</i>${x.kg == null ? `${esc(x.reps)} reps` : `${fmtKg(x.kg)} × ${esc(x.reps)}`}</span>`).join('')}</div>`;
}

// desktop: one day, large, with a full table so every cue is visible
export function dayDetail(day) {
  const done = doneOn(day.id, today()), last = lastDone(day), list = shownExercises(day), kg = volume(list);
  const rows = list.map((e, i) => `<tr><td class="dd-idx">${i + 1}</td>
    <td><div class="dd-name">${esc(e.name)}</div>${e.notes ? `<div class="dd-cue">${esc(e.notes)}</div>` : ''}</td>
    <td>${ddSets(e)}</td><td class="dd-rest">${esc(e.rest || '')}</td></tr>`).join('');
  return `<div class="dd ${done ? 'done' : ''}" style="--c:${dayColor(day.id)}">
    <div class="dd-band"><div><div class="dd-title">${esc(day.name)}</div>${day.focus ? `<div class="dd-focus">${esc(day.focus)}</div>` : ''}
        <div class="dd-meta"><span>${plural(day.exercises.length, 'exercise')}</span><span>${daySets(day)} sets</span><span>~${dayMinutes(day)} min</span>${kg ? `<span>${thousands(Math.round(kg))} kg volume</span>` : ''}</div></div>
      <div class="dd-act"><button class="dd-btn ${done ? 'on' : ''}" data-act="wo-toggle" data-day="${day.id}">${done ? '✓ Done today, click to undo' : 'Mark as done'}</button>
        <span>${last ? `Last done ${dayLabel(last)}` : 'Not done yet'}</span></div></div>
    <table class="dd-table"><thead><tr><th></th><th>Exercise</th><th>Sets</th><th>Rest</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
