/**
 * @fileoverview Game-definition registry
 * @module adapters/game-definitions
 *
 * The app ships with ZERO games compiled in — every game (including the
 * official Wuthering Waves and Genshin Impact packages) is a downloadable
 * "game module" loaded at runtime from `<userData>/game-modules/`, via
 * `initExternalGameModules(dir)`, called once by the Electron main process
 * (before kernel boot). This keeps the base installer small and lets a game
 * update (new characters, weapon balance, etc.) ship independently of the
 * app itself — no new app release needed for either official or
 * community-authored content.
 *
 * See `shared/game-data/external-loader.ts` for the file format and
 * validation, `scripts/build-game-package.js` for how the official WW/GI
 * packages are built from this repo's own game data, and
 * `docs/GAME_MODULES.md` for the end-to-end guide (including where to
 * download the official packages).
 */

import type { GameDefinition } from '@shared/types/game-definition';
import type { GameBundle } from '@shared/types/game-bundle';
import { loadExternalGameBundles } from '@shared/game-data/external-loader';

/** Game modules loaded at runtime — see `initExternalGameModules`. Starts
 * empty; a fresh install has no games until one is added (see
 * `Workspace.tsx`'s "No game installed yet" screen). */
const GAME_DEFINITIONS: Record<string, GameDefinition> = {};
const GAME_BUNDLES: Record<string, GameBundle> = {};
/** Absolute `icons/` folder path per game id, only set for a
 * SUBDIRECTORY-based package (a loose top-level JSON file has no icons —
 * see `loadExternalGameBundles`'s doc comment). Consumed by the `fm-icon://`
 * protocol handler in `src/main/electron-main.ts`. */
const GAME_ICON_DIRS: Record<string, string> = {};

/**
 * Scan `dir` for game-module files and register the valid ones. Call ONCE,
 * before kernel boot, so `game-loader`'s first resolution already sees them.
 * Safe to call with a non-existent directory (returns an empty result,
 * doesn't throw) — a fresh install's first launch before any game is added.
 */
export function initExternalGameModules(dir: string): { loaded: string[]; errors: Array<{ file: string; error: string }> } {
    const result = loadExternalGameBundles(dir);
    const loaded: string[] = [];
    const errors = [...result.errors];

    for (const { definition, bundle, sourceFile, iconsDir } of result.loaded) {
        if (definition.id in GAME_DEFINITIONS) {
            errors.push({ file: sourceFile, error: `id "${definition.id}" is already registered by another game-module file — skipping the duplicate` });
            continue;
        }
        GAME_DEFINITIONS[definition.id] = definition;
        GAME_BUNDLES[definition.id] = bundle;
        if (iconsDir) GAME_ICON_DIRS[definition.id] = iconsDir;
        loaded.push(definition.id);
    }

    return { loaded, errors };
}

/** The icons directory for `id`, if its package shipped one. */
export function getExternalIconsDir(id: string): string | undefined {
    return GAME_ICON_DIRS[id];
}

export function getGameBundle(id: string): GameBundle | undefined {
    return GAME_BUNDLES[id];
}

export function getGameDefinition(id: string): GameDefinition | undefined {
    return GAME_DEFINITIONS[id];
}

export function listInstalledGames(): GameDefinition[] {
    return Object.values(GAME_DEFINITIONS);
}

/** Whether `id` resolves to a registered (loaded) game. */
export function hasGameDefinition(id: string): boolean {
    return id in GAME_DEFINITIONS;
}
