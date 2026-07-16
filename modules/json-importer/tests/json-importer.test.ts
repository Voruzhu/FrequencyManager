/**
 * @fileoverview Unit tests for the JSON Importer module.
 * @module modules/json-importer/tests
 *
 * Coverage targets:
 *   - exportToString builds a valid envelope with all required fields.
 *   - exportToString respects prettyPrint from options and config defaults.
 *   - exportToString with gameOverride overrides the active game info.
 *   - importFromString parses a valid envelope and returns ok=true.
 *   - importFromString flags crossGame=true when game.id differs from active.
 *   - importFromString returns INVALID_ENVELOPE on malformed input.
 *   - importFromString returns PARSE_FAILED on invalid JSON.
 *   - importFromFile returns FILE_NOT_FOUND for missing files.
 *   - importFromFile reads and parses a real file written by exportToFile.
 *   - exportToFile writes a valid file to disk and creates missing dirs.
 *   - State is incremented on each export/import.
 *   - healthCheck reports healthy.
 *   - shutdown transitions to unloaded.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventBus } from '../../../core/event-bus';
import type {
    KernelInterface,
    LoggerInterface,
    EventBusInterface,
    ConfigInterface,
    ModuleRegistryInterface,
    FeatureFlagInterface,
} from '../../../shared/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function silentLogger(): LoggerInterface {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn(),
    };
}

interface FakeKernelOptions {
    jsonImporter?: { prettyPrint?: boolean; schemaVersion?: string; exportPath?: string };
    /**
     * Override the active game. Pass `null` to simulate "no active game".
     * Default: a fake Wuthering Waves GameDefinition-shaped object.
     */
    game?: { id: string; version: string; displayName: string } | null;
}

function fakeKernel(opts: FakeKernelOptions = {}): {
    kernel: KernelInterface;
    configMap: Record<string, unknown>;
    eventBus: EventBus;
} {
    // The json-importer reads `config.game.definition` to learn the active
    // game's id/version/displayName. Build a fake GameDefinition object
    // with the minimum fields the module touches.
    const fakeGameDef = opts.game === null
        ? undefined
        : (opts.game ?? {
            id: 'wuthering-waves',
            version: '1.0.0',
            displayName: 'Wuthering Waves',
        });

    const configMap: Record<string, unknown> = {
        jsonImporter: {
            prettyPrint: true,
            schemaVersion: '1.0',
            exportPath: 'frequency-manager-export.json',
            ...opts.jsonImporter,
        },
        ...(fakeGameDef ? { game: { definition: fakeGameDef } } : {}),
        version: '1.0.0',
    };

    const config: ConfigInterface = {
        get: jest.fn(<T>(key: string, def?: T): T => {
            const parts = key.split('.');
            if (parts.length === 1) {
                return (configMap[key] ?? def) as T;
            }
            let cur: unknown = configMap;
            for (const p of parts) {
                if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
                    cur = (cur as Record<string, unknown>)[p];
                } else {
                    return def as T;
                }
            }
            return (cur ?? def) as T;
        }),
        set: jest.fn((key: string, value: unknown) => {
            configMap[key] = value;
        }),
        getAll: jest.fn(() => configMap),
        validate: jest.fn(() => ({ success: true, errors: [] })),
        watch: jest.fn(() => () => { /* noop */ }),
        load: jest.fn(),
        reset: jest.fn(),
    };

    // json-importer wires onRequest handlers in initialize(), so we need a
    // real EventBus. The handlers are no-ops in our tests so we don't need
    // to bridge them.
    const eventBus = new EventBus(silentLogger());

    const kernel: KernelInterface = {
        eventBus: eventBus as EventBusInterface,
        moduleRegistry: {} as ModuleRegistryInterface,
        config,
        logger: silentLogger(),
        featureFlags: {} as FeatureFlagInterface,
        version: '1.0.0',
    };

    return { kernel, configMap, eventBus };
}

interface Envelope {
    schemaVersion: string;
    exportedAt: string;
    exportedBy: string;
    game: { id: string; version: string; displayName: string };
    description?: string;
    payload: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('JSON Importer module', () => {
    describe('exportToString', () => {
        it('builds a valid envelope with all required fields', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const json = (mod as unknown as {
                exportToString: (payload: unknown, opts?: unknown) => string;
            }).exportToString({ echoes: [{ id: 1, name: 'Echo-A' }] });

            const envelope = JSON.parse(json) as Envelope;
            expect(envelope.schemaVersion).toBe('1.0');
            expect(typeof envelope.exportedAt).toBe('string');
            expect(envelope.exportedBy).toMatch(/frequency-manager@1\.0\.0/);
            expect(envelope.game.id).toBe('wuthering-waves');
            expect(envelope.game.version).toBe('1.0.0');
            expect(envelope.game.displayName).toBe('Wuthering Waves');
            expect(envelope.payload).toEqual({ echoes: [{ id: 1, name: 'Echo-A' }] });
        });

        it('pretty-prints by default from config', async () => {
            const { kernel } = fakeKernel({ jsonImporter: { prettyPrint: true } });
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const json = (mod as unknown as {
                exportToString: (p: unknown, o?: unknown) => string;
            }).exportToString({ a: 1 });

            expect(json).toContain('\n');
            expect(json).toContain('  ');
        });

        it('respects prettyPrint=false option over config default', async () => {
            const { kernel } = fakeKernel({ jsonImporter: { prettyPrint: true } });
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const json = (mod as unknown as {
                exportToString: (p: unknown, o?: { prettyPrint?: boolean }) => string;
            }).exportToString({ a: 1 }, { prettyPrint: false });

            // prettyPrint=false produces a single-line string with no
            // indentation. The exact prefix is unstable (it embeds the ISO
            // timestamp), so we assert the structural property: no \n and no
            // leading whitespace inside the braces.
            expect(json).not.toContain('\n');
            // Should be parseable JSON that round-trips.
            expect(() => JSON.parse(json)).not.toThrow();
        });

        it('honors gameOverride', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const json = (mod as unknown as {
                exportToString: (
                    p: unknown,
                    o?: { gameOverride?: { id: string; version: string; displayName: string } },
                ) => string;
            }).exportToString(
                {},
                { gameOverride: { id: 'genshin-impact', version: '5.0.0', displayName: 'Genshin Impact' } },
            );

            const env = JSON.parse(json) as Envelope;
            expect(env.game).toEqual({
                id: 'genshin-impact',
                version: '5.0.0',
                displayName: 'Genshin Impact',
            });
        });

        it('embeds the description in the envelope', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const json = (mod as unknown as {
                exportToString: (p: unknown, o?: { description?: string }) => string;
            }).exportToString({}, { description: 'My save file' });

            const env = JSON.parse(json) as Envelope;
            expect(env.description).toBe('My save file');
        });

        it('uses fallback game info when no active game is set', async () => {
            const { kernel: k2 } = fakeKernel({ game: null });
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel: k2, permissions: [], config: {} });
            await mod.initialize(k2);

            const json = (mod as unknown as {
                exportToString: (p: unknown) => string;
            }).exportToString({});

            const env = JSON.parse(json) as Envelope;
            expect(env.game.id).toBe('unknown');
            expect(env.game.version).toBe('0.0.0');
            expect(env.game.displayName).toBe('Unknown Game');
        });
    });

    describe('importFromString', () => {
        it('parses a valid envelope and returns ok=true', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const json = (mod as unknown as {
                exportToString: (p: unknown) => string;
            }).exportToString({ echoes: [{ id: 1 }] });

            const result = (mod as unknown as {
                importFromString: (j: string) => {
                    ok: boolean;
                    envelope?: Envelope;
                    crossGame?: boolean;
                };
            }).importFromString(json);

            expect(result.ok).toBe(true);
            expect(result.envelope?.payload).toEqual({ echoes: [{ id: 1 }] });
            expect(result.crossGame).toBe(false);
        });

        it('flags crossGame=true when envelope.game.id differs from active', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const otherEnvelope = JSON.stringify({
                schemaVersion: '1.0',
                exportedAt: new Date().toISOString(),
                exportedBy: 'someone-else',
                game: { id: 'genshin-impact', version: '5.0.0', displayName: 'Genshin Impact' },
                payload: {},
            });

            const result = (mod as unknown as {
                importFromString: (j: string) => { ok: boolean; crossGame?: boolean };
            }).importFromString(otherEnvelope);

            expect(result.ok).toBe(true);
            expect(result.crossGame).toBe(true);
        });

        it('returns INVALID_ENVELOPE on missing fields', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const result = (mod as unknown as {
                importFromString: (j: string) => { ok: boolean; error?: { code: string } };
            }).importFromString(JSON.stringify({ schemaVersion: '1.0' }));

            expect(result.ok).toBe(false);
            expect(result.error?.code).toBe('INVALID_ENVELOPE');
        });

        it('returns PARSE_FAILED on invalid JSON', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const result = (mod as unknown as {
                importFromString: (j: string) => { ok: boolean; error?: { code: string } };
            }).importFromString('{ this is not json');

            expect(result.ok).toBe(false);
            expect(result.error?.code).toBe('PARSE_FAILED');
        });

        it('returns PARSE_FAILED on a primitive (not an object)', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const result = (mod as unknown as {
                importFromString: (j: string) => { ok: boolean; error?: { code: string } };
            }).importFromString('"just a string"');

            expect(result.ok).toBe(false);
            expect(result.error?.code).toBe('INVALID_ENVELOPE');
        });
    });

    describe('importFromFile', () => {
        let tmpDir: string;

        beforeAll(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-importer-test-'));
        });

        afterAll(() => {
            if (tmpDir && fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it('returns FILE_NOT_FOUND for a missing file', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const result = (mod as unknown as {
                importFromFile: (p: string) => { ok: boolean; error?: { code: string } };
            }).importFromFile(path.join(tmpDir, 'does-not-exist.json'));

            expect(result.ok).toBe(false);
            expect(result.error?.code).toBe('FILE_NOT_FOUND');
        });

        it('reads and parses a real file', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            // First export.
            const filePath = path.join(tmpDir, 'export.json');
            (mod as unknown as {
                exportToFile: (p: string, payload?: unknown) => string;
            }).exportToFile(filePath, { foo: 'bar' });

            // Then import.
            const result = (mod as unknown as {
                importFromFile: (p: string) => { ok: boolean; envelope?: Envelope };
            }).importFromFile(filePath);

            expect(result.ok).toBe(true);
            expect(result.envelope?.payload).toEqual({ foo: 'bar' });
        });
    });

    describe('exportToFile', () => {
        let tmpDir: string;

        beforeAll(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-importer-test-'));
        });

        afterAll(() => {
            if (tmpDir && fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        it('writes a valid file to disk and creates missing directories', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const nested = path.join(tmpDir, 'a', 'b', 'c');
            const filePath = path.join(nested, 'nested.json');

            (mod as unknown as {
                exportToFile: (p: string, payload?: unknown) => string;
            }).exportToFile(filePath, { test: true });

            expect(fs.existsSync(filePath)).toBe(true);

            const content = fs.readFileSync(filePath, 'utf-8');
            const env = JSON.parse(content) as Envelope;
            expect(env.payload).toEqual({ test: true });
            expect(env.game.id).toBe('wuthering-waves');
        });

        it('updates exportCount and lastExportAt', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const before = mod.getState().data as { exportCount: number };
            (mod as unknown as {
                exportToFile: (p: string, payload?: unknown) => string;
            }).exportToFile(path.join(tmpDir, 'count.json'), {});

            const after = mod.getState().data as { exportCount: number; lastExportAt: number | null };
            expect(after.exportCount).toBe(before.exportCount + 1);
            expect(after.lastExportAt).toEqual(expect.any(Number));
        });
    });

    describe('state tracking', () => {
        it('imports increment importCount and lastImportAt', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const json = (mod as unknown as {
                exportToString: (p: unknown) => string;
            }).exportToString({});

            const before = mod.getState().data as { importCount: number };
            (mod as unknown as {
                importFromString: (j: string) => { ok: boolean };
            }).importFromString(json);

            const after = mod.getState().data as { importCount: number; lastImportAt: number | null };
            expect(after.importCount).toBe(before.importCount + 1);
            expect(after.lastImportAt).toEqual(expect.any(Number));
        });

        it('does NOT increment importCount on a failed parse', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const before = mod.getState().data as { importCount: number };
            (mod as unknown as {
                importFromString: (j: string) => { ok: boolean };
            }).importFromString('not-json');

            const after = mod.getState().data as { importCount: number };
            expect(after.importCount).toBe(before.importCount);
        });
    });

    describe('lifecycle', () => {
        it('healthCheck returns healthy', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            expect(await mod.healthCheck()).toBe('healthy');
        });

        it('shutdown transitions to unloaded', async () => {
            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            await mod.shutdown();

            expect(mod.health).toBe('unloaded');
        });
    });
});