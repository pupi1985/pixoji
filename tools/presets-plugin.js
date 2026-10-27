import path from 'node:path';
import { readPresetsFile } from './presets-file.js';

/** Vite plugin: stops `vite` / `vite build` with a readable error if shared/presets.json is malformed or has duplicate keys. */
export function presetsCheckPlugin({ file = 'shared/presets.json' } = {}) {
  let root = process.cwd();
  return {
    name: 'presets-check',
    configResolved(config) { root = config.root; },
    buildStart() {
      try { readPresetsFile(path.resolve(root, file)); } catch (e) { this.error(e.message); }
    },
  };
}
