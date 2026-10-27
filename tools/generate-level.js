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
import { readPresetsFile, DEFAULT_PRESETS_FILE } from './presets-file.js';
import { CELL_NAMES, LINE_NAMES, ALL_CELL_CODES, ALL_LINE_CODES, parseWeightSpec, parseRange, hasWeight } from '../shared/clue-types.js';
import { parseCli, formatUsage, fail } from './cli-utils.js';
import { sortBatch, resortAll } from './level-order.js';
import { normalizeWeights } from '../shared/clue-types.js';

const normalizeForCheck = (obj, names, all, what) => normalizeWeights(obj, names, all, what);

/** Next free file name in a directory: 01.json, 02.json, ... (two digits, zero-padded; three once past 99). */
function nextLevelFile(dir) {
  let max = 0;
  try { for (const f of fs.readdirSync(dir)) { const m = /^(\d+)\.json$/.exec(f); if (m) max = Math.max(max, Number(m[1])); } } catch { /* new directory */ }
  return `${String(max + 1).padStart(2, '0')}.json`;
}

export { DEFAULT_PRESETS_FILE };
/** Reads shared/presets.json (or another file) with all checks, duplicate keys included. */
export const loadPresets = readPresetsFile;

const SPECS = [
  { group: 'Level size', name: 'width', type: 'int', arg: 'N', def: 'by level (4 to 8)', min: 3, max: 16, desc: 'Number of columns in the grid. Bigger grids are much slower to generate and to rate (8x8 is the practical limit for the hard levels).' },
  { name: 'height', type: 'int', arg: 'N', def: 'by level (4 to 8)', min: 3, max: 16, desc: 'Number of rows in the grid. Rectangular grids are fine.' },

  { group: 'Difficulty', name: 'level', type: 'int', arg: 'N', def: 'defaultLevel in the presets file', min: 1, desc: 'Difficulty as defined in the presets file (in the shipped file higher numbers are harder and introduce more clue types); table below. It only sets defaults (grid size, clue types, density, depth...): any option you pass explicitly overrides the level.' },
  { name: 'presets', type: 'string', arg: 'PATH', def: 'shared/presets.json', desc: 'JSON file with the difficulty presets.' },
  { name: 'area-clue-max-size', type: 'int', arg: 'N', def: 'by level', min: 1, desc: 'Largest number an area clue (cell clue 6) may display. Humans find it hard to count areas much beyond 10 cells, so when an area clue would show more than this, the generator uses another clue type for that cell instead (or leaves it without a clue). The level stays valid and uniquely solvable.' },
  { name: 'depth', type: 'string', arg: 'A-B', def: 'by level', desc: 'Nested assumptions the level must NEED, as a range of whole numbers (0 to 4) or a single value. 0 = solvable by direct deductions alone; 1 = needs "suppose X is a bomb..."; 2 = an assumption inside an assumption. The level is rated by the solver and must land inside the range. Keep the maximum at 2 or less for fast generation; 3+ can take minutes.' },
  { name: 'cell-clues-density', type: 'string', arg: 'A-B', def: 'by level', desc: 'Fraction of the grid cells that carry an in-grid clue (chain and multiplier cells included), as a range such as 0.2-0.3 or a single value. Each level draws a random value inside the range.' },
  { name: 'line-clues-density', type: 'string', arg: 'A-B', def: 'by level', desc: 'Fraction of the top/left line slots that carry a clue (0 to 1), as a range such as 0.5-0.8 or a single value. 1 keeps every row and column clue the level can afford.' },

  { group: 'Clue types (ranged weights)', name: 'cell-clues', type: 'string', arg: 'LIST', def: 'from the preset', desc: 'Ranged weights of the in-grid clue types, as name=min-max pairs, e.g. neighbor=30-50,area=0-20,chain=5. Each level draws a value inside every range and turns the drawn values into percentages (value / sum), so a type with 0-20 is sometimes absent and sometimes common. A bare name means weight 1. Names: neighbor(1) isolated(2) surrounded(3) chain(4) multiplier(5) area(6). Chain and multiplier percentages set how many of the clue cells are chain / multiplier cells.' },
  { name: 'line-clues', type: 'string', arg: 'LIST', def: 'from the preset', desc: 'Ranged weights of the top/left clue types, same syntax: count=40-60,longest-run=10-30,groups=0-30. Names: count(1) longest-run(2) groups(3). "none" disables line clues.' },
  { name: 'chain-clue-max-size', type: 'int', arg: 'N', def: 'by level', min: 2, max: 12, desc: 'Largest number of cells in one chain; chains get a random size between 2 and this value. How many chain cells a level has comes from the chain weight in --cell-clues.' },
  { name: 'bombs', type: 'string', arg: 'A-B', def: 'by level', desc: 'Fraction of the cells that are bombs, as a range such as 0.35-0.5 or a single value. Each level draws a random value inside the range. Around 35-50% gives the most interesting levels.' },

  { group: 'Output', name: 'out', type: 'string', arg: 'PATH', def: 'print to stdout', desc: 'A file name ending in .json, or a directory (created if needed) in which numbered files 01.json, 02.json, ... are written, continuing after the ones already there; when a run makes several levels they are then renamed in order of complexity, easiest first (see --resort). Your levels live in levels/<difficulty>/ (so for difficulty 3: --out levels/3); they are never modified by the build, which publishes them with npm run levels.' },
  { name: 'count', type: 'int', arg: 'N', def: '1', min: 1, max: 1000, desc: 'How many levels to generate. Level i uses the next seed that works after level i-1, so a batch is reproducible.' },
  { name: 'seed', type: 'int', arg: 'N', def: 'random', min: 0, desc: 'First seed to try. Generation is deterministic: the same seed + the same options always give the same level (the game shows the seed of random levels). If a seed gives no level the next one is tried; the seed used is printed and stored in the file.' },
  { name: 'max-seeds', type: 'int', arg: 'N', def: '2000', min: 1, desc: 'How many seeds to try for one level before giving up.' },
  { name: 'redundant', type: 'flag', desc: 'Allow neighbouring cells to show identical clues (same type and value). Normally avoided because it adds no information; levels 1-3 allow it, so every cell can carry a clue.' },
  { name: 'resort', type: 'flag', desc: 'Also with --out <directory>: after generating, renumber ALL the numbered files (01.json, 02.json, ...) of that directory by complexity, not only the new ones, so the whole difficulty ramps up from 01.json. Existing levels are measured again (it can take a moment). Files with other names are never touched.' },
  { name: 'no-meta', type: 'flag', desc: 'Do not add the "meta" block (rating, seed, step counts, clue types) to the JSON. The game ignores that block either way.' },

  { group: 'Search limits (advanced, counted in work units so results never depend on machine speed)', name: 'seed-work', type: 'int', arg: 'N', def: 'presets.json / built-in', min: 1000, desc: 'Work one seed may use before it is given up. Higher finds levels on harder presets but is slower per seed. Changing it changes which seeds give which level.' },
  { name: 'call-work', type: 'int', arg: 'N', def: 'presets.json / built-in', min: 100, desc: 'Work one solver rating run may use. A run over it counts as "too hard", so clues are added back.' },
  { name: 'node-budget', type: 'int', arg: 'N', def: 'presets.json / built-in', min: 100, desc: 'Search budget for analysing a single clue. Lower is faster but the solver may miss deductions, making levels look harder than they are.' },
  { name: 'search-budget', type: 'int', arg: 'N', def: 'presets.json / built-in', min: 1, desc: 'Branching budget of the uniqueness check. When it runs out the candidate is discarded as "not provably unique", so lower values are faster but reject more candidates.' },
  { name: 'verbose', type: 'flag', desc: 'Print progress (pruning, rating runs, retries) to stderr.' },
  { name: 'help', type: 'flag', desc: 'Show this guide (also -h).' },
];

function usageText(presets) {
  const rng = (r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`);
  const rows = presets ? Object.entries(presets.levels).map(([n, p]) => `  ${n}  ${p.size.join('x')}  depth ${rng(p.depth)}  bombs ${rng(p.bombs)}  cell clues ${rng(p.cellCluesDensity)}  line clues ${rng(p.lineCluesDensity)}  area<=${p.areaClueMaxSize ?? 'any'}  ${p.about ?? ''}`) : ['  (presets file could not be loaded)'];
  return formatUsage({
    command: 'node tools/generate-level.js',
    summary: 'Generates logic-only levels (JSON, same format the game loads). Every level has exactly one solution that can be reached by pure deduction, and its difficulty is the number of nested assumptions the solver needs. Generated files can be checked and explained with tools/solver.js.',
    specs: SPECS,
    sections: [
      { title: `Difficulties from ${presets ? presets.source : 'presets file'} (clue and bomb weights: see the file)`, text: rows.join('\n') },
      { title: 'Notes', text: '  depth = nested assumptions needed. Depth-0 levels can be solved clue by clue, without ever\n  assuming a cell and testing it. With no options at all this guide is shown; give at least\n  one option (e.g. --level 6) to generate. Presets are read from presets.json (see --presets).' },
    ],
    examples: [
      'node tools/generate-level.js --level 4 --cell-clues neighbor --line-clues count --out tutorial.json',
      'node tools/generate-level.js --level 6 --count 5 --out levels/6 --seed 100',
      'node tools/generate-level.js --level 6 --count 3 --out levels/6   # adds 3 more levels (01.json, 02.json, ...); npm run levels publishes them',
      'node tools/generate-level.js --width 6 --height 6 --level 7 --cell-clues neighbor=40,area=20-30,chain=0-10 --line-clues count=50,groups=25',
      'node tools/generate-level.js --width 8 --height 8 --depth 2 --cell-clues-density 0.2-0.25 --bombs 0.4-0.5 --out hard1.json',
      'node tools/generate-level.js --level 4 --seed 123456789   # exactly the level the game shows for "Seed: 123456789" at difficulty 4',
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
  if (presets) level = level ?? presets.defaultLevel;
  const p = presets?.levels[level];
  if (presets && !p) errors.push(`--level ${level} is not defined in ${presets.source} (available: ${Object.keys(presets.levels).join(', ')})`);
  if (!p) fail(errors, usageText(presets));
  const ov = {};
  const attempt = (flag, fn) => { try { return fn(); } catch (e) { errors.push(`--${flag}: ${e.message}`); return undefined; } };
  if (a['cell-clues'] !== undefined) ov.cellClues = attempt('cell-clues', () => parseWeightSpec(a['cell-clues'], CELL_NAMES, ALL_CELL_CODES, 'cell'));
  if (a['line-clues'] !== undefined) ov.lineClues = attempt('line-clues', () => parseWeightSpec(a['line-clues'], LINE_NAMES, ALL_LINE_CODES, 'line'));
  const fraction = (flag, key, min) => {
    if (a[flag] === undefined) return;
    ov[key] = attempt(flag, () => {
      const r = parseRange(a[flag], 'range');
      if (r[1] > 1 || r[1] < min) throw new Error(`must be between ${min} and 1, got "${a[flag]}"`);
      return r;
    });
  };
  fraction('bombs', 'bombs', 0.001);
  fraction('cell-clues-density', 'cellCluesDensity', 0.001);
  fraction('line-clues-density', 'lineCluesDensity', 0);
  if (a.depth !== undefined) {
    ov.depth = attempt('depth', () => {
      const r = parseRange(a.depth, 'range');
      if (!r.every(Number.isInteger) || r[1] > 4) throw new Error(`must be whole numbers from 0 to 4, like 2 or 1-2, got "${a.depth}"`);
      return r;
    });
  }
  Object.assign(ov, {
    width: a.width, height: a.height, chainClueMaxSize: a['chain-clue-max-size'],
    areaClueMaxSize: a['area-clue-max-size'], redundant: a.redundant ? true : undefined,
    seedWork: a['seed-work'], callWork: a['call-work'], nodeBudget: a['node-budget'], searchBudget: a['search-budget'],
  });
  if (!errors.length) {
    const cells = ov.cellClues ?? normalizeForCheck(p.cellClues, CELL_NAMES, ALL_CELL_CODES, 'cell');
    const lines = ov.lineClues ?? normalizeForCheck(p.lineClues, LINE_NAMES, ALL_LINE_CODES, 'line');
    if (!hasWeight(cells, [1, 2, 3, 6]) && !hasWeight(lines)) errors.push('Nothing to generate with: enable at least one number clue (neighbor, isolated, surrounded, area) or one line clue type.');
    if (hasWeight(cells, [4]) && (ov.chainClueMaxSize ?? p.chainClueMaxSize) === undefined) errors.push('chain clues need --chain-clue-max-size (the preset has no "chainClueMaxSize")');
  }
  if (errors.length) fail(errors, usageText(presets));

  const o = buildOptions(p, level, ov, presets.generation);
  let seed = a.seed ?? Date.now() % 1e9;
  const count = a.count ?? 1, maxSeeds = a['max-seeds'] ?? 2000;
  const log = a.verbose ? (s) => console.error(s) : () => {};
  const out = a.out, toDirectory = !!out && !out.endsWith('.json');
  const written = [];   // the files of this run: { file, complexity }
  for (let i = 0; i < count; i++) {
    const t0 = Date.now();
    let lv = null, tried = 0;
    while (!lv && tried < maxSeeds) { lv = generateLevel(o, seed, log); tried++; if (!lv) seed++; }
    if (!lv) { console.error(`Could not generate level ${i + 1} in ${tried} seeds (try a wider --depth, more clue types, a larger --seed-work or a higher --density)`); process.exitCode = 1; break; }
    const text = toJson(lv, a['no-meta'] ? null : lv.meta);
    seed++;   // the next level starts after this one
    if (!out) { process.stdout.write(text); continue; }
    const file = out.endsWith('.json') ? out : path.join(out, nextLevelFile(out));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    if (toDirectory) written.push({ file: path.basename(file), complexity: lv.meta.complexity, seed: lv.meta.seed });
    console.error(`${toDirectory && (count > 1 || a.resort) ? 'generated' : 'wrote'} ${file}  seed=${lv.meta.seed} (${tried} tried)  complexity=${lv.meta.complexity} (rating=${lv.meta.rating} assumption depth, steps=${lv.meta.steps}), cell clue density=${lv.meta.clueDensity}, work=${lv.meta.work}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // The new levels are numbered in the order they were found; put them in order of complexity (easiest first) by renaming them.
  // With --resort every numbered file of the folder takes part, not only the new ones.
  if (toDirectory && written.length && (written.length > 1 || a.resort)) {
    const sorted = a.resort ? resortAll(out, Object.fromEntries(written.map((w) => [w.file, w.complexity]))) : sortBatch(out, written);
    const mine = new Set(written.map((w) => w.file)), seedOf = Object.fromEntries(written.map((w) => [w.file, w.seed]));
    console.error(`\nSorted by complexity, easiest first${a.resort ? ' (every numbered level in the folder)' : ''}:`);
    for (const s of sorted) {
      if (!a.resort || mine.has(s.was) || s.was !== s.file) console.error(`  ${s.file}  complexity ${Number.isFinite(s.complexity) ? s.complexity : 'unknown'}${seedOf[s.was] !== undefined ? `  seed ${seedOf[s.was]}` : ''}${s.was !== s.file ? `   (was ${s.was})` : ''}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { try { main(); } catch (e) { console.error(e.message); process.exit(1); } }
