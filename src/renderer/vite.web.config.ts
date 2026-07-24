/**
 * Web build target — same renderer source as vite.config.ts (Electron), just
 * a different entry HTML (index.web.html, whose only real difference is a
 * CSP without the Electron-only `fm-icon:` protocol) and its own output dir
 * so `npm run build` and `npm run build:web` never clobber each other.
 *
 * `base: './'` (relative asset paths) works unchanged for a GitHub Pages
 * *project* site served from a subpath (https://<user>.github.io/<repo>/) —
 * no separate base-path config needed per deploy target.
 *
 * See docs/WEB_VERSION.md for what's different about the web build overall.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Read directly rather than `import ... from '../../package.json'` — avoids
// relying on a JSON-import-assertion syntax whose exact form varies by Node
// version; this works identically everywhere.
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'));

export default defineConfig({
    plugins: [react()],
    root: __dirname,
    base: './',
    // Explicit (matches Vite's own default) — src/renderer/public/tessdata/
    // bundles eng.traineddata for the browser OCR path (see lib/ocrBrowser.ts).
    publicDir: 'public',
    // Lets lib/icons.ts pin its jsDelivr CDN icon URLs to this exact release
    // tag (v${version}) for an immutable, cache-forever URL — see its doc
    // comment. Declared for TS in src/renderer/src/vite-env.d.ts.
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
        outDir: '../../dist/web',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.web.html'),
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@shared': path.resolve(__dirname, '../../shared'),
            '@adapters': path.resolve(__dirname, '../../adapters'),
        },
    },
});
