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
    generateCorrelationId,
} from '@shared/types';
import type { ScanRequest, ScanResult } from '@shared/types/ocr';
import type { GameDefinition, OcrRules } from '@shared/types/game-definition';
import { FALLBACK_OCR_RULES, parseEchoData } from '@shared/ocr/parseEchoData';
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
            const echo = parseEchoData(data.text, confidence, this.getOcrRules());

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