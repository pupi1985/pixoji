import { INDEX_PATH, entryKey, levelPath, validateLevelIndex } from '../../shared/level-index.js';

/**
 * The list of predefined levels and the levels saved on this device.
 *
 *  - The list (levels/index.json) is fetched when the app starts. Online: the fresh list is used and saved. Offline: the last
 *    saved list is used, so levels that were downloaded earlier can still be played.
 *  - A level file is downloaded when it is first played (or with "download all") and kept in the Cache Storage cache
 *    "levels". Level files never change (their name contains a hash of their content), so a saved copy is always right;
 *    a level that was edited has a new file name and is simply downloaded again.
 *  - After a fresh list arrives, saved files that are no longer in it are deleted, so updates do not pile up storage.
 *  - A level is an index entry { id, v, tutorial? } (see shared/level-index.js).
 *
 * status: 'loading' | 'online' (fresh list) | 'saved' (offline, using the saved list) | 'none' (no list at all yet)
 */
const CACHE_NAME = 'levels';
const FALLBACK_KEY = 'levelIndex';    // localStorage copy of the list, only used where Cache Storage does not exist

const resolve = (relative) => new URL(relative, globalThis.document?.baseURI ?? globalThis.location?.href ?? 'http://localhost/').href;
const canStore = () => typeof caches !== 'undefined';
const jsonResponse = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

async function fetchJson(url, { cache = 'default', timeoutMs = 0, signal } = {}) {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const response = await fetch(url, { cache, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return { response, data: await response.clone().json() };
  } finally { clearTimeout(timer); }
}

export class LevelCatalog {
  constructor() {
    this.index = null;
    this.status = 'loading';
    this.downloaded = new Set();   // file keys (id-v) of the levels saved on this device
  }

  get canSaveLevels() { return canStore(); }
  entries(difficulty) { return this.index?.difficulties[difficulty] ?? []; }
  count(difficulty) { return this.entries(difficulty).length; }
  isDownloaded(entry) { return this.downloaded.has(entryKey(entry)); }
  urlOf(difficulty, entry) { return resolve(levelPath(difficulty, entry)); }

  /** Loads the list (fresh if possible). Never throws. */
  async load({ timeoutMs = 5000 } = {}) {
    let fresh = null;
    try { fresh = validateLevelIndex((await fetchJson(resolve(INDEX_PATH), { cache: 'no-cache', timeoutMs })).data); } catch { fresh = null; }
    if (fresh) {
      this.index = fresh;
      this.status = 'online';
      await this.saveIndex(fresh);
    } else {
      const saved = await this.readSavedIndex();
      this.index = saved;
      this.status = saved ? 'saved' : 'none';
    }
    if (this.index) {
      await this.scanDownloaded();
      if (this.status === 'online') await this.prune();
    }
    return this.status;
  }

  async saveIndex(index) {
    try {
      if (canStore()) await (await caches.open(CACHE_NAME)).put(resolve(INDEX_PATH), jsonResponse(index));
      else localStorage.setItem(FALLBACK_KEY, JSON.stringify(index));
    } catch { /* not saving is fine: the app just needs a connection next time */ }
  }

  async readSavedIndex() {
    try {
      if (canStore()) {
        const hit = await (await caches.open(CACHE_NAME)).match(resolve(INDEX_PATH));
        return hit ? validateLevelIndex(await hit.json()) : null;
      }
      const raw = localStorage.getItem(FALLBACK_KEY);
      return raw ? validateLevelIndex(JSON.parse(raw)) : null;
    } catch { return null; }
  }

  async scanDownloaded() {
    this.downloaded = new Set();
    if (!canStore() || !this.index) return;
    const cache = await caches.open(CACHE_NAME);
    for (const [difficulty, entries] of Object.entries(this.index.difficulties)) {
      for (const entry of entries) if (await cache.match(this.urlOf(difficulty, entry))) this.downloaded.add(entryKey(entry));
    }
  }

  /** Deletes saved level files that the current list no longer contains. */
  async prune() {
    if (!canStore() || !this.index) return;
    const cache = await caches.open(CACHE_NAME);
    const wanted = new Set([resolve(INDEX_PATH)]);
    for (const [difficulty, entries] of Object.entries(this.index.difficulties)) entries.forEach((entry) => wanted.add(this.urlOf(difficulty, entry)));
    for (const request of await cache.keys()) if (!wanted.has(request.url ?? request)) await cache.delete(request);
  }

  /** The level data: from this device if saved, otherwise downloaded (and saved). Throws if it cannot be had. */
  async get(difficulty, entry, { signal } = {}) {
    const url = this.urlOf(difficulty, entry);
    if (canStore()) {
      const hit = await (await caches.open(CACHE_NAME)).match(url);
      if (hit) { this.downloaded.add(entryKey(entry)); return hit.json(); }
    }
    const { response, data } = await fetchJson(url, { signal });
    if (canStore()) {
      try { await (await caches.open(CACHE_NAME)).put(url, response); this.downloaded.add(entryKey(entry)); this.askToKeepStorage(); } catch { /* playable now, just not saved */ }
    }
    return data;
  }

  /** Saves every level in `items` ([{ difficulty, entry }]) that is not saved yet. Returns how many were downloaded. */
  async downloadMany(items, { onProgress, signal } = {}) {
    const todo = items.filter((it) => !this.isDownloaded(it.entry));
    let done = 0;
    onProgress?.(done, todo.length);
    for (const it of todo) {
      if (signal?.aborted) break;
      await this.get(it.difficulty, it.entry, { signal });
      onProgress?.(++done, todo.length);
    }
    return done;
  }

  /** Every level of the list, as [{ difficulty, entry }], optionally for one difficulty. */
  items(difficulty = null) {
    return Object.entries(this.index?.difficulties ?? {})
      .filter(([d]) => difficulty === null || String(difficulty) === d)
      .flatMap(([d, entries]) => entries.map((entry) => ({ difficulty: Number(d), entry })));
  }

  /** Ask the browser not to evict saved levels when storage runs low (best effort, no prompt on most browsers). */
  askToKeepStorage() {
    try { navigator.storage?.persist?.(); } catch { /* ignore */ }
  }
}
