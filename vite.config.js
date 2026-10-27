import fs from 'node:fs';
import { pwaPlugin } from './tools/pwa-plugin.js';
import { presetsCheckPlugin } from './tools/presets-plugin.js';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default {
  // relative URLs everywhere, so the same build works at https://<user>.github.io/<repo>/ and anywhere else
  base: './',
  // the level generator runs in a module web worker
  worker: { format: 'es' },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [presetsCheckPlugin(), pwaPlugin()],
};
