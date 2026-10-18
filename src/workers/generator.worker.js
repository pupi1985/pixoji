/**
 * Generates one random level off the main thread. Several of these run in parallel, each on its own seeds.
 * In : { options, seed, stride, exact }
 *        tries seed, seed + stride, seed + 2 * stride, ...  (exact: only `seed`, no other seed is tried)
 * Out: { type: 'progress', tried }          after every seed that did not give a level
 *      { type: 'done', seed, data }         data = level object in the same shape as the predefined JSON files
 *      { type: 'error', message }           no level for an exact seed, or the generator failed repeatedly
 *
 * Generation is deterministic (shared/options.js): a seed always gives the same level, here and in the CLI tool.
 */
import { generateLevel, levelToData } from '../../shared/generator.js';

self.onmessage = (event) => {
  const { options, seed, stride = 1, exact = false } = event.data;
  let tried = 0, failures = 0;
  for (let s = seed; ; s += stride) {
    let level = null;
    try {
      level = generateLevel(options, s);
    } catch (error) {
      if (exact || ++failures > 3) { self.postMessage({ type: 'error', message: String(error?.message ?? error) }); return; }
    }
    if (level) {
      self.postMessage({ type: 'done', seed: s, data: levelToData(level, level.meta) });
      return;
    }
    if (exact) { self.postMessage({ type: 'error', message: `Seed ${s} does not give a level at this difficulty. Try another seed.` }); return; }
    self.postMessage({ type: 'progress', tried: ++tried });
  }
};
