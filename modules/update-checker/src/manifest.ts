/**
 * @fileoverview Update Checker module manifest (typed)
 * @module modules/update-checker/manifest
 */

import type { ModuleManifest } from '@shared/types';

export const manifest: ModuleManifest = {
    name: 'update-checker',
    displayName: 'Update Checker',
    version: '1.0.0',
    description: 'Checks for updates to game-definition modules on app launch and on a periodic interval. Notifies via the EventBus; does NOT auto-install (the renderer prompts the user).',
    author: 'FrequencyManager Team',
    entryPoint: './src/index.ts',
    dependencies: {
        core: '^1.0.0',
        'game-loader': '^1.0.0',
    },
    permissions: ['fs:read', 'network:request'],
    configSchema: {
        type: 'object',
        properties: {
            gameDefinitionsManifestUrl: {
                type: 'string',
                description: 'URL of the JSON manifest listing all available game-definition updates.',
            },
            gameModuleCheckOnBoot: {
                type: 'boolean',
                description: 'Run a check on kernel boot.',
                default: true,
            },
            checkIntervalHours: {
                type: 'number',
                description: 'How often to re-check, in hours. 0 disables background checks.',
                default: 24,
            },
            requestTimeoutMs: {
                type: 'number',
                description: 'HTTP request timeout in milliseconds.',
                default: 10000,
            },
            allowPrerelease: {
                type: 'boolean',
                description: 'Accept pre-release versions (containing a dash).',
                default: false,
            },
        },
    },
    tags: ['update', 'network', 'game-definitions', 'maintenance'],
    minCoreVersion: '1.0.0',
    enabledByDefault: true,
    icon: 'refresh-cw',
};