/**
 * logic-core.js - shared model for the logic-minesweeper tools (solver + generator).
 *
 * Level JSON format (same as level2.json / level3.json):
 *   { grid:{width,height}, bombs:[[0/1..]..], clues:{ top:[..], left:[..], grid:[[..]..] } }
 *
 * Cell clue codes : 1 Neighbor, 2 Isolated, 3 Surrounded, 4 Chain, 5 Multiplier, 6 Area
 * Line clue codes : 1 Count, 2 Longest run, 3 Segments
 *
 * The solver never looks at the bombs matrix: clue VALUES are computed from it once
 * (exactly like the game does) and from then on only the values + clue layout are used.
 */

export const CELL = Object.freeze({ NONE: 0, TOTAL: 1, ISOLATED: 2, SURROUNDED: 3, CHAIN: 4, MULT: 5, AREA: 6 });
export const LINE = Object.freeze({ NONE: 0, TOTAL: 1, MAXRUN: 2, SEGMENTS: 3 });
export const isNumericCell = (t) => t === 1 || t === 2 || t === 3 || t === 6;
export const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export const cellLabel = (r, c) => `R${r + 1}C${c + 1}`;
export const cellW = (code) => (code === CELL.MULT ? 2 : 1);

// ---------------------------------------------------------------- level I/O
export function parseLevel(json) {
  const W = json?.grid?.width, H = json?.grid?.height;
  if (!Number.isInteger(W) || !Number.isInteger(H)) throw new Error('Level has no valid grid.width / grid.height');
  const at = (m, r, c) => (m && m[r] && m[r][c]) || 0;
  const C = Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => at(json.clues?.grid, r, c)));
  const top = Array.from({ length: W }, (_, c) => json.clues?.top?.[c] || 0);
  const left = Array.from({ length: H }, (_, r) => json.clues?.left?.[r] || 0);
  let B = null;
  if (Array.isArray(json.bombs)) {
    const ok = json.bombs.length === H && json.bombs.every((row) => Array.isArray(row) && row.length === W && row.every((v) => v === 0 || v === 1));
    if (!ok) throw new Error('"bombs" must be an H x W matrix of 0/1 (a list of rows, each with one 0/1 per column)');
    B = json.bombs.map((row) => row.slice());
  }
  return { W, H, B, C, top, left };
}

// ---------------------------------------------------------------- clue maths (mirrors grid.js / rules.txt)
export function lineValue(type, bits, wts) {
  if (type === LINE.TOTAL) { let s = 0; bits.forEach((b, i) => { if (b) s += wts[i]; }); return s; }
  if (type === LINE.MAXRUN) {
    let cur = 0, max = 0;
    bits.forEach((b, i) => { if (b) { cur += wts[i]; if (cur > max) max = cur; } else cur = 0; });
    return max;
  }
  if (type === LINE.SEGMENTS) { let n = 0; bits.forEach((b, i) => { if (b && (i === 0 || !bits[i - 1])) n++; }); return n; }
  return null;
}

export function cellValue(type, B, C, r, c) {
  const H = B.length, W = B[0].length;
  const inb = (a, b) => a >= 0 && a < H && b >= 0 && b < W;
  if (type === CELL.AREA) {
    const s = B[r][c];
    const seen = Array.from({ length: H }, () => Array(W).fill(false));
    const q = [[r, c]]; seen[r][c] = true; let sum = 0;
    for (let i = 0; i < q.length; i++) {
      const [a, b] = q[i]; sum += cellW(C[a][b]);
      for (const [dr, dc] of DIRS4) {
        const na = a + dr, nb = b + dc;
        if (inb(na, nb) && !seen[na][nb] && B[na][nb] === s) { seen[na][nb] = true; q.push([na, nb]); }
      }
    }
    return sum;
  }
  const bomb = (a, b) => (inb(a, b) ? B[a][b] : 0);
  const wall = (a, b) => (inb(a, b) ? B[a][b] === 1 : true);
  let total = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const a = r + dr, b = c + dc;
    if (!inb(a, b) || B[a][b] !== 1) continue;
    const w = cellW(C[a][b]);
    if (type === CELL.TOTAL) total += w;
    else if (type === CELL.ISOLATED) { if (!bomb(a - 1, b) && !bomb(a + 1, b) && !bomb(a, b - 1) && !bomb(a, b + 1)) total += w; }
    else if (type === CELL.SURROUNDED) { if (wall(a - 1, b) && wall(a + 1, b) && wall(a, b - 1) && wall(a, b + 1)) total += w; }
  }
  return total;
}

export function computeValues({ H, W, B, C, top, left }) {
  const cellVals = C.map((row, r) => row.map((t, c) => (isNumericCell(t) ? cellValue(t, B, C, r, c) : null)));
  const topVals = top.map((t, c) => (t ? lineValue(t, B.map((row) => row[c]), C.map((row) => cellW(row[c]))) : null));
  const leftVals = left.map((t, r) => (t ? lineValue(t, B[r], C[r].map(cellW)) : null));
  return { cellVals, topVals, leftVals };
}

export const specFromLevel = (level) => ({ ...level, ...computeValues(level) });

// ---------------------------------------------------------------- puzzle model
export const groupLabel = (puz, g) => {
  const cells = puz.groups[g].cells;
  return cells.length === 1 ? cellLabel(...cells[0]) : `chain [${cells.map(([r, c]) => cellLabel(r, c)).join(', ')}]`;
};

/**
 * Builds the solver model. Cells of one chain (clue 4) are merged into a single "group" variable.
 * Each constraint exposes:  groups, describe(), analyze(get) -> {contradiction, forced:[{g,v}], ...}
 * where get(g) returns -1 (unknown) / 0 (safe) / 1 (bomb).
 */
export function makePuzzle(spec, opts = {}) {
  const { W, H, C, top, left, cellVals, topVals, leftVals } = spec;
  const puz = {
    W, H, C, top, left, cellVals, topVals, leftVals,
    maxNodes: opts.maxNodes ?? 30000,
    meter: opts.meter ?? null,   // optional deterministic work counter (see options.js)
    gid: Array.from({ length: H }, () => Array(W).fill(-1)),
    groups: [], constraints: [], byGroup: [], globals: [],
  };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (puz.gid[r][c] >= 0) continue;
    const id = puz.groups.length, cells = [[r, c]];
    puz.gid[r][c] = id;
    if (C[r][c] === CELL.CHAIN) {
      for (let i = 0; i < cells.length; i++) for (const [dr, dc] of DIRS4) {
        const nr = cells[i][0] + dr, nc = cells[i][1] + dc;
        if (nr >= 0 && nr < H && nc >= 0 && nc < W && puz.gid[nr][nc] < 0 && C[nr][nc] === CELL.CHAIN) { puz.gid[nr][nc] = id; cells.push([nr, nc]); }
      }
    }
    puz.groups.push({ id, cells });
  }
  puz.nG = puz.groups.length;
  puz.byGroup = Array.from({ length: puz.nG }, () => []);

  for (let c = 0; c < W; c++) if (top[c] && topVals[c] != null) addLine(puz, 'col', c, top[c], topVals[c]);
  for (let r = 0; r < H; r++) if (left[r] && leftVals[r] != null) addLine(puz, 'row', r, left[r], leftVals[r]);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const t = C[r][c];
    if (isNumericCell(t) && cellVals[r][c] != null) addCell(puz, r, c, t, cellVals[r][c]);
  }
  return puz;
}

function register(puz, cons) {
  cons.id = puz.constraints.length;
  if (!cons.analyze) cons.analyze = (get) => enumAnalyze(puz, cons, get);
  puz.constraints.push(cons);
  if (cons.global) puz.globals.push(cons.id);
  else for (const g of cons.groups) puz.byGroup[g].push(cons.id);
}

/** Exhaustive enumeration of the open groups of one constraint, with pruning and a node budget. */
function enumAnalyze(puz, cons, get) {
  const cur = new Int8Array(puz.nG).fill(-1);
  for (const g of cons.groups) cur[g] = get(g);
  const unk = cons.groups.filter((g) => cur[g] < 0);
  if (!cons.partial(cur)) return { contradiction: true, forced: [], unk };
  const n = unk.length, seen0 = new Uint8Array(n), seen1 = new Uint8Array(n);
  const SAMPLE = 64, sols = [];
  let count = 0, nodes = 0, over = false, stop = false;
  const dfs = (i) => {
    if (++nodes > puz.maxNodes) { over = true; return; }
    if (i === n) {
      count++;
      if (sols.length < SAMPLE) sols.push(unk.map((g) => cur[g]));
      let all = n > 0;
      for (let j = 0; j < n; j++) {
        if (cur[unk[j]]) seen1[j] = 1; else seen0[j] = 1;
        if (!(seen0[j] && seen1[j])) all = false;
      }
      if (all) stop = true;
      return;
    }
    const g = unk[i];
    for (let v = 0; v <= 1; v++) {
      cur[g] = v;
      if (cons.partial(cur)) dfs(i + 1);
      if (over || stop) break;
    }
    cur[g] = -1;
  };
  dfs(0);
  if (puz.meter) puz.meter.used += 1 + nodes / 32;   // work accounting: the cost of an analysis is its enumeration size
  if (over) return { contradiction: false, forced: [], unk, inconclusive: true };
  if (count === 0) return { contradiction: true, forced: [], unk };
  const forced = [];
  if (!stop) for (let j = 0; j < n; j++) {
    if (!seen0[j]) forced.push({ g: unk[j], v: 1 });
    else if (!seen1[j]) forced.push({ g: unk[j], v: 0 });
  }
  return { contradiction: false, forced, unk, count, sols: !stop && count <= SAMPLE ? sols : null };
}

const uniq = (a) => [...new Set(a)];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function addLine(puz, axis, idx, type, value) {
  const cells = [];
  if (axis === 'col') for (let r = 0; r < puz.H; r++) cells.push([r, idx]);
  else for (let c = 0; c < puz.W; c++) cells.push([idx, c]);
  const gs = cells.map(([r, c]) => puz.gid[r][c]);
  const ws = cells.map(([r, c]) => cellW(puz.C[r][c]));
  const where = `${axis === 'col' ? 'column' : 'row'} ${idx + 1}`;
  const origin = axis === 'col' ? `The clue above column ${idx + 1}` : `The clue left of row ${idx + 1}`;
  const mult = ws.includes(2) ? ' (a bomb on a multiplier cell counts double)' : '';
  if (type === LINE.TOTAL) {
    register(puz, linear(gs, ws, value, () => `${origin} (Count) says the bombs in ${where} add up to ${value}${mult}`));
  } else if (type === LINE.MAXRUN) {
    register(puz, {
      kind: 'maxrun', groups: uniq(gs), value,
      describe: () => `${origin} (Longest run) says the longest unbroken run of bombs in ${where} adds up to ${value}${mult}`,
      partial(cur) {
        let lo = 0, hi = 0, cl = 0, ch = 0;
        for (let i = 0; i < gs.length; i++) {
          const x = cur[gs[i]];
          if (x === 1) { cl += ws[i]; if (cl > lo) lo = cl; } else cl = 0;
          if (x !== 0) { ch += ws[i]; if (ch > hi) hi = ch; } else ch = 0;
        }
        return lo <= value && value <= hi;
      },
    });
  } else if (type === LINE.SEGMENTS) {
    register(puz, {
      kind: 'segments', groups: uniq(gs), value,
      describe: () => `${origin} (Groups) says the bombs in ${where} form exactly ${plural(value, 'separate group')}`,
      partial(cur) {
        if (value > 30) return true;
        let m0 = 1, m1 = 0;
        for (let i = 0; i < gs.length; i++) {
          const x = cur[gs[i]];
          let n0 = 0, n1 = 0;
          if (x !== 1) n0 = m0 | m1;
          if (x !== 0) n1 = (m0 << 1) | m1;
          m0 = n0; m1 = n1;
        }
        return (((m0 | m1) >>> value) & 1) === 1;
      },
    });
  }
}

function linear(gs, ws, value, describe) {
  const coef = new Map();
  gs.forEach((g, i) => coef.set(g, (coef.get(g) || 0) + ws[i]));
  const groups = [...coef.keys()], cf = groups.map((g) => coef.get(g));
  return {
    kind: 'linear', groups, coef, value, describe,
    partial(cur) {
      let lo = 0, unk = 0;
      for (let i = 0; i < groups.length; i++) { const x = cur[groups[i]]; if (x === 1) lo += cf[i]; else if (x < 0) unk += cf[i]; }
      return lo <= value && lo + unk >= value;
    },
  };
}

function addCell(puz, r, c, type, value) {
  const { H, W } = puz;
  const here = cellLabel(r, c);
  const block = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const a = r + dr, b = c + dc;
    if (a >= 0 && a < H && b >= 0 && b < W) block.push([a, b]);
  }
  const mult = block.some(([a, b]) => puz.C[a][b] === CELL.MULT) ? ' (a bomb on a multiplier cell counts double)' : '';

  if (type === CELL.TOTAL) {
    register(puz, linear(block.map(([a, b]) => puz.gid[a][b]), block.map(([a, b]) => cellW(puz.C[a][b])), value,
      () => `The clue at ${here} (Neighbor) says the 3x3 block around it (itself included) holds bombs adding up to ${value}${mult}`));
    return;
  }
  if (type === CELL.ISOLATED || type === CELL.SURROUNDED) {
    const iso = type === CELL.ISOLATED;
    const scope = new Set();
    const items = block.map(([a, b]) => {
      const g = puz.gid[a][b]; scope.add(g);
      const card = DIRS4.map(([dr, dc]) => {
        const pa = a + dr, pb = b + dc;
        if (pa < 0 || pa >= H || pb < 0 || pb >= W) return -1;
        const pg = puz.gid[pa][pb]; scope.add(pg); return pg;
      });
      return { g, w: cellW(puz.C[a][b]), card };
    });
    register(puz, {
      kind: iso ? 'isolated' : 'surrounded', groups: [...scope], value,
      describe: () => iso
        ? `The clue at ${here} (Isolated) says exactly ${plural(value, 'bomb')} in its 3x3 block (itself included) have no bomb directly above, below, left or right of them${mult}`
        : `The clue at ${here} (Surrounded) says exactly ${plural(value, 'bomb')} in its 3x3 block (itself included) have a bomb on all four sides (the grid edge counts as a bomb)${mult}`,
      partial(cur) {
        let lo = 0, hi = 0;
        for (const it of items) {
          const s = cur[it.g];
          if (s === 0) continue;
          let possible = true, definite = s === 1;
          for (const pg of it.card) {
            const val = pg < 0 ? (iso ? 0 : 1) : cur[pg];
            if (iso ? val === 1 : val === 0) { possible = false; break; }
            if (val < 0) definite = false;
          }
          if (possible) { hi += it.w; if (definite) lo += it.w; }
        }
        return lo <= value && value <= hi;
      },
    });
    return;
  }
  if (type === CELL.AREA) { register(puz, areaCons(puz, r, c, value)); }
}

/** Area clue: depends on the whole grid, so it is reasoned about with bounds + single-cell probing. */
function areaCons(puz, r, c, value) {
  const { H, W } = puz;
  const host = puz.gid[r][c], here = cellLabel(r, c);
  const wts = []; for (let a = 0; a < H; a++) for (let b = 0; b < W; b++) wts.push(cellW(puz.C[a][b]));
  const lab = (g) => groupLabel(puz, g);
  const flood = (get, s, allowUnknown) => {
    const seen = new Uint8Array(W * H), q = [r * W + c];
    seen[q[0]] = 1; let sum = 0;
    for (let i = 0; i < q.length; i++) {
      const k = q[i], a = (k / W) | 0, b = k % W;
      sum += wts[k];
      for (const [dr, dc] of DIRS4) {
        const na = a + dr, nb = b + dc;
        if (na < 0 || na >= H || nb < 0 || nb >= W) continue;
        const nk = na * W + nb;
        if (seen[nk]) continue;
        const x = get(puz.gid[na][nb]);
        if (x === s || (allowUnknown && x < 0)) { seen[nk] = 1; q.push(nk); }
      }
    }
    return { sum, seen };
  };
  const detail = (get) => {
    const hv = get(host), per = [];
    for (const s of [0, 1]) {
      if (hv >= 0 && hv !== s) continue;
      const lo = flood(get, s, false).sum, hi = flood(get, s, true).sum;
      per.push({ s, lo, hi, ok: lo <= value && value <= hi });
    }
    return { ok: per.some((p) => p.ok), per };
  };
  const range = (d) => d.per.map((p) => `${p.lo === p.hi ? p.lo : `between ${p.lo} and ${p.hi}`}${d.per.length > 1 ? ` (if ${here} is ${p.s ? 'a bomb' : 'safe'})` : ''}`).join(' or ');
  const whyBase = (d) => `the same-state region around ${here} can only weigh ${range(d)}, but the clue says ${value}`;
  const whyProbe = (d, g, b) => `if ${lab(g)} were ${b ? 'a bomb' : 'safe'}, the same-state region around ${here} could only weigh ${range(d)}, but the clue says ${value}`;
  return {
    kind: 'area', global: true, selfRepeat: true, value,
    groups: puz.groups.map((g) => g.id),
    describe: () => `The clue at ${here} (Area) says the connected region (up/down/left/right) of cells sharing its own state, bomb or safe, has size ${value}${puz.C.some((row) => row.includes(CELL.MULT)) ? ' (multiplier cells count 2)' : ''}`,
    analyze(get) {
      const base = detail(get);
      if (!base.ok) return { contradiction: true, forced: [], unk: [], why: whyBase(base) };
      const info = base.per.filter((p) => p.ok).map((p) => ({ ...p, loSeen: flood(get, p.s, false).seen, hiSeen: flood(get, p.s, true).seen }));
      const cand = new Set();
      for (const p of info) for (let k = 0; k < p.hiSeen.length; k++) if (p.hiSeen[k]) { const g = puz.gid[(k / W) | 0][k % W]; if (get(g) < 0) cand.add(g); }
      const nearLo = (p, k) => {
        const a = (k / W) | 0, b = k % W;
        for (const [dr, dc] of DIRS4) { const na = a + dr, nb = b + dc; if (na >= 0 && na < H && nb >= 0 && nb < W && p.loSeen[na * W + nb]) return true; }
        return false;
      };
      const flat = (g) => puz.groups[g].cells.map(([a, b]) => a * W + b);
      const forced = [];
      for (const g of cand) {
        const ks = flat(g), bad = [null, null];
        for (const b of [0, 1]) {
          const get2 = (x) => (x === g ? b : get(x));
          let d;
          if (g === host) d = detail(get2);
          else {
            const per = [];
            for (const p of info) {
              let lo = p.lo, hi = p.hi;
              if (b === p.s) { if (ks.some((k) => nearLo(p, k))) lo = flood(get2, p.s, false).sum; }
              else if (ks.some((k) => p.hiSeen[k])) hi = flood(get2, p.s, true).sum;
              per.push({ s: p.s, lo, hi, ok: lo <= value && value <= hi });
            }
            d = { ok: per.some((q) => q.ok), per };
          }
          if (!d.ok) bad[b] = d;
        }
        if (bad[0] && bad[1]) return { contradiction: true, forced: [], unk: [], why: `whether ${lab(g)} is a bomb or safe, the region around ${here} cannot reach the size ${value}` };
        if (bad[0]) forced.push({ g, v: 1, why: whyProbe(bad[0], g, 0) });
        else if (bad[1]) forced.push({ g, v: 0, why: whyProbe(bad[1], g, 1) });
      }
      return { contradiction: false, forced, unk: [] };
    },
  };
}
