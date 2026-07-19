import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcssAnimate from 'tailwindcss-animate';

// Resolve content globs relative to THIS file, not the cwd, so `vite build`
// from the project root still scans the renderer's components. Forward slashes
// are required: Tailwind's globber (fast-glob) treats backslashes as escapes,
// so path.join() would break glob matching on Windows.
const configDir = path.dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');

// Every color reads a `--role` CSS variable (space-separated RGB channels) via
// the alpha-value form so opacity utilities (bg-primary/80) work. The theme
// applier swaps these vars at runtime. Legacy aliases (bg/fg/accent/muted/...)
// point at the SAME channels so ~351 existing usages become theme-driven with
// no edits. Name-clash rule: `muted` = muted TEXT (legacy); for muted SURFACES
// use bg-surface / bg-surface-2 / bg-secondary — never bg-muted.
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        `${configDir}/index.html`,
        `${configDir}/src/**/*.{js,ts,jsx,tsx}`,
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // ── canonical roles ──
                background: withAlpha('--background'),
                foreground: withAlpha('--foreground'),
                surface: {
                    DEFAULT: withAlpha('--surface'),
                    2: withAlpha('--surface-2'),
                },
                card: {
                    DEFAULT: withAlpha('--card'),
                    foreground: withAlpha('--card-foreground'),
                },
                popover: {
                    DEFAULT: withAlpha('--popover'),
                    foreground: withAlpha('--popover-foreground'),
                },
                primary: {
                    DEFAULT: withAlpha('--primary'),
                    foreground: withAlpha('--primary-foreground'),
                },
                secondary: {
                    DEFAULT: withAlpha('--secondary'),
                    foreground: withAlpha('--secondary-foreground'),
                },
                destructive: {
                    DEFAULT: withAlpha('--destructive'),
                    foreground: withAlpha('--destructive-foreground'),
                },
                success: {
                    DEFAULT: withAlpha('--success'),
                    foreground: withAlpha('--success-foreground'),
                },
                warning: {
                    DEFAULT: withAlpha('--warning'),
                    foreground: withAlpha('--warning-foreground'),
                },
                border: withAlpha('--border'),
                input: withAlpha('--input'),
                ring: withAlpha('--ring'),
                'muted-foreground': withAlpha('--muted-foreground'),

                // ── legacy aliases → same channels (zero-edit migration) ──
                bg: withAlpha('--background'),
                'bg-alt': withAlpha('--surface'),
                fg: withAlpha('--foreground'),
                'fg-muted': withAlpha('--muted-foreground'),
                accent: withAlpha('--primary'),
                'accent-hover': withAlpha('--primary'),
                muted: withAlpha('--muted-foreground'),
                error: withAlpha('--destructive'),
                ok: withAlpha('--success'),
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
            boxShadow: {
                'elevation-1': 'var(--elevation-1)',
                'elevation-2': 'var(--elevation-2)',
                'elevation-3': 'var(--elevation-3)',
            },
            fontFamily: {
                sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
                mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' },
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' },
                },
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
            },
        },
    },
    plugins: [tailwindcssAnimate],
};
