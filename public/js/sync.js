// Loading the account's data from Supabase into the state, and "Show older" pages.
import { S, account, meta, setState, render } from './state.js';
import { loadAll, loadOlder } from './db.js';
import { saveCache } from './cache.js';
import * as outbox from './outbox.js';

export const status = { error: null, lastLoad: 0 };
let loading = null;

export function refresh() {
  if (!loading) loading = doRefresh().finally(() => { loading = null; });
  return loading;
}

async function doRefresh() {
  const user = account.user;
  if (!user) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    // unsent changes go first, otherwise the fresh copy would undo them on screen
    await outbox.flush();
    if (outbox.pending()) return false;   // still offline: keep showing the local copy
    const version = meta.version;
    let fresh;
    try {
      fresh = await loadAll(user.id);
    } catch (e) {
      status.error = e;
      render();
      return false;
    }
    if (account.user?.id !== user.id) return false;
    if (meta.version !== version || outbox.pending()) continue;   // something was tapped while loading
    setState(fresh);
    status.error = null;
    status.lastLoad = Date.now();
    saveCache(user.id, S);
    render();
    return true;
  }
  return false;
}

// fetch the next 90 days further back for one history list
export async function fetchOlder(kind) {
  const { rows, since, more } = await loadOlder(kind, S.since[kind]);
  const have = new Set(S[kind].map(x => x.id));
  S[kind].push(...rows.filter(x => !have.has(x.id)));
  S.since[kind] = since;
  S.more[kind] = more;
  saveCache(account.user?.id, S);
}
