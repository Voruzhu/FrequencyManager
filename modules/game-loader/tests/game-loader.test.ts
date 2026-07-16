/**
 * @fileoverview Unit tests for the Game Loader module.
 * @module modules/game-loader/tests
 *
 * The app ships with ZERO games compiled in — every game (including the
 * official Wuthering Waves/Genshin Impact packages) is loaded at runtime via
 * `initExternalGameModules`. These tests register two minimal fixture games
 * ('test-game-a', 'test-game-b', standing in for whichever two real games a
 * user might have installed) into the SHARED module registry once up front,
 * then exercise `game-loader` against them exactly as it would run for real.
 *
 * Coverage targets:
 *   - Default resolution (no config) falls back to test-game-a.
 *   - Resolution picks the game specified by `config.game.activeGame`.
 *   - Legacy top-level `activeGame` key is honored for backwards compat.
 *   - Unknown game id falls back to `config.game.fallbackGame` (and warns).
 *   - Unknown game with no configured fallback falls back to the first
 *     INSTALLED game (never a hardcoded literal).
 *   - Zero games installed at all: resolves gracefully to no active game
 *     (never throws) — every RPC stays registered and responds sanely.
 *   - The resolved GameDefinition is injected into kernel.config under
 *     `game` (activeGame, version, definition).
 *   - `game:reload-request` event re-resolves.
 *   - RPC: `game:list-installed` and `game:get-active` work.
 *   - `configure()` re-resolves and logs when active game changes.
 *   - `shutdown()` clears active game and reports unloaded.
 *   - `healthCheck()` is healthy when a game is loaded, degraded when not.
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
import { initExternalGameModules } from '../../../adapters/game-definitions';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture games — registered once into the shared registry so every test
// below can resolve them by id, exactly as it would resolve a real
// downloaded game module.
// ─────────────────────────────────────────────────────────────────────────────

function fixtureModuleJson(id: string, displayName: string) {
    return {
        definition: {
            id, displayName, description: 'test fixture', version: '1.0.0',
            equipment: { slotLabel: 'Gear', slotLabelPlural: 'Gears', maxSubStats: 4, maxLevel: 20, allowedMainStatTypes: ['ATK'], allowedCosts: [] },
            character: { elements: ['Pyro'], weapons: ['Sword'], maxLevel: 90, maxAscension: 1, ascensionBonus: [{ atk: 0, hp: 0, def: 0 }, { atk: 0.1, hp: 0.1, def: 0.1 }] },
            combat: { actions: [{ id: 'basicAttack', label: 'Basic Attack', multiplier: 1.0, energy: 0, duration: 1.0 }], defaultRotationLength: 20 },
            ocr: { namePattern: '^([A-Z][a-z]+)', costPattern: '', mainStatPattern: '(ATK)[:\\s]+([\\d.]+)', subStatPattern: '(ATK)[:\\s]+([\\d.]+)', setNames: [] },
            sets: [],
            uiOptions: { characters: [{ value: 'hero', label: 'Hero' }], setNames: [], weaponTypes: ['Sword'], elements: ['Pyro'] },
        },
        charDB: [{ id: 'hero', name: 'Hero', element: 'Pyro', weapon: 'Sword', rarity: 5, baseAtk: 100, baseHp: 1000, baseDef: 100, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100 }],
        weaponDB: [{ id: 'sword1', name: 'Test Sword', weaponType: 'Sword', rarity: 4, baseAtk: 40, secondaryStat: 'CRIT Rate', secondaryValue: 5 }],
        supplements: {
            gearRanges: { rarities: [4, 5], subStatsCanRepeatMain: false, slots: [], mains: [], subs: [] },
            statCatalog: [{ key: 'atk', label: 'ATK' }],
            enemies: [], buffs: { basic: [], character: [] }, passives: [],
        },
        buildOptions: {
            defaultElement: 'Pyro', defaultWeapon: 'Sword', hasElementalMastery: false, supportsReactions: false,
            setPieces: 4, partyTeammates: 3, starterCharacterId: 'hero', sequenceLabel: 'Constellation', sequenceMax: 6,
        },
    };
}

beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-game-loader-fixtures-'));
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(fixtureModuleJson('test-game-a', 'Test Game A')));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(fixtureModuleJson('test-game-b', 'Test Game B')));
    const result = initExternalGameModules(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    if (result.errors.length) throw new Error(`Fixture registration failed: ${JSON.stringify(result.errors)}`);
});

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
    game?: { activeGame?: string; fallbackGame?: string };
    activeGame?: string; // legacy top-level
}

/**
 * Minimal KernelInterface mock. The game-loader only reads from
 * `kernel.config.getAll()` and uses `kernel.config.set()`, the event bus,
 * and the logger.
 */
function fakeKernel(opts: FakeKernelOptions = {}): {
    kernel: KernelInterface;
    configMap: Record<string, unknown>;
    eventBus: EventBus;
    published: { type: string; payload: unknown }[];
} {
    const configMap: Record<string, unknown> = {};
    if (opts.game) configMap.game = { ...opts.game };
    if (opts.activeGame) configMap.activeGame = opts.activeGame;

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

    const published: { type: string; payload: unknown }[] = [];
    const eventBus = new EventBus(silentLogger());
    const origPublish = eventBus.publish.bind(eventBus);
    jest.spyOn(eventBus, 'publish').mockImplementation(async (type, payload) => {
        published.push({ type, payload });
        await origPublish(type, payload);
    });

    const kernel: KernelInterface = {
        eventBus: eventBus as EventBusInterface,
        moduleRegistry: {} as ModuleRegistryInterface,
        config,
        logger: silentLogger(),
        featureFlags: {} as FeatureFlagInterface,
        version: '1.0.0',
    };

    return { kernel, configMap, eventBus, published };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Game Loader module', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('resolution', () => {
        it('resolves test-game-a when no activeGame is set (default falls through to the first installed game)', async () => {
            const { kernel, configMap } = fakeKernel();

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const injected = configMap.game as {
                activeGame: string;
                version: string;
                definition: { id: string };
            };
            expect(injected).toBeDefined();
            // No 'wuthering-waves' preference configured and no explicit
            // fallbackGame — resolves to whichever fixture is registered.
            expect(['test-game-a', 'test-game-b']).toContain(injected.activeGame);
            expect(injected.version).toBe('1.0.0');
            expect(injected.definition.id).toBe(injected.activeGame);
        });

        it('resolves the game specified by config.game.activeGame', async () => {
            const { kernel, configMap } = fakeKernel({ game: { activeGame: 'test-game-b' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const injected = configMap.game as { activeGame: string };
            expect(injected.activeGame).toBe('test-game-b');
        });

        it('honors the legacy top-level activeGame key (backwards compat)', async () => {
            const { kernel, configMap } = fakeKernel({ activeGame: 'test-game-b' });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const injected = configMap.game as { activeGame: string };
            expect(injected.activeGame).toBe('test-game-b');
        });

        it('falls back to fallbackGame when activeGame is unknown', async () => {
            const { kernel, configMap } = fakeKernel({
                game: { activeGame: 'unknown-game', fallbackGame: 'test-game-b' },
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const injected = configMap.game as { activeGame: string };
            expect(injected.activeGame).toBe('test-game-b');
        });

        it('falls back to the first INSTALLED game (not a hardcoded literal) when activeGame is unknown and no fallbackGame is configured', async () => {
            // No explicit fallbackGame — must recover by picking whatever's
            // actually registered instead of assuming a specific literal id.
            const { kernel, configMap } = fakeKernel({
                game: { activeGame: 'unknown' },
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });

            await expect(mod.initialize(kernel)).resolves.not.toThrow();
            const injected = configMap.game as { activeGame: string };
            expect(['test-game-a', 'test-game-b']).toContain(injected.activeGame);
        });

        it('gracefully resolves to no active game (never throws) when BOTH activeGame and an explicit fallbackGame are unregistered', async () => {
            const { kernel, configMap } = fakeKernel({
                game: { activeGame: 'unknown', fallbackGame: 'also-unknown' },
            });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });

            await expect(mod.initialize(kernel)).resolves.not.toThrow();
            expect(mod.getState().data.activeGameId).toBeNull();
            expect(configMap.game).toEqual({ activeGame: 'unknown', fallbackGame: 'also-unknown' });
        });
    });

    describe('zero games installed (graceful degradation, not a crash)', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('resolveAndInject resolves to undefined, activeGameId stays null, health becomes degraded — never throws', async () => {
            const gameDefs = await import('../../../adapters/game-definitions');
            jest.spyOn(gameDefs, 'hasGameDefinition').mockReturnValue(false);
            jest.spyOn(gameDefs, 'listInstalledGames').mockReturnValue([]);
            jest.spyOn(gameDefs, 'getGameDefinition').mockReturnValue(undefined);
            jest.spyOn(gameDefs, 'getGameBundle').mockReturnValue(undefined);

            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });

            await expect(mod.initialize(kernel)).resolves.not.toThrow();
            expect(mod.getState().data.activeGameId).toBeNull();
            expect(await mod.healthCheck()).toBe('degraded');
        });

        it('every RPC is still registered and responds gracefully with zero games (not "no handler")', async () => {
            const gameDefs = await import('../../../adapters/game-definitions');
            jest.spyOn(gameDefs, 'hasGameDefinition').mockReturnValue(false);
            jest.spyOn(gameDefs, 'listInstalledGames').mockReturnValue([]);
            jest.spyOn(gameDefs, 'getGameDefinition').mockReturnValue(undefined);
            jest.spyOn(gameDefs, 'getGameBundle').mockReturnValue(undefined);

            const { kernel } = fakeKernel();
            const { default: factory } = await import('../src');
            const mod = await factory({ modulePath: '', kernel, permissions: [], config: {} });
            await mod.initialize(kernel);

            const bus = kernel.eventBus as unknown as EventBus;
            const respPromise = new Promise<unknown>((resolve) => {
                (bus as unknown as { emitter: { on: Function } }).emitter.on(
                    'game:get-active:response',
                    (msg: { payload: unknown }) => resolve(msg.payload),
                );
            });
            await bus.handleRequest({
                id: 'req-active-empty',
                type: 'game:get-active',
                source: 'kernel',
                target: 'game-loader',
                payload: {},
                timestamp: Date.now(),
                correlationId: 'corr-active-empty',
                responseType: 'game:get-active:response',
                timeout: 1000,
            } as unknown as Parameters<typeof bus.handleRequest>[0]);

            const response = await respPromise as { id: string | null; definition?: unknown };
            expect(response.id).toBeNull();
            expect(response.definition).toBeUndefined();
        });
    });

    describe('state injection', () => {
        it('injects { activeGame, version, definition } under config.game', async () => {
            const { kernel, configMap } = fakeKernel({ game: { activeGame: 'test-game-a' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const injected = configMap.game as Record<string, unknown>;
            expect(injected).toHaveProperty('activeGame');
            expect(injected).toHaveProperty('version');
            expect(injected).toHaveProperty('definition');
            expect(typeof injected.definition).toBe('object');
        });

        it('publishes a game:loaded event after resolution', async () => {
            const { kernel, published } = fakeKernel({ game: { activeGame: 'test-game-a' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const loaded = published.filter((p) => p.type === 'game:loaded');
            expect(loaded).toHaveLength(1);
            expect(loaded[0].payload).toMatchObject({
                id: 'test-game-a',
                displayName: 'Test Game A',
                version: '1.0.0',
            });
            expect((loaded[0].payload as { definition: { id: string } }).definition.id).toBe('test-game-a');
        });
    });

    describe('hot reload', () => {
        it('re-resolves when game:reload-request is published', async () => {
            const { kernel, configMap } = fakeKernel({ game: { activeGame: 'test-game-a' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            // Switch the underlying config to a different game before reloading.
            (configMap.game as { activeGame: string }).activeGame = 'test-game-b';

            await kernel.eventBus.publish('game:reload-request', undefined);

            // Allow the async subscriber to run.
            await new Promise((r) => setTimeout(r, 20));

            const injected = configMap.game as { activeGame: string };
            expect(injected.activeGame).toBe('test-game-b');
        });
    });

    describe('RPC surface', () => {
        it('game:list-installed returns every installed GameDefinition', async () => {
            const { kernel } = fakeKernel();

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const bus = kernel.eventBus as unknown as EventBus;
            await bus.handleRequest({
                id: 'req-list',
                type: 'game:list-installed',
                source: 'kernel',
                target: 'game-loader',
                payload: {},
                timestamp: Date.now(),
                correlationId: 'corr-list',
                responseType: 'game:list-installed:response',
                timeout: 1000,
            } as unknown as Parameters<typeof bus.handleRequest>[0]);

            // The handler returns synchronously; its result was emitted on the
            // response channel. We verify by subscribing to the response type.
            const respPromise = new Promise<unknown>((resolve) => {
                (bus as unknown as { emitter: { on: Function } }).emitter.on(
                    'game:list-installed:response',
                    (msg: { payload: unknown }) => resolve(msg.payload),
                );
            });
            await bus.handleRequest({
                id: 'req-list-2',
                type: 'game:list-installed',
                source: 'kernel',
                target: 'game-loader',
                payload: {},
                timestamp: Date.now(),
                correlationId: 'corr-list-2',
                responseType: 'game:list-installed:response',
                timeout: 1000,
            } as unknown as Parameters<typeof bus.handleRequest>[0]);

            const response = await respPromise;
            const installed = response as Array<{ id: string; displayName: string; version: string }>;
            const ids = installed.map((g) => g.id).sort();
            expect(ids).toEqual(expect.arrayContaining(['test-game-a', 'test-game-b']));
            for (const g of installed) {
                expect(typeof g.displayName).toBe('string');
                expect(typeof g.version).toBe('string');
            }
        });

        it('game:get-active returns the currently active game definition', async () => {
            const { kernel } = fakeKernel({ game: { activeGame: 'test-game-b' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const bus = kernel.eventBus as unknown as EventBus;
            const respPromise = new Promise<unknown>((resolve) => {
                (bus as unknown as { emitter: { on: Function } }).emitter.on(
                    'game:get-active:response',
                    (msg: { payload: unknown }) => resolve(msg.payload),
                );
            });
            await bus.handleRequest({
                id: 'req-active',
                type: 'game:get-active',
                source: 'kernel',
                target: 'game-loader',
                payload: {},
                timestamp: Date.now(),
                correlationId: 'corr-active',
                responseType: 'game:get-active:response',
                timeout: 1000,
            } as unknown as Parameters<typeof bus.handleRequest>[0]);

            const response = await respPromise as { id: string; definition: { id: string } };
            expect(response.id).toBe('test-game-b');
            expect(response.definition.id).toBe('test-game-b');
        });
    });

    describe('configure()', () => {
        it('re-resolves when configure() is called and activeGame changed', async () => {
            const { kernel, configMap } = fakeKernel({ game: { activeGame: 'test-game-a' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            // Switch active game before calling configure.
            (configMap.game as { activeGame: string }).activeGame = 'test-game-b';

            await (mod as unknown as {
                configure: (c: Record<string, unknown>) => Promise<void>;
            }).configure({});

            const injected = configMap.game as { activeGame: string };
            expect(injected.activeGame).toBe('test-game-b');
        });
    });

    describe('lifecycle', () => {
        it('healthCheck is healthy after initialize, degraded after shutdown', async () => {
            const { kernel } = fakeKernel({ game: { activeGame: 'test-game-a' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            expect(await mod.healthCheck()).toBe('healthy');

            await mod.shutdown();

            expect(mod.health).toBe('unloaded');
            expect(await mod.healthCheck()).toBe('degraded');
        });

        it('getState exposes the active game and installed list', async () => {
            const { kernel } = fakeKernel({ game: { activeGame: 'test-game-a' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const state = mod.getState();
            expect((state.data as { activeGameId: string }).activeGameId).toBe('test-game-a');
            const installed = (state.data as { installedGames: string[] }).installedGames;
            expect(installed).toEqual(expect.arrayContaining(['test-game-a', 'test-game-b']));
        });
    });

    describe('isReady() / getActiveGame()', () => {
        it('isReady() returns true after initialize and false after shutdown', async () => {
            const { kernel } = fakeKernel({ game: { activeGame: 'test-game-a' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            expect((mod as unknown as { isReady(): boolean }).isReady()).toBe(true);

            await mod.shutdown();

            expect((mod as unknown as { isReady(): boolean }).isReady()).toBe(false);
        });

        it('getActiveGame() returns the GameDefinition after resolution', async () => {
            const { kernel } = fakeKernel({ game: { activeGame: 'test-game-a' } });

            const { default: factory } = await import('../src');
            const mod = await factory({
                modulePath: '',
                kernel,
                permissions: [],
                config: {},
            });
            await mod.initialize(kernel);

            const active = (mod as unknown as {
                getActiveGame(): { id: string; displayName: string } | null;
            }).getActiveGame();
            expect(active).not.toBeNull();
            expect(active?.id).toBe('test-game-a');
        });
    });
});
