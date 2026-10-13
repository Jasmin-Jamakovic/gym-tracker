import { S, view, dayColor, doneOn, trainingDays } from '../state.js';
import { byDateDesc, dayLabel, daysAgo, esc, fmt, parseDay, plural, today } from '../util.js';
import { secHead } from '../ui/common.js';
import { workoutCard, dayDetail } from '../ui/cards.js';

const FEE_ICON = '<svg class="ic" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>';

// the same day one month later (31 Jan -> 28 Feb)
function nextMonth(date) {
  const d = parseDay(date), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + 1);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return fmt(d);
}

function feeStatus() {
  const last = S.fees.map(f => f.date).filter(d => d <= today()).sort().at(-1);
  if (!last) return '<span class="muted">No fee payment marked yet.</span>';
  const due = nextMonth(last), left = Math.round((parseDay(due) - parseDay(today())) / 864e5);
  const when = left < 0 ? `<span class="fee-late">overdue since ${dayLabel(due)}</span>`
    : left === 0 ? '<span class="fee-late">due today</span>' : `next due ${dayLabel(due)}, in ${plural(left, 'day')}`;
  return `Fee last paid <b>${dayLabel(last)}</b>, ${when}.`;
}

function workoutCalendar() {
  const t = parseDay(today()), monday = (t.getDay() + 6) % 7;
  const days = Array.from({ length: 28 }, (_, i) => daysAgo(monday + 21 - i));
  const head = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-h">${d}</div>`).join('');
  const cells = days.map(d => {
    const items = S.sessions.filter(x => x.date === d), paid = S.fees.some(f => f.date === d), future = d > today();
    return `<button class="cal-d ${future ? 'future' : ''} ${d === today() ? 'today' : ''} ${paid ? 'paid' : ''}" ${future ? 'disabled' : ''}
        data-act="fee-toggle" data-date="${d}" title="${dayLabel(d)}: ${paid ? 'monthly fee paid, tap to remove' : 'tap to mark the monthly fee as paid'}">
      <span class="cal-n">${parseDay(d).getDate()}${paid ? `<span class="cal-fee">${FEE_ICON}</span>` : ''}</span>
      ${items.map(x => `<span class="cal-s" style="--c:${dayColor(x.dayId)}">${esc(x.name)}</span>`).join('')}</button>`;
  }).join('');
  return `<div class="cal">${head}${cells}</div>
    <div class="fee-row"><span class="cal-fee">${FEE_ICON}</span><div>${feeStatus()}<div class="muted small">Tap a day to mark when you paid your monthly fee.</div></div></div>`;
}

// the workout after the last one you did, in plan order
function upNext() {
  const days = trainingDays(), last = S.sessions.filter(x => x.dayId).sort(byDateDesc)[0];
  const i = last ? days.findIndex(d => d.id === last.dayId) : -1;
  return days[(i + 1) % days.length];
}

// desktop: your days on the left, the selected one large on the right
function dayPicker() {
  const days = trainingDays();
  if (!days.length) return '<p class="empty">Your plan only has rest days. Add exercises in Plan.</p>';
  const next = upNext(), sel = days.find(d => d.id === view.woDay) || next;
  const tag = d => (doneOn(d.id, today()) ? '<span class="dl-tag done">✓ Today</span>' : d === next ? '<span class="dl-tag">Up next</span>' : '');
  return `<div class="dl">
    <div class="dl-days">${days.map(d => `<button class="dl-day ${d === sel ? 'on' : ''}" style="--c:${dayColor(d.id)}" data-act="wo-pick" data-day="${d.id}">
      <i></i><span class="dl-text"><b>${esc(d.name)}</b><small>${esc(d.focus || `${d.exercises.length} exercises`)}</small></span>${tag(d)}</button>`).join('')}</div>
    ${dayDetail(sel)}</div>`;
}

// before a workout is done: every card. After: just today's, until "Change workout" is tapped.
// Phones get a swipe row (.wo-phone), wider screens the day list + detail (.wo-desk).
function workoutCards() {
  if (!S.plan.length) return '<p class="empty">No plan yet. Import your workout plan in Plan.</p>';
  const doneToday = trainingDays().filter(d => doneOn(d.id, today()));
  if (doneToday.length && !view.changingWorkout) {
    return `<div class="sub-head"><h3>Today's workout</h3><button class="ghost" data-act="wo-change">Change workout</button></div>
      <div class="wgrid wo-phone">${doneToday.map(d => workoutCard(d, 'track')).join('')}</div>
      <div class="wo-desk dd-stack">${doneToday.map(dayDetail).join('')}</div>`;
  }
  const head = doneToday.length
    ? `<div class="sub-head"><span class="muted">Pick the workout you did today. It replaces ${esc(doneToday.map(d => d.name).join(' and '))}.</span><button class="ghost" data-act="wo-change-cancel">Cancel</button></div>`
    : '';
  const dots = S.plan.length > 1
    ? `<div class="swipe-dots">${S.plan.map((d, i) => `<button data-act="swipe-to" data-i="${i}" aria-label="Show ${esc(d.name)}" class="${i === view.woSlide ? 'on' : ''}"></button>`).join('')}</div>` : '';
  // on phones this is a swipe row, one card at a time
  return head + `<div class="wo-phone"><div class="wgrid swipe" id="woSwipe">${S.plan.map(d => workoutCard(d, 'track')).join('')}</div>${dots}</div>
    <div class="wo-desk">${dayPicker()}</div>`;
}

// distance from one card to the next, gap included
const slideStep = row => (row.children.length > 1 ? row.children[1].offsetLeft - row.children[0].offsetLeft : row.clientWidth);

// keep the dots in step with the card that's showing
export function trackSwipe() {
  document.addEventListener('scroll', e => {
    const row = e.target;
    if (row.id !== 'woSwipe' || !row.clientWidth) return;
    const i = Math.round(row.scrollLeft / slideStep(row));
    if (i === view.woSlide) return;
    view.woSlide = i;
    document.querySelectorAll('.swipe-dots button').forEach((b, n) => b.classList.toggle('on', n === i));
  }, true);
}
export function showSlide(i, smooth = true) {
  const row = document.getElementById('woSwipe');
  if (row) row.scrollTo({ left: i * slideStep(row), behavior: smooth ? 'smooth' : 'instant' });
}

export function renderWorkouts() {
  const week = S.sessions.filter(x => x.date >= daysAgo(6)).length, month = S.sessions.filter(x => x.date >= daysAgo(29)).length;
  const last = S.sessions.slice().sort(byDateDesc)[0];
  return secHead('Workouts', 'Your plan as cards. Tap a workout when you finish it.', '<button class="ghost" data-act="wo-past">+ Past workout</button><button class="ghost" data-act="tab" data-tab="plan">Edit plan</button>') + `
    <div class="card wo-summary"><div class="ministats">
      <div><b>${week}</b><span>Workouts, last 7 days</span></div>
      <div><b>${month}</b><span>Workouts, last 30 days</span></div>
      <div><b>${last ? esc(last.name) : '-'}</b><span>${last ? `Last workout, ${dayLabel(last.date)}` : 'No workouts yet'}</span></div>
    </div></div>
    ${workoutCards()}
    <div class="card wo-cal"><div class="card-head" style="margin-bottom:12px"><h3>Last 4 weeks</h3><button class="ghost small-btn" data-act="fee-add">+ Fee payment</button></div>${workoutCalendar()}</div>`;
}
