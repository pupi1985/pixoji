/**
 * generator.js - creates logic-only levels that are UNIQUELY solvable and need a chosen amount of hypothesis
 * reasoning.  Pure logic (no Node or browser APIs): used by tools/generate-level.js and by the game, which runs it
 * inside a web worker for random levels.
 */
import { CELL, DIRS4, cellValue, lineValue, cellW, makePuzzle } from './logic-core.js';
import { countSolutions, rateSolve } from './solver-core.js';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const randInt = (rng, n) => Math.floor(rng() * n);
function shuffle(rng, a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function weightedOrder(rng, weights) { // random permutation biased by weights
  return Object.entries(weights).map(([t, w]) => [Number(t), -Math.log(rng() || 1e-9) / w]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

function makeStructure(rng, o) {
  const { W, H } = o;
  const B = Array.from({ length: H }, () => Array.from({ length: W }, () => (rng() < o.bombRatio ? 1 : 0)));
  const C = Array.from({ length: H }, () => Array(W).fill(0));
  const chainOf = Array.from({ length: H }, () => Array(W).fill(-1));
  const inb = (r, c) => r >= 0 && r < H && c >= 0 && c < W;
  const nearOther = (r, c, id) => {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const a = r + dr, b = c + dc;
      if (inb(a, b) && chainOf[a][b] >= 0 && chainOf[a][b] !== id) return true;
    }
    return false;
  };
  for (let k = 0; k < o.chains; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const r = randInt(rng, H), c = randInt(rng, W);
      if (C[r][c] || nearOther(r, c, k)) continue;
      const target = 2 + randInt(rng, Math.max(1, o.maxChain - 1));
      const cells = [[r, c]]; chainOf[r][c] = k; C[r][c] = CELL.CHAIN;
      for (let guard = 0; cells.length < target && guard < 60; guard++) {
        const [br, bc] = cells[randInt(rng, cells.length)], [dr, dc] = DIRS4[randInt(rng, 4)];
        const nr = br + dr, nc = bc + dc;
        if (!inb(nr, nc) || C[nr][nc] || nearOther(nr, nc, k)) continue;
        chainOf[nr][nc] = k; C[nr][nc] = CELL.CHAIN; cells.push([nr, nc]);
      }
      if (cells.length < 2) { cells.forEach(([a, b]) => { C[a][b] = 0; chainOf[a][b] = -1; }); continue; }
      const state = rng() < o.bombRatio ? 1 : 0;
      cells.forEach(([a, b]) => { B[a][b] = state; });   // a chain is all-bomb or all-safe
      break;
    }
  }
  for (let k = 0; k < o.multipliers; k++) {
    for (let tries = 0; tries < 80; tries++) {
      const r = randInt(rng, H), c = randInt(rng, W);
      if (C[r][c]) continue;
      if (B[r][c] === 0 && rng() < 0.7) continue;    // a multiplier only matters on bombs
      C[r][c] = CELL.MULT; break;
    }
  }
  return { B, C };
}

function pickWeights(weights, allowed) {
  return Object.fromEntries(Object.entries(weights).filter(([t]) => allowed.has(Number(t))));
}

function assignClues(rng, B, C, o) {
  const { W, H } = o;
  const cellVals = Array.from({ length: H }, () => Array(W).fill(null));
  const cells = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (C[r][c] === 0) cells.push([r, c]);
  shuffle(rng, cells);
  for (const [r, c] of cells) {
    for (const t of weightedOrder(rng, pickWeights({ 1: 40, 2: 20, 3: 15, 6: 25 }, o.cellTypes))) {
      const v = cellValue(t, B, C, r, c);
      if (t === CELL.AREA && v > o.maxAreaClue) continue;   // too big for a human to count: take the next clue type instead
      let dup = false;
      if (!o.redundant) {     // "contradiction filtering": no identical adjacent clues
      for (let dr = -1; dr <= 1 && !dup; dr++) for (let dc = -1; dc <= 1; dc++) {
        const a = r + dr, b = c + dc;
        if ((dr || dc) && a >= 0 && a < H && b >= 0 && b < W && C[a][b] === t && cellVals[a][b] === v) { dup = true; break; }
      }
      }
      if (dup) continue;
      C[r][c] = t; cellVals[r][c] = v; break;
    }
  }
  const lineW = pickWeights({ 1: 50, 2: 25, 3: 25 }, o.lineTypes);
  const pickLine = () => (Object.keys(lineW).length ? weightedOrder(rng, lineW)[0] : 0);
  const top = [], left = [];
  for (let c = 0; c < W; c++) top.push(pickLine());
  for (let r = 0; r < H; r++) left.push(pickLine());
  const topVals = top.map((t, c) => (t ? lineValue(t, B.map((row) => row[c]), C.map((row) => cellW(row[c]))) : null));
  const leftVals = left.map((t, r) => (t ? lineValue(t, B[r], C[r].map(cellW)) : null));
  return { cellVals, top, left, topVals, leftVals };
}

function tryGenerate(rng, o, log) {
  const { W, H } = o;
  const { B, C } = makeStructure(rng, o);
  const structCount = C.flat().filter((t) => t === CELL.CHAIN || t === CELL.MULT).length;
  const { cellVals, top, left, topVals, leftVals } = assignClues(rng, B, C, o);
  const orig = { C: C.map((r) => r.slice()), top: top.slice(), left: left.slice() };
  const build = (st) => makePuzzle({ W, H, C: st.C, top: st.top, left: st.left, cellVals, topVals, leftVals }, { maxNodes: o.nodeBudget });
  const copy = (st) => ({ C: st.C.map((r) => r.slice()), top: st.top.slice(), left: st.left.slice() });
  const unique = (st) => { const r = countSolutions(build(st), 2, o.searchBudget); return r.count === 1 && !r.aborted; };

  // depth-0 levels are pruned with the real solver (cheap at depth 0), so clues are only dropped while direct deduction still works
  const acceptable = (st) => (o.maxDepth === 0 ? rateSolve(build(st), { maxDepth: 0, timeLimit: o.timeLimit }).solved : unique(st));
  const full = copy(orig);
  if (!unique(full)) { log('  full clue set is not unique, re-rolling'); return null; }
  if (o.maxDepth === 0 && !acceptable(full)) { log('  not solvable by direct deduction even with every clue, re-rolling'); return null; }

  // ---- prune clues while the solution stays unique
  const slots = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (orig.C[r][c] >= 1 && orig.C[r][c] !== 4 && orig.C[r][c] !== 5) slots.push({ k: 'cell', r, c });
  for (let c = 0; c < W; c++) if (orig.top[c]) slots.push({ k: 'top', c });
  for (let r = 0; r < H; r++) if (orig.left[r]) slots.push({ k: 'left', r });
  shuffle(rng, slots);
  const getV = (st, s) => (s.k === 'cell' ? st.C[s.r][s.c] : s.k === 'top' ? st.top[s.c] : st.left[s.r]);
  const setV = (st, s, v) => { if (s.k === 'cell') st.C[s.r][s.c] = v; else if (s.k === 'top') st.top[s.c] = v; else st.left[s.r] = v; };

  const state = copy(orig), removed = [];
  const pruneTo = (targetCells, targetLines) => {
    let nCells = slots.filter((s) => s.k === 'cell' && getV(state, s)).length + structCount;
    let nLines = slots.filter((s) => s.k !== 'cell' && getV(state, s)).length;
    for (const s of slots) {
      const cur = getV(state, s);
      if (!cur) continue;
      if (s.k === 'cell' ? nCells <= targetCells : nLines <= targetLines) continue;
      setV(state, s, 0);
      if (acceptable(state)) { removed.push({ s, v: cur }); if (s.k === 'cell') nCells--; else nLines--; }
      else setV(state, s, cur);
    }
  };
  const total = W * H;
  const dens = o.density[0] + rng() * (o.density[1] - o.density[0]);
  let T = Date.now();
  pruneTo(Math.round(dens * total), Math.round(o.lineDensity * (W + H)));
  log(`  pruned to ${removed.length} removals in ${Date.now() - T}ms`);

  const rate = (st) => { const t0 = Date.now(); const res = rateSolve(build(st), { maxDepth: o.maxDepth, timeLimit: o.timeLimit }); log(`  rated: solved=${res.solved} rating=${res.rating} timeout=${!!res.timeout} ${Date.now() - t0}ms`); return res; };
  let r = rate(state);
  if (r.solved && r.rating < o.minDepth) {            // too easy: keep removing clues
    pruneTo(0, 0);
    r = rate(state);
  }
  if (!r.solved) {                                     // too hard: put clues back (monotone: more clues = easier)
    const withBack = (k) => { const st = copy(state); removed.slice().reverse().slice(0, k).forEach(({ s, v }) => setV(st, s, v)); return st; };
    let lo = 0, hi = removed.length;
    if (!rate(withBack(hi)).solved) { log('  not solvable within the depth limit even with every clue'); return null; }
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rate(withBack(mid)).solved) hi = mid; else lo = mid; }
    Object.assign(state, withBack(hi));
    r = rate(state);
  }
  if (!r.solved) return null;
  if (r.rating < o.minDepth) { log(`  rating ${r.rating} < min-depth ${o.minDepth}`); return null; }
  const cellClues = state.C.flat().filter((t) => t >= 1).length;
  return {
    W, H, B, C: state.C, top: state.top, left: state.left,
    meta: { rating: r.rating, steps: r.steps, stepsByDepth: r.byDepth, clueDensity: Number((cellClues / total).toFixed(2)), lineClues: state.top.concat(state.left).filter(Boolean).length, cellTypes: [...new Set(state.C.flat().filter(Boolean))].sort(), lineTypes: [...new Set(state.top.concat(state.left).filter(Boolean))].sort() },
  };
}

export function toJson(lv, meta) {
  const rows = (m) => m.map((r) => `    [${r.join(', ')}]`).join(',\n');
  return `{
  "grid": { "width": ${lv.W}, "height": ${lv.H} },
  "bombs": [
${rows(lv.B)}
  ],
  "clues": {
    "top": [${lv.top.join(', ')}],
    "left": [${lv.left.join(', ')}],
    "grid": [
${rows(lv.C)}
    ]
  }${meta ? `,\n  "meta": ${JSON.stringify(meta)}` : ''}
}
`;
}

export function generateLevel(o, seed, log = () => {}) {
  const rng = mulberry32(seed);
  for (let a = 1; a <= o.attempts; a++) {
    log(`attempt ${a}`);
    const lv = tryGenerate(rng, o, log);
    if (lv) return { ...lv, meta: { ...lv.meta, seed, attempts: a, level: o.level } };
  }
  return null;
}

/** The level as the plain object the game loads (same shape as the JSON files). */
export const levelToData = (lv, meta = null) => JSON.parse(toJson(lv, meta));
