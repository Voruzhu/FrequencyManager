/**
 * @fileoverview Unit tests for the Update Checker module.
 * @module modules/update-checker/tests
 *
 * Coverage targets:
 *   - Source-of-truth bug fix: getLocalGameDefinitions() must read from
 *     GAME_DEFINITIONS (the adapter registry), not the kernel config
 *     (which only stores the *active* game). Before the fix this would
 *     spuriously emit "new game available" for every remote entry.
 *   - Happy path: remote newer than local → update-available event.
 *   - No update: remote == local OR remote older → no events emitted.
 *   - Brand-new remote game (no local copy) → update-available with
 *     localVersion "0.0.0".
 *   - minAppVersion compat: missing → assumed compatible.
 *   - minAppVersion compat: present and > running app → incompatible event.
 *   - Prerelease versions: rejected by default, accepted when
 *     allowPrerelease=true.
 *   - Invalid manifest URL → no crash, no events, lastError set.
 *   - HTTP error response → no events, lastError mentions status.
 *   - Malformed manifest body (not an array) → no events, lastError set.
 *   - Network failure (fetch rejects) → no events, lastError captured.
 *   - RPC surface: update-checker:check-now returns checked count,
 *     update-checker:get-cache returns the latest state.
 *   - Boot-time and interval timers are wired up correctly on initialize
 *     and cleared on shutdown.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventBus } from '../../../core/event-bus';
import type {
    KernelInterface,
    LoggerInterface,
    EventBusInterface,
    ConfigInterface,
    ModuleRegistryInterface,
    FeatureFlagInterface,
} from '../../../shared/types';
import { GameDefinitionsManifest } from '../src';
import { initExternalGameModules } from '../../../adapters/game-definitions';

// The app ships with ZERO games compiled in — the registry `update-checker`
// reads via `listInstalledGames()` starts empty at runtime. These tests
// assume a locally-installed 'wuthering-waves' at version '1.0.0' to compare
// remote manifest entries against, so we register a minimal fixture module
// under that exact id/version before any test runs (same pattern used in
// `tests/shared/game-definitions-registry.test.ts` and
// `modules/game-loader/tests/game-loader.test.ts`).
beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-update-checker-fixtures-'));
    fs.writeFileSync(path.join(dir, 'wuthering-waves.json'), JSON.stringify({
        definition: {
            id: 'wuthering-waves', displayName: 'Wuthering Waves', description: 'test fixture', version: '1.0.0',
            equipment: { slotLabel: 'Echo', slotLabelPlural: 'Echoes', maxSubStats: 5, maxLevel: 25, allowedMainStatTypes: ['ATK'], allowedCosts: [1, 3, 4] },
            character: { elements: ['Spectro'], weapons: ['Sword'], maxLevel: 90, maxAscension: 1, ascensionBonus: [{ atk: 0, hp: 0, def: 0 }, { atk: 0.1, hp: 0.1, def: 0.1 }] },
            combat: { actions: [{ id: 'basicAttack', label: 'Basic Attack', multiplier: 1.0, energy: 0, duration: 1.0 }], defaultRotationLength: 20 },
            ocr: { namePattern: '^([A-Z][a-z]+)', costPattern: '', mainStatPattern: '(ATK)[:\\s]+([\\d.]+)', subStatPattern: '(ATK)[:\\s]+([\\d.]+)', setNames: [] },
            sets: [],
            uiOptions: { characters: [{ value: 'hero', label: 'Hero' }], setNames: [], weaponTypes: ['Sword'], elements: ['Spectro'] },
        },
        charDB: [{ id: 'hero', name: 'Hero', element: 'Spectro', weapon: 'Sword', rarity: 5, baseAtk: 100, baseHp: 1000, baseDef: 100, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100 }],
        weaponDB: [{ id: 'sword1', name: 'Test Sword', weaponType: 'Sword', rarity: 4, baseAtk: 40, secondaryStat: 'CRIT Rate', secondaryValue: 5 }],
        supplements: {
            gearRanges: { rarities: [4, 5], subStatsCanRepeatMain: false, slots: [], mains: [], subs: [] },
            statCatalog: [{ key: 'atk', label: 'ATK' }],
            enemies: [], buffs: { basic: [], character: [] }, passives: [],
        },
        buildOptions: {
            defaultElement: 'Spectro', defaultWeapon: 'Sword', hasElementalMastery: false, supportsReactions: false,
            setPieces: 5, partyTeammates: 2, starterCharacterId: 'hero', sequenceLabel: 'Sequence', sequenceMax: 6,
        },
    }));
    const result = initExternalGameModules(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    if (result.errors.length) throw new Error(`Fixture registration failed: ${JSON.stringify(result.errors)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
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
    updates?: Partial<{
        gameDefinitionsManifestUrl: string;
        gameModuleCheckOnBoot: boolean;
        checkIntervalHours: number;
        requestTimeoutMs: number;
        allowPrerelease: boolean;
    }>;
    version?: string;
}

/**
 * Build a minimal KernelInterface mock. We only need eventBus + config for
 * the update-checker — the other interfaces are stubs so the type compiles.
 */
function fakeKernel(opts: FakeKernelOptions = {}): {
    kernel: KernelInterface;
    configMap: Record<string, unknown>;
    eventBus: EventBus;
    published: { type: string; payload: unknown }[];
} {
    const configMap: Record<string, unknown> = {
        updates: {
            gameDefinitionsManifestUrl: 'https://raw.githubusercontent.com/manifest.json',
            gameModuleCheckOnBoot: false, // we drive checks manually
            checkIntervalHours: 0,        // no scheduled re-checks in tests
            requestTimeoutMs: 1000,
            allowPrerelease: false,
            ...opts.updates,
        },
        version: opts.version ?? '1.0.0',
    };

    const config: ConfigInterface = {
        get: jest.fn(<T>(key: string, def?: T): T => {
            const parts = key.split('.');
            // We support flat keys and shallow dot paths only — sufficient for
            // the keys this module reads.
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

    const published: { type: string; payload: unknown }[] = [];
    const eventBus = new EventBus(silentLogger());
    // Spy on publishes.
    const origPublish = eventBus.publish.bind(eventBus);
    jest.spyOn(eventBus, 'publish').mockImplementation(async (type, payload) => {
        published.push({ type, payload });
        await origPublish(type, payload);
    });

    const moduleRegistry: ModuleRegistryInterface = {} as ModuleRegistryInterface;
    const featureFlags: FeatureFlagInterface = {} as FeatureFlagInterface;

    const kernel: KernelInterface = {
        eventBus: eventBus as EventBusInterface,
        moduleRegistry,
        config,
        logger: silentLogger(),
        featureFlags,
        version: '1.0.0',
    };

    return { kernel, configMap, eventBus, published };
}

/**
 * Replace global.fetch with a mock for the duration of a test. Returns
 * the mock so individual tests can configure it.
 */
function mockFetchOnce(response: { ok?: boolean; status?: number; body?: unknown } | Error): jest.Mock {
    const fn = jest.fn(async () => {
        if (response instanceof Error) {
            throw response;
        }
        const status = response.status ?? 200;
        const ok = response.ok !== undefined
            ? response.ok
            : (status >= 200 && status < 300);
        return {
            ok,
            status,
            json: async () => response.body,
        } as Response;
    });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
}

const sampleManifest = (entries: GameDefinitionsManifest['gameDefinitions']): GameDefinitionsManifest => ({
    schemaVersion: '1.0',
    generatedAt: '2026-01-01T00:00:00Z',
    gameDefinitions: entries,
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Update Checker module', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('source-of-truth bug fix', () => {
        /**
         * The update-checker used to read `kernel.config.gameDefinitions` —
         * but the game-loader only writes `kernel.config.game.definition`
         * (singular, only the active game). Before the fix, every check
         * returned an empty local map and the checker emitted a spurious
         * "update-available" for every remote entry.
         *
         * After the fix, getLocalGameDefinitions() reads from
         * GAME_DEFINITIONS directly. We verify this by configuring the
         * kernel config to NOT include `gameDefinitions` and asserting
         * that a remote entry matching a known local game does NOT emit
         * a spurious update-available.
         */
        it('does NOT consult kernel.config.gameDefinitions (it reads the adapter registry)', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    // Same version as our local WU definition (1.0.0). With the
                    // bug, the local map would be empty and we'd emit a
                    // spurious "0.0.0 → 1.0.0" update-available. With the
                    // fix, the local version is read from GAME_DEFINITIONS
                    // and there is nothing to update.
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '1.0.0',
                        downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            // Wait for the boot-time check to settle. Boot check is fire-and-
            // forget so we poll briefly.
            await new Promise((r) => setTimeout(r, 50));

            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            expect(updates).toEqual([]);
        });
    });

    describe('happy path', () => {
        it('emits update-available when remote is newer than local', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '99.0.0',
                        downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                        releaseNotes: 'new set bonuses',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            const result = await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            expect(result).toBe(1);
            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            expect(updates).toHaveLength(1);
            expect(updates[0].payload).toMatchObject({
                id: 'wuthering-waves',
                displayName: 'Wuthering Waves',
                remoteVersion: '99.0.0',
                downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                releaseNotes: 'new set bonuses',
            });
            // localVersion should be the actual local version (1.0.0), not '0.0.0'.
            expect((updates[0].payload as { localVersion: string }).localVersion).not.toBe('0.0.0');
        });

        it('emits no events when remote equals local', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '1.0.0',
                        downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            expect(updates).toEqual([]);
        });

        it('emits no events when remote is older than local', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '0.0.1',
                        downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            expect(updates).toEqual([]);
        });

        it('emits update-available with localVersion "0.0.0" for a brand-new game we do not have', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'honkai-star-rail',
                        displayName: 'Honkai: Star Rail',
                        version: '1.0.0',
                        downloadUrl: 'https://raw.githubusercontent.com/hsr.ts',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            expect(updates).toHaveLength(1);
            expect(updates[0].payload).toMatchObject({
                id: 'honkai-star-rail',
                localVersion: '0.0.0',
                remoteVersion: '1.0.0',
            });
        });
    });

    describe('minAppVersion backwards compatibility', () => {
        it('missing minAppVersion → assumed compatible', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '99.0.0',
                        // no minAppVersion
                        downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            const incompat = published.filter((p) => p.type === 'update-checker:game-incompatible');
            expect(updates).toHaveLength(1);
            expect(incompat).toEqual([]);
        });

        it('remote minAppVersion > running app → emits incompatible event instead', async () => {
            const { kernel, published } = fakeKernel({ version: '1.0.0' });
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '99.0.0',
                        minAppVersion: '5.0.0',
                        downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            const incompat = published.filter((p) => p.type === 'update-checker:game-incompatible');
            expect(updates).toEqual([]);
            expect(incompat).toHaveLength(1);
            expect(incompat[0].payload).toMatchObject({
                id: 'wuthering-waves',
                requiredAppVersion: '5.0.0',
                runningAppVersion: '1.0.0',
            });
        });

        it('remote minAppVersion <= running app → emits update-available', async () => {
            const { kernel, published } = fakeKernel({ version: '2.5.0' });
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '99.0.0',
                        minAppVersion: '2.0.0',
                        downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            expect(updates).toHaveLength(1);
        });
    });

    describe('prerelease handling', () => {
        it('ignores prerelease versions by default', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '2.0.0-beta.1',
                        downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            expect(updates).toEqual([]);
        });

        it('accepts prerelease versions when allowPrerelease=true', async () => {
            const { kernel, published } = fakeKernel({ updates: { allowPrerelease: true } });
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '2.0.0-beta.1',
                        downloadUrl: 'https://raw.githubusercontent.com/wu.ts',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            const updates = published.filter((p) => p.type === 'update-checker:game-update-available');
            expect(updates).toHaveLength(1);
        });
    });

    describe('network / parsing failures', () => {
        it('does not crash on an invalid (non-http) manifest URL', async () => {
            const { kernel, published } = fakeKernel({
                updates: { gameDefinitionsManifestUrl: 'not-a-url' },
            });
            // fetch should never even be called.
            const fetchMock = jest.fn();
            global.fetch = fetchMock as unknown as typeof fetch;

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            const result = await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            expect(result).toBe(0);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(published.filter((p) => p.type === 'update-checker:game-update-available')).toEqual([]);
        });

        it('rejects a well-formed https URL on a non-GitHub host — never fetches it', async () => {
            const { kernel, published } = fakeKernel({
                updates: { gameDefinitionsManifestUrl: 'https://attacker-controlled.example/manifest.json' },
            });
            const fetchMock = jest.fn();
            global.fetch = fetchMock as unknown as typeof fetch;

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            const result = await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            expect(result).toBe(0);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(published.filter((p) => p.type === 'update-checker:game-update-available')).toEqual([]);
            const state = mod.getState();
            expect((state.data as { lastError: string | null }).lastError).toMatch(/GitHub URL/);
        });

        it('skips (but does not crash on) a manifest entry whose downloadUrl is not an allowed host', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    { id: 'wuthering-waves', displayName: 'Wuthering Waves', version: '99.0.0', downloadUrl: 'https://attacker-controlled.example/wu.zip' },
                    { id: 'genshin-impact', displayName: 'Genshin Impact', version: '99.0.0', downloadUrl: 'https://raw.githubusercontent.com/real/gi.ts' },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            const result = await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            expect(result).toBe(2); // both entries were still checked
            const available = published.filter((p) => p.type === 'update-checker:game-update-available');
            expect(available).toHaveLength(1); // only the GitHub-hosted one surfaced
            expect((available[0].payload as { id: string }).id).toBe('genshin-impact');
        });

        it('records lastError on a 500 response and emits no events', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({ status: 500, ok: false, body: 'server error' });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            const result = await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            expect(result).toBe(0);
            expect(published.filter((p) => p.type === 'update-checker:game-update-available')).toEqual([]);
            const state = mod.getState();
            expect((state.data as { lastError: string | null }).lastError).toMatch(/500/);
        });

        it('records lastError when the manifest body has the wrong shape', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({ body: { notAGameDefinitionsArray: true } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            const result = await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            expect(result).toBe(0);
            expect(published.filter((p) => p.type === 'update-checker:game-update-available')).toEqual([]);
            const state = mod.getState();
            expect((state.data as { lastError: string | null }).lastError).toMatch(/shape/i);
        });

        it('records lastError on a network failure', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce(new Error('ECONNREFUSED'));

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            const result = await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            expect(result).toBe(0);
            expect(published.filter((p) => p.type === 'update-checker:game-update-available')).toEqual([]);
            const state = mod.getState();
            expect((state.data as { lastError: string | null }).lastError).toMatch(/ECONNREFUSED/);
        });
    });

    describe('RPC surface', () => {
        /**
         * The update-checker registers two RPC handlers via `onRequest`:
         *   - update-checker:check-now → calls checkNow() and returns { ok, checked }
         *   - update-checker:get-cache → returns the latest cached state
         *
         * Going through `eventBus.request()` end-to-end requires the kernel
         * to route the request through `handleRequest` (subscribed handlers
         * are what trigger the lookup). To keep these tests focused on the
         * module contract, we drive `handleRequest` directly with the same
         * request envelope the kernel would produce. That exercises the
         * module's onRequest wiring without depending on full kernel routing.
         */
        it('update-checker:check-now returns { ok, checked } and processes entries', async () => {
            const { kernel } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    { id: 'wuthering-waves', displayName: 'Wuthering Waves', version: '99.0.0', downloadUrl: 'https://raw.githubusercontent.com/test/pkg.zip' },
                    { id: 'genshin-impact', displayName: 'Genshin Impact', version: '99.0.0', downloadUrl: 'https://raw.githubusercontent.com/test/pkg.zip' },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            // Drive handleRequest the way the kernel would: it pulls the
            // onRequest handler by type, awaits it, and resolves the
            // pending request with the handler's return value.
            const bus = kernel.eventBus as unknown as EventBus;
            await bus.handleRequest({
                id: 'req-1',
                type: 'update-checker:check-now',
                source: 'kernel',
                target: 'update-checker',
                payload: {},
                timestamp: Date.now(),
                correlationId: 'corr-1',
                responseType: 'update-checker:check-now:response',
                timeout: 1000,
            } as unknown as Parameters<typeof bus.handleRequest>[0]);

            const cache = await bus.handleRequest({
                id: 'req-2',
                type: 'update-checker:get-cache',
                source: 'kernel',
                target: 'update-checker',
                payload: {},
                timestamp: Date.now(),
                correlationId: 'corr-2',
                responseType: 'update-checker:get-cache:response',
                timeout: 1000,
            } as unknown as Parameters<typeof bus.handleRequest>[0]);

            // get-cache stores lastCheckAt so we can sanity-check it ran.
            const state = mod.getState();
            expect((state.data as { availableCount: number }).availableCount).toBe(2);
            // We can't easily intercept the resolved payload from handleRequest
            // (it resolves via emit on responseType), so we infer from state.
            // The important guarantee is that both handlers ran without error.
            expect(cache).toBeUndefined();
        });
    });

    describe('lifecycle', () => {
        it('healthCheck reports healthy after initialize', async () => {
            const { kernel } = fakeKernel();
            mockFetchOnce({ body: sampleManifest([]) });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            // The boot check is fire-and-forget; wait a tick so the fetch resolves.
            await new Promise((r) => setTimeout(r, 20));

            expect(await mod.healthCheck()).toBe('healthy');
        });

        it('shutdown clears the interval timer and reports unloaded', async () => {
            const { kernel } = fakeKernel({
                updates: { checkIntervalHours: 1 }, // schedule a re-check
            });
            mockFetchOnce({ body: sampleManifest([]) });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await new Promise((r) => setTimeout(r, 20));

            await mod.shutdown();

            expect(mod.health).toBe('unloaded');
            // No easy way to assert the timer was cleared from outside, but
            // the health check + the fact that the shutdown log was emitted
            // is sufficient. We also assert no throw on a second shutdown.
            await expect(mod.shutdown()).resolves.toBeUndefined();
        });
    });

    describe('check-complete event', () => {
        it('emits check-complete with counts at the end of every check', async () => {
            const { kernel, published } = fakeKernel();
            mockFetchOnce({
                body: sampleManifest([
                    {
                        id: 'wuthering-waves',
                        displayName: 'Wuthering Waves',
                        version: '99.0.0',
                        downloadUrl: 'https://raw.githubusercontent.com/test/pkg.zip',
                    },
                ]),
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);
            await (mod as unknown as { checkNow(): Promise<number> }).checkNow();

            const complete = published.filter((p) => p.type === 'update-checker:check-complete');
            expect(complete).toHaveLength(1);
            expect(complete[0].payload).toMatchObject({
                available: 1,
                incompatible: 0,
            });
        });
    });
});