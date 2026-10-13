import { S, view, goals } from '../state.js';
import { avg, byDateDesc, esc, lastNDays, num, ratio, shortDate, sum, thousands, today } from '../util.js';
import { C, addBtn, moreBtn, secHead, statCard } from '../ui/common.js';
import { barChart } from '../ui/charts.js';
import { table } from '../ui/forms.js';

export const loggedToday = m => S.calories.find(c => c.date === today() && c.food === m.food && c.meal === m.meal);

function mealPlanCard() {
  if (!S.diet.length) return '';
  return `<div class="card"><div class="card-head"><div><h3>Today's meal plan</h3><div class="muted small">Tap Log when you eat a planned meal. Tap again to undo.</div></div></div>
    ${S.diet.map(m => `<div class="log-item">
      <span class="time-pill">${esc(m.meal)}</span><span class="log-name">${esc(m.food)}</span><span class="muted">${thousands(num(m.calories))} kcal${m.protein !== '' ? `, ${esc(m.protein)} g protein` : ''}</span>
      <span class="log-acts" style="opacity:1">${loggedToday(m)
        ? `<button class="icon logged" data-act="diet-log" data-id="${m.id}" title="Tap to undo">✓ Logged</button>`
        : `<button class="ghost small-btn" data-act="diet-log" data-id="${m.id}">Log</button>`}</span>
    </div>`).join('')}</div>`;
}

export function renderCalories() {
  const t = today(), g = goals(), rows = S.calories.filter(c => c.date === t);
  const kcal = sum(rows, 'calories');
  const all = S.calories.slice().sort(byDateDesc), limit = view.limits.calories;
  const more = all.length > limit || S.more.calories ? moreBtn('calories') : '';
  const chart = barChart(lastNDays(30).map(d => ({ label: shortDate(d), value: sum(S.calories.filter(c => c.date === d), 'calories') })), { goal: g.calGoal, color: C.orange, unit: ' kcal', wide: true });
  return secHead('Calories', 'What you ate today.', addBtn('calories', '+ Add food')) + `
    <div class="stats">
      ${statCard('Today', thousands(kcal), `of ${thousands(g.calGoal)} kcal, ${thousands(Math.max(g.calGoal - kcal, 0))} left`, C.orange, ratio(kcal, g.calGoal))}
      ${statCard('Protein today', `${sum(rows, 'protein')} g`, `of ${g.proteinGoal} g`, C.orange, ratio(sum(rows, 'protein'), g.proteinGoal))}
      ${statCard('Carbs / fat today', `${sum(rows, 'carbs')} / ${sum(rows, 'fat')}`, 'grams', C.orange, null)}
      ${statCard('7 day average', thousands(avg(lastNDays(7).map(d => sum(S.calories.filter(c => c.date === d), 'calories')))), 'kcal per day', C.orange, null)}
    </div>
    ${mealPlanCard()}
    <div class="card"><h3>Last 30 days</h3>${chart}</div>
    <div class="card"><h3>History</h3>${table('calories', all.slice(0, limit))}${more}</div>`;
}
