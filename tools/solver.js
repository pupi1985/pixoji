#!/usr/bin/env node
/**
 * solver.js - human-style logical solver with written explanations.
 *
 * node tools/solver.js levels/1/01.json [options]
 *   --depth N        max number of NESTED assumptions allowed (default 1)
 *                    0 = only direct deductions from one clue at a time
 *                    1 = "suppose X is a bomb ... contradiction" (and case analysis)
 *                    2 = an assumption inside an assumption, etc.
 *   --no-cases       disable case analysis ("either way Z is a bomb")
 *   --step           pause after every step (press Enter)
 *   --board          print the board after every step (default: start and end only)
 *   --json           print the whole solution as JSON (for a future hint button)
 *   --time-limit S   give up after S seconds
 *   --node-budget N  search budget per clue analysis (default 30000)
 *
 * The solver always uses the simplest possible kind of reasoning first and only
 * escalates to a deeper assumption level when nothing simpler is available.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseCli, formatUsage, fail } from './cli-utils.js';
import { parseLevel, specFromLevel, makePuzzle } from '../shared/logic-core.js';
import { countSolutions, solveIter, nodeOf, renderStep, renderBoard, ComplexityTally, LEGEND } from '../shared/solver-core.js';

// ------------------------------------------------------------------ CLI
const SPECS = [
  { group: 'Reasoning', name: 'depth', type: 'int', arg: 'N', def: '1', min: 0, max: 5, desc: 'Maximum number of NESTED assumptions the solver may use. 0 = only direct deductions from one clue at a time; 1 = "suppose X is a bomb ... contradiction"; 2 = an assumption inside an assumption. The simplest reasoning is always tried first; higher values only matter when nothing simpler works, but each extra level can be much slower.' },
  { name: 'no-cases', type: 'flag', desc: 'Disable case analysis ("if X is a bomb then Z is a bomb, and if X is safe then Z is a bomb too, so Z is a bomb"). Only proofs by contradiction are then used.' },
  { name: 'time-limit', type: 'number', arg: 'SECONDS', def: 'none', min: 1, desc: 'Stop after this many seconds and report what was solved so far. Useful with --depth 2 or more on big grids.' },
  { name: 'node-budget', type: 'int', arg: 'N', def: '30000', min: 100, desc: 'Search budget for analysing one clue. A clue that needs more is skipped, which can make the solver need a deeper --depth than a human would.' },
  { group: 'Output', name: 'step', type: 'flag', desc: 'Pause after every step until you press Enter, so you can follow along and try to anticipate the next move.' },
  { name: 'board', type: 'flag', desc: 'Redraw the board after every step (by default only the starting and final boards are shown).' },
  { name: 'json', type: 'flag', desc: 'Print the whole solution as JSON (steps, explanations and cell coordinates) instead of text, e.g. for a future hint button in the game.' },
  { name: 'help', type: 'flag', desc: 'Show this guide (also -h).' },
];

function usageText() {
  return formatUsage({
    command: 'node tools/solver.js',
    summary: 'Solves a level the way a human would, one logical step at a time, and explains why each step is valid. It never guesses or uses the answer: the bombs matrix in the file is only used to compute the clue numbers and to check the result at the end. If the level cannot be solved at the chosen --depth it stops and says which depth to try.',
    positional: [{ name: 'level.json', desc: 'Path of the level file (grid, bombs, clues), as produced by generate-level.js or used by the game.' }],
    specs: SPECS,
    sections: [{ title: 'Board legend', text: `  ${LEGEND.replace(/ \| /g, '\n  ')}` }],
    examples: ['node tools/solver.js levels/1/01.json', 'node tools/solver.js levels/6/03.json --depth 2 --step --board', 'node tools/solver.js levels/6/03.json --json > solution.json'],
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const { opts: args0, positional, errors } = parseCli(argv, SPECS);
  if (args0.help) { console.log(usageText()); return; }
  if (!argv.length) { console.error(usageText()); process.exit(1); }
  if (positional.length === 0) errors.push('Missing <level.json>');
  if (positional.length > 1) errors.push(`Expected one level file, got ${positional.length}: ${positional.join(' ')}`);
  if (!errors.length && !fs.existsSync(positional[0])) errors.push(`File not found: ${positional[0]}`);
  if (args0.json && args0.step) errors.push('--json and --step cannot be combined');
  if (errors.length) fail(errors, usageText());
  const args = { ...args0, _: positional };
  const level = parseLevel(JSON.parse(fs.readFileSync(args._[0], 'utf8')));
  if (!level.B) throw new Error('The level needs a "bombs" matrix so the clue values can be computed.');
  const puz = makePuzzle(specFromLevel(level), { maxNodes: args['node-budget'] });
  const opts = { maxDepth: args.depth ?? 1, cases: !args['no-cases'], timeLimit: args['time-limit'] ?? 0 };
  const json = !!args.json, log = (s = '') => { if (!json) console.log(s); };

  const uniq = countSolutions(puz, 2);
  log(`${args._[0]}: ${level.W}x${level.H}, ${puz.constraints.length} clues, hypothesis depth allowed: ${opts.maxDepth}`);
  if (uniq.count !== 1) log(`WARNING: this level has ${uniq.count === 0 ? 'NO' : 'MORE THAN ONE'} solution(s) - it is not a well-formed logic puzzle.`);
  log(LEGEND); log(renderBoard(puz, new Int8Array(puz.nG).fill(-1))); log();

  let rl = null;
  if (args.step && !json) { const { createInterface } = await import('node:readline/promises'); rl = createInterface({ input: process.stdin, output: process.stdout }); }
  const vals = new Int8Array(puz.nG).fill(-1), out = [], byDepth = {}, tally = new ComplexityTally();
  const it = solveIter(puz, opts);
  let r = it.next(), i = 0;
  while (!r.done) {
    const f = r.value, node = nodeOf(puz, f);
    vals[f.g] = f.v; i++; tally.add(f);
    byDepth[f.depth || 0] = (byDepth[f.depth || 0] || 0) + 1;
    if (json) out.push({ step: i, depth: f.depth || 0, ...node });
    else {
      log(renderStep(i, f, node));
      if (args.board) log(`\n${renderBoard(puz, vals)}\n`);
      log();
      if (rl) await rl.question('[Enter for next step] ');
    }
    r = it.next();
  }
  if (rl) rl.close();
  const sum = r.value;
  const correct = sum.solved && level.B.every((row, rr) => row.every((b, cc) => vals[puz.gid[rr][cc]] === b));
  if (json) {
    console.log(JSON.stringify({ solved: sum.solved, matchesLevel: correct, complexity: tally.summary().complexity, longestChain: tally.chain, stepsByDepth: byDepth, steps: out }, null, 2));
    return;
  }
  log(sum.solved ? 'SOLVED.' : sum.timeout ? 'Stopped: time limit reached.' : sum.error ? 'Inconsistent puzzle: a contradiction was found without any assumption.' : `STUCK: nothing can be deduced with hypothesis depth <= ${opts.maxDepth}. Try --depth ${opts.maxDepth + 1}.`);
  log(`Steps by depth: ${Object.entries(byDepth).map(([d, n]) => `depth ${d}: ${n}`).join(', ') || 'none'}`);
  if (sum.solved) log(`Complexity: ${tally.complexity}   (sum of the cost of every deduction: direct ones cost 1 + the cells they combine, an assumption costs 10x more per nesting level; longest chain of dependent deductions: ${tally.chain})`);
  if (sum.solved) log(correct ? 'Solution matches the bombs matrix of the level file.' : 'WARNING: solution differs from the bombs matrix of the level file!');
  else { log(); log(renderBoard(puz, vals)); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
