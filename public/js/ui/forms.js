// Form fields, the modal form, and the history table shared by Calories, Supplements and Sleep.
import { S, allExerciseNames } from '../state.js';
import { esc, shortDate, round, uniq } from '../util.js';
import { showModal, closeModal } from './common.js';
import { sleepDialHtml } from './sleepdial.js';

export const UNITS = ['g', 'mg', 'IU', 'caps', 'scoop', 'ml'];
export const SUP_TIMES = ['Morning', 'Midday', 'Evening', 'Before bed', 'Pre-workout', 'Post-workout', 'Any time'];

// the three history sections: form fields, table columns and the state list they live in
export const SECTIONS = {
  calories: {
    title: 'food entry', kind: 'food',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'meal', label: 'Meal', type: 'select', options: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] },
      { key: 'food', label: 'Food', type: 'text', required: true, max: 120, list: () => uniq(S.calories.map(c => c.food)) },
      { key: 'calories', label: 'Calories (kcal)', type: 'number', required: true, min: 0, step: 1 },
      { key: 'protein', label: 'Protein (g)', type: 'number', min: 0 },
      { key: 'carbs', label: 'Carbs (g)', type: 'number', min: 0 },
      { key: 'fat', label: 'Fat (g)', type: 'number', min: 0 },
    ],
    columns: [
      { label: 'Date', fmt: r => shortDate(r.date) }, { label: 'Meal', key: 'meal' }, { label: 'Food', key: 'food' },
      { label: 'kcal', key: 'calories' }, { label: 'Protein', fmt: r => r.protein !== '' ? `${r.protein} g` : '' },
      { label: 'Carbs', fmt: r => r.carbs !== '' ? `${r.carbs} g` : '' }, { label: 'Fat', fmt: r => r.fat !== '' ? `${r.fat} g` : '' },
    ],
  },
  supplements: {
    title: 'supplement', kind: 'supplement',
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'time', label: 'Time', type: 'time' },
      { key: 'supplement', label: 'Supplement', type: 'text', required: true, max: 60, list: () => uniq([...S.regulars.map(r => r.name), ...S.supplements.map(x => x.supplement)]) },
      { key: 'dose', label: 'Dose', type: 'number', min: 0 },
      { key: 'unit', label: 'Unit', type: 'select', options: () => withExtra(UNITS, S.supplements.map(x => x.unit)) },
      { key: 'notes', label: 'Notes', type: 'text', max: 200 },
    ],
    columns: [
      { label: 'Date', fmt: r => shortDate(r.date) }, { label: 'Time', key: 'time' }, { label: 'Supplement', key: 'supplement' },
      { label: 'Dose', fmt: r => `${r.dose} ${r.unit}` }, { label: 'Notes', key: 'notes' },
    ],
  },
  sleep: {
    title: 'night of sleep', kind: 'sleep',
    fields: [
      { key: 'date', label: 'Date (the morning you woke up)', type: 'date', required: true },
      { key: 'times', label: 'Bed and wake time', type: 'sleeptimes', keys: ['bed', 'wake'] },
      { key: 'notes', label: 'Notes', type: 'text', max: 200 },
    ],
    columns: [
      { label: 'Date', fmt: r => shortDate(r.date) }, { label: 'Bed', key: 'bed' }, { label: 'Wake', key: 'wake' },
      { label: 'Hours', fmt: r => `${round(r.hours)} h` }, { label: 'Notes', key: 'notes' },
    ],
  },
};

export const DAY_FIELDS = [
  { key: 'name', label: 'Name, for example Upper A', type: 'text', required: true, max: 60 },
  { key: 'focus', label: 'Focus, for example Width & upper chest (optional)', type: 'text', max: 120 },
];
export const PLAN_EX_FIELDS = [
  { key: 'name', label: 'Exercise', type: 'text', required: true, max: 80, list: () => allExerciseNames() },
  { key: 'sets', label: 'Sets', type: 'number', required: true, min: 1, max: 20, step: 1 },
  { key: 'reps', label: 'Reps: one for every set (8, or 8-12), or one per set (8, 10, 12, 8)', type: 'text', required: true, max: 80 },
  { key: 'weight', label: 'Weight in kg: one for every set (80), or one per set (80, 80, 80, 90). Empty for bodyweight', type: 'text', max: 80 },
  { key: 'increment', label: 'Increase in kg after every finished workout (added to each set, 0 or empty keeps it the same)', type: 'number', min: 0, max: 100 },
  { key: 'rest', label: 'Rest, for example 90s', type: 'text', max: 20 },
  { key: 'notes', label: 'Execution, how to do it', type: 'text', max: 300 },
];
// imported files may bring their own units or timings, keep those selectable
const withExtra = (base, extra) => [...new Set([...base, ...extra.filter(Boolean)])];
export const REG_FIELDS = [
  { key: 'name', label: 'Supplement', type: 'text', required: true, max: 60 },
  { key: 'dose', label: 'Dose', type: 'number', required: true, min: 0 },
  { key: 'unit', label: 'Unit', type: 'select', options: () => withExtra(UNITS, S.regulars.map(r => r.unit)) },
  { key: 'time', label: 'When', type: 'select', options: () => withExtra(SUP_TIMES, S.regulars.map(r => r.time)) },
];
export const DIET_FIELDS = () => SECTIONS.calories.fields.filter(f => f.key !== 'date');
export const SLEEP_PLAN_FIELDS = [
  { key: 'times', label: 'Your sleep schedule', type: 'sleeptimes', keys: ['bed', 'wake'] },
];

const optsOf = f => (typeof f.options === 'function' ? f.options() : f.options);
function fieldHtml(f, v, values = {}) {
  if (f.type === 'sleeptimes') return `<div class="field-dial"><span class="lbl">${f.label}</span>${sleepDialHtml(values.bed || S.sleepPlan.bed, values.wake || S.sleepPlan.wake)}</div>`;
  v = v ?? '';
  let input;
  if (f.type === 'select') {
    const opts = optsOf(f);
    if (v !== '' && !opts.map(String).includes(String(v))) opts.push(v);
    input = `<select name="${f.key}">${opts.map(o => `<option ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  } else {
    const listId = f.list ? `dl_${f.key}` : '';
    input = `<input name="${f.key}" type="${f.type}" value="${esc(v)}" ${f.required ? 'required' : ''} ${f.type === 'number' ? `step="${f.step || 'any'}"` : ''}
      ${f.pattern ? `pattern="${f.pattern}" title="${esc(f.hint || '')}"` : ''} ${f.min != null ? `min="${f.min}"` : ''}
      ${f.max != null ? (f.type === 'number' ? `max="${f.max}"` : `maxlength="${f.max}"`) : ''} ${listId ? `list="${listId}" autocomplete="off"` : ''}>`
      + (f.list ? `<datalist id="${listId}">${f.list().map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
  }
  return `<label class="field"><span>${f.label}</span>${input}</label>`;
}

// onSave gets the values; returning a string keeps the form open and shows it as an error
export function openForm(title, fields, values, onSave) {
  const form = showModal(`<h3>${title}</h3><form id="mform"><div class="form-msg err" hidden></div>${fields.map(f => fieldHtml(f, values[f.key], values)).join('')}
    <div class="actions"><button type="button" class="ghost" data-act="close">Cancel</button><button class="primary">Save</button></div></form>`);
  form.onsubmit = e => {
    e.preventDefault();
    const out = {};
    fields.forEach(f => {
      if (f.keys) { f.keys.forEach(k => { out[k] = form.elements[k].value; }); return; }
      let v = form.elements[f.key].value;
      if (f.type === 'number') v = v === '' ? '' : Number(v);
      out[f.key] = typeof v === 'string' ? v.trim() : v;
    });
    const err = onSave(out);
    if (typeof err === 'string') {
      const box = form.querySelector('.form-msg');
      box.textContent = err; box.hidden = false;
      return;
    }
    closeModal();
  };
}

export function table(sec, rows) {
  const c = SECTIONS[sec];
  if (!rows.length) return '<p class="empty">No entries yet.</p>';
  return `<div class="tablewrap"><table><thead><tr>${c.columns.map(col => `<th>${col.label}</th>`).join('')}<th></th></tr></thead><tbody>${
    rows.map(r => `<tr>${c.columns.map(col => `<td>${esc(col.fmt ? col.fmt(r) : r[col.key])}</td>`).join('')}
      <td class="rowact"><button class="icon" data-act="edit" data-sec="${sec}" data-id="${r.id}">Edit</button><button class="icon danger" data-act="del" data-sec="${sec}" data-id="${r.id}">Delete</button></td></tr>`).join('')
  }</tbody></table></div>`;
}
