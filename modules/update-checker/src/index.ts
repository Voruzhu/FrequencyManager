/**
 * @fileoverview Update Checker module
 * @module modules/update-checker
 *
 * WHY: The app and game-definition packages evolve independently. The app
 * auto-updates via `electron-updater` (wired in `src/main/electron-main.ts`).
 * Game-definition packages — which are pure data files under
 * `adapters/game-definitions/` — also need a version channel so a player
 * can pick up a freshly-released set of WU set bonuses or GI characters
 * without rebuilding the app.
 *
 * This module periodically fetches a JSON manifest from a configured URL,
 * compares each entry against the locally-installed `GameDefinition` (which
 * the `game-loader` module injected into kernel config), and emits an
 * `update-checker:game-update-available` event for every game whose remote
 * version is newer than the local one.
 *
 * The renderer subscribes to that event and surfaces a notification banner.
 * We do NOT auto-install — the user must opt in (download happens in a
 * follow-up via the renderer's "Update" action).
 *
 * Backwards compatibility rules:
 *   - `minAppVersion` missing on a game def  →  assumed compatible.
 *   - `minAppVersion` present and > running app version → emit a
 *     `update-checker:game-incompatible` warning instead of an "available"
 *     notification. The renderer shows a "your app is too old" message.
 *   - Pre-release versions (semver with `-x.y.z`) are ignored by default.
 */

import {
    ModuleAPI,
    ModuleManifest,
    ModuleLoaderOptions,
    ModuleFactory,
    ModuleHealthStatus,
    ModuleState,
    KernelInterface,
} from '@shared/types';
import { parseSemVer, compareSemVer } from '@shared/types';
import { manifest } from './manifest';
import type { GameDefinition } from '@shared/types/game-definition';
import { listInstalledGames } from '@adapters/game-definitions';

export { manifest } from './manifest';

// ─────────────────────────────────────────────────────────────────────────────
// Wire shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single entry inside the remote manifest. Mirrors a GameDefinition but
 * only the fields the update-checker needs.
 */
export interface GameDefinitionUpdateEntry {
    id: string;
    displayName: string;
    version: string;
    /** Optional override of GameDefinition.minAppVersion. */
    minAppVersion?: string;
    /** Raw URL to download the .ts (or future .json) file. */
    downloadUrl: string;
    /** Optional release notes, shown verbatim in the renderer. */
    releaseNotes?: string;
}

/**
 * Top-level shape of the remote manifest served from `updates.gameDefinitionsManifestUrl`.
 */
export interface GameDefinitionsManifest {
    schemaVersion: string;
    generatedAt: string;
    gameDefinitions: GameDefinitionUpdateEntry[];
}

/**
 * Payload of `update-checker:game-update-available`.
 */
export interface GameUpdateAvailableEvent {
    id: string;
    displayName: string;
    localVersion: string;
    remoteVersion: string;
    downloadUrl: string;
    releaseNotes?: string;
}

/**
 * Payload of `update-checker:game-incompatible`.
 */
export interface GameIncompatibleEvent {
    id: string;
    displayName: string;
    requiredAppVersion: string;
    runningAppVersion: string;
}

/**
 * Result of checking the app's own GitHub repository for a newer release.
 */
export interface AppUpdateInfo {
    repo: string;                 // "owner/name"
    currentVersion: string;
    latestVersion: string | null; // null if the check couldn't resolve one
    updateAvailable: boolean;
    releaseUrl?: string;
    releaseNotes?: string;
    error?: string;               // set if the check failed / wasn't configured
}

/** Options a caller (renderer) can pass to override configured sources. */
export interface CheckOptions {
    /** Remote game-definitions manifest URL. */
    manifestUrl?: string;
    /** App GitHub repo "owner/name" for the app-release check. */
    appRepo?: string;
    /** The running app version to compare against (from electron `app.getVersion()`). */
    currentAppVersion?: string;
}

/** Full status returned by the check-now / get-cache RPCs. */
export interface UpdateStatus {
    lastCheckAt: number | null;
    lastError: string | null;
    app: AppUpdateInfo | null;
    games: GameUpdateAvailableEvent[];
    incompatible: GameIncompatibleEvent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────────────────────

interface UpdateCheckerState {
    lastCheckAt: number | null;
    lastError: string | null;
    available: GameUpdateAvailableEvent[];
    incompatible: GameIncompatibleEvent[];
    app: AppUpdateInfo | null;
    backgroundTimerHandle: NodeJS.Timeout | null;
}

class UpdateCheckerModule implements ModuleAPI {
    public readonly moduleId = 'update-checker';
    public readonly manifest: ModuleManifest;
    public health: ModuleHealthStatus = 'unloaded';

    private kernel: KernelInterface | null = null;
    private state: UpdateCheckerState = {
        lastCheckAt: null,
        lastError: null,
        available: [],
        incompatible: [],
        app: null,
        backgroundTimerHandle: null,
    };

    constructor(manifest: ModuleManifest) {
        this.manifest = manifest;
    }

    async initialize(kernel: KernelInterface): Promise<void> {
        this.kernel = kernel;

        // Expose a manual trigger via RPC. Accepts optional source overrides
        // (manifest URL, app repo, current app version) from the renderer.
        kernel.eventBus.onRequest<CheckOptions, UpdateStatus>(
            'update-checker:check-now',
            async (opts) => {
                await this.checkNow(opts ?? {});
                return this.buildStatus();
            },
        );

        // Expose the latest cache for late-bound UI consumers.
        kernel.eventBus.onRequest<Record<string, never>, UpdateStatus>(
            'update-checker:get-cache',
            async () => this.buildStatus(),
        );

        this.health = 'healthy';
        kernel.logger.info('[Update Checker] Module initialized');

        // Boot-time check + scheduled re-check.
        const cfg = this.getConfig();
        if (cfg.gameModuleCheckOnBoot) {
            // Fire and forget — don't block kernel boot on a network round-trip.
            void this.checkNow().catch((err) => {
                kernel.logger.warn('[Update Checker] Boot check failed', {
                    error: err instanceof Error ? err.message : String(err),
                });
            });
        }
        if (cfg.checkIntervalHours > 0) {
            const ms = cfg.checkIntervalHours * 60 * 60 * 1000;
            this.state.backgroundTimerHandle = setInterval(() => {
                void this.checkNow().catch(() => {
                    /* swallow; logged inside */
                });
            }, ms);
            // Don't keep the Node process alive solely for the timer.
            if (typeof this.state.backgroundTimerHandle.unref === 'function') {
                this.state.backgroundTimerHandle.unref();
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core logic
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Fetch the remote manifest, compare against locally installed games,
     * emit events for any newer or incompatible entries.
     *
     * @returns The number of remote entries inspected.
     */
    async checkNow(opts: CheckOptions = {}): Promise<number> {
        if (!this.kernel) return 0;
        const cfg = this.getConfig();
        const manifestUrl = opts.manifestUrl || cfg.gameDefinitionsManifestUrl;
        const appRepo = opts.appRepo || cfg.appRepo;
        const runningAppVersionForApp = opts.currentAppVersion || this.getAppVersion();

        this.state.lastCheckAt = Date.now();

        // App-release check (independent of the game-module manifest).
        this.state.app = appRepo
            ? await this.checkAppUpdate(appRepo, runningAppVersionForApp, cfg.requestTimeoutMs, cfg.allowPrerelease)
            : null;

        const manifest = await this.fetchManifest(manifestUrl, cfg.requestTimeoutMs);
        if (!manifest) {
            // No game manifest, but the app check may still have produced a result.
            this.kernel.eventBus.publish('update-checker:check-complete', {
                checkedAt: this.state.lastCheckAt,
                available: 0,
                incompatible: 0,
                appUpdateAvailable: this.state.app?.updateAvailable ?? false,
            });
            return 0;
        }
        this.state.lastError = null;

        const localGames = this.getLocalGameDefinitions();
        const runningAppVersion = this.getAppVersion();
        const available: GameUpdateAvailableEvent[] = [];
        const incompatible: GameIncompatibleEvent[] = [];

        for (const remote of manifest.gameDefinitions) {
            if (!this.isAcceptableVersion(remote.version, cfg.allowPrerelease)) {
                continue;
            }

            const local = localGames[remote.id];
            // Brand-new game we don't have locally yet.
            if (!local) {
                if (this.isAppCompatible(remote.minAppVersion, runningAppVersion)) {
                    available.push({
                        id: remote.id,
                        displayName: remote.displayName,
                        localVersion: '0.0.0',
                        remoteVersion: remote.version,
                        downloadUrl: remote.downloadUrl,
                        releaseNotes: remote.releaseNotes,
                    });
                } else {
                    incompatible.push({
                        id: remote.id,
                        displayName: remote.displayName,
                        requiredAppVersion: remote.minAppVersion ?? '?',
                        runningAppVersion,
                    });
                }
                continue;
            }

            // Local copy exists — compare versions.
            const cmp = compareSemVer(parseSemVer(remote.version), parseSemVer(local.version));
            if (cmp > 0) {
                if (this.isAppCompatible(remote.minAppVersion ?? local.minAppVersion, runningAppVersion)) {
                    available.push({
                        id: remote.id,
                        displayName: remote.displayName,
                        localVersion: local.version,
                        remoteVersion: remote.version,
                        downloadUrl: remote.downloadUrl,
                        releaseNotes: remote.releaseNotes,
                    });
                } else {
                    incompatible.push({
                        id: remote.id,
                        displayName: remote.displayName,
                        requiredAppVersion: remote.minAppVersion ?? local.minAppVersion ?? '?',
                        runningAppVersion,
                    });
                }
            }
        }

        this.state.available = available;
        this.state.incompatible = incompatible;

        // Emit events.
        for (const u of available) {
            this.kernel.eventBus.publish('update-checker:game-update-available', u);
        }
        for (const i of incompatible) {
            this.kernel.eventBus.publish('update-checker:game-incompatible', i);
        }
        this.kernel.eventBus.publish('update-checker:check-complete', {
            checkedAt: this.state.lastCheckAt,
            available: available.length,
            incompatible: incompatible.length,
        });

        this.kernel.logger.info('[Update Checker] Check complete', {
            checked: manifest.gameDefinitions.length,
            available: available.length,
            incompatible: incompatible.length,
        });

        return manifest.gameDefinitions.length;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────

    private async fetchManifest(url: string, timeoutMs: number): Promise<GameDefinitionsManifest | null> {
        if (!url || !/^https?:\/\//.test(url)) {
            this.state.lastError = `Invalid manifest URL: ${url}`;
            this.kernel?.logger.warn('[Update Checker] ' + this.state.lastError);
            return null;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) {
                this.state.lastError = `Manifest HTTP ${res.status}`;
                this.kernel?.logger.warn('[Update Checker] ' + this.state.lastError);
                return null;
            }
            const parsed = (await res.json()) as GameDefinitionsManifest;
            if (!parsed || !Array.isArray(parsed.gameDefinitions)) {
                this.state.lastError = 'Manifest shape invalid';
                this.kernel?.logger.warn('[Update Checker] ' + this.state.lastError);
                return null;
            }
            return parsed;
        } catch (err) {
            this.state.lastError = err instanceof Error ? err.message : String(err);
            this.kernel?.logger.warn('[Update Checker] Fetch failed', { error: this.state.lastError });
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    private isAcceptableVersion(version: string, allowPrerelease: boolean): boolean {
        try {
            const sem = parseSemVer(version);
            return allowPrerelease ? true : !sem.prerelease;
        } catch {
            return false;
        }
    }

    /**
     * Returns true if the running app satisfies `minAppVersion`.
     * Missing `minAppVersion` means "any app version" → compatible.
     * Same major as required AND running app is >= required minor/patch.
     */
    private isAppCompatible(minAppVersion: string | undefined, runningAppVersion: string): boolean {
        if (!minAppVersion) return true;
        try {
            const required = parseSemVer(minAppVersion);
            const running = parseSemVer(runningAppVersion);
            // Same major — running must be >= required.
            if (running.major !== required.major) return running.major > required.major;
            return compareSemVer(running, required) >= 0;
        } catch {
            // If we can't parse either side, fail open (compatible).
            return true;
        }
    }

    private getConfig(): {
        gameDefinitionsManifestUrl: string;
        appRepo: string;
        gameModuleCheckOnBoot: boolean;
        checkIntervalHours: number;
        requestTimeoutMs: number;
        allowPrerelease: boolean;
    } {
        const cfg = (this.kernel?.config.getAll() ?? {}) as {
            updates?: {
                gameDefinitionsManifestUrl?: string;
                appRepo?: string;
                gameModuleCheckOnBoot?: boolean;
                checkIntervalHours?: number;
                requestTimeoutMs?: number;
                allowPrerelease?: boolean;
            };
        };
        return {
            gameDefinitionsManifestUrl: cfg.updates?.gameDefinitionsManifestUrl ?? '',
            appRepo: cfg.updates?.appRepo ?? '',
            gameModuleCheckOnBoot: cfg.updates?.gameModuleCheckOnBoot ?? true,
            checkIntervalHours: cfg.updates?.checkIntervalHours ?? 24,
            requestTimeoutMs: cfg.updates?.requestTimeoutMs ?? 10000,
            allowPrerelease: cfg.updates?.allowPrerelease ?? false,
        };
    }

    /**
     * Check the app's own GitHub repository for a newer published release.
     * Compares the latest release tag (via the GitHub REST API) against the
     * running app version. Never throws — failures are captured in `error`.
     */
    private async checkAppUpdate(
        repo: string,
        currentVersion: string,
        timeoutMs: number,
        allowPrerelease: boolean,
    ): Promise<AppUpdateInfo> {
        const base: AppUpdateInfo = { repo, currentVersion, latestVersion: null, updateAvailable: false };

        // Accept "owner/name" or a full github URL.
        const m = repo.match(/(?:github\.com\/)?([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
        if (!m) {
            return { ...base, error: `Invalid repo "${repo}" (expected owner/name)` };
        }
        const [, owner, name] = m;
        // Prereleases: /releases/latest excludes them; when allowed, list all and take the first.
        const url = allowPrerelease
            ? `https://api.github.com/repos/${owner}/${name}/releases?per_page=10`
            : `https://api.github.com/repos/${owner}/${name}/releases/latest`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FrequencyManager' },
            });
            if (!res.ok) return { ...base, error: `GitHub HTTP ${res.status}` };
            const json = await res.json();
            const release = Array.isArray(json) ? json.find((r) => allowPrerelease || !r.prerelease) : json;
            if (!release || typeof release.tag_name !== 'string') {
                return { ...base, error: 'No release found' };
            }
            const latestVersion = String(release.tag_name).replace(/^v/i, '');
            let updateAvailable = false;
            try {
                updateAvailable = compareSemVer(parseSemVer(latestVersion), parseSemVer(currentVersion)) > 0;
            } catch {
                // Non-semver tag: fall back to string inequality.
                updateAvailable = latestVersion !== currentVersion;
            }
            return {
                repo, currentVersion, latestVersion, updateAvailable,
                releaseUrl: typeof release.html_url === 'string' ? release.html_url : undefined,
                releaseNotes: typeof release.body === 'string' ? release.body : undefined,
            };
        } catch (err) {
            return { ...base, error: err instanceof Error ? err.message : String(err) };
        } finally {
            clearTimeout(timer);
        }
    }

    /** Assemble the current cached status for the RPCs. */
    private buildStatus(): UpdateStatus {
        return {
            lastCheckAt: this.state.lastCheckAt,
            lastError: this.state.lastError,
            app: this.state.app,
            games: this.state.available,
            incompatible: this.state.incompatible,
        };
    }

    /**
     * Returns the locally-installed game definitions.
     *
     * Source of truth is `listInstalledGames()` from the adapter registry —
     * NOT the kernel config (the game-loader only injects the *active* game
     * into kernel config under `game.definition`, so reading `gameDefinitions`
     * from there would always be empty and the update-checker would emit
     * a spurious "new game available" for every remote entry on every check).
     */
    private getLocalGameDefinitions(): Record<string, GameDefinition> {
        const out: Record<string, GameDefinition> = {};
        for (const def of listInstalledGames()) out[def.id] = def;
        return out;
    }

    private getAppVersion(): string {
        const cfg = (this.kernel?.config.getAll() ?? {}) as { version?: string };
        return cfg.version ?? '0.0.0';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Module interface
    // ─────────────────────────────────────────────────────────────────────────

    async configure(_config: Record<string, unknown>): Promise<void> {
        // Config is read fresh on every check. Nothing to do.
    }

    async shutdown(): Promise<void> {
        if (this.state.backgroundTimerHandle) {
            clearInterval(this.state.backgroundTimerHandle);
            this.state.backgroundTimerHandle = null;
        }
        this.health = 'unloaded';
        this.kernel?.logger.info('[Update Checker] Module shutdown');
    }

    async healthCheck(): Promise<ModuleHealthStatus> {
        return this.health;
    }

    getState(): ModuleState {
        return {
            moduleId: this.moduleId,
            health: this.health,
            uptime: this.state.lastCheckAt ? Date.now() - this.state.lastCheckAt : 0,
            data: {
                lastCheckAt: this.state.lastCheckAt,
                lastError: this.state.lastError,
                availableCount: this.state.available.length,
                incompatibleCount: this.state.incompatible.length,
            },
            lastHealthCheck: Date.now(),
            loadedAt: this.state.lastCheckAt ?? Date.now(),
        };
    }
}

const factory: ModuleFactory = async (_options: ModuleLoaderOptions): Promise<ModuleAPI> => {
    return new UpdateCheckerModule(manifest);
};

export default factory;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers exported for testing
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a semver string; throws if invalid. Re-exported for tests. */
export const __testing = {
    parseSemVer,
    compareSemVer,
};