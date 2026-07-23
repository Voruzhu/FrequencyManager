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
    /** Returns false if the key was rejected (see `DANGEROUS_KEYS`) or the
     * write to disk failed — callers that need the user to know a save
     * didn't actually happen should check this rather than assume success. */
    set(key: string, value: unknown): boolean;
    delete(key: string): void;
    has(key: string): boolean;
    keys(): string[];
    getAll(): Record<string, unknown>;
    clear(): void;
}

// Keys that would hit Object.prototype's own accessor on plain bracket
// assignment (`this.data[key] = value`), letting a crafted import JSON with
// one of these as a literal top-level key swap this instance's OWN prototype
// out from under it — contained (never touches the real global
// Object.prototype, since this is a per-instance assignment) but a genuine
// correctness bug: every `key in this.data` / `this.data[key]` call
// afterward would silently misbehave for the rest of the session. Rejected
// outright rather than merely worked around, since no legitimate storage key
// is ever named this.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

    private persist(): boolean {
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            // Write to a temp file then rename for atomicity.
            const tmp = `${this.file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
            fs.renameSync(tmp, this.file);
            return true;
        } catch {
            // A failed write must not crash the app, but callers that care
            // whether the save actually landed need to know it didn't —
            // see `StorageAdapter.set`'s return value.
            return false;
        }
    }

    get<T = unknown>(key: string, fallback?: T): T {
        return (key in this.data ? this.data[key] : fallback) as T;
    }
    set(key: string, value: unknown): boolean {
        if (DANGEROUS_KEYS.has(key)) return false;
        this.data[key] = value;
        return this.persist();
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
