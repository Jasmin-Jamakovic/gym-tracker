import { S, view, goals } from '../state.js';
import { avg, byDateDesc, daysAgo, esc, lastNDays, num, ratio, round, shortDate, toMin, toTime } from '../util.js';
import { C, addBtn, moreBtn, secHead, statCard } from '../ui/common.js';
import { lineChart } from '../ui/charts.js';
import { sleepCheck } from '../ui/checks.js';
import { table } from '../ui/forms.js';

// bedtimes after midnight count as late, not early
function avgBedtime(nights) {
  return toTime(Math.round(avg(nights.map(n => { const m = toMin(n.bed); return m < 720 ? m + 1440 : m; }))) % 1440);
}

export function renderSleep() {
  const g = goals(), week = S.sleep.filter(s => s.date >= daysAgo(6));
  const all = S.sleep.slice().sort(byDateDesc), last = all[0], limit = view.limits.sleep;
  const more = all.length > limit || S.more.sleep ? moreBtn('sleep') : '';
  const weekAvg = avg(week.map(s => num(s.hours)));
  return secHead('Sleep', `Your plan: bed at ${esc(S.sleepPlan.bed)}, up at ${esc(S.sleepPlan.wake)}. One row per night.`, addBtn('sleep', '+ Add night')) + `
    <div class="card"><h3>Last night</h3><div class="checks">${sleepCheck()}</div></div>
    <div class="stats">
      ${statCard('Last night', last ? `${round(last.hours)} h` : '-', last ? `${esc(last.bed)} to ${esc(last.wake)}` : 'Nothing logged', C.purple, last ? ratio(last.hours, g.sleepGoal) : null)}
      ${statCard('7 day average', `${round(weekAvg)} h`, `goal ${round(g.sleepGoal)} h`, C.purple, ratio(weekAvg, g.sleepGoal))}
      ${statCard('Average bedtime', week.length ? avgBedtime(week) : '-', `plan ${esc(S.sleepPlan.bed)}, last 7 days`, C.purple, null)}
      ${statCard('Nights on goal', `${week.filter(s => num(s.hours) >= g.sleepGoal).length} / ${week.length}`, 'last 7 days', C.purple, null)}
    </div>
    <div class="card"><h3>Last 30 days</h3>${lineChart(lastNDays(30).map(d => { const s = S.sleep.find(x => x.date === d); return { label: shortDate(d), value: s ? num(s.hours) : null }; }), { goal: g.sleepGoal, color: C.purple, unit: ' h', wide: true })}</div>
    <div class="card"><h3>History</h3>${table('sleep', all.slice(0, limit))}${more}</div>`;
}
