/**
 * Complexity-level presets.  The data lives in presets.json (one file shared by the game and the tools):
 *   { "defaultLevel": 7, "aliases": { "easy": 6, ... }, "levels": { "1": { size, density, ... }, ... } }
 * Each level has: size [W,H], cellClues [names], lineClues [names], density [min,max], lineDensity, minDepth,
 * maxDepth, chains, maxChain, multipliers, maxAreaClue (largest number an area clue may show; omit for no limit),
 * and optionally bombRatio, redundant, about.  Clue names: cell = total, isolated, surrounded, chain, multiplier,
 * area; line = total, longest-run, groups.
 *
 * This module only validates; loading is up to the caller (fs in the tools, a JSON import in the game).
 */
import { CELL_NAMES, LINE_NAMES, ALL_CELL_CODES, ALL_LINE_CODES, parseTypeList } from './clue-types.js';

export function validatePresets(data, source = 'presets') {
  const bad = (msg) => { throw new Error(`Invalid presets (${source}): ${msg}`); };
  const levels = data?.levels;
  if (!levels || typeof levels !== 'object' || !Object.keys(levels).length) bad('"levels" must be an object with at least one level');
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  for (const [k, p] of Object.entries(levels)) {
    if (!/^[1-9]\d*$/.test(k)) bad(`level key "${k}" must be a positive whole number`);
    for (const f of ['lineDensity', 'minDepth', 'maxDepth', 'chains', 'maxChain', 'multipliers']) if (!isNum(p[f])) bad(`level ${k}: "${f}" must be a number`);
    if (!Array.isArray(p.size) || p.size.length !== 2 || !p.size.every(Number.isInteger)) bad(`level ${k}: "size" must be [width, height]`);
    if (!Array.isArray(p.density) || p.density.length !== 2 || !p.density.every(isNum)) bad(`level ${k}: "density" must be [min, max]`);
    for (const [f, names, all, what] of [['cellClues', CELL_NAMES, ALL_CELL_CODES, 'cell'], ['lineClues', LINE_NAMES, ALL_LINE_CODES, 'line']]) {
      if (!Array.isArray(p[f])) bad(`level ${k}: "${f}" must be an array of clue names (use [] for none)`);
      try { parseTypeList(p[f], names, all, what); } catch (e) { bad(`level ${k}: "${f}": ${e.message}`); }
    }
    if (p.maxAreaClue !== undefined && !(Number.isInteger(p.maxAreaClue) && p.maxAreaClue >= 1)) bad(`level ${k}: "maxAreaClue" must be a whole number >= 1`);
  }
  const aliases = data.aliases ?? {};
  for (const [name, lv] of Object.entries(aliases)) if (!levels[lv]) bad(`alias "${name}" points to missing level ${lv}`);
  const defaultLevel = data.defaultLevel ?? Number(Object.keys(levels)[0]);
  if (!levels[defaultLevel]) bad(`"defaultLevel" ${defaultLevel} is not one of the levels`);
  return { source, levels, aliases, defaultLevel };
}

/** Difficulty numbers defined by the presets, ascending. */
export const difficultiesOf = (presets) => Object.keys(presets.levels).map(Number).sort((a, b) => a - b);
