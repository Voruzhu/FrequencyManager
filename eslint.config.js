/**
 * @fileoverview ESLint flat config for FrequencyManager.
 *
 * Migrated from .eslintrc.json (2026-07-17) for the ESLint 9 upgrade — flat
 * config is required, .eslintrc.json's eslintrc format is no longer read.
 * The prettier integration (eslint-plugin-prettier/eslint-config-prettier)
 * was dropped rather than reinstalled: neither package was ever actually in
 * package.json despite the old config referencing them, so `npm run lint`
 * had been failing outright ("couldn't find config 'prettier'") before this
 * migration. Formatting is already handled by the separate `npm run format`
 * script (prettier directly) — no need for eslint to also run it.
 *
 * Two other pre-existing bugs surfaced once lint actually ran again:
 *  - Only one tsconfig was ever wired up, but the root tsconfig.json
 *    excludes src/renderer entirely (it's built separately via Vite + its
 *    own tsconfig) — so type-aware linting silently never covered the
 *    renderer. Now points at both projects.
 *  - `react-hooks/exhaustive-deps` is referenced by real
 *    eslint-disable-next-line comments across the renderer, but
 *    eslint-plugin-react-hooks was never actually configured (declared in
 *    package.json, never wired up) — added properly instead of dropped,
 *    since the disable comments prove it was meant to be active.
 */
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

const baseTsRules = {
    ...tseslint.configs.recommended.rules,
    ...tseslint.configs['recommended-requiring-type-checking'].rules,
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/no-misused-promises': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // typescript-eslint's own guidance: the base no-undef rule doesn't
    // understand TS type-only positions (React.ReactNode, etc.) or
    // tsconfig `lib`-provided ambient globals (window/document/self),
    // producing false positives — TS's own compiler already checks this,
    // and does it correctly.
    'no-undef': 'off',
};

module.exports = [
    { ignores: ['dist/**', 'node_modules/**', '**/*.config.js', '**/*.config.ts'] },
    js.configs.recommended,
    {
        // Main process / preload — Node context.
        files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, ...globals.es2022 },
            parser: tsParser,
            parserOptions: { project: './tsconfig.json', tsconfigRootDir: __dirname },
        },
        plugins: { '@typescript-eslint': tseslint },
        rules: baseTsRules,
    },
    {
        // Renderer — browser context, its own tsconfig (root excludes it).
        files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
        ignores: ['src/renderer/src/workers/**'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.es2022 },
            parser: tsParser,
            parserOptions: { project: './src/renderer/tsconfig.json', tsconfigRootDir: __dirname },
        },
        plugins: { '@typescript-eslint': tseslint, 'react-hooks': reactHooks },
        rules: {
            ...baseTsRules,
            // Only the two established hook rules — not the plugin's full
            // "recommended" bundle, which also pulls in newer React
            // Compiler static-analysis rules never part of this project's
            // setup (the codebase's own disable-comments only ever
            // reference exhaustive-deps).
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
    },
    {
        // Web Workers — no window/document, but self/postMessage instead.
        files: ['src/renderer/src/workers/**/*.ts'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.worker, ...globals.es2022 },
            parser: tsParser,
            parserOptions: { project: './src/renderer/tsconfig.json', tsconfigRootDir: __dirname },
        },
        plugins: { '@typescript-eslint': tseslint },
        rules: baseTsRules,
    },
];
