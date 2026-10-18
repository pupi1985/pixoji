/**
 * cli-utils.js - tiny option parser + usage-text formatter shared by solver.js and generate-level.js.
 *
 * An option spec is { name, type: 'flag'|'int'|'number'|'string', arg: 'N', def: 'shown default',
 *                     min, max, desc: 'one or two sentences', group: 'heading' }.
 */

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
};

/** Returns { opts, positional, errors }. Never throws: the caller decides how to report errors. */
export function parseCli(argv, specs) {
  const byName = new Map(specs.map((s) => [s.name, s]));
  const opts = {}, positional = [], errors = [];
  for (let i = 0; i < argv.length; i++) {
    let t = argv[i];
    if (t === '-h') t = '--help';
    if (!t.startsWith('--')) { positional.push(t); continue; }
    let name = t.slice(2), val;
    const eq = name.indexOf('=');
    if (eq >= 0) { val = name.slice(eq + 1); name = name.slice(0, eq); }
    const s = byName.get(name);
    if (!s) {
      const best = [...byName.keys()].map((k) => [k, lev(name, k)]).sort((x, y) => x[1] - y[1])[0];
      errors.push(`Unknown option --${name}${best && best[1] <= 3 ? ` (did you mean --${best[0]}?)` : ''}`);
      continue;
    }
    if (s.type === 'flag') { opts[name] = true; continue; }
    if (val === undefined) {
      const nx = argv[i + 1];
      if (nx === undefined || nx.startsWith('--')) { errors.push(`--${name} needs a value (${s.arg || 'VALUE'})`); continue; }
      val = nx; i++;
    }
    if (s.type === 'int' || s.type === 'number') {
      const n = Number(val);
      if (val === '' || !Number.isFinite(n) || (s.type === 'int' && !Number.isInteger(n))) { errors.push(`--${name} must be ${s.type === 'int' ? 'a whole number' : 'a number'}, got "${val}"`); continue; }
      if (s.min !== undefined && n < s.min) { errors.push(`--${name} must be at least ${s.min}, got ${n}`); continue; }
      if (s.max !== undefined && n > s.max) { errors.push(`--${name} must be at most ${s.max}, got ${n}`); continue; }
      opts[name] = n;
    } else opts[name] = val;
  }
  return { opts, positional, errors };
}

export function wrap(text, width, indent) {
  const pad = ' '.repeat(indent), lines = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if (line && (pad + line + ' ' + w).length > width) { lines.push(pad + line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(pad + line);
  return lines.join('\n');
}

/**
 * { command, summary, positional:[{name,desc}], specs, sections:[{title,text}], examples:[string] }
 */
export function formatUsage(u, width = 92) {
  const out = [];
  const pos = (u.positional || []).map((p) => `<${p.name}>`).join(' ');
  out.push(`Usage: ${u.command}${pos ? ` ${pos}` : ''} [options]`, '');
  if (u.summary) out.push(wrap(u.summary, width, 0), '');
  if (u.positional?.length) {
    out.push('Arguments:');
    for (const p of u.positional) out.push(`  <${p.name}>`, wrap(p.desc, width, 6));
    out.push('');
  }
  let group = null;
  for (const s of u.specs) {
    if (s.group !== undefined && s.group !== group) { if (group !== null) out.push(''); group = s.group; out.push(`${group}:`); }
    const head = `  --${s.name}${s.type === 'flag' ? '' : ` ${s.arg || 'VALUE'}`}`;
    const def = s.def !== undefined ? ` [default: ${s.def}]` : '';
    out.push(head + def, wrap(s.desc, width, 6));
  }
  out.push('');
  for (const sec of u.sections || []) out.push(`${sec.title}:`, sec.text, '');
  if (u.examples?.length) { out.push('Examples:'); for (const e of u.examples) out.push(`  ${e}`); out.push(''); }
  return out.join('\n');
}

/** Print error(s) + usage to stderr and exit 1. */
export function fail(errors, usageText) {
  console.error(errors.map((e) => `Error: ${e}`).join('\n'));
  console.error(`\n${usageText}`);
  process.exit(1);
}
