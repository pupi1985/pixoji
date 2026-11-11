/**
 * fulfilled.js - which clues the player's marks have already settled, so the game can grey them out.
 *
 * A clue is SETTLED when its number can no longer change, whatever the player does with the cells that are still unmarked, and the
 * marks agree with the number. It is direct reasoning only: nothing is assumed, and an unmarked cell that cannot influence the clue
 * does not keep it lit. As soon as a mark changes so that this stops being true, the clue is normal again.
 *
 *   neighbor            every cell of the 3x3 block is marked and the bombs add up
 *   isolated            each cell of the block is looked at on its own: a cell contributes 0 or its weight no matter how the
 *                       unmarked cells fall (a bomb next to it, or the cell being safe, makes it count 0). Outside the grid = no bomb
 *   surrounded          the same, but a cell counts only if all four neighbours are bombs. Outside the grid = bomb
 *   area                the clue's own area is closed: marked like the clue cell and fenced in by the other state on every side
 *   count (line)        every cell of the line is marked
 *   longest-run (line)  the longest run is the same with all unmarked cells safe and with all unmarked cells bombs
 *   groups (line)       every way of filling the unmarked cells gives the same number
 *   multiplier          settled when every clue that uses it is settled (grid numbers whose block holds it, counts and longest-runs
 *                       of its row and column, areas that include it; groups ignore it)
 *   chain               has no number: never greyed out
 *
 * When the level is solved everything is settled. Pure logic, no browser code. states: row-major 0 = unmarked, 1 = bomb, 2 = safe.
 */
import { parseLevel, computeValues, cellW, isNumericCell, lineValue, CELL, LINE, DIRS4 } from './logic-core.js';

const EITHER = -1;
const MAX_UNKNOWN_FOR_GROUPS = 14;

export function createFulfilledChecker(levelData) {
  const level = parseLevel(levelData);
  const { W, H, C, top, left } = level;
  const expected = computeValues(level);
  const inside = (r, c) => r >= 0 && r < H && c >= 0 && c < W;
  const weightAt = (r, c) => cellW(C[r][c]);

  const blockOf = (r, c) => {
    const cells = [];
    for (let a = r - 1; a <= r + 1; a++) for (let b = c - 1; b <= c + 1; b++) if (inside(a, b)) cells.push([a, b]);
    return cells;
  };

  /** What one cell of an isolated/surrounded block adds: 0, its weight, or EITHER when it still depends on unmarked cells. */
  const contribution = (type, states, r, c) => {
    const own = states[r * W + c];
    if (own === 2) return 0;
    const w = weightAt(r, c);
    let bombNext = false, safeNext = false, unknownNext = false;
    for (const [dr, dc] of DIRS4) {
      const a = r + dr, b = c + dc;
      if (!inside(a, b)) continue;                   // outside the grid: no bomb for isolated, a bomb for surrounded (never blocks either)
      const s = states[a * W + b];
      if (s === 1) bombNext = true; else if (s === 2) safeNext = true; else unknownNext = true;
    }
    if (type === CELL.ISOLATED) {
      if (bombNext) return 0;                       // a bomb next to it: it is never isolated
      if (own === 1 && !unknownNext) return w;      // a bomb with every neighbour safe (or the border)
      return EITHER;
    }
    // surrounded
    if (safeNext) return 0;                         // a safe neighbour: it is never surrounded
    if (own === 1 && !unknownNext) return w;
    return EITHER;
  };

  const lineStats = (states, cellsOfLine) => {
    const wts = cellsOfLine.map(([r, c]) => weightAt(r, c));
    const known = cellsOfLine.map(([r, c]) => states[r * W + c]);
    return { wts, known };
  };

  const lineSettled = (type, expectedValue, states, cellsOfLine) => {
    const { wts, known } = lineStats(states, cellsOfLine);
    const bitsWith = (unknownAs) => known.map((s) => (s === 1 ? 1 : s === 2 ? 0 : unknownAs));
    const low = lineValue(type, bitsWith(0), wts), high = lineValue(type, bitsWith(1), wts);
    if (type === LINE.TOTAL || type === LINE.MAXRUN) return low === high && low === expectedValue;
    // groups: not monotone, try every filling of the unmarked cells
    const unknownAt = known.map((s, i) => (s === 0 ? i : -1)).filter((i) => i >= 0);
    if (unknownAt.length > MAX_UNKNOWN_FOR_GROUPS) return false;
    const bits = known.map((s) => (s === 1 ? 1 : 0));
    for (let mask = 0; mask < (1 << unknownAt.length); mask++) {
      unknownAt.forEach((i, k) => { bits[i] = (mask >> k) & 1; });
      if (lineValue(type, bits, wts) !== expectedValue) return false;
    }
    return true;
  };

  const areaSettled = (states, r, c) => {
    const state = states[r * W + c];
    if (!state) return false;
    const seen = new Set([r * W + c]), stack = [[r, c]];
    let size = 0;
    while (stack.length) {
      const [a, b] = stack.pop();
      size += weightAt(a, b);
      for (const [dr, dc] of DIRS4) {
        const na = a + dr, nb = b + dc;
        if (!inside(na, nb)) continue;
        const neighbour = states[na * W + nb];
        if (neighbour === 0) return false;                       // the area is not fenced in yet
        if (neighbour === state && !seen.has(na * W + nb)) { seen.add(na * W + nb); stack.push([na, nb]); }
      }
    }
    return size === expected.cellVals[r][c];
  };

  // the true area of every area clue (from the solution), to know which multipliers it uses
  const trueAreaOf = (r, c) => {
    const bombs = level.B;
    if (!bombs) return new Set();
    const state = bombs[r][c], seen = new Set([r * W + c]), stack = [[r, c]];
    while (stack.length) {
      const [a, b] = stack.pop();
      for (const [dr, dc] of DIRS4) {
        const na = a + dr, nb = b + dc;
        if (inside(na, nb) && bombs[na][nb] === state && !seen.has(na * W + nb)) { seen.add(na * W + nb); stack.push([na, nb]); }
      }
    }
    return seen;
  };

  const rowCells = (r) => Array.from({ length: W }, (_, c) => [r, c]);
  const colCells = (c) => Array.from({ length: H }, (_, r) => [r, c]);

  // ids: 'c<index>' grid clue, 'r<row>' left clue, 'k<col>' top clue
  const clues = [], areaSets = new Map();
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const type = C[r][c];
    if (isNumericCell(type)) clues.push({ id: `c${r * W + c}`, r, c, type, value: expected.cellVals[r][c] });
    if (type === CELL.AREA) areaSets.set(`c${r * W + c}`, trueAreaOf(r, c));
  }
  const multipliers = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (C[r][c] !== CELL.MULT) continue;
    const users = [];
    for (const clue of clues) {
      if (clue.type === CELL.AREA) { if (areaSets.get(clue.id).has(r * W + c)) users.push(clue.id); }
      else if (Math.abs(clue.r - r) <= 1 && Math.abs(clue.c - c) <= 1) users.push(clue.id);
    }
    if (left[r] === LINE.TOTAL || left[r] === LINE.MAXRUN) users.push(`r${r}`);
    if (top[c] === LINE.TOTAL || top[c] === LINE.MAXRUN) users.push(`k${c}`);
    multipliers.push({ index: r * W + c, users });
  }

  return {
    /** Returns { cells: Set of cell indexes (row * width + column), rows: Set, cols: Set } of the settled clues. */
    check(states, { solved = false } = {}) {
      const cells = new Set(), rows = new Set(), cols = new Set(), done = new Set();
      for (const clue of clues) {
        let ok;
        if (solved) ok = true;
        else if (clue.type === CELL.AREA) ok = areaSettled(states, clue.r, clue.c);
        else {
          ok = true;
          let sum = 0;
          for (const [a, b] of blockOf(clue.r, clue.c)) {
            if (clue.type === CELL.TOTAL) {
              const s = states[a * W + b];
              if (s === 0) { ok = false; break; }
              if (s === 1) sum += weightAt(a, b);
            } else {
              const v = contribution(clue.type, states, a, b);
              if (v === EITHER) { ok = false; break; }
              sum += v;
            }
          }
          ok = ok && sum === clue.value;
        }
        if (ok) { cells.add(clue.r * W + clue.c); done.add(clue.id); }
      }
      left.forEach((type, r) => {
        if (type && (solved || lineSettled(type, expected.leftVals[r], states, rowCells(r)))) { rows.add(r); done.add(`r${r}`); }
      });
      top.forEach((type, c) => {
        if (type && (solved || lineSettled(type, expected.topVals[c], states, colCells(c)))) { cols.add(c); done.add(`k${c}`); }
      });
      for (const m of multipliers) {
        const ok = solved || (m.users.length ? m.users.every((id) => done.has(id)) : states[m.index] !== 0);
        if (ok) cells.add(m.index);
      }
      return { cells, rows, cols };
    },
  };
}
