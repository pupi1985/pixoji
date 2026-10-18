/**
 * Complexity-level presets.  The data lives in presets.json (one file shared by the game and the tools):
 *   { "defaultLevel": 7, "generation": { ... }, "levels": { "1": { ... }, ... } }
 *
 * Every level has:
 *   size               [W, H]
 *   bombs              [min, max]  fraction of the cells that are bombs, e.g. [0.36, 0.48]
 *   cellCluesDensity   [min, max]  fraction of the grid cells that carry an in-grid clue (chain / multiplier cells included)
 *   cellClues          { name: [min, max], ... }  ranged weights of the in-grid clue types:
 *                      neighbor, isolated, surrounded, chain, multiplier, area
 *   lineCluesDensity   [min, max]  fraction of the top/left line slots that carry a clue
 *   lineClues          { name: [min, max], ... }  ranged weights of the line clue types: count, longest-run, groups
 *   depth              [min, max]  nested assumptions the solver needs (the rating): 0 = direct deduction only
 * and optionally:
 *   chainClueMaxSize   largest chain (clue 4), >= 2; required when "chain" can be used
 *   areaClueMaxSize    largest number an area clue may show (humans struggle with big areas); omit for no limit
 *   redundant          allow neighbouring cells with identical clues
 *   about              free text shown in the CLI help
 *
 * "Ranged value": each time a level is generated a value is drawn inside [min, max]. For the clue types ("ranged
 * weights") the drawn values are then turned into percentages (value / sum): [0, 20] means "sometimes none, sometimes a
 * few"; a missing entry is never used. The optional top-level "generation" block holds the deterministic work budgets
 * (see options.js).
 *
 * This module only validates; loading is up to the caller (fs in the tools, a JSON import in the game).
 */
import { CELL_NAMES, LINE_NAMES, ALL_CELL_CODES, ALL_LINE_CODES, normalizeWeights, checkRange, hasWeight } from './clue-types.js';

export function validatePresets(data, source = 'presets') {
  const bad = (msg) => { throw new Error(`Invalid presets (${source}): ${msg}`); };
  const levels = data?.levels;
  if (!levels || typeof levels !== 'object' || !Object.keys(levels).length) bad('"levels" must be an object with at least one level');
  for (const [k, p] of Object.entries(levels)) {
    const at = `level ${k}`;
    const check = (fn) => { try { return fn(); } catch (e) { bad(`${at}: ${e.message}`); } };
    if (!/^[1-9]\d*$/.test(k)) bad(`level key "${k}" must be a positive whole number`);
    const depth = check(() => checkRange(p.depth, '"depth"'));
    if (!depth.every(Number.isInteger)) bad(`${at}: "depth" must be whole numbers [min, max]`);
    if (!Array.isArray(p.size) || p.size.length !== 2 || !p.size.every(Number.isInteger)) bad(`${at}: "size" must be [width, height]`);
    const dens = check(() => checkRange(p.cellCluesDensity, '"cellCluesDensity"'));
    const lineDens = check(() => checkRange(p.lineCluesDensity, '"lineCluesDensity"'));
    const bombs = check(() => checkRange(p.bombs, '"bombs"'));
    if (dens[1] > 1 || lineDens[1] > 1 || bombs[1] > 1) bad(`${at}: "bombs", "cellCluesDensity" and "lineCluesDensity" are fractions between 0 and 1`);
    if (bombs[1] <= 0) bad(`${at}: "bombs" needs a maximum above 0`);
    const cellW = check(() => normalizeWeights(p.cellClues, CELL_NAMES, ALL_CELL_CODES, 'cell'));
    const lineW = check(() => normalizeWeights(p.lineClues, LINE_NAMES, ALL_LINE_CODES, 'line'));
    if (!hasWeight(cellW, [1, 2, 3, 6]) && !hasWeight(lineW)) bad(`${at}: enable at least one number clue (neighbor, isolated, surrounded, area) or one line clue`);
    if (p.chainClueMaxSize !== undefined && !(Number.isInteger(p.chainClueMaxSize) && p.chainClueMaxSize >= 2)) bad(`${at}: "chainClueMaxSize" must be a whole number >= 2`);
    if (hasWeight(cellW, [4]) && p.chainClueMaxSize === undefined) bad(`${at}: "chainClueMaxSize" is required when "chain" clues are enabled`);
    if (p.areaClueMaxSize !== undefined && !(Number.isInteger(p.areaClueMaxSize) && p.areaClueMaxSize >= 1)) bad(`${at}: "areaClueMaxSize" must be a whole number >= 1`);
  }
  const defaultLevel = data.defaultLevel ?? Number(Object.keys(levels)[0]);
  if (!levels[defaultLevel]) bad(`"defaultLevel" ${defaultLevel} is not one of the levels`);
  const generation = data.generation ?? {};
  for (const [k, v] of Object.entries(generation)) {
    if (!['seedWork', 'callWork', 'nodeBudget', 'searchBudget'].includes(k)) bad(`unknown "generation" setting "${k}"`);
    if (!Number.isInteger(v) || v < 1) bad(`"generation.${k}" must be a whole number >= 1`);
  }
  return { source, levels, defaultLevel, generation };
}

/** Difficulty numbers defined by the presets, ascending. */
export const difficultiesOf = (presets) => Object.keys(presets.levels).map(Number).sort((a, b) => a - b);
