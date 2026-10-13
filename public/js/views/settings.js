import { account, goals } from '../state.js';
import { esc, round, thousands } from '../util.js';
import { secHead } from '../ui/common.js';
import { importBtns } from '../import.js';
import { displayName } from '../auth.js';
import { THEMES, getTheme } from '../theme.js';

export function renderSettings() {
  const g = goals(), theme = getTheme();
  const seg = THEMES.map(([k, l]) => `<button class="${theme === k ? 'on' : ''}" data-act="theme" data-theme="${k}">${l}</button>`).join('');
  return secHead('Settings', 'Your account, your plan and your data.') + `
    <div class="card"><h3>Account</h3>
      <div class="account-row"><div><div class="muted small">Signed in as</div><b>${esc(displayName(account.user))}</b></div>
        <div class="quick" style="margin:0"><button class="ghost" data-act="change-password">Change password</button><button class="ghost" data-act="logout">Log out</button><button class="danger-btn" data-act="delete-account">Delete account</button></div></div>
    </div>
    <div class="card"><div class="card-head"><div><h3>Theme</h3><div class="muted small">Classic is the dark look, Cartoon is bold and colorful. Saved on this device.</div></div><div class="seg">${seg}</div></div></div>
    <div class="card"><h3>Import your plan</h3>
      <p class="muted">Two Excel files: one for your workout plan, and one for your diet, supplements and sleep. Templates come filled with your current plan, so they also work as a backup.</p>
      <div class="imp-group"><div><b>Workout plan</b><div class="muted small">Training days and exercises</div></div><div class="quick">${importBtns('workout')}</div></div>
      <div class="imp-group"><div><b>Diet, supplements and sleep</b><div class="muted small">Meal plan, daily supplements, sleep schedule</div></div><div class="quick">${importBtns('other')}</div></div></div>
    <div class="card"><h3>Daily goals</h3>
      <p class="muted">Your goals come from your plan: ${thousands(g.calGoal)} kcal and ${g.proteinGoal} g protein from the diet plan, ${round(g.sleepGoal)} h from the sleep schedule.</p>
      <button class="ghost" data-act="tab" data-tab="plan">Open plan</button></div>
    <div class="card"><h3>Data</h3>
      <p class="muted">Download everything you've logged and planned as an Excel file, one sheet per table.</p>
      <div class="quick"><button class="ghost" data-act="backup">Download backup (.xlsx)</button><button class="danger-btn" data-act="clear">Clear all logged entries</button></div></div>`;
}
