import { S, goals } from '../state.js';
import { esc, num, sum, thousands, today } from '../util.js';
import { C, secHead } from '../ui/common.js';

export const loggedToday = m => S.calories.find(c => c.date === today() && c.food === m.food && c.meal === m.meal);

// the sliders write one row per day; anything else logged today still counts toward the total
export const INTAKE_FOOD = 'Daily intake';
export const intakeRow = (date = today()) => S.calories.find(c => c.date === date && c.food === INTAKE_FOOD);
export const intakeTotal = (key, date = today()) => sum(S.calories.filter(c => c.date === date), key);
export const intakeOthers = (key, date = today()) => sum(S.calories.filter(c => c.date === date && c.food !== INTAKE_FOOD), key);

function slider(key, label, unit, value, goal, max, step) {
  const left = goal ? `${thousands(Math.max(goal - value, 0))} ${unit} left of ${thousands(goal)}` : 'No daily target set in your plan';
  return `<div class="card intake" style="--c:${C.orange}">
    <div class="intake-head"><h3>${esc(label)}</h3>
      <div class="intake-val"><span data-intake-val="${key}">${thousands(value)}</span> <span class="muted">${unit}</span></div></div>
    <input type="range" class="intake-range" data-intake="${key}" min="0" max="${max}" step="${step}" value="${value}" data-goal="${goal}" data-unit="${unit}">
    <div class="muted small" data-intake-sub="${key}">${left}</div>
  </div>`;
}

export function renderCalories() {
  const g = goals();
  const kcal = intakeTotal('calories'), protein = num(intakeTotal('protein'));
  const kcalMax = Math.max(4000, Math.ceil(g.calGoal * 1.5 / 100) * 100, Math.ceil(kcal / 100) * 100);
  const proMax = Math.max(300, Math.ceil(g.proteinGoal * 1.5 / 10) * 10, Math.ceil(protein / 10) * 10);
  return secHead('Calories', 'How much you ate today. Drag the sliders to set it.', '') + `
    ${slider('calories', 'Calories', 'kcal', kcal, g.calGoal, kcalMax, 10)}
    ${slider('protein', 'Protein', 'g', protein, g.proteinGoal, proMax, 1)}`;
}
