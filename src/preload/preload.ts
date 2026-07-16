/**
 * @fileoverview Electron Preload Script - IPC Bridge
 * @module src/preload/preload
 *
 * Runs in a sandboxed context with access to a limited set of Node and Electron
 * APIs. Exposes a strictly-typed `window.frequencyManager` API to the renderer
 * via `contextBridge`. The renderer has NO direct Node access; everything must
 * flow through this surface.
 *
 * Security model:
 * - contextIsolation: true (set in electron-main.ts)
 * - sandbox: true (set in electron-main.ts)
 * - nodeIntegration: false (set in electron-main.ts)
 *
 * @packageDocumentation
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { ScannedEcho } from '@shared/types/ocr';

// ────────────────────────────────────────────────────────────────────────────
// Public API Types
// ────────────────────────────────────────────────────────────────────────────

/** Result of a kernel health check. */
export interface KernelHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    error?: string;
    [key: string]: unknown;
}

/** Lightweight module descriptor returned by `kernel:modules`. */
export interface ModuleInfo {
    id: string;
    name: string;
    version: string;
    health: string;
    enabled?: boolean;
    description?: string;
    hasUI?: boolean;
}

/** OCR scan result — the `ocr:scan` IPC handler always RESOLVES (never
 * rejects) with this shape, success or failure. WHY: Electron's
 * `ipcMain.handle` rejection path only reliably forwards an Error's
 * `.message` string across the IPC boundary, silently dropping any custom
 * properties — so failure detail like `rawText` (the raw Tesseract output,
 * useful for diagnosing a rejected/low-confidence scan) couldn't survive a
 * thrown-Error design. */
export type OcrScanResult =
    | { success: true; echo: ScannedEcho }
    | { success: false; error: string; rawText?: string };

/** Damage calculation request payload (loose on purpose — validated in module). */
export interface DamageCalculationRequest {
    [key: string]: unknown;
}

/** Damage calculation result. */
export interface DamageCalculationResult {
    [key: string]: unknown;
}

/** Event subscription handle used to unsubscribe. */
export type Unsubscribe = () => void;

// ────────────────────────────────────────────────────────────────────────────
// Renderer-facing API
// ────────────────────────────────────────────────────────────────────────────

/**
 * The public API exposed to the renderer as `window.frequencyManager`.
 *
 * Every method is a thin Promise-returning wrapper around an `ipcRenderer.invoke`
 * call. Subscriptions use `ipcRenderer.on` and return an `Unsubscribe` handle to
 * allow the renderer to clean up listeners without leaking.
 */
const frequencyManagerApi = {
    /**
     * Query kernel health.
     * @returns Kernel health snapshot.
     */
    health: (): Promise<KernelHealth> => ipcRenderer.invoke('kernel:health'),

    /**
     * List all registered modules.
     * @returns Array of module descriptors.
     */
    listModules: (): Promise<ModuleInfo[]> => ipcRenderer.invoke('kernel:modules'),

    /**
     * Get all modules with full info (alias for listModules).
     * @returns Array of module descriptors.
     */
    getModules: (): Promise<ModuleInfo[]> => ipcRenderer.invoke('kernel:modules'),

    /**
     * Trigger an OCR scan on the provided image path.
     * @param imagePath Absolute path to the image file.
     * @returns OCR scan result.
     */
    scanImage: (imagePath: string): Promise<OcrScanResult> =>
        ipcRenderer.invoke('ocr:scan', imagePath),

    /**
     * Calculate damage for a given request.
     * @param request Damage calculation parameters.
     * @returns Calculation result.
     */
    calculateDamage: (request: DamageCalculationRequest): Promise<DamageCalculationResult> =>
        ipcRenderer.invoke('damage:calculate', request),

    /**
     * Show an open-file dialog filtered to image files.
     * @returns Selected file path, or null if cancelled.
     */
    openImageDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),

    /**
     * Show an open-file dialog filtered to image files, multi-select.
     * @returns Selected file paths (empty if cancelled).
     */
    openImagesDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:openImages'),

    /**
     * Read an image file (e.g. one just picked via `openImageDialog`) as a
     * base64 `data:` URL, so it can be shown in an `<img>` under CSP (which
     * allows `data:` but not `file:`).
     * @param filePath Absolute path to the image file.
     * @returns A `data:image/...;base64,...` URL, or null if unreadable/unsupported.
     */
    readImagePreview: (filePath: string): Promise<string | null> =>
        ipcRenderer.invoke('fs:read-image-preview', filePath),

    /**
     * Capture whatever's currently on the primary screen to a temp PNG.
     * @param scanType Optional scan type ('echoes', etc.) — selects a crop
     * region isolating that UI panel before OCR, cutting out unrelated
     * screen noise. Omit to capture the full screen uncropped.
     * @returns The captured file's path, or null on failure.
     */
    captureScreen: (scanType?: string): Promise<string | null> => ipcRenderer.invoke('ocr:capture-screen', scanType),

    /**
     * Run an already-saved image file (e.g. one just picked via
     * `openImageDialog`) through the same crop+upscale processing a live
     * capture gets, so OCR accuracy is consistent regardless of source.
     * @param filePath Absolute path to the source image.
     * @param scanType Optional scan type ('echoes', etc.) selecting the crop region.
     * @returns The processed file's path (or the original path unchanged if
     * no crop region is configured for that scan type, or on failure).
     */
    processFile: (filePath: string, scanType?: string): Promise<string> =>
        ipcRenderer.invoke('ocr:process-file', filePath, scanType),

    /**
     * Register (or re-register) the global hotkey that triggers a screen
     * capture + OCR scan, even while another app (e.g. the game) has focus.
     * @param accelerator Electron accelerator string, e.g. "Alt+Shift+S".
     */
    setScanHotkey: (accelerator: string): void => ipcRenderer.send('settings:set-scan-hotkey', accelerator),

    /**
     * List connected monitors, for the "Capture display" override (Settings
     * → Scanner) — a manual fix for multi-monitor setups where automatic
     * window-title matching can't find the game (e.g. it runs exclusive-
     * fullscreen and isn't enumerable as a capturable window).
     */
    listDisplays: (): Promise<Array<{ id: number; width: number; height: number; isPrimary: boolean }>> =>
        ipcRenderer.invoke('ocr:list-displays'),

    /**
     * Force OCR screen capture to always use this specific monitor, bypassing
     * automatic window-title detection's fallback (which otherwise defaults
     * to the primary display). Pass `null` to go back to automatic.
     */
    setCaptureDisplay: (id: number | null): void => ipcRenderer.send('settings:set-capture-display', id),

    /**
     * Arm or disarm the global hotkey for live scanning. While armed, each
     * hotkey press captures + OCR-scans; while disarmed, the hotkey is a
     * no-op. `scanType` is required when arming (ignored when disarming).
     */
    setScannerActive: (active: boolean, scanType?: string): void => ipcRenderer.send('scanner:set-active', active, scanType),

    /**
     * Show a save-file dialog and write the provided content.
     * @param defaultName Default filename to suggest.
     * @param content File content to write.
     * @returns The saved file path, or null if cancelled.
     */
    saveJsonFile: (defaultName: string, content: string): Promise<string | null> =>
        ipcRenderer.invoke('dialog:saveFile', defaultName, content),

    /** Open a JSON file and return its path + contents (null if cancelled). */
    openJsonFile: (): Promise<{ path: string; content: string } | null> =>
        ipcRenderer.invoke('dialog:openJson'),

    /** The running application version. */
    getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),

    /** Opens the app's log folder in the OS file browser (for sharing `main.log` when troubleshooting). Returns the log file's path. */
    openLogsFolder: (): Promise<string> => ipcRenderer.invoke('app:open-logs-folder'),

    /** Frameless window controls for the custom titlebar. */
    windowMinimize: (): void => ipcRenderer.send('window:minimize'),
    windowMaximize: (): void => ipcRenderer.send('window:maximize'),
    windowClose: (): void => ipcRenderer.send('window:close'),

    // ─────────────────────────────────────────────────────────────────────
    // Durable user-data storage (inventory, saved builds, scan history).
    // Backed by a JSON file in userData; survives restarts.
    // ─────────────────────────────────────────────────────────────────────
    storageGet: <T = unknown>(key: string, fallback?: T): Promise<T> =>
        ipcRenderer.invoke('storage:get', key, fallback),
    storageSet: (key: string, value: unknown): Promise<boolean> =>
        ipcRenderer.invoke('storage:set', key, value),
    storageDelete: (key: string): Promise<boolean> =>
        ipcRenderer.invoke('storage:delete', key),
    storageKeys: (): Promise<string[]> => ipcRenderer.invoke('storage:keys'),
    storageGetAll: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('storage:getAll'),

    /**
     * Subscribe to a kernel event broadcast from the main process.
     *
     * @param event The event name (e.g. "module:ocr-scanner:loaded").
     * @param handler Callback invoked with the event payload.
     * @returns Unsubscribe function.
     */
    on: (event: string, handler: (payload: unknown) => void): Unsubscribe => {
        // WHY: ipcRenderer.on returns the listener wrapper, but we wrap it in
        // our own unsubscribe to keep the renderer decoupled from Electron's API.
        const listener = (_e: IpcRendererEvent, payload: unknown): void => handler(payload);
        ipcRenderer.on(event, listener);
        return () => ipcRenderer.removeListener(event, listener);
    },

    // ─────────────────────────────────────────────────────────────────────
    // Update notifications
    //
    // The renderer subscribes to these to surface "update available" UI.
    // Events are forwarded from `electron-updater` (app) and the
    // `update-checker` module (game-definition packages).
    // ─────────────────────────────────────────────────────────────────────

    /**
     * App update is being checked.
     */
    onAppUpdateChecking: (handler: () => void): Unsubscribe => {
        const listener = (): void => handler();
        ipcRenderer.on('app:update-status', listener);
        return () => ipcRenderer.removeListener('app:update-status', listener);
    },

    /**
     * A new app version is available and is being downloaded.
     */
    onAppUpdateAvailable: (handler: (info: { version: string; releaseDate?: string }) => void): Unsubscribe => {
        const listener = (_e: IpcRendererEvent, payload: { version: string; releaseDate?: string }): void => handler(payload);
        ipcRenderer.on('app:update-available', listener);
        return () => ipcRenderer.removeListener('app:update-available', listener);
    },

    /**
     * App is up-to-date.
     */
    onAppUpdateUpToDate: (handler: (info: { version: string }) => void): Unsubscribe => {
        const listener = (_e: IpcRendererEvent, payload: { kind: string; version?: string }): void => {
            if (payload?.kind === 'up-to-date' && payload.version) handler({ version: payload.version });
        };
        ipcRenderer.on('app:update-status', listener);
        return () => ipcRenderer.removeListener('app:update-status', listener);
    },

    /**
     * Download progress (0-100).
     */
    onAppUpdateProgress: (handler: (progress: { percent: number; transferred: number; total: number }) => void): Unsubscribe => {
        const listener = (_e: IpcRendererEvent, payload: { percent: number; transferred: number; total: number }): void => handler(payload);
        ipcRenderer.on('app:update-progress', listener);
        return () => ipcRenderer.removeListener('app:update-progress', listener);
    },

    /**
     * App update downloaded and ready to install on next launch.
     */
    onAppUpdateDownloaded: (handler: (info: { version: string; releaseDate?: string }) => void): Unsubscribe => {
        const listener = (_e: IpcRendererEvent, payload: { version: string; releaseDate?: string }): void => handler(payload);
        ipcRenderer.on('app:update-downloaded', listener);
        return () => ipcRenderer.removeListener('app:update-downloaded', listener);
    },

    /**
     * Install a downloaded update and restart the app.
     */
    installAppUpdate: (): void => {
        // Forwarded from main; see `ipcMain.handle('app:install-update')`.
        ipcRenderer.send('app:install-update');
    },

    /**
     * A game-definition package has an update available.
     */
    onGameUpdateAvailable: (handler: (info: {
        id: string;
        displayName: string;
        localVersion: string;
        remoteVersion: string;
        downloadUrl: string;
        releaseNotes?: string;
    }) => void): Unsubscribe => {
        const listener = (_e: IpcRendererEvent, payload: {
            id: string;
            displayName: string;
            localVersion: string;
            remoteVersion: string;
            downloadUrl: string;
            releaseNotes?: string;
        }): void => handler(payload);
        ipcRenderer.on('update-checker:game-update-available', listener);
        return () => ipcRenderer.removeListener('update-checker:game-update-available', listener);
    },

    /**
     * A game-definition package requires a newer app than is currently running.
     */
    onGameUpdateIncompatible: (handler: (info: {
        id: string;
        displayName: string;
        requiredAppVersion: string;
        runningAppVersion: string;
    }) => void): Unsubscribe => {
        const listener = (_e: IpcRendererEvent, payload: {
            id: string;
            displayName: string;
            requiredAppVersion: string;
            runningAppVersion: string;
        }): void => handler(payload);
        ipcRenderer.on('update-checker:game-incompatible', listener);
        return () => ipcRenderer.removeListener('update-checker:game-incompatible', listener);
    },

    /**
     * Trigger a manual game-update check.
     */
    checkGameUpdatesNow: (): Promise<{ ok: boolean; checked: number }> =>
        ipcRenderer.invoke('update-checker:check-now'),

    /**
     * Get UI option lists (characters, sets, weapons, elements) for the
     * currently active game. Used to populate dropdowns when the game
     * changes without hardcoding any game-specific vocabulary.
     */
    getGameOptions: (): Promise<{
        characters: Array<{ value: string; label: string }>;
        setNames: string[];
        weaponTypes: string[];
        elements: string[];
    } | null> => ipcRenderer.invoke('game-loader:get-options'),

    /** List installed games from the game-loader module. */
    getGames: (): Promise<Array<{ id: string; displayName: string; version: string; description?: string }>> =>
        ipcRenderer.invoke('game-loader:list-installed'),
    /** The currently active game (id + definition) per the kernel. */
    getActiveGame: (): Promise<{ id: string | null } | null> =>
        ipcRenderer.invoke('game-loader:get-active'),
    /** Switch the active game in the backend (persisted). */
    setActiveGame: (id: string): Promise<{ ok: boolean; id?: string; error?: string }> =>
        ipcRenderer.invoke('game-loader:set-active', id),
    /**
     * The full renderer-ready UI data bundle (roster, skills, stat catalog,
     * gear, enemies, buffs, passives) for a game — active game if id omitted.
     * The renderer's single source of truth for game data.
     */
    getGameBundle: (id?: string): Promise<unknown | null> =>
        ipcRenderer.invoke('game-loader:get-bundle', id),

    /** Enable/disable a feature module in the kernel. */
    enableModule: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('kernel:module-enable', id),
    disableModule: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('kernel:module-disable', id),

    /**
     * Run an update check (game-definition modules + the app's own GitHub repo).
     * `opts.appRepo` is "owner/name"; `opts.manifestUrl` points at the remote
     * game-definitions manifest. Returns the full status (app + games).
     */
    checkUpdates: (opts?: { manifestUrl?: string; appRepo?: string }): Promise<unknown | null> =>
        ipcRenderer.invoke('update-checker:check-now', opts),
    /** The cached update status without triggering a network check. */
    getUpdateStatus: (): Promise<unknown | null> =>
        ipcRenderer.invoke('update-checker:get-status'),

    /** Open an http(s) URL in the user's default browser. */
    openExternal: (url: string): void => { ipcRenderer.send('shell:open-external', url); },

    /** List the `.zip` game-package assets on a GitHub repo's latest release ("owner/name" or full URL). */
    listGamePackagesFromRepo: (repo: string): Promise<{ releaseTag?: string; packages?: Array<{ id: string; name: string; downloadUrl: string; size: number; alreadyInstalled: boolean }>; error?: string }> =>
        ipcRenderer.invoke('game-package:list-from-repo', repo),
    /** Download + install one game package asset into `<userData>/game-modules/<id>/`. */
    installGamePackage: (id: string, downloadUrl: string): Promise<{ installed?: boolean; needsRestart?: boolean; loaded?: string[]; error?: string }> =>
        ipcRenderer.invoke('game-package:install', { id, downloadUrl }),
    /** Relaunch the app (e.g. after installing an update to an already-loaded game package). */
    restartApp: (): Promise<void> => ipcRenderer.invoke('app:restart'),

    /**
     * Run loadout optimization on the backend engine. `payload` is
     * `{ character, pool, config }`; returns `{ ok, loadouts }` or null if the
     * module is unavailable (the renderer then optimizes client-side).
     */
    optimizeBuild: (payload: unknown): Promise<{ ok: boolean; loadouts: unknown[] } | null> =>
        ipcRenderer.invoke('damage:optimize', payload),

    // ─────────────────────────────────────────────────────────────────────
    // Generic module UI contract
    //
    // The renderer is game-agnostic: it asks the kernel "what UI does this
    // module expose?" and "run this action for me". Game-specific modules
    // (WuWa, Genshin, …) implement the same contract; the renderer doesn't
    // need to know which game is active.
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Get the UI specification for a module (fields, actions, outputs).
     * Returns null if the module doesn't expose a UI contract.
     */
    getModuleUI: (moduleId: string): Promise<{
        fields: Array<{
            id: string; label: string; type: string;
            required?: boolean; default?: unknown;
            options?: Array<{ value: string; label: string }>;
            placeholder?: string; min?: number; max?: number; step?: number;
            description?: string; source?: string;
        }>;
        actions: Array<{
            id: string; label: string;
            description?: string; style?: 'primary' | 'secondary' | 'danger' | 'ghost';
            requiresFields?: string[]; confirmMessage?: string;
        }>;
        outputs: Array<{
            id: string; label: string;
            kind: 'table' | 'stat' | 'list' | 'chart' | 'json' | 'image';
            description?: string;
        }>;
    } | null> => ipcRenderer.invoke('kernel:module-ui', moduleId),

    /**
     * Execute a module action with the given field values.
     * The action implementation lives in the kernel / module backend; the
     * renderer doesn't need to know the game-specific math.
     */
    executeModuleAction: (moduleId: string, actionId: string, values: Record<string, unknown>): Promise<unknown> =>
        ipcRenderer.invoke('kernel:module-execute', moduleId, actionId, values),

    /**
     * Get the most recent output for a given module output channel.
     * Useful for restoring state on panel mount.
     */
    getModuleOutput: (moduleId: string, outputId: string): Promise<unknown> =>
        ipcRenderer.invoke('kernel:module-output', moduleId, outputId),
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Bridge Exposure
// ────────────────────────────────────────────────────────────────────────────

/**
 * WHY `contextBridge.exposeInMainWorld`:
 *   - Works under sandbox: true (the only safe API).
 *   - Hides the raw `ipcRenderer` object from the renderer; only the typed
 *     methods above are visible on `window.frequencyManager`.
 *   - Prevents prototype-pollution attacks: the bridge freezes the exposed
 *     object so the renderer cannot mutate it.
 */
contextBridge.exposeInMainWorld('frequencyManager', Object.freeze(frequencyManagerApi));

/**
 * Type augmentation so TypeScript consumers (renderer code) get full IntelliSense
 * for `window.frequencyManager`.
 */
export type FrequencyManagerApi = typeof frequencyManagerApi;