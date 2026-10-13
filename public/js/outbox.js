// Writes that couldn't reach Supabase (no signal at the gym) wait here and are replayed in order.
// Stored per account as gym_outbox_<userId>.
// An op is { table, action: 'upsert', rows, onConflict? } or { table, action: 'delete', match }.
import { supabase } from './supabase.js';

let userId = null, queue = [], timer = null, flushing = null;
const listeners = { change: [], rejected: [] };
const key = id => `gym_outbox_${id}`;

export const on = (event, fn) => listeners[event].push(fn);
const emit = (event, arg) => listeners[event].forEach(fn => fn(arg));
export const pending = () => queue.length;

export function useAccount(id) {
  userId = id;
  try { queue = id ? JSON.parse(localStorage.getItem(key(id))) || [] : []; } catch (e) { queue = []; }
  schedule();
  emit('change');
}

export function clearAccount(id) {
  localStorage.removeItem(key(id));
  if (id === userId) { queue = []; schedule(); emit('change'); }
}

function persist() {
  if (userId) localStorage.setItem(key(userId), JSON.stringify(queue));
  schedule();
  emit('change');
}

// retry every 30 seconds while something is waiting
function schedule() {
  if (queue.length && !timer) timer = setInterval(flush, 30000);
  if (!queue.length && timer) { clearInterval(timer); timer = null; }
}

// no response, server trouble or an expired token: try again later
const isTransient = status => !status || status === 401 || status === 408 || status === 429 || status >= 500;

// returns 'ok', 'later', or the database error when the write was rejected
async function run(op) {
  let q = supabase.from(op.table);
  q = op.action === 'upsert'
    ? q.upsert(op.rows, op.onConflict ? { onConflict: op.onConflict } : {})
    : q.delete().match(op.match);
  try {
    const { error, status } = await q;
    if (!error) return 'ok';
    return isTransient(status) ? 'later' : error;
  } catch (e) {
    return 'later';
  }
}

// queue behind anything already waiting so the order is kept
export async function send(op) {
  if (queue.length || !navigator.onLine) {
    queue.push(op); persist();
    if (navigator.onLine) flush();
    return;
  }
  const res = await run(op);
  if (res === 'later') { queue.push(op); persist(); }
  else if (res !== 'ok') emit('rejected', res);
}

export function flush() {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}

async function doFlush() {
  const owner = userId;
  while (queue.length && navigator.onLine && owner === userId) {
    const res = await run(queue[0]);
    if (owner !== userId) return;
    if (res === 'later') break;
    if (res !== 'ok') emit('rejected', res);
    queue.shift();   // sent, or rejected by the database: either way it's done
    persist();
  }
}
