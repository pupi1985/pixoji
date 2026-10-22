import crypto from 'node:crypto';

const sha1 = (text, length) => crypto.createHash('sha1').update(text).digest('hex').slice(0, length);

/**
 * Stable id of a level: a hash of the puzzle itself (size, bombs, clues), ignoring file name, "meta" and the tutorial.
 * The same puzzle always has the same id; any change to the puzzle gives a new id.
 */
export function levelId(data) {
  return sha1(JSON.stringify({
    w: data.grid.width, h: data.grid.height, bombs: data.bombs,
    top: data.clues.top, left: data.clues.left, grid: data.clues.grid,
  }), 10);
}

/** Version of a published level file: a hash of its exact text. */
export const contentVersion = (text) => sha1(text, 8);
