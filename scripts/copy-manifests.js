/**
 * Copy each module's module.manifest.json into its compiled dist folder.
 *
 * WHY: `tsc` only emits .js/.d.ts and does not copy standalone .json files, so
 * dist/modules/<name>/ ends up with a compiled src/ but no manifest. The kernel
 * discovers modules by scanning for module.manifest.json next to the compiled
 * entry point (dist/modules/<name>/src/index.js), so without this step every
 * module is silently skipped. Run after `tsc` in the build:main script.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcModules = path.join(root, 'modules');
const distModules = path.join(root, 'dist', 'modules');

if (!fs.existsSync(srcModules)) {
    console.warn('[copy-manifests] no modules/ dir, nothing to do');
    process.exit(0);
}

let copied = 0;
for (const name of fs.readdirSync(srcModules)) {
    const manifest = path.join(srcModules, name, 'module.manifest.json');
    if (!fs.existsSync(manifest)) continue;
    const destDir = path.join(distModules, name);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(manifest, path.join(destDir, 'module.manifest.json'));
    copied++;
}
console.log(`[copy-manifests] copied ${copied} manifest(s) into dist/modules`);
