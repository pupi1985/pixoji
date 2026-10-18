import { PRESETS } from './presets.js';
import { APP_CONFIG } from '../config.js';
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
 * Generates a random level for a difficulty using a pool of web workers, each trying its own seeds; the first level
 * found wins. Returns { promise, cancel }. The promise resolves to { data, seed } and rejects with CANCELLED if
 * cancelled. onProgress(seedsTried) is called as seeds are discarded.
 */
export function generateRandomLevel(difficulty, { onProgress } = {}) {
  const { workers: maxWorkers, attemptMs, timeLimit } = APP_CONFIG.generation;
  const options = buildOptions(PRESETS.levels[difficulty], difficulty, { attempts: 1, attemptMs, timeLimit });
  const count = Math.max(1, Math.min(maxWorkers, (navigator.hardwareConcurrency || 2) - 1));
  const base = Math.floor(Math.random() * 1e9);
  const pool = [];
  const tried = new Array(count).fill(0);
  let settled = false, finish;

  const stop = () => { settled = true; pool.forEach((w) => w.terminate()); };
  const promise = new Promise((resolve, reject) => {
    finish = { resolve, reject };
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('../workers/generator.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (settled) return;
        const m = e.data;
        if (m.type === 'done') { stop(); resolve({ data: m.data, seed: m.seed }); }
        else if (m.type === 'error') { stop(); reject(new Error(m.message)); }
        else { tried[i] = m.tried; onProgress?.(tried.reduce((a, b) => a + b, 0)); }
      };
      const fail = (e) => { if (!settled) { stop(); reject(new Error(e?.message || 'The level generator could not start or crashed')); } };
      worker.onerror = fail;
      worker.onmessageerror = fail;
      pool.push(worker);
      worker.postMessage({ options, seed: base + i, stride: count });
    }
  });
  return { promise, cancel() { if (!settled) { stop(); finish.reject(CANCELLED); } } };
}
