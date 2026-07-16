/**
 * @fileoverview JSON Import / Export module
 * @module modules/json-importer
 *
 * WHY: Before we have OCR scanning working, players need a way to bring
 * data into FrequencyManager and take it out again. This module provides
 * generic JSON export/import that works with any game (WU, GI, or any
 * future GameDefinition), as long as payloads conform to the canonical
 * Equipment / Character shapes.
 *
 * Data Flow:
 *   Export:  caller-provided object  -> envelope -> JSON string
 *   Import:  JSON string             -> parse    -> validate -> envelope -> caller
 *
 * Envelope:
 *   {
 *     "schemaVersion": "1.0",
 *     "exportedAt": "<iso>",
 *     "exportedBy": "frequency-manager@<version>",
 *     "game": { "id": "wuthering-waves", "version": "1.0.0" },
 *     "payload": { ...game-specific... }
 *   }
 *
 * The envelope's `game.id` records which game the export came from so
 * import can warn on cross-game imports without rejecting them outright.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    ModuleAPI,
    ModuleManifest,
    ModuleLoaderOptions,
    ModuleFactory,
    ModuleHealthStatus,
    ModuleState,
    KernelInterface,
} from '@shared/types';
import { manifest } from './manifest';
import type { GameDefinition } from '@shared/types/game-definition';

// Re-export manifest
export { manifest } from './manifest';

// ─────────────────────────────────────────────────────────────────────────────
// Envelope schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The wrapper that every export puts around its game-specific payload.
 */
export interface ExportEnvelope<T = unknown> {
    /** Schema version of the payload shape. */
    schemaVersion: string;
    /** ISO-8601 timestamp of when the export was created. */
    exportedAt: string;
    /** App + module identifier. */
    exportedBy: string;
    /** Identifies which GameDefinition the payload belongs to. */
    game: {
        id: string;
        version: string;
        displayName: string;
    };
    /** Optional human-readable description. */
    description?: string;
    /** The actual game-specific data. */
    payload: T;
}

/**
 * The result of importing an envelope.
 */
export interface ImportResult<T = unknown> {
    ok: boolean;
    envelope?: ExportEnvelope<T>;
    error?: { code: string; message: string };
    /** True when the envelope's game.id differs from the currently active game. */
    crossGame?: boolean;
}

/**
 * Configuration for a single export operation.
 */
export interface ExportOptions {
    prettyPrint?: boolean;
    description?: string;
    gameOverride?: { id: string; version: string; displayName: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────────────────────

interface JsonImporterState {
    importCount: number;
    exportCount: number;
    lastExportAt: number | null;
    lastImportAt: number | null;
    lastError: string | null;
}

/**
 * JSON Importer module implementation
 */
class JsonImporterModule implements ModuleAPI {
    public readonly moduleId = 'json-importer';
    public readonly manifest: ModuleManifest;
    public health: ModuleHealthStatus = 'unloaded';

    private kernel: KernelInterface | null = null;
    private state: JsonImporterState = {
        importCount: 0,
        exportCount: 0,
        lastExportAt: null,
        lastImportAt: null,
        lastError: null,
    };

    constructor(manifest: ModuleManifest) {
        this.manifest = manifest;
    }

    async initialize(kernel: KernelInterface): Promise<void> {
        this.kernel = kernel;

        // IPC surface for renderer / external callers.
        kernel.eventBus.onRequest<{ payload: unknown; options?: ExportOptions }, string>('json:export', (req) => {
            return this.exportToString(req.payload, req.options);
        });

        kernel.eventBus.onRequest<{ json: string }, ImportResult>('json:import-string', (req) => {
            return this.importFromString(req.json);
        });

        kernel.eventBus.onRequest<{ filePath: string; payload?: unknown; options?: ExportOptions }, string>(
            'json:export-to-file',
            (req) => {
                return this.exportToFile(req.filePath, req.payload ?? {}, req.options);
            },
        );

        kernel.eventBus.onRequest<{ filePath: string }, ImportResult>('json:import-from-file', (req) => {
            return this.importFromFile(req.filePath);
        });

        this.health = 'healthy';
        kernel.logger.info('[JSON Importer] Module initialized');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Wrap the given payload in an envelope and return it as a JSON string.
     */
    exportToString(payload: unknown, options: ExportOptions = {}): string {
        const envelope = this.buildEnvelope(payload, options);
        const cfg = this.getConfig();
        const pretty = options.prettyPrint ?? cfg.prettyPrint;
        return JSON.stringify(envelope, null, pretty ? 2 : undefined);
    }

    /**
     * Parse a JSON string back into an envelope, validate, and return.
     */
    importFromString(json: string): ImportResult {
        try {
            const parsed = JSON.parse(json) as ExportEnvelope;
            if (!this.isEnvelope(parsed)) {
                return {
                    ok: false,
                    error: { code: 'INVALID_ENVELOPE', message: 'Object does not match ExportEnvelope shape.' },
                };
            }
            this.state.importCount += 1;
            this.state.lastImportAt = Date.now();
            const active = this.getActiveGame();
            const crossGame = active ? parsed.game.id !== active.id : false;
            return {
                ok: true,
                envelope: parsed,
                crossGame,
            };
        } catch (err) {
            return {
                ok: false,
                error: {
                    code: 'PARSE_FAILED',
                    message: err instanceof Error ? err.message : String(err),
                },
            };
        }
    }

    /**
     * Read a file from disk and import it.
     */
    importFromFile(filePath: string): ImportResult {
        try {
            if (!fs.existsSync(filePath)) {
                return {
                    ok: false,
                    error: { code: 'FILE_NOT_FOUND', message: `No file at ${filePath}` },
                };
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            const result = this.importFromString(content);
            if (result.ok && this.kernel) {
                this.kernel.logger.info('[JSON Importer] Imported file', {
                    filePath,
                    game: result.envelope?.game.id,
                    crossGame: result.crossGame,
                });
            }
            return result;
        } catch (err) {
            return {
                ok: false,
                error: {
                    code: 'FILE_READ_FAILED',
                    message: err instanceof Error ? err.message : String(err),
                },
            };
        }
    }

    /**
     * Build an envelope and write it to disk.
     */
    exportToFile(filePath: string, payload: unknown = {}, options: ExportOptions = {}): string {
        const json = this.exportToString(payload, options);
        const dir = path.dirname(filePath);
        if (dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, json, 'utf-8');
        this.state.exportCount += 1;
        this.state.lastExportAt = Date.now();
        this.kernel?.logger.info('[JSON Importer] Exported file', { filePath });
        return filePath;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────

    private buildEnvelope(payload: unknown, options: ExportOptions): ExportEnvelope {
        const gameInfo = options.gameOverride ?? this.getActiveGameInfo();
        return {
            schemaVersion: this.getConfig().schemaVersion,
            exportedAt: new Date().toISOString(),
            exportedBy: `frequency-manager@${this.getAppVersion()}/json-importer@1.0.0`,
            game: gameInfo,
            description: options.description,
            payload,
        };
    }

    private getConfig(): {
        exportPath: string;
        prettyPrint: boolean;
        schemaVersion: string;
    } {
        const cfg = (this.kernel?.config.getAll() ?? {}) as {
            jsonImporter?: { exportPath?: string; prettyPrint?: boolean; schemaVersion?: string };
        };
        return {
            exportPath: cfg.jsonImporter?.exportPath ?? 'frequency-manager-export.json',
            prettyPrint: cfg.jsonImporter?.prettyPrint ?? true,
            schemaVersion: cfg.jsonImporter?.schemaVersion ?? '1.0',
        };
    }

    private getActiveGame(): GameDefinition | null {
        const cfg = (this.kernel?.config.getAll() ?? {}) as {
            game?: { definition?: GameDefinition };
        };
        return cfg.game?.definition ?? null;
    }

    private getActiveGameInfo(): { id: string; version: string; displayName: string } {
        const def = this.getActiveGame();
        if (def) {
            return { id: def.id, version: def.version, displayName: def.displayName };
        }
        return { id: 'unknown', version: '0.0.0', displayName: 'Unknown Game' };
    }

    private getAppVersion(): string {
        const cfg = (this.kernel?.config.getAll() ?? {}) as { version?: string };
        return cfg.version ?? '0.0.0';
    }

    private isEnvelope(obj: unknown): obj is ExportEnvelope {
        if (typeof obj !== 'object' || obj === null) return false;
        const o = obj as Record<string, unknown>;
        return (
            typeof o.schemaVersion === 'string'
            && typeof o.exportedAt === 'string'
            && typeof o.exportedBy === 'string'
            && typeof o.game === 'object' && o.game !== null
            && 'payload' in o
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Module interface
    // ─────────────────────────────────────────────────────────────────────────

    async configure(_config: Record<string, unknown>): Promise<void> {
        // Re-read config on the next export. Nothing else to do.
    }

    async shutdown(): Promise<void> {
        this.health = 'unloaded';
        this.kernel?.logger.info('[JSON Importer] Module shutdown');
    }

    async healthCheck(): Promise<ModuleHealthStatus> {
        this.health = 'healthy';
        return 'healthy';
    }

    getState(): ModuleState {
        return {
            moduleId: this.moduleId,
            health: this.health,
            uptime: this.state.lastExportAt ? Date.now() - this.state.lastExportAt : 0,
            data: { ...this.state },
            lastHealthCheck: Date.now(),
            loadedAt: this.state.lastExportAt ?? Date.now(),
        };
    }
}

/**
 * Module factory function
 */
const factory: ModuleFactory = async (_options: ModuleLoaderOptions): Promise<ModuleAPI> => {
    const module = new JsonImporterModule(manifest);
    return module;
};

export default factory;