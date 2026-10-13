// Workout day cards. Mode "track" has the done button, mode "edit" has the editing controls.
import { isRestDay, daySets, dayColor, doneOn, lastDone } from '../state.js';
import { esc, today, dayLabel, plural } from '../util.js';
import { ICON_EDIT, ICON_DEL, ICON_UP } from './common.js';

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
  const rows = day.exercises.map((e, i) => `<tr>
      <td><div class="ex-name">${esc(e.name)}</div>${e.notes ? `<div class="ex-note">${esc(e.notes)}</div>` : ''}</td>
      <td class="n">${esc(e.sets)}</td><td class="n">${esc(e.reps)}</td><td class="n">${esc(e.rest || '')}</td>
      ${edit ? `<td><div class="ex-acts">${i > 0 ? `<button class="icon" title="Move up" aria-label="Move up" data-act="plan-up" data-day="${day.id}" data-i="${i}">${ICON_UP}</button>` : ''}<button class="icon" title="Edit" aria-label="Edit" data-act="plan-edit-ex" data-day="${day.id}" data-i="${i}">${ICON_EDIT}</button><button class="icon danger" title="Delete" aria-label="Delete" data-act="plan-del-ex" data-day="${day.id}" data-i="${i}">${ICON_DEL}</button></div></td>` : ''}
    </tr>`).join('');
  const foot = edit
    ? `<div><button class="ghost" data-act="plan-add-ex" data-day="${day.id}">+ Exercise</button></div>`
    : `<div class="wc-foot"><button class="wc-btn ${done ? 'on' : ''}" data-act="wo-toggle" data-day="${day.id}">${done ? '✓ Done today, tap to undo' : 'Mark as done'}</button>
        <span class="muted small">${last ? `Last done ${dayLabel(last)}` : 'Not done yet'}</span></div>`;
  return `<div class="wcard ${done && !edit ? 'done' : ''}" style="--c:${dayColor(day.id)}">${head}
    <div class="tablewrap"><table class="wc-table"><thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Rest</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>${foot}</div>`;
}

// rough session length: about 40s per set plus the middle of the rest range ("90-120s" -> 105s)
function restSeconds(rest) {
  const n = String(rest || '').match(/\d+/g)?.map(Number) || [];
  const s = n.length > 1 ? (n[0] + n[1]) / 2 : n[0] || 90;
  return /m(in)?\b/i.test(rest) && !/s\b/i.test(rest) ? s * 60 : s;
}
export const dayMinutes = d => Math.max(5, Math.round(d.exercises.reduce((a, e) => a + Number(e.sets || 0) * (40 + restSeconds(e.rest)), 0) / 60 / 5) * 5);

// desktop: one day, large, with a full table so every cue is visible
export function dayDetail(day) {
  const done = doneOn(day.id, today()), last = lastDone(day);
  const rows = day.exercises.map((e, i) => `<tr><td class="dd-idx">${i + 1}</td>
    <td><div class="dd-name">${esc(e.name)}</div>${e.notes ? `<div class="dd-cue">${esc(e.notes)}</div>` : ''}</td>
    <td class="dd-num">${esc(e.sets)} × ${esc(e.reps)}</td><td class="dd-rest">${esc(e.rest || '')}</td></tr>`).join('');
  return `<div class="dd ${done ? 'done' : ''}" style="--c:${dayColor(day.id)}">
    <div class="dd-band"><div><div class="dd-title">${esc(day.name)}</div>${day.focus ? `<div class="dd-focus">${esc(day.focus)}</div>` : ''}
        <div class="dd-meta"><span>${plural(day.exercises.length, 'exercise')}</span><span>${daySets(day)} sets</span><span>~${dayMinutes(day)} min</span></div></div>
      <div class="dd-act"><button class="dd-btn ${done ? 'on' : ''}" data-act="wo-toggle" data-day="${day.id}">${done ? '✓ Done today, click to undo' : 'Mark as done'}</button>
        <span>${last ? `Last done ${dayLabel(last)}` : 'Not done yet'}</span></div></div>
    <table class="dd-table"><thead><tr><th></th><th>Exercise</th><th>Sets × reps</th><th>Rest</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
