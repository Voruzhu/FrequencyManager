/**
 * @fileoverview Unit tests for the ModuleSandbox core module.
 * @module tests/core/module-sandbox
 *
 * These tests cover the public surface of `core/module-sandbox.ts`:
 *   - createSandbox returns an instance with execute(), destroy()
 *   - execute() runs user functions and returns their result
 *   - execute() throws when the sandbox has been destroyed
 *   - destroy() is idempotent
 *   - validatePermissions() returns { valid, denied } for a given request
 *   - PermissionSets exposes preset permission bundles
 */

import {
    createSandbox,
    validatePermissions,
    PermissionSets,
    ModuleSandbox,
} from '../../core/module-sandbox';
import type { ModulePermission } from '../../shared/types';
import type { KernelInterface, LoggerInterface } from '../../shared/types';

/**
 * A minimal kernel stand-in. The sandbox calls `kernel.logger.debug(...)`
 * from `destroy()`, so we provide a no-op logger to keep that quiet.
 */
const silentLogger: LoggerInterface = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
    child: () => silentLogger,
};

const stubKernel = { logger: silentLogger } as unknown as KernelInterface;

describe('ModuleSandbox', () => {
    describe('createSandbox', () => {
        it('returns a ModuleSandbox instance', () => {
            const sandbox = createSandbox('test-module', [], stubKernel);
            expect(sandbox).toBeInstanceOf(ModuleSandbox);
            sandbox.destroy();
        });
    });

    describe('execute', () => {
        it('resolves with the value returned by the wrapped function', async () => {
            const sandbox = createSandbox('test-module', [], stubKernel);

            const result = await sandbox.execute(async () => 42);

            expect(result).toBe(42);
            sandbox.destroy();
        });

        it('propagates synchronous errors thrown by the wrapped function', async () => {
            const sandbox = createSandbox('test-module', [], stubKernel);

            await expect(
                sandbox.execute(() => {
                    throw new Error('boom');
                }),
            ).rejects.toThrow('boom');

            sandbox.destroy();
        });

        it('propagates errors from a rejected promise', async () => {
            const sandbox = createSandbox('test-module', [], stubKernel);

            await expect(
                sandbox.execute(async () => {
                    throw new Error('async-boom');
                }),
            ).rejects.toThrow('async-boom');

            sandbox.destroy();
        });
    });

    describe('destroy', () => {
        it('causes subsequent execute() calls to throw', async () => {
            const sandbox = createSandbox('test-module', [], stubKernel);
            sandbox.destroy();

            await expect(sandbox.execute(() => 1)).rejects.toThrow();
        });

        it('is idempotent — calling destroy twice does not throw', () => {
            const sandbox = createSandbox('test-module', [], stubKernel);
            sandbox.destroy();
            expect(() => sandbox.destroy()).not.toThrow();
        });
    });
});

describe('validatePermissions', () => {
    it('returns valid=true when all requested permissions are in the allowed set', () => {
        const result = validatePermissions(
            ['ui:render' as ModulePermission],
            ['ui:render' as ModulePermission, 'ui:overlay' as ModulePermission],
        );
        expect(result.valid).toBe(true);
        expect(result.denied).toEqual([]);
    });

    it('returns valid=false and lists denied permissions when not allowed', () => {
        const result = validatePermissions(
            ['fs:write' as ModulePermission, 'fs:read' as ModulePermission],
            ['fs:read' as ModulePermission],
        );
        expect(result.valid).toBe(false);
        expect(result.denied).toEqual(['fs:write']);
    });
});

describe('PermissionSets', () => {
    it('exposes a fixed set of named presets', () => {
        expect(PermissionSets).toHaveProperty('ui');
        expect(PermissionSets).toHaveProperty('data');
        expect(PermissionSets).toHaveProperty('calculation');
        expect(PermissionSets).toHaveProperty('ocr');
        expect(PermissionSets).toHaveProperty('network');
        expect(PermissionSets).toHaveProperty('full');
    });

    it('each preset is a non-empty array of permissions', () => {
        for (const [, perms] of Object.entries(PermissionSets)) {
            expect(Array.isArray(perms)).toBe(true);
            expect(perms.length).toBeGreaterThan(0);
            for (const p of perms) {
                expect(typeof p).toBe('string');
                expect((p as string).length).toBeGreaterThan(0);
            }
        }
    });

    it('the "full" preset is a superset of the others', () => {
        const full = new Set<string>(PermissionSets.full);
        for (const [name, perms] of Object.entries(PermissionSets)) {
            if (name === 'full') continue;
            for (const p of perms) {
                expect(full.has(p as string)).toBe(true);
            }
        }
    });
});