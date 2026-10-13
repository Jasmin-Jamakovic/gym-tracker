// Accounts: sign up, log in, log out, change password, delete account.
// People log in with a username. Supabase Auth needs an email, so each username becomes
// <username>@<usernameDomain> behind the scenes. No email is ever sent to it.
import { supabase } from './supabase.js';
import { account } from './state.js';
import { friendly, OFFLINE } from './util.js';
import { closeModal, showModal, toast } from './ui/common.js';
import { renderAuth } from './views/auth.js';
import { clearCache } from './cache.js';
import * as outbox from './outbox.js';
import { deleteAccount } from './db.js';

const DOMAIN = window.GYM_CONFIG?.usernameDomain || 'gym-tracker.invalid';
const USERNAME = /^[a-z0-9._-]{3,30}$/;
const toEmail = username => `${username}@${DOMAIN}`;
export const displayName = user => user?.user_metadata?.username || user?.email?.split('@')[0] || '';

// ---------- the auth screen ----------
let screen = 'loading', lastUsername = '';
export function showAuth(next = 'login', opts = {}) {
  screen = next;
  document.getElementById('appRoot').hidden = true;
  const root = document.getElementById('authRoot');
  root.hidden = false;
  root.innerHTML = renderAuth(screen, { username: lastUsername, ...opts });
  const inputs = [...root.querySelectorAll('input')];
  (inputs.find(i => !i.value) || inputs[0])?.focus();
}

async function submitAuth(form) {
  const kind = form.dataset.screen, btn = form.querySelector('button.primary');
  const username = form.elements.username.value.trim().toLowerCase(), password = form.elements.password.value;
  lastUsername = username;
  if (!username) return showAuth(kind, { err: 'Enter your username.' });
  if (kind === 'signup' && !USERNAME.test(username)) return showAuth(kind, { err: 'Use 3 to 30 letters, numbers, dots, dashes or underscores, no spaces.' });
  if (!password) return showAuth(kind, { err: 'Enter your password.' });
  if (kind === 'signup' && password.length < 8) return showAuth(kind, { err: 'Use at least 8 characters.' });
  if (!navigator.onLine) return showAuth(kind, { err: OFFLINE });

  btn.disabled = true;
  try {
    if (kind === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.signUp({ email: toEmail(username), password, options: { data: { username } } });
      if (error) throw error;
      if (!data.session) throw new Error('No session after sign up: turn off "Confirm email" in Supabase (Authentication, Sign In / Providers, Email).');
    }
    // onAuthStateChange takes it from here
  } catch (e) {
    showAuth(kind, { err: friendly(e) });
  }
}

export function installAuth() {
  document.addEventListener('submit', e => {
    if (e.target.id !== 'authForm') return;
    e.preventDefault();
    submitAuth(e.target);
  });
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-auth]');
    if (!el) return;
    if (el.dataset.auth === 'tab') {
      const username = document.querySelector('#authForm [name=username]')?.value.trim();
      if (username) lastUsername = username;
      showAuth(el.dataset.screen);
    }
    if (el.dataset.auth === 'pw-toggle') {
      const input = el.parentElement.querySelector('input');
      input.type = input.type === 'password' ? 'text' : 'password';
      el.textContent = input.type === 'password' ? 'Show' : 'Hide';
    }
  });
}

// ---------- account actions in Settings ----------
export function openChangePassword() {
  const form = showModal(`<h3>Change password</h3><form id="mform" novalidate><div class="form-msg err" hidden></div>
    <label class="field"><span>New password</span><div class="pw"><input name="password" type="password" minlength="8" required autocomplete="new-password"><button type="button" data-auth="pw-toggle">Show</button></div>
      <span class="hint">At least 8 characters</span></label>
    <div class="actions"><button type="button" class="ghost" data-act="close">Cancel</button><button class="primary">Save</button></div></form>`);
  const fail = msg => { const box = form.querySelector('.form-msg'); box.textContent = msg; box.hidden = false; };
  form.onsubmit = async e => {
    e.preventDefault();
    const password = form.elements.password.value;
    if (password.length < 8) return fail('Use at least 8 characters.');
    if (!navigator.onLine) return fail(OFFLINE);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return fail(friendly(error));
    closeModal();
    toast('Password changed');
  };
}

export async function logout() {
  const n = outbox.pending();
  if (n && !confirm(`${n === 1 ? "1 change isn't" : `${n} changes aren't`} synced yet. Log out anyway?`)) return;
  const id = account.user?.id;
  clearCache(id);
  outbox.clearAccount(id);
  await supabase.auth.signOut({ scope: 'local' });   // only this device
}

export function openDeleteAccount() {
  const form = showModal(`<h3>Delete account</h3><form id="mform"><div class="form-msg err" hidden></div>
    <p class="muted">This deletes your login and every plan and log entry. It can't be undone. Download a backup first if you want to keep anything.</p>
    <label class="field"><span>Type DELETE to confirm</span><input name="confirm" autocomplete="off"></label>
    <div class="actions"><button type="button" class="ghost" data-act="close">Cancel</button><button class="danger-btn" disabled>Delete my account</button></div></form>`);
  const btn = form.querySelector('.danger-btn');
  form.elements.confirm.oninput = () => { btn.disabled = form.elements.confirm.value.trim() !== 'DELETE'; };
  form.onsubmit = async e => {
    e.preventDefault();
    if (form.elements.confirm.value.trim() !== 'DELETE') return;
    const box = form.querySelector('.form-msg');
    if (!navigator.onLine) { box.textContent = OFFLINE; box.hidden = false; return; }
    btn.disabled = true;
    try {
      await deleteAccount();
    } catch (err) {
      box.textContent = friendly(err); box.hidden = false; btn.disabled = false;
      return;
    }
    const id = account.user?.id;
    clearCache(id);
    outbox.clearAccount(id);
    localStorage.removeItem(`gym_setup_later_${id}`);
    closeModal();
    await supabase.auth.signOut({ scope: 'local' });
    toast('Your account was deleted', 3000);
  };
}

// remembered on the account, so the Welcome card doesn't come back on another device
let marked = false;
export async function markOnboarded() {
  if (marked || account.user?.user_metadata?.onboarded) return;
  marked = true;   // one try per visit; the next visit tries again if this one failed
  const { data } = await supabase.auth.updateUser({ data: { onboarded: true } });
  if (data?.user) account.user = data.user;
}
