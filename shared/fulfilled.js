/**
 * fulfilled.js - which clues the player's marks have already settled, so the game can grey them out.
 *
 * A clue is FULFILLED when every cell it depends on has been marked (bomb or safe) and the marks give exactly the number shown.
 * An unmarked cell in its reach, or marks that contradict the number, keep it normal; and as soon as the player changes a mark so
 * that this stops being true the clue is normal again.
 *
 *   row / column clue          the whole row / column
 *   neighbor                   the 3x3 block around the clue
 *   isolated, surrounded       that block plus the cells next to it (a bomb counts only depending on ITS four neighbours)
 *   area                       the clue's own area must be closed: marked with the clue cell's own state and fenced in by
 *                              cells marked with the other state on every side
 *   chain, multiplier          have no number: never greyed out
 *
 * Pure logic, no browser or Pixi code. states: row-major 0 = unmarked, 1 = bomb, 2 = safe.
 */
import { parseLevel, computeValues, cellValue, lineValue, cellW, isNumericCell, CELL, DIRS4 } from './logic-core.js';

export function createFulfilledChecker(levelData) {
  const level = parseLevel(levelData);
  const { W, H, C, top, left } = level;
  const expected = computeValues(level);

  /** Cells (inside the grid) a numeric cell clue depends on, other than the area clue. */
  const scopeOf = (type, r, c) => {
    const cells = [], reach = type === CELL.TOTAL ? 1 : 2;
    for (let dr = -reach; dr <= reach; dr++) for (let dc = -reach; dc <= reach; dc++) {
      if (reach === 2 && Math.abs(dr) === 2 && Math.abs(dc) === 2) continue;     // the corners of the 5x5 area are not next to any cell of the block
      const a = r + dr, b = c + dc;
      if (a >= 0 && a < H && b >= 0 && b < W) cells.push(a * W + b);
    }
    return cells;
  };
  const clues = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const type = C[r][c];
    if (isNumericCell(type) && type !== CELL.AREA) clues.push({ r, c, type, scope: scopeOf(type, r, c), value: expected.cellVals[r][c] });
  }

  const areaFulfilled = (states, r, c) => {
    const state = states[r * W + c];
    if (!state) return false;
    const seen = new Set([r * W + c]), stack = [[r, c]];
    let size = 0;
    while (stack.length) {
      const [a, b] = stack.pop();
      size += cellW(C[a][b]);
      for (const [dr, dc] of DIRS4) {
        const na = a + dr, nb = b + dc;
        if (na < 0 || na >= H || nb < 0 || nb >= W) continue;
        const neighbour = states[na * W + nb];
        if (neighbour === 0) return false;                                       // the area is not fenced in yet
        if (neighbour === state && !seen.has(na * W + nb)) { seen.add(na * W + nb); stack.push([na, nb]); }
      }
    }
    return size === expected.cellVals[r][c];
  };

  return {
    /** Returns { cells: Set of cell indexes (row * width + column) of fulfilled cell clues, rows: Set, cols: Set }. */
    check(states) {
      const bombs = Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => (states[r * W + c] === 1 ? 1 : 0)));
      const marked = (index) => states[index] !== 0;
      const cells = new Set(), rows = new Set(), cols = new Set();
      for (const clue of clues) {
        if (clue.scope.every(marked) && cellValue(clue.type, bombs, C, clue.r, clue.c) === clue.value) cells.add(clue.r * W + clue.c);
      }
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (C[r][c] === CELL.AREA && areaFulfilled(states, r, c)) cells.add(r * W + c);
      left.forEach((type, r) => {
        if (!type) return;
        const scope = Array.from({ length: W }, (_, c) => r * W + c);
        if (scope.every(marked) && lineValue(type, bombs[r], C[r].map(cellW)) === expected.leftVals[r]) rows.add(r);
      });
      top.forEach((type, c) => {
        if (!type) return;
        const scope = Array.from({ length: H }, (_, r) => r * W + c);
        if (scope.every(marked) && lineValue(type, bombs.map((row) => row[c]), C.map((row) => cellW(row[c]))) === expected.topVals[c]) cols.add(c);
      });
      return { cells, rows, cols };
    },
  };
}
