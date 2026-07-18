/**
 * @fileoverview Electron Main Process Entry Point
 * @module src/main/electron-main
 * 
 * This is the Electron main process entry point. It creates the browser window
 * and initializes the application kernel.
 * 
 * @packageDocumentation
 */

import type { NativeImage } from 'electron';
import { app, BrowserWindow, ipcMain, dialog, shell, Notification, protocol, net, desktopCapturer, globalShortcut, screen, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import electronLog from 'electron-log/main';
import type { Kernel } from '@core/kernel';
import { createKernel } from '@core/kernel';
import { StructuredLogger } from '@core/kernel';
import { FileStorage } from '@core/storage';
import type { UpdateInfo, ProgressInfo } from 'electron-updater';
import { autoUpdater } from 'electron-updater';
import { initExternalGameModules, getExternalIconsDir, hasGameDefinition } from '@adapters/game-definitions';
import AdmZip from 'adm-zip';

// `StructuredLogger` (used everywhere, including deep in core/modules) only
// ever calls `console.*` — which for a packaged app launched normally (not
// from a terminal) goes nowhere the user can retrieve. Redirecting `console`
// through electron-log makes every existing log call ALSO persist to a real
// file (default: `%APPDATA%\frequency-manager\logs\main.log`) with zero
// changes needed anywhere else. Must happen before anything else logs.
electronLog.initialize();
Object.assign(console, electronLog.functions);

let mainWindow: BrowserWindow | null = null;
let kernel: Kernel | null = null;
let storage: FileStorage | null = null;
const logger = new StructuredLogger('electron-main');

// Custom scheme that serves per-game icon art (characters, weapons, gear,
// enemies, …). Must be registered as privileged BEFORE the app is ready.
protocol.registerSchemesAsPrivileged([
    { scheme: 'fm-icon', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/**
 * Serve `fm-icon://<gameId>/<relative/path.png>` from the active game
 * package's own `icons/` folder (see `getExternalIconsDir`,
 * `shared/game-data/external-loader.ts`) — the app has zero games compiled
 * in, so this is the ONLY icon source; a loose top-level `game-modules/*.json`
 * community module has no icons directory at all and always 404s here.
 * Missing files simply 404 → the renderer's <img> onError falls back to a
 * placeholder, so this works before any art is added.
 *
 * `rel` (the URL path, e.g. `icons/characters/hero.png`) is relative to the
 * game PACKAGE root, but `getExternalIconsDir` already points AT the
 * `icons/` folder itself — joining them directly would double up the
 * `icons/` segment, so the leading one is stripped from `rel` first.
 */
function setupIconProtocol(): void {
    protocol.handle('fm-icon', async (request) => {
        try {
            const url = new URL(request.url);
            const gameId = url.hostname;
            const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
            if (!gameId || rel.includes('..')) return new Response('bad request', { status: 400 });

            const iconsDir = getExternalIconsDir(gameId);
            if (iconsDir) {
                const relInsideIconsDir = rel.replace(/^icons[\\/]/, '');
                const iconPath = path.join(iconsDir, relInsideIconsDir);
                if (iconPath.startsWith(iconsDir) && fs.existsSync(iconPath)) {
                    return net.fetch(pathToFileURL(iconPath).toString());
                }
            }

            return new Response('not found', { status: 404 });
        } catch {
            return new Response('error', { status: 500 });
        }
    });
}

/**
 * Create the main browser window
 */
function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        frame: false,
        webPreferences: {
            // __dirname is dist/src/main at runtime; the compiled preload lives
            // in dist/src/preload (tsc mirrors the src/ tree), NOT alongside this
            // file. A wrong path here silently fails to expose window.frequencyManager,
            // which crashes the renderer and blanks the window.
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        titleBarStyle: 'hidden',
        show: false,
    });

    // Load the renderer
    if (process.env.NODE_ENV === 'development') {
        void mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // Production: Vite builds the renderer into dist/renderer/
        // __dirname is dist/src/main/ so we go up two levels to dist/
        void mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: 'deny' };
    });
}

/**
 * Initialize the kernel
 */
async function initializeKernel(): Promise<void> {
    try {
        kernel = await createKernel({
            logLevel: 'info',
            modulePaths: ['./modules'],
            hotReload: process.env.NODE_ENV === 'development',
        });

        logger.info('Kernel initialized in Electron main process');

        // Expose kernel health check via IPC
        ipcMain.handle('kernel:health', async () => {
            if (!kernel) return { status: 'unhealthy', error: 'Kernel not initialized' };
            return await kernel.healthCheck();
        });

        // Expose module list via IPC
        ipcMain.handle('kernel:modules', () => {
            if (!kernel) return [];
            return kernel.moduleRegistry.getAll().map(m => ({
                id: m.moduleId,
                name: m.manifest.displayName,
                version: m.manifest.version,
                health: m.health,
                enabled: m.manifest.enabledByDefault !== false,
                description: m.manifest.description,
            }));
        });

        // Expose OCR scan via IPC — thin wrapper over the shared `runOcrScan`
        // helper so the global-hotkey capture flow (below) can trigger the
        // exact same scan without duplicating this correlation/timeout logic.
        // Always resolves (never rejects) so failure detail like `rawText`
        // survives the IPC round-trip — see `OcrScanResult` in preload.ts.
        ipcMain.handle('ocr:scan', async (_event, imagePath: string) => {
            const result = await runOcrScan(imagePath);
            return result.success
                ? { success: true, echo: result.echo }
                : { success: false, error: result.error, rawText: result.rawText };
        });

        // Expose damage calculation via IPC

        // Forward update-checker events from the kernel EventBus to the renderer.
        // WHY: The kernel publishes them so any module can subscribe, but the
        // renderer can only see IPC. We bridge here.
        kernel.eventBus.subscribe('update-checker:game-update-available', (msg) => {
            mainWindow?.webContents.send('update-checker:game-update-available', msg.payload);
        });
        kernel.eventBus.subscribe('update-checker:game-incompatible', (msg) => {
            mainWindow?.webContents.send('update-checker:game-incompatible', msg.payload);
        });
        kernel.eventBus.subscribe('update-checker:check-complete', (msg) => {
            mainWindow?.webContents.send('update-checker:check-complete', msg.payload);
        });

        // (The `update-checker:check-now` / `:get-status` IPC handlers are
        // registered below, near the game-loader bridges, with the richer
        // status contract.)

        // Renderer asks main to install the downloaded update and quit.
        ipcMain.on('app:install-update', () => {
            if (process.env.NODE_ENV !== 'development') {
                void autoUpdater.quitAndInstall();
            }
        });

        // ── Game loader bridges (game switching, installed list, options) ──
        // A game switch re-injects the GameDefinition and publishes
        // game:reload-request; forward that to the renderer so useGameUI refreshes.
        kernel.eventBus.subscribe('game:reload-request', (msg) => {
            mainWindow?.webContents.send('game:reload-request', msg.payload);
        });

        const gameRpc = async (type: string, payload: unknown, fallback: unknown) => {
            if (!kernel) return fallback;
            try { return await kernel.eventBus.request('game-loader', type, payload); }
            catch (err) { logger.warn(`[game-loader] ${type} failed`, { error: (err as Error).message }); return fallback; }
        };
        ipcMain.handle('game-loader:get-options', () => gameRpc('game:get-options', {}, null));
        ipcMain.handle('game-loader:list-installed', () => gameRpc('game:list-installed', {}, []));
        ipcMain.handle('game-loader:get-active', () => gameRpc('game:get-active', {}, null));
        ipcMain.handle('game-loader:get-bundle', (_e, id?: string) => gameRpc('game:get-bundle', { id }, null));
        ipcMain.handle('game-loader:set-active', async (_e, id: string) => {
            const res = await gameRpc('game:set-active', { id }, { ok: false });
            if ((res as { ok?: boolean })?.ok) storage?.set('activeGame', id); // persist the choice
            return res;
        });

        // ── Update checker ──
        // Runs the game-module + app-repo update check. The renderer supplies
        // the sources (manifest URL, GitHub repo); we inject the real running
        // app version so the app-release comparison is accurate.
        ipcMain.handle('update-checker:check-now', async (_e, opts?: { manifestUrl?: string; appRepo?: string }) => {
            if (!kernel) return null;
            try {
                return await kernel.eventBus.request('update-checker', 'update-checker:check-now', {
                    ...(opts ?? {}),
                    currentAppVersion: app.getVersion(),
                });
            } catch (err) {
                logger.warn('[update-checker] check-now failed', { error: (err as Error).message });
                return null;
            }
        });
        ipcMain.handle('update-checker:get-status', async () => {
            if (!kernel) return null;
            try { return await kernel.eventBus.request('update-checker', 'update-checker:get-cache', {}); }
            catch { return null; }
        });

        // Open external links (release pages) in the default browser. Only
        // http(s) is allowed — never file:// or app-relative URLs.
        ipcMain.on('shell:open-external', (_e, url: string) => {
            if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
                void shell.openExternal(url);
            }
        });

        // ── Module enable/disable ──
        ipcMain.handle('kernel:module-enable', (_e, id: string) => {
            try { kernel?.moduleRegistry.setHealth(id, 'healthy'); return { ok: true }; }
            catch (err) { return { ok: false, error: (err as Error).message }; }
        });
        ipcMain.handle('kernel:module-disable', (_e, id: string) => {
            try { kernel?.moduleRegistry.setHealth(id, 'unloaded'); return { ok: true }; }
            catch (err) { return { ok: false, error: (err as Error).message }; }
        });

        // ──────────────────────────────────────────────────────────────────
        // Generic module UI contract
        //
        // The renderer asks the kernel for the UI spec / output / action
        // execution of any module — game-agnostic. The kernel can answer
        // directly via the event bus by publishing a `module-ui:*` event
        // with the right correlationId, or by routing to a specific module
        // implementation. We provide safe defaults so modules that don't
        // implement the contract still get a working UI from the renderer.
        // ──────────────────────────────────────────────────────────────────

        ipcMain.handle('kernel:module-ui', async (_event, moduleId: string) => {
            if (!kernel) return null;
            // Try to ask the module directly via a request/reply pattern.
            try {
                const spec = await kernel.eventBus.request<{ moduleId: string }, unknown>(
                    moduleId,
                    'module:ui-spec',
                    { moduleId },
                );
                return spec ?? null;
            } catch {
                // Module didn't implement the contract — renderer falls back to its defaults.
                return null;
            }
        });

        ipcMain.handle('kernel:module-execute', async (_event, moduleId: string, actionId: string, values: unknown) => {
            if (!kernel) throw new Error('Kernel not initialized');
            // Use the kernel RPC (fast, reliable) with a MODULE-SCOPED request
            // type. Handlers are keyed globally by type, so a generic
            // `module:execute` couldn't distinguish modules — `${moduleId}:execute`
            // gives each module its own type. A module that hasn't implemented the
            // contract fast-rejects with NO_HANDLER; we surface `__unhandled` so
            // the renderer falls back to its mock behavior instead of hanging.
            try {
                return await kernel.eventBus.request(
                    moduleId,
                    `${moduleId}:execute`,
                    { actionId, values },
                );
            } catch (err) {
                logger.debug(`[module-execute] ${moduleId}.${actionId} unhandled, renderer will mock`, { error: (err as Error).message });
                return { __unhandled: true };
            }
        });

        ipcMain.handle('kernel:module-output', async (_event, moduleId: string, outputId: string) => {
            if (!kernel) return null;
            try {
                const data = await kernel.eventBus.request<{ moduleId: string; outputId: string }, unknown>(
                    moduleId,
                    'module:output',
                    { moduleId, outputId },
                );
                return data ?? null;
            } catch {
                return null;
            }
        });

        // Game-agnostic loadout optimization via the shared engine in the
        // damage-calculator module. Fast RPC; the renderer falls back to its
        // own (identical) client-side optimizer if this returns null.
        ipcMain.handle('damage:optimize', async (_event, payload: unknown) => {
            if (!kernel) return null;
            try {
                return await kernel.eventBus.request('damage-calculator', 'damage-calculator:optimize', payload);
            } catch (err) {
                logger.warn('[damage-calculator] optimize failed', { error: (err as Error).message });
                return null;
            }
        });

        ipcMain.handle('damage:calculate', async (_event, request: unknown) => {
            if (!kernel) throw new Error('Kernel not initialized');
            const correlationId = `ipc-${Date.now()}`;
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Damage calculation timeout')), 30000);
                kernel!.eventBus.subscribe('damage:calculated', (msg) => {
                    if (msg.correlationId === correlationId) {
                        clearTimeout(timeout);
                        resolve(msg.payload);
                    }
                }, { once: true });
                kernel!.eventBus.subscribe('damage:calculation-failed', (msg) => {
                    if (msg.correlationId === correlationId) {
                        clearTimeout(timeout);
                        reject(new Error((msg.payload as { error: string }).error));
                    }
                }, { once: true });
                void kernel!.eventBus.publish('damage:calculate-request', request, { source: 'electron', correlationId });
            });
        });

        // Apply the persisted active-game choice so a game switch survives restarts.
        const persistedGame = storage?.get<string>('activeGame');
        logger.info('Persisted active game on boot', { persistedGame });
        if (persistedGame) {
            void kernel.eventBus.request('game-loader', 'game:set-active', { id: persistedGame })
                .catch((err) => logger.warn('Failed to apply persisted game', { error: (err as Error).message }));
        }

    } catch (error) {
        logger.error('Failed to initialize kernel', { error: (error as Error).message });
        throw error;
    }
}

/**
 * Durable user-data storage (scanned gear, inventory, saved builds, scan history)
 * backed by a JSON file under Electron's userData dir, exposed to the renderer
 * over IPC. Distinct from kernel config (ephemeral) and the game database (static).
 */
function setupStorage(): void {
    storage = new FileStorage(app.getPath('userData'));
    logger.info('User storage ready', { file: storage.filePath });

    ipcMain.handle('storage:get', (_e, key: string, fallback: unknown) => storage?.get(key, fallback) ?? fallback ?? null);
    ipcMain.handle('storage:set', (_e, key: string, value: unknown) => { storage?.set(key, value); return true; });
    ipcMain.handle('storage:delete', (_e, key: string) => { storage?.delete(key); return true; });
    ipcMain.handle('storage:keys', () => storage?.keys() ?? []);
    ipcMain.handle('storage:getAll', () => storage?.getAll() ?? {});
}

/**
 * Scans the user-writable `game-modules` folder for community-authored game
 * JSON files and registers the valid ones — see `docs/GAME_MODULES.md` for
 * the file format. MUST run before `initializeKernel()`: the game-loader
 * module resolves the active game during kernel boot, so any external game
 * needs to already be in the registry by then. Creates the folder if it
 * doesn't exist yet, so there's always somewhere for a user to drop a file.
 */
function loadExternalGameModules(): void {
    const dir = path.join(app.getPath('userData'), 'game-modules');
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        logger.warn('Could not create game-modules directory', { dir, error: err instanceof Error ? err.message : String(err) });
        return;
    }
    const { loaded, errors } = initExternalGameModules(dir);
    if (loaded.length > 0) {
        logger.info('Loaded external game module(s)', { dir, loaded });
    }
    for (const e of errors) {
        logger.warn('Skipped an external game module file', e);
    }
}

/**
 * Frameless window controls (min / max-restore / close) for the custom titlebar.
 */
/** GitHub "owner/name" (or full URL) -> {owner, name}, same accepted shapes as the update-checker's app-repo field. */
function parseRepo(repo: string): { owner: string; name: string } | null {
    const m = repo.trim().match(/(?:github\.com\/)?([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
    return m ? { owner: m[1], name: m[2] } : null;
}

/**
 * Lets a user install game packages straight from a GitHub repo's releases —
 * no separate manifest.json to host. Two IPC handlers:
 *   - `game-package:list-from-repo`: lists the latest release's `.zip` assets.
 *   - `game-package:install`: downloads one asset and extracts it into
 *     `<userData>/game-modules/<id>/`, the same user-writable directory
 *     `initExternalGameModules` already scans (see `docs/GAME_MODULES.md`).
 * A brand-new game (not already registered) is picked up immediately by
 * re-running `initExternalGameModules` — no restart needed. Updating an
 * ALREADY-installed game's files on disk still needs a restart, since the
 * in-memory registry doesn't support hot-replacing an existing entry.
 */
/** The subset of GitHub's release API response this file actually reads. */
interface GitHubReleaseResponse {
    tag_name?: string;
    assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
}

function setupGamePackageInstaller(): void {
    ipcMain.handle('game-package:list-from-repo', async (_e, repo: string) => {
        const parsed = parseRepo(repo);
        if (!parsed) return { error: `Invalid repo "${repo}" (expected owner/name)` };
        try {
            const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.name}/releases/latest`, {
                headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FrequencyManager' },
            });
            if (!res.ok) return { error: `GitHub HTTP ${res.status}` };
            const release = await res.json() as GitHubReleaseResponse;
            const assets = Array.isArray(release.assets) ? release.assets : [];
            const packages = assets
                .filter((a): a is { name: string; browser_download_url?: string; size?: number } =>
                    typeof a.name === 'string' && a.name.toLowerCase().endsWith('.zip'))
                .map((a) => ({
                    id: a.name.replace(/\.zip$/i, ''),
                    name: a.name,
                    downloadUrl: a.browser_download_url ?? '',
                    size: a.size ?? 0,
                    alreadyInstalled: hasGameDefinition(a.name.replace(/\.zip$/i, '')),
                }));
            return { releaseTag: typeof release.tag_name === 'string' ? release.tag_name : undefined, packages };
        } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('game-package:install', async (_e, { id, downloadUrl }: { id: string; downloadUrl: string }) => {
        try {
            const res = await fetch(downloadUrl);
            if (!res.ok) return { error: `Download HTTP ${res.status}` };
            const buf = Buffer.from(await res.arrayBuffer());

            const wasInstalled = hasGameDefinition(id);
            const gameModulesDir = path.join(app.getPath('userData'), 'game-modules');
            const targetDir = path.join(gameModulesDir, id);
            fs.rmSync(targetDir, { recursive: true, force: true });

            // Official package zips (build-game-package.js) deliberately wrap
            // their contents in a single "<id>/" top-level folder, so a user
            // manually extracting one into game-modules/ with Explorer/7-Zip
            // gets the correct game-modules/<id>/module.json shape with no
            // extra steps (see that script's own doc comment). Extracting
            // straight into targetDir (already named .../game-modules/<id>)
            // would double-nest the wrapper to .../game-modules/<id>/<id>/...
            // — detect that shape and extract to the PARENT dir instead, so
            // the wrapper produces targetDir itself. A community package
            // zipped WITHOUT a wrapping folder (module.json at the zip root)
            // still extracts straight into targetDir, same as before.
            const zip = new AdmZip(buf);
            // build-game-package.js zips via PowerShell's Compress-Archive,
            // which stores entry paths with BACKSLASH separators
            // ("wuthering-waves\module.json", not the zip-spec-standard
            // forward slash) — AdmZip's own extractAllTo already tolerates
            // this (that's *why* the old code's naive extraction produced
            // the double-nested folder bug in the first place: it WAS
            // interpreting the backslash as a path separator), so detection
            // has to handle both separators the same way, not just '/'.
            const topLevelNames = new Set(zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/').split('/')[0]));
            const isWrapped = topLevelNames.size === 1 && topLevelNames.has(id);
            if (isWrapped) {
                fs.mkdirSync(gameModulesDir, { recursive: true });
                zip.extractAllTo(gameModulesDir, true);
            } else {
                fs.mkdirSync(targetDir, { recursive: true });
                zip.extractAllTo(targetDir, true);
            }

            if (!wasInstalled) {
                // Brand-new game — pick it up immediately, no restart needed.
                const { loaded, errors } = initExternalGameModules(path.join(app.getPath('userData'), 'game-modules'));
                if (errors.some((e) => e.file.includes(id))) {
                    return { error: errors.find((e) => e.file.includes(id))?.error ?? 'Failed to load the installed package' };
                }
                return { installed: true, needsRestart: false, loaded };
            }
            // Already-registered game — the in-memory registry can't hot-replace
            // an existing entry, so the new files on disk need a restart to load.
            return { installed: true, needsRestart: true };
        } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
        }
    });

    ipcMain.handle('app:restart', () => {
        app.relaunch();
        app.exit(0);
    });
}

function setupWindowControls(): void {
    ipcMain.on('window:minimize', () => mainWindow?.minimize());
    ipcMain.on('window:maximize', () => {
        if (!mainWindow) return;
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    });
    ipcMain.on('window:close', () => mainWindow?.close());
}

/**
 * Run an OCR scan on an image file through the kernel's `ocr-scanner` module
 * and resolve with a structured `{success, ...}` result — success OR failure
 * both resolve (never reject) specifically so failure detail (`rawText`, the
 * raw Tesseract output even on a rejected/low-confidence scan) survives the
 * IPC round-trip: Electron's `ipcMain.handle` rejection path only reliably
 * forwards an Error's `.message` to the renderer, silently dropping any
 * custom properties attached to it. Shared by the `ocr:scan` IPC handler and
 * the global-hotkey capture flow so there's exactly one place that knows how
 * to talk to the module.
 */
function runOcrScan(imagePath: string): Promise<{ success: boolean; echo?: unknown; error?: string; rawText?: string }> {
    if (!kernel) return Promise.resolve({ success: false, error: 'Kernel not initialized' });
    const correlationId = `ipc-${Date.now()}`;
    return new Promise((resolve) => {
        // Whichever branch settles this promise is done reading `imagePath` —
        // release our half of the temp-file reference count regardless of
        // which one fires (success or failure).
        const settle = (result: { success: boolean; echo?: unknown; error?: string; rawText?: string }) => {
            releaseTempScanFile(imagePath);
            resolve(result);
        };
        // ponytail: no ceiling here on purpose (removed 2026-07-18, user
        // request) — a fixed timeout was firing mid-session on slower
        // machines ("OCR scan timeout") even though the scan just needed
        // more time, which read as the scanner randomly dying. The renderer's
        // Stop button already soft-cancels (bumps its own token and discards
        // whatever arrives late), so the user's real "stop" control already
        // exists; this promise just waits for a real result. If Tesseract
        // truly hangs forever, add a much longer ceiling back — not one this
        // tight.
        kernel!.eventBus.subscribe('echo:scanned', (msg) => {
            if (msg.correlationId === correlationId) {
                const payload = msg.payload as { echo: unknown; source: string };
                settle({ success: true, echo: payload.echo });
            }
        }, { once: true });
        kernel!.eventBus.subscribe('echo:scan-failed', (msg) => {
            if (msg.correlationId === correlationId) {
                const payload = msg.payload as { error: string; rawText?: string };
                settle({ success: false, error: payload.error, rawText: payload.rawText });
            }
        }, { once: true });
        void kernel!.eventBus.publish('ocr:scan-request', { imagePath }, { source: 'electron', correlationId });
    });
}

interface CropRect { x: number; y: number; width: number; height: number }

// Fractional (0-1) crop regions per scan type, applied BEFORE upscaling. Each
// scan type maps to an ORDERED LIST of regions, stacked vertically into one
// composite image before OCR runs (see `stitchVertically`).
//
// Calibrated against real 1920x1080 screenshots of the Resonator's echo-slot
// detail panel (not the Echo Management grid list): name/level/cost/icon row
// + full stat list sits at roughly x=1505-1860, y=95-490. Below that,
// "Echo Skill" (full ability description) and "Sonata Effect" render at
// VARIABLE height depending on the echo (some descriptions run several
// lines longer than others) — including that block would both feed a pile
// of irrelevant flavor text into OCR and, worse, there's no single fixed
// crop that reliably ends right after it for every echo. The "Equipped by
// <name>" row is unaffected by that variable height — it's pinned to a
// fixed footer position (~y=918-977) regardless of how long the skill text
// above it is, confirmed against four real screenshots with very different
// skill-description lengths. So: two fixed regions (top stat block, bottom
// footer row), skipping the variable middle entirely.
//
// x narrowed from 0.76 to 0.785 (confirmed against user-supplied close-up
// crops of the panel): every stat row has a small decorative bullet icon
// (a "+", or a stat-type glyph for the main stat) immediately to the left
// of its label, and the row right below Cost has a run of small button
// icons (lock/notes/etc) — neither carries any text OCR needs, and both
// were getting misread as garbage characters prefixed onto real labels
// (e.g. "HP" reading as "Fhe dt ©"). The right edge stays at the screen
// edge (1.0) since stat VALUES are right-aligned close to it — narrowing
// that side risks clipping real numbers. (A tighter 0.80/0.98/y=0.10
// variant was tried and reverted — see chat history 2026-07-12 if
// revisiting; kept here since it wasn't confirmed to actually help.)
//
// A third region (added 2026-07-13, user request) targets the Sonata-set
// filter chip in the TOP-LEFT of this same loadout screen (e.g. "Celestial
// Light ⌄") — the only place the game shows the currently-relevant Sonata
// set as plain, readable text at a FIXED position/height. The right panel's
// own "Sonata Effect" breakdown (further down, below "Echo Skill") also
// names the set, but sits in that same variable-height region already
// excluded above, so it can't be cropped reliably either — this chip is the
// dependable alternative. Once `setName` resolves from OCR text at all,
// `mapScannedEchoToGearDraft` already uses it directly ahead of any
// name-based set inference/ambiguity warning — no mapping-layer change
// needed, this region just gives that existing path something to find.
// Estimated from a single reference screenshot (2026-07-13, ~1920x1080),
// NOT yet confirmed against multiple real captures the way the two regions
// below were — unlike those, this one may need retuning after real use.
const SCAN_CROP_REGIONS: Record<string, CropRect[]> = {
    echoes: [
        { x: 0.10, y: 0.085, width: 0.22, height: 0.06 },
        // x widened 0.785 -> 0.77 (2026-07-14, user request): the previous
        // narrowing (0.76 -> 0.785, see the history above) traded too far —
        // it was cutting into real label characters on some stat rows, not
        // just the decorative bullet icons it was meant to exclude. Right
        // edge stays anchored at 1.0 (width grows to compensate) since stat
        // VALUES are right-aligned close to the screen edge.
        { x: 0.77, y: 0.08, width: 0.23, height: 0.38 },
        { x: 0.77, y: 0.85, width: 0.23, height: 0.055 },
    ],
};

/**
 * Stack multiple NativeImages into one, top to bottom. Used to combine
 * non-contiguous crop regions (e.g. a stat block and a footer row, skipping
 * variable-height content between them) into a single image OCR can run on
 * in one pass. Inputs may have DIFFERENT pixel widths — e.g. a full-width
 * filter-chip crop stacked above the narrower right-panel stat block — each
 * row is left-aligned onto a canvas as wide as the widest input, padded with
 * opaque black. `grayscaleAndInvert` (which always runs right after this)
 * turns that padding into plain white margin — harmless blank space for
 * Tesseract, not a dark mark that could read as stray text. When every
 * region already shares the same width (the original, still-common case)
 * this is equivalent to a straight concatenation.
 */
function stitchVertically(images: NativeImage[]): NativeImage {
    if (images.length === 1) return images[0];
    const maxWidth = Math.max(...images.map((img) => img.getSize().width));
    const totalHeight = images.reduce((sum, img) => sum + img.getSize().height, 0);
    const combined = Buffer.alloc(maxWidth * totalHeight * 4, 0);
    for (let i = 3; i < combined.length; i += 4) combined[i] = 255; // opaque alpha for padded pixels
    let rowOffset = 0;
    for (const img of images) {
        const { width, height } = img.getSize();
        const bitmap = img.toBitmap();
        const rowBytes = width * 4;
        for (let y = 0; y < height; y++) {
            const srcStart = y * rowBytes;
            const dstStart = (rowOffset + y) * maxWidth * 4;
            bitmap.copy(combined, dstStart, srcStart, srcStart + rowBytes);
        }
        rowOffset += height;
    }
    return nativeImage.createFromBitmap(combined, { width: maxWidth, height: totalHeight });
}

/**
 * Convert to grayscale and INVERT (light-text-on-dark -> dark-text-on-light)
 * before OCR. Tesseract's bundled English model is trained overwhelmingly on
 * documents with dark text on a light background; WW's UI is the opposite
 * (light/white stat text on a dark panel), which is a real, specific
 * mismatch with what the model expects — not just "more contrast is
 * generally better." No new dependency needed — same raw-bitmap technique
 * already used for `stitchVertically`. Format is platform-dependent per
 * Electron's docs; on Windows this is BGRA, but grayscale luminance only
 * needs to know which byte is which of R/G/B (order doesn't affect
 * inversion), and this is a targeted fix for a known, specific model
 * mismatch, not a general-purpose image filter that needs to be
 * pixel-format-perfect everywhere.
 */
function grayscaleAndInvert(image: NativeImage): NativeImage {
    const { width, height } = image.getSize();
    const bitmap = image.toBitmap();
    const out = Buffer.alloc(bitmap.length);
    for (let i = 0; i + 3 < bitmap.length; i += 4) {
        const b = bitmap[i];
        const g = bitmap[i + 1];
        const r = bitmap[i + 2];
        const a = bitmap[i + 3];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const inverted = 255 - luma;
        out[i] = inverted;
        out[i + 1] = inverted;
        out[i + 2] = inverted;
        out[i + 3] = a;
    }
    return nativeImage.createFromBitmap(out, { width, height });
}

/**
 * Apply the scan-type crop region(s) (if any), grayscale+invert, then
 * upscale a NativeImage, in that order — cropping first so later steps only
 * process the actual panel (not the whole, mostly irrelevant, source
 * image), grayscale+invert before upscaling so the resize algorithm
 * interpolates already-clean pixels. Shared by both the live screen-capture
 * path and the file-browse path so OCR accuracy doesn't depend on which one
 * was used.
 */
function applyCropAndUpscale(source: NativeImage, scanType?: string): NativeImage {
    let image = source;
    const regions = scanType ? SCAN_CROP_REGIONS[scanType] : undefined;
    if (regions && regions.length > 0) {
        const bounds = source.getSize();
        const crops = regions.map((r) => source.crop({
            x: Math.round(bounds.width * r.x),
            y: Math.round(bounds.height * r.y),
            width: Math.round(bounds.width * r.width),
            height: Math.round(bounds.height * r.height),
        }));
        image = stitchVertically(crops);
    }
    if (regions && regions.length > 0) {
        image = grayscaleAndInvert(image);
    }
    // Upscale before OCR — Tesseract's LSTM model has a "sweet spot" text
    // height it was trained on; small game-UI text is often well below that,
    // which hurts recognition of specific lines (not just overall confidence).
    // Bumped 1.5x -> 2.5x now that this only applies to the small, already-
    // cropped stat panel (not a full screen) — more pixels per character
    // costs a bit more OCR time but no longer means upscaling a huge image.
    const bounds = image.getSize();
    return image.resize({
        width: Math.round(bounds.width * 2.5),
        height: Math.round(bounds.height * 2.5),
        quality: 'best',
    });
}

/**
 * Reference-counts pending consumers of our OWN generated temp scan images —
 * the crop/upscale PNGs `captureScreen`/`processImageFile` write below (never
 * a user's own picked file, which is never registered here and so never
 * touched). Each one is read by exactly two consumers, `runOcrScan` (the OCR
 * pass) and the renderer's `fs:read-image-preview` fetch (the thumbnail) —
 * but the two run in a DIFFERENT order depending on the path: the hotkey flow
 * runs OCR first, in-process, before the renderer ever asks for a preview;
 * the browse flow has the renderer read the preview BEFORE calling
 * `scanImage`. Deleting on whichever finishes LAST (not a hardcoded "always
 * after OCR") is what makes cleanup correct for both orderings. Without this,
 * every scan (hotkey or browse) left a screenshot in the OS temp dir forever
 * — including full-screen captures that may contain unrelated on-screen
 * content, not just the cropped game panel.
 */
const tempScanFileRefs = new Map<string, number>();

function registerTempScanFile(filePath: string): void {
    tempScanFileRefs.set(filePath, 2);
}

function releaseTempScanFile(filePath: string): void {
    const remaining = tempScanFileRefs.get(filePath);
    if (remaining == null) return; // not one of ours — e.g. a user-picked file, left untouched
    if (remaining <= 1) {
        tempScanFileRefs.delete(filePath);
        fs.unlink(filePath, (err) => {
            if (err) logger.warn('[temp-scan-cleanup] delete failed', { filePath, error: err.message });
        });
    } else {
        tempScanFileRefs.set(filePath, remaining - 1);
    }
}

/**
 * Best-effort startup sweep for anything the reference-counted cleanup above
 * missed (e.g. the app was killed mid-scan, before both consumers ran) —
 * belt-and-suspenders, not the primary cleanup path. Only ever touches files
 * matching our own `fm-ocr-capture-`/`fm-ocr-processed-` naming convention in
 * the OS temp dir, and only ones old enough (1h+) that they can't possibly be
 * mid-scan right now.
 */
function sweepStaleTempScanFiles(): void {
    try {
        const dir = app.getPath('temp');
        const cutoff = Date.now() - 60 * 60 * 1000;
        for (const name of fs.readdirSync(dir)) {
            if (!/^fm-ocr-(capture|processed)-\d+\.png$/.test(name)) continue;
            const full = path.join(dir, name);
            const stat = fs.statSync(full, { throwIfNoEntry: false });
            if (stat && stat.mtimeMs < cutoff) fs.unlink(full, () => {});
        }
    } catch (err) {
        logger.warn('[temp-scan-cleanup] startup sweep failed', { error: (err as Error).message });
    }
}

/**
 * The currently active game's `id` + `ocr.windowTitleHint`, read live from the
 * game-loader module (NOT the `activeGame` storage key, which is only
 * written on an explicit switch and may be unset on a fresh install that's
 * only ever used its auto-resolved fallback game). Returns undefined pieces
 * when there's no active game or its module didn't declare a hint.
 */
async function getActiveGameCaptureTarget(): Promise<{ id?: string; windowTitleHint?: string }> {
    if (!kernel) return {};
    try {
        const active = await kernel.eventBus.request<Record<string, never>, { id: string | null; definition?: { displayName?: string; ocr?: { windowTitleHint?: string } } }>(
            'game-loader', 'game:get-active', {},
        );
        return {
            id: active?.id ?? undefined,
            windowTitleHint: active?.definition?.ocr?.windowTitleHint,
        };
    } catch (err) {
        logger.warn('[captureScreen] failed to read active game for window targeting', { error: (err as Error).message });
        return {};
    }
}

/**
 * Find the OS window whose title contains `titleHint` (case-insensitive),
 * at a resolution large enough to cover any connected display — this IS the
 * actual captured image, `desktopCapturer` doesn't need a separate capture
 * step once you have the right source. Returns null if no window matches
 * (the game isn't running, or its window was renamed/is in an unusual state).
 */
async function findGameWindowSource(titleHint: string): Promise<Electron.DesktopCapturerSource | null> {
    const displays = screen.getAllDisplays();
    const width = Math.max(1, ...displays.map((d) => Math.round(d.size.width * d.scaleFactor)));
    const height = Math.max(1, ...displays.map((d) => Math.round(d.size.height * d.scaleFactor)));
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width, height } });
    const needle = titleHint.toLowerCase();
    return sources.find((s) => s.name.toLowerCase().includes(needle)) ?? null;
}

/**
 * Set by `captureScreen()` on failure, cleared at the start of every call —
 * lets the hotkey handler surface a specific reason (e.g. "game window not
 * found") instead of a generic "capture failed", without changing
 * `captureScreen`'s return type (still `string | null`, matching the
 * existing preload/IPC contract other callers rely on).
 */
let lastCaptureFailureReason: string | null = null;

/**
 * User's explicit "always capture THIS monitor" override (Settings → Scanner
 * → Capture display), pushed from the renderer via `settings:set-capture-
 * display`. `null` means "auto" — rely on window-title matching, falling
 * back to the primary display. Exists because window-title matching can't
 * be made 100% reliable: many games (both of these included) default to
 * exclusive-fullscreen on some setups, where the OS may not enumerate them
 * as a capturable "window" at all (only as part of a screen), which no
 * amount of title-matching logic can work around. On a multi-monitor setup
 * where the auto-detected fallback (primary display) isn't where the game
 * actually runs, this override is the reliable fix.
 */
let configuredCaptureDisplayId: number | null = null;

/**
 * Capture a specific display in full (screen source, not a window source).
 *
 * Root-caused (2026-07-14, user diagnosis): a monitor set to 10 bpc output
 * color depth (or HDR) is silently DROPPED from `desktopCapturer`'s
 * `types: ['screen']` results entirely — Chromium's screen-duplication path
 * (DXGI) can't duplicate a 10-bit surface, and rather than erroring, Windows/
 * Chromium just omits that monitor from the capturable list. No
 * `display_id`/positional matching can work around a source that was never
 * returned at all — this is NOT the same failure mode as `display_id` being
 * merely unreliable (which the positional fallback below still legitimately
 * handles). Detected by comparing counts: if `desktopCapturer` returns FEWER
 * screen sources than `screen.getAllDisplays()` reports connected, at least
 * one monitor is excluded, and guessing a fallback source at that point risks
 * confidently capturing the WRONG monitor's content — worse than a clear,
 * actionable error telling the user how to actually fix it (their own fix:
 * NVIDIA Control Panel → Change Resolution → that monitor → Output color
 * depth → 8 bpc).
 *
 * Tries, in order:
 *   1. `display_id` exact match (the normal, reliable path).
 *   2. If a monitor is missing from the capturable list entirely (source
 *      count < display count): fail with a specific, actionable message
 *      instead of guessing.
 *   3. Positional match — ONLY valid when source count === display count
 *      (a pure `display_id`-unreliable ordering ambiguity, not a missing
 *      monitor) — `screen.getAllDisplays()` and `desktopCapturer`'s screen
 *      sources are observed to share enumeration order on Windows in that
 *      case, so the target display's index into the FORMER is used as an
 *      index into the LATTER.
 *   4. `sources[0]` as an absolute last resort, logged loudly since at that
 *      point the choice is genuinely a guess.
 */
async function captureDisplayScreenshot(display: Electron.Display): Promise<Electron.DesktopCapturerSource | null> {
    const { width, height } = display.size;
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(width * display.scaleFactor), height: Math.round(height * display.scaleFactor) },
    });
    const allDisplays = screen.getAllDisplays();
    // Logged unconditionally (not just on a fallback path) so a real report of
    // "picking a monitor does nothing" is diagnosable from the log file alone
    // — every field needed to tell whether main resolved the RIGHT target vs.
    // whether it resolved correctly but something downstream (crop region,
    // OCR itself) is the actual problem.
    logger.info('[captureScreen] display capture sources', {
        requestedDisplay: { id: display.id, bounds: display.bounds, scaleFactor: display.scaleFactor },
        allDisplays: allDisplays.map((d) => ({ id: d.id, bounds: d.bounds })),
        sources: sources.map((s) => ({ id: s.id, display_id: s.display_id, name: s.name })),
    });
    if (sources.length === 0) return null;

    const byId = sources.find((s) => s.display_id === String(display.id));
    if (byId) {
        logger.info('[captureScreen] matched by display_id', { chosenSourceId: byId.id });
        return byId;
    }

    if (sources.length < allDisplays.length) {
        logger.warn('[captureScreen] fewer capture sources than connected displays — at least one monitor is excluded from screen capture entirely (commonly caused by 10 bpc / HDR output color depth)', {
            targetDisplayId: display.id, displayCount: allDisplays.length, sourceCount: sources.length,
        });
        lastCaptureFailureReason = `Your selected monitor isn't available for screen capture — Windows reports ${sources.length} capturable screen(s) but ${allDisplays.length} monitor(s) are connected. This is usually caused by that monitor being set to 10-bit ("10 bpc") color depth or HDR, which Windows can't screen-capture. Try: GPU Control Panel (NVIDIA/AMD/Intel) → Change Resolution → select that monitor → Output color depth → 8 bpc, then restart FrequencyManager.`;
        return null;
    }

    const positionalIndex = allDisplays.findIndex((d) => d.id === display.id);
    if (positionalIndex >= 0 && positionalIndex < sources.length) {
        logger.warn('[captureScreen] display_id match failed — falling back to positional match', {
            targetDisplayId: display.id, positionalIndex, sourceCount: sources.length, chosenSourceId: sources[positionalIndex].id,
        });
        return sources[positionalIndex];
    }

    logger.warn('[captureScreen] could not identify the requested display among capture sources at all — capturing sources[0] as a last resort (this is a guess, not necessarily the requested monitor)', {
        targetDisplayId: display.id, sourceCount: sources.length, chosenSourceId: sources[0]?.id,
    });
    return sources[0];
}

/**
 * Capture a screenshot to a temp PNG and return its path (or null on
 * failure). Shared by the `ocr:capture-screen` IPC handler and the
 * global-hotkey flow.
 *
 * `configuredCaptureDisplayId` (Settings → Scanner → Capture display), when
 * set, is AUTHORITATIVE — it always wins, skipping window-title matching
 * entirely. This is deliberate: the whole point of the override is "auto-
 * detection isn't reliable for me" (typically because the game runs
 * exclusive-fullscreen and isn't enumerable as a capturable window at all),
 * so letting window-matching run anyway and potentially win on a false-
 * positive substring match (a browser tab, Discord, a wiki page — anything
 * with the hint text in its title) would silently defeat the very setting
 * the user explicitly chose. An earlier version had this backwards (override
 * only used as a fallback AFTER a window search), which is exactly the "scan
 * capture keeps picking the wrong screen even with a display selected" bug.
 *
 * With no override set ("Auto"), targets the CURRENTLY ACTIVE game's own
 * window (via its `ocr.windowTitleHint`) so a scan is correct regardless of
 * which window has OS focus when the hotkey fires — falling back to the
 * primary display if the game declared no hint. If a hint IS declared but no
 * matching window is found and there's no override to fall back to, this
 * fails outright (returns null) rather than silently capturing the wrong
 * screen.
 *
 * `scanType` selects an optional crop region (see `SCAN_CROP_REGIONS`) to
 * isolate the relevant UI panel and cut out unrelated noise before OCR runs.
 */
async function captureScreen(scanType?: string): Promise<string | null> {
    lastCaptureFailureReason = null;
    try {
        let source: Electron.DesktopCapturerSource | null | undefined;

        if (configuredCaptureDisplayId != null) {
            const matchedDisplay = screen.getAllDisplays().find((d) => d.id === configuredCaptureDisplayId);
            if (!matchedDisplay) {
                // The configured id doesn't match any CURRENTLY connected display
                // (e.g. Windows reassigned display ids after a reboot/monitor
                // reconnect) — falling back to primary silently here would look
                // identical to "the picker doesn't do anything."
                logger.warn('[captureScreen] configured capture display id no longer matches any connected display — falling back to primary', {
                    configuredCaptureDisplayId, connected: screen.getAllDisplays().map((d) => d.id),
                });
            }
            const targetDisplay = matchedDisplay ?? screen.getPrimaryDisplay();
            source = await captureDisplayScreenshot(targetDisplay);
        } else {
            const { id: activeGameId, windowTitleHint } = await getActiveGameCaptureTarget();
            if (windowTitleHint) {
                source = await findGameWindowSource(windowTitleHint);
                if (!source) {
                    logger.warn('[captureScreen] active game\'s window not found — is it running?', { activeGameId, windowTitleHint });
                    lastCaptureFailureReason = `Couldn't find the "${windowTitleHint}" window — make sure the game is running, or set a specific monitor in Settings → Scanner → Capture display.`;
                    return null;
                }
            } else {
                source = await captureDisplayScreenshot(screen.getPrimaryDisplay());
            }
        }
        if (!source) return null;

        const processed = applyCropAndUpscale(source.thumbnail, scanType);
        const outPath = path.join(app.getPath('temp'), `fm-ocr-capture-${Date.now()}.png`);
        fs.writeFileSync(outPath, processed.toPNG());
        registerTempScanFile(outPath);
        return outPath;
    } catch (err) {
        logger.warn('[captureScreen] capture failed', { error: (err as Error).message });
        return null;
    }
}

/**
 * Load an already-saved image file (picked via the file-browse "Scan" path,
 * not live-captured) and run it through the SAME crop+upscale pipeline as a
 * live capture, writing the result to a new temp PNG. WHY THIS EXISTS: the
 * file-browse flow previously read the picked file's bytes directly with no
 * processing at all — for a full-screen screenshot (exactly what the user's
 * test images are) that meant none of the accuracy fixes above ever took
 * effect for that path, even though they'd already been verified against
 * live capture. Returns the ORIGINAL path unchanged if the scan type has no
 * configured crop region (nothing to gain from upscaling alone here, and it
 * keeps behavior for not-yet-wired scan types predictable) — that original
 * path is the user's own file and is deliberately NOT registered for cleanup.
 */
function processImageFile(filePath: string, scanType?: string): string {
    if (!scanType || !SCAN_CROP_REGIONS[scanType]) return filePath;
    try {
        const source = nativeImage.createFromPath(filePath);
        if (source.isEmpty()) return filePath;
        const processed = applyCropAndUpscale(source, scanType);
        const outPath = path.join(app.getPath('temp'), `fm-ocr-processed-${Date.now()}.png`);
        fs.writeFileSync(outPath, processed.toPNG());
        registerTempScanFile(outPath);
        return outPath;
    } catch (err) {
        logger.warn('[processImageFile] processing failed, falling back to original file', { error: (err as Error).message });
        return filePath;
    }
}

const DEFAULT_SCAN_HOTKEY = 'Alt+Shift+S';
let registeredScanHotkey: string | null = null;

/**
 * Which scan type the hotkey is currently armed for (set by the renderer via
 * `scanner:set-active` when the user picks an option in the Scan popup),
 * `null` when disarmed. The hotkey is registered globally at all times
 * (`globalShortcut` has no "temporarily unregister" primitive worth using
 * here), but does nothing when this is `null` — pressing it outside an
 * active scan session is a no-op, not an accidental capture. Reset to
 * `null` on boot so a stale "armed" state can never survive an app restart.
 */
let armedScanType: string | null = null;

/**
 * Register (or re-register, unregistering whatever was there before) the
 * global hotkey that triggers "capture the screen + OCR-scan it," even while
 * another app (the game) has OS focus — `globalShortcut` fires regardless of
 * which window is focused. Gated on `armedScanType`: does nothing unless the
 * renderer has explicitly armed a scan session (Scan → pick an option) —
 * repeatable for as many presses as the user wants ("continuous scans")
 * until they press Stop, which disarms it. On a successful trigger: capture
 * → scan → push the result to the renderer (consumed via the existing
 * generic `frequencyManager.on(...)` bridge, no new subscription plumbing).
 * Deliberately does NOT bring the app window to front or steal focus — the
 * whole point is capturing without interrupting the game; the user checks
 * results by switching back on their own terms. Emits
 * `ocr:hotkey-scan-started` right before capture begins so the renderer can
 * show a "scanning" state even though the window isn't focused when this fires.
 */
function registerScanHotkey(accelerator: string): void {
    if (registeredScanHotkey) {
        globalShortcut.unregister(registeredScanHotkey);
        registeredScanHotkey = null;
    }
    if (!accelerator) return;
    try {
        const ok = globalShortcut.register(accelerator, () => {
            if (!armedScanType) {
                logger.info('[ocr-hotkey] pressed while not armed — ignored', { accelerator });
                return;
            }
            const scanType = armedScanType;
            void (async () => {
                logger.info('[ocr-hotkey] triggered', { accelerator, scanType });
                mainWindow?.webContents.send('ocr:hotkey-scan-started', {});
                const imagePath = await captureScreen(scanType);
                if (!imagePath) {
                    mainWindow?.webContents.send('ocr:hotkey-scan-result', { success: false, error: lastCaptureFailureReason ?? 'Screen capture failed' });
                    return;
                }
                const result = await runOcrScan(imagePath);
                if (result.success) {
                    mainWindow?.webContents.send('ocr:hotkey-scan-result', { success: true, imagePath, result: { echo: result.echo } });
                } else {
                    mainWindow?.webContents.send('ocr:hotkey-scan-result', { success: false, imagePath, error: result.error, rawText: result.rawText });
                }
            })();
        });
        if (ok) {
            registeredScanHotkey = accelerator;
            logger.info('[ocr-hotkey] registered', { accelerator });
        } else {
            logger.warn('[ocr-hotkey] registration failed — accelerator may already be in use by another app', { accelerator });
        }
    } catch (err) {
        logger.warn('[ocr-hotkey] registration threw', { accelerator, error: (err as Error).message });
    }
}

/**
 * Set up IPC handlers for file operations
 */
function setupFileIpc(): void {
    ipcMain.handle('ocr:capture-screen', (_event, scanType?: string) => captureScreen(scanType));

    // Run a file picked via the browse flow through the same crop+upscale
    // pipeline a live capture gets, so OCR accuracy doesn't depend on which
    // path the image came from. Returns a new processed temp file's path.
    ipcMain.handle('ocr:process-file', (_event, filePath: string, scanType?: string) => processImageFile(filePath, scanType));

    // Arms/disarms the global hotkey for live scanning — see `armedScanType`.
    // `scanType` is ignored (and disarms) when `active` is false.
    ipcMain.on('scanner:set-active', (_event, active: boolean, scanType?: string) => {
        armedScanType = active ? (scanType ?? null) : null;
        logger.info('[ocr-hotkey] armed state changed', { armedScanType });
    });

    // Renderer sends the current setting on boot and whenever the user
    // changes it (settingsStore) — main owns the actual globalShortcut
    // registration since that's a main-process-only API.
    ipcMain.on('settings:set-scan-hotkey', (_event, accelerator: string) => {
        registerScanHotkey(accelerator);
    });

    // Populates the "Capture display" dropdown (Settings → Scanner) — the
    // manual override for multi-monitor setups where window-title matching
    // can't reliably find the game (see `captureScreen`'s doc comment).
    ipcMain.handle('ocr:list-displays', () => {
        const primaryId = screen.getPrimaryDisplay().id;
        return screen.getAllDisplays().map((d) => ({
            id: d.id,
            width: d.size.width,
            height: d.size.height,
            isPrimary: d.id === primaryId,
        }));
    });
    ipcMain.on('settings:set-capture-display', (_event, id: number | null) => {
        configuredCaptureDisplayId = id;
        logger.info('[captureScreen] capture display override set', { id });
    });

    // The running app version (for update checks + export envelopes).
    ipcMain.handle('app:get-version', () => app.getVersion());

    // Opens the log FOLDER (not the file directly — Explorer's "show in
    // folder" needs a real, already-existing file path, and the current log
    // file's exact name can rotate) in the OS file browser, so a user can
    // find and share `main.log` for troubleshooting (e.g. the OCR capture
    // diagnostics logged in `captureDisplayScreenshot`).
    ipcMain.handle('app:open-logs-folder', () => {
        const logFile = electronLog.transports.file.getFile().path;
        shell.showItemInFolder(logFile);
        return logFile;
    });

    ipcMain.handle('dialog:openFile', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openFile'],
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        return result.filePaths[0] || null;
    });

    // Same picker as dialog:openFile but multi-select, for the Scanner
    // screen's "Browse…" — the caller processes the returned paths one by
    // one (sequential OCR, not parallel).
    ipcMain.handle('dialog:openImages', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        return result.filePaths;
    });

    // Read an image file the user just picked (via dialog:openFile) and return
    // it as a base64 data: URL. WHY: the renderer's CSP img-src allows 'data:'
    // but not 'file:', so a picked screenshot can't be shown via a raw file://
    // <img> — and widening the existing fm-icon:// protocol (scoped to bundled
    // game-package art) to arbitrary user paths would be a real security scope
    // regression. This is safe because the only paths ever passed here are ones
    // the user already picked through the native OS dialog — the same file
    // ocr:scan is about to read the bytes of anyway.
    const IMAGE_MIME_TYPES: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    };
    ipcMain.handle('fs:read-image-preview', (_event, filePath: string) => {
        try {
            const ext = path.extname(filePath).toLowerCase();
            const mime = IMAGE_MIME_TYPES[ext];
            if (!mime) return null;
            const data = fs.readFileSync(filePath);
            const dataUrl = `data:${mime};base64,${data.toString('base64')}`;
            // Once read into a data: URL the renderer holds in memory from here
            // on, our own generated temp scan image (if this is one — see
            // `registerTempScanFile`) is no longer needed on disk. No-ops for a
            // user's own picked file.
            releaseTempScanFile(filePath);
            return dataUrl;
        } catch (err) {
            logger.warn('[fs:read-image-preview] read failed', { error: (err as Error).message });
            return null;
        }
    });

    ipcMain.handle('dialog:saveFile', async (_event, defaultName: string, content: string) => {
        const result = await dialog.showSaveDialog(mainWindow!, {
            defaultPath: defaultName,
            filters: [
                { name: 'JSON', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        if (result.filePath) {
            fs.writeFileSync(result.filePath, content);
            return result.filePath;
        }
        return null;
    });

    // Open a JSON file and return its contents (used by user-data import).
    ipcMain.handle('dialog:openJson', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openFile'],
            filters: [
                { name: 'JSON', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        const filePath = result.filePaths[0];
        if (!filePath) return null;
        try {
            return { path: filePath, content: fs.readFileSync(filePath, 'utf-8') };
        } catch (err) {
            logger.warn('[dialog:openJson] read failed', { error: (err as Error).message });
            return null;
        }
    });
}

/**
 * Application lifecycle
 */
/**
 * Wire `electron-updater` events into both:
 *   - the kernel EventBus (so any module can subscribe), and
 *   - the renderer via a forwarded IPC channel + a native notification.
 *
 * Auto-update is dev-disabled to avoid spurious checks while debugging.
 */
function setupAutoUpdater(): void {
    if (process.env.NODE_ENV === 'development') {
        logger.info('[AutoUpdater] Skipping in development mode');
        return;
    }

    const cfg = readUpdatesConfig();

    autoUpdater.autoDownload = cfg.appCheckOnBoot;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => {
        logger.info('[AutoUpdater] Checking for update');
        void kernel?.eventBus.publish('app:update-checking', { at: Date.now() }, { source: 'electron-updater' });
        mainWindow?.webContents.send('app:update-status', { kind: 'checking' });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
        logger.info('[AutoUpdater] Update available', { version: info.version });
        const payload = { version: info.version, releaseDate: info.releaseDate };
        void kernel?.eventBus.publish('app:update-available', payload, { source: 'electron-updater' });
        mainWindow?.webContents.send('app:update-available', payload);
        if (Notification.isSupported()) {
            new Notification({
                title: 'FrequencyManager update available',
                body: `Version ${info.version} is downloading...`,
            }).show();
        }
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
        logger.info('[AutoUpdater] No update available', { version: info.version });
        void kernel?.eventBus.publish('app:update-not-available', { version: info.version }, { source: 'electron-updater' });
        mainWindow?.webContents.send('app:update-status', { kind: 'up-to-date', version: info.version });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
        mainWindow?.webContents.send('app:update-progress', {
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
        });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
        logger.info('[AutoUpdater] Update downloaded', { version: info.version });
        const payload = { version: info.version, releaseDate: info.releaseDate };
        void kernel?.eventBus.publish('app:update-downloaded', payload, { source: 'electron-updater' });
        mainWindow?.webContents.send('app:update-downloaded', payload);
        if (Notification.isSupported()) {
            new Notification({
                title: 'Update ready to install',
                body: `FrequencyManager ${info.version} will install on next launch.`,
            }).show();
        }
    });

    autoUpdater.on('error', (err: Error) => {
        logger.error('[AutoUpdater] Error', { error: err.message });
        void kernel?.eventBus.publish('app:update-error', { message: err.message }, { source: 'electron-updater' });
        mainWindow?.webContents.send('app:update-status', { kind: 'error', message: err.message });
    });

    if (cfg.appCheckOnBoot) {
        // Fire and forget — never block app boot on a network round-trip.
        void autoUpdater.checkForUpdates().catch((err: Error) => {
            logger.warn('[AutoUpdater] Initial check failed', { error: err.message });
        });
    }
}

/**
 * Read the `updates` block out of `config/default.json`. We intentionally
 * do NOT depend on the kernel here so that the updater wires up even
 * before the kernel has booted.
 */
function readUpdatesConfig(): { appCheckOnBoot: boolean; notifyOnUpdate: boolean } {
    try {
        const cfgPath = path.join(__dirname, '..', '..', 'config', 'default.json');
        const raw = fs.readFileSync(cfgPath, 'utf-8');
        const cfg = JSON.parse(raw) as { updates?: { appCheckOnBoot?: boolean; notifyOnUpdate?: boolean } };
        return {
            appCheckOnBoot: cfg.updates?.appCheckOnBoot ?? true,
            notifyOnUpdate: cfg.updates?.notifyOnUpdate ?? true,
        };
    } catch {
        return { appCheckOnBoot: true, notifyOnUpdate: true };
    }
}

app.whenReady().then(async () => {
    logger.info('Electron app ready');

    setupStorage();
    setupIconProtocol();
    sweepStaleTempScanFiles();
    loadExternalGameModules();
    setupGamePackageInstaller();
    await initializeKernel();
    setupFileIpc();
    setupWindowControls();
    setupAutoUpdater();
    createWindow();
    // Register a default hotkey immediately; the renderer sends the user's
    // actual persisted setting (which may differ) once settingsStore hydrates.
    registerScanHotkey(DEFAULT_SCAN_HOTKEY);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}).catch((err: Error) => {
    logger.error('[electron-main] Fatal error during boot', { error: err.message });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    void (async () => {
        if (kernel) {
            await kernel.shutdown();
        }
        if (process.platform !== 'darwin') {
            app.quit();
        }
    })();
});

app.on('before-quit', () => {
    void (async () => {
        if (kernel) {
            await kernel.shutdown();
        }
    })();
});

// Security: Prevent new window creation and route external links to system browser
app.on('web-contents-created', (_event, contents) => {
    // WHY: Newer Electron versions deprecated the 'new-window' event in favor of
    // `setWindowOpenHandler` on each webContents. This approach works across all
    // supported Electron versions and avoids the deprecated event signature.
    contents.setWindowOpenHandler(({ url }: { url: string }) => {
        void shell.openExternal(url);
        return { action: 'deny' };
    });
});

export { kernel, logger };