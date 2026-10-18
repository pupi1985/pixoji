/**
 * Completed-level tracking. Stored in localStorage as a JSON array of "category/level" keys;
 * falls back to memory (for this session only) if localStorage is unavailable (private mode, blocked, ...).
 */
const STORAGE_KEY = 'completedLevels';
const keyOf = (category, level) => `${category}/${level}`;

let completed = new Set();
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  if (Array.isArray(parsed)) completed = new Set(parsed.filter((k) => typeof k === 'string'));
} catch (e) { /* unavailable or corrupted: start empty */ }

export const isLevelCompleted = (category, level) => completed.has(keyOf(category, level));

export function markLevelCompleted(category, level) {
  const k = keyOf(category, level);
  if (completed.has(k)) return;
  completed.add(k);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed])); } catch (e) { /* kept in memory only */ }
}
