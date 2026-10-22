/*
 * Service worker of the game. tools/pwa-plugin.js copies this file to dist/sw.js at build time, filling in the two
 * placeholders below: the build id (a hash of everything that was built) and the list of files that make up the app.
 *
 * What it does:
 *  - install:  downloads every app file into a cache named after the build, so the app starts and runs with no connection.
 *  - fetch:    answers app files (and the app page itself) from that cache. Anything else, notably the level index and the
 *              level files, is NOT touched here: the game downloads and stores those itself (src/game/catalog.js).
 *  - update:   a new build installs in the background and WAITS. The game shows "Update available" and asks it to take over
 *              (message SKIP_WAITING), so a running level is never swapped under the player's fingers.
 *  - activate: removes the app caches of older builds. The cache that holds downloaded levels is never touched.
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;
const APP_CACHE = `app-${BUILD_ID}`;

const absolute = (path) => new URL(path, self.location).href;
const PRECACHE_URLS = new Set(PRECACHE.map(absolute));
const INDEX_URL = absolute('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE.map((path) => new Request(absolute(path), { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('app-') && key !== APP_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isPage = request.mode === 'navigate';              // also covers links like ?difficulty=4&seed=123
  const key = isPage ? INDEX_URL : url.origin + url.pathname;
  if (!isPage && !PRECACHE_URLS.has(key)) return;           // not an app file: let the browser/network handle it

  event.respondWith(
    caches.open(APP_CACHE).then((cache) => cache.match(key)).then((hit) => hit || fetch(request)),
  );
});
