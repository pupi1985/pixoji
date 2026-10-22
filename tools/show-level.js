#!/usr/bin/env node
/**
 * show-level.js - prints a level with row / column numbers, its clue values and (with --bombs) the solution, so you can write
 * a tutorial: tutorial coordinates are [row, column] counted from 0 at the top-left cell.
 *
 *   node tools/show-level.js levels/1/01.json [--bombs]
 *
 * Cell clues: N = neighbor, I = isolated, S = surrounded, A = area, M = multiplier, = = chain cell. '#' marks a bomb (--bombs).
 * Line clues: C = count, R = longest run, G = groups.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseLevel, computeValues } from '../shared/logic-core.js';

const CELL = { 1: 'N', 2: 'I', 3: 'S', 4: '=', 5: 'M', 6: 'A' }, LINE = { 1: 'C', 2: 'R', 3: 'G' };

export function renderLevel(json, { bombs = false } = {}) {
  const lv = parseLevel(json);
  const v = computeValues(lv);
  const w = 5;
  const pad = (s) => String(s).padEnd(w);
  const lines = [];
  lines.push('        ' + [...Array(lv.W).keys()].map((c) => pad(`c${c}`)).join(''));
  lines.push('        ' + lv.top.map((t, c) => pad(t ? LINE[t] + v.topVals[c] : '.')).join('') + '  (top clues)');
  for (let r = 0; r < lv.H; r++) {
    const row = lv.C[r].map((t, c) => {
      const label = t ? CELL[t] + (v.cellVals[r][c] ?? '') : '.';
      return pad(bombs && lv.B[r][c] ? `${label}#` : label);
    }).join('');
    lines.push(`r${r}`.padEnd(3) + (lv.left[r] ? pad(LINE[lv.left[r]] + v.leftVals[r]) : pad('.')) + row);
  }
  lines.push('', `${lv.W}x${lv.H}; left column = left clues. Tutorial coordinates: [row, column] from 0.`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file || args.includes('--help')) { console.log('Usage: node tools/show-level.js <level.json> [--bombs]'); process.exitCode = file ? 0 : 1; return; }
  console.log(renderLevel(JSON.parse(fs.readFileSync(file, 'utf8')), { bombs: args.includes('--bombs') }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
