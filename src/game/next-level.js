/**
 * What "Next" means after a level is cleared.
 *  - a random level:      another random level of the same difficulty;
 *  - a predefined level:  the next level of the same difficulty, or - after the last one - the first level of the next difficulty
 *                         that has levels;
 *  - the very last level (or a level that is no longer in the list): nothing, the game offers the menu instead.
 * Returns { kind: 'random', difficulty } | { kind: 'predefined', difficulty, entry, number } | null.
 */
export function nextLevel(session, catalog) {
  if (!session) return null;
  if (session.mode === 'random') return { kind: 'random', difficulty: session.difficulty };
  if (!catalog?.index) return null;
  const list = catalog.entries(session.difficulty);
  const at = list.findIndex((e) => e.id === session.levelId);
  if (at < 0) return null;
  if (at + 1 < list.length) return { kind: 'predefined', difficulty: session.difficulty, entry: list[at + 1], number: at + 2 };
  const next = Object.keys(catalog.index.difficulties).map(Number).filter((d) => d > session.difficulty && catalog.count(d) > 0).sort((a, b) => a - b)[0];
  return next === undefined ? null : { kind: 'predefined', difficulty: next, entry: catalog.entries(next)[0], number: 1 };
}

/** Text of the button shown under a cleared level. */
export function nextLabel(target) {
  if (!target) return 'Menu';
  if (target.kind === 'random') return 'New level ▶';
  return 'Next ▶';
}
