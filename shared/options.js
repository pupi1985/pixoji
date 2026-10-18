/**
 * options.js - turns a preset (shared/presets.json) into the option object generateLevel() expects.
 * Kept apart from generator.js so the game's main thread can build options without loading the solver.
 *
 * Generation is DETERMINISTIC: the same seed + the same options always give the same level (or always none), on any
 * machine. For that the effort limits are counted in solver "work" units, never in seconds:
 *   seedWork      work one seed may use before it is given up (this is what keeps generation fast)
 *   callWork      work one solver rating run may use; a run over it counts as "too hard", so clues are added back
 *   nodeBudget    search budget for analysing a single clue
 *   searchBudget  branching budget of the uniqueness check
 * Change them in the "generation" block of presets.json; changing them changes which seeds give which level.
 */
import { CELL_NAMES, LINE_NAMES, ALL_CELL_CODES, ALL_LINE_CODES, normalizeWeights, checkRange } from './clue-types.js';

export const DEFAULT_GENERATION = { seedWork: 1000000, callWork: 500000, nodeBudget: 30000, searchBudget: 150 };

/**
 * `ov` overrides preset values (the CLI does that): width, height, bombs, cellCluesDensity, lineCluesDensity, cellClues,
 * lineClues, depth, chainClueMaxSize, areaClueMaxSize, redundant, seedWork, callWork, nodeBudget, searchBudget.
 * cellClues / lineClues overrides are already normalised { code: [min, max] } maps.
 */
export function buildOptions(p, level, ov = {}, generation = {}) {
  const g = { ...DEFAULT_GENERATION, ...generation };
  const range = (v, what) => checkRange(v, what);
  return {
    W: ov.width ?? p.size[0], H: ov.height ?? p.size[1], level,
    bombs: range(ov.bombs ?? p.bombs, 'bombs'),
    cellCluesDensity: range(ov.cellCluesDensity ?? p.cellCluesDensity, 'cellCluesDensity'),
    lineCluesDensity: range(ov.lineCluesDensity ?? p.lineCluesDensity, 'lineCluesDensity'),
    cellWeights: ov.cellClues ?? normalizeWeights(p.cellClues, CELL_NAMES, ALL_CELL_CODES, 'cell'),
    lineWeights: ov.lineClues ?? normalizeWeights(p.lineClues, LINE_NAMES, ALL_LINE_CODES, 'line'),
    depth: range(ov.depth ?? p.depth, 'depth'),
    chainClueMaxSize: ov.chainClueMaxSize ?? p.chainClueMaxSize ?? 2, areaClueMaxSize: ov.areaClueMaxSize ?? p.areaClueMaxSize ?? Infinity,
    redundant: !!(ov.redundant ?? p.redundant),
    seedWork: ov.seedWork ?? g.seedWork, callWork: ov.callWork ?? g.callWork,
    nodeBudget: ov.nodeBudget ?? g.nodeBudget, searchBudget: ov.searchBudget ?? g.searchBudget,
  };
}
