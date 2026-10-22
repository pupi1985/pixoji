/**
 * pwa-plugin.js - after `vite build`, writes dist/sw.js from pwa/sw.template.js.
 *
 * The service worker precaches every file in dist/ except sw.js itself and the levels/ folder (levels are downloaded on
 * demand by the game). BUILD_ID is a hash of the names and contents of those files, so sw.js changes - and devices
 * therefore notice an update - exactly when something the player would see or run has changed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SKIP_TOP_LEVEL = new Set(['sw.js', 'levels']);

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** Files that make up the app (relative paths, sorted), and the build id derived from them. */
export function collectApp(distDir) {
  const files = listFiles(distDir).filter((f) => !SKIP_TOP_LEVEL.has(f.split('/')[0])).sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) hash.update(f).update('\0').update(fs.readFileSync(path.join(distDir, f)));
  return { files, buildId: hash.digest('hex').slice(0, 12) };
}

/** Writes distDir/sw.js. Returns { buildId, files }. */
export function writeServiceWorker(distDir, templatePath) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error(`pwa-plugin: ${distDir} has no index.html - nothing to precache`);
  const { files, buildId } = collectApp(distDir);
  const template = fs.readFileSync(templatePath, 'utf8');
  for (const token of ['__BUILD_ID__', '__PRECACHE__']) {
    if (template.split(token).length !== 2) throw new Error(`pwa-plugin: ${token} must appear exactly once in the service worker template (also not in comments)`);
  }
  const sw = template.replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify(files, null, 2));
  fs.writeFileSync(path.join(distDir, 'sw.js'), sw);
  return { buildId, files };
}

export function pwaPlugin({ template = 'pwa/sw.template.js' } = {}) {
  let root = process.cwd(), outDir = 'dist';
  return {
    name: 'pwa-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { root = config.root; outDir = path.resolve(config.root, config.build.outDir); },
    closeBundle() {
      if (!fs.existsSync(path.join(outDir, 'index.html'))) return;   // e.g. a nested worker build
      const { buildId, files } = writeServiceWorker(outDir, path.resolve(root, template));
      console.log(`\n[pwa] service worker ${buildId}: ${files.length} files precached`);
    },
  };
}
