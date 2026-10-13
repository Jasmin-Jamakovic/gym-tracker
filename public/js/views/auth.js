// Screens shown without a session: log in and create account.
import { esc } from '../util.js';
import { icon } from '../ui/common.js';

const pwField = (autocomplete, hint = '') => `<label class="field"><span>Password</span>
  <div class="pw"><input name="password" type="password" required autocomplete="${autocomplete}"><button type="button" data-auth="pw-toggle">Show</button></div>
  ${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
const msgBox = (msg, kind) => (msg ? `<div class="form-msg ${kind}">${esc(msg)}</div>` : '');

export function renderAuth(screen, { username = '', err = '' } = {}) {
  const brand = `<div class="brand"><span class="logo">${icon('workouts')}</span><h1>Gym Tracker</h1></div>`;
  let body;
  if (screen === 'loading') {
    body = '<div class="auth-card"><p class="muted" style="margin:0;text-align:center">Loading...</p></div>';
  } else if (screen === 'setup') {
    body = `<div class="auth-card"><h3>Almost there</h3><p class="muted">Put your Supabase project URL and public key in <b>config.js</b>, then reload this page.</p></div>`;
  } else {
    const login = screen === 'login';
    body = `<form class="auth-card" id="authForm" data-screen="${login ? 'login' : 'signup'}" novalidate>
      <div class="seg auth-tabs"><button type="button" class="${login ? 'on' : ''}" data-auth="tab" data-screen="login">Log in</button><button type="button" class="${login ? '' : 'on'}" data-auth="tab" data-screen="signup">Create account</button></div>
      ${msgBox(err, 'err')}
      <label class="field"><span>Username</span><input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(username)}">
        ${login ? '' : '<span class="hint">Letters, numbers, dots, dashes or underscores</span>'}</label>
      ${login ? pwField('current-password') : pwField('new-password', 'At least 8 characters')}
      <button class="primary wide">${login ? 'Log in' : 'Create account'}</button>
    </form>`;
  }
  return `<div class="auth-box">${brand}${body}</div>`;
}
