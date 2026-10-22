#!/usr/bin/env node
/**
 * build-levels.js - turns the SOURCE levels into the files the game publishes. Source files are never modified.
 *
 *   levels/<difficulty>/<any name>.json      your levels (generate-level.js writes 01.json, 02.json, ...; edit / rename / delete freely)
 *        |   node tools/build-levels.js
 *        v
 *   public/levels/<difficulty>/<id>-<v>.json one immutable file per level, named after its content
 *   public/levels/index.json                 the list the game downloads: ids, versions, tutorial flags, play order
 *
 * Play order inside a difficulty is the natural order of the source file names (2.json before 10.json; or name them 01-intro,
 * 02-... to be explicit). public/levels is fully regenerated every run, so it can be git-ignored: the deploy workflow builds it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCli, formatUsage, fail } from './cli-utils.js';
import { levelId, contentVersion } from './level-tools.js';
import { parseLevel, specFromLevel, makePuzzle } from '../shared/logic-core.js';
import { countSolutions } from '../shared/solver-core.js';
import { validateTutorial } from '../shared/tutorial.js';
import { INDEX_SCHEMA, entryKey } from '../shared/level-index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = [
  { name: 'src', type: 'string', arg: 'PATH', def: 'levels', desc: 'Directory with your source levels, one <difficulty>/ folder per difficulty.' },
  { name: 'out', type: 'string', arg: 'PATH', def: 'public/levels', desc: 'Directory the game publishes from (generated: its <difficulty>/ folders and index.json are replaced).' },
  { name: 'verify', type: 'flag', desc: 'Also check with the solver that every level has exactly one solution.' },
  { name: 'dry-run', type: 'flag', desc: 'Check everything and report, but write nothing.' },
  { name: 'help', type: 'flag', desc: 'Show this help.' },
];
const usage = () => formatUsage({
  command: 'node tools/build-levels.js',
  summary: 'Validates the source levels (puzzle, tutorial) and publishes them as content-named files plus index.json. Source files are never touched.',
  specs: SPECS,
  examples: ['node tools/build-levels.js', 'node tools/build-levels.js --verify --dry-run'],
});

const naturalSort = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const isDifficultyDir = (e) => e.isDirectory() && /^[1-9]\d*$/.test(e.name);
const inside = (parent, child) => { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

/** Reads and checks the source levels. Returns { levels: [{ difficulty, file, id, text, v, tutorial }], report }. */
export function collectLevels(src, { verify = false, knownDifficulties = null } = {}) {
  const report = { warnings: [], errors: [] };
  const levels = [];
  const seen = new Map();
  const dirs = fs.existsSync(src) ? fs.readdirSync(src, { withFileTypes: true }).filter(isDifficultyDir).map((e) => e.name).sort(naturalSort) : [];
  for (const d of dirs) {
    if (knownDifficulties && !knownDifficulties.includes(Number(d))) report.warnings.push(`difficulty ${d} is not defined in shared/presets.json (the game will not list it)`);
    for (const file of fs.readdirSync(path.join(src, d)).filter((f) => f.endsWith('.json')).sort(naturalSort)) {
      const where = `${d}/${file}`;
      let data;
      try { data = JSON.parse(fs.readFileSync(path.join(src, d, file), 'utf8')); } catch (e) { report.errors.push(`${where}: not valid JSON (${e.message})`); continue; }
      try { parseLevel(data); } catch (e) { report.errors.push(`${where}: ${e.message}`); continue; }
      if (!data.clues || !Array.isArray(data.bombs)) { report.errors.push(`${where}: a level needs "bombs" and "clues"`); continue; }
      if (data.tutorial !== undefined) {
        try { validateTutorial(data.tutorial, data.grid); } catch (e) { report.errors.push(`${where}: ${e.message}`); continue; }
      }
      if (verify) {
        const r = countSolutions(makePuzzle(specFromLevel(parseLevel(data))), 2);
        if (r.count !== 1 || r.aborted) { report.errors.push(`${where}: ${r.aborted ? 'could not be checked' : r.count === 0 ? 'has no solution' : 'has more than one solution'}`); continue; }
      }
      const id = levelId(data);
      if (seen.has(id)) { report.warnings.push(`${where} is the same puzzle as ${seen.get(id)}: left out`); continue; }
      seen.set(id, where);
      const text = JSON.stringify(data);
      levels.push({ difficulty: d, file, id, text, v: contentVersion(text), tutorial: data.tutorial !== undefined });
    }
  }
  return { levels, report };
}

/** Builds the published files from the source levels. Returns { index, report, levels }. */
export function buildLevels(src, out, { verify = false, dryRun = false, knownDifficulties = null } = {}) {
  if (inside(path.resolve(out), path.resolve(src)) || inside(path.resolve(src), path.resolve(out))) {
    throw new Error('The source directory and the output directory must be different folders that do not contain each other.');
  }
  const { levels, report } = collectLevels(src, { verify, knownDifficulties });
  const difficulties = {};
  for (const l of levels) (difficulties[l.difficulty] ??= []).push({ id: l.id, v: l.v, ...(l.tutorial ? { tutorial: true } : {}) });
  const index = { schema: INDEX_SCHEMA, difficulties };

  if (!dryRun && !report.errors.length) {
    fs.mkdirSync(out, { recursive: true });
    for (const e of fs.readdirSync(out, { withFileTypes: true })) {
      if (isDifficultyDir(e)) fs.rmSync(path.join(out, e.name), { recursive: true, force: true });
      else if (e.name === 'index.json') fs.rmSync(path.join(out, e.name));
    }
    for (const l of levels) {
      fs.mkdirSync(path.join(out, l.difficulty), { recursive: true });
      fs.writeFileSync(path.join(out, l.difficulty, `${entryKey(l)}.json`), l.text);
    }
    fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  }
  return { index, report, levels };
}

function main() {
  const { opts, errors } = parseCli(process.argv.slice(2), SPECS);
  if (opts.help) { console.log(usage()); return; }
  if (errors.length) fail(errors, usage());
  const src = path.resolve(opts.src ?? path.join(root, 'levels')), out = path.resolve(opts.out ?? path.join(root, 'public', 'levels'));
  let known = null;
  try { known = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'shared', 'presets.json'), 'utf8')).levels).map(Number); } catch { /* optional */ }
  let result;
  try { result = buildLevels(src, out, { verify: !!opts.verify, dryRun: !!opts['dry-run'], knownDifficulties: known }); } catch (e) { fail([e.message], usage()); }
  const { index, report, levels } = result;
  for (const w of report.warnings) console.log(`warning: ${w}`);
  for (const e of report.errors) console.error(`ERROR: ${e}`);
  const counts = Object.entries(index.difficulties).map(([d, list]) => `${d}: ${list.length}${list.some((e) => e.tutorial) ? ` (${list.filter((e) => e.tutorial).length} with tutorial)` : ''}`).join('   ') || 'no levels';
  if (!levels.length && !report.errors.length && !fs.existsSync(src)) console.log(`No source levels yet (expected in ${path.relative(process.cwd(), src) || src}/<difficulty>/*.json).`);
  console.log(`${opts['dry-run'] ? 'checked' : 'published'} ${levels.length} level(s)  -  per difficulty  ${counts}`);
  if (report.errors.length) { console.error('\nNothing was written because of the errors above.'); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
