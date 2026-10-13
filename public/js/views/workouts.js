import { S, view, dayColor, doneOn, trainingDays } from '../state.js';
import { MO, byDateDesc, dayLabel, daysAgo, esc, fmt, parseDay, plural, today } from '../util.js';
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

// the next fee: one month after the last payment
function feeDue() {
  const last = S.fees.map(f => f.date).filter(d => d <= today()).sort().at(-1);
  return last ? nextMonth(last) : null;
}

function feeStatus() {
  const last = S.fees.map(f => f.date).filter(d => d <= today()).sort().at(-1);
  if (!last) return '<span class="muted">No fee payment marked yet.</span>';
  const due = feeDue(), left = Math.round((parseDay(due) - parseDay(today())) / 864e5);
  const when = left < 0 ? `<span class="fee-late">overdue since ${dayLabel(due)}</span>`
    : left === 0 ? '<span class="fee-late">due today</span>' : `next due ${dayLabel(due)}, in ${plural(left, 'day')}`;
  return `Fee last paid <b>${dayLabel(last)}</b>, ${when}.`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CAL_HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-h">${d}</div>`).join('');
export const thisMonth = () => today().slice(0, 7);
// See more covers two months back and one month ahead
export const MONTHS_BACK = 2, MONTHS_AHEAD = 1;
export const monthLabel = ym => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
export function shiftMonth(ym, n) {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1 + n, 1);
  return fmt(d).slice(0, 7);
}

// one day: its date, the workouts done, and the fee marker; tap to mark the fee
function calCell(d, outside = false, due = null) {
  const items = S.sessions.filter(x => x.date === d), paid = S.fees.some(f => f.date === d), future = d > today();
  const isDue = d === due && !paid;
  const title = isDue ? 'monthly fee due' : paid ? 'monthly fee paid, tap to remove' : future ? '' : 'tap to mark the monthly fee as paid';
  return `<button class="cal-d ${future ? 'future' : ''} ${outside ? 'outside' : ''} ${d === today() ? 'today' : ''} ${paid ? 'paid' : ''} ${isDue ? 'due' : ''}" ${future ? 'disabled' : ''}
      data-act="fee-toggle" data-date="${d}" title="${dayLabel(d)}${title ? `: ${title}` : ''}">
    <span class="cal-n">${parseDay(d).getDate()}${paid || isDue ? `<span class="cal-fee">${FEE_ICON}</span>` : ''}</span>
    ${isDue ? '<span class="cal-due">Fee due</span>' : ''}
    ${items.map(x => `<span class="cal-s" style="--c:${dayColor(x.dayId)}">${esc(x.name)}</span>`).join('')}</button>`;
}

const feeRow = () => `<div class="fee-row"><span class="cal-fee">${FEE_ICON}</span><div>${feeStatus()}<div class="muted small">Tap a day to mark when you paid your monthly fee.</div></div></div>`;

// the last 4 weeks, Monday to Sunday
function weeksCalendar() {
  const t = parseDay(today()), monday = (t.getDay() + 6) % 7;
  const days = Array.from({ length: 28 }, (_, i) => daysAgo(monday + 21 - i));
  return `<div class="card-head" style="margin-bottom:12px"><h3>Last 4 weeks</h3><button class="ghost small-btn" data-act="cal-more">See more</button></div>
    <div class="cal">${CAL_HEAD}${days.map(d => calCell(d, false, feeDue())).join('')}</div>${feeRow()}`;
}

// "See more": a whole month, with arrows to go back in time
function monthCalendar(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5)) - 1;
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, length = new Date(y, m + 1, 0).getDate();
  const days = Array.from({ length: Math.ceil((lead + length) / 7) * 7 }, (_, i) => fmt(new Date(y, m, 1 - lead + i)));
  const inMonth = d => d.startsWith(ym);
  const done = S.sessions.filter(x => inMonth(x.date));
  const fees = S.fees.filter(f => inMonth(f.date)).map(f => f.date).sort();
  const counts = {};
  done.forEach(x => { counts[x.name] = (counts[x.name] || 0) + 1; });
  return `<div class="card-head" style="margin-bottom:12px">
      <div class="cal-nav"><button class="ghost small-btn" data-act="cal-month" data-step="-1" aria-label="Previous month" ${ym <= shiftMonth(thisMonth(), -MONTHS_BACK) ? 'disabled' : ''}>‹</button>
        <h3>${monthLabel(ym)}</h3>
        <button class="ghost small-btn" data-act="cal-month" data-step="1" aria-label="Next month" ${ym >= shiftMonth(thisMonth(), MONTHS_AHEAD) ? 'disabled' : ''}>›</button></div>
      <button class="ghost small-btn" data-act="cal-less">Show less</button></div>
    <div class="cal-stats">
      <div><b>${done.length}</b><span>${done.length === 1 ? 'workout' : 'workouts'}</span></div>
      <div><b>${fees.length ? fees.map(d => `${parseDay(d).getDate()} ${MO[parseDay(d).getMonth()]}`).join(', ') : '-'}</b><span>${fees.length ? 'fee paid' : 'no fee payment'}</span></div>
      ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, n]) => {
        const day = S.sessions.find(x => x.name === name && x.dayId);
        return `<div class="cal-stat-day" style="--c:${dayColor(day?.dayId)}"><b>${n}×</b><span>${esc(name)}</span></div>`;
      }).join('')}
    </div>
    <div class="cal">${CAL_HEAD}${days.map(d => calCell(d, !inMonth(d), feeDue())).join('')}</div>${feeRow()}`;
}

function workoutCalendar() {
  return view.calMonth ? monthCalendar(view.calMonth) : weeksCalendar();
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
  const days = trainingDays();   // rest days stay out of the swipe row
  const empty = '<p class="empty">Your plan only has rest days. Add exercises in Plan.</p>';
  const dots = days.length > 1
    ? `<div class="swipe-dots">${days.map((d, i) => `<button data-act="swipe-to" data-i="${i}" aria-label="Show ${esc(d.name)}" class="${i === view.woSlide ? 'on' : ''}"></button>`).join('')}</div>` : '';
  // on phones this is a swipe row, one card at a time
  return head + `<div class="wo-phone">${days.length ? `<div class="wgrid swipe" id="woSwipe">${days.map(d => workoutCard(d, 'track')).join('')}</div>${dots}` : empty}</div>
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
    <div class="card wo-cal">${workoutCalendar()}</div>`;
}
