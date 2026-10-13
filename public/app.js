// Startup, the auth state, routing between pages, and the navigation.
import { configured, supabase } from './js/supabase.js';
import { S, account, setState, setRenderer, goals, view } from './js/state.js';
import { friendly, sum, today } from './js/util.js';
import { icon, toast } from './js/ui/common.js';
import { installDial } from './js/ui/sleepdial.js';
import { installActions } from './js/actions.js';
import { installAuth, showAuth, markOnboarded, displayName } from './js/auth.js';
import { loadCache } from './js/cache.js';
import * as outbox from './js/outbox.js';
import { refresh, status } from './js/sync.js';
import { renderDashboard, onboarding } from './js/views/dashboard.js';
import { renderPlan } from './js/views/plan.js';
import { renderWorkouts, trackSwipe, showSlide } from './js/views/workouts.js';
import { renderCalories } from './js/views/calories.js';
import { renderSupplements } from './js/views/supplements.js';
import { renderSleep } from './js/views/sleep.js';
import { renderSettings } from './js/views/settings.js';

// key, label, short label for the phone bar, accent color, sidebar group
const TABS = [
  ['dashboard', 'Dashboard', 'Home', '#e8eaf0', 'Overview'],
  ['plan', 'Plan', 'Plan', '#4f8cff', 'Overview'],
  ['workouts', 'Workouts', 'Lifts', '#4f8cff', 'Track'],
  ['calories', 'Calories', 'Food', '#ff9f43', 'Track'],
  ['supplements', 'Supplements', 'Supps', '#35c47c', 'Track'],
  ['sleep', 'Sleep', 'Sleep', '#a77bff', 'Track'],
  ['settings', 'Settings', 'Settings', '#8b93a7', 'App'],
];
const VIEWS = { dashboard: renderDashboard, plan: renderPlan, workouts: renderWorkouts, calories: renderCalories, supplements: renderSupplements, sleep: renderSleep, settings: renderSettings };
let tab = TABS.some(t => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';

// ---------- navigation ----------
function navBadge(k) {
  if (!S.loaded) return '';
  if (k === 'supplements' && S.regulars.length) {
    const taken = S.regulars.filter(r => S.supplements.some(x => x.date === today() && x.supplement === r.name)).length;
    return `${taken}/${S.regulars.length}`;
  }
  if (k === 'workouts') return S.sessions.some(x => x.date === today()) ? '✓' : '';
  if (k === 'sleep') return S.sleep.some(x => x.date === today()) ? '✓' : '';
  if (k === 'calories' && goals().calGoal) return `${Math.round(sum(S.calories.filter(c => c.date === today()), 'calories') / goals().calGoal * 100)}%`;
  return '';
}
function renderNav() {
  let group = '';
  document.getElementById('sidenav').innerHTML = TABS.map(([k, label, , color, g]) => {
    const head = g !== group ? `<div class="nav-label">${g}</div>` : '';
    group = g;
    const badge = navBadge(k);
    return `${head}<button class="nav-item ${k === tab ? 'active' : ''}" style="--c:${color}" data-act="tab" data-tab="${k}">${icon(k)}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
  }).join('');
  document.getElementById('bottomnav').innerHTML = TABS.filter(t => t[0] !== 'settings').map(([k, , short, color]) =>
    `<button class="bn-item ${k === tab ? 'active' : ''}" style="--c:${color}" data-act="tab" data-tab="${k}"><span class="bn-ic">${icon(k)}</span>${short}</button>`).join('');
  document.getElementById('mSettings').classList.toggle('active', tab === 'settings');
  const name = displayName(account.user);
  document.getElementById('sideUser').textContent = name;
  document.getElementById('sideUser').title = `Signed in as ${name}`;
}

// "Not synced yet" while the outbox has changes waiting
function renderSync() {
  const n = outbox.pending();
  document.getElementById('syncDot').classList.toggle('pending', n > 0);
  const pill = document.getElementById('syncPill');
  pill.classList.toggle('pending', n > 0);
  pill.textContent = n ? 'Not synced yet' : 'Synced';
  pill.title = n ? `${n} change${n === 1 ? '' : 's'} waiting for a connection` : '';
  document.getElementById('syncPillM').hidden = !n;
}

function render() {
  if (!account.user) return;
  const prevScroll = document.querySelector('.hm-scroll')?.scrollLeft;
  renderNav();
  renderSync();
  const failed = !S.loaded && status.error;
  document.getElementById('notice').innerHTML = failed
    ? `<div class="banner error"><span>Couldn't load your data. ${friendly(status.error)}</span><button class="ghost" data-act="retry">Try again</button></div>` : '';
  document.getElementById('app').innerHTML = S.loaded ? VIEWS[tab]() : failed ? '' : '<div class="loading">Loading your data...</div>';
  // keep the grid where the user left it, otherwise start at today
  const hm = document.querySelector('.hm-scroll');
  if (hm) hm.scrollLeft = prevScroll ?? hm.scrollWidth;
  showSlide(view.woSlide, false);
  const ob = onboarding();
  if (S.loaded && ob.step1 && ob.step2 && !ob.finished) markOnboarded();
}
setRenderer(render);

function switchTab(k) {
  if (k === tab) return;
  tab = k;
  history.replaceState(null, '', '#' + tab);
  render();
  const app = document.getElementById('app');
  app.style.animation = 'none'; void app.offsetWidth; app.style.animation = '';
  window.scrollTo(0, 0);
}

// ---------- accounts ----------
let mode = 'loading';   // 'auth' | 'app'

function enterAccount(user) {
  account.user = user;
  outbox.useAccount(user.id);
  setState(loadCache(user.id) || {});   // show this account's local copy straight away
  mode = 'app';
  document.getElementById('authRoot').hidden = true;
  document.getElementById('appRoot').hidden = false;
  render();
  refresh();                             // then the fresh data from Supabase
}

function leaveAccount() {
  account.user = null;
  outbox.useAccount(null);
  setState({});
  status.error = null;
}

function handleAuth(event, session) {
  if (!session) {
    if (account.user) leaveAccount();
    if (mode !== 'auth') showAuth('login');
    mode = 'auth';
    return;
  }
  if (session.user.id !== account.user?.id) {
    // a fresh log in starts on the Dashboard; reopening the app keeps the page from the URL
    if (event === 'SIGNED_IN' && mode === 'auth') { tab = 'dashboard'; history.replaceState(null, '', '#dashboard'); }
    enterAccount(session.user);
  } else {
    account.user = session.user;          // token refresh or profile update
  }
}


// ---------- startup ----------
document.getElementById('logo1').innerHTML = document.getElementById('logo2').innerHTML = icon('workouts');
document.getElementById('mSettings').innerHTML = icon('settings');
installAuth();
installActions({ switchTab });
installDial();
trackSwipe();

if (!configured) {
  showAuth('setup');
} else {
  showAuth('loading');
  // run outside the auth callback: awaiting Supabase calls inside it can deadlock
  supabase.auth.onAuthStateChange((event, session) => setTimeout(() => handleAuth(event, session), 0));

  outbox.on('change', () => { if (account.user) renderSync(); });
  outbox.on('rejected', err => {
    toast(`A change couldn't be saved: ${friendly(err)}`, 4000);
    refresh();   // put the screen back in line with the database
  });
  window.addEventListener('online', () => { if (account.user) refresh(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && account.user && Date.now() - status.lastLoad > 60000) refresh();
  });
}
