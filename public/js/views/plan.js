import { S, view, goals, supColor } from '../state.js';
import { esc, grams, round, sum, thousands } from '../util.js';
import { secHead } from '../ui/common.js';
import { workoutCard } from '../ui/cards.js';
import { importBtns } from '../import.js';

const PLAN_TABS = [['workout', 'Workout'], ['diet', 'Diet'], ['supplements', 'Supplements'], ['sleep', 'Sleep']];

export function renderPlan() {
  const seg = PLAN_TABS.map(([k, l]) => `<button class="${view.planTab === k ? 'on' : ''}" data-act="plan-tab" data-k="${k}">${l}</button>`).join('');
  const body = { workout: planWorkout, diet: planDiet, supplements: planSupplements, sleep: planSleep }[view.planTab]();
  return secHead('Your plan', view.planTab === 'workout' ? 'Your training days. Edit anything here, or import them from an Excel file.' : 'Diet, supplements and sleep. Edit anything here, or import all three from one Excel file.',
    importBtns(view.planTab === 'workout' ? 'workout' : 'other'))
    + `<div class="seg plan-seg">${seg}</div>${body}`;
}

function planWorkout() {
  return `<div class="sub-head"><span class="muted">Edit your workouts here. A day without exercises is a rest day.</span><button class="ghost" data-act="plan-add-day">+ Add day</button></div>`
    + `<div class="wgrid">${S.plan.map(d => workoutCard(d, 'edit')).join('') || '<p class="empty">No plan yet. Import one, or add your first day.</p>'}</div>`;
}

function planDiet() {
  const g = goals();
  const rows = S.diet.map(m => `<tr><td>${esc(m.meal)}</td><td>${esc(m.food)}</td><td>${esc(m.calories)}</td><td>${grams(m.protein)}</td><td>${grams(m.carbs)}</td><td>${grams(m.fat)}</td>
    <td class="rowact"><button class="icon" data-act="diet-edit" data-id="${m.id}">Edit</button><button class="icon danger" data-act="diet-del" data-id="${m.id}">Delete</button></td></tr>`).join('');
  return `<div class="card"><div class="card-head"><div><h3>Daily meal plan</h3><div class="muted small">Your daily calorie and protein goals are the totals of this plan.</div></div><button class="ghost" data-act="diet-add">+ Meal</button></div>
    ${S.diet.length ? `<div class="tablewrap"><table><thead><tr><th>Meal</th><th>Food</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th></th></tr></thead><tbody>${rows}
      <tr class="total-row"><td colspan="2">Daily total</td><td>${thousands(g.calGoal)}</td><td>${g.proteinGoal} g</td><td>${sum(S.diet, 'carbs')} g</td><td>${sum(S.diet, 'fat')} g</td><td></td></tr></tbody></table></div>`
      : '<p class="empty">No meals planned yet.</p>'}</div>`;
}

function planSupplements() {
  return `<div class="card"><div class="card-head"><div><h3>Daily supplements</h3><div class="muted small">These become your daily checklist on the Dashboard and Supplements page.</div></div><button class="ghost" data-act="reg-add">+ Supplement</button></div>
    ${S.regulars.length ? `<table><thead><tr><th>Supplement</th><th>Dose</th><th>When</th><th></th></tr></thead><tbody>${S.regulars.map(r => `
      <tr><td><i class="cdot" style="background:${supColor(r.name)};display:inline-block;margin-right:8px"></i>${esc(r.name)}</td><td>${esc(r.dose)} ${esc(r.unit)}</td><td>${esc(r.time)}</td><td class="rowact">
        <button class="icon" data-act="reg-edit" data-id="${r.id}">Edit</button><button class="icon danger" data-act="reg-del" data-id="${r.id}">Delete</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">No supplements planned yet.</p>'}</div>`;
}

function planSleep() {
  const p = S.sleepPlan;
  return `<div class="card"><div class="card-head"><div><h3>Sleep schedule</h3><div class="muted small">Your sleep goal is the time between these two.</div></div><button class="ghost" data-act="sleep-plan-edit">Edit</button></div>
    <div class="ministats"><div><b>${esc(p.bed)}</b><span>Bed time</span></div><div><b>${esc(p.wake)}</b><span>Wake time</span></div><div><b>${round(goals().sleepGoal)} h</b><span>Sleep goal</span></div></div></div>`;
}
