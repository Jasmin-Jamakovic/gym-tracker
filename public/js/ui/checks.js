// Daily check-ins: supplements checklist, last night's sleep, and today's workout chips.
import { S, trainingDays, doneOn, dayColor, supTaken } from '../state.js';
import { esc, round, today, daysAgo } from '../util.js';

export function supChecklist() {
  if (!S.regulars.length) return '<p class="empty">Add your regular supplements in Plan, Supplements.</p>';
  return S.regulars.map(r => {
    const taken = supTaken(r.name);
    return `<button class="check ${taken ? 'on' : ''}" data-act="sup-toggle" data-name="${esc(r.name)}"><span class="box">${taken ? '✓' : ''}</span><span>${esc(r.name)}</span><span class="muted small">${esc(r.dose)} ${esc(r.unit)}${r.time ? ` · ${esc(r.time)}` : ''}</span></button>`;
  }).join('');
}

export function streak(name) {
  const days = new Set(S.supplements.filter(x => x.supplement === name).map(x => x.date));
  let n = 0, i = days.has(today()) ? 0 : 1;
  while (days.has(daysAgo(i))) { n++; i++; }
  return n;
}

export function sleepCheck() {
  const night = S.sleep.find(x => x.date === today()), p = S.sleepPlan;
  if (!night) {
    return `<button class="check sleepc" data-act="sleep-check"><span class="box"></span><span>Slept as planned</span><span class="muted small">${esc(p.bed)} to ${esc(p.wake)}</span></button>
      <button class="linkish" data-act="sleep-other">Different times?</button>`;
  }
  return `<div class="check sleepc on"><span class="box">✓</span><span>Slept ${round(night.hours)} h</span><span class="muted small">${esc(night.bed)} to ${esc(night.wake)}</span></div>
    <div class="sleep-acts"><button class="icon" data-act="edit" data-sec="sleep" data-id="${night.id}">Edit</button><button class="icon danger" data-act="sleep-undo">Undo</button></div>`;
}

export function workoutCheck() {
  if (!trainingDays().length) return '<p class="empty">Import or add a workout plan first.</p>';
  return `<div class="wo-chips">${trainingDays().map(d => {
    const on = doneOn(d.id, today());
    return `<button class="wo-chip ${on ? 'on' : ''}" style="--c:${dayColor(d.id)}" data-act="wo-toggle" data-day="${d.id}"><i></i>${on ? '✓ ' : ''}${esc(d.name)}</button>`;
  }).join('')}</div><div class="muted small">Tap the workout you finished today. Tap again to undo.</div>`;
}
