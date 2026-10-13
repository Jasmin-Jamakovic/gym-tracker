// Per-account local copy of the data, so the app starts instantly.
// Stored as gym_cache_<userId>, so two people on one laptop never see each other's data.
const key = userId => `gym_cache_${userId}`;

export function loadCache(userId) {
  try { return JSON.parse(localStorage.getItem(key(userId))) || null; } catch (e) { return null; }
}

export function saveCache(userId, data) {
  if (!userId) return;
  try { localStorage.setItem(key(userId), JSON.stringify(data)); } catch (e) { /* storage full: the server still has everything */ }
}

export function clearCache(userId) {
  localStorage.removeItem(key(userId));
}
