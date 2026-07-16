/**
 * @fileoverview Damage Calculator Module Manifest
 * @module modules/damage-calculator/manifest
 */

import { ModuleManifest } from '@shared/types';

export const manifest: ModuleManifest = {
    name: 'damage-calculator',
    displayName: 'Damage Calculator',
    version: '1.0.0',
    description: 'Calculates optimal damage combos and DPS for Wuthering Waves characters based on echo stats, team composition, and enemy resistances',
    author: 'FrequencyManager Team',
    entryPoint: './src/index.ts',
    dependencies: {
        'core': '^1.0.0',
        'ocr-scanner': '^1.0.0'
    },
    permissions: [
        'calculation:damage',
        'data:echoes:read',
        'data:characters:read',
        'data:characters:write'
    ],
    configSchema: {
        type: 'object',
        properties: {
            defaultEnemyLevel: { type: 'number', default: 90, description: 'Default enemy level for calculations' },
            defaultEnemyResistance: { type: 'number', default: 10, description: 'Default enemy resistance %' },
            includeResonanceBonus: { type: 'boolean', default: true, description: 'Include resonance chain bonuses' },
            includeConcertoEffects: { type: 'boolean', default: true, description: 'Include concerto energy effects' },
            precision: { type: 'number', default: 2, description: 'Decimal precision for results' }
        }
    },
    tags: ['calculation', 'damage', 'dps', 'optimizer', 'combat'],
    minCoreVersion: '1.0.0',
    enabledByDefault: true,
    icon: 'calculator'
};