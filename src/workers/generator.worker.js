/**
 * Generates one random level off the main thread (generation can take seconds to minutes on the harder presets).
 * In : { options, seed }   options = shared/options.js buildOptions(...) result
 * Out: { type: 'done', seed, data }  data = level object in the same shape as the predefined JSON files
 * If the seed does not yield a level the next seed is tried, so the returned seed always reproduces the level
 * (node tools/generate-level.js --level <difficulty> --seed <seed>).
 */
import { generateLevel, levelToData } from '../../shared/generator.js';

self.onmessage = (event) => {
  const { options, seed } = event.data;
  for (let s = seed; ; s++) {
    const level = generateLevel(options, s);
    if (level) {
      self.postMessage({ type: 'done', seed: s, data: levelToData(level, level.meta) });
      return;
    }
  }
};
