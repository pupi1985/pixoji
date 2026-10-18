/**
 * solver-core.js - human-style logical solver with written explanations (pure logic: no Node or browser APIs,
 * so it runs in the CLI tools, in the game and inside a web worker).
 *
 * The solver always uses the simplest possible kind of reasoning first and only escalates to a deeper
 * assumption level when nothing simpler is available.  The command line wrapper is tools/solver.js.
 */
import { groupLabel, isNumericCell, makePuzzle } from './logic-core.js';

const TIMEOUT = Symbol('timeout');
let _frameSeq = 0, _factSeq = 0;

class Frame { constructor(parent) { this.parent = parent; this.id = ++_frameSeq; } }

/** Greedy removal of premises that are not needed for the conclusion (keeps explanations short). */
function minimize(cons, scopeKnown, pred) {
  let prem = scopeKnown.slice();
  for (let i = prem.length - 1; i >= 0; i--) {
    const trial = prem.slice(0, i).concat(prem.slice(i + 1));
    const m = new Map(trial.map((p) => [p.g, p.v]));
    if (pred(cons.analyze((g) => (m.has(g) ? m.get(g) : -1)))) prem = trial;
  }
  return prem;
}

/** Facts the proof needs from OUTSIDE `frame`, found by walking dependencies inside it. */
function externalOf(roots, frame) {
  const seen = new Set(), ext = new Set(), stack = [...roots];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    if (f.frame === frame) for (const d of f.deps()) stack.push(d); else ext.add(f);
  }
  return [...ext];
}

/** Facts of `frame` actually used by a proof (excluding the assumption itself), in creation order. */
function needed(roots, frame) {
  const seen = new Set(), out = [], stack = [...roots];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || f.frame !== frame) continue;
    seen.add(f);
    if (f.kind !== 'assume') out.push(f);
    for (const d of f.deps()) stack.push(d);
  }
  return out.sort((a, b) => a.id - b.id);
}

class Fact {
  constructor(o) { Object.assign(this, o); this.id = ++_factSeq; this._deps = null; this._prem = null; this.size = null; }
  premises() {
    if (!this._prem) {
      this._prem = this.kind === 'deduce'
        ? minimize(this.constraint, this.scopeKnown, (res) => res.forced.some((f) => f.g === this.g && f.v === this.v))
        : [];
    }
    return this._prem;
  }
  deps() {
    if (this._deps) return this._deps;
    if (this.kind === 'deduce') this._deps = this.premises().map((p) => p.fact);
    else if (this.kind === 'contra') this._deps = externalOf(this.contradiction.premises().map((p) => p.fact), this.subFrame);
    else if (this.kind === 'cases') {
      const s = new Set();
      for (const b of this.branches) for (const x of externalOf([b.derived], b.frame)) s.add(x);
      this._deps = [...s];
    } else this._deps = [];
    return this._deps;
  }
}

class Contradiction {
  constructor(cons, scopeKnown, frame) { this.cons = cons; this.scopeKnown = scopeKnown; this.frame = frame; this._prem = null; }
  premises() {
    if (!this._prem) this._prem = minimize(this.cons, this.scopeKnown, (res) => res.contradiction);
    return this._prem;
  }
}

class State {
  constructor(nG, vals, facts) { this.nG = nG; this.vals = vals || new Int8Array(nG).fill(-1); this.facts = facts || new Array(nG).fill(null); }
  clone() { return new State(this.nG, this.vals.slice(), this.facts.slice()); }
  set(g, f) { this.vals[g] = f.v; this.facts[g] = f; }
  unknown() { const o = []; for (let g = 0; g < this.nG; g++) if (this.vals[g] < 0) o.push(g); return o; }
}

const dirtyOf = (puz, g) => puz.byGroup[g].concat(puz.globals);
const snapshot = (cons, st) => { const o = []; for (const g of cons.groups) if (st.vals[g] >= 0) o.push({ g, v: st.vals[g], fact: st.facts[g] }); return o; };
const checkTime = (ctx) => { if (ctx.deadline && Date.now() > ctx.deadline) throw TIMEOUT; };

/** Direct deductions: repeatedly apply single clues until nothing new is forced. */
function propagate(ctx, st, frame, dirty, log) {
  const { puz } = ctx;
  const inQ = new Uint8Array(puz.constraints.length), queue = [];
  const push = (id) => { if (!inQ[id]) { inQ[id] = 1; queue.push(id); } };
  dirty.forEach(push);
  for (let i = 0; i < queue.length; i++) {
    const cons = puz.constraints[queue[i]];
    inQ[cons.id] = 0;
    if ((i & 15) === 0) checkTime(ctx);
    const res = cons.analyze((g) => st.vals[g]);
    if (res.contradiction) return new Contradiction(cons, snapshot(cons, st), frame);
    if (!res.forced.length) continue;
    const snap = snapshot(cons, st);
    let applied = false;
    for (const { g, v } of res.forced) {
      if (st.vals[g] >= 0) continue;
      const f = new Fact({ kind: 'deduce', g, v, constraint: cons, scopeKnown: snap, frame, depth: 0 });
      st.set(g, f); applied = true;
      if (log) log.push(f);
      for (const id of puz.byGroup[g]) if (id !== cons.id) push(id);
      for (const id of puz.globals) if (id !== cons.id) push(id);
    }
    if (applied && cons.selfRepeat) push(cons.id);
  }
  return null;
}

/** Propagate, then (if depth>0) try nested assumptions inside this hypothetical world. */
function closure(ctx, st, frame, depth, dirty) {
  checkTime(ctx);
  let con = propagate(ctx, st, frame, dirty, null);
  if (con) return con;
  while (depth > 0) {
    let progressed = false;
    // nested assumptions are only tried on cells that share a clue with something already
    // assumed/deduced inside this hypothetical world (keeps deep reasoning local and fast)
    const cand = new Set();
    for (let h = 0; h < st.nG; h++) {
      const hf = st.facts[h];
      if (!hf || hf.frame !== frame) continue;
      for (const id of ctx.puz.byGroup[h]) for (const g of ctx.puz.constraints[id].groups) if (st.vals[g] < 0) cand.add(g);
    }
    outer: for (const g of [...cand].sort((a, b) => a - b)) {
      for (const v of [1, 0]) {
        const sub = new Frame(frame), child = st.clone();
        const A = new Fact({ kind: 'assume', g, v, frame: sub });
        child.set(g, A);
        const c2 = closure(ctx, child, sub, depth - 1, dirtyOf(ctx.puz, g));
        if (c2) {
          const f = new Fact({ kind: 'contra', g, v: 1 - v, frame, assume: A, contradiction: c2, subFrame: sub });
          st.set(g, f);
          con = propagate(ctx, st, frame, dirtyOf(ctx.puz, g), null);
          if (con) return con;
          progressed = true;
          break outer;
        }
      }
    }
    if (!progressed) break;
  }
  return null;
}

function proofSize(f) {
  if (f.size != null) return f.size;
  let n = 1;
  const add = (roots, frame) => { for (const x of needed(roots, frame)) n += x.kind === 'contra' ? proofSize(x) : 1; };
  if (f.kind === 'contra') add(f.contradiction.premises().map((p) => p.fact), f.subFrame);
  else if (f.kind === 'cases') for (const b of f.branches) add([b.derived], b.frame);
  return (f.size = n);
}

/** One hypothesis level D: assume each unknown cell both ways, look for contradictions / common conclusions. */
function hypothesisStep(ctx, st, root, D) {
  const unknown = st.unknown();
  let best = null;
  const branch = new Map();
  for (const g of unknown) {
    const res = [null, null];
    for (const v of [1, 0]) {
      checkTime(ctx);
      const frame = new Frame(root), child = st.clone();
      const A = new Fact({ kind: 'assume', g, v, frame });
      child.set(g, A);
      const con = closure(ctx, child, frame, D - 1, dirtyOf(ctx.puz, g));
      if (con) {
        const f = new Fact({ kind: 'contra', g, v: 1 - v, frame: root, assume: A, contradiction: con, subFrame: frame, depth: D });
        proofSize(f);
        if (!best || f.size < best.size) best = f;
      } else res[v] = { child, A, frame };
    }
    branch.set(g, res);
  }
  if (best || !ctx.cases) return best;
  for (const [g, res] of branch) {
    if (!res[0] || !res[1]) continue;
    for (const z of unknown) {
      if (z === g) continue;
      const a = res[0].child.vals[z], b = res[1].child.vals[z];
      if (a >= 0 && a === b) {
        const f = new Fact({
          kind: 'cases', g: z, v: a, split: g, frame: root, depth: D,
          branches: [0, 1].map((i) => ({ assume: res[i].A, frame: res[i].frame, derived: res[i].child.facts[z] })),
        });
        proofSize(f);
        if (!best || f.size < best.size) best = f;
      }
    }
  }
  return best;
}

export function makeCtx(puz, opts = {}) {
  return { puz, maxDepth: opts.maxDepth ?? 1, cases: opts.cases !== false, deadline: opts.timeLimit ? Date.now() + opts.timeLimit * 1000 : 0 };
}

/** Lazy step generator. Yields facts (kind deduce | contra | cases); returns a summary object. */
export function* solveIter(puz, opts = {}) {
  const ctx = makeCtx(puz, opts);
  const root = new Frame(null), st = new State(puz.nG);
  let dirty = puz.constraints.map((c) => c.id);
  try {
    for (;;) {
      const log = [];
      const con = propagate(ctx, st, root, dirty, log);
      if (con) return { solved: false, error: 'contradiction', st, ctx };
      for (const f of log) yield f;
      if (!st.unknown().length) return { solved: true, st, ctx };
      let found = null;
      for (let D = 1; D <= ctx.maxDepth && !found; D++) found = hypothesisStep(ctx, st, root, D);
      if (!found) return { solved: false, stuck: true, st, ctx };
      st.set(found.g, found);
      dirty = dirtyOf(puz, found.g);
      yield found;
    }
  } catch (e) {
    if (e === TIMEOUT) return { solved: false, timeout: true, st, ctx };
    throw e;
  }
}

/** Solves silently and reports the hypothesis depth the puzzle needs ("rating"). */
export function rateSolve(puz, opts = {}) {
  const it = solveIter(puz, opts);
  let r = it.next(), rating = 0, steps = 0, byDepth = {};
  while (!r.done) { steps++; rating = Math.max(rating, r.value.depth || 0); byDepth[r.value.depth || 0] = (byDepth[r.value.depth || 0] || 0) + 1; r = it.next(); }
  return { ...r.value, rating, steps, byDepth };
}

// ------------------------------------------------------------------ exhaustive uniqueness check
function quickFix(puz, vals, dirty) {
  const inQ = new Uint8Array(puz.constraints.length), q = [];
  const push = (id) => { if (!inQ[id]) { inQ[id] = 1; q.push(id); } };
  dirty.forEach(push);
  for (let i = 0; i < q.length; i++) {
    const cons = puz.constraints[q[i]];
    inQ[cons.id] = 0;
    const res = cons.analyze((g) => vals[g]);
    if (res.contradiction) return false;
    let applied = false;
    for (const { g, v } of res.forced) {
      if (vals[g] >= 0) continue;
      vals[g] = v; applied = true;
      for (const id of puz.byGroup[g]) push(id);
      for (const id of puz.globals) push(id);
    }
    if (applied && cons.selfRepeat) push(cons.id);
  }
  return true;
}

/** Counts solutions (up to `limit`) with full backtracking - independent of hypothesis depth. */
export function countSolutions(puz, limit = 2, maxBranches = 20000) {
  let count = 0, first = null, branches = 0, aborted = false;
  const run = (vals, dirty) => {
    if (aborted) return;
    if (++branches > maxBranches) { aborted = true; return; }
    if (!quickFix(puz, vals, dirty)) return;
    let pick = -1, bestN = 1e9;
    for (const cons of puz.constraints) {
      if (cons.global) continue;
      let n = 0, f = -1;
      for (const g of cons.groups) if (vals[g] < 0) { n++; if (f < 0) f = g; }
      if (n > 0 && n < bestN) { bestN = n; pick = f; }
    }
    if (pick < 0) for (let g = 0; g < puz.nG; g++) if (vals[g] < 0) { pick = g; break; }
    if (pick < 0) { count++; if (!first) first = Array.from(vals); return; }
    for (const v of [0, 1]) {
      const v2 = vals.slice(); v2[pick] = v;
      run(v2, dirtyOf(puz, pick));
      if (count >= limit) return;
    }
  };
  run(new Int8Array(puz.nG).fill(-1), puz.constraints.map((c) => c.id));
  return { count, first, aborted };
}

// ------------------------------------------------------------------ explanations
const gl = (puz, g) => groupLabel(puz, g);
const isW = (v) => (v ? 'a BOMB' : 'SAFE');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const listLabels = (puz, gs, max = 10) => (gs.length <= max ? gs.map((g) => gl(puz, g)).join(', ') : `${gs.slice(0, max).map((g) => gl(puz, g)).join(', ')} and ${gs.length - max} more`);

function explainResult(puz, cons, res, prem, target) {
  const m = new Map(prem.map((p) => [p.g, p.v]));
  const known = prem.length ? `Already established: ${prem.map((p) => `${gl(puz, p.g)} is ${p.v ? 'a bomb' : 'safe'}`).join(', ')}.` : 'Nothing else needs to be known for this.';
  const head = `${cons.describe()}. ${known}`;
  if (cons.kind === 'area') {
    const why = target ? (res.forced.find((f) => f.g === target.g && f.v === target.v) || {}).why : res.why;
    return `${head} ${why ? `${cap(why)}.` : ''}`.trim();
  }
  if (cons.kind === 'linear') {
    let K = 0, open = 0; const openG = [];
    for (const g of cons.groups) {
      const k = cons.coef.get(g);
      if (m.get(g) === 1) K += k; else if (!m.has(g)) { open += k; openG.push(g); }
    }
    const need = cons.value - K;
    if (!target) {
      if (need < 0) return `${head} The bombs already add up to ${K}, more than the ${cons.value} the clue allows.`;
      if (need > open) return `${head} ${need} more is still needed, but the open cells (${listLabels(puz, openG)}) can only add ${open}.`;
    } else if (need === 0 && target.v === 0) {
      return `${head} The bombs already add up to ${K}, which is everything the clue allows, so every other cell in range (${listLabels(puz, openG)}) is safe.`;
    } else if (need === open && target.v === 1) {
      return `${head} ${need} more is needed and the open cells (${listLabels(puz, openG)}) add up to exactly ${open}, so all of them are bombs.`;
    }
  }
  const unk = res.unk || [];
  const bombsText = (sol) => { const b = unk.filter((_, i) => sol[i] === 1); return b.length ? `bombs on ${listLabels(puz, b, 8)}` : 'no bombs among them'; };
  let s = `${head} Open cells in range: ${listLabels(puz, unk)}.`;
  const verdict = target ? ` In all of them ${gl(puz, target.g)} is ${isW(target.v)}.` : '';
  if (res.sols && res.sols.length <= 8 && target) {
    s += res.sols.length === 1
      ? ` Only one arrangement fits the clue: ${bombsText(res.sols[0])}.`
      : ` The arrangements that fit the clue are ${res.sols.map((sol, i) => `(${i + 1}) ${bombsText(sol)}`).join('; ')}.`;
    s += verdict;
  } else if (target) s += ` Of the ${res.count} arrangements that fit the clue, ${gl(puz, target.g)} is ${isW(target.v)} in every one.`;
  else s += ' No arrangement of those cells can satisfy the clue.';
  return s;
}

function explainDeduce(puz, f) {
  const prem = f.premises(), m = new Map(prem.map((p) => [p.g, p.v]));
  const res = f.constraint.analyze((g) => (m.has(g) ? m.get(g) : -1));
  return explainResult(puz, f.constraint, res, prem, { g: f.g, v: f.v });
}
function explainContradiction(puz, con) {
  const prem = con.premises(), m = new Map(prem.map((p) => [p.g, p.v]));
  const res = con.cons.analyze((g) => (m.has(g) ? m.get(g) : -1));
  return explainResult(puz, con.cons, res, prem, null);
}

const ref = (puz, g) => ({ label: gl(puz, g), cells: puz.groups[g].cells });

/** Builds a plain-object explanation tree (also what --json prints). */
export function nodeOf(puz, f) {
  if (f.kind === 'deduce') return { type: 'deduce', target: ref(puz, f.g), value: f.v, because: explainDeduce(puz, f) };
  if (f.kind === 'contra') {
    return {
      type: 'hypothesis', target: ref(puz, f.g), assumed: 1 - f.v, value: f.v,
      steps: needed(f.contradiction.premises().map((p) => p.fact), f.subFrame).map((x) => nodeOf(puz, x)),
      contradiction: explainContradiction(puz, f.contradiction),
    };
  }
  return {
    type: 'cases', split: ref(puz, f.split), target: ref(puz, f.g), value: f.v,
    branches: f.branches.map((b) => ({ assumed: b.assume.v, steps: needed([b.derived], b.frame).map((x) => nodeOf(puz, x)) })),
  };
}

function emit(out, ind, text, width = 104) {
  const words = text.split(/\s+/); let line = ind;
  const hang = `${ind}  `;
  for (const w of words) {
    if (line.trim().length && line.length + w.length + 1 > width) { out.push(line); line = hang + w; }
    else line += (line.trim().length ? ' ' : '') + w;
  }
  out.push(line);
}

function renderNode(n, ind, out) {
  if (n.type === 'deduce') emit(out, ind, `- ${n.target.label} is ${isW(n.value)}: ${n.because}`);
  else if (n.type === 'hypothesis') {
    emit(out, ind, `- Suppose ${n.target.label} is ${isW(n.assumed)}.`);
    n.steps.forEach((s) => renderNode(s, `${ind}    `, out));
    emit(out, `${ind}    `, `!! Contradiction: ${n.contradiction}`);
    emit(out, ind, `=> So ${n.target.label} cannot be ${n.assumed ? 'a bomb' : 'safe'}; it is ${isW(n.value)}.`);
  } else {
    emit(out, ind, `- Case analysis on ${n.split.label}.`);
    n.branches.forEach((b) => {
      emit(out, `${ind}  `, `If ${n.split.label} is ${isW(b.assumed)}:`);
      b.steps.forEach((s) => renderNode(s, `${ind}      `, out));
    });
    emit(out, ind, `=> Both cases force ${n.target.label} to be ${isW(n.value)}, so it is ${isW(n.value)}.`);
  }
}

export function renderStep(i, f, node) {
  const kind = f.kind === 'deduce' ? 'direct deduction' : f.kind === 'contra' ? `hypothesis, depth ${f.depth}` : `case analysis, depth ${f.depth}`;
  const out = [`Step ${i} (${kind}): ${node.target.label} is ${isW(node.value)}`];
  if (node.type === 'deduce') emit(out, '   ', node.because);
  else renderNode(node, '   ', out);
  return out.join('\n');
}

export function renderBoard(puz, vals) {
  const tok = (r, c) => {
    const t = puz.C[r][c];
    if (t === 4) return '='; if (t === 5) return 'M';
    return isNumericCell(t) ? ({ 1: 'T', 2: 'I', 3: 'S', 6: 'A' }[t] + puz.cellVals[r][c]) : '';
  };
  const lt = (t, v) => (t ? ({ 1: 'T', 2: 'R', 3: 'G' }[t] + v) : '');
  const lines = [];
  lines.push(' '.repeat(8) + Array.from({ length: puz.W }, (_, c) => `C${c + 1}`.padEnd(5)).join(''));
  lines.push(' '.repeat(8) + puz.top.map((t, c) => lt(t, puz.topVals[c]).padEnd(5)).join(''));
  for (let r = 0; r < puz.H; r++) {
    const cells = [];
    for (let c = 0; c < puz.W; c++) { const s = vals[puz.gid[r][c]]; cells.push(tok(r, c).padEnd(3) + (s < 0 ? '?' : s ? '#' : '.') + ' '); }
    lines.push(`R${r + 1}`.padEnd(4) + lt(puz.left[r], puz.leftVals[r]).padEnd(4) + cells.join(''));
  }
  return lines.join('\n');
}
export const LEGEND = 'Legend: cell clues T=total I=isolated S=surrounded A=area  "="=linked chain  M=multiplier | line clues T=total R=longest run G=number of groups | # bomb  . safe  ? unknown';
