/**
 * The level index: public/levels/index.json lists, per difficulty, the predefined levels in play order.
 *
 *   { "schema": 2, "difficulties": { "1": [ { "id": "3fa9c1d27b", "v": "9f8e7d6c", "tutorial": true }, ... ], "2": [...] } }
 *
 *   id        hash of the PUZZLE (size, bombs, clues). It is the level's identity: completed levels are remembered by id, so
 *             editing a tutorial or reordering levels never resets progress, while changing the puzzle itself does.
 *   v         hash of the whole published file. The file is public/levels/<difficulty>/<id>-<v>.json and never changes: a
 *             changed level (a fixed typo in its tutorial, say) gets a new file name, so devices always get the new version
 *             and can keep saved copies forever.
 *   tutorial  present when the level has a tutorial, so the level list can show a tutorial icon without downloading anything.
 *
 * public/levels is GENERATED from the source levels in levels/ by tools/build-levels.js; never edit it by hand.
 */
export const INDEX_SCHEMA = 2;
export const INDEX_PATH = 'levels/index.json';
export const levelPath = (difficulty, entry) => `levels/${difficulty}/${entry.id}-${entry.v}.json`;
/** Key of an entry's file (what makes one saved copy different from another). */
export const entryKey = (entry) => `${entry.id}-${entry.v}`;

const ID = /^[A-Za-z0-9_]{4,64}$/;

/** Returns the index if it is well formed, otherwise throws. */
export function validateLevelIndex(data) {
  const bad = (msg) => { throw new Error(`Invalid level index: ${msg}`); };
  if (!data || typeof data !== 'object') bad('not an object');
  if (data.schema !== INDEX_SCHEMA) bad(`unsupported schema ${data.schema} (this app understands ${INDEX_SCHEMA})`);
  if (!data.difficulties || typeof data.difficulties !== 'object' || Array.isArray(data.difficulties)) bad('"difficulties" must be an object');
  const seen = new Set();
  for (const [d, entries] of Object.entries(data.difficulties)) {
    if (!/^[1-9]\d*$/.test(d)) bad(`difficulty "${d}" must be a positive whole number`);
    if (!Array.isArray(entries)) bad(`difficulty ${d} must be a list of levels`);
    for (const e of entries) {
      if (!e || typeof e !== 'object' || !ID.test(e.id ?? '') || !ID.test(e.v ?? '')) bad(`bad level entry ${JSON.stringify(e)} in difficulty ${d}`);
      if (e.tutorial !== undefined && e.tutorial !== true) bad(`level ${e.id}: "tutorial" is either true or absent`);
      if (seen.has(e.id)) bad(`level id "${e.id}" is listed twice`);
      seen.add(e.id);
    }
  }
  return { schema: data.schema, difficulties: data.difficulties };
}
