/**
 * Clue type names / codes and the helpers that read "ranged weights", shared by the presets, the generator and the CLI.
 *
 * A ranged weight is [min, max]: every time a level is generated a value is drawn at random inside the range, and
 * the drawn values of all clue types are turned into percentages (value / sum of values). So "neighbor": [30, 50],
 * "area": [0, 20] means "mostly neighbor clues, sometimes none or a few area clues". A type that is missing (or [0, 0])
 * is never used.
 */
export const CELL_NAMES = { neighbor: 1, isolated: 2, surrounded: 3, chain: 4, multiplier: 5, area: 6 };
export const LINE_NAMES = { count: 1, 'longest-run': 2, groups: 3 };
export const ALL_CELL_CODES = [1, 2, 3, 4, 5, 6];
export const ALL_LINE_CODES = [1, 2, 3];

const lookup = (key, names, all, what) => {
  const k = String(key).trim().toLowerCase();
  const code = /^\d+$/.test(k) ? Number(k) : names[k];
  if (!all.includes(code)) throw new Error(`unknown ${what} clue "${key}" (valid: ${Object.keys(names).join(', ')})`);
  return code;
};

/** [min, max] (or a single number n, meaning [n, n]) with 0 <= min <= max. */
export function checkRange(r, what) {
  const range = typeof r === 'number' ? [r, r] : r;
  if (!Array.isArray(range) || range.length !== 2 || !range.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new Error(`${what} must be a [min, max] range of numbers`);
  if (range[0] < 0 || range[0] > range[1]) throw new Error(`${what} must satisfy 0 <= min <= max, got [${range.join(', ')}]`);
  return [range[0], range[1]];
}

/** Preset form { "neighbor": [30, 50], ... } -> { 1: [30, 50], ... } (keyed by clue code). */
export function normalizeWeights(obj, names, all, what) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`${what} clues must be an object like { "${Object.keys(names)[0]}": [10, 20] }`);
  const out = {};
  for (const [key, range] of Object.entries(obj)) {
    const code = lookup(key, names, all, what);
    if (out[code]) throw new Error(`${what} clue "${key}" is listed twice`);
    out[code] = checkRange(range, `${what} clue "${key}"`);
  }
  return out;
}

/** "30-50" or "40" -> [30, 50] / [40, 40]. */
export function parseRange(text, what = 'range') {
  const m = /^(\d*\.?\d+)(?:-(\d*\.?\d+))?$/.exec(String(text).trim());
  if (!m) throw new Error(`${what} must look like 40 or 30-50, got "${text}"`);
  return checkRange([Number(m[1]), Number(m[2] ?? m[1])], what);
}

/** CLI form "neighbor=30-50,area=10,chain" -> { 1: [30, 50], 6: [10, 10], 4: [1, 1] }. A bare name means weight 1; "none" means no clues. */
export function parseWeightSpec(text, names, all, what) {
  const t = String(text).trim().toLowerCase();
  if (t === 'none') return {};
  const out = {};
  for (const part of t.split(',').map((x) => x.trim()).filter(Boolean)) {
    const [key, value] = part.split('=');
    const code = lookup(key, names, all, what);
    if (out[code]) throw new Error(`${what} clue "${key}" is listed twice`);
    out[code] = value === undefined ? [1, 1] : parseRange(value, `weight of "${key}"`);
  }
  if (!Object.keys(out).length) throw new Error(`empty ${what} clue list (use "none" to disable them)`);
  return out;
}

/** True if at least one entry of a { code: [min, max] } map can be drawn above zero. */
export const hasWeight = (map, codes = null) => Object.entries(map).some(([code, r]) => r[1] > 0 && (!codes || codes.includes(Number(code))));
