import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from './tailwind.config.js';

// WHY importing the config directly instead of passing tailwindcss() a path
// string: `vite build` is invoked from the project root, but this PostCSS +
// Tailwind config lives in src/renderer/, so a bare `tailwindcss()` with no
// args would search the cwd, find nothing, and silently fall back to an
// empty config (reset only, zero utility classes — the whole UI unstyled).
// An earlier fix addressed that by passing an explicit path string, but
// Tailwind then has to `require`/`import` that ESM config file internally —
// version-dependent CJS/ESM interop behavior (confirmed 2026-07-19: CI's
// Node 20 AND 22 silently produced an empty-looking config this way, while
// local Node 24 didn't) made that resolution itself unreliable. Importing
// the config ourselves, right here, uses the SAME `import` machinery this
// very file's own top-level imports already rely on — no separate resolver
// to trust.
export default {
    plugins: [
        tailwindcss(tailwindConfig),
        autoprefixer(),
    ],
};
