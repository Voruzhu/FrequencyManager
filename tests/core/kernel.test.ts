/**
 * @fileoverview Unit tests for the Kernel core module.
 * @module tests/core/kernel
 *
 * These tests cover the public surface of `core/kernel.ts`:
 *   - createKernel boots successfully with minimal config
 *   - getState reflects lifecycle transitions
 *   - healthCheck returns a snapshot
 *   - shutdown cleans up subsystems
 *
 * The kernel is intentionally exercised end-to-end (rather than mocking
 * internals) because its value is the integration of all subsystems.
 */

import { createKernel, Kernel } from '../../core/kernel';

describe('Kernel', () => {
    let kernel: Kernel;

    afterEach(async () => {
        if (kernel && kernel.getState().status !== 'stopped') {
            await kernel.shutdown();
        }
    });

    it('createKernel boots a kernel and returns it in the running state', async () => {
        kernel = await createKernel({
            modulePaths: [],
            hotReload: false,
            moduleTimeout: 5000,
            logLevel: 'error',
            featureFlags: {},
        });

        const status = kernel.getState();
        expect(status.status).toBe('running');
        expect(typeof status.startTime).toBe('number');
    });

    it('healthCheck returns an object with status and modules summary', async () => {
        kernel = await createKernel({
            modulePaths: [],
            hotReload: false,
            moduleTimeout: 5000,
            logLevel: 'error',
            featureFlags: {},
        });

        const health = await kernel.healthCheck();
        expect(health).toHaveProperty('status');
        expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
        // Health payload exposes per-component checks under `checks`, including a `modules` entry.
        expect(health).toHaveProperty('checks');
        expect((health as { checks?: Record<string, unknown> }).checks).toHaveProperty('modules');
    });

    it('exposes eventBus, moduleRegistry, and featureFlags on the kernel', async () => {
        kernel = await createKernel({
            modulePaths: [],
            hotReload: false,
            moduleTimeout: 5000,
            logLevel: 'error',
            featureFlags: {},
        });

        expect(kernel.eventBus).toBeDefined();
        expect(kernel.moduleRegistry).toBeDefined();
        expect(kernel.featureFlags).toBeDefined();
        expect(typeof kernel.featureFlags.isEnabled).toBe('function');
    });

    it('shutdown transitions the kernel to stopped state', async () => {
        kernel = await createKernel({
            modulePaths: [],
            hotReload: false,
            moduleTimeout: 5000,
            logLevel: 'error',
            featureFlags: {},
        });

        await kernel.shutdown();

        const status = kernel.getState();
        expect(status.status).toBe('stopped');
    });
});