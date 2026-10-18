/**
 * Keeps the game alive across page reloads (mobile browsers reload or discard background tabs, and the dev server
 * reloads the page when the connection drops): the level being played with its marks and undo history, and the
 * menu position. Stored in localStorage; every access is guarded, so private mode just means "nothing is saved".
 */
const GAME_KEY = 'savedGame';
const MENU_KEY = 'menuState';

const read = (key) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or unavailable */ } };

export function saveGame(snapshot) { write(GAME_KEY, snapshot); }

export function clearSavedGame() { try { localStorage.removeItem(GAME_KEY); } catch { /* ignore */ } }

/** Returns the saved game, or null if there is none or it is not usable. */
export function loadSavedGame() {
  const s = read(GAME_KEY);
  const grid = s?.levelData?.grid;
  if (!s || s.v !== 1 || !grid || !Array.isArray(s.cellStates) || s.cellStates.length !== grid.width * grid.height) return null;
  if (!Array.isArray(s.undoStack) || !Array.isArray(s.redoStack) || !s.session || typeof s.title !== 'string') return null;
  return s;
}

export function saveMenuState(state) { write(MENU_KEY, state); }
export function loadMenuState() { return read(MENU_KEY); }
