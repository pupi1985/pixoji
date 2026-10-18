import { PRESETS } from './presets.js';
import { buildOptions } from '../../shared/options.js';

export const CANCELLED = Symbol('cancelled');

/** Fetches public/levels/<difficulty>/level<number>.json */
export async function loadPredefinedLevel(difficulty, number) {
  const url = `${import.meta.env.BASE_URL}levels/${difficulty}/level${number}.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Level file not found (${url})`);
  try {
    return await response.json();
  } catch {
    // a dev server answers missing files with index.html, which is not JSON
    throw new Error(`Level file not found or not valid JSON (${url})`);
  }
}

/**
 * Generates a random level for a difficulty in a web worker.
 * Returns { promise, cancel }. The promise resolves to { data, seed } and rejects with CANCELLED if cancelled.
 */
export function generateRandomLevel(difficulty) {
  const options = buildOptions(PRESETS.levels[difficulty], difficulty);
  const seed = Math.floor(Math.random() * 1e9);
  const worker = new Worker(new URL('../workers/generator.worker.js', import.meta.url), { type: 'module' });
  let finish;
  const promise = new Promise((resolve, reject) => {
    finish = { resolve, reject };
    worker.onmessage = (e) => {
      if (e.data.type === 'done') { worker.terminate(); resolve({ data: e.data.data, seed: e.data.seed }); }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'The level generator crashed')); };
    worker.postMessage({ options, seed });
  });
  return { promise, cancel() { worker.terminate(); finish.reject(CANCELLED); } };
}
