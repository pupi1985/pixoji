#!/usr/bin/env node
/**
 * level-complexity.js - measures the complexity of EVERY source level (levels/<difficulty>/*.json) so you can compare them and
 * decide which ones to recreate.
 *
 *   node tools/level-complexity.js [--dir levels] [--difficulty N] [--depth N] [--json]
 *
 * Complexity is the sum of the cost of every deduction the human-style solver needs (see stepCost in shared/solver-core.js):
 * a direct deduction costs 1 + the cells it must combine, an assumption ("suppose X is a bomb ...") costs ten times more for each
 * level of nesting. The scale is arbitrary; it is meant to compare levels with each other. Columns:
 *   clues      number of clues in the level (cell + line)
 *   rating     deepest assumption nesting the level needs (0 = only direct deductions)
 *   steps      number of deductions
 *   chain      longest chain of deductions that each depend on the previous one
 *   vs median  the level's complexity against the median of its difficulty (tutorials are left out of the median)
 * A "!" flags a level whose rating is outside the depth range its difficulty asks for in shared/presets.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCli, formatUsage, fail } from './cli-utils.js';
import { parseLevel, specFromLevel, makePuzzle } from '../shared/logic-core.js';
import { measureComplexity } from '../shared/solver-core.js';
import { readPresetsFile } from './presets-file.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = [
  { name: 'dir', type: 'string', arg: 'PATH', def: 'levels', desc: 'Directory with the <difficulty>/ folders of source levels.' },
  { name: 'difficulty', type: 'int', arg: 'N', min: 1, desc: 'Only measure this difficulty.' },
  { name: 'depth', type: 'int', arg: 'N', def: '3', min: 0, max: 4, desc: 'Deepest nesting of assumptions the solver may use. A level that needs more is reported as UNSOLVED.' },
  { name: 'time-limit', type: 'number', arg: 'SECONDS', def: '30', min: 1, desc: 'Give up on one level after this many seconds.' },
  { name: 'json', type: 'flag', desc: 'Print the results as JSON instead of a table.' },
  { name: 'help', type: 'flag', desc: 'Show this help.' },
];
const usage = () => formatUsage({
  command: 'node tools/level-complexity.js',
  summary: 'Measures the complexity of every source level and prints a table plus a summary per difficulty, so levels that are much easier or harder than their difficulty suggests stand out.',
  specs: SPECS,
  examples: ['npm run levels:complexity', 'node tools/level-complexity.js --difficulty 6', 'node tools/level-complexity.js --json > complexity.json'],
});

const naturalSort = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

/** Measures every level under `dir`. Returns { rows, summary } (rows in difficulty / file order). */
export function analyzeLevels(dir, { difficulty = null, depth = 3, timeLimit = 30, presets = null } = {}) {
  const rows = [];
  const dirs = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && /^[1-9]\d*$/.test(e.name)).map((e) => e.name).sort(naturalSort) : [];
  for (const d of dirs) {
    if (difficulty !== null && Number(d) !== difficulty) continue;
    for (const file of fs.readdirSync(path.join(dir, d)).filter((f) => f.endsWith('.json')).sort(naturalSort)) {
      const row = { difficulty: Number(d), file, size: '', clues: 0, tutorial: false, solved: false, complexity: null, rating: null, steps: null, chain: null, flag: '' };
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, d, file), 'utf8'));
        const level = parseLevel(data), puz = makePuzzle(specFromLevel(level));
        row.size = `${level.W}x${level.H}`; row.clues = puz.constraints.filter((c) => !c.global).length; row.tutorial = data.tutorial !== undefined;
        Object.assign(row, measureComplexity(puz, { maxDepth: depth, timeLimit }));
        const range = presets?.levels?.[d]?.depth;
        if (row.solved && range && !row.tutorial && (row.rating < range[0] || row.rating > range[1])) row.flag = `rating ${row.rating} outside the preset's depth ${range[0]}-${range[1]}`;
        if (!row.solved) row.flag = `UNSOLVED with --depth ${depth}`;
      } catch (e) { row.flag = `ERROR ${e.message}`; }
      rows.push(row);
    }
  }
  const summary = {};
  for (const d of new Set(rows.map((r) => r.difficulty))) {
    const measured = rows.filter((r) => r.difficulty === d && r.solved && !r.tutorial).map((r) => r.complexity);
    summary[d] = { levels: rows.filter((r) => r.difficulty === d).length, measured: measured.length, min: measured.length ? Math.min(...measured) : null, median: measured.length ? median(measured) : null, max: measured.length ? Math.max(...measured) : null };
  }
  for (const r of rows) r.vsMedian = r.solved && !r.tutorial && summary[r.difficulty].median ? Math.round((r.complexity / summary[r.difficulty].median - 1) * 100) : null;
  return { rows, summary };
}

export function formatReport({ rows, summary }) {
  const col = (s, n, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n));
  const fw = Math.max(8, ...rows.map((r) => r.file.length)) + 2;
  const lines = [`${col('diff', 5)}${col('level', fw)}${col('size', 6)}${col('clues', 6, true)}${col('rating', 8, true)}${col('steps', 7, true)}${col('chain', 7, true)}${col('complexity', 12, true)}${col('vs median', 11, true)}  notes`];
  lines.push('-'.repeat(lines[0].length + 10));
  for (const r of rows) {
    const vs = r.vsMedian === null ? '' : `${r.vsMedian > 0 ? '+' : ''}${r.vsMedian}%`;
    const notes = [r.tutorial ? 'tutorial' : '', r.flag ? `! ${r.flag}` : ''].filter(Boolean).join('  ');
    lines.push(`${col(r.difficulty, 5)}${col(r.file, fw)}${col(r.size, 6)}${col(r.clues, 6, true)}${col(r.rating ?? '-', 8, true)}${col(r.steps ?? '-', 7, true)}${col(r.chain ?? '-', 7, true)}${col(r.complexity ?? '-', 12, true)}${col(vs, 11, true)}  ${notes}`);
  }
  lines.push('', 'Per difficulty (tutorials not counted):', `${col('diff', 5)}${col('levels', 8, true)}${col('min', 8, true)}${col('median', 9, true)}${col('max', 8, true)}`);
  for (const [d, s] of Object.entries(summary)) lines.push(`${col(d, 5)}${col(s.levels, 8, true)}${col(s.min ?? '-', 8, true)}${col(s.median ?? '-', 9, true)}${col(s.max ?? '-', 8, true)}`);
  return lines.join('\n');
}

function main() {
  const { opts, errors } = parseCli(process.argv.slice(2), SPECS);
  if (opts.help) { console.log(usage()); return; }
  if (errors.length) fail(errors, usage());
  const dir = path.resolve(opts.dir ?? path.join(root, 'levels'));
  let presets;
  try { presets = readPresetsFile(); } catch (e) { fail([e.message], usage()); }
  const result = analyzeLevels(dir, { difficulty: opts.difficulty ?? null, depth: opts.depth ?? 3, timeLimit: opts['time-limit'] ?? 30, presets });
  if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
  if (!result.rows.length) { console.log(`No levels found in ${path.relative(process.cwd(), dir) || dir}/<difficulty>/*.json`); return; }
  console.log(formatReport(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
