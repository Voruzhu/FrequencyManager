/**
 * @fileoverview OCR Scanner Module for FrequencyManager
 * @module modules/ocr-scanner
 * 
 * This module provides OCR scanning capabilities for Wuthering Waves echo screenshots.
 * It uses Tesseract.js to extract text from images and parses echo stats.
 * 
 * WHY: OCR scanning is the primary data input method for echo optimization.
 * Players can screenshot their echoes and the module extracts stats automatically.
 * 
 * Events Emitted:
 * - echo:scanned: When an echo is successfully scanned
 * - echo:scan-failed: When scanning fails
 * - ocr:progress: Progress updates during scanning
 * 
 * Events Consumed:
 * - ocr:scan-request: Request to scan an image
 * 
 * @packageDocumentation
 */

import {
    ModuleAPI,
    ModuleManifest,
    ModuleLoaderOptions,
    ModuleFactory,
    ModuleError,
    ModuleHealthStatus,
    ModuleState,
    EventMessage,
    KernelInterface,
    generateId,
    generateCorrelationId,
} from '@shared/types';
import { UNKNOWN_ECHO_NAME, type ScannedEcho, type ScanRequest, type ScanResult } from '@shared/types/ocr';
import type { GameDefinition, OcrRules } from '@shared/types/game-definition';
import { createWorker, Worker, PSM, OEM } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve the directory containing `eng.traineddata` for Tesseract's
 * `langPath`/`cachePath` — without this, `createWorker()` falls back to its
 * own default (`${cachePath || '.'}/eng.traineddata`, i.e. `process.cwd()`),
 * which only happens to work in dev because `electron .` is launched from
 * the repo root where the file sits; in a packaged/installed build `cwd`
 * depends on how the shortcut launches the app and the file isn't there at
 * all, so every fresh install needs a ~5MB fetch from a third-party CDN
 * (jsdelivr) before OCR can run — and since worker init happens at kernel
 * boot (not lazily on first scan), a failed fetch (offline, firewalled)
 * takes down the whole OCR Scanner module for the session, not just one scan.
 *
 * `process.resourcesPath` is a property Electron adds directly onto the
 * global `process` object at runtime (no `electron` import needed — same
 * pattern `core/kernel.ts` already uses for locating `config/`), so this
 * module still runs correctly under Jest's plain-Node test environment,
 * where the property is simply undefined and resolution falls through to
 * the repo-root candidate below.
 */
function resolveTraineddataDir(): string {
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    // Compiled to dist/modules/ocr-scanner/src/index.js — four levels up reaches the repo root.
    const devRoot = path.join(__dirname, '..', '..', '..', '..');
    const candidates = [resourcesPath, devRoot, process.cwd()].filter((d): d is string => typeof d === 'string');
    return candidates.find((d) => fs.existsSync(path.join(d, 'eng.traineddata'))) ?? devRoot;
}

// Re-export manifest
export { manifest } from './manifest';

// Re-export the shared OCR contract so existing external imports of these
// names from this module keep working unchanged.
export type { ScannedEcho, ScanRequest, ScanResult } from '@shared/types/ocr';

/** Fallback OCR rules used only when the active game hasn't resolved yet
 * (module boot races game-loader) — mirrors WuWa's real `OCR_PATTERNS` so
 * behavior degrades gracefully instead of failing the scan outright. */
const STAT_VALUE_GAP = '[^\\d\\n]{1,20}'; // kept in sync with WW/GI definitions' bound
// Kept in sync with WW's real OCR_PATTERNS.namePattern — strips an optional
// "Phantom: " skin-indicator prefix, tolerates an apostrophe/inner hyphen
// within a name word, a lowercase "of"/"the" linking word between two
// Title-Case words, and up to two "Main: Sub" / "Main - Sub" compound-name
// suffixes in either order (see that file's comment).
// {2,} so a 2-letter OCR misread of the set-filter chip's icon row can't
// chain onto the echo name — see the real WW definition.ts's NAME_WORD
// comment (kept in sync with this one).
const NAME_WORD = "[A-Z][a-z]{2,}(?:['\\u2019-][a-zA-Z]+)*";
const NAME_CONNECTOR = '(?:of|the)';
const NAME_PART = `${NAME_WORD}(?:\\s+(?:${NAME_CONNECTOR}\\s+)*${NAME_WORD})*`;
const COMPOUND_SEP = `(?:\\s*[:-]\\s*${NAME_PART})`;
// Not `^`-anchored — see the real WW definition.ts's OCR_PATTERNS.namePattern
// comment (kept in sync with this one) for why: the set-filter chip's text
// precedes the real echo name in the raw OCR output, so the match instead
// requires the name to sit immediately before "+<level>".
const FALLBACK_OCR_RULES: OcrRules = {
    namePattern: `(?:Phantom\\s*:?\\s*)?(${NAME_PART}${COMPOUND_SEP}{0,2})(?=\\s*\\+\\d)`,
    costPattern: `Cost${STAT_VALUE_GAP}(\\d+)`,
    mainStatPattern: `(ATK|DEF|HP|CRIT\\s*Rate|CRIT\\s*DMG|Energy\\s*Regen|Healing\\s*Bonus|Effect\\s*Hit\\s*Rate|Effect\\s*RES)${STAT_VALUE_GAP}([\\d.]+)%?`,
    subStatPattern: `(ATK|DEF|HP|CRIT\\s*Rate|CRIT\\s*DMG|Energy\\s*Regen|Healing\\s*Bonus|Effect\\s*Hit\\s*Rate|Effect\\s*RES)${STAT_VALUE_GAP}([\\d.]+)%?`,
    // FIXED 2026-07-16 — this list had drifted out of sync with the real
    // `OCR_PATTERNS.setNames` in adapters/game-definitions/wuthering-waves/
    // definition.ts: it still only had the original 16 sets, missing the 18
    // added 2026-07-12 (including "Sound of True Name") — meaning any scan
    // that raced module boot before the game module resolved could silently
    // fail to recognize a newer set. This module can't import the adapter
    // (layering: ocr-scanner is generic, game-specific data lives above it),
    // so keep this literal list manually in sync with that file's array.
    setNames: [
        'Freezing Frost', 'Molten Rift', 'Void Thunder', 'Sierra Gale', 'Celestial Light',
        'Havoc Eclipse', 'Moonlit Clouds', 'Rejuvenating Glow', 'Lingering Tunes', 'Frosty Resolve',
        'Empyrean Anthem', 'Midnight Veil', 'Eternal Radiance', 'Tidebreaking Courage',
        'Gusts of Welkin', 'Windward Pilgrimage',
        'Chromatic Foam', 'Crown of Valor', 'Dream of the Lost', "Flamewing's Shadow",
        'Flaming Clawprint', 'Halo of Starry Radiance', "Heart of Evil's Purge", 'Lamp of Nether Road',
        'Law of Harmony', 'Pact of Neonlight Leap', 'Reel of Spliced Memories', 'Rite of Gilded Revelation',
        'Shadow of Shattered Dreams', 'Song of Feathered Trace', 'Sound of True Name',
        'Thread of Severed Fate', 'Trailblazing Star', 'Wishes of Quiet Snowfall',
    ],
    levelPattern: '\\+(\\d+)',
    equippedByPattern: 'Equipped by ([A-Za-z][A-Za-z\\s]*)',
};

/**
 * Module state
 */
interface OcrScannerState {
    worker: Worker | null;
    isInitialized: boolean;
    scanCount: number;
    lastScanTime: number;
    totalProcessingTime: number;
}

/**
 * OCR Scanner Module Implementation
 */
class OcrScannerModule implements ModuleAPI {
    public readonly moduleId = 'ocr-scanner';
    public readonly manifest: ModuleManifest;
    public health: ModuleHealthStatus = 'unloaded';

    private kernel: KernelInterface | null = null;
    private state: OcrScannerState = {
        worker: null,
        isInitialized: false,
        scanCount: 0,
        lastScanTime: 0,
        totalProcessingTime: 0,
    };
    private config: {
        ocrScanner?: {
            language?: string;
            confidenceThreshold?: number;
            preprocessing?: boolean;
            tesseractPath?: string;
        };
    } = {};

    constructor(manifest: ModuleManifest) {
        this.manifest = manifest;
    }

    /**
     * Initialize the module
     */
    async initialize(kernel: KernelInterface): Promise<void> {
        this.kernel = kernel;
        this.config = kernel.config.getAll();

        // Subscribe to scan requests
        kernel.eventBus.subscribe('ocr:scan-request', this.handleScanRequest.bind(this));

        // Initialize Tesseract worker
        await this.initializeWorker();

        this.health = 'healthy';
        kernel.logger.info('[OCR Scanner] Module initialized');
    }

    /**
     * Initialize Tesseract worker
     */
    private async initializeWorker(): Promise<void> {
        try {
            const language = this.config.ocrScanner?.language || 'eng';
            // Point Tesseract at the bundled traineddata directory (packaged:
            // electron-builder's extraResources; dev: repo root) so the
            // language file is found locally and the CDN-fetch fallback never
            // triggers — see resolveTraineddataDir's doc comment.
            const traineddataDir = resolveTraineddataDir();
            const worker = await createWorker(language, 1, {
                langPath: traineddataDir,
                cachePath: traineddataDir,
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        this.kernel?.eventBus.publish('ocr:progress', {
                            progress: Math.round(m.progress * 100),
                            status: m.status,
                        }, { source: this.moduleId });
                    }
                },
            });

            // Configure worker. Was PSM.AUTO while OCR ran on raw full-screen
            // captures; tried SINGLE_BLOCK once the crop narrowed to just the
            // stat panel, but real testing showed it merging short adjacent
            // rows together (e.g. Crit Rate's line bleeding into the next
            // row's text) rather than reading each line distinctly — because
            // SINGLE_BLOCK assumes one uniform PARAGRAPH, which doesn't
            // match a vertically-stacked list of short, independent lines.
            // SINGLE_COLUMN is the structurally-correct mode for exactly
            // that shape: "a single column of text of variable sizes."
            await worker.setParameters({
                tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
                tessedit_oem: OEM.LSTM_ONLY,
            });

            this.state.worker = worker;
            this.state.isInitialized = true;

            this.kernel?.logger.info('[OCR Scanner] Tesseract worker initialized', { language });
        } catch (error) {
            this.kernel?.logger.error('[OCR Scanner] Failed to initialize worker', { error: (error as Error).message });
            throw new ModuleError('WORKER_INIT_FAILED', 'Failed to initialize OCR worker', this.moduleId, { originalError: error as Error });
        }
    }

    /**
     * Handle scan request from event bus
     */
    private async handleScanRequest(message: EventMessage<ScanRequest>): Promise<void> {
        const { imagePath, options } = message.payload;
        const correlationId = message.correlationId || generateCorrelationId();

        try {
            const result = await this.scanImage(imagePath, options);

            if (result.success && result.echo) {
                // Publish scanned echo
                await this.kernel?.eventBus.publish('echo:scanned', {
                    echo: result.echo,
                    source: 'ocr-scanner',
                }, { source: this.moduleId, correlationId });
            } else {
                // Publish failure
                await this.kernel?.eventBus.publish('echo:scan-failed', {
                    error: result.error,
                    imagePath,
                    rawText: result.rawText,
                }, { source: this.moduleId, correlationId });
            }
        } catch (error) {
            this.kernel?.logger.error('[OCR Scanner] Scan request failed', { error: (error as Error).message });
            await this.kernel?.eventBus.publish('echo:scan-failed', {
                error: (error as Error).message,
                imagePath,
            }, { source: this.moduleId, correlationId });
        }
    }

    /**
     * Scan an image file for echo data
     */
    async scanImage(imagePath: string, options?: ScanRequest['options']): Promise<ScanResult> {
        const startTime = Date.now();

        if (!this.state.worker || !this.state.isInitialized) {
            return {
                success: false,
                error: 'OCR worker not initialized',
                confidence: 0,
                processingTimeMs: Date.now() - startTime,
            };
        }

        try {
            // Verify file exists
            if (!fs.existsSync(imagePath)) {
                return {
                    success: false,
                    error: `Image file not found: ${imagePath}`,
                    confidence: 0,
                    processingTimeMs: Date.now() - startTime,
                };
            }

            // Perform OCR
            const { data } = await this.state.worker.recognize(imagePath);

            const confidence = data.confidence;
            // A full-screen capture carries a lot of non-text visual noise
            // (art, icons, borders) that drags Tesseract's overall confidence
            // down even when the actual stat text was read correctly — and the
            // confirm-and-add flow already requires the user to review every
            // field before it's saved, so this gate only needs to catch TRUE
            // garbage, not gently-imperfect real screenshots. 35, not 60.
            const threshold = options?.confidenceThreshold || this.config.ocrScanner?.confidenceThreshold || 35;

            if (confidence < threshold) {
                return {
                    success: false,
                    error: `OCR confidence too low: ${confidence}% (threshold: ${threshold}%)`,
                    confidence,
                    processingTimeMs: Date.now() - startTime,
                    rawText: data.text,
                };
            }

            // Parse echo data from OCR text, using the currently active game's
            // real stat labels/set names — NOT a hardcoded single-game guess.
            const echo = this.parseEchoData(data.text, confidence, this.getOcrRules());

            if (!echo) {
                return {
                    success: false,
                    error: 'Failed to parse echo data from OCR text',
                    confidence,
                    processingTimeMs: Date.now() - startTime,
                    rawText: data.text,
                };
            }

            // Update stats
            this.state.scanCount++;
            this.state.lastScanTime = Date.now();
            this.state.totalProcessingTime += Date.now() - startTime;

            return {
                success: true,
                echo,
                confidence,
                processingTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message,
                confidence: 0,
                processingTimeMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Resolve the active game's `GameDefinition` from kernel config — injected
     * by game-loader under `game.definition` (see `modules/game-loader/src`).
     * Read fresh on every call (not cached at `initialize()` time) since the
     * active game can change mid-session.
     */
    private getActiveGameDefinition(): GameDefinition | undefined {
        const cfg = this.kernel?.config.getAll() as { game?: { definition?: GameDefinition } } | undefined;
        return cfg?.game?.definition;
    }

    /**
     * The active game's real OCR rules (stat labels, set names) — falls back
     * to `FALLBACK_OCR_RULES` only when no game has resolved yet (a boot-order
     * race with game-loader), never as a silent permanent default.
     */
    private getOcrRules(): OcrRules {
        const def = this.getActiveGameDefinition();
        if (!def) {
            this.kernel?.logger.warn('[OCR Scanner] No active game resolved yet — falling back to default OCR patterns');
            return FALLBACK_OCR_RULES;
        }
        return def.ocr;
    }

    /**
     * Parse echo/artifact data from OCR text, using the ACTIVE GAME's real
     * stat-label/set-name rules (`OcrRules`) — not a hardcoded single-game
     * guess, so both WuWa and Genshin screenshots parse against their own
     * real vocabulary.
     */
    private parseEchoData(text: string, confidence: number, ocr: OcrRules): ScannedEcho | null {
        try {
            // Clean up text
            const cleanText = text.replace(/\s+/g, ' ').trim();

            // Extract equipment name (usually at the top). Case-sensitive on
            // purpose — the pattern's whole job is spotting capitalized words.
            const nameMatch = cleanText.match(new RegExp(ocr.namePattern));
            const name = nameMatch ? nameMatch[1] : UNKNOWN_ECHO_NAME;

            // Extract cost (WuWa only — GI's costPattern is '', meaning "no cost
            // concept for this game," so skip building an empty regex entirely).
            let cost = 0;
            if (ocr.costPattern) {
                const costMatch = cleanText.match(new RegExp(ocr.costPattern, 'i'));
                cost = costMatch ? parseInt(costMatch[1], 10) : 0;
            }

            // A stat's FULL match (not just its capture groups) carries the
            // trailing '%' when present — e.g. flat ATK vs ATK% are genuinely
            // different catalog stats, and `OcrRules.mainStatPattern`/
            // `subStatPattern` only capture the bare label, leaving '%?' outside
            // any group. Append it here so downstream mapping can tell them apart.
            // Normalize OCR spelling variants (e.g. "Crit. Rate" with a period)
            // to the canonical form BEFORE returning — downstream mapping
            // matches this `type` against the catalog's own label text, which
            // never has a period, so leaving one in here would silently break
            // that match even though the value was extracted correctly.
            const labelWithPercent = (fullMatch: string, label: string) => {
                const normalized = label.replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
                return fullMatch.trim().endsWith('%') ? `${normalized}%` : normalized;
            };

            // Extract main stat
            const mainStatMatch = cleanText.match(new RegExp(ocr.mainStatPattern, 'i'));
            const mainStat = mainStatMatch ? {
                type: labelWithPercent(mainStatMatch[0], mainStatMatch[1]),
                value: parseFloat(mainStatMatch[2]),
            } : { type: 'UNKNOWN', value: 0 };

            // Extract sub stats (same pattern, scanned globally; skip only the
            // exact occurrence that became the main stat, by MATCH POSITION —
            // not by stat type. A real echo can carry the same stat as BOTH
            // its main AND a sub-stat (e.g. Crit Rate main 22% + Crit Rate
            // sub 7.5% is a completely normal roll); filtering by type alone
            // would silently drop that second, genuine data point.
            const subStats: Array<{ type: string; value: number }> = [];
            const subStatRegex = new RegExp(ocr.subStatPattern, 'gi');
            let match;
            let skippedMainOccurrence = false;
            while ((match = subStatRegex.exec(cleanText)) !== null) {
                if (!skippedMainOccurrence && mainStatMatch && match.index === mainStatMatch.index) {
                    skippedMainOccurrence = true;
                    continue;
                }
                const type = labelWithPercent(match[0], match[1]);
                subStats.push({ type, value: parseFloat(match[2]) });
            }

            // Extract set name — first of the active game's real canonical
            // set names that appears in the OCR text. The set-filter chip
            // (crop region added 2026-07-13) sometimes has its space(s)
            // dropped by OCR ("RejuvenatingGlow" for "Rejuvenating Glow") —
            // matched per-name with each internal space loosened to `\s*`
            // so that still counts as a hit. Returns the known CANONICAL
            // name (not whatever raw substring matched), so a space-dropped
            // read still compares equal downstream against the real catalog
            // set name.
            let setName: string | undefined;
            for (const known of ocr.setNames) {
                const flexible = known.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*');
                if (new RegExp(flexible, 'i').test(cleanText)) { setName = known; break; }
            }

            // Level ("+N") and "Equipped by X" — both optional; skip cleanly
            // when the active game's OcrRules doesn't define a pattern for them.
            const levelMatch = ocr.levelPattern ? cleanText.match(new RegExp(ocr.levelPattern)) : null;
            const level = levelMatch ? parseInt(levelMatch[1], 10) : undefined;
            const equippedByMatch = ocr.equippedByPattern ? cleanText.match(new RegExp(ocr.equippedByPattern, 'i')) : null;
            const equippedByCharacterName = equippedByMatch ? equippedByMatch[1].trim() : undefined;

            return {
                id: generateId('echo-'),
                name,
                cost,
                level,
                mainStat,
                // The real per-game cap (5 for WuWa, 4 for GI) lives in the
                // renderer's GearCatalog, which this backend module has no
                // access to — capture generously here and let the mapping
                // step (which DOES have the real catalog) do the real trim,
                // rather than guessing a single cross-game number and risking
                // silently dropping real data.
                subStats: subStats.slice(0, 8),
                setName,
                equippedByCharacterName,
                confidence,
                rawText: cleanText,
                scannedAt: Date.now(),
            };
        } catch (error) {
            this.kernel?.logger.error('[OCR Scanner] Failed to parse echo data', { error: (error as Error).message });
            return null;
        }
    }

    /**
     * Scan image from clipboard.
     *
     * NOT implemented: `clipboard.readImage()` lives in Electron's MAIN process,
     * not inside a sandboxed backend module (this module has no Electron import
     * at all, by design — see the module sandbox model), so this can only ever
     * be built as a main-process IPC bridge (read clipboard → write temp file →
     * hand the path to the existing `ocr:scan` flow), which doesn't exist yet.
     * The `system:clipboard` permission is declared in the manifest for when
     * that bridge is built. Use the file picker (`ocr:scan` with a real path)
     * in the meantime.
     */
    async scanFromClipboard(): Promise<ScanResult> {
        return {
            success: false,
            error: 'Clipboard scanning requires the desktop clipboard bridge, which is not wired yet — use the file picker instead.',
            confidence: 0,
            processingTimeMs: 0,
        };
    }

    /**
     * Get module configuration
     */
    getConfig(): Record<string, unknown> {
        return { ...this.config };
    }

    /**
     * Update module configuration
     */
    async configure(config: Record<string, unknown>): Promise<void> {
        this.config = { ...this.config, ...config } as typeof this.config;

        // Reinitialize worker if language changed
        const newLanguage = (config.ocrScanner as any)?.language;
        const currentLanguage = this.config.ocrScanner?.language;
        if (newLanguage && newLanguage !== currentLanguage) {
            await this.initializeWorker();
        }
    }

    /**
     * Shutdown the module
     */
    async shutdown(): Promise<void> {
        if (this.state.worker) {
            await this.state.worker.terminate();
            this.state.worker = null;
        }
        this.state.isInitialized = false;
        this.health = 'unloaded';
        this.kernel?.logger.info('[OCR Scanner] Module shutdown');
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<ModuleHealthStatus> {
        if (!this.state.isInitialized || !this.state.worker) {
            this.health = 'unhealthy';
            return 'unhealthy';
        }

        // Check if worker is responsive
        try {
            // Simple health check - worker exists
            this.health = 'healthy';
            return 'healthy';
        } catch {
            this.health = 'degraded';
            return 'degraded';
        }
    }

    /**
     * Get module state
     */
    getState(): ModuleState {
        return {
            moduleId: this.moduleId,
            health: this.health,
            uptime: Date.now() - (this.state.lastScanTime || Date.now()),
            data: {
                isInitialized: this.state.isInitialized,
                scanCount: this.state.scanCount,
                lastScanTime: this.state.lastScanTime,
                averageProcessingTime: this.state.scanCount > 0
                    ? this.state.totalProcessingTime / this.state.scanCount
                    : 0,
                config: this.config,
            },
            lastHealthCheck: Date.now(),
            loadedAt: this.state.lastScanTime || Date.now(),
        };
    }
}

/**
 * Module factory function
 */
const factory: ModuleFactory = async (options: ModuleLoaderOptions): Promise<ModuleAPI> => {
    // Load manifest
    const manifestPath = path.join(options.modulePath, 'module.manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest: ModuleManifest = JSON.parse(manifestContent);

    const module = new OcrScannerModule(manifest);
    return module;
};

export default factory;