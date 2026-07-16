/**
 * @fileoverview JSON Importer module manifest
 * @module modules/json-importer/manifest
 */

import type { ModuleManifest } from '@shared/types';

export const manifest: ModuleManifest = {
    name: 'json-importer',
    displayName: 'JSON Import / Export',
    version: '1.0.0',
    description: 'Generic JSON import/export for game data. Works with any game via the active GameDefinition.',
    author: 'FrequencyManager Team',
    entryPoint: './src/index.ts',
    dependencies: {
        'core': '^1.0.0',
        'game-loader': '^1.0.0',
    },
    permissions: [
        'fs:read',
        'fs:write',
    ],
    configSchema: {
        type: 'object',
        properties: {
            exportPath: {
                type: 'string',
                description: 'Default export path / filename template.',
                default: 'frequency-manager-export.json',
            },
            prettyPrint: {
                type: 'boolean',
                description: 'Pretty-print exported JSON (human readable).',
                default: true,
            },
            schemaVersion: {
                type: 'string',
                description: 'Schema version embedded in every export.',
                default: '1.0',
            },
        },
    },
    tags: ['data', 'import', 'export', 'json', 'portable'],
    minCoreVersion: '1.0.0',
    enabledByDefault: true,
    icon: 'data',
};