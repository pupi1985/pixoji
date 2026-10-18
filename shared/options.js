/**
 * options.js - turns a preset (shared/presets.json) into the option object generateLevel() expects.
 * Kept apart from generator.js so the game's main thread can build options without loading the solver.
 */
import { CELL_NAMES, LINE_NAMES, ALL_CELL_CODES, ALL_LINE_CODES, parseTypeList } from './clue-types.js';

/**
 * Turns one preset level into the option object generateLevel() expects.  `ov` may override any preset value
 * (the CLI does that): width, height, cellClues, lineClues (names or arrays), density ([a] or [a, b]), minDepth,
 * maxDepth, lineDensity, bombRatio, chains, maxChain, multipliers, maxAreaClue, redundant, attempts, timeLimit,
 * nodeBudget, searchBudget, attemptMs (wall-clock cap per attempt in ms, 0 = none).  Throws on unknown clue names.
 */
export function buildOptions(p, level, ov = {}) {
  const cellTypes = parseTypeList(ov.cellClues ?? p.cellClues, CELL_NAMES, ALL_CELL_CODES, 'cell');
  const lineTypes = parseTypeList(ov.lineClues ?? p.lineClues, LINE_NAMES, ALL_LINE_CODES, 'line');
  const W = ov.width ?? p.size[0], H = ov.height ?? p.size[1], scale = (W * H) / 64;
  const explicit = ov.cellClues !== undefined && String(ov.cellClues).toLowerCase() !== 'all';
  const scaled = (n, floor) => Math.max(floor, Math.round(n * scale));
  const density = ov.density ?? p.density;
  return {
    W, H, level, cellTypes: new Set([1, 2, 3, 6].filter((t) => cellTypes.has(t))), lineTypes,
    minDepth: ov.minDepth ?? p.minDepth, maxDepth: ov.maxDepth ?? p.maxDepth,
    density: density.length === 1 ? [density[0], density[0]] : density,
    lineDensity: ov.lineDensity ?? p.lineDensity, bombRatio: ov.bombRatio ?? p.bombRatio ?? 0.42,
    chains: cellTypes.has(4) ? (ov.chains ?? scaled(p.chains, explicit ? 1 : 0)) : 0, maxChain: ov.maxChain ?? p.maxChain,
    multipliers: cellTypes.has(5) ? (ov.multipliers ?? scaled(p.multipliers, explicit ? 1 : 0)) : 0,
    redundant: !!(ov.redundant || p.redundant), maxAreaClue: ov.maxAreaClue ?? p.maxAreaClue ?? Infinity,
    attempts: ov.attempts ?? 60, attemptMs: ov.attemptMs ?? 0, timeLimit: ov.timeLimit ?? 25, nodeBudget: ov.nodeBudget ?? 30000, searchBudget: ov.searchBudget ?? 150,
  };
}
