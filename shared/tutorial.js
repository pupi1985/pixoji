/**
 * Tutorials: an optional "tutorial" list inside a level's JSON file. Pure logic, shared by the game and the level build tool
 * (which rejects a level whose tutorial is malformed, with a message that says which step and field).
 *
 *   "tutorial": [
 *     { "say":  "Text shown while the board is locked. Tap anywhere (or Next) to continue.",
 *       "highlight": [ { "cell": [1, 2] }, { "around": [1, 2] } ],
 *       "mark": { "bombs": [[0, 0]], "safe": [[2, 2]], "clear": [[3, 3]] } },
 *     { "play": "Text shown while the player may play.",
 *       "highlight": [ { "row": 0 } ],
 *       "until": "next" }
 *   ]
 *
 * Coordinates are [row, column], counted from 0 at the top-left cell (tools/show-level.js prints them).
 *
 *   say        the board is locked; the text stays until the player taps / clicks. Steps can be undone with the back arrow.
 *   play       the board is unlocked and the player can mark cells; the step ends by itself or with the Next button:
 *                until "next"  (default)  the Next button ends it
 *                until "solved"           it ends when the level is solved
 *                until { "bombs": [[r, c]], "safe": [[r, c]] }  it ends when those cells are marked as bombs / pressed (safe)
 *   highlight  what to draw attention to (a single item or a list). Items:
 *                { "cell": [r, c] } / { "cells": [[r, c], ...] }   strong outline
 *                { "around": [r, c] } (or a list of cells)          soft tint on the 3x3 area around the cell(s)
 *                { "row": r } / { "rows": [r, ...] }                the whole row and its left clue
 *                { "col": c } / { "cols": [c, ...] }                the whole column and its top clue
 *                { "rect": [r0, c0, r1, c1] }                       soft tint on a block of cells
 *              Any item may add "style": "primary" (default, gold: the thing being explained), "secondary" (blue: related
 *              cells), "bomb" (red) or "safe" (green). When items overlap, the later one wins.
 *   mark       sets cells when the step starts (to show an example): bombs = marked as bomb, safe = pressed, clear = empty.
 *              Going back restores the board as the tutorial left it before that step.
 */

const isInt = Number.isInteger;
const STEP_KEYS = new Set(['say', 'play', 'highlight', 'mark', 'until']);
const HIGHLIGHT_KEYS = ['cell', 'cells', 'around', 'row', 'rows', 'col', 'cols', 'rect'];
/** Highlight roles; the game maps each to a color (UI_CONFIG.tutorialColors). */
export const HIGHLIGHT_STYLES = ['primary', 'secondary', 'bomb', 'safe'];

/** Validates and normalises a tutorial; throws Error('tutorial step 3: ...') on the first problem. */
export function validateTutorial(raw, { width, height }) {
  const bad = (where, msg) => { throw new Error(`tutorial${where}: ${msg}`); };
  const cell = (v, where) => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every(isInt)) bad(where, `expected [row, column], got ${JSON.stringify(v)}`);
    if (v[0] < 0 || v[0] >= height || v[1] < 0 || v[1] >= width) bad(where, `cell [${v[0]}, ${v[1]}] is outside the grid (rows 0-${height - 1}, columns 0-${width - 1})`);
    return [v[0], v[1]];
  };
  const cells = (v, where) => {
    if (!Array.isArray(v) || !v.length) bad(where, 'expected a list of [row, column] cells');
    return v.map((c, i) => cell(c, `${where}[${i}]`));
  };
  const index = (v, limit, name, where) => {
    if (!isInt(v) || v < 0 || v >= limit) bad(where, `${name} ${JSON.stringify(v)} is outside the grid (0-${limit - 1})`);
    return v;
  };
  const indexes = (v, limit, name, where) => {
    if (!Array.isArray(v) || !v.length) bad(where, `expected a list of ${name}s`);
    return v.map((x, i) => index(x, limit, name, `${where}[${i}]`));
  };

  if (!Array.isArray(raw) || !raw.length) bad('', 'must be a non-empty list of steps');
  return raw.map((step, s) => {
    const at = ` step ${s + 1}`;
    if (!step || typeof step !== 'object' || Array.isArray(step)) bad(at, 'must be an object like { "say": "text" }');
    for (const key of Object.keys(step)) if (!STEP_KEYS.has(key)) bad(at, `unknown key "${key}" (allowed: ${[...STEP_KEYS].join(', ')})`);
    if ((step.say === undefined) === (step.play === undefined)) bad(at, 'needs exactly one of "say" (locked board) or "play" (board unlocked)');
    const kind = step.say !== undefined ? 'say' : 'play';
    const text = step[kind];
    if (typeof text !== 'string' || !text.trim()) bad(`${at}.${kind}`, 'must be a non-empty text');

    const items = step.highlight === undefined ? [] : Array.isArray(step.highlight) ? step.highlight : [step.highlight];
    const highlight = items.map((item, i) => {
      const where = `${at}.highlight[${i}]`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) bad(where, 'must be an object like { "cell": [1, 2] }');
      const style = item.style === undefined ? 'primary' : item.style;
      if (!HIGHLIGHT_STYLES.includes(style)) bad(`${where}.style`, `must be one of: ${HIGHLIGHT_STYLES.join(', ')} (got ${JSON.stringify(item.style)})`);
      const keys = Object.keys(item).filter((k) => k !== 'style');
      if (keys.length !== 1 || !HIGHLIGHT_KEYS.includes(keys[0])) bad(where, `needs exactly one of: ${HIGHLIGHT_KEYS.join(', ')} (and optionally "style")`);
      const [key] = keys, v = item[key], here = `${where}.${key}`;
      if (key === 'cell') return { kind: 'cells', style, cells: [cell(v, here)] };
      if (key === 'cells') return { kind: 'cells', style, cells: cells(v, here) };
      if (key === 'around') return { kind: 'around', style, cells: Array.isArray(v) && v.length === 2 && v.every(isInt) ? [cell(v, here)] : cells(v, here) };
      if (key === 'row') return { kind: 'rows', style, rows: [index(v, height, 'row', here)] };
      if (key === 'rows') return { kind: 'rows', style, rows: indexes(v, height, 'row', here) };
      if (key === 'col') return { kind: 'cols', style, cols: [index(v, width, 'column', here)] };
      if (key === 'cols') return { kind: 'cols', style, cols: indexes(v, width, 'column', here) };
      if (!Array.isArray(v) || v.length !== 4) bad(here, 'expected [row1, column1, row2, column2]');
      const [r0, c0] = cell([v[0], v[1]], here), [r1, c1] = cell([v[2], v[3]], here);
      return { kind: 'rect', style, rect: [Math.min(r0, r1), Math.min(c0, c1), Math.max(r0, r1), Math.max(c0, c1)] };
    });

    const mark = { bombs: [], safe: [], clear: [] };
    if (step.mark !== undefined) {
      if (!step.mark || typeof step.mark !== 'object' || Array.isArray(step.mark)) bad(`${at}.mark`, 'must be { "bombs": [...], "safe": [...], "clear": [...] }');
      for (const [key, v] of Object.entries(step.mark)) {
        if (!(key in mark)) bad(`${at}.mark`, `unknown key "${key}" (allowed: bombs, safe, clear)`);
        mark[key] = cells(v, `${at}.mark.${key}`);
      }
    }

    let until = { mode: 'next', bombs: [], safe: [] };
    if (step.until !== undefined) {
      if (kind === 'say') bad(`${at}.until`, '"until" only makes sense for "play" steps');
      if (step.until === 'next' || step.until === 'solved') until = { mode: step.until, bombs: [], safe: [] };
      else if (step.until && typeof step.until === 'object' && !Array.isArray(step.until)) {
        until = { mode: 'cells', bombs: [], safe: [] };
        for (const [key, v] of Object.entries(step.until)) {
          if (key !== 'bombs' && key !== 'safe') bad(`${at}.until`, `unknown key "${key}" (allowed: bombs, safe)`);
          until[key] = cells(v, `${at}.until.${key}`);
        }
        if (!until.bombs.length && !until.safe.length) bad(`${at}.until`, 'list at least one cell in "bombs" or "safe"');
      } else bad(`${at}.until`, 'must be "next", "solved" or { "bombs": [...], "safe": [...] }');
    }
    return { kind, text: text.trim(), highlight, mark, until };
  });
}

/**
 * What a step's highlight covers on a width x height grid, each with the style of the item that set it (later items win):
 * { strong: [{ r, c, style }] outlined cells, soft: [{ r, c, style }] tinted cells,
 *   rows: [{ index, style }] / cols: [{ index, style }] whose line clue is ringed }.
 */
export function resolveHighlight(items, width, height) {
  const strong = new Map(), soft = new Map(), rows = new Map(), cols = new Map();
  const put = (map, r, c, style) => { if (r >= 0 && r < height && c >= 0 && c < width) map.set(r * width + c, { r, c, style }); };
  for (const item of items) {
    const { style } = item;
    if (item.kind === 'cells') item.cells.forEach(([r, c]) => put(strong, r, c, style));
    else if (item.kind === 'around') item.cells.forEach(([r, c]) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) put(soft, r + dr, c + dc, style); });
    else if (item.kind === 'rows') item.rows.forEach((r) => { rows.set(r, { index: r, style }); for (let c = 0; c < width; c++) put(soft, r, c, style); });
    else if (item.kind === 'cols') item.cols.forEach((c) => { cols.set(c, { index: c, style }); for (let r = 0; r < height; r++) put(soft, r, c, style); });
    else { const [r0, c0, r1, c1] = item.rect; for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) put(soft, r, c, style); }
  }
  for (const key of strong.keys()) soft.delete(key);   // a strongly outlined cell is not tinted as well
  return { strong: [...strong.values()], soft: [...soft.values()], rows: [...rows.values()], cols: [...cols.values()] };
}

/** The cell states the tutorial itself sets from step 0 up to and including step `upTo`, in order: [{ r, c, state }]. */
export function marksUpTo(steps, upTo) {
  const out = [];
  for (let i = 0; i <= upTo && i < steps.length; i++) {
    const { clear, safe, bombs } = steps[i].mark;
    clear.forEach(([r, c]) => out.push({ r, c, state: 0 }));
    safe.forEach(([r, c]) => out.push({ r, c, state: 2 }));
    bombs.forEach(([r, c]) => out.push({ r, c, state: 1 }));
  }
  return out;
}

/** True when a "play" step with an { bombs, safe } condition is satisfied by the board (cellStates, row-major). */
export function untilMet(step, cellStates, width) {
  if (step.kind !== 'play' || step.until.mode !== 'cells') return false;
  return step.until.bombs.every(([r, c]) => cellStates[r * width + c] === 1) && step.until.safe.every(([r, c]) => cellStates[r * width + c] === 2);
}
