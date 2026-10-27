/**
 * presets-file.js - the one way the tools read shared/presets.json: syntax, DUPLICATE KEYS (JSON.parse would silently keep only the
 * last of two equal keys, e.g. a copy-pasted level that was never renumbered) and the preset rules are all checked, with readable errors.
 *
 *   node tools/presets-file.js [file]      checks the file (default shared/presets.json); also: npm run presets:check
 *
 * Imported by vite.config.js (through presets-plugin.js), so this file must NOT start with a "#!" line: Vite bundles the config and
 * puts its own code first, which makes a shebang a syntax error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validatePresets, difficultiesOf } from '../shared/presets.js';
import { assertNoDuplicateKeys } from '../shared/json-check.js';

export const DEFAULT_PRESETS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'presets.json');

/** Reads, checks and returns the presets (see validatePresets). Throws an Error with a readable message. */
export function readPresetsFile(file = DEFAULT_PRESETS_FILE) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { throw new Error(`Cannot read presets file ${file}: ${e.message}`); }
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`${file} is not valid JSON: ${e.message}`); }
  assertNoDuplicateKeys(text, file);
  return validatePresets(data, file);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PRESETS_FILE;
  try {
    const presets = readPresetsFile(file);
    console.log(`${path.relative(process.cwd(), file) || file}: OK, ${difficultiesOf(presets).length} difficulties (${difficultiesOf(presets).join(', ')})`);
  } catch (e) { console.error(`ERROR: ${e.message}`); process.exitCode = 1; }
}
