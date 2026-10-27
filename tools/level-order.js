/**
 * level-order.js - puts level files in order of complexity (easiest first) by renaming them. Used by generate-level.js.
 * Only files named <number>.json (the names the generator gives) are ever renamed; any other file in the folder is left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseLevel, specFromLevel, makePuzzle } from '../shared/logic-core.js';
import { measureComplexity } from '../shared/solver-core.js';

export const isNumbered = (file) => /^\d+\.json$/.test(file);
const numberOf = (file) => Number(file.slice(0, -5));
export const levelFileName = (n, width = 2) => `${String(n).padStart(width, '0')}.json`;

/** Complexity of a level file, or Infinity if it cannot be read or solved (such a file sorts last). */
export function measureFile(file, { depth = 3, timeLimit = 30 } = {}) {
  try {
    const result = measureComplexity(makePuzzle(specFromLevel(parseLevel(JSON.parse(fs.readFileSync(file, 'utf8'))))), { maxDepth: depth, timeLimit });
    return result.solved ? result.complexity : Infinity;
  } catch { return Infinity; }
}

/** Ascending complexity; equal (or both unmeasurable) levels keep their current order. */
const byComplexity = (items) => [...items].sort((a, b) => (a.complexity - b.complexity) || (numberOf(a.file) - numberOf(b.file)));

/** Renames in two phases, so a target name may be the current name of another file that is moving too. */
function applyRenames(dir, renames) {
  const moves = renames.filter(([from, to]) => from !== to);
  moves.forEach(([from], i) => fs.renameSync(path.join(dir, from), path.join(dir, `.sorting-${i}.tmp`)));
  moves.forEach(([, to], i) => fs.renameSync(path.join(dir, `.sorting-${i}.tmp`), path.join(dir, to)));
  return moves;
}

/**
 * Orders the files of ONE generation run by complexity. They keep the same set of numbers (the batch was numbered after the existing
 * levels, so it stays there): the easiest of the batch gets the lowest of those numbers.
 * items: [{ file, complexity }] (basenames in dir). Returns [{ file, complexity, was }] in the new order.
 */
export function sortBatch(dir, items) {
  const slots = items.map((it) => it.file).sort((a, b) => numberOf(a) - numberOf(b));
  const sorted = byComplexity(items);
  applyRenames(dir, sorted.map((it, i) => [it.file, slots[i]]));
  return sorted.map((it, i) => ({ file: slots[i], complexity: it.complexity, was: it.file }));
}

/**
 * Renumbers EVERY <number>.json file in the folder 01, 02, ... by complexity. `known` maps file name -> complexity for files that were
 * just generated; the others are measured now.
 */
export function resortAll(dir, known = {}, measure = {}) {
  const items = fs.readdirSync(dir).filter(isNumbered).map((file) => ({ file, complexity: known[file] ?? measureFile(path.join(dir, file), measure) }));
  const sorted = byComplexity(items), width = Math.max(2, String(sorted.length).length);
  const names = sorted.map((_, i) => levelFileName(i + 1, width));
  applyRenames(dir, sorted.map((it, i) => [it.file, names[i]]));
  return sorted.map((it, i) => ({ file: names[i], complexity: it.complexity, was: it.file }));
}
