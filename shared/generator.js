/**
 * generator.js - creates logic-only levels that are UNIQUELY solvable and need a chosen amount of hypothesis
 * reasoning.  Pure logic (no Node or browser APIs): used by tools/generate-level.js and by the game, which runs it
 * inside a web worker for random levels.
 */
import { CELL, DIRS4, cellValue, lineValue, cellW, makePuzzle } from './logic-core.js';
import { countSolutions, rateSolve, measureComplexity } from './solver-core.js';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const randInt = (rng, n) => Math.floor(rng() * n);
function shuffle(rng, a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function weightedOrder(rng, weights) { // random permutation biased by weights
  return Object.entries(weights).map(([t, w]) => [Number(t), -Math.log(rng() || 1e-9) / w]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

/**
 * Random bombs plus the structural clue cells: chains (clue 4, always all-bomb or all-safe, never touching another
 * chain) holding about `chainCells` cells in total, and `multCells` multiplier cells (clue 5).
 */
function makeStructure(rng, o, ratio, chainCells, multCells) {
  const { W, H } = o;
  const B = Array.from({ length: H }, () => Array.from({ length: W }, () => (rng() < ratio ? 1 : 0)));
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
  let remaining = chainCells;
  for (let k = 0; remaining >= 2 && k < 16; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const r = randInt(rng, H), c = randInt(rng, W);
      if (C[r][c] || nearOther(r, c, k)) continue;
      let target = Math.min(remaining, 2 + randInt(rng, Math.max(1, o.chainClueMaxSize - 1)));
      if (remaining - target === 1) target = remaining <= o.chainClueMaxSize ? remaining : target - 1;   // never leave a lone cell over
      target = Math.max(2, target);
      const cells = [[r, c]]; chainOf[r][c] = k; C[r][c] = CELL.CHAIN;
      for (let guard = 0; cells.length < target && guard < 60; guard++) {
        const [br, bc] = cells[randInt(rng, cells.length)], [dr, dc] = DIRS4[randInt(rng, 4)];
        const nr = br + dr, nc = bc + dc;
        if (!inb(nr, nc) || C[nr][nc] || nearOther(nr, nc, k)) continue;
        chainOf[nr][nc] = k; C[nr][nc] = CELL.CHAIN; cells.push([nr, nc]);
      }
      if (cells.length < 2) { cells.forEach(([a, b]) => { C[a][b] = 0; chainOf[a][b] = -1; }); continue; }
      const state = rng() < ratio ? 1 : 0;
      cells.forEach(([a, b]) => { B[a][b] = state; });   // a chain is all-bomb or all-safe
      remaining -= cells.length;
      break;
    }
  }
  for (let k = 0; k < multCells; k++) {
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
  return Object.fromEntries(Object.entries(weights).filter(([t, w]) => w > 0 && allowed.includes(Number(t))));
}

/** cellWt / lineWt: the weights drawn for this level, { code: weight } (only types that can be placed per cell / line). */
function assignClues(rng, B, C, o, cellWt, lineWt) {
  const { W, H } = o;
  const cellVals = Array.from({ length: H }, () => Array(W).fill(null));
  const cells = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (C[r][c] === 0) cells.push([r, c]);
  shuffle(rng, cells);
  for (const [r, c] of cells) {
    for (const t of weightedOrder(rng, pickWeights(cellWt, [1, 2, 3, 6]))) {
      const v = cellValue(t, B, C, r, c);
      if (t === CELL.AREA && v > o.areaClueMaxSize) continue;   // too big for a human to count: take the next clue type instead
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
  const pickLine = () => (Object.keys(lineWt).length ? weightedOrder(rng, lineWt)[0] : 0);
  const top = [], left = [];
  for (let c = 0; c < W; c++) top.push(pickLine());
  for (let r = 0; r < H; r++) left.push(pickLine());
  const topVals = top.map((t, c) => (t ? lineValue(t, B.map((row) => row[c]), C.map((row) => cellW(row[c]))) : null));
  const leftVals = left.map((t, r) => (t ? lineValue(t, B[r], C[r].map(cellW)) : null));
  return { cellVals, top, left, topVals, leftVals };
}

/**
 * One deterministic attempt: everything is derived from `rng` (seeded) and `o`, and effort is limited by counted solver
 * work (never by time), so a seed always gives the same level - or always none.
 */
function tryGenerate(rng, o, log) {
  const { W, H } = o;
  const total = W * H;
  // 1. draw the level's character: every ranged value gets one random number inside its range (fixed order)
  const lerp = (range) => range[0] + rng() * (range[1] - range[0]);
  const [minDepth, maxDepth] = o.depth;
  const ratio = lerp(o.bombs);
  const dens = lerp(o.cellCluesDensity), lineDens = lerp(o.lineCluesDensity);
  const cellWt = {}, lineWt = {};
  for (const t of [1, 2, 3, 4, 5, 6]) if (o.cellWeights[t]) { const w = lerp(o.cellWeights[t]); if (w > 0) cellWt[t] = w; }
  for (const t of [1, 2, 3]) if (o.lineWeights[t]) { const w = lerp(o.lineWeights[t]); if (w > 0) lineWt[t] = w; }
  const targetCells = Math.round(dens * total), targetLines = Math.round(lineDens * (W + H));
  // 2. weights -> percentages -> how many cells of each structural clue (chains / multipliers) this level gets
  const sumW = Object.values(cellWt).reduce((a, b) => a + b, 0);
  const cellsOf = (t) => (sumW > 0 && cellWt[t] ? Math.round((cellWt[t] / sumW) * targetCells) : 0);
  log(`  bombs ${(ratio * 100).toFixed(0)}%, clue cells ${targetCells}, line clues ${targetLines}, weights ${JSON.stringify(cellWt)} / ${JSON.stringify(lineWt)}`);

  // deterministic effort accounting (see options.js)
  const meter = { used: 0, limit: o.seedWork };
  const outOfWork = () => meter.used >= o.seedWork;
  const callMeter = () => { meter.limit = Math.min(meter.used + o.callWork, o.seedWork); return meter; };

  const { B, C } = makeStructure(rng, o, ratio, cellsOf(CELL.CHAIN), cellsOf(CELL.MULT));
  const structCount = C.flat().filter((t) => t === CELL.CHAIN || t === CELL.MULT).length;
  const { cellVals, top, left, topVals, leftVals } = assignClues(rng, B, C, o, cellWt, lineWt);
  const orig = { C: C.map((r) => r.slice()), top: top.slice(), left: left.slice() };
  const build = (st) => makePuzzle({ W, H, C: st.C, top: st.top, left: st.left, cellVals, topVals, leftVals }, { maxNodes: o.nodeBudget, meter });
  const copy = (st) => ({ C: st.C.map((r) => r.slice()), top: st.top.slice(), left: st.left.slice() });
  const unique = (st) => { const r = countSolutions(build(st), 2, o.searchBudget); return r.count === 1 && !r.aborted; };

  // depth-0 levels are pruned with the real solver (cheap at depth 0), so clues are only dropped while direct deduction still works
  const acceptable = (st) => (maxDepth === 0 ? rateSolve(build(st), { maxDepth: 0, meter: callMeter() }).solved : unique(st));
  const full = copy(orig);
  if (!unique(full)) { log('  full clue set is not unique, re-rolling'); return null; }
  if (maxDepth === 0 && !acceptable(full)) { log('  not solvable by direct deduction even with every clue, re-rolling'); return null; }

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
      if (outOfWork()) return false;
      setV(state, s, 0);
      if (acceptable(state)) { removed.push({ s, v: cur }); if (s.k === 'cell') nCells--; else nLines--; }
      else setV(state, s, cur);
    }
    return true;
  };
  let T = Date.now();
  if (!pruneTo(targetCells, targetLines)) { log('  out of work budget'); return null; }
  log(`  pruned to ${removed.length} removals in ${Date.now() - T}ms`);

  const rate = (st) => { const t0 = Date.now(); const res = rateSolve(build(st), { maxDepth, meter: callMeter() }); log(`  rated: solved=${res.solved} rating=${res.rating} timeout=${!!res.timeout} ${Date.now() - t0}ms`); return res; };
  let r = rate(state);
  if (r.solved && r.rating < minDepth) {            // too easy: keep removing clues
    if (!pruneTo(0, 0)) { log('  out of work budget'); return null; }
    r = rate(state);
  }
  if (!r.solved) {                                     // too hard: put clues back (monotone: more clues = easier)
    const withBack = (k) => { const st = copy(state); removed.slice().reverse().slice(0, k).forEach(({ s, v }) => setV(st, s, v)); return st; };
    let lo = 0, hi = removed.length;
    if (!rate(withBack(hi)).solved) { log('  not solvable within the depth limit even with every clue'); return null; }
    while (hi - lo > 1) { if (outOfWork()) { log('  out of work budget'); return null; } const mid = (lo + hi) >> 1; if (rate(withBack(mid)).solved) hi = mid; else lo = mid; }
    Object.assign(state, withBack(hi));
    r = rate(state);
  }
  if (!r.solved) return null;
  if (r.rating < minDepth) { log(`  rating ${r.rating} < minimum depth ${minDepth}`); return null; }
  const cellClues = state.C.flat().filter((t) => t >= 1).length;
  // complexity of the finished level (a separate, un-metered puzzle: the measurement must not use the seed's work budget)
  const measured = measureComplexity(makePuzzle({ W, H, C: state.C, top: state.top, left: state.left, cellVals, topVals, leftVals }, { maxNodes: o.nodeBudget }), { maxDepth: Math.max(maxDepth, 1) });
  return {
    W, H, B, C: state.C, top: state.top, left: state.left,
    meta: { rating: r.rating, complexity: measured.complexity, chain: measured.chain, steps: r.steps, stepsByDepth: r.byDepth, clueDensity: Number((cellClues / total).toFixed(2)), work: Math.round(meter.used), bombRatio: Number(ratio.toFixed(2)), lineClues: state.top.concat(state.left).filter(Boolean).length, cellTypes: [...new Set(state.C.flat().filter(Boolean))].sort(), lineTypes: [...new Set(state.top.concat(state.left).filter(Boolean))].sort() },
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

/**
 * The level for one seed, or null if that seed does not give one (then try another seed).
 * Deterministic: same options + same seed = same result, on any machine.
 */
export function generateLevel(o, seed, log = () => {}) {
  const lv = tryGenerate(mulberry32(seed), o, log);
  return lv ? { ...lv, meta: { ...lv.meta, seed, level: o.level } } : null;
}

/** The level as the plain object the game loads (same shape as the JSON files). */
export const levelToData = (lv, meta = null) => JSON.parse(toJson(lv, meta));
