/**
 * @fileoverview Game Loader module manifest
 * @module modules/game-loader/manifest
 */

import type { ModuleManifest } from '@shared/types';

export const manifest: ModuleManifest = {
    name: 'game-loader',
    displayName: 'Game Loader',
    version: '1.0.0',
    description: 'Resolves the active GameDefinition and injects it into other modules.',
    author: 'FrequencyManager Team',
    entryPoint: './src/index.ts',
    dependencies: {
        'core': '^1.0.0'
    },
    permissions: [
        'data:echoes:read',
        'data:characters:read',
    ],
    configSchema: {
        type: 'object',
        properties: {
            activeGame: {
                type: 'string',
                description: 'Game id to load (e.g. wuthering-waves).',
                default: 'wuthering-waves',
            },
            fallbackGame: {
                type: 'string',
                description: 'Game id used when activeGame is missing or invalid.',
                default: 'wuthering-waves',
            },
        },
    },
    tags: ['game', 'loader', 'adapter', 'core'],
    minCoreVersion: '1.0.0',
    enabledByDefault: true,
    icon: 'game',
};