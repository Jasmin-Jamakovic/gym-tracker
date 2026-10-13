// Workout day cards. Mode "track" has the done button, mode "edit" has the editing controls.
import { isRestDay, daySets, dayColor, doneOn, lastDone } from '../state.js';
import { esc, today, dayLabel } from '../util.js';
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
