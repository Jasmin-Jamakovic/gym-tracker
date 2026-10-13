import { S, account, goals } from '../state.js';
import { esc, num, ratio, sum, thousands, today } from '../util.js';
import { C, icon, kpi, ring, secHead, EGG } from '../ui/common.js';
import { sleepCheck, supChecklist, workoutCheck } from '../ui/checks.js';
import { fmtDur } from '../ui/sleepdial.js';

// ---------- new account onboarding ----------
const laterKey = () => `gym_setup_later_${account.user?.id}`;
export const setUpLater = () => localStorage.setItem(laterKey(), '1');
export function onboarding() {
  const step1 = S.plan.length > 0;
  const step2 = S.diet.length > 0 || S.regulars.length > 0 || !!localStorage.getItem(laterKey());
  const finished = !!account.user?.user_metadata?.onboarded;
  return { step1, step2, finished, show: S.loaded && !finished && !(step1 && step2) };
}

function welcomeCard() {
  const { step1, step2 } = onboarding();
  const step = (n, done, title, text, buttons) => `<div class="wl-step ${done ? 'done' : ''}"><span class="wl-n">${done ? '✓' : n}</span>
    <div><b>${title}</b><div class="muted small">${text}</div><div class="quick">${buttons}</div></div></div>`;
  return `<div class="card welcome"><h3>Welcome to Gym Tracker</h3>
    <p class="muted">Set up your plan in two steps. Once it's in, you just check things off each day.</p>
    ${step(1, step1, 'Workout plan', 'Your training days become cards you tap when a workout is done.',
      '<button class="primary" data-act="import-open" data-kind="workout">Import workout plan</button><button class="ghost" data-act="example-plan">Start from an example plan</button><button class="ghost" data-act="template" data-kind="workout">Download workout template</button>')}
    ${step(2, step2, 'Diet, supplements and sleep', 'Your meal plan sets your daily goals, your supplements become a checklist.',
      '<button class="primary" data-act="import-open" data-kind="other">Import</button><button class="ghost" data-act="template" data-kind="other">Download template</button><button class="ghost" data-act="setup-later">Set up later</button>')}
  </div>`;
}

// ---------- today's numbers ----------
function dashKpis(kcal, prot, g) {
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const night = S.sleep.find(x => x.date === today());
  const left = (goal, have, unit) => (!goal ? 'no meal plan yet' : have >= goal ? 'Goal reached' : `${thousands(goal - have)}${unit} to go`);
  const sleepMin = night ? Math.round(num(night.hours) * 60) : 0, short = Math.round(g.sleepGoal * 60) - sleepMin;

  const cal = kpi(C.orange, icon('calories'), 'Calories', `${pct(kcal, g.calGoal)}%`,
    `${ring(ratio(kcal, g.calGoal), `${pct(kcal, g.calGoal)}%`)}<div><div class="kpi-big">${thousands(kcal)}<small>kcal</small></div><div class="kpi-sub">of ${thousands(g.calGoal)}, ${left(g.calGoal, kcal, '')}</div></div>`,
    kcal >= g.calGoal && g.calGoal ? 'good' : '');
  const pro = kpi('#ff6b8b', `<svg class="ic" viewBox="0 0 24 24">${EGG}</svg>`, 'Protein', `${pct(prot, g.proteinGoal)}%`,
    `${ring(ratio(prot, g.proteinGoal), `${pct(prot, g.proteinGoal)}%`)}<div><div class="kpi-big">${prot}<small>g</small></div><div class="kpi-sub">of ${g.proteinGoal} g, ${left(g.proteinGoal, prot, ' g')}</div></div>`,
    prot >= g.proteinGoal && g.proteinGoal ? 'good' : '');
  const slp = night
    ? kpi(C.purple, icon('sleep'), 'Last night', short <= 0 ? 'On goal' : `${fmtDur(short)} short`,
      `${ring(ratio(num(night.hours), g.sleepGoal), `${pct(num(night.hours), g.sleepGoal)}%`)}<div><div class="kpi-big">${fmtDur(sleepMin).replace(' 00m', '')}</div><div class="kpi-sub">${esc(night.bed)} to ${esc(night.wake)}</div></div>`,
      short <= 0 ? 'good' : 'warn')
    : kpi(C.purple, icon('sleep'), 'Last night', 'Not logged',
      `${ring(0, '?')}<div><div class="kpi-big kpi-empty">No entry</div><button class="linkish" data-act="sleep-check">Slept as planned</button></div>`);
  return `<div class="kpis">${cal}${pro}${slp}</div>`;
}

export function renderDashboard() {
  const t = today(), g = goals();
  const cals = S.calories.filter(c => c.date === t);
  const kcal = sum(cals, 'calories'), prot = sum(cals, 'protein');
  const head = secHead('Today', new Date().toDateString());
  if (onboarding().show) return head + welcomeCard();

  return head + `
  ${dashKpis(kcal, prot, g)}
  <div class="card"><h3>Daily check-in</h3>
    <div class="ci-grid">
      <div><div class="ci-label">Last night</div><div class="checks">${sleepCheck()}</div>
        <div class="ci-label" style="margin-top:18px">Workout</div>${workoutCheck()}</div>
      <div><div class="ci-label">Supplements</div><div class="checks">${supChecklist()}</div></div>
    </div>
  </div>`;
}
