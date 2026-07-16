/**
 * @fileoverview Game Loader module for FrequencyManager
 * @module modules/game-loader
 *
 * WHY: FrequencyManager needs to switch between Wuthering Waves, Genshin
 * Impact, and any future game packages without touching module code. This
 * module reads `config.game.activeGame` (or the legacy `activeGame` key),
 * resolves the matching `GameDefinition` from the local adapter registry,
 * and injects it into every other module's runtime config so they can
 * read it via `kernel.config.get('game.definition')`.
 *
 * The module also re-broadcasts the active game on the EventBus so
 * downstream modules can refresh their state when the user switches.
 */

import {
    ModuleAPI,
    ModuleManifest,
    ModuleLoaderOptions,
    ModuleFactory,
    ModuleError,
    ModuleHealthStatus,
    ModuleState,
    KernelInterface,
} from '@shared/types';
import { manifest } from './manifest';
import type { GameDefinition } from '@shared/types/game-definition';
import {
    getGameDefinition,
    getGameBundle,
    hasGameDefinition,
    listInstalledGames,
} from '@adapters/game-definitions';

// Re-export manifest
export { manifest } from './manifest';

// ─────────────────────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────────────────────

interface GameLoaderState {
    /** A registered game id — every game is loaded at runtime via `initExternalGameModules` (see `adapters/game-definitions/index.ts`); there's no compiled-in game anymore. */
    activeGameId: string | null;
    resolvedAt: number | null;
    resolutionCount: number;
    lastError: string | null;
}

/**
 * Game Loader Module Implementation
 */
class GameLoaderModule implements ModuleAPI {
    public readonly moduleId = 'game-loader';
    public readonly manifest: ModuleManifest;
    public health: ModuleHealthStatus = 'unloaded';

    private kernel: KernelInterface | null = null;
    private state: GameLoaderState = {
        activeGameId: null,
        resolvedAt: null,
        resolutionCount: 0,
        lastError: null,
    };

    constructor(manifest: ModuleManifest) {
        this.manifest = manifest;
    }

    /**
     * Initialize the module: register every RPC FIRST, then resolve the
     * active game and publish its GameDefinition on the kernel config under
     * `game.definition`.
     *
     * Registration must come before resolution: `resolveAndInject()` no
     * longer throws when zero games are installed (see its doc comment),
     * but if it EVER did — or if some other unexpected error occurred — an
     * exception here would abort `initialize()` entirely and skip every
     * `onRequest` registration below it, leaving the renderer's
     * `getGames()`/`getActiveGame()`/etc. calls failing with "no handler"
     * instead of a graceful "no game installed" response. This ordering
     * makes the RPC surface available no matter what state the game
     * registry is in.
     */
    async initialize(kernel: KernelInterface): Promise<void> {
        this.kernel = kernel;

        // Re-emit whenever someone asks (useful for hot-reload).
        kernel.eventBus.subscribe('game:reload-request', async () => {
            await this.resolveAndInject();
        });

        // Allow IPC to ask "what game is loaded?" via RPC.
        kernel.eventBus.onRequest('game:list-installed', () => {
            return listInstalledGames().map(g => ({
                id: g.id,
                displayName: g.displayName,
                version: g.version,
                description: g.description,
            }));
        });

        kernel.eventBus.onRequest('game:get-active', () => {
            return {
                id: this.state.activeGameId,
                definition: this.state.activeGameId
                    ? getGameDefinition(this.state.activeGameId)
                    : undefined,
            };
        });

        // Serve the fully-assembled, renderer-ready UI data bundle for a game.
        // With no id, returns the active game's bundle. This is the single
        // source of truth for the renderer's game data (rosters, skills, stat
        // catalog, gear, enemies, buffs, passives).
        kernel.eventBus.onRequest('game:get-bundle', (payload: { id?: string } = {}) => {
            const id = payload?.id ?? this.state.activeGameId ?? undefined;
            if (!id) return null;
            return getGameBundle(id) ?? null;
        });

        kernel.eventBus.onRequest('game:get-options', () => {
            const def = this.state.activeGameId
                ? getGameDefinition(this.state.activeGameId)
                : undefined;
            if (!def) return null;
            return {
                characters: def.uiOptions?.characters ?? [],
                setNames: def.uiOptions?.setNames ?? [],
                weaponTypes: def.uiOptions?.weaponTypes ?? def.character.weapons,
                elements: def.uiOptions?.elements ?? def.character.elements,
                categories: def.uiOptions?.categories,
                hiddenCategories: def.uiOptions?.hiddenCategories,
                inventoryTabs: def.uiOptions?.inventoryTabs,
            };
        });

        // Switch the active game: persist the choice into config, re-resolve +
        // inject the new GameDefinition, and broadcast a reload so downstream
        // modules (OCR, damage-calc) and the renderer refresh.
        kernel.eventBus.onRequest('game:set-active', async (payload: { id?: string }) => {
            const id = payload?.id;
            if (!id || !hasGameDefinition(id)) {
                return { ok: false, error: `Unknown game: ${id}` };
            }
            const cfg = (kernel.config.getAll() as { game?: Record<string, unknown> }).game ?? {};
            kernel.config.set('game', { ...cfg, activeGame: id });
            const def = await this.resolveAndInject();
            // `id` was just confirmed via `hasGameDefinition` above, so resolution
            // succeeding is guaranteed here — this guard is defensive only.
            if (!def) return { ok: false, error: `Failed to resolve "${id}" after switching` };
            await kernel.eventBus.publish('game:reload-request', { id: def.id }, { source: this.moduleId });
            kernel.logger.info('[Game Loader] Active game switched', { to: def.id });
            return { ok: true, id: def.id, displayName: def.displayName, version: def.version };
        });

        // Resolve + inject the GameDefinition LAST — every RPC above is already
        // registered and safe to call even if this finds zero games installed.
        await this.resolveAndInject();

        // 'healthy' only once a game is actually active — 'degraded' (not
        // 'unhealthy'/errored) when none is, matching `healthCheck()`'s existing
        // convention: a fresh install with no game modules yet is an EXPECTED,
        // recoverable state (install one from Settings → Game), not a fault.
        this.health = this.state.activeGameId ? 'healthy' : 'degraded';
        kernel.logger.info('[Game Loader] Module initialized', {
            activeGame: this.state.activeGameId,
        });
    }

    /**
     * Resolve the active game id from config, fetch the GameDefinition from
     * the registry, and store it in the kernel config so other modules can
     * read it. Returns `undefined` — never throws — when NO game is
     * registered at all (e.g. a fresh install before any game module has
     * been added): every other module and the renderer must be able to
     * treat "no game yet" as a normal, first-run state, not a boot failure.
     */
    async resolveAndInject(): Promise<GameDefinition | undefined> {
        if (!this.kernel) {
            throw new ModuleError(
                'NOT_INITIALIZED',
                'Game Loader module has not been initialized',
                this.moduleId,
            );
        }

        const cfg = this.kernel.config.getAll() as {
            game?: { activeGame?: string; fallbackGame?: string };
            activeGame?: string;
        };

        // Look up the requested id. We accept either the new `game.activeGame`
        // or the legacy top-level `activeGame`. 'wuthering-waves' is only a
        // PREFERENCE (this app's original game, still worth trying first when
        // present) — never a hard dependency: if it isn't installed, fall
        // through to whatever games ARE actually registered instead of
        // assuming it always exists.
        const requested =
            cfg.game?.activeGame
            ?? cfg.activeGame
            ?? 'wuthering-waves';

        let resolvedId: string | undefined;
        if (hasGameDefinition(requested)) {
            resolvedId = requested;
        } else {
            const fallback = cfg.game?.fallbackGame ?? listInstalledGames()[0]?.id;
            if (fallback && hasGameDefinition(fallback)) {
                this.kernel.logger.warn(
                    '[Game Loader] Requested game not registered, falling back',
                    { requested, fallback },
                );
                resolvedId = fallback;
                this.state.lastError = `Unknown game: ${requested}`;
            } else {
                this.kernel.logger.warn(
                    '[Game Loader] No game modules are installed yet',
                    { requested },
                );
                this.state.lastError = `No game modules installed (requested: ${requested})`;
                this.state.activeGameId = null;
                return undefined;
            }
        }

        const definition = getGameDefinition(resolvedId);
        if (!definition) {
            // Registry inconsistency (hasGameDefinition said yes, getGameDefinition
            // says no) — a real bug, not an expected "nothing installed" state.
            throw new ModuleError(
                'GAME_NOT_FOUND',
                `GameDefinition for "${resolvedId}" is missing from the registry`,
                this.moduleId,
            );
        }

        // Inject into kernel config so other modules can read it.
        this.kernel.config.set('game', {
            activeGame: definition.id,
            version: definition.version,
            definition,
        });

        this.state.activeGameId = definition.id;
        this.state.resolvedAt = Date.now();
        this.state.resolutionCount += 1;

        // Broadcast for downstream modules.
        await this.kernel.eventBus.publish('game:loaded', {
            id: definition.id,
            displayName: definition.displayName,
            version: definition.version,
            definition,
        }, { source: this.moduleId });

        return definition;
    }

    /**
     * Convenience: returns the active GameDefinition, or null if none loaded.
     */
    getActiveGame(): GameDefinition | null {
        return this.state.activeGameId
            ? (getGameDefinition(this.state.activeGameId) ?? null)
            : null;
    }

    /**
     * Returns true if a game is loaded and healthy.
     */
    isReady(): boolean {
        return this.state.activeGameId !== null && this.health === 'healthy';
    }

    /**
     * Configuration update handler - re-resolve if activeGame changed.
     */
    async configure(_config: Record<string, unknown>): Promise<void> {
        const before = this.state.activeGameId;
        await this.resolveAndInject();
        if (before !== this.state.activeGameId) {
            this.kernel?.logger.info('[Game Loader] Active game changed', {
                from: before,
                to: this.state.activeGameId,
            });
        }
    }

    async shutdown(): Promise<void> {
        this.health = 'unloaded';
        this.state.activeGameId = null;
        this.kernel?.logger.info('[Game Loader] Module shutdown');
    }

    async healthCheck(): Promise<ModuleHealthStatus> {
        if (this.state.activeGameId === null) {
            this.health = 'degraded';
            return 'degraded';
        }
        this.health = 'healthy';
        return 'healthy';
    }

    getState(): ModuleState {
        return {
            moduleId: this.moduleId,
            health: this.health,
            uptime: this.state.resolvedAt ? Date.now() - this.state.resolvedAt : 0,
            data: {
                activeGameId: this.state.activeGameId,
                resolvedAt: this.state.resolvedAt,
                resolutionCount: this.state.resolutionCount,
                lastError: this.state.lastError,
                installedGames: listInstalledGames().map((g) => g.id),
            },
            lastHealthCheck: Date.now(),
            loadedAt: this.state.resolvedAt ?? Date.now(),
        };
    }
}

/**
 * Module factory function
 */
const factory: ModuleFactory = async (_options: ModuleLoaderOptions): Promise<ModuleAPI> => {
    const module = new GameLoaderModule(manifest);
    return module;
};

export default factory;