/**
 * Generates one random level off the main thread. Several of these run in parallel, each on its own seeds.
 * In : { options, seed, stride }   tries seed, seed + stride, seed + 2 * stride, ...
 * Out: { type: 'progress', tried }          after every seed that did not give a level
 *      { type: 'done', seed, data }         data = level object in the same shape as the predefined JSON files
 *      { type: 'error', message }           the generator itself failed repeatedly
 */
import { generateLevel, levelToData } from '../../shared/generator.js';

self.onmessage = (event) => {
  const { options, seed, stride = 1 } = event.data;
  let tried = 0, failures = 0;
  for (let s = seed; ; s += stride) {
    let level = null;
    try {
      level = generateLevel(options, s);
    } catch (error) {
      if (++failures > 3) { self.postMessage({ type: 'error', message: String(error?.message ?? error) }); return; }
    }
    if (level) {
      self.postMessage({ type: 'done', seed: s, data: levelToData(level, level.meta) });
      return;
    }
    self.postMessage({ type: 'progress', tried: ++tried });
  }
};
