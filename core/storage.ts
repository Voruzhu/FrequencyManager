/**
 * @fileoverview Durable key-value storage adapter
 * @module core/storage
 *
 * A minimal JSON-file-backed key-value store for USER data that must survive
 * restarts — scanned echoes/artifacts, per-character equipped loadouts, saved
 * builds, and scan history. This is deliberately separate from the in-memory
 * ConfigSystem (which holds ephemeral app config) and from the static
 * GameDefinition database.
 *
 * The main process constructs it against Electron's userData directory and
 * exposes CRUD over IPC; modules can be handed the same instance.
 *
 * WHY not electron-store: keeping this dependency-free and unit-testable — it is
 * a plain fs adapter that takes an explicit directory, so it works headless too.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface StorageAdapter {
    get<T = unknown>(key: string, fallback?: T): T;
    set(key: string, value: unknown): void;
    delete(key: string): void;
    has(key: string): boolean;
    keys(): string[];
    getAll(): Record<string, unknown>;
    clear(): void;
}

export class FileStorage implements StorageAdapter {
    private readonly file: string;
    private data: Record<string, unknown> = {};

    constructor(dir: string, fileName = 'user-data.json') {
        this.file = path.join(dir, fileName);
        this.load();
    }

    private load(): void {
        try {
            if (fs.existsSync(this.file)) {
                this.data = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Record<string, unknown>;
            }
        } catch {
            // Corrupt/unreadable file — start fresh rather than crash.
            this.data = {};
        }
    }

    private persist(): void {
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            // Write to a temp file then rename for atomicity.
            const tmp = `${this.file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
            fs.renameSync(tmp, this.file);
        } catch {
            /* best-effort; a failed write must not crash the app */
        }
    }

    get<T = unknown>(key: string, fallback?: T): T {
        return (key in this.data ? this.data[key] : fallback) as T;
    }
    set(key: string, value: unknown): void {
        this.data[key] = value;
        this.persist();
    }
    delete(key: string): void {
        delete this.data[key];
        this.persist();
    }
    has(key: string): boolean {
        return key in this.data;
    }
    keys(): string[] {
        return Object.keys(this.data);
    }
    getAll(): Record<string, unknown> {
        return { ...this.data };
    }
    clear(): void {
        this.data = {};
        this.persist();
    }

    /** Absolute path of the backing file (for diagnostics). */
    get filePath(): string {
        return this.file;
    }
}
