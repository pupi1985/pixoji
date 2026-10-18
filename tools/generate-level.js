#!/usr/bin/env node
/**
 * generate-level.js - command line front end of the level generator (shared/generator.js).
 * Run without arguments (or with --help) for the full usage guide.  Presets come from shared/presets.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { generateLevel, toJson } from '../shared/generator.js';
import { buildOptions } from '../shared/options.js';
import { validatePresets } from '../shared/presets.js';
import { CELL_NAMES, LINE_NAMES, ALL_CELL_CODES, ALL_LINE_CODES, parseTypeList } from '../shared/clue-types.js';
import { parseCli, formatUsage, fail } from './cli-utils.js';

export const DEFAULT_PRESETS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'presets.json');

export function loadPresets(file = DEFAULT_PRESETS_FILE) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`Cannot read presets file ${file}: ${e.message}`); }
  return validatePresets(data, file);
}

// ------------------------------------------------------------------ CLI
const SPECS = [
  { group: 'Level size', name: 'width', type: 'int', arg: 'N', def: 'by level (4 to 8)', min: 3, max: 16, desc: 'Number of columns in the grid. Bigger grids are much slower to generate and to rate (8x8 is the practical limit for the hard levels).' },
  { name: 'height', type: 'int', arg: 'N', def: 'by level (4 to 8)', min: 3, max: 16, desc: 'Number of rows in the grid. Rectangular grids are fine.' },

  { group: 'Complexity', name: 'level', type: 'int', arg: 'N', def: 'defaultLevel in the presets file', min: 1, desc: 'Complexity level as defined in the presets file (the shipped file has 1 = simplest to 9 = hardest); table below. It only sets defaults (grid size, clue types, density, depth...): any option you pass explicitly overrides the level.' },
  { name: 'difficulty', type: 'string', arg: 'NAME', desc: 'Alias of --level using the names listed under "aliases" in the presets file (shipped: tutorial=4, beginner=5, easy=6, medium=7, hard=8).' },
  { name: 'presets', type: 'string', arg: 'PATH', def: 'shared/presets.json', desc: 'JSON file with the complexity-level presets.' },
  { name: 'max-area-clue', type: 'int', arg: 'N', def: 'by level', min: 1, desc: 'Largest number an area clue (cell clue 6) may display. Humans find it hard to count areas much beyond 10 cells, so when an area clue would show more than this, the generator uses another clue type for that cell instead (or leaves it without a clue). The level stays valid and uniquely solvable.' },
  { name: 'min-depth', type: 'int', arg: 'N', def: 'by level', min: 0, max: 4, desc: 'The level must NEED at least this many nested assumptions to be solved. 0 = may be solved by direct deductions alone; 1 = needs "suppose X is a bomb..."; 2 = an assumption inside an assumption.' },
  { name: 'max-depth', type: 'int', arg: 'N', def: 'by level', min: 0, max: 4, desc: 'The level must be solvable with at most this many nested assumptions (the solver rating). Keep it at 2 or less for fast generation; 3+ can take minutes.' },
  { name: 'density', type: 'string', arg: 'A-B', def: 'by level', desc: 'Fraction of grid cells that carry an in-grid clue (chain and multiplier cells included), as a range such as 0.15-0.20 or a single value. The generator picks a random target inside the range and removes clues down to it while the solution stays unique.' },
  { name: 'line-density', type: 'number', arg: 'X', def: 'by level', min: 0, max: 1, desc: 'Fraction (0 to 1) of the top/left line clues to keep. 1 keeps every row and column clue; lower values force more reasoning from the cell clues.' },

  { group: 'Clue types', name: 'cell-clues', type: 'string', arg: 'LIST', def: 'from the preset', desc: 'Comma-separated in-grid clue types to use; ONLY these appear in the level. Names (or numbers): total(1) isolated(2) surrounded(3) chain(4) multiplier(5) area(6); also "all" or "none". Use it to introduce clue types one at a time, e.g. --cell-clues total,area.' },
  { name: 'line-clues', type: 'string', arg: 'LIST', def: 'from the preset', desc: 'Comma-separated top/left clue types to use; ONLY these appear. Names (or numbers): total(1) longest-run(2) groups(3, number of separate bomb groups); also "all" or "none".' },
  { name: 'chains', type: 'int', arg: 'N', def: 'by level, scaled to grid size', min: 0, max: 20, desc: 'Number of linked chains (clue 4: cells that always share the same state). Ignored (0) when "chain" is not in --cell-clues; chains never touch each other, even diagonally.' },
  { name: 'max-chain', type: 'int', arg: 'N', def: 'by level', min: 2, max: 12, desc: 'Largest number of cells in one chain; each chain gets a random size between 2 and this value.' },
  { name: 'multipliers', type: 'int', arg: 'N', def: 'by level, scaled to grid size', min: 0, max: 30, desc: 'Number of multiplier cells (clue 5). Ignored (0) when "multiplier" is not in --cell-clues. They only matter in clues that add weights up, so keep some total/area/longest-run clues.' },
  { name: 'bomb-ratio', type: 'number', arg: 'X', def: 'by level (0.30-0.42)', min: 0.05, max: 0.95, desc: 'Approximate fraction of cells that are bombs. Around 0.35-0.5 gives the most interesting puzzles; extremes make clues trivial.' },

  { group: 'Output', name: 'out', type: 'string', arg: 'PATH', def: 'print to stdout', desc: 'A file name ending in .json, or a directory (created if needed) in which level<N>.json files are written. The game loads predefined levels from public/levels/<difficulty>/level<N>.json, so for difficulty 3 use --out public/levels/3 (and --start to append).' },
  { name: 'count', type: 'int', arg: 'N', def: '1', min: 1, max: 1000, desc: 'How many levels to generate. Level i uses seed+i, so a batch is reproducible.' },
  { name: 'start', type: 'int', arg: 'N', def: '1', min: 0, desc: 'Number of the first file when --out is a directory (level<start>.json, level<start+1>.json, ...). Use it to append levels without overwriting.' },
  { name: 'seed', type: 'int', arg: 'N', def: 'random', min: 0, desc: 'Random seed. Same seed + same options = same level, which is handy for sharing or debugging a puzzle.' },
  { name: 'redundant', type: 'flag', desc: 'Allow neighbouring cells to show identical clues (same type and value). Normally avoided because it adds no information; levels 1-3 allow it, so every cell can carry a clue.' },
  { name: 'no-meta', type: 'flag', desc: 'Do not add the "meta" block (rating, seed, step counts, clue types) to the JSON. The game ignores that block either way.' },

  { group: 'Search limits (advanced)', name: 'attempts', type: 'int', arg: 'N', def: '60', min: 1, desc: 'How many random puzzles to try for one level before giving up. Strict settings (high min-depth, few clue types) need more attempts.' },
  { name: 'time-limit', type: 'number', arg: 'SECONDS', def: '25', min: 1, desc: 'Time allowed for each rating run of the solver. A run that exceeds it counts as "too hard", so clues are added back.' },
  { name: 'node-budget', type: 'int', arg: 'N', def: '30000', min: 100, desc: 'Search budget for analysing a single clue. Lower is faster but the solver may miss deductions, making levels look harder than they are.' },
  { name: 'search-budget', type: 'int', arg: 'N', def: '150', min: 1, desc: 'Branching budget of the uniqueness check. When it runs out the candidate is discarded as "not provably unique", so lower values are faster but reject more candidates.' },
  { name: 'verbose', type: 'flag', desc: 'Print progress (pruning, rating runs, retries) to stderr.' },
  { name: 'help', type: 'flag', desc: 'Show this guide (also -h).' },
];

function usageText(presets) {
  const rows = presets ? Object.entries(presets.levels).map(([n, p]) => `  ${n}  ${p.size.join('x')}  depth ${p.minDepth}-${p.maxDepth}  density ${p.density[0].toFixed(2)}-${p.density[1].toFixed(2)}  lines ${p.lineDensity.toFixed(2)}  chains ${p.chains}  multipliers ${p.multipliers}  area<=${p.maxAreaClue ?? 'any'}  ${p.about ?? ''}`) : ['  (presets file could not be loaded)'];
  return formatUsage({
    command: 'node tools/generate-level.js',
    summary: 'Generates logic-only levels (JSON, same format the game loads). Every level has exactly one solution that can be reached by pure deduction, and its difficulty is the number of nested assumptions the solver needs. Generated files can be checked and explained with tools/solver.js.',
    specs: SPECS,
    sections: [
      { title: `Complexity levels from ${presets ? presets.source : 'presets file'} (chain/multiplier counts scale with the grid area)`, text: rows.join('\n') },
      { title: 'Notes', text: '  depth = nested assumptions needed. Depth-0 levels can be solved clue by clue, without ever\n  assuming a cell and testing it. With no options at all this guide is shown; give at least\n  one option (e.g. --level 6) to generate. Presets are read from presets.json (see --presets).' },
    ],
    examples: [
      'node tools/generate-level.js --level 4 --cell-clues total --line-clues total --out tutorial.json',
      'node tools/generate-level.js --level 6 --count 5 --out public/levels/6 --seed 100',
      'node tools/generate-level.js --level 6 --count 3 --start 6 --out public/levels/6   # appends level6..8.json',
      'node tools/generate-level.js --width 6 --height 6 --level 7 --cell-clues total,area,chain --line-clues all',
      'node tools/generate-level.js --width 8 --height 8 --min-depth 2 --max-depth 2 --density 0.2-0.25 --out hard1.json',
    ],
  });
}

function main() {
  const argv = process.argv.slice(2);
  const { opts: a, positional, errors } = parseCli(argv, SPECS);
  let presets = null;
  try { presets = loadPresets(a.presets ? path.resolve(a.presets) : DEFAULT_PRESETS_FILE); } catch (e) { errors.push(e.message); }
  if (a.help) { console.log(usageText(presets)); return; }
  if (!argv.length) { console.error(usageText(presets)); process.exit(1); }
  for (const p of positional) errors.push(`Unexpected argument "${p}" (all parameters start with --)`);
  let level = a.level;
  if (presets && a.difficulty !== undefined) {
    if (a.level !== undefined) errors.push('Use either --level or --difficulty, not both');
    else if (!presets.aliases[a.difficulty]) errors.push(`--difficulty must be one of: ${Object.keys(presets.aliases).join(', ')} (or use --level ${Object.keys(presets.levels).join('/')})`);
    else level = presets.aliases[a.difficulty];
  }
  if (presets) level = level ?? presets.defaultLevel;
  const p = presets?.levels[level];
  if (presets && !p) errors.push(`--level ${level} is not defined in ${presets.source} (available: ${Object.keys(presets.levels).join(', ')})`);
  if (!p) fail(errors, usageText(presets));
  let cellTypes, lineTypes, density;
  try { cellTypes = parseTypeList(a['cell-clues'] ?? p.cellClues, CELL_NAMES, ALL_CELL_CODES, 'cell'); } catch (e) { errors.push(`--cell-clues: ${e.message}`); }
  try { lineTypes = parseTypeList(a['line-clues'] ?? p.lineClues, LINE_NAMES, ALL_LINE_CODES, 'line'); } catch (e) { errors.push(`--line-clues: ${e.message}`); }
  if (a.density !== undefined) {
    density = String(a.density).split('-').map(Number);
    if (density.length > 2 || density.some((x) => !Number.isFinite(x) || x <= 0 || x > 1)) errors.push(`--density must look like 0.2 or 0.15-0.25 (values between 0 and 1), got "${a.density}"`);
    else if (density.length === 2 && density[0] > density[1]) errors.push('--density range must go from the smaller to the larger value');
  }
  if (!errors.length) {
    const numeric = [1, 2, 3, 6].filter((t) => cellTypes.has(t));
    if (!numeric.length && !lineTypes.size) errors.push('Nothing to generate with: enable at least one number clue (total, isolated, surrounded, area) or one line clue type.');
    if (a.chains > 0 && !cellTypes.has(4)) errors.push('--chains needs "chain" in --cell-clues');
    if (a.multipliers > 0 && !cellTypes.has(5)) errors.push('--multipliers needs "multiplier" in --cell-clues');
    if (a['min-depth'] !== undefined && (a['max-depth'] ?? p.maxDepth) < a['min-depth']) errors.push('--min-depth cannot exceed --max-depth');
    if (a['max-depth'] !== undefined && (a['min-depth'] ?? p.minDepth) > a['max-depth']) errors.push('--max-depth cannot be below --min-depth');
  }
  if (errors.length) fail(errors, usageText(presets));

  const o = buildOptions(p, level, {
    width: a.width, height: a.height, cellClues: a['cell-clues'], lineClues: a['line-clues'], density,
    minDepth: a['min-depth'], maxDepth: a['max-depth'], lineDensity: a['line-density'], bombRatio: a['bomb-ratio'],
    chains: a.chains, maxChain: a['max-chain'], multipliers: a.multipliers, redundant: a.redundant,
    maxAreaClue: a['max-area-clue'], attempts: a.attempts, timeLimit: a['time-limit'],
    nodeBudget: a['node-budget'], searchBudget: a['search-budget'],
  });
  const seed0 = a.seed ?? Date.now() % 1e9, count = a.count ?? 1, start = a.start ?? 1;
  const log = a.verbose ? (s) => console.error(s) : () => {};
  const out = a.out;
  for (let i = 0; i < count; i++) {
    const t0 = Date.now();
    const lv = generateLevel(o, seed0 + i, log);
    if (!lv) { console.error(`Could not generate level ${i + 1} (try more --attempts, a lower --min-depth, a higher --max-depth, or more clue types)`); process.exitCode = 1; continue; }
    const text = toJson(lv, a['no-meta'] ? null : lv.meta);
    if (!out) { process.stdout.write(text); continue; }
    const file = out.endsWith('.json') ? out : path.join(out, `level${start + i}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    console.error(`wrote ${file}  rating=${lv.meta.rating} (hypothesis depth), steps=${lv.meta.steps}, cell clue density=${lv.meta.clueDensity}, attempts=${lv.meta.attempts}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { main(); } catch (e) { console.error(e.message); process.exit(1); } }
