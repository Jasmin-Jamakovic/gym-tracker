// Excel import (checked in the browser, written with one RPC), templates and the backup download.
import { S, isRestDay, daySets } from './state.js';
import { esc, fmt, friendly, OFFLINE, plural, round, sleepHours, sum, thousands, toTime, z } from './util.js';
import { closeModal, showModal, toast } from './ui/common.js';
import { UNITS, SUP_TIMES } from './ui/forms.js';
import { parseIncrement, parseRepList, parseWeightList } from './progress.js';
import { replaceWorkoutPlan, replaceOtherPlan, fetchAll, BACKUP_TABLES } from './db.js';
import * as outbox from './outbox.js';
import { refresh } from './sync.js';

const SHEETS = {
  workout: { match: /^(workout|training|exercise)/, label: 'Workout', cols: ['Day', 'Focus', 'Exercise', 'Sets', 'Reps', 'Weight (kg)', 'Increase (kg)', 'Rest', 'Execution'] },
  diet: { match: /^(diet|meal|food|nutrition)/, label: 'Diet', cols: ['Meal', 'Food', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'] },
  supplements: { match: /^supp/, label: 'Supplements', cols: ['Supplement', 'Dose', 'Unit', 'When'] },
  sleep: { match: /^sleep/, label: 'Sleep', cols: ['Setting', 'Value'] },
};
// header names are matched loosely: "Execution", "Notes" and "Cue" all work
const ALIASES = {
  day: ['day', 'session', 'workout'], focus: ['focus', 'title', 'subtitle', 'description'], exercise: ['exercise', 'name'], sets: ['sets'], reps: ['reps', 'repetitions'], weight: ['weight', 'kg', 'load'], increment: ['increase', 'increment', 'progression'], rest: ['rest'], notes: ['note', 'execution', 'cue', 'tip', 'comment'],
  meal: ['meal'], food: ['food', 'item', 'dish'], calories: ['calories', 'kcal', 'cal', 'energy'], protein: ['protein'], carbs: ['carb'], fat: ['fat'],
  supplement: ['supplement', 'name'], dose: ['dose', 'amount'], unit: ['unit'], time: ['when', 'time', 'timing'],
};
const norm = v => String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');
const NO_XLSX = 'Could not load the Excel reader. Check your internet connection and reload.';
// the workout plan has its own file, diet + supplements + sleep share the other
const IMPORTS = {
  workout: { title: 'Import workout plan', sheets: ['workout'], file: 'workout-plan.xlsx', template: 'Download workout template' },
  other: { title: 'Import diet, supplements and sleep', sheets: ['diet', 'supplements', 'sleep'], file: 'gym-plan.xlsx', template: 'Download template' },
};
export const importBtns = kind => `<button class="ghost" data-act="template" data-kind="${kind}">${IMPORTS[kind].template}</button><button class="primary" data-act="import-open" data-kind="${kind}">${kind === 'workout' ? 'Import workout plan' : 'Import diet, supplements & sleep'}</button>`;
let pendingImport = null, importKind = 'other';

function parseNum(v) {
  let t = String(v ?? '').trim().replace(/\s/g, '');
  if (t === '') return '';
  t = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
function parseTime(v) {
  const t = String(v ?? '').trim(), n = Number(t);
  if (t !== '' && n >= 0 && n < 1) return toTime(Math.round(n * 1440));  // raw Excel time fraction
  const m = t.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) { const pm = /p/i.test(m[3]); h = h === 12 ? (pm ? 12 : 0) : h + (pm ? 12 : 0); }
  return h > 23 || min > 59 ? null : `${z(h)}:${z(min)}`;
}

function sheetRows(ws) {
  const start = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: true }).map((cells, i) => ({ cells, excelRow: start + i + 1 }));
}
// returns { get(key), excelRow } per data row, or null when required columns are missing
function readTable(ws, label, keys, required, errors) {
  const rows = sheetRows(ws);
  const hi = rows.findIndex(r => r.cells.some(c => String(c).trim()));
  if (hi < 0) return [];
  const header = rows[hi].cells.map(norm), idx = {};
  keys.forEach(k => { idx[k] = header.findIndex(h => h && ALIASES[k].some(a => h.startsWith(a))); });
  const missing = required.filter(k => idx[k] < 0);
  if (missing.length) { errors.push(`${label}: no ${missing.map(k => `"${k}"`).join(', ')} column found in the first row`); return null; }
  return rows.slice(hi + 1)
    .map(r => ({ excelRow: r.excelRow, get: k => (idx[k] >= 0 ? String(r.cells[idx[k]] ?? '').trim() : '') }))
    .filter(r => keys.some(k => r.get(k) !== ''));
}

// the database limits text lengths; say so here instead of failing the whole import
const tooLong = (at, label, v, max) => (v.length > max ? `${at}: ${label} is too long (${v.length} characters, at most ${max})` : null);

function parseWorkoutSheet(ws, errors) {
  const rows = readTable(ws, 'Workout', ['day', 'focus', 'exercise', 'sets', 'reps', 'weight', 'increment', 'rest', 'notes'], ['day', 'exercise', 'sets', 'reps'], errors);
  if (!rows) return null;
  const days = [];
  let cur = null;
  rows.forEach(r => {
    const at = `Workout row ${r.excelRow}`, dayName = r.get('day');
    // a new name starts a new day, a blank Day continues the one above
    if (dayName && (!cur || dayName !== cur.name)) {
      const long = tooLong(at, 'Day', dayName, 60);
      if (long) errors.push(long);
      days.push(cur = { name: dayName, focus: '', exercises: [] });
    }
    if (!cur) return errors.push(`${at}: Day is empty`);
    if (r.get('focus') && !cur.focus) {
      const long = tooLong(at, 'Focus', r.get('focus'), 120);
      if (long) errors.push(long);
      cur.focus = r.get('focus');
    }
    const name = r.get('exercise');
    if (!name) {
      if (r.get('sets') || r.get('reps')) errors.push(`${at}: Exercise is empty`);
      return;  // a day with no exercises is a rest day
    }
    const sets = parseNum(r.get('sets'));
    if (!(sets > 0)) return errors.push(`${at}: Sets must be a number above 0 (found "${r.get('sets')}")`);
    if (!Number.isInteger(sets) || sets > 20) return errors.push(`${at}: Sets must be a whole number from 1 to 20 (found "${r.get('sets')}")`);
    const reps = parseRepList(r.get('reps'), sets), weight = parseWeightList(r.get('weight'), sets), inc = parseIncrement(r.get('increment'));
    if (reps.error) return errors.push(`${at}: ${reps.error} (found "${r.get('reps')}")`);
    if (weight.error) return errors.push(`${at}: ${weight.error} (found "${r.get('weight')}")`);
    if (inc.error) return errors.push(`${at}: ${inc.error} (found "${r.get('increment')}")`);
    if (inc.value && !weight.value) return errors.push(`${at}: Increase needs a Weight to add to`);
    const long = tooLong(at, 'Exercise', name, 80) || tooLong(at, 'Rest', r.get('rest'), 20) || tooLong(at, 'Execution', r.get('notes'), 300);
    if (long) return errors.push(long);
    cur.exercises.push({ name, sets, reps: reps.value, weight: weight.value, increment: inc.value, rest: r.get('rest'), notes: r.get('notes') });
  });
  return days;
}

function parseDietSheet(ws, errors) {
  const rows = readTable(ws, 'Diet', ['meal', 'food', 'calories', 'protein', 'carbs', 'fat'], ['food', 'calories'], errors);
  if (!rows) return null;
  const out = [];
  rows.forEach(r => {
    const at = `Diet row ${r.excelRow}`, m = { meal: r.get('meal') || 'Meal', food: r.get('food') };
    if (!m.food) return errors.push(`${at}: Food is empty`);
    const long = tooLong(at, 'Food', m.food, 120);
    if (long) return errors.push(long);
    for (const k of ['calories', 'protein', 'carbs', 'fat']) {
      const v = parseNum(r.get(k));
      if (Number.isNaN(v) || v < 0) return errors.push(`${at}: ${k[0].toUpperCase() + k.slice(1)} must be a number (found "${r.get(k)}")`);
      if (k === 'calories' && v === '') return errors.push(`${at}: Calories is empty`);
      m[k] = v === '' ? '' : k === 'calories' ? Math.round(v) : round(v);
    }
    const known = ['Breakfast', 'Lunch', 'Dinner', 'Snack'].find(x => x.toLowerCase() === m.meal.toLowerCase());
    if (known) m.meal = known;
    out.push(m);
  });
  return out;
}

function parseSupplementSheet(ws, errors) {
  const rows = readTable(ws, 'Supplements', ['supplement', 'dose', 'unit', 'time'], ['supplement'], errors);
  if (!rows) return null;
  const out = [];
  rows.forEach(r => {
    const at = `Supplements row ${r.excelRow}`, dose = parseNum(r.get('dose'));
    if (!r.get('supplement')) return errors.push(`${at}: Supplement is empty`);
    const long = tooLong(at, 'Supplement', r.get('supplement'), 60);
    if (long) return errors.push(long);
    if (Number.isNaN(dose) || dose < 0) return errors.push(`${at}: Dose must be a number (found "${r.get('dose')}")`);
    if (out.some(x => x.name.toLowerCase() === r.get('supplement').toLowerCase())) return errors.push(`${at}: "${r.get('supplement')}" is listed twice`);
    const pickKnown = (list, v) => list.find(x => x.toLowerCase() === v.toLowerCase()) || v;
    out.push({ name: r.get('supplement'), dose, unit: pickKnown(UNITS, r.get('unit')), time: pickKnown(SUP_TIMES, r.get('time')) });
  });
  return out;
}

// accepts "Bed time | 23:00" pairs, or a header row with the values underneath
function parseSleepSheet(ws, errors) {
  const rows = sheetRows(ws).map(r => r.cells);
  const find = word => {
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      if (!norm(rows[r][c]).startsWith(word)) continue;
      const near = [rows[r][c + 1], rows[r + 1]?.[c]].map(v => String(v ?? '').trim()).filter(Boolean);
      return { raw: near.find(v => parseTime(v)) || near[0] || '', found: true };
    }
    return { found: false };
  };
  const plan = {};
  for (const [key, word, label] of [['bed', 'bed', 'Bed time'], ['wake', 'wake', 'Wake time']]) {
    const hit = find(word);
    if (!hit.found) { errors.push(`Sleep: no "${label}" row found`); continue; }
    const t = parseTime(hit.raw);
    if (!t) errors.push(`Sleep: ${label} must be a time like 23:00 (found "${hit.raw}")`);
    else plan[key] = t;
  }
  return plan.bed && plan.wake ? plan : null;
}

export async function handleImportFile(file) {
  if (typeof XLSX === 'undefined') return toast(NO_XLSX);
  const cfg = IMPORTS[importKind];
  let wb;
  try { wb = XLSX.read(await file.arrayBuffer()); } catch (e) { return showImportPreview({ file: file.name, fatal: 'This file could not be read. Save it as .xlsx and try again.' }); }
  const sheetKey = name => Object.keys(SHEETS).find(key => SHEETS[key].match.test(norm(name)));
  const found = {}, ignored = [];
  wb.SheetNames.forEach(name => {
    const k = sheetKey(name);
    if (k && cfg.sheets.includes(k)) { if (!found[k]) found[k] = wb.Sheets[name]; } else if (k) ignored.push(k);
  });
  // a workout file with one unnamed sheet is clearly the workout plan
  const content = wb.SheetNames.filter(n => norm(n) !== 'howtouse');
  if (importKind === 'workout' && !found.workout && content.length === 1 && !sheetKey(content[0])) found.workout = wb.Sheets[content[0]];
  if (!Object.keys(found).length) {
    const labels = cfg.sheets.map(k => SHEETS[k].label);
    const want = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}` : labels[0];
    const hint = importKind === 'other' && ignored.includes('workout') ? ' This looks like a workout plan, use Import workout plan for it.'
      : importKind === 'workout' && ignored.length ? ' This looks like a diet, supplements or sleep file, use the other import for it.' : '';
    return showImportPreview({ file: file.name, fatal: `No ${want} sheet was found. Sheets in this file: ${wb.SheetNames.join(', ')}.${hint}` });
  }
  const errors = [], r = { file: file.name, errors, bad: {}, found, kind: importKind, ignoredWorkout: importKind === 'other' && ignored.includes('workout') };
  const run = (key, prop, parse) => {
    if (!found[key]) return;
    const before = errors.length;
    r[prop] = parse(found[key], errors);
    r.bad[key] = errors.length > before;
  };
  run('workout', 'plan', parseWorkoutSheet);
  run('diet', 'diet', parseDietSheet);
  run('supplements', 'regulars', parseSupplementSheet);
  run('sleep', 'sleepPlan', parseSleepSheet);
  pendingImport = r;
  showImportPreview(r);
}

export function openImport(kind) {
  importKind = kind;
  pendingImport = null;
  const intro = kind === 'workout'
    ? 'Use an Excel file with a <b>Workout</b> sheet: one row per exercise, rows with the same Day become one training day. It replaces your whole workout plan.'
    : 'Use one Excel file with up to three sheets: <b>Diet</b>, <b>Supplements</b> and <b>Sleep</b>. Only the sheets in the file get replaced.';
  showModal(`<h3>${IMPORTS[kind].title}</h3>
    <p class="muted">${intro} Your logged history is never touched.</p>
    <label class="drop" id="drop"><input type="file" id="importFile" accept=".xlsx,.xls,.ods" hidden>
      <b>Choose a file</b><span class="muted">or drop it here</span></label>
    <div class="actions" style="justify-content:space-between"><button class="ghost" data-act="template" data-kind="${kind}">${IMPORTS[kind].template}</button><button class="ghost" data-act="close">Cancel</button></div>`);
}

function showImportPreview(r) {
  if (r.fatal) {
    return showModal(`<h3>${IMPORTS[importKind].title}</h3><p class="muted">${esc(r.file)}</p><div class="imp-errors">${esc(r.fatal)}</div>
      <div class="actions"><button class="ghost" data-act="close">Close</button><button class="primary" data-act="import-open" data-kind="${importKind}">Try another file</button></div>`);
  }
  // items: what the sheet produced; describe: summary when it has items; cleared: what an empty sheet wipes
  const line = (key, label, items, describe, cleared) => {
    if (!r.found[key]) return `<div class="imp-row skip"><b>${label}</b><span>Not in the file, stays as it is</span></div>`;
    if (r.bad[key]) return `<div class="imp-row bad"><b>${label}</b><span>Has problems, see below</span></div>`;
    if (Array.isArray(items) && !items.length) return `<div class="imp-row warn"><b>${label}</b><span>Empty, your ${cleared} will be cleared</span></div>`;
    return `<div class="imp-row"><b>${label}</b><span>${describe(items)}</span></div>`;
  };
  const rows = (r.kind === 'workout' ? [
    line('workout', 'Workout', r.plan, v => { const rest = v.filter(isRestDay).length; return `${plural(v.length - rest, 'workout')}${rest ? `, ${plural(rest, 'rest day')}` : ''}, ${plural(v.reduce((a, d) => a + d.exercises.length, 0), 'exercise')}`; }, 'workout plan'),
    ...(r.plan && !r.bad.workout ? r.plan.map(d => `<div class="imp-row sub"><b>${esc(d.name)}</b><span>${isRestDay(d) ? 'Rest day' : `${daySets(d)} sets: ${d.exercises.map(e => esc(e.name)).join(', ')}`}</span></div>`) : []),
  ] : [
    line('diet', 'Diet', r.diet, v => `${plural(v.length, 'meal')}, ${thousands(sum(v, 'calories'))} kcal and ${sum(v, 'protein')} g protein a day`, 'meal plan'),
    line('supplements', 'Supplements', r.regulars, v => v.map(x => esc(x.name)).join(', '), 'supplement list'),
    line('sleep', 'Sleep', r.sleepPlan, v => `Bed at ${v.bed}, up at ${v.wake} (${round(sleepHours(v.bed, v.wake))} h)`, ''),
    r.ignoredWorkout ? '<div class="imp-row skip"><b>Workout</b><span>Skipped, use Import workout plan for it</span></div>' : '',
  ]).join('');
  const errs = r.errors.length ? `<div class="imp-errors"><b>Fix ${r.errors.length === 1 ? 'this' : `these ${r.errors.length} problems`} in the file, then import it again:</b>
    <ul>${r.errors.slice(0, 10).map(e => `<li>${esc(e)}</li>`).join('')}</ul>${r.errors.length > 10 ? `<div>and ${r.errors.length - 10} more</div>` : ''}</div>` : '';
  showModal(`<h3>${IMPORTS[r.kind].title}</h3><p class="muted">${esc(r.file)}</p>${rows}${errs}<div class="imp-errors" id="applyErr" hidden></div>
    <div class="actions"><button class="ghost" data-act="${r.errors.length ? 'import-open' : 'close'}" data-kind="${r.kind}">${r.errors.length ? 'Choose another file' : 'Cancel'}</button>
      <button class="primary" data-act="import-apply" ${r.errors.length ? 'disabled' : ''}>${r.kind === 'workout' ? 'Replace my workout plan' : 'Replace these parts'}</button></div>`);
}

// imports and other whole-plan writes need a connection and an empty outbox
export async function ensureOnline() {
  if (!navigator.onLine) throw new Error(OFFLINE);
  await outbox.flush();
  if (outbox.pending()) throw new Error("Your latest changes aren't synced yet. Connect to the internet and try again.");
}

export async function applyImport(btn) {
  const r = pendingImport;
  if (!r || r.errors.length) return;
  btn.disabled = true; btn.textContent = 'Importing...';
  try {
    await ensureOnline();
    if (r.kind === 'workout') await replaceWorkoutPlan(r.plan);
    else await replaceOtherPlan({ diet: r.diet, regulars: r.regulars, sleepPlan: r.sleepPlan });
  } catch (e) {
    const box = document.getElementById('applyErr');
    box.textContent = `Nothing was changed. ${friendly(e)}`; box.hidden = false;
    btn.disabled = false; btn.textContent = 'Try again';
    return;
  }
  pendingImport = null;
  closeModal();
  await refresh();
  toast(r.kind === 'workout' ? 'Workout plan imported' : 'Plan imported');
}

// "Start from an example plan" for new accounts
export async function useExamplePlan() {
  try {
    await ensureOnline();
    const res = await fetch('examples/example-plan.json');
    const { days } = await res.json();
    await replaceWorkoutPlan(days.map(d => ({ ...d, exercises: (d.exercises || []).map(e => ({ ...e, notes: e.execution })) })));
  } catch (e) {
    return toast(friendly(e), 3500);
  }
  await refresh();
  toast('Example plan added. Edit it any time in Plan.');
}

export function downloadTemplate(kind) {
  if (typeof XLSX === 'undefined') return toast(NO_XLSX);
  const wb = XLSX.utils.book_new();
  const add = (name, rows, widths) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  if (kind === 'workout') {
    add('How to use', [
      ['Gym Tracker workout plan'], [''],
      ['Fill in the Workout sheet, save the file, then use Import workout plan in the app. Every day becomes a card.'],
      ['One row per exercise. Keep the rows of a day together; leave Day empty to keep adding to the day above.'],
      ['Focus is a short description of the day, like Width & upper chest. It only needs to be on the first row of a day.'],
      ['Reps: one value for every set (8, or a range like 8-12), or one per set separated by commas or slashes (8, 10, 12, 8 or 8/10/12/8).'],
      ['Weight (kg): the same way, one value for every set (80) or one per set (80, 80, 80, 90). Use a dot for decimals (82.5). Leave it empty for bodyweight.'],
      ['Increase (kg): added to every set each time you finish the workout, so 10 turns 80, 80, 80, 90 into 90, 90, 90, 100. Leave it empty to keep the weight the same.'],
      ['Rest and Execution are optional.'],
      ['A rest day is a row with only the Day filled in, for example Rest.'],
      ['Importing replaces your whole workout plan.'],
    ], [100]);
    add('Workout', [SHEETS.workout.cols, ...S.plan.flatMap(d => (isRestDay(d) ? [[d.name, d.focus || '']]
      : d.exercises.map((e, i) => [d.name, i ? '' : d.focus || '', e.name, e.sets, e.reps.replaceAll(',', ', '), (e.weight || '').replaceAll(',', ', '), Number(e.increment) || '', e.rest || '', e.notes || ''])))], [12, 30, 32, 6, 14, 16, 12, 10, 64]);
  } else {
    add('How to use', [
      ['Gym Tracker diet, supplements and sleep plan'], [''],
      ['Fill in the sheets, save the file, then use Import diet, supplements & sleep in the app.'],
      ['Diet: one row per planned meal. Your daily calorie and protein goals are the totals of this sheet.'],
      ['Supplements: one row per supplement you take every day. These become your daily checklist.'],
      ['Sleep: your target bed time and wake time, written like 23:00 and 07:00.'],
      ['Delete a sheet to leave that part of your plan unchanged when importing.'],
      ['Your workout plan has its own file: use Download workout template in the app.'],
    ], [100]);
    add('Diet', [SHEETS.diet.cols, ...S.diet.map(m => [m.meal, m.food, m.calories, m.protein, m.carbs, m.fat])], [12, 30, 10, 12, 10, 10]);
    add('Supplements', [SHEETS.supplements.cols, ...S.regulars.map(r => [r.name, r.dose, r.unit, r.time || ''])], [20, 10, 10, 14]);
    add('Sleep', [SHEETS.sleep.cols, ['Bed time', S.sleepPlan.bed], ['Wake time', S.sleepPlan.wake]], [14, 10]);
  }
  XLSX.writeFile(wb, IMPORTS[kind].file);
  toast('Template downloaded');
}

// every table as a sheet, all rows (not just the last 90 days)
export async function downloadBackup(btn) {
  if (typeof XLSX === 'undefined') return toast(NO_XLSX);
  if (!navigator.onLine) return toast(OFFLINE, 3000);
  btn.disabled = true;
  try {
    const wb = XLSX.utils.book_new();
    for (const [name, table, order] of BACKUP_TABLES) {
      const rows = await fetchAll(table, order);
      XLSX.utils.book_append_sheet(wb, rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(empty)']]), name);
    }
    XLSX.writeFile(wb, `gym-tracker-backup-${fmt(new Date())}.xlsx`);
    toast('Backup downloaded');
  } catch (e) {
    toast(friendly(e), 3500);
  } finally {
    btn.disabled = false;
  }
}
