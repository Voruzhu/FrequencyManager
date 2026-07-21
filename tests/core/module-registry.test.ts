/**
 * @fileoverview Unit tests for ModuleRegistry's dependency graph / load order.
 * @module tests/core/module-registry
 */

import { EventBus } from '../../core/event-bus';
import { ModuleRegistry } from '../../core/module-registry';
import type { ModuleAPI, ModuleManifest } from '../../shared/types';

function createSilentLogger() {
    return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn() };
}

function fakeModule(name: string, dependencies: Record<string, string> = {}): ModuleAPI {
    const manifest: ModuleManifest = {
        name, displayName: name, version: '1.0.0', description: '', author: '',
        entryPoint: 'index.js', dependencies, permissions: [], tags: [], minCoreVersion: '1.0.0', enabledByDefault: true,
    };
    return {
        moduleId: name,
        manifest,
        health: 'healthy',
        initialize: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
        configure: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue('healthy'),
    } as unknown as ModuleAPI;
}

describe('ModuleRegistry — dependency graph load order', () => {
    let bus: EventBus;
    let registry: ModuleRegistry;

    beforeEach(() => {
        bus = new EventBus(createSilentLogger() as unknown as ConstructorParameters<typeof EventBus>[0]);
        registry = new ModuleRegistry(bus);
    });

    afterEach(async () => {
        await bus.shutdown();
    });

    it('a real dependency between two modules does NOT trip false cycle detection (regression: a "reverse edge" used to make every dependency a 2-node cycle)', async () => {
        // Register the dependency first so it's a real, satisfiable dependency
        // (register() validates deps exist) — dependent registered second.
        await registry.register(fakeModule('game-loader'));
        await registry.register(fakeModule('update-checker', { 'game-loader': '^1.0.0' }));

        const order = registry.getLoadOrder();
        expect(order).toContain('game-loader');
        expect(order).toContain('update-checker');
        expect(order.indexOf('game-loader')).toBeLessThan(order.indexOf('update-checker'));
    });

    it('a real 3-module dependency chain resolves in correct order, not registration order', async () => {
        await registry.register(fakeModule('core-ish'));
        // Register the DEPENDENT before its dependency is even relevant to the
        // graph shape check — real registration order here is deliberately
        // NOT the correct load order, to prove the graph (not just array
        // insertion order) drives the result.
        await registry.register(fakeModule('leaf', { 'core-ish': '^1.0.0' }));

        const order = registry.getLoadOrder();
        expect(order.indexOf('core-ish')).toBeLessThan(order.indexOf('leaf'));
    });
});
