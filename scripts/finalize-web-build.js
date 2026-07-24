/**
 * Vite emits the web build's entry HTML under the same name as its source
 * file (index.web.html) — most static hosts (GitHub Pages included) only
 * auto-serve a literal `index.html` at a directory root, so this renames it
 * after the build. Kept as a tiny standalone script (same pattern as
 * copy-manifests.js for the Electron build) rather than fighting Vite's HTML
 * input naming via config.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'dist', 'web');
const from = path.join(dir, 'index.web.html');
const to = path.join(dir, 'index.html');

if (!fs.existsSync(from)) {
    throw new Error(`[finalize-web-build] ${from} not found — did the web build actually run?`);
}
fs.renameSync(from, to);
console.log('[finalize-web-build] renamed index.web.html -> index.html');
