// The look of the app: 'classic' (dark) or 'cartoon'. Saved on the account (user_metadata.theme), so it follows
// the user to every device. This browser keeps the last one too, so index.html can apply it before the first paint.
import { supabase } from './supabase.js';
import { account } from './state.js';
import { friendly } from './util.js';
import { toast } from './ui/common.js';

const KEY = 'gym_theme';
export const THEMES = [['classic', 'Classic'], ['cartoon', 'Cartoon']];
const valid = t => (t === 'cartoon' ? 'cartoon' : 'classic');

export const getTheme = () => valid(document.documentElement.dataset.theme);

export function applyTheme(t) {
  document.documentElement.dataset.theme = valid(t);
  try { localStorage.setItem(KEY, valid(t)); } catch (e) { /* private mode: the account still has it */ }
}

// the account's theme, on log in and whenever the profile changes
export const applyUserTheme = user => applyTheme(user?.user_metadata?.theme);

export async function setTheme(t) {
  applyTheme(t);
  const { data, error } = await supabase.auth.updateUser({ data: { theme: valid(t) } });
  if (error) return toast(`Theme not saved to your account: ${friendly(error)}`, 3000);
  if (data?.user) account.user = data.user;
}
