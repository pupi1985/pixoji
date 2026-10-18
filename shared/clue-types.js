/** Clue type names / codes and the parser for clue lists, shared by the presets, the generator and the CLI. */
export const CELL_NAMES = { total: 1, isolated: 2, surrounded: 3, chain: 4, multiplier: 5, area: 6 };
export const LINE_NAMES = { total: 1, 'longest-run': 2, groups: 3 };
export const ALL_CELL_CODES = [1, 2, 3, 4, 5, 6];
export const ALL_LINE_CODES = [1, 2, 3];

/** Preset: ["total","area"] (array, may be empty).  CLI: "total,area" / "1,6" / "all" / "none".  ->  Set of codes */
export function parseTypeList(input, names, all, what) {
  let parts;
  if (Array.isArray(input)) parts = input.map((x) => String(x).trim().toLowerCase());
  else {
    const t = String(input).trim().toLowerCase();
    if (t === 'all') return new Set(all);
    if (t === 'none') return new Set();
    parts = t.split(',').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) throw new Error(`empty ${what} clue list (use "none" to disable them)`);
  }
  const out = new Set();
  for (const part of parts) {
    const code = /^\d+$/.test(part) ? Number(part) : names[part];
    if (!all.includes(code)) throw new Error(`unknown ${what} clue "${part}" (valid: ${Object.keys(names).join(', ')}, or numbers ${all.join(', ')}${Array.isArray(input) ? '' : '; "all"; "none"'})`);
    out.add(code);
  }
  return out;
}
