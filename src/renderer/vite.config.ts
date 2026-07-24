import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    root: __dirname,
    base: './',
    // No public/ dir needed for the Electron build — the web-only build
    // (vite.web.config.ts) has one (tesseract.js's bundled eng.traineddata,
    // ~5MB) that would otherwise inflate the desktop installer for no reason.
    publicDir: false,
    build: {
        outDir: '../../dist/renderer',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
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