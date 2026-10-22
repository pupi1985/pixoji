/**
 * Completed predefined levels, remembered across sessions in localStorage ("completedLevels").
 * Levels are identified by their content id (see shared/level-index.js), so ticks stay on the right level when levels are
 * added, removed or reordered, and a level that was changed on purpose (new id) starts as not completed.
 * Falls back to memory if localStorage is unavailable.
 */
const STORAGE_KEY = 'completedLevels';

let completed = new Set();
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  if (Array.isArray(parsed)) completed = new Set(parsed.filter((k) => typeof k === 'string'));
} catch (e) { /* unavailable or corrupted: start empty */ }

export const isLevelCompleted = (levelId) => completed.has(levelId);

export function markLevelCompleted(levelId) {
  if (completed.has(levelId)) return;
  completed.add(levelId);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed])); } catch (e) { /* kept in memory only */ }
}
